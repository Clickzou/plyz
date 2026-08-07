-- ============================================================================
--  Abonnements fan → personnalité
-- ============================================================================
--  À exécuter dans Supabase → SQL Editor.
--
--  Pourquoi cette table : jusqu'ici, « suivre » une personnalité n'existait QUE
--  sur le téléphone du fan (AsyncStorage). Personne d'autre ne le savait — ni
--  le serveur, ni la personnalité suivie. Trois conséquences :
--
--    · aucune notification possible quand une personnalité publie, faute de
--      savoir à qui l'envoyer ;
--    · un fan qui changeait de téléphone perdait tous ses abonnements ;
--    · une personnalité ne pouvait pas savoir combien de fans la suivent.
--
--  Le stockage local reste en place comme cache d'affichage : la base est
--  désormais la référence.
-- ============================================================================

create table if not exists public.abonnements (
  id            uuid primary key default gen_random_uuid(),
  fan_id        uuid not null references auth.users(id) on delete cascade,
  celebrity_id  uuid not null references auth.users(id) on delete cascade,
  created_at    timestamptz not null default now(),

  -- Suivre deux fois la même personnalité n'a pas de sens, et compterait double
  -- dans le nombre d'abonnés comme dans les notifications envoyées.
  unique (fan_id, celebrity_id)
);

-- Les deux sens de lecture sont utilisés : « qui je suis » (écran du fan) et
-- « qui me suit » (envoi des notifications, compteur de la personnalité).
create index if not exists idx_abonnements_fan on public.abonnements (fan_id);
create index if not exists idx_abonnements_celebrite on public.abonnements (celebrity_id);

alter table public.abonnements enable row level security;

-- Un fan gère SES abonnements, et rien d'autre. `auth.uid()` est enveloppé dans
-- un select : sans cela la fonction est réévaluée à chaque ligne, ce qui se
-- paie cher dès que la table grossit.
drop policy if exists "fan lit ses abonnements" on public.abonnements;
create policy "fan lit ses abonnements"
  on public.abonnements for select
  using (fan_id = (select auth.uid()));

drop policy if exists "fan s abonne" on public.abonnements;
create policy "fan s abonne"
  on public.abonnements for insert
  with check (fan_id = (select auth.uid()));

drop policy if exists "fan se desabonne" on public.abonnements;
create policy "fan se desabonne"
  on public.abonnements for delete
  using (fan_id = (select auth.uid()));

-- La personnalité voit QUI la suit : c'est son audience, elle a le droit de la
-- connaître. Le fan, lui, ne voit jamais les abonnements des autres.
drop policy if exists "personnalite voit ses abonnes" on public.abonnements;
create policy "personnalite voit ses abonnes"
  on public.abonnements for select
  using (celebrity_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
--  Nombre d'abonnés, lisible par tous : il s'affiche sur la fiche publique.
--  Une fonction plutôt qu'un accès direct — compter n'oblige pas à donner la
--  liste nominative des fans à qui la demande.
-- ---------------------------------------------------------------------------
create or replace function public.nombre_abonnes(uid uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from public.abonnements where celebrity_id = uid;
$$;

grant execute on function public.nombre_abonnes(uuid) to anon, authenticated;
