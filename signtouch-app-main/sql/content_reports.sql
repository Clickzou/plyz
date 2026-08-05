-- Signalements de contenu : publication, profil de célébrité ou événement.
--
-- Pourquoi cette table : les règles Google Play sur le contenu généré par les
-- utilisateurs, comme le règlement européen DSA, exigent qu'un utilisateur puisse
-- signaler un contenu répréhensible DEPUIS l'application. Jusqu'ici Plyz n'avait
-- qu'un formulaire de support générique (`problem_reports`), qui ne vise aucun
-- contenu précis et ne répond donc pas à l'exigence.
--
-- À exécuter dans Supabase → SQL Editor.

CREATE TABLE IF NOT EXISTS public.content_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_user_id uuid,                  -- null si le signalement vient d'un visiteur non connecté
  reporter_email text,
  target_type text NOT NULL,              -- post | profile | event
  target_id text,                         -- identifiant de la publication ou de l'événement visé
  reported_user_id uuid,                  -- célébrité / auteur visé, quand il est connu
  target_label text,                      -- titre ou nom affiché : permet de lire un signalement sans requête annexe
  reason text NOT NULL,                   -- sexual | violence | harassment | scam | impersonation | illegal | other
  details text,                           -- précisions libres du signalant
  platform text,
  app_version text,
  status text NOT NULL DEFAULT 'pending', -- pending | reviewed | actioned | dismissed
  admin_notes text,
  created_at timestamptz DEFAULT now(),
  reviewed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_content_reports_status
  ON public.content_reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_reports_target
  ON public.content_reports (target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_content_reports_reported_user
  ON public.content_reports (reported_user_id);

ALTER TABLE public.content_reports ENABLE ROW LEVEL SECURITY;

-- Dépôt ouvert, y compris aux visiteurs non connectés : Plyz se parcourt sans
-- compte, exiger une inscription pour signaler viderait la mesure de son sens.
DROP POLICY IF EXISTS content_reports_insert_any ON public.content_reports;
CREATE POLICY content_reports_insert_any ON public.content_reports
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- Aucune policy de lecture : personne ne relit les signalements depuis l'app.
-- Un signalement contient le nom du signalant et une accusation — le laisser
-- lisible exposerait les fans aux représailles des célébrités visées.
-- La lecture passe uniquement par la fonction admin ci-dessous.

CREATE OR REPLACE FUNCTION public.admin_list_content_reports(p_status text DEFAULT NULL)
RETURNS SETOF public.content_reports
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.content_reports
  WHERE (auth.jwt() ->> 'email') = 'jc@clickzou.fr'
    AND (p_status IS NULL OR status = p_status)
  ORDER BY created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.admin_list_content_reports(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_content_reports(text) TO authenticated;
