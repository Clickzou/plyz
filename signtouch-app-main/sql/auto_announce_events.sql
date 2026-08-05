-- ANNONCE AUTOMATIQUE DES ÉVÉNEMENTS DANS LE FIL
--
-- Pourquoi : jusqu'ici, annoncer un événement demandait d'appuyer sur un bouton
-- « Publier dans le fil Actu » présent UNIQUEMENT sur l'écran de confirmation.
-- Le rater signifiait un événement introuvable — une dédicace vit dans
-- `event_sessions`, que le catalogue ne lit pas : sans annonce, seul le code
-- permet d'y accéder. Et l'écran de composition perdait parfois le type, publiant
-- l'annonce en simple « post », donc hors de l'onglet Événements.
--
-- Le déclencheur est posé en base, pas dans l'application : les dédicaces sont
-- créées par l'app (écriture Supabase directe) et les sessions vidéo par le
-- serveur (/api/create-session). Une règle unique côté base couvre les deux
-- chemins, et tout écran futur.
--
-- Le texte est rédigé en français : les publications sont de toute façon
-- traduites à la volée dans la langue du fan (cf. table `translations`).
--
-- À exécuter dans Supabase → SQL Editor.

-- 1) Lien entre l'annonce et l'événement qui l'a produite.
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS event_session_id uuid,
  ADD COLUMN IF NOT EXISTS live_session_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_posts_event_session
  ON public.posts (event_session_id) WHERE event_session_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_posts_live_session
  ON public.posts (live_session_id) WHERE live_session_id IS NOT NULL;

-- 2) Dédicaces (event_sessions)
CREATE OR REPLACE FUNCTION public.announce_event_session()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  corps text;
begin
  -- Un événement supprimé ne doit plus rien annoncer.
  if (TG_OP = 'DELETE') or (TG_OP = 'UPDATE' and NEW.status = 'deleted') then
    delete from public.posts
     where event_session_id = coalesce(OLD.id, NEW.id);
    return coalesce(NEW, OLD);
  end if;

  if NEW.status = 'deleted' then
    return NEW;
  end if;

  corps := '✍️ Rejoignez-moi pour une séance de dédicace en direct ! Recevez votre photo personnalisée et signée, rien que pour vous, sur Plyz 💜'
           || E'\n\nCode : ' || coalesce(NEW.join_code, '—');

  if TG_OP = 'INSERT' then
    insert into public.posts (celebrity_id, kind, title, body, event_date, event_session_id)
    values (NEW.created_by, 'event',
            coalesce(nullif(NEW.title, ''), 'Séance de dédicace'),
            corps, NEW.starts_at, NEW.id)
    on conflict do nothing;
  else
    -- L'annonce SUIT l'événement : une date modifiée sans mise à jour ferait
    -- se déplacer un fan pour rien.
    update public.posts
       set title = coalesce(nullif(NEW.title, ''), 'Séance de dédicace'),
           body = corps,
           event_date = NEW.starts_at
     where event_session_id = NEW.id;
  end if;

  return NEW;
end $$;

DROP TRIGGER IF EXISTS trg_announce_event_session ON public.event_sessions;
CREATE TRIGGER trg_announce_event_session
AFTER INSERT OR UPDATE OF title, starts_at, status OR DELETE ON public.event_sessions
FOR EACH ROW EXECUTE FUNCTION public.announce_event_session();

-- 3) Sessions vidéo (live_sessions)
CREATE OR REPLACE FUNCTION public.announce_live_session()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  corps text;
begin
  if (TG_OP = 'DELETE') or (TG_OP = 'UPDATE' and NEW.status = 'deleted') then
    delete from public.posts
     where live_session_id = coalesce(OLD.id, NEW.id);
    return coalesce(NEW, OLD);
  end if;

  if NEW.status = 'deleted' then
    return NEW;
  end if;

  corps := '🎥 Rejoignez-moi pour un appel vidéo privé en direct, rien que nous deux, sur Plyz 💜'
           || E'\n\nCode : ' || coalesce(NEW.code, '—');

  if TG_OP = 'INSERT' then
    insert into public.posts (celebrity_id, kind, title, body, media_url,
                              event_date, price_cents, live_session_id)
    values (NEW.celebrity_id, 'event',
            'Session Live Vidéo — ' || coalesce(NEW.celebrity_name, 'en direct'),
            corps, NEW.cover_photo_url,
            coalesce(NEW.scheduled_at, NEW.created_at),
            coalesce(NEW.price_cents, 0), NEW.id)
    on conflict do nothing;
  else
    update public.posts
       set body = corps,
           media_url = NEW.cover_photo_url,
           event_date = coalesce(NEW.scheduled_at, NEW.created_at),
           price_cents = coalesce(NEW.price_cents, 0)
     where live_session_id = NEW.id;
  end if;

  return NEW;
end $$;

DROP TRIGGER IF EXISTS trg_announce_live_session ON public.live_sessions;
CREATE TRIGGER trg_announce_live_session
AFTER INSERT OR UPDATE OF scheduled_at, cover_photo_url, price_cents, status OR DELETE ON public.live_sessions
FOR EACH ROW EXECUTE FUNCTION public.announce_live_session();
