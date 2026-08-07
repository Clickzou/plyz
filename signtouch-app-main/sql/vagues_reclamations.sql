-- ============================================================================
--  Paliers, vagues coordonnées, et droit de retrait
-- ============================================================================
--  À exécuter dans Supabase → SQL Editor, APRÈS `reclamations.sql`.
--
--  POURQUOI DES VAGUES PLUTÔT QUE DES PARTAGES AU FIL DE L'EAU
--  Cinq cents partages étalés sur trois mois, personne ne les voit. Cinq cents
--  messages dans la même heure, la personnalité les voit, son agent les voit,
--  et les plateformes les font remonter. C'est le seul format qui transforme
--  des fans dispersés en argument de négociation.
--
--  ⚠️ LE DROIT DE RETRAIT N'EST PAS UNE OPTION
--  Organiser des vagues de messages vers une personne réelle bascule dans le
--  harcèlement dès l'instant où cette personne a dit non. Une personnalité qui
--  ne veut pas être sollicitée doit pouvoir le faire cesser — sans compte, sans
--  justificatif, et IMMÉDIATEMENT.
--
--  Le retrait s'applique donc AVANT toute vérification. Un retrait injustifié
--  coûte quelques réclamations ; un maintien injustifié peut coûter
--  l'application, et il fait du tort à quelqu'un.
-- ============================================================================

alter table public.stars_reclamees
  -- Dernier palier pour lequel une vague a déjà été lancée : sans cette
  -- mémoire, chaque nouvelle réclamation au-delà du seuil relancerait une
  -- vague — et les fans se désabonneraient en une semaine.
  add column if not exists palier_atteint integer not null default 0,
  -- Vague programmée mais pas encore partie.
  add column if not exists vague_prevue_le timestamptz,
  add column if not exists vague_palier integer,

  -- ⚠️ Retrait demandé par la personnalité (ou son représentant).
  add column if not exists retrait_demande boolean not null default false,
  add column if not exists retrait_le timestamptz,
  -- Qui a demandé, pour pouvoir revenir vers la personne et vérifier ensuite.
  add column if not exists retrait_contact text,
  add column if not exists retrait_motif text;

-- Les vagues à envoyer : une seule requête toutes les minutes doit suffire à
-- les trouver, sans parcourir toute la table.
create index if not exists idx_stars_vague_prevue
  on public.stars_reclamees (vague_prevue_le)
  where vague_prevue_le is not null;

-- Une personnalité retirée disparaît du classement public immédiatement.
-- On remplace la politique de lecture pour intégrer cette condition.
drop policy if exists "stars visibles lisibles par tous" on public.stars_reclamees;
create policy "stars visibles lisibles par tous"
  on public.stars_reclamees for select
  using (visible = true and retrait_demande = false);

-- ---------------------------------------------------------------------------
--  Journal des retraits : on doit pouvoir prouver QUAND une demande est
--  arrivée et ce qui a été fait. C'est ce qui distingue une plateforme qui
--  respecte les personnes d'une plateforme qui prétend le faire.
-- ---------------------------------------------------------------------------
create table if not exists public.retraits_reclamations (
  id           uuid primary key default gen_random_uuid(),
  star_id      uuid references public.stars_reclamees(id) on delete set null,
  nom_demande  text not null,
  contact      text,
  motif        text,
  -- Nombre de réclamations supprimées : la trace de ce qui a été effacé.
  reclamations_supprimees integer not null default 0,
  created_at   timestamptz not null default now()
);

alter table public.retraits_reclamations enable row level security;
-- Aucune politique de lecture : ce journal ne regarde que l'administration,
-- qui y accède avec la clé de service.
