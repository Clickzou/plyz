-- ============================================================================
--  Catalogue de personnalités pré-créées
-- ============================================================================
--
--  Objectif : que quelqu'un qui cherche « contacter [nom] » sur Google tombe
--  sur Plyz, et qu'un fan qui ouvre l'app trouve sa star sans avoir à la
--  saisir. Acquisition gratuite et continue.
--
--  ⚠️ LE PIÈGE QUE CE FICHIER ÉVITE.
--
--  Le classement affiche « 847 fans la réclament ». Ce chiffre est TOUT ce
--  qu'on présente à un agent, et c'est lui qui fait revenir les fans. Verser
--  15 000 fiches à zéro réclamation dans la même liste le noierait : l'app
--  passerait d'une communauté à un annuaire vide.
--
--  D'où la séparation, tenue par ce fichier :
--    · le CATALOGUE (`pre_creee = true`) sert à être trouvé — recherche, Google ;
--    · le CLASSEMENT ne montre que ce qui est RÉELLEMENT réclamé.
--  Une fiche pré-créée rejoint le classement à sa première réclamation, et
--  redevient une simple entrée de catalogue si elle retombe à zéro.
--
--  À exécuter dans Supabase → SQL Editor.
-- ============================================================================

-- ---------------------------------------------------------------------------
--  1. Distinguer ce qu'on a versé de ce que les fans ont demandé
-- ---------------------------------------------------------------------------

alter table public.stars_reclamees
  add column if not exists pre_creee boolean not null default false;

-- D'où vient la fiche : `wikidata` pour le catalogue, null pour une fiche
-- ouverte par un fan. Sans cette trace, on ne saurait plus, dans six mois,
-- distinguer ce qu'on a versé de ce que la communauté a construit.
alter table public.stars_reclamees
  add column if not exists source_import text;

-- Métier et pays, tels que fournis par Wikidata. Ils servent à afficher
-- « footballeur français » sous le nom — deux homonymes ne se départagent pas
-- autrement — et à filtrer le catalogue par discipline.
alter table public.stars_reclamees
  add column if not exists metier text;
alter table public.stars_reclamees
  add column if not exists pays text;

-- La recherche par nom balaie désormais 15 000 lignes à chaque frappe. Sans
-- index de recherche textuelle, chaque lettre tapée coûterait un parcours
-- complet de la table.
create extension if not exists pg_trgm;
create index if not exists idx_stars_nom_trgm
  on public.stars_reclamees using gin (nom_affiche gin_trgm_ops);

-- ---------------------------------------------------------------------------
--  2. Le classement — réparé au passage
-- ---------------------------------------------------------------------------
--  L'ancien classement prenait 100 fiches SANS ORDRE, comptait leurs fans en
--  cent appels séparés, puis triait ce petit paquet. Avec quelques dizaines de
--  fiches, cela passait inaperçu. Avec 15 000, les stars réellement réclamées
--  n'auraient même plus figuré dans les cent tirées : le classement serait
--  devenu un tirage au sort.
--
--  Ici le tri se fait en base, sur le nombre réel de réclamations, et une
--  fiche sans aucune réclamation n'y entre pas.

create or replace function public.classement_stars(p_limite integer default 50)
returns table (
  slug text,
  nom text,
  fans bigint,
  metier text,
  pays text
)
language sql
stable
security definer
set search_path = public
as $$
  select s.slug,
         s.nom_affiche,
         count(r.id) as fans,
         s.metier,
         s.pays
    from public.stars_reclamees s
    join public.reclamations r on r.star_id = s.id
   where s.visible = true
     and s.arrivee_user_id is null
     and coalesce(s.retrait_demande, false) = false
   group by s.id, s.slug, s.nom_affiche, s.metier, s.pays
  having count(r.id) > 0
   order by count(r.id) desc, s.nom_affiche
   limit greatest(1, least(coalesce(p_limite, 50), 200));
$$;

revoke all on function public.classement_stars(integer) from public;
grant execute on function public.classement_stars(integer) to anon, authenticated;

-- ---------------------------------------------------------------------------
--  3. La recherche dans le catalogue
-- ---------------------------------------------------------------------------
--  Le catalogue doit être trouvable, mais il ne doit pas passer devant ce que
--  les fans réclament vraiment : à pertinence égale, une star déjà demandée
--  remonte au-dessus d'une fiche dormante.

create or replace function public.chercher_stars(p_q text, p_limite integer default 20)
returns table (
  slug text,
  nom text,
  fans bigint,
  metier text,
  pays text,
  pre_creee boolean,
  arrivee boolean,
  celebrity_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  select s.slug,
         s.nom_affiche,
         (select count(*) from public.reclamations r where r.star_id = s.id),
         s.metier,
         s.pays,
         s.pre_creee,
         s.arrivee_user_id is not null,
         s.arrivee_user_id
    from public.stars_reclamees s
   where s.visible = true
     and coalesce(s.retrait_demande, false) = false
     and s.nom_affiche ilike '%' || p_q || '%'
   order by (select count(*) from public.reclamations r where r.star_id = s.id) desc,
            -- À égalité, le nom le plus court gagne : qui tape « mbappe »
            -- cherche Kylian Mbappé, pas « Ethan Mbappé ».
            char_length(s.nom_affiche),
            s.nom_affiche
   limit greatest(1, least(coalesce(p_limite, 20), 50));
$$;

revoke all on function public.chercher_stars(text, integer) from public;
grant execute on function public.chercher_stars(text, integer) to anon, authenticated;

-- ============================================================================
--  Vérification
-- ============================================================================
--  1. Avant import, le classement doit être inchangé :
--       select * from public.classement_stars(50);
--  2. Après import, il ne doit contenir QUE des stars à fans > 0 :
--       select * from public.classement_stars(50) where fans = 0;  -- 0 ligne
--  3. Le catalogue doit être trouvable :
--       select * from public.chercher_stars('mbappe', 10);
--  4. Combien de fiches versées :
--       select count(*) from public.stars_reclamees where pre_creee;
-- ============================================================================
