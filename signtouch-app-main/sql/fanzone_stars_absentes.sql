-- ============================================================================
--  La communauté existe AVANT la star — questions et soutiens
-- ============================================================================
--
--  Jusqu'ici un espace de fans était rattaché à un COMPTE de personnalité.
--  Les milliers de fiches du catalogue n'en ont pas : ce sont des noms. Aucune
--  communauté ne pouvait donc se former autour de quelqu'un qui n'est pas
--  encore là — or c'est précisément ce qu'on veut, et c'est ce qui donne à
--  Plyz un argument qu'aucun mail de prospection n'aura jamais.
--
--  Ce que ce fichier ouvre :
--    · un espace peut être rattaché à un COMPTE ou à une FICHE réclamée ;
--    · réclamer une personnalité, c'est entrer dans sa communauté ;
--    · les fans posent des QUESTIONS, et se rallient à celles des autres.
--
--  Les questions ne sont pas une corvée à traiter une par une : ce sont la
--  matière du premier post de la personnalité, et la preuve qu'on lui apporte
--  quand on l'invite. « 340 fans vous attendent, voici les 10 questions qu'ils
--  vous posent le plus » se refuse moins bien qu'un argumentaire.
--
--  ⚠️ RAPPEL, à ne jamais perdre de vue en lisant ce fichier :
--    · l'appel vidéo est un TÊTE-À-TÊTE, un fan à la fois. Y ajouter des
--      spectateurs ferait tomber la vente sous les 30 % d'Apple (règle
--      3.1.3(d) person-to-person) ;
--    · l'événement de dédicace est EN PERSONNE, avec géofence — c'est ce qui
--      a levé le refus Apple 3.1.1 en juillet.
--  Il n'existe donc AUCUN live vidéo de groupe sur Plyz, et il ne doit pas en
--  exister. Une personnalité qui veut s'adresser à tous ses fans le fait par
--  une PUBLICATION, gratuite et sans risque.
--
--  ⚠️ PRÉREQUIS : `fanzone_groupes.sql` et `catalogue_stars.sql`.
--  À exécuter dans Supabase → SQL Editor.
-- ============================================================================

-- ---------------------------------------------------------------------------
--  1. Un espace peut appartenir à un compte OU à une fiche
-- ---------------------------------------------------------------------------

alter table public.fanzone_sujets
  alter column celebrity_id drop not null;

alter table public.fanzone_sujets
  add column if not exists star_id uuid references public.stars_reclamees(id) on delete cascade;

-- L'un ou l'autre, jamais les deux, jamais aucun : sans cette contrainte, un
-- sujet orphelin n'apparaîtrait dans aucun espace et deviendrait invisible
-- sans que personne ne s'en aperçoive.
alter table public.fanzone_sujets
  drop constraint if exists fz_sujet_un_seul_hote;
alter table public.fanzone_sujets
  add constraint fz_sujet_un_seul_hote
  check ((celebrity_id is not null) <> (star_id is not null));

-- Le type « question » : ce qu'un fan veut demander à la personnalité.
alter table public.fanzone_sujets
  drop constraint if exists fanzone_sujets_type_check;
alter table public.fanzone_sujets
  add constraint fanzone_sujets_type_check
  check (type in ('discussion', 'bon_plan', 'photo', 'question'));

create index if not exists idx_fz_sujets_star
  on public.fanzone_sujets (star_id, epingle desc, dernier_le desc)
  where supprime_le is null and star_id is not null;

-- ---------------------------------------------------------------------------
--  2. Les soutiens — « moi aussi je veux savoir »
-- ---------------------------------------------------------------------------
--  Sans eux, quarante fans posent quarante fois la même question et la
--  personnalité voit un mur illisible. Avec eux, une question monte, et l'on
--  peut dire : « voici les dix que vos fans vous posent le plus ».

create table if not exists public.fanzone_soutiens (
  sujet_id   uuid not null references public.fanzone_sujets(id) on delete cascade,
  fan_id     uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (sujet_id, fan_id)
);

create index if not exists idx_fz_soutiens_sujet on public.fanzone_soutiens (sujet_id);

alter table public.fanzone_soutiens enable row level security;

drop policy if exists fz_soutiens_lecture on public.fanzone_soutiens;
create policy fz_soutiens_lecture on public.fanzone_soutiens
  for select to authenticated using (true);

drop policy if exists fz_soutiens_ajout on public.fanzone_soutiens;
create policy fz_soutiens_ajout on public.fanzone_soutiens
  for insert to authenticated with check (fan_id = (select auth.uid()));

drop policy if exists fz_soutiens_retrait on public.fanzone_soutiens;
create policy fz_soutiens_retrait on public.fanzone_soutiens
  for delete to authenticated using (fan_id = (select auth.uid()));

alter table public.fanzone_sujets
  add column if not exists nb_soutiens integer not null default 0;

create or replace function public.fz_recompter_soutiens()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cible uuid := coalesce(NEW.sujet_id, OLD.sujet_id);
begin
  update public.fanzone_sujets
     set nb_soutiens = (select count(*) from public.fanzone_soutiens where sujet_id = cible)
   where id = cible;
  return null;
end $$;

drop trigger if exists trg_fz_recompter_soutiens on public.fanzone_soutiens;
create trigger trg_fz_recompter_soutiens
after insert or delete on public.fanzone_soutiens
for each row execute function public.fz_recompter_soutiens();

-- ---------------------------------------------------------------------------
--  3. La porte d'entrée d'une star absente : l'avoir réclamée
-- ---------------------------------------------------------------------------
--  On ne peut pas s'abonner à quelqu'un qui n'a pas de compte. Mais on peut
--  l'avoir réclamé — et c'est exactement le même geste : dire qu'on veut
--  cette personne ici. Les deux mécanismes se rejoignent au lieu de vivre
--  côte à côte.

create or replace function public.fz_a_acces_star(p_star uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.reclamations r
     where r.star_id = p_star and r.fan_id = auth.uid()
  );
$$;

revoke all on function public.fz_a_acces_star(uuid) from public;
grant execute on function public.fz_a_acces_star(uuid) to authenticated;

-- ---------------------------------------------------------------------------
--  4. Les règles d'accès, réécrites pour les deux sortes d'espaces
-- ---------------------------------------------------------------------------

drop policy if exists fz_sujets_lecture on public.fanzone_sujets;
create policy fz_sujets_lecture on public.fanzone_sujets
  for select to authenticated
  using (
    supprime_le is null
    and not public.blocage_entre(auteur_id, (select auth.uid()))
    and (
      (celebrity_id is not null and public.fz_a_acces(celebrity_id))
      or (star_id is not null and public.fz_a_acces_star(star_id))
    )
  );

drop policy if exists fz_sujets_creation on public.fanzone_sujets;
create policy fz_sujets_creation on public.fanzone_sujets
  for insert to authenticated
  with check (
    auteur_id = (select auth.uid())
    and (
      (celebrity_id is not null and public.fz_a_acces(celebrity_id))
      or (star_id is not null and public.fz_a_acces_star(star_id))
    )
  );

drop policy if exists fz_messages_lecture on public.fanzone_messages;
create policy fz_messages_lecture on public.fanzone_messages
  for select to authenticated
  using (
    supprime_le is null
    and not public.blocage_entre(auteur_id, (select auth.uid()))
    and exists (
      select 1 from public.fanzone_sujets s
       where s.id = sujet_id
         and s.supprime_le is null
         and (
           (s.celebrity_id is not null and public.fz_a_acces(s.celebrity_id))
           or (s.star_id is not null and public.fz_a_acces_star(s.star_id))
         )
    )
  );

drop policy if exists fz_messages_ecriture on public.fanzone_messages;
create policy fz_messages_ecriture on public.fanzone_messages
  for insert to authenticated
  with check (
    auteur_id = (select auth.uid())
    and exists (
      select 1 from public.fanzone_sujets s
       where s.id = sujet_id
         and s.supprime_le is null
         and s.ferme = false
         and (
           (s.celebrity_id is not null and public.fz_a_acces(s.celebrity_id))
           or (s.star_id is not null and public.fz_a_acces_star(s.star_id))
         )
    )
  );

-- ---------------------------------------------------------------------------
--  5. Les vues de lecture, avec les soutiens
-- ---------------------------------------------------------------------------

create or replace view public.fanzone_sujets_public
with (security_invoker = true) as
select s.id, s.celebrity_id, s.star_id, s.auteur_id, s.type, s.titre, s.contenu,
       s.media_url, s.epingle, s.ferme, s.nb_messages, s.nb_soutiens,
       s.dernier_le, s.created_at,
       coalesce(nullif(btrim(p.display_name), ''), 'Fan') as auteur_nom,
       p.avatar_url                                       as auteur_avatar,
       (s.celebrity_id is not null and s.auteur_id = s.celebrity_id) as par_la_star,
       exists (
         select 1 from public.fanzone_soutiens f
          where f.sujet_id = s.id and f.fan_id = auth.uid()
       )                                                  as soutenu
  from public.fanzone_sujets s
  left join public.profiles p on p.id = s.auteur_id
 where s.supprime_le is null;

grant select on public.fanzone_sujets_public to authenticated;

-- ---------------------------------------------------------------------------
--  6. Le dossier d'invitation
-- ---------------------------------------------------------------------------
--  Ce qu'on met dans le message envoyé à une personnalité. Pas un argumentaire
--  sur l'application : sa propre audience, et ce qu'elle lui demande. On ne
--  vend rien, on transmet.
--
--  ⚠️ Les questions sont RENDUES TELLES QUELLES : ce sont les mots des fans.
--  Les reformuler pour faire joli ferait mentir le document, et un agent qui
--  s'en aperçoit ne rappelle jamais.

create or replace function public.dossier_invitation(p_slug text)
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  select jsonb_build_object(
    'nom',        s.nom_affiche,
    'metier',     s.metier,
    'pays',       s.pays,
    'fans',       (select count(*) from public.reclamations r where r.star_id = s.id),
    -- Ce que les fans veulent, dans l'ordre : c'est ce qui dit à la
    -- personnalité par quoi commencer.
    'envies',     (select jsonb_object_agg(coalesce(envie, 'non_precise'), n)
                     from (select envie, count(*) as n
                             from public.reclamations
                            where star_id = s.id
                            group by envie) e),
    -- « Prêt à mettre », jamais « paiera » : ce n'est pas un engagement, et le
    -- présenter comme une promesse de vente tromperait l'agent comme le fan.
    'budget_median_cents', (select percentile_disc(0.5) within group (order by budget_cents)
                              from public.reclamations
                             where star_id = s.id and budget_cents is not null),
    'pays_touches', (select count(distinct pays) from public.reclamations
                      where star_id = s.id and pays is not null),
    'questions',  coalesce((
      select jsonb_agg(jsonb_build_object('question', q.titre, 'fans', q.nb_soutiens + 1)
                       order by q.nb_soutiens desc, q.created_at)
        from (select titre, nb_soutiens, created_at
                from public.fanzone_sujets
               where star_id = s.id and type = 'question' and supprime_le is null
               order by nb_soutiens desc, created_at
               limit 10) q
    ), '[]'::jsonb)
  )
  from public.stars_reclamees s
 where s.slug = p_slug;
$$;

revoke all on function public.dossier_invitation(text) from public;
grant execute on function public.dossier_invitation(text) to authenticated;

-- ============================================================================
--  Vérification
-- ============================================================================
--  1. Un sujet sans hôte doit être REFUSÉ :
--       insert into fanzone_sujets (auteur_id, titre) values (auth.uid(), 'test');
--  2. Sans avoir réclamé la star, sa communauté doit être invisible :
--       select * from fanzone_sujets_public where star_id = '<star>';
--  3. Après `insert into reclamations`, les sujets apparaissent.
--  4. Le dossier d'invitation :
--       select public.dossier_invitation('kylian-mbappe');
-- ============================================================================
