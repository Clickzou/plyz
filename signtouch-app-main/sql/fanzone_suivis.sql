-- ============================================================================
--  Être prévenu quand on vous répond
-- ============================================================================
--
--  Sans notification, un forum meurt : on écrit, personne ne sait qu'on a
--  écrit, on ne revient pas voir si quelqu'un a répondu. C'est le seul
--  mécanisme qui transforme un fil de discussion en conversation.
--
--  On suit un sujet dès qu'on s'y engage — en l'ouvrant, en y répondant, ou
--  en soutenant une question. Personne n'a à cocher quoi que ce soit : on est
--  prévenu de ce à quoi on a participé, ce qui est exactement ce qu'on attend.
--
--  ⚠️ ET ON PEUT SE TAIRE. Un fil de fans peut recevoir cinquante réponses en
--  une soirée. Sans bouton pour couper, la notification passe d'utile à
--  insupportable, et l'utilisateur ne coupe pas le sujet : il coupe TOUTES les
--  notifications de l'application, définitivement.
--
--  ⚠️ PRÉREQUIS : `fanzone_groupes.sql`, `fanzone_stars_absentes.sql`.
--  À exécuter dans Supabase → SQL Editor.
-- ============================================================================

create table if not exists public.fanzone_suivis (
  sujet_id     uuid not null references public.fanzone_sujets(id) on delete cascade,
  fan_id       uuid not null references auth.users(id) on delete cascade,
  -- Mis à false quand on demande à ne plus être prévenu. On garde la ligne
  -- plutôt que de l'effacer : sinon la première réponse suivante nous
  -- réabonnerait automatiquement, et le bouton « couper » n'aurait servi à
  -- rien.
  actif        boolean not null default true,
  dernier_envoi timestamptz,
  created_at   timestamptz not null default now(),
  primary key (sujet_id, fan_id)
);

create index if not exists idx_fz_suivis_sujet on public.fanzone_suivis (sujet_id) where actif;

alter table public.fanzone_suivis enable row level security;

drop policy if exists fz_suivis_lecture on public.fanzone_suivis;
create policy fz_suivis_lecture on public.fanzone_suivis
  for select to authenticated using (fan_id = (select auth.uid()));

drop policy if exists fz_suivis_ecriture on public.fanzone_suivis;
create policy fz_suivis_ecriture on public.fanzone_suivis
  for insert to authenticated with check (fan_id = (select auth.uid()));

drop policy if exists fz_suivis_maj on public.fanzone_suivis;
create policy fz_suivis_maj on public.fanzone_suivis
  for update to authenticated using (fan_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
--  1. S'abonner par l'usage
-- ---------------------------------------------------------------------------

create or replace function public.fz_suivre_auto()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cible uuid;
  qui   uuid;
begin
  if TG_TABLE_NAME = 'fanzone_sujets' then
    cible := NEW.id; qui := NEW.auteur_id;
  elsif TG_TABLE_NAME = 'fanzone_messages' then
    cible := NEW.sujet_id; qui := NEW.auteur_id;
  else
    cible := NEW.sujet_id; qui := NEW.fan_id;
  end if;

  -- `do nothing` et non `do update` : quelqu'un qui a coupé les notifications
  -- d'un sujet ne doit pas y être ramené parce qu'il y répond une fois de plus.
  insert into public.fanzone_suivis (sujet_id, fan_id)
  values (cible, qui)
  on conflict (sujet_id, fan_id) do nothing;

  return NEW;
end $$;

drop trigger if exists trg_fz_suivre_sujet on public.fanzone_sujets;
create trigger trg_fz_suivre_sujet
after insert on public.fanzone_sujets
for each row execute function public.fz_suivre_auto();

drop trigger if exists trg_fz_suivre_message on public.fanzone_messages;
create trigger trg_fz_suivre_message
after insert on public.fanzone_messages
for each row execute function public.fz_suivre_auto();

drop trigger if exists trg_fz_suivre_soutien on public.fanzone_soutiens;
create trigger trg_fz_suivre_soutien
after insert on public.fanzone_soutiens
for each row execute function public.fz_suivre_auto();

-- ---------------------------------------------------------------------------
--  2. Prévenir — sans harceler
-- ---------------------------------------------------------------------------

create or replace function public.fz_notifier_reponse()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  s        public.fanzone_sujets;
  nom      text;
  extrait  text;
  par_star boolean;
begin
  select * into s from public.fanzone_sujets where id = NEW.sujet_id;
  if not found then return NEW; end if;

  select coalesce(nullif(btrim(display_name), ''), 'Un fan') into nom
    from public.profiles where id = NEW.auteur_id;

  extrait := left(regexp_replace(coalesce(NEW.contenu, ''), '\s+', ' ', 'g'), 90);
  par_star := (s.celebrity_id is not null and NEW.auteur_id = s.celebrity_id);

  insert into public.push_outbox (user_id, title, body, data)
  select f.fan_id,
         -- Quand c'est la personnalité qui répond, on le dit dans le titre :
         -- c'est la notification que le fan attend depuis qu'il a écrit, et
         -- elle ne doit pas ressembler à toutes les autres.
         case when par_star then '⭐ ' || coalesce(nom, 'La star') || ' a répondu'
              else coalesce(nom, 'Un fan') end,
         case when par_star then extrait else '💬 ' || extrait end,
         jsonb_build_object('type', 'fanzone_message',
                            'sujet_id', s.id, 'message_id', NEW.id)
    from public.fanzone_suivis f
   where f.sujet_id = NEW.sujet_id
     and f.actif
     -- On ne se prévient pas soi-même.
     and f.fan_id <> NEW.auteur_id
     -- Au plus une notification par heure et par sujet, sauf quand la star
     -- parle. Un fil qui s'emballe un soir de match enverrait sinon cinquante
     -- notifications à chacun — et c'est l'application entière qu'on couperait
     -- ensuite, pas le sujet.
     and (par_star or f.dernier_envoi is null or f.dernier_envoi < now() - interval '1 hour')
     -- Un blocage vaut aussi pour les notifications : sinon la personne
     -- bloquée continue d'apparaître sur l'écran verrouillé.
     and not public.blocage_entre(f.fan_id, NEW.auteur_id);

  update public.fanzone_suivis
     set dernier_envoi = now()
   where sujet_id = NEW.sujet_id
     and fan_id <> NEW.auteur_id
     and actif
     and (par_star or dernier_envoi is null or dernier_envoi < now() - interval '1 hour');

  return NEW;
exception when others then
  -- Une notification qui échoue ne doit jamais empêcher un message d'être
  -- publié : le message est le service, la notification est le confort.
  return NEW;
end $$;

drop trigger if exists trg_fz_notifier on public.fanzone_messages;
create trigger trg_fz_notifier
after insert on public.fanzone_messages
for each row execute function public.fz_notifier_reponse();

-- ---------------------------------------------------------------------------
--  3. Couper le son d'un sujet
-- ---------------------------------------------------------------------------

create or replace function public.fz_basculer_suivi(p_sujet uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare nouvel_etat boolean;
begin
  insert into public.fanzone_suivis (sujet_id, fan_id, actif)
  values (p_sujet, auth.uid(), true)
  on conflict (sujet_id, fan_id)
  do update set actif = not public.fanzone_suivis.actif
  returning actif into nouvel_etat;
  return nouvel_etat;
end $$;

revoke all on function public.fz_basculer_suivi(uuid) from public;
grant execute on function public.fz_basculer_suivi(uuid) to authenticated;

-- ============================================================================
--  Vérification
-- ============================================================================
--  1. Ouvrir un sujet doit créer un suivi :
--       select * from public.fanzone_suivis where fan_id = auth.uid();
--  2. Une reponse d'un AUTRE fan doit remplir la file :
--       select * from public.push_outbox order by created_at desc limit 5;
--  3. Deux reponses coup sur coup ne doivent produire QU'UNE notification.
--  4. Couper, puis repondre : plus aucune notification.
--       select public.fz_basculer_suivi('<sujet>');
-- ============================================================================
