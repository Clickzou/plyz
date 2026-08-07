-- ============================================================================
--  Bibliothèque musicale de Plyz — morceaux libres de droits
-- ============================================================================
--  À exécuter dans Supabase → SQL Editor.
--
--  Pourquoi une table plutôt qu'une liste dans le code : ajouter ou retirer un
--  morceau ne doit pas demander une nouvelle build de l'application. Un titre
--  dont la licence se révèle douteuse doit pouvoir disparaître le jour même.
--
--  ⚠️ LICENCES — le champ `attribution` n'est pas décoratif.
--  Un morceau CC0 ou du domaine public ne demande rien. Un morceau CC-BY
--  N'EST utilisable QUE si le nom de son auteur est affiché. Sans ce crédit,
--  Plyz est en infraction — et c'est le genre de manquement qui coûte un
--  retrait de l'app, pas seulement une lettre d'avocat.
-- ============================================================================

create table if not exists public.musiques_libres (
  id            uuid primary key default gen_random_uuid(),
  titre         text not null,
  artiste       text not null,
  -- 'cc0' | 'domaine_public' | 'cc_by' : ce qui décide de l'obligation de crédit.
  licence       text not null check (licence in ('cc0', 'domaine_public', 'cc_by')),
  -- Crédit à afficher tel quel sous la publication. OBLIGATOIRE en CC-BY.
  attribution   text,
  -- D'où vient le fichier : sert à retrouver la preuve de la licence le jour
  -- où quelqu'un la conteste.
  source_url    text,
  -- Adresse publique du fichier dans le bucket `musiques`.
  url_fichier   text not null,
  duree_sec     integer not null default 0,
  -- Regroupement à l'écran : 'calme', 'energique', 'inspirant', 'urbain'…
  ambiance      text,
  -- Retirer un morceau sans perdre les publications qui s'en servent déjà.
  actif         boolean not null default true,
  ordre         integer not null default 0,
  created_at    timestamptz not null default now(),

  -- Un CC-BY sans crédit est inutilisable : la base refuse de l'enregistrer
  -- plutôt que de laisser passer une infraction silencieuse.
  constraint attribution_obligatoire_en_cc_by
    check (licence <> 'cc_by' or (attribution is not null and length(trim(attribution)) > 0))
);

create index if not exists idx_musiques_actives
  on public.musiques_libres (actif, ordre)
  where actif = true;

-- ---------------------------------------------------------------------------
--  Accès : tout le monde LIT, personne n'écrit depuis l'application.
--  Le catalogue est éditorial — il se gère depuis l'administration, avec la
--  clé de service. Une personnalité ne doit pas pouvoir y glisser un morceau
--  dont Plyz porterait ensuite la responsabilité juridique.
-- ---------------------------------------------------------------------------
alter table public.musiques_libres enable row level security;

drop policy if exists "musiques lisibles par tous" on public.musiques_libres;
create policy "musiques lisibles par tous"
  on public.musiques_libres
  for select
  using (actif = true);

-- ---------------------------------------------------------------------------
--  Rattachement d'un morceau à une publication : c'est ce qui permet
--  d'afficher le crédit sous la vidéo, longtemps après sa mise en ligne.
-- ---------------------------------------------------------------------------
alter table public.posts
  add column if not exists musique_id uuid references public.musiques_libres(id);

-- ============================================================================
--  Bucket de stockage `musiques`
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('musiques', 'musiques', true)
on conflict (id) do nothing;

drop policy if exists "musiques en lecture publique" on storage.objects;
create policy "musiques en lecture publique"
  on storage.objects
  for select
  using (bucket_id = 'musiques');
