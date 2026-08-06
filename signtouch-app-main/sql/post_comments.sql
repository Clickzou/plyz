-- DE VRAIS COMMENTAIRES
--
-- Pourquoi : les commentaires n'existaient que sur le téléphone de celui qui les
-- écrivait (AsyncStorage `@plyz_post_comments`, auteur codé en dur « You »).
-- Personne d'autre ne les voyait — ni les autres fans, ni la personnalité, qui
-- ne pouvait donc pas répondre. Un fan écrivait à sa star, n'obtenait jamais de
-- réponse, et en concluait qu'elle l'ignorait. Le compteur affiché ne comptait
-- que ses propres messages, et une réinstallation effaçait tout.
--
-- À exécuter dans Supabase → SQL Editor.

-- 1) La table
CREATE TABLE IF NOT EXISTS public.post_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Réponse à un autre commentaire (fil de discussion à un seul niveau).
  parent_id uuid REFERENCES public.post_comments(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 500),
  -- Suppression DOUCE : un commentaire retiré doit rester consultable par la
  -- modération (obligations DSA), pas disparaître de la base.
  deleted_at timestamptz,
  deleted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_post_comments_post ON public.post_comments (post_id, created_at);
CREATE INDEX IF NOT EXISTS idx_post_comments_parent ON public.post_comments (parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_post_comments_author ON public.post_comments (author_id);

-- 2) Compteur sur la publication (le fil affiche le nombre sans lire la liste)
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS comment_count integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.sync_post_comment_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
begin
  if TG_OP = 'INSERT' and NEW.deleted_at is null then
    update public.posts set comment_count = comment_count + 1 where id = NEW.post_id;
  elsif TG_OP = 'DELETE' and OLD.deleted_at is null then
    update public.posts set comment_count = greatest(0, comment_count - 1) where id = OLD.post_id;
  elsif TG_OP = 'UPDATE' then
    -- Le seul changement d'état qui compte : masqué ou rétabli.
    if OLD.deleted_at is null and NEW.deleted_at is not null then
      update public.posts set comment_count = greatest(0, comment_count - 1) where id = NEW.post_id;
    elsif OLD.deleted_at is not null and NEW.deleted_at is null then
      update public.posts set comment_count = comment_count + 1 where id = NEW.post_id;
    end if;
  end if;
  return coalesce(NEW, OLD);
end $$;

DROP TRIGGER IF EXISTS trg_post_comment_count ON public.post_comments;
CREATE TRIGGER trg_post_comment_count
AFTER INSERT OR UPDATE OF deleted_at OR DELETE ON public.post_comments
FOR EACH ROW EXECUTE FUNCTION public.sync_post_comment_count();

-- 3) Qui peut faire quoi (RLS)
ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;

-- Lecture : publique, comme le fil lui-même. Les commentaires retirés sortent.
DROP POLICY IF EXISTS post_comments_read ON public.post_comments;
CREATE POLICY post_comments_read ON public.post_comments
  FOR SELECT USING (deleted_at IS NULL);

-- Écriture : uniquement en son propre nom. Sans cette égalité, n'importe qui
-- pourrait signer un commentaire du nom d'un autre.
DROP POLICY IF EXISTS post_comments_insert ON public.post_comments;
CREATE POLICY post_comments_insert ON public.post_comments
  FOR INSERT WITH CHECK (auth.uid() = author_id);

-- Retrait : l'auteur du commentaire, la personnalité propriétaire de la
-- publication (elle doit pouvoir modérer chez elle), ou un administrateur.
DROP POLICY IF EXISTS post_comments_update ON public.post_comments;
CREATE POLICY post_comments_update ON public.post_comments
  FOR UPDATE USING (
    auth.uid() = author_id
    OR auth.uid() = (SELECT celebrity_id FROM public.posts WHERE id = post_id)
    OR public.is_admin()
  );

-- 4) Vue de lecture : le commentaire AVEC son auteur (nom + photo).
-- Une clé étrangère vers `profiles` refuserait le commentaire d'un compte qui
-- n'a pas encore de fiche : on joint donc en LEFT JOIN, sans contrainte.
CREATE OR REPLACE VIEW public.post_comments_public AS
SELECT
  c.id,
  c.post_id,
  c.parent_id,
  c.author_id,
  c.body,
  c.created_at,
  coalesce(nullif(btrim(p.display_name), ''), 'Fan') AS author_name,
  p.avatar_url AS author_avatar,
  -- Vrai quand c'est la personnalité qui a publié le post qui parle : son
  -- message porte alors le badge « Auteur » et se distingue des autres.
  (c.author_id = pst.celebrity_id) AS is_post_author
FROM public.post_comments c
JOIN public.posts pst ON pst.id = c.post_id
LEFT JOIN public.profiles p ON p.id = c.author_id
WHERE c.deleted_at IS NULL;

GRANT SELECT ON public.post_comments_public TO anon, authenticated;

-- 5) Notification : prévenir sans que personne n'ait à surveiller l'app.
-- On écrit dans `push_outbox`, que le serveur vide toutes les 60 secondes —
-- aucune modification du serveur n'est nécessaire.
CREATE OR REPLACE FUNCTION public.notify_post_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  proprietaire uuid;
  destinataire uuid;
  auteur_nom text;
  extrait text;
begin
  select celebrity_id into proprietaire from public.posts where id = NEW.post_id;

  -- Une réponse prévient celui à qui l'on répond ; un commentaire prévient la
  -- personnalité. Dans les deux cas, jamais soi-même.
  if NEW.parent_id is not null then
    select author_id into destinataire from public.post_comments where id = NEW.parent_id;
  else
    destinataire := proprietaire;
  end if;

  if destinataire is null or destinataire = NEW.author_id then
    return NEW;
  end if;

  select coalesce(nullif(btrim(display_name), ''), 'Un fan') into auteur_nom
    from public.profiles where id = NEW.author_id;

  extrait := left(NEW.body, 80) || case when length(NEW.body) > 80 then '…' else '' end;

  insert into public.push_outbox (user_id, title, body, data)
  values (
    destinataire,
    coalesce(auteur_nom, 'Un fan'),
    case when NEW.parent_id is null then '💬 ' || extrait else '↩️ ' || extrait end,
    jsonb_build_object('type', 'post_comment', 'post_id', NEW.post_id, 'comment_id', NEW.id)
  );

  return NEW;
exception when others then
  -- Une notification qui échoue ne doit JAMAIS faire perdre le commentaire.
  return NEW;
end $$;

DROP TRIGGER IF EXISTS trg_notify_post_comment ON public.post_comments;
CREATE TRIGGER trg_notify_post_comment
AFTER INSERT ON public.post_comments
FOR EACH ROW EXECUTE FUNCTION public.notify_post_comment();

-- 6) Remise à niveau du compteur (table neuve : tout à zéro, mais l'ordre est
-- idempotent et sert aussi après une reprise manuelle).
UPDATE public.posts p
   SET comment_count = (
     SELECT count(*) FROM public.post_comments c
      WHERE c.post_id = p.id AND c.deleted_at IS NULL
   )
 WHERE p.comment_count IS DISTINCT FROM (
     SELECT count(*) FROM public.post_comments c
      WHERE c.post_id = p.id AND c.deleted_at IS NULL
   );
