-- ============================================================================
--  Fan zone : espaces par personnalité, sujets et messages — LOT 3
-- ============================================================================
--
--  Trois principes, hérités de l'analyse du 7 août (MUR_DES_FANS.md) :
--
--   · UN ESPACE PAR PERSONNALITÉ, jamais un mur global. Une communauté se
--     fédère autour de quelqu'un, pas dans le vide — et un espace global
--     deviendrait un dépotoir impossible à modérer.
--   · RÉSERVÉ AUX ABONNÉS de cette personnalité. On entre en suivant, ce qui
--     donne au passage un signal utile à la star.
--   · AUCUN MESSAGE PRIVÉ, nulle part. Le public des fans de célébrités est
--     massivement adolescent, et c'est en privé que surviennent les drames.
--     Tout ce qui s'écrit ici est visible par le groupe — donc modérable.
--
--  ⚠️ PRÉREQUIS : exécuter `fanzone_blocages.sql` AVANT ce fichier. Les règles
--  de lecture ci-dessous appellent `public.blocage_entre`, et les stores
--  exigent le blocage avant toute ouverture d'un espace communautaire.
--
--  À exécuter dans Supabase → SQL Editor.
-- ============================================================================

-- ---------------------------------------------------------------------------
--  1. Les sujets — un fil de discussion dans l'espace d'une personnalité
-- ---------------------------------------------------------------------------

create table if not exists public.fanzone_sujets (
  id            uuid primary key default gen_random_uuid(),
  celebrity_id  uuid not null references auth.users(id) on delete cascade,
  auteur_id     uuid not null references auth.users(id) on delete cascade,

  -- `discussion` : une question, un débat.
  -- `bon_plan`   : une date de tournée, des places qui se libèrent.
  -- `photo`      : un souvenir, une rencontre.
  type          text not null default 'discussion'
                 check (type in ('discussion', 'bon_plan', 'photo')),

  titre         text not null check (char_length(titre) between 3 and 120),
  contenu       text check (char_length(contenu) <= 2000),
  media_url     text,

  -- Épinglé par la personnalité chez elle : c'est SA vitrine.
  epingle       boolean not null default false,
  -- Fermé : plus de réponses, mais le fil reste lisible. Effacer un sujet
  -- animé mécontente plus qu'il ne calme.
  ferme         boolean not null default false,
  supprime_le   timestamptz,

  nb_messages   integer not null default 0,
  dernier_le    timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

create index if not exists idx_fz_sujets_celeb
  on public.fanzone_sujets (celebrity_id, epingle desc, dernier_le desc)
  where supprime_le is null;
create index if not exists idx_fz_sujets_auteur on public.fanzone_sujets (auteur_id);

-- ---------------------------------------------------------------------------
--  2. Les messages d'un sujet
-- ---------------------------------------------------------------------------

create table if not exists public.fanzone_messages (
  id           uuid primary key default gen_random_uuid(),
  sujet_id     uuid not null references public.fanzone_sujets(id) on delete cascade,
  auteur_id    uuid not null references auth.users(id) on delete cascade,
  contenu      text not null check (char_length(contenu) between 1 and 2000),
  media_url    text,
  supprime_le  timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists idx_fz_messages_sujet
  on public.fanzone_messages (sujet_id, created_at)
  where supprime_le is null;
create index if not exists idx_fz_messages_auteur on public.fanzone_messages (auteur_id);

-- ---------------------------------------------------------------------------
--  3. Ni liens ni numéros de téléphone — même règle que les commentaires
-- ---------------------------------------------------------------------------
--  L'arnaque type se glisse exactement ici : un compte qui se fait passer pour
--  l'équipe de la star laisse un numéro WhatsApp « pour gagner une dédicace ».
--  Les personnalités gardent le droit de mettre un lien dans le descriptif de
--  leurs événements ; entre fans, non.

create or replace function public.coordonnees_dans(texte text)
returns text
language plpgsql
immutable
as $$
declare
  chiffres text;
begin
  if texte is null then return null; end if;

  if texte ~* '(https?|ftp)://' or texte ~* '\ywww\s*[.\[(]' then
    return 'lien';
  end if;
  if texte ~* '\y[a-z0-9][a-z0-9-]+\s*\.\s*(com|fr|net|org|io|co|me|tv|app|shop|xyz|info|biz|ru|de|es|it|uk|be|ch|ca|us|link|page|site|online|store|club|live|gg|ly|to|cc|top|vip|fun|bio)\y' then
    return 'lien';
  end if;
  if texte ~* '\y[a-z0-9-]{2,}\s*[\(\[]?\s*(point|dot|punto|punkt)\s*[\)\]]?\s*(com|fr|net|org|io|co|me|tv|app)\y'
     or texte ~* '[a-z0-9-]{2,}\s*[\(\[]\s*\.\s*[\)\]]\s*[a-z]{2,}' then
    return 'lien';
  end if;

  -- Une suite qui n'est RIEN D'AUTRE qu'une date est laissée tranquille :
  -- annoncer « le 07/08/2026 » sous un bon plan est exactement l'usage attendu.
  for chiffres in
    select (regexp_matches(texte, '(?:\+?[0-9][\s.\-/()]{0,2}){8,}', 'g'))[1]
  loop
    continue when chiffres ~ '^\s*[0-9]{1,2}\s*[./-]\s*[0-9]{1,2}\s*[./-]\s*[0-9]{2,4}\s*$';
    if length(regexp_replace(chiffres, '[^0-9]', '', 'g')) >= 8 then
      return 'telephone';
    end if;
  end loop;

  return null;
end $$;

create or replace function public.refuser_coordonnees_fanzone()
returns trigger
language plpgsql
as $$
declare
  trouve text;
begin
  trouve := public.coordonnees_dans(
    coalesce(NEW.contenu, '') || ' ' || coalesce(to_jsonb(NEW) ->> 'titre', '')
  );
  if trouve = 'lien' then
    raise exception 'Les liens ne sont pas autorisés dans la Fan zone.'
      using errcode = 'check_violation';
  elsif trouve = 'telephone' then
    raise exception 'Les numéros de téléphone ne sont pas autorisés dans la Fan zone.'
      using errcode = 'check_violation';
  end if;
  return NEW;
end $$;

drop trigger if exists trg_fz_sujet_sans_coordonnees on public.fanzone_sujets;
create trigger trg_fz_sujet_sans_coordonnees
before insert or update of titre, contenu on public.fanzone_sujets
for each row execute function public.refuser_coordonnees_fanzone();

drop trigger if exists trg_fz_message_sans_coordonnees on public.fanzone_messages;
create trigger trg_fz_message_sans_coordonnees
before insert or update of contenu on public.fanzone_messages
for each row execute function public.refuser_coordonnees_fanzone();

-- ---------------------------------------------------------------------------
--  4. Compteurs tenus à jour — sans eux, la liste des sujets ferait une
--     requête par ligne pour afficher « 12 réponses ».
-- ---------------------------------------------------------------------------

create or replace function public.fz_recompter_messages()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cible uuid := coalesce(NEW.sujet_id, OLD.sujet_id);
begin
  update public.fanzone_sujets s
     set nb_messages = (
           select count(*) from public.fanzone_messages m
            where m.sujet_id = cible and m.supprime_le is null
         ),
         dernier_le = greatest(s.created_at, coalesce((
           select max(m.created_at) from public.fanzone_messages m
            where m.sujet_id = cible and m.supprime_le is null
         ), s.created_at))
   where s.id = cible;
  return null;
end $$;

drop trigger if exists trg_fz_recompter on public.fanzone_messages;
create trigger trg_fz_recompter
after insert or delete or update of supprime_le on public.fanzone_messages
for each row execute function public.fz_recompter_messages();

-- ---------------------------------------------------------------------------
--  5. Qui a le droit de quoi
-- ---------------------------------------------------------------------------

alter table public.fanzone_sujets   enable row level security;
alter table public.fanzone_messages enable row level security;

/** Vrai si l'utilisateur courant suit cette personnalité — ou EST cette
 *  personnalité. C'est la porte d'entrée de son espace. */
create or replace function public.fz_a_acces(p_celebrity uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select p_celebrity = auth.uid()
      or exists (
        select 1 from public.abonnements a
         where a.celebrity_id = p_celebrity and a.fan_id = auth.uid()
      );
$$;

revoke all on function public.fz_a_acces(uuid) from public;
grant execute on function public.fz_a_acces(uuid) to authenticated;

-- Lecture des sujets : abonnés de la personnalité, hors auteurs bloqués.
drop policy if exists fz_sujets_lecture on public.fanzone_sujets;
create policy fz_sujets_lecture on public.fanzone_sujets
  for select to authenticated
  using (
    supprime_le is null
    and public.fz_a_acces(celebrity_id)
    and not public.blocage_entre(auteur_id, (select auth.uid()))
  );

-- Ouvrir un sujet : il faut suivre la personnalité, et signer de son nom.
drop policy if exists fz_sujets_creation on public.fanzone_sujets;
create policy fz_sujets_creation on public.fanzone_sujets
  for insert to authenticated
  with check (
    auteur_id = (select auth.uid())
    and public.fz_a_acces(celebrity_id)
  );

-- L'auteur corrige le sien ; la personnalité modère chez elle (épingler,
-- fermer, retirer). C'est sa vitrine : elle doit pouvoir y faire le ménage
-- sans passer par nous.
drop policy if exists fz_sujets_edition on public.fanzone_sujets;
create policy fz_sujets_edition on public.fanzone_sujets
  for update to authenticated
  using (auteur_id = (select auth.uid()) or celebrity_id = (select auth.uid()))
  with check (auteur_id = (select auth.uid()) or celebrity_id = (select auth.uid()));

-- Lecture des messages : même porte que le sujet, plus le filtre des blocages.
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
         and public.fz_a_acces(s.celebrity_id)
    )
  );

-- Répondre : sujet ouvert, et abonné.
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
         and public.fz_a_acces(s.celebrity_id)
    )
  );

drop policy if exists fz_messages_edition on public.fanzone_messages;
create policy fz_messages_edition on public.fanzone_messages
  for update to authenticated
  using (
    auteur_id = (select auth.uid())
    or exists (
      select 1 from public.fanzone_sujets s
       where s.id = sujet_id and s.celebrity_id = (select auth.uid())
    )
  )
  with check (true);

-- ---------------------------------------------------------------------------
--  6. Vue de lecture : les sujets avec leur auteur, prêts à afficher
-- ---------------------------------------------------------------------------
--  Sans elle, la liste ferait une requête par sujet pour retrouver un nom et
--  un avatar. Les policies de la table restent la seule autorité : la vue
--  s'exécute avec les droits de celui qui l'interroge.

create or replace view public.fanzone_sujets_public
with (security_invoker = true) as
select s.id, s.celebrity_id, s.auteur_id, s.type, s.titre, s.contenu,
       s.media_url, s.epingle, s.ferme, s.nb_messages, s.dernier_le, s.created_at,
       coalesce(nullif(btrim(p.display_name), ''), 'Fan') as auteur_nom,
       p.avatar_url                                       as auteur_avatar,
       (s.auteur_id = s.celebrity_id)                     as par_la_star
  from public.fanzone_sujets s
  left join public.profiles p on p.id = s.auteur_id
 where s.supprime_le is null;

grant select on public.fanzone_sujets_public to authenticated;

create or replace view public.fanzone_messages_public
with (security_invoker = true) as
select m.id, m.sujet_id, m.auteur_id, m.contenu, m.media_url, m.created_at,
       coalesce(nullif(btrim(p.display_name), ''), 'Fan') as auteur_nom,
       p.avatar_url                                       as auteur_avatar,
       (m.auteur_id = s.celebrity_id)                     as par_la_star
  from public.fanzone_messages m
  join public.fanzone_sujets s on s.id = m.sujet_id
  left join public.profiles p on p.id = m.auteur_id
 where m.supprime_le is null;

grant select on public.fanzone_messages_public to authenticated;

-- ---------------------------------------------------------------------------
--  7. Modération : retirer un sujet ou un message signalé
-- ---------------------------------------------------------------------------
--  Complète `admin_moderate_content` (voir moderation_content_reports.sql) avec
--  les deux cibles de la Fan zone. On marque supprimé plutôt que d'effacer :
--  un signalement doit rester vérifiable après traitement.

create or replace function public.admin_retirer_fanzone(p_type text, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare touche int := 0;
begin
  if (auth.jwt() ->> 'email') <> 'jc@clickzou.fr' then
    raise exception 'forbidden';
  end if;

  if p_type = 'sujet' then
    update public.fanzone_sujets set supprime_le = now()
     where id = p_id and supprime_le is null;
  elsif p_type = 'message' then
    update public.fanzone_messages set supprime_le = now()
     where id = p_id and supprime_le is null;
  elsif p_type = 'commentaire' then
    -- Commentaire sous une publication. `admin_moderate_content` ne savait
    -- retirer qu'une publication, un événement ou un profil : un commentaire
    -- signalé était donc « traité » sans jamais disparaître.
    update public.post_comments set deleted_at = now()
     where id = p_id and deleted_at is null;
  else
    raise exception 'type_inconnu';
  end if;

  get diagnostics touche = row_count;
  return jsonb_build_object('ok', true, 'lignes', touche);
end $$;

revoke all on function public.admin_retirer_fanzone(text, uuid) from public;
grant execute on function public.admin_retirer_fanzone(text, uuid) to authenticated;

-- ============================================================================
--  Vérification — à passer une fois après installation
-- ============================================================================
--  1. Sans suivre la personnalité, la lecture doit renvoyer 0 ligne :
--       select * from public.fanzone_sujets_public where celebrity_id = '<star>';
--  2. Après `insert into abonnements`, les sujets apparaissent.
--  3. Un sujet contenant « écris-moi sur wa.me » doit être REFUSÉ.
--  4. Après blocage d'un auteur, ses messages disparaissent de la liste.
-- ============================================================================
