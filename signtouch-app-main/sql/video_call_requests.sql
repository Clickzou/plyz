-- DEMANDES D'APPEL VIDÉO PRIVÉ EN TÊTE-À-TÊTE, À L'INITIATIVE DU FAN
--
-- Parcours : le fan demande → la célébrité accepte en proposant un créneau →
-- le fan confirme en pré-payant → l'appel a lieu.
--
-- Conformité : le tête-à-tête temps réel est explicitement autorisé à encaisser
-- hors achat intégré (Apple 3.1.3(d) « Person-to-Person Services »). Attention,
-- la même règle impose l'achat intégré dès que plusieurs fans assistent EN MÊME
-- TEMPS à une prestation — ne jamais transformer ceci en séance à spectateurs.
--
-- Le tarif n'est PAS créé ici : il vit déjà dans `celebrity_pricing`
-- (video_call_price_cents, video_call_duration_minutes, currency), au niveau du
-- profil, donc bien distinct des prix fixés à la création d'un événement.
--
-- À exécuter dans Supabase → SQL Editor.

CREATE TABLE IF NOT EXISTS public.video_call_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fan_id uuid NOT NULL,
  celebrity_id uuid NOT NULL,
  fan_message text,                       -- mot du fan accompagnant sa demande

  -- pending   : demande envoyée, la célébrité n'a pas répondu
  -- accepted  : créneau proposé, le fan doit pré-payer
  -- paid      : pré-paiement autorisé, rendez-vous confirmé
  -- refused   : la célébrité a décliné
  -- expired   : 48 h écoulées sans réponse, ou sans pré-paiement après acceptation
  -- cancelled : annulé par le fan ou la célébrité (cf. cancelled_by)
  -- completed : l'appel a eu lieu
  status text NOT NULL DEFAULT 'pending',

  -- Créneau choisi par la célébrité. En timestamptz : stocké en UTC, affiché dans
  -- le fuseau de chacun. La célébrité et le fan ne sont pas forcément dans le même.
  scheduled_at timestamptz,

  -- Échéance de l'étape en cours (48 h). Sert à l'expiration automatique.
  expires_at timestamptz,

  -- Tarif figé au moment de l'acceptation : si la célébrité change son prix
  -- ensuite, le fan paie bien celui qui lui a été annoncé.
  price_cents integer,
  currency text DEFAULT 'eur',
  duration_minutes integer,

  checkout_session_id text,
  payment_intent_id text,

  cancelled_by text,                      -- 'fan' | 'celebrity'
  cancelled_at timestamptz,
  refunded boolean NOT NULL DEFAULT false,

  room_url text,                          -- salle Daily, créée à l'heure du rendez-vous
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vcr_celebrity ON public.video_call_requests (celebrity_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vcr_fan       ON public.video_call_requests (fan_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vcr_expiry    ON public.video_call_requests (status, expires_at);

ALTER TABLE public.video_call_requests ENABLE ROW LEVEL SECURITY;

-- Lecture : uniquement les deux parties concernées.
DROP POLICY IF EXISTS vcr_select_parties ON public.video_call_requests;
CREATE POLICY vcr_select_parties ON public.video_call_requests
  FOR SELECT TO authenticated
  USING (auth.uid() = fan_id OR auth.uid() = celebrity_id);

-- Création : un fan ne peut déposer une demande QU'EN SON PROPRE NOM.
DROP POLICY IF EXISTS vcr_insert_own ON public.video_call_requests;
CREATE POLICY vcr_insert_own ON public.video_call_requests
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = fan_id AND status = 'pending');

-- AUCUNE policy UPDATE : toute transition d'état passe par le serveur
-- (service_role). Sans ça, un fan pourrait passer sa demande en « paid » sans
-- avoir payé — c'est exactement le type de faille corrigé lors des audits.

-- Expiration automatique, appelée par le worker serveur.
CREATE OR REPLACE FUNCTION public.expire_video_call_requests()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare n integer;
begin
  update public.video_call_requests
     set status = 'expired', updated_at = now()
   where status in ('pending', 'accepted')
     and expires_at is not null
     and expires_at < now();
  get diagnostics n = row_count;
  return n;
end $$;

REVOKE ALL ON FUNCTION public.expire_video_call_requests() FROM PUBLIC;
