-- ============================================================================
--  « Réclame ta star » — les fans font venir les personnalités
-- ============================================================================
--  À exécuter dans Supabase → SQL Editor.
--
--  Renverse le sens de la prospection. Aujourd'hui Plyz écrit à des agents qui
--  ne répondent pas. Demain on leur montre un chiffre : « 1 240 fans vous
--  réclament, 18 pays, 42 000 € de demande déjà exprimée ». Un agent ne lit pas
--  un mail de prospection ; il lit un chiffre d'affaires prévisible.
--
--  ⚠️ POURQUOI UN COMPTE EST EXIGÉ POUR RÉCLAMER
--  C'est ce qui donne sa valeur au dossier. Mille réclamations anonymes ne
--  valent rien — n'importe qui peut les fabriquer. Mille comptes vérifiés par
--  e-mail, que l'on peut prévenir le jour de l'inscription de la star, valent
--  une négociation.
--
--  ⚠️ POURQUOI LE CLASSEMENT PUBLIC EST FILTRÉ
--  On peut écrire n'importe quel nom dans un champ libre — y compris celui
--  d'une personne privée, d'un ex, d'un professeur. Afficher publiquement
--  « 3 personnes réclament Jean Dupont » serait au mieux une atteinte à la vie
--  privée, au pire une porte ouverte au harcèlement. Rien n'est public tant
--  qu'un administrateur ne l'a pas validé.
-- ============================================================================

-- ---------------------------------------------------------------------------
--  Les personnalités réclamées, regroupées par nom normalisé.
--  Une table plutôt qu'un simple regroupement à la volée : c'est ici que vit
--  la décision éditoriale (visible ou non, fusionnée avec un autre nom, déjà
--  arrivée sur Plyz).
-- ---------------------------------------------------------------------------
create table if not exists public.stars_reclamees (
  id             uuid primary key default gen_random_uuid(),
  -- Nom normalisé : minuscules, sans accents ni ponctuation. C'est lui qui
  -- regroupe « Zinédine Zidane », « zinedine zidane » et « Zinedine  Zidane ».
  slug           text not null unique,
  -- Le nom tel qu'on veut l'afficher, corrigé à la main si besoin.
  nom_affiche    text not null,
  -- Renseigné par le premier fan : sert à vérifier de qui l'on parle, et à
  -- retrouver l'agent. Deux homonymes se départagent là-dessus.
  reseau_url     text,
  -- ⚠️ Rien n'est public par défaut. Voir l'avertissement en tête de fichier.
  visible        boolean not null default false,
  -- Renseigné quand la personnalité rejoint enfin Plyz : c'est ce lien qui
  -- permet de prévenir tous ceux qui l'avaient réclamée.
  arrivee_user_id uuid references auth.users(id) on delete set null,
  arrivee_le      timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists idx_stars_reclamees_visibles
  on public.stars_reclamees (visible) where visible = true;

-- ---------------------------------------------------------------------------
--  Une réclamation = un fan qui attend une personnalité.
-- ---------------------------------------------------------------------------
create table if not exists public.reclamations (
  id           uuid primary key default gen_random_uuid(),
  star_id      uuid not null references public.stars_reclamees(id) on delete cascade,
  fan_id       uuid not null references auth.users(id) on delete cascade,

  -- Ce que le fan aimerait obtenir : 'appel', 'dedicace', 'evenement'.
  envie        text check (envie in ('appel', 'dedicace', 'evenement')),
  -- Ce qu'il se dit prêt à payer, en centimes. Ce n'est PAS un engagement, et
  -- le mot « prêt à » doit rester dans toute présentation du chiffre : le
  -- présenter comme une promesse de vente tromperait l'agent comme le fan.
  budget_cents integer check (budget_cents is null or budget_cents between 0 and 100000),
  -- Code pays (FR, BE…), pour montrer à l'agent l'étendue géographique.
  pays         text,
  created_at   timestamptz not null default now(),

  -- Un fan ne réclame qu'une fois la même personnalité : sinon le chiffre
  -- présenté à l'agent ne voudrait plus rien dire — et c'est TOUT ce qu'on
  -- vend ici.
  unique (star_id, fan_id)
);

create index if not exists idx_reclamations_star on public.reclamations (star_id);
create index if not exists idx_reclamations_fan  on public.reclamations (fan_id);

-- ---------------------------------------------------------------------------
--  Accès
-- ---------------------------------------------------------------------------
alter table public.stars_reclamees enable row level security;
alter table public.reclamations   enable row level security;

-- Le catalogue des personnalités réclamées n'est lisible que pour ce qui a été
-- validé. Le reste n'existe que pour l'administration, via la clé de service.
drop policy if exists "stars visibles lisibles par tous" on public.stars_reclamees;
create policy "stars visibles lisibles par tous"
  on public.stars_reclamees for select
  using (visible = true);

-- Un fan voit SES réclamations — pour savoir ce qu'il attend, et pouvoir se
-- rétracter. Jamais celles des autres : qui réclame qui ne regarde personne.
drop policy if exists "fan lit ses reclamations" on public.reclamations;
create policy "fan lit ses reclamations"
  on public.reclamations for select
  using (fan_id = (select auth.uid()));

drop policy if exists "fan retire sa reclamation" on public.reclamations;
create policy "fan retire sa reclamation"
  on public.reclamations for delete
  using (fan_id = (select auth.uid()));

-- L'écriture passe par le serveur, jamais directement : c'est lui qui
-- normalise le nom, rapproche les orthographes et applique les garde-fous.

-- ---------------------------------------------------------------------------
--  Le dossier d'audience : ce qu'on présente à un agent.
--  Une fonction plutôt qu'une requête recopiée dans le code — le jour où l'on
--  change la façon de compter, on la change à un seul endroit.
-- ---------------------------------------------------------------------------
create or replace function public.dossier_audience(star uuid)
returns table (
  fans           integer,
  pays_distincts integer,
  budget_moyen   integer,
  budget_total   integer,
  envie_dominante text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    count(*)::int,
    count(distinct pays)::int,
    coalesce(avg(budget_cents), 0)::int,
    coalesce(sum(budget_cents), 0)::int,
    (select envie from public.reclamations
      where star_id = star and envie is not null
      group by envie order by count(*) desc limit 1)
  from public.reclamations
  where star_id = star;
$$;

grant execute on function public.dossier_audience(uuid) to anon, authenticated;
