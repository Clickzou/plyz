-- MODÉRATION DES SIGNALEMENTS DE CONTENU
--
-- Pourquoi : le signalement existait, mais rien ne permettait d'AGIR. Un
-- signalement légitime arrivait par e-mail et s'arrêtait là. Or les règles
-- Google Play sur le contenu généré par les utilisateurs — et le règlement
-- européen DSA — n'exigent pas seulement un moyen de signaler, mais aussi de
-- retirer le contenu et de sanctionner l'auteur, dans des délais.
--
-- Tout passe par des fonctions SECURITY DEFINER réservées à l'administrateur :
-- le dashboard web interroge Supabase directement, sans dépendre du serveur.
--
-- À exécuter dans Supabase → SQL Editor.

-- 0) Suppression préalable.
--    CREATE OR REPLACE ne sait pas modifier les colonnes renvoyées par une
--    fonction déjà en base : Postgres répond « cannot change return type of
--    existing function ». La version précédente de admin_list_content_reports
--    renvoyait moins de colonnes ; il faut donc la supprimer avant de recréer.
--    Aucune donnée n'est touchée — ce ne sont que des fonctions de lecture et
--    d'action, la table content_reports reste intacte.
DROP FUNCTION IF EXISTS public.admin_list_content_reports(text);
DROP FUNCTION IF EXISTS public.admin_list_content_reports();
DROP FUNCTION IF EXISTS public.admin_moderate_content(uuid, text);
DROP FUNCTION IF EXISTS public.admin_count_pending_reports();

-- 1) Liste enrichie : le signalement AVEC le contenu visé, pour juger sur pièce
--    sans avoir à chercher l'élément soi-même.
CREATE OR REPLACE FUNCTION public.admin_list_content_reports(p_status text DEFAULT NULL)
RETURNS TABLE (
  id uuid,
  created_at timestamptz,
  status text,
  reason text,
  details text,
  target_type text,
  target_id text,
  target_label text,
  reporter_email text,
  reported_user_id uuid,
  reported_name text,
  contenu_titre text,
  contenu_texte text,
  contenu_image text,
  contenu_existe boolean,
  event_code text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    r.id, r.created_at, r.status, r.reason, r.details,
    r.target_type, r.target_id, r.target_label,
    r.reporter_email, r.reported_user_id,
    cp.stage_name AS reported_name,
    COALESCE(p.title, es.title)            AS contenu_titre,
    COALESCE(p.body, cp2.bio)              AS contenu_texte,
    p.media_url                            AS contenu_image,
    (p.id IS NOT NULL OR es.id IS NOT NULL OR cp2.user_id IS NOT NULL) AS contenu_existe,
    es.join_code                           AS event_code
  FROM public.content_reports r
  LEFT JOIN public.celebrity_profiles cp  ON cp.user_id = r.reported_user_id
  LEFT JOIN public.posts p                ON r.target_type IN ('post','event')
                                          AND p.id::text = r.target_id
  LEFT JOIN public.event_sessions es      ON r.target_type = 'event'
                                          AND es.id::text = r.target_id
  LEFT JOIN public.celebrity_profiles cp2 ON r.target_type = 'profile'
                                          AND cp2.user_id::text = r.target_id
  WHERE (auth.jwt() ->> 'email') = 'jc@clickzou.fr'
    AND (p_status IS NULL OR r.status = p_status)
  ORDER BY
    CASE WHEN r.status = 'pending' THEN 0 ELSE 1 END,  -- à traiter d'abord
    r.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.admin_list_content_reports(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_content_reports(text) TO authenticated;

-- 2) Agir sur un signalement.
--    actions : delete_post | cancel_event | hide_profile | dismiss
CREATE OR REPLACE FUNCTION public.admin_moderate_content(p_report_id uuid, p_action text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  r public.content_reports;
  touche int := 0;
begin
  if (auth.jwt() ->> 'email') <> 'jc@clickzou.fr' then
    raise exception 'forbidden';
  end if;

  select * into r from public.content_reports where id = p_report_id;
  if not found then raise exception 'report_not_found'; end if;

  if p_action = 'delete_post' then
    -- La publication disparaît du fil et de la fiche. Si elle annonçait un
    -- événement, l'événement lui-même reste : le supprimer aussi rendrait
    -- irrécupérable une séance déjà payée par des fans.
    delete from public.posts where id::text = r.target_id;
    get diagnostics touche = row_count;

  elsif p_action = 'cancel_event' then
    -- On marque supprimé plutôt que d'effacer la ligne : les paiements et les
    -- factures y font référence, et une suppression réelle casserait la piste
    -- comptable. Le trigger d'annonce retire la publication associée.
    update public.event_sessions set status = 'deleted'
     where id::text = r.target_id and status <> 'deleted';
    get diagnostics touche = row_count;
    if touche = 0 then
      update public.live_sessions set status = 'deleted'
       where id::text = r.target_id and status <> 'deleted';
      get diagnostics touche = row_count;
    end if;

  elsif p_action = 'hide_profile' then
    -- Masquer, pas supprimer : le compte garde son historique de paiements et
    -- ses factures. Il disparaît du catalogue, des recherches et du fil.
    update public.celebrity_profiles set is_listed = false
     where user_id = coalesce(r.reported_user_id, r.target_id::uuid);
    get diagnostics touche = row_count;

  elsif p_action = 'dismiss' then
    touche := 1;  -- signalement jugé infondé, aucun contenu touché

  else
    raise exception 'unknown_action';
  end if;

  update public.content_reports
     set status = case when p_action = 'dismiss' then 'dismissed' else 'actioned' end,
         admin_notes = coalesce(admin_notes, '') || p_action || ' @ ' || now()::text || E'\n',
         reviewed_at = now()
   where id = p_report_id;

  return jsonb_build_object('ok', true, 'action', p_action, 'rows', touche);
end $$;

REVOKE ALL ON FUNCTION public.admin_moderate_content(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_moderate_content(uuid, text) TO authenticated;

-- 3) Compteur pour la pastille du dashboard : savoir qu'il y a quelque chose à
--    traiter sans avoir à ouvrir la section.
CREATE OR REPLACE FUNCTION public.admin_count_pending_reports()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::int FROM public.content_reports
   WHERE status = 'pending'
     AND (auth.jwt() ->> 'email') = 'jc@clickzou.fr';
$$;

REVOKE ALL ON FUNCTION public.admin_count_pending_reports() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_count_pending_reports() TO authenticated;
