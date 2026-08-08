-- ============================================================================
--  Fan zone — LOT 4 : questions, top fans, première heure, rencontres,
--                     anniversaires
-- ============================================================================
--
--  Ce fichier ne crée presque rien : il RÉVÈLE ce que la base sait déjà.
--
--  Les dédicaces réalisées dorment dans `session_queue.photo_url`, les
--  rencontres dans `completed_at`, les réclamations d'avant l'arrivée dans
--  `reclamations`. Tout cela existait sans qu'aucun écran ne le montre. Cinq
--  fonctions suffisent à en faire ce qui fait revenir un fan : sa place dans
--  le classement, sa photo sur le mur, son ancienneté reconnue.
--
--  ⚠️ PRÉREQUIS, dans l'ordre :
--     1. `fanzone_groupes.sql`        (fait)
--     2. `fanzone_stars_absentes.sql` (questions et soutiens — À FAIRE)
--     3. `fanzone_fil.sql`            (le fil d'activité — À FAIRE)
--     4. ce fichier
--
--  À exécuter dans Supabase → SQL Editor.
-- ============================================================================


-- ---------------------------------------------------------------------------
--  0. L'IDENTIFIANT D'UN FAN DANS LA FILE D'ATTENTE — et un bug corrigé
-- ---------------------------------------------------------------------------
--  ⚠️ `session_queue.fan_id` est du TEXTE, et il ne contient pas un identifiant
--  d'utilisateur : il contient « fan_user_cec8b9f5-9d3b-… ». La table est
--  antérieure aux tables récentes, qui utilisent des `uuid` propres.
--
--  Conséquence, découverte en écrivant ce fichier : `fz_fans_verifies`
--  (fanzone_badges.sql, DÉJÀ EN PRODUCTION) fait `q.fan_id::uuid` sans retirer
--  le préfixe. Dès qu'une dédicace terminée existe — il y en a deux —, la
--  fonction lève « invalid input syntax for type uuid » au lieu de renvoyer
--  une liste. L'application avale l'erreur en silence : le badge « A rencontré
--  la star », le seul que Plyz puisse délivrer et qu'aucun réseau social ne
--  peut copier, ne s'affichait donc POUR PERSONNE.
--
--  Cette fonction extrait l'uuid où qu'il se trouve dans la chaîne, et renvoie
--  NULL si elle n'en contient pas — plutôt que de faire échouer la requête
--  entière à cause d'une ligne mal formée.

create or replace function public.uuid_de_fan(p_texte text)
returns uuid
language sql
immutable
as $$
  select nullif(
    substring(coalesce(p_texte, '')
      from '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'),
    '')::uuid;
$$;

grant execute on function public.uuid_de_fan(text) to authenticated, anon;

-- `fz_fans_verifies` réparée, à l'identique pour le reste.
create or replace function public.fz_fans_verifies(p_celebrity uuid)
returns table (fan_id uuid)
language sql
security definer
stable
set search_path = public
as $$
  select distinct public.uuid_de_fan(q.fan_id)
    from public.session_queue q
    join public.live_sessions s on s.id::text = q.session_id::text
   where s.celebrity_id::text = p_celebrity::text
     and q.status = 'completed'
     and coalesce(q.payment_captured, false) = true
     and public.uuid_de_fan(q.fan_id) is not null
  union
  select distinct public.uuid_de_fan(q.fan_id)
    from public.session_queue q
    join public.event_sessions e on e.id::text = q.session_id::text
   where e.created_by::text = p_celebrity::text
     and q.status = 'completed'
     and coalesce(q.payment_captured, false) = true
     and public.uuid_de_fan(q.fan_id) is not null;
$$;

revoke all on function public.fz_fans_verifies(uuid) from public;
grant execute on function public.fz_fans_verifies(uuid) to authenticated;


-- ---------------------------------------------------------------------------
--  1. LES QUESTIONS — ce que les fans veulent demander
-- ---------------------------------------------------------------------------
--  Le type « question » et les soutiens existent depuis `fanzone_stars_absentes`
--  et aucun écran ne les montrait. Or c'est la matière du dossier qu'on envoie
--  à un agent : « 340 fans vous attendent, voici les 10 questions qu'ils vous
--  posent le plus » se refuse moins bien qu'un argumentaire.
--
--  La même fonction sert les deux côtés : le fan y voit ce qu'on demande, la
--  personnalité y voit ce à quoi elle doit répondre. Une seule vérité.

create or replace function public.fz_questions(
  p_celebrity uuid default null,
  p_star      uuid default null,
  p_limite    integer default 50
)
returns table (
  id            uuid,
  titre         text,
  contenu       text,
  nb_soutiens   integer,
  nb_messages   integer,
  created_at    timestamptz,
  auteur_id     uuid,
  auteur_nom    text,
  auteur_avatar text,
  soutenu       boolean,
  repondue      boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.titre, s.contenu, s.nb_soutiens, s.nb_messages, s.created_at,
         s.auteur_id,
         coalesce(nullif(btrim(p.display_name), ''), 'Fan') as auteur_nom,
         p.avatar_url,
         exists (
           select 1 from public.fanzone_soutiens f
            where f.sujet_id = s.id and f.fan_id = (select auth.uid())
         ) as soutenu,
         -- Répondue = la personnalité elle-même a écrit dans le fil. C'est ce
         -- qui permet de séparer, côté star, ce qui reste à traiter.
         exists (
           select 1 from public.fanzone_messages m
            where m.sujet_id = s.id
              and m.supprime_le is null
              and m.auteur_id = s.celebrity_id
         ) as repondue
    from public.fanzone_sujets s
    left join public.profiles p on p.id = s.auteur_id
   where s.supprime_le is null
     and s.type = 'question'
     and (
       (p_celebrity is not null and s.celebrity_id = p_celebrity)
       or (p_star is not null and s.star_id = p_star)
     )
     -- Mêmes portes que partout ailleurs : abonné, réclamant, ou la
     -- personnalité chez elle.
     and (
       (s.celebrity_id is not null and (
          s.celebrity_id = (select auth.uid())
          or exists (select 1 from public.abonnements a
                      where a.celebrity_id = s.celebrity_id and a.fan_id = (select auth.uid()))
       ))
       or (s.star_id is not null and exists (
            select 1 from public.reclamations r
             where r.star_id = s.star_id and r.fan_id = (select auth.uid())))
     )
     and not public.blocage_entre(s.auteur_id, (select auth.uid()))
   -- Les plus soutenues d'abord : c'est l'ordre du dossier d'invitation, et
   -- l'ordre dans lequel une personnalité a intérêt à répondre.
   order by s.nb_soutiens desc, s.created_at desc
   limit least(coalesce(p_limite, 50), 200);
$$;

revoke all on function public.fz_questions(uuid, uuid, integer) from public;
grant execute on function public.fz_questions(uuid, uuid, integer) to authenticated;


-- ---------------------------------------------------------------------------
--  2. LA PREMIÈRE HEURE — ceux qui l'ont réclamée avant qu'elle n'arrive
-- ---------------------------------------------------------------------------
--  Réclamer quelqu'un qui n'est pas là est un acte de foi : on demande une
--  personne à une application où elle n'existe pas encore. Le jour où elle
--  arrive, ces fans-là ne peuvent pas être confondus avec ceux venus après —
--  sinon la réclamation ne vaut rien, et plus personne ne réclamera.
--
--  Ce qu'ils obtiennent, sans jamais rien retirer aux autres :
--    · un badge visible dans l'espace de la personnalité ;
--    · les annonces d'événement AVANT tout le monde (voir le serveur).
--
--  Définie AVANT `top_fans`, qui l'appelle : Postgres résout les fonctions à
--  la création, et l'inverse échouerait à l'installation.

create or replace function public.est_premiere_heure(p_celebrity uuid, p_fan uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.reclamations r
      join public.stars_reclamees s on s.id = r.star_id
     where s.arrivee_user_id = p_celebrity
       and r.fan_id = p_fan
       -- Avant l'arrivée, jamais après : réclamer quelqu'un qui est déjà là
       -- n'a rien d'un pari.
       and (s.arrivee_le is null or r.created_at < s.arrivee_le)
  );
$$;

revoke all on function public.est_premiere_heure(uuid, uuid) from public;
grant execute on function public.est_premiere_heure(uuid, uuid) to authenticated, anon;

/** Tous les fans de la première heure d'une personnalité — pour les prévenir
 *  en premier, et pour afficher leur badge sans une requête par ligne. */
create or replace function public.fans_premiere_heure(p_celebrity uuid)
returns table (fan_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select distinct r.fan_id
    from public.reclamations r
    join public.stars_reclamees s on s.id = r.star_id
   where s.arrivee_user_id = p_celebrity
     and (s.arrivee_le is null or r.created_at < s.arrivee_le);
$$;

revoke all on function public.fans_premiere_heure(uuid) from public;
grant execute on function public.fans_premiere_heure(uuid) to authenticated;


-- ---------------------------------------------------------------------------
--  3. LE TOP DES FANS — qui sont ses plus grands fans
-- ---------------------------------------------------------------------------
--  ⚠️ CE QUI N'EST PAS COMPTÉ, ET POURQUOI : l'argent.
--  Classer les fans sur ce qu'ils ont dépensé transformerait une communauté en
--  liste de clients, ferait de la fidélité une question de moyens, et
--  s'afficherait publiquement — ce qui serait indécent. On compte ce qui se
--  voit : les rencontres vécues et la présence dans l'espace.
--
--  Le rang affiché côté fan (bronze, argent…) reste calculé dans l'app sur ses
--  interactions locales. Celui-ci est le classement PAR PERSONNALITÉ, tenu en
--  base, et c'est le seul que la star voit.

create or replace function public.top_fans(p_celebrity uuid, p_limite integer default 10)
returns table (
  fan_id      uuid,
  nom         text,
  avatar_url  text,
  rencontres  integer,
  messages    integer,
  points      integer,
  premiere_heure boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with rencontres as (
    -- Une dédicace menée à son terme dans un événement de cette personnalité.
    -- `uuid_de_fan` et comparaisons en texte : la file d'attente stocke ses
    -- identifiants sous la forme « fan_user_<uuid> » (voir la section 0).
    select public.uuid_de_fan(q.fan_id) as fan_id, count(*)::int as n
      from public.session_queue q
      join public.event_sessions e on e.id::text = q.session_id::text
     where e.created_by = p_celebrity
       and q.completed_at is not null
       and public.uuid_de_fan(q.fan_id) is not null
     group by public.uuid_de_fan(q.fan_id)
    union all
    -- ⚠️ Les DEUX familles de séances, comme `fz_fans_verifies`. La file
    -- d'attente sert aussi bien aux événements en personne qu'aux lives
    -- vidéo, et n'en compter qu'une revenait à effacer la moitié des
    -- rencontres — les deux seules dédicaces existantes sont d'ailleurs des
    -- lives.
    select public.uuid_de_fan(q.fan_id), count(*)::int
      from public.session_queue q
      join public.live_sessions l on l.id::text = q.session_id::text
     where l.celebrity_id::text = p_celebrity::text
       and q.completed_at is not null
       and public.uuid_de_fan(q.fan_id) is not null
     group by public.uuid_de_fan(q.fan_id)
    union all
    -- Un appel vidéo réglé dont le rendez-vous est passé. Il n'existe pas de
    -- statut « terminé » sur ces demandes : `paid` est le dernier état écrit
    -- par le serveur, et la date du créneau dit le reste. Compter un appel
    -- payé pour demain reviendrait à créditer une rencontre qui n'a pas eu lieu.
    select v.fan_id, count(*)::int
      from public.video_call_requests v
     where v.celebrity_id = p_celebrity
       and v.status = 'paid'
       and v.scheduled_at is not null
       and v.scheduled_at < now()
     group by v.fan_id
  ),
  activite as (
    select s.auteur_id as fan_id, count(*)::int as n
      from public.fanzone_sujets s
     where s.celebrity_id = p_celebrity and s.supprime_le is null
     group by s.auteur_id
    union all
    select m.auteur_id, count(*)::int
      from public.fanzone_messages m
      join public.fanzone_sujets s on s.id = m.sujet_id
     where s.celebrity_id = p_celebrity and m.supprime_le is null
     group by m.auteur_id
  ),
  tous as (
    select fan_id, sum(n)::int as rencontres, 0 as messages from rencontres group by fan_id
    union all
    select fan_id, 0, sum(n)::int from activite group by fan_id
  ),
  cumul as (
    select t.fan_id,
           sum(t.rencontres)::int as rencontres,
           sum(t.messages)::int   as messages
      from tous t
     where t.fan_id is not null
     group by t.fan_id
  )
  select c.fan_id,
         coalesce(nullif(btrim(p.display_name), ''), 'Fan') as nom,
         p.avatar_url,
         c.rencontres,
         c.messages,
         -- Une rencontre pèse dix messages : elle s'est payée, déplacée, vécue.
         (c.rencontres * 10 + c.messages)::int as points,
         public.est_premiere_heure(p_celebrity, c.fan_id) as premiere_heure
    from cumul c
    left join public.profiles p on p.id = c.fan_id
   where c.rencontres + c.messages > 0
     and not public.blocage_entre(c.fan_id, (select auth.uid()))
   order by points desc, c.rencontres desc
   limit least(coalesce(p_limite, 10), 50);
$$;


revoke all on function public.top_fans(uuid, integer) from public;
grant execute on function public.top_fans(uuid, integer) to authenticated;


-- ---------------------------------------------------------------------------
--  4. LE MUR DES RENCONTRES ET « J'Y ÉTAIS »
-- ---------------------------------------------------------------------------
--  Le mur ne demande RIEN à personne : les dédicaces réalisées sont déjà en
--  base, dans `session_queue.photo_url`. Elles n'étaient montrées qu'à leur
--  destinataire. Les rassembler, c'est la seule preuve qu'aucun réseau social
--  ne peut copier — ces gens-là ont vraiment rencontré la personne.
--
--  « J'y étais » couvre l'autre moitié : à un événement en personne, tout le
--  monde n'est pas passé par la file. Ceux qui étaient là peuvent le dire.

create table if not exists public.jetais (
  session_id uuid not null references public.event_sessions(id) on delete cascade,
  fan_id     uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (session_id, fan_id)
);

create index if not exists idx_jetais_session on public.jetais (session_id);

alter table public.jetais enable row level security;

-- Visible par tous ceux qui voient l'événement : c'est un compteur public,
-- « 47 fans y étaient » n'a de sens que s'il se voit.
drop policy if exists jetais_lecture on public.jetais;
create policy jetais_lecture on public.jetais
  for select to authenticated using (true);

-- On ne peut dire « j'y étais » que pour soi, et que sur un événement COMMENCÉ.
-- Sans cette dernière condition, on se déclarerait présent à un concert qui
-- n'a pas eu lieu.
drop policy if exists jetais_ajout on public.jetais;
create policy jetais_ajout on public.jetais
  for insert to authenticated
  with check (
    fan_id = (select auth.uid())
    and exists (
      select 1 from public.event_sessions e
       where e.id = session_id and e.starts_at <= now()
    )
  );

drop policy if exists jetais_retrait on public.jetais;
create policy jetais_retrait on public.jetais
  for delete to authenticated using (fan_id = (select auth.uid()));

/**
 * Le mur des rencontres d'une personnalité.
 *
 * Deux sources réunies : les dédicaces réellement réalisées (photo prise
 * pendant la prestation) et les photos que les fans ont publiées dans
 * l'espace. Les premières font foi, les secondes font vivre.
 */
create or replace function public.mur_rencontres(p_celebrity uuid, p_limite integer default 40)
returns table (
  id          text,
  photo_url   text,
  fan_id      uuid,
  fan_nom     text,
  fan_avatar  text,
  quand       timestamptz,
  verifiee    boolean,
  message     text
)
language sql
stable
security definer
set search_path = public
as $$
  -- Même précaution qu'ailleurs sur cette table : l'identifiant du fan y est
  -- du texte préfixé, et le joindre directement à `profiles` échouerait
  -- (« operator does not exist: uuid = text »).
  select ('d:' || q.id::text)                                   as id,
         q.photo_url,
         public.uuid_de_fan(q.fan_id)                           as fan_id,
         coalesce(nullif(btrim(p.display_name), ''), q.fan_name, 'Fan') as fan_nom,
         p.avatar_url,
         q.completed_at                                         as quand,
         true                                                   as verifiee,
         q.message
    from public.session_queue q
    join public.event_sessions e on e.id::text = q.session_id::text
    left join public.profiles p on p.id = public.uuid_de_fan(q.fan_id)
   where e.created_by = p_celebrity
     and q.completed_at is not null
     and q.photo_url is not null
     -- `coalesce` : sur une ligne dont l'identifiant est illisible, la
     -- comparaison renverrait NULL, et NULL ferait disparaître la ligne du
     -- mur sans que personne ne sache pourquoi.
     and not coalesce(public.blocage_entre(public.uuid_de_fan(q.fan_id), (select auth.uid())), false)

  union all

  -- Les dédicaces des LIVES vidéo. Même table de file d'attente, autre
  -- famille de séances : les oublier vidait le mur de la moitié de ce qu'il
  -- doit montrer.
  select ('l:' || q.id::text),
         q.photo_url,
         public.uuid_de_fan(q.fan_id),
         coalesce(nullif(btrim(p.display_name), ''), q.fan_name, 'Fan'),
         p.avatar_url,
         q.completed_at,
         true,
         q.message
    from public.session_queue q
    join public.live_sessions l on l.id::text = q.session_id::text
    left join public.profiles p on p.id = public.uuid_de_fan(q.fan_id)
   where l.celebrity_id::text = p_celebrity::text
     and q.completed_at is not null
     and q.photo_url is not null
     and not coalesce(public.blocage_entre(public.uuid_de_fan(q.fan_id), (select auth.uid())), false)

  union all

  select ('p:' || s.id::text),
         s.media_url,
         s.auteur_id,
         coalesce(nullif(btrim(p.display_name), ''), 'Fan'),
         p.avatar_url,
         s.created_at,
         false,
         s.titre
    from public.fanzone_sujets s
    left join public.profiles p on p.id = s.auteur_id
   where s.celebrity_id = p_celebrity
     and s.type = 'photo'
     and s.media_url is not null
     and s.supprime_le is null
     and not public.blocage_entre(s.auteur_id, (select auth.uid()))

   order by quand desc
   limit least(coalesce(p_limite, 40), 100);
$$;

revoke all on function public.mur_rencontres(uuid, integer) from public;
grant execute on function public.mur_rencontres(uuid, integer) to authenticated;


/**
 * Les événements récents d'une personnalité, avec ceux qui y étaient.
 *
 * Sert le bouton « J'y étais » : à un événement en personne, tout le monde
 * n'est pas passé par la file d'attente — on peut être venu, avoir attendu,
 * être reparti sans dédicace. Ces gens-là existent, et ils étaient là.
 *
 * Deux mois en arrière, pas plus : « j'y étais » à un concert d'il y a trois
 * ans ne se vérifie plus et n'intéresse personne.
 */
create or replace function public.evenements_passes(p_celebrity uuid, p_limite integer default 5)
returns table (
  id           uuid,
  titre        text,
  starts_at    timestamptz,
  nb_presents  integer,
  moi_present  boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select e.id,
         coalesce(nullif(btrim(e.title), ''), 'Événement') as titre,
         e.starts_at,
         (select count(*)::int from public.jetais j where j.session_id = e.id) as nb_presents,
         exists (
           select 1 from public.jetais j
            where j.session_id = e.id and j.fan_id = (select auth.uid())
         ) as moi_present
    from public.event_sessions e
   where e.created_by = p_celebrity
     and e.starts_at <= now()
     and e.starts_at > now() - interval '60 days'
   order by e.starts_at desc
   limit least(coalesce(p_limite, 5), 20);
$$;

revoke all on function public.evenements_passes(uuid, integer) from public;
grant execute on function public.evenements_passes(uuid, integer) to authenticated;


-- ---------------------------------------------------------------------------
--  5. LES ANNIVERSAIRES
-- ---------------------------------------------------------------------------
--  Le seul rendez-vous de l'année qu'une personnalité ne peut pas ignorer, et
--  le seul jour où des milliers de messages lui font plaisir au lieu de
--  l'agacer. C'est l'exact opposé du robinet des interpellations — et c'est
--  pour cela qu'il ne s'y applique pas : ici, on écrit CHEZ NOUS, sur son mur
--  Plyz, pas sur ses réseaux.
--
--  La date vient de Wikidata (propriété P569) pour le catalogue, et du profil
--  pour les personnalités inscrites. Personne ne la saisit à la main.

alter table public.celebrity_profiles
  add column if not exists date_naissance date;
alter table public.stars_reclamees
  add column if not exists date_naissance date;

comment on column public.celebrity_profiles.date_naissance is
  'Jour et mois servent au mur d''anniversaire ; l''année n''est jamais affichée.';

-- Un mur par personnalité et par année : le rouvrir chaque année plutôt que
-- d'empiler les messages de 2026 sous ceux de 2025.
create table if not exists public.murs_anniversaire (
  id           uuid primary key default gen_random_uuid(),
  celebrity_id uuid not null references auth.users(id) on delete cascade,
  annee        integer not null,
  sujet_id     uuid references public.fanzone_sujets(id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (celebrity_id, annee)
);

alter table public.murs_anniversaire enable row level security;

drop policy if exists murs_anniversaire_lecture on public.murs_anniversaire;
create policy murs_anniversaire_lecture on public.murs_anniversaire
  for select to authenticated using (true);

/**
 * Les personnalités qui fêtent leur anniversaire aujourd'hui.
 *
 * Comparaison sur le jour et le mois seulement : l'année ne sert à rien ici,
 * et l'afficher serait la dernière chose à faire.
 */
create or replace function public.anniversaires_du_jour()
returns table (celebrity_id uuid, nom text, date_naissance date)
language sql
stable
security definer
set search_path = public
as $$
  -- Deux sources, dans cet ordre : ce que la personnalité a renseigné, sinon
  -- la fiche du catalogue dont elle a pris possession en arrivant. Sans ce
  -- second recours, le mur ne s'ouvrirait que pour celles qui ont pensé à
  -- remplir leur date — c'est-à-dire presque personne.
  select c.user_id,
         coalesce(nullif(btrim(c.stage_name), ''), nullif(btrim(s.nom_affiche), ''), 'Cette personnalité'),
         coalesce(c.date_naissance, s.date_naissance)
    from public.celebrity_profiles c
    left join public.stars_reclamees s on s.arrivee_user_id = c.user_id
   where coalesce(c.date_naissance, s.date_naissance) is not null
     and extract(month from coalesce(c.date_naissance, s.date_naissance)) = extract(month from current_date)
     and extract(day   from coalesce(c.date_naissance, s.date_naissance)) = extract(day   from current_date);
$$;

revoke all on function public.anniversaires_du_jour() from public;
grant execute on function public.anniversaires_du_jour() to authenticated;


-- ---------------------------------------------------------------------------
--  6. LES NOTIFICATIONS — des deux côtés
-- ---------------------------------------------------------------------------
--  Même principe que les réponses (`fanzone_suivis.sql`) : la file d'attente
--  `push_outbox` est remplie par la base, vidée par le serveur toutes les
--  minutes. Et comme là-bas, l'échec d'une notification ne doit JAMAIS empêcher
--  l'écriture qui l'a déclenchée — le message est le service, la notification
--  est le confort.

/** Une question posée : la personnalité est prévenue. C'est la seule
 *  notification qu'elle reçoit de la Fan zone, et elle est plafonnée à une
 *  par heure : trente questions un soir de match ne doivent pas devenir trente
 *  notifications, sinon elle coupe tout. */
create or replace function public.fz_notifier_question()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  nom text;
  deja int;
begin
  if NEW.type <> 'question' or NEW.celebrity_id is null then return NEW; end if;
  -- La personnalité qui se pose une question à elle-même n'a rien à apprendre.
  if NEW.auteur_id = NEW.celebrity_id then return NEW; end if;

  select count(*) into deja
    from public.push_outbox
   where user_id = NEW.celebrity_id
     and data ->> 'type' = 'fanzone_question'
     and created_at > now() - interval '1 hour';
  if deja > 0 then return NEW; end if;

  select coalesce(nullif(btrim(display_name), ''), 'Un fan') into nom
    from public.profiles where id = NEW.auteur_id;

  insert into public.push_outbox (user_id, title, body, data)
  values (NEW.celebrity_id,
          '❓ ' || coalesce(nom, 'Un fan') || ' te pose une question',
          left(regexp_replace(NEW.titre, '\s+', ' ', 'g'), 90),
          jsonb_build_object('type', 'fanzone_question', 'sujet_id', NEW.id,
                             'celebrity_id', NEW.celebrity_id));
  return NEW;
exception when others then
  return NEW;
end $$;

drop trigger if exists trg_fz_notifier_question on public.fanzone_sujets;
create trigger trg_fz_notifier_question
after insert on public.fanzone_sujets
for each row execute function public.fz_notifier_question();

/** Une question franchit un palier de soutiens : celui qui l'a posée
 *  l'apprend. C'est ce qui lui donne envie d'en poser une autre — et ce qui
 *  fait revenir tous ceux qui l'ont soutenue. */
create or replace function public.fz_notifier_soutien()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.fanzone_sujets;
  n int;
begin
  select * into s from public.fanzone_sujets where id = NEW.sujet_id;
  if not found or s.type <> 'question' then return NEW; end if;

  n := coalesce(s.nb_soutiens, 0);
  -- Aux paliers seulement : une notification à chaque soutien serait
  -- insupportable passé la dixième.
  if n not in (5, 10, 25, 50, 100, 250, 500) then return NEW; end if;
  if s.auteur_id = NEW.fan_id then return NEW; end if;

  insert into public.push_outbox (user_id, title, body, data)
  values (s.auteur_id,
          '🔥 ' || n::text || ' fans veulent la réponse',
          left(regexp_replace(s.titre, '\s+', ' ', 'g'), 90),
          jsonb_build_object('type', 'fanzone_soutien', 'sujet_id', s.id));
  return NEW;
exception when others then
  return NEW;
end $$;

drop trigger if exists trg_fz_notifier_soutien on public.fanzone_soutiens;
create trigger trg_fz_notifier_soutien
after insert on public.fanzone_soutiens
for each row execute function public.fz_notifier_soutien();

/** « J'y étais » : la personnalité voit monter le nombre de gens qui se sont
 *  déplacés pour elle. Aux paliers, là encore — et jamais pour un seul. */
create or replace function public.notifier_jetais()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  e public.event_sessions;
  n int;
begin
  select * into e from public.event_sessions where id = NEW.session_id;
  if not found then return NEW; end if;

  select count(*) into n from public.jetais where session_id = NEW.session_id;
  if n not in (10, 25, 50, 100, 250, 500, 1000) then return NEW; end if;

  insert into public.push_outbox (user_id, title, body, data)
  values (e.created_by,
          '🙌 ' || n::text || ' fans y étaient',
          coalesce(nullif(btrim(e.title), ''), 'Ton événement'),
          jsonb_build_object('type', 'jetais', 'session_id', e.id));
  return NEW;
exception when others then
  return NEW;
end $$;

drop trigger if exists trg_notifier_jetais on public.jetais;
create trigger trg_notifier_jetais
after insert on public.jetais
for each row execute function public.notifier_jetais();


-- ============================================================================
--  Vérification
-- ============================================================================
--  1. select * from public.fz_questions('<celebrity_id>');       -- questions
--  2. select * from public.top_fans('<celebrity_id>');           -- classement
--  3. select public.est_premiere_heure('<celebrity_id>','<fan>');
--  4. select * from public.mur_rencontres('<celebrity_id>');
--  5. select * from public.anniversaires_du_jour();
--  6. « J'y étais » sur un événement qui n'a pas commencé doit être REFUSÉ.
-- ============================================================================
