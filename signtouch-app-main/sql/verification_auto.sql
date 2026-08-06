-- VÉRIFICATION CÉLÉBRITÉ AUTOMATIQUE
--
-- Aujourd'hui une demande est enregistrée « en attente » et rien ne la traite :
-- l'examen est entièrement manuel. Cette table accueille désormais le résultat
-- d'un examen automatique en trois niveaux :
--
--   1. Identité vérifiée par Stripe + nom légal correspondant au nom public
--      reconnu notoire  ->  validation immédiate.
--   2. Nom de scène ou homonyme  ->  code à publier sur le compte officiel
--      (personne d'autre ne peut le faire).
--   3. Le reste  ->  file manuelle, avec le rapport déjà rédigé.
--
-- À exécuter dans Supabase → SQL Editor.

ALTER TABLE public.celebrity_verification_requests
  -- Résultat de l'examen automatique : approve | proof | review | reject
  ADD COLUMN IF NOT EXISTS ai_verdict text,
  -- Notoriété estimée, 0 à 100
  ADD COLUMN IF NOT EXISTS ai_score integer,
  -- Rapport complet : sources trouvées, raisonnement, ce qui coince
  ADD COLUMN IF NOT EXISTS ai_report jsonb,
  ADD COLUMN IF NOT EXISTS ai_checked_at timestamptz,
  -- Identité Stripe : nom légal relevé et concordance avec le nom public
  ADD COLUMN IF NOT EXISTS identity_name text,
  ADD COLUMN IF NOT EXISTS identity_verified boolean,
  ADD COLUMN IF NOT EXISTS identity_match boolean,
  -- Preuve de possession du compte officiel (niveau 2)
  ADD COLUMN IF NOT EXISTS proof_code text,
  ADD COLUMN IF NOT EXISTS proof_url text,
  ADD COLUMN IF NOT EXISTS proof_verified_at timestamptz,
  -- Vrai quand la validation n'est pas passée par un humain
  ADD COLUMN IF NOT EXISTS auto_approved boolean NOT NULL DEFAULT false;

-- La file d'attente se lit par verdict : « ce que l'IA n'a pas su trancher »
-- doit remonter en premier.
CREATE INDEX IF NOT EXISTS idx_celeb_verif_pending
  ON public.celebrity_verification_requests (status, ai_verdict, created_at);

-- Le code de preuve doit rester unique le temps de sa validité : deux demandes
-- avec le même code rendraient la preuve inexploitable.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_celeb_verif_proof_code
  ON public.celebrity_verification_requests (proof_code)
  WHERE proof_code IS NOT NULL AND proof_verified_at IS NULL;

-- APPROBATION — une seule porte d'entrée
--
-- `trg_protect_celeb_flags` annule EN SILENCE tout UPDATE direct de
-- `official_verified` (protection anti auto-vérification). Approuver demandait
-- donc de désactiver ce garde-fou à la main, à chaque fois, en espérant ne pas
-- oublier de le remettre. Cette fonction encapsule l'opération : le garde-fou
-- est rétabli quoi qu'il arrive, y compris si une étape échoue (la transaction
-- est annulée en bloc).
CREATE OR REPLACE FUNCTION public.approuver_demande_celebrite(
  p_request_id uuid,
  p_notes text DEFAULT NULL,
  p_auto boolean DEFAULT false
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  cible uuid;
begin
  select user_id into cible
    from public.celebrity_verification_requests
   where id = p_request_id and status = 'pending';

  if cible is null then
    return false;  -- demande inconnue, ou déjà tranchée
  end if;

  update public.celebrity_verification_requests
     set status = 'approved',
         reviewed_at = now(),
         auto_approved = coalesce(p_auto, false),
         admin_notes = coalesce(p_notes, admin_notes)
   where id = p_request_id;

  alter table public.celebrity_profiles disable trigger trg_protect_celeb_flags;
  update public.celebrity_profiles
     set official_verified = true, updated_at = now()
   where user_id = cible;
  alter table public.celebrity_profiles enable trigger trg_protect_celeb_flags;

  return true;
end $$;

-- Réservée au serveur : un utilisateur connecté ne doit pas pouvoir
-- s'auto-approuver en appelant la fonction.
REVOKE ALL ON FUNCTION public.approuver_demande_celebrite(uuid, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approuver_demande_celebrite(uuid, text, boolean) TO service_role;

-- Contrôle : les demandes en attente et ce que l'examen automatique en dit.
SELECT display_name, status, ai_verdict, ai_score, identity_match, proof_verified_at
  FROM public.celebrity_verification_requests
 ORDER BY created_at DESC
 LIMIT 20;
