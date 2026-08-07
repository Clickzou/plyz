-- ============================================================================
--  Fan zone : le badge « a vraiment rencontré la star » — LOT 4
-- ============================================================================
--
--  Sur Instagram, n'importe qui peut écrire « j'ai eu ma dédicace hier ». Ici,
--  l'app SAIT qui a réellement été servi : la prestation est passée par elle,
--  elle a été payée, elle a été menée à son terme.
--
--  C'est le seul badge de ce genre que Plyz puisse délivrer, et il travaille
--  dans les deux sens : il rend le témoignage crédible, et il donne envie aux
--  autres d'y passer aussi. Un fan qui montre sa dédicace vend la suivante
--  mieux qu'une bannière.
--
--  ⚠️ PRÉREQUIS : `fanzone_groupes.sql`.
--  À exécuter dans Supabase → SQL Editor.
-- ============================================================================

/**
 * Les fans réellement servis par une personnalité.
 *
 * « Servi » veut dire trois choses à la fois : passage terminé (`completed`),
 * paiement encaissé (`payment_captured`), et séance appartenant bien à cette
 * personnalité.
 *
 * Deux familles de séances, donc deux branches. `session_queue.session_id`
 * désigne selon les cas un appel vidéo (`live_sessions`, qui porte le
 * `celebrity_id`) ou un événement de dédicace (`event_sessions`, où
 * l'organisateur s'appelle `created_by` — il n'y a ni `celebrity_id` ni
 * `live_session_id` sur cette table, contrairement à ce que laisse croire
 * l'interface TypeScript de l'app).
 *
 * `SECURITY DEFINER` : la file d'attente d'une séance n'est pas lisible par
 * les autres fans, et ne doit pas l'être — on n'expose ici qu'une liste
 * d'identifiants déjà visibles dans le fil du groupe.
 *
 * ⚠️ Tous les identifiants sont comparés en `text`. Les tables de séances sont
 * antérieures aux tables récentes et stockent leurs identifiants en `text`, là
 * où `abonnements` ou `fanzone_sujets` utilisent `uuid` — une comparaison
 * directe échoue alors sur « operator does not exist: text = uuid ». Le cast
 * empêche d'utiliser l'index, ce qui est sans effet ici : on parcourt la file
 * d'une poignée de séances, pas une table de millions de lignes.
 */
create or replace function public.fz_fans_verifies(p_celebrity uuid)
returns table (fan_id uuid)
language sql
security definer
stable
set search_path = public
as $$
  select distinct q.fan_id::uuid
    from public.session_queue q
    join public.live_sessions s on s.id::text = q.session_id::text
   where s.celebrity_id::text = p_celebrity::text
     and q.status = 'completed'
     and coalesce(q.payment_captured, false) = true
  union
  select distinct q.fan_id::uuid
    from public.session_queue q
    join public.event_sessions e on e.id::text = q.session_id::text
   where e.created_by::text = p_celebrity::text
     and q.status = 'completed'
     and coalesce(q.payment_captured, false) = true;
$$;

revoke all on function public.fz_fans_verifies(uuid) from public;
grant execute on function public.fz_fans_verifies(uuid) to authenticated;

-- ============================================================================
--  Vérification
-- ============================================================================
--   select * from public.fz_fans_verifies('<user_id de la star>');
--   -- doit contenir les fans dont la dédicace a été payée ET terminée,
--   -- et personne d'autre.
--
--  Les deux familles de séances sont couvertes. Pour voir laquelle alimente
--  réellement le badge aujourd'hui :
--
--   select 'appel vidéo' as origine, count(*) from session_queue q
--     join live_sessions s on s.id::text = q.session_id::text
--    where q.status = 'completed' and q.payment_captured
--   union all
--   select 'événement', count(*) from session_queue q
--     join event_sessions e on e.id::text = q.session_id::text
--    where q.status = 'completed' and q.payment_captured;
-- ============================================================================
