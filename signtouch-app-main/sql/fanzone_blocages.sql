-- ============================================================================
--  Blocage entre utilisateurs — LOT 2 de la Fan zone
-- ============================================================================
--
--  Apple (règle 1.2) et Google exigent, pour tout espace où des utilisateurs
--  publient et se lisent entre eux, quatre choses :
--    1. un filtrage du contenu répréhensible   → déjà en place (Claude vision)
--    2. un moyen de signaler                   → déjà en place (content_reports)
--    3. UN BLOCAGE ENTRE UTILISATEURS          → c'est ce fichier
--    4. une réponse aux signalements sous 24 h → astreinte humaine
--
--  Le blocage n'existait jusqu'ici que dans un seul sens, célébrité → fan
--  (table `blocked_fans`, liée aux prestations payantes). Entre fans, rien.
--  Sans cette table, la Fan zone ferait refuser l'application.
--
--  ⚠️ À exécuter AVANT d'ouvrir le moindre espace d'écriture entre fans.
--
--  À exécuter dans Supabase → SQL Editor.
-- ============================================================================

create table if not exists public.blocages (
  id           uuid primary key default gen_random_uuid(),
  bloqueur_id  uuid not null references auth.users(id) on delete cascade,
  bloque_id    uuid not null references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now(),

  -- Bloquer deux fois la même personne n'a pas de sens ; se bloquer soi-même
  -- non plus, et cela se ferait remarquer en cachant ses propres messages.
  unique (bloqueur_id, bloque_id),
  constraint blocage_pas_soi_meme check (bloqueur_id <> bloque_id)
);

-- Les deux sens sont interrogés à chaque affichage d'un fil : « qui j'ai
-- bloqué » (masquer leurs messages) et « qui m'a bloqué » (masquer les miens
-- chez eux). Sans ces index, chaque ouverture d'un groupe balaierait la table.
create index if not exists idx_blocages_bloqueur on public.blocages (bloqueur_id);
create index if not exists idx_blocages_bloque   on public.blocages (bloque_id);

alter table public.blocages enable row level security;

-- Chacun gère SA liste, et ne voit que la sienne.
drop policy if exists "je lis mes blocages" on public.blocages;
create policy "je lis mes blocages"
  on public.blocages for select
  using (bloqueur_id = (select auth.uid()));

drop policy if exists "je bloque" on public.blocages;
create policy "je bloque"
  on public.blocages for insert
  with check (bloqueur_id = (select auth.uid()));

drop policy if exists "je debloque" on public.blocages;
create policy "je debloque"
  on public.blocages for delete
  using (bloqueur_id = (select auth.uid()));

-- ⚠️ Volontairement, AUCUNE policy ne permet de lire qui vous a bloqué.
-- Savoir « X m'a bloqué » est une information qui déclenche des représailles :
-- l'intéressé va chercher la personne ailleurs. Le blocage doit être discret
-- pour protéger celui qui bloque. Le filtrage réciproque se fait donc côté
-- serveur, avec la fonction ci-dessous.

/**
 * Vrai si l'un des deux a bloqué l'autre.
 *
 * `SECURITY DEFINER` : elle doit voir toute la table pour répondre, alors que
 * personne n'a le droit de la lire dans les deux sens. Elle ne renvoie qu'un
 * booléen — impossible d'en déduire QUI a bloqué qui, seulement qu'un mur
 * existe entre ces deux-là.
 */
create or replace function public.blocage_entre(a uuid, b uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.blocages
     where (bloqueur_id = a and bloque_id = b)
        or (bloqueur_id = b and bloque_id = a)
  );
$$;

revoke all on function public.blocage_entre(uuid, uuid) from public;
grant execute on function public.blocage_entre(uuid, uuid) to authenticated;

/**
 * Les personnes que j'ai bloquées, avec de quoi les afficher.
 *
 * Sans cette fonction, l'écran « Personnes bloquées » n'afficherait que des
 * identifiants : on ne saurait pas qui on débloque.
 */
create or replace function public.mes_blocages()
returns table (bloque_id uuid, nom text, avatar_url text, depuis timestamptz)
language sql
security definer
stable
set search_path = public
as $$
  select b.bloque_id,
         coalesce(nullif(btrim(p.display_name), ''), 'Utilisateur'),
         p.avatar_url,
         b.created_at
    from public.blocages b
    left join public.profiles p on p.id = b.bloque_id
   where b.bloqueur_id = auth.uid()
   order by b.created_at desc;
$$;

revoke all on function public.mes_blocages() from public;
grant execute on function public.mes_blocages() to authenticated;

-- ============================================================================
--  Vérification
-- ============================================================================
--   select public.blocage_entre('<moi>', '<autre>');   -- false au départ
--   insert into public.blocages (bloqueur_id, bloque_id) values (auth.uid(), '<autre>');
--   select public.blocage_entre('<moi>', '<autre>');   -- true dans les DEUX sens
--   select * from public.mes_blocages();
-- ============================================================================
