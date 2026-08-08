-- ============================================================================
--  Interpeller une personnalité — le robinet
-- ============================================================================
--
--  Ce que ce fichier protège : la personnalité elle-même.
--
--  Une fois qu'un fan peut écrire à sa star d'un seul geste, trois cent
--  quarante-deux fans peuvent lui écrire le même jour. Ce n'est plus une
--  invitation, c'est du harcèlement — et une personnalité agacée ne viendra
--  jamais sur Plyz. Le dispositif entier se retournerait contre son but.
--
--  ⚠️ CE QUE NOUS NE POUVONS PAS FAIRE, et qu'il ne faut jamais prétendre :
--  empêcher quelqu'un d'écrire sur Facebook de son côté. Nous ne contrôlons
--  que ce que PLYZ DÉCLENCHE. C'est déjà l'essentiel : sans le bouton, presque
--  personne ne le ferait spontanément.
--
--  Les trois règles, tenues ici et par le serveur :
--    · 3 interpellations par personnalité et par tranche de 24 h, TOUS RÉSEAUX
--      CONFONDUS. La quatrième est refusée, et on dit pourquoi.
--    · UNE SEULE interpellation par fan et par personnalité, jamais renouvelée.
--      Sans cela, les trois places du jour seraient prises chaque matin par les
--      mêmes, et la star recevrait le même fan toutes les semaines.
--    · Un TOUR DE RÔLE : les places vont d'abord à ceux qui n'ont jamais écrit,
--      et Plyz les prévient. La rareté devient un rendez-vous plutôt qu'une
--      avalanche.
--
--  C'est aussi ce qui a transformé les « vagues » : au palier de 250 fans, on
--  n'envoie plus 250 messages le même jour, mais 3 par jour pendant 83 jours.
--  Un filet régulier se remarque autant qu'un raz-de-marée, et ne fâche pas.
--
--  À exécuter dans Supabase → SQL Editor.
-- ============================================================================

create table if not exists public.interpellations (
  star_id   uuid not null references public.stars_reclamees(id) on delete cascade,
  fan_id    uuid not null references auth.users(id) on delete cascade,

  -- `invite` : c'est son tour, Plyz l'a prévenu — il n'a pas encore écrit.
  -- `envoye` : il a ouvert le réseau de la personnalité. Seul cet état
  --            consomme une des trois places du jour.
  etat      text not null default 'invite' check (etat in ('invite', 'envoye')),
  reseau    text,

  invite_le timestamptz not null default now(),
  envoye_le timestamptz,

  -- Une seule ligne par couple : c'est la clé qui garantit « une fois, jamais
  -- deux ». Une contrainte, pas un contrôle applicatif — un contrôle
  -- applicatif se contourne en rejouant la requête.
  primary key (star_id, fan_id)
);

-- Le comptage des 24 h dernières heures, fait à chaque appui sur le bouton.
create index if not exists idx_interpellations_quota
  on public.interpellations (star_id, envoye_le desc)
  where etat = 'envoye';

-- ---------------------------------------------------------------------------
--  Qui lit quoi
-- ---------------------------------------------------------------------------
--  Le fan voit ses propres tours (« c'est ton tour d'écrire à Omar Sy »).
--  L'écriture passe EXCLUSIVEMENT par le serveur : c'est lui qui compte, et un
--  compteur qu'on peut incrémenter soi-même ne compte rien.

alter table public.interpellations enable row level security;

drop policy if exists interpellations_lecture on public.interpellations;
create policy interpellations_lecture on public.interpellations
  for select to authenticated
  using (fan_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
--  Les places restantes, pour une personnalité
-- ---------------------------------------------------------------------------
--  Renvoyée à l'application avant d'ouvrir le choix du réseau : « il reste
--  3 places aujourd'hui » se comprend, un bouton qui échoue ne se comprend pas.

create or replace function public.interpellations_restantes(p_star uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  -- ⚠️ Le même 3 que `PLAFOND_INTERPELLATIONS` dans `server/index.js`.
  -- Changer l'un sans l'autre ferait mentir l'écran sur les places restantes.
  select greatest(0, 3 - (
    select count(*)
      from public.interpellations i
     where i.star_id = p_star
       and i.etat = 'envoye'
       and i.envoye_le > now() - interval '24 hours'
  ))::integer;
$$;

grant execute on function public.interpellations_restantes(uuid) to anon, authenticated;

-- ============================================================================
--  Vérification
-- ============================================================================
--  1. Les places d'une fiche neuve doivent valoir 3 :
--       select public.interpellations_restantes('<star_id>');
--  2. Après 3 lignes `envoye` de moins de 24 h, elles doivent valoir 0.
--  3. Un fan ne peut pas figurer deux fois pour la même star (clé primaire).
-- ============================================================================
