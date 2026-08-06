-- LE LIEU DANS L'ANNONCE D'ÉVÉNEMENT
--
-- Pourquoi : une dédicace se passe EN PERSONNE — le fan doit se trouver à moins
-- d'un kilomètre pour la recevoir. L'annonce publiée dans le fil affichait le
-- titre, le texte, le code et la date… mais pas le lieu. Le fan ne pouvait donc
-- pas savoir OÙ se rendre avant d'avoir réservé, alors que l'information existait
-- déjà en base (`event_sessions.location`, renseignée automatiquement au moment
-- où la célébrité partage sa position).
--
-- La colonne `posts.location` existait déjà mais n'était jamais remplie : le
-- déclencheur d'annonce ne la recopiait pas. On ajoute aussi les coordonnées GPS
-- pour proposer un itinéraire d'un seul geste depuis la publication.
--
-- À exécuter dans Supabase → SQL Editor.

-- 1) Coordonnées du lieu sur l'annonce (le nom seul est parfois ambigu).
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision;

-- 2) Déclencheur des dédicaces : recopie du lieu à la création ET aux mises à jour.
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
    insert into public.posts (celebrity_id, kind, title, body, event_date,
                              location, latitude, longitude, event_session_id)
    values (NEW.created_by, 'event',
            coalesce(nullif(NEW.title, ''), 'Séance de dédicace'),
            corps, NEW.starts_at,
            nullif(NEW.location, ''), NEW.latitude, NEW.longitude, NEW.id)
    on conflict do nothing;
  else
    -- L'annonce SUIT l'événement : une date ou un lieu modifié sans mise à jour
    -- ferait se déplacer un fan pour rien.
    update public.posts
       set title = coalesce(nullif(NEW.title, ''), 'Séance de dédicace'),
           body = corps,
           event_date = NEW.starts_at,
           location = nullif(NEW.location, ''),
           latitude = NEW.latitude,
           longitude = NEW.longitude
     where event_session_id = NEW.id;
  end if;

  return NEW;
end $$;

-- `location` / `latitude` / `longitude` ajoutés à la liste des colonnes
-- surveillées : sans ça, corriger le lieu d'un événement déjà annoncé laissait
-- l'ancienne adresse dans le fil.
DROP TRIGGER IF EXISTS trg_announce_event_session ON public.event_sessions;
CREATE TRIGGER trg_announce_event_session
AFTER INSERT OR UPDATE OF title, starts_at, status, location, latitude, longitude
   OR DELETE ON public.event_sessions
FOR EACH ROW EXECUTE FUNCTION public.announce_event_session();

-- 3) Reprise des annonces déjà publiées (elles n'ont jamais eu de lieu).
UPDATE public.posts p
   SET location = nullif(e.location, ''),
       latitude = e.latitude,
       longitude = e.longitude
  FROM public.event_sessions e
 WHERE p.event_session_id = e.id
   AND (p.location IS DISTINCT FROM nullif(e.location, '')
        OR p.latitude IS DISTINCT FROM e.latitude
        OR p.longitude IS DISTINCT FROM e.longitude);
