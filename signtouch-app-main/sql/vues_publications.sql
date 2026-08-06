-- COMPTEUR DE VUES DES PUBLICATIONS
--
-- Pourquoi : rien ne mesurait l'audience d'une personnalité. Elle publiait dans
-- le vide, sans savoir combien de fans l'avaient vue — et nous ne pouvions donc
-- pas lui montrer ce qu'elle laisse sur la table en ne proposant aucun
-- événement. « 340 fans t'ont vue ce mois-ci, 0 événement proposé » vaut tous
-- les rappels du monde.
--
-- À exécuter dans Supabase → SQL Editor.

ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS view_count integer NOT NULL DEFAULT 0;

-- Vues récentes, pour distinguer « ce mois-ci » du total cumulé. On ne garde
-- PAS l'identité du spectateur : ce compteur sert à motiver une personnalité,
-- pas à pister des fans. Une ligne par publication et par jour suffit.
CREATE TABLE IF NOT EXISTS public.post_views_daily (
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  celebrity_id uuid NOT NULL,
  jour date NOT NULL DEFAULT CURRENT_DATE,
  vues integer NOT NULL DEFAULT 0,
  PRIMARY KEY (post_id, jour)
);

CREATE INDEX IF NOT EXISTS idx_post_views_celeb_jour
  ON public.post_views_daily (celebrity_id, jour DESC);

-- Incrémente les deux compteurs d'un coup. SECURITY DEFINER : le serveur
-- l'appelle avec sa clé de service, jamais le client directement.
CREATE OR REPLACE FUNCTION public.compter_vue_publication(p_post_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_celeb uuid;
begin
  select celebrity_id into v_celeb from public.posts where id = p_post_id;
  if v_celeb is null then return; end if;

  update public.posts set view_count = view_count + 1 where id = p_post_id;

  insert into public.post_views_daily (post_id, celebrity_id, jour, vues)
  values (p_post_id, v_celeb, CURRENT_DATE, 1)
  on conflict (post_id, jour) do update set vues = post_views_daily.vues + 1;
end $$;

-- Audience des 30 derniers jours d'une personnalité, et son nombre de
-- publications vidéo sur le mois en cours : les deux chiffres dont l'app a
-- besoin pour lui parler franchement.
CREATE OR REPLACE FUNCTION public.audience_personnalite(p_celeb uuid)
RETURNS TABLE (vues_30j bigint, publications_30j bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  select
    coalesce((
      select sum(v.vues) from public.post_views_daily v
       where v.celebrity_id = p_celeb and v.jour >= CURRENT_DATE - 30
    ), 0)::bigint,
    (
      select count(*) from public.posts p
       where p.celebrity_id = p_celeb and p.created_at >= now() - interval '30 days'
    )::bigint;
$$;

ALTER TABLE public.post_views_daily ENABLE ROW LEVEL SECURITY;

-- Lecture réservée à la personnalité concernée : son audience ne regarde
-- qu'elle. L'écriture passe exclusivement par la fonction ci-dessus.
DROP POLICY IF EXISTS post_views_read_owner ON public.post_views_daily;
CREATE POLICY post_views_read_owner ON public.post_views_daily
  FOR SELECT USING (auth.uid() = celebrity_id);
