-- ============================================================================
--  Les réseaux sociaux des personnalités du catalogue
-- ============================================================================
--
--  Le problème que ce fichier ouvre la voie à résoudre : un fan qui réclamait
--  quelqu'un ne pouvait que PARTAGER un lien Plyz à ses proches. Le geste ne
--  touchait jamais la personne concernée. Or c'est là que tout se joue : mille
--  fans qui écrivent publiquement à une personnalité chez elle valent mieux que
--  n'importe quel courriel de prospection — et c'est exactement ce que promet
--  l'écran (« plus vous êtes nombreux, plus elle a de raisons de venir »).
--
--  Pour ouvrir sa page, encore faut-il la connaître. La colonne `reseau_url`
--  existante ne contient PAS un réseau social : elle garde le lien Wikidata de
--  la fiche importée (voir `scripts/importer-catalogue-stars.cjs`). Elle sert
--  de preuve de notoriété, elle n'a rien à montrer à un fan.
--
--  D'où cette colonne, remplie depuis Wikidata — qui connaît, pour la plupart
--  des personnes du catalogue, leurs comptes officiels :
--
--    {
--      "facebook":  "https://www.facebook.com/…",
--      "instagram": "https://www.instagram.com/…",
--      "youtube":   "https://www.youtube.com/channel/…",
--      "x":         "https://x.com/…",
--      "tiktok":    "https://www.tiktok.com/@…",
--      "site":      "https://…"
--    }
--
--  Un objet JSON plutôt que six colonnes : les réseaux vont et viennent, et
--  ajouter une colonne à chaque nouveau réseau à la mode ferait une migration
--  pour rien. Aucune requête ne filtre là-dessus — on ne fait que lire.
--
--  ⚠️ Un objet VIDE `{}` n'est pas la même chose que `null` :
--    · `null` = on n'a pas encore cherché ;
--    · `{}`   = on a cherché et Wikidata ne connaît aucun compte.
--  Sans cette distinction, le script d'enrichissement repasserait indéfiniment
--  sur les mêmes fiches sans résultat.
--
--  À exécuter dans Supabase → SQL Editor, PUIS lancer :
--    node scripts/enrichir-reseaux-stars.cjs
-- ============================================================================

alter table public.stars_reclamees
  add column if not exists reseaux jsonb;

comment on column public.stars_reclamees.reseaux is
  'Comptes officiels connus (Wikidata) : facebook, instagram, youtube, x, tiktok, site. '
  'null = jamais cherché ; {} = cherché, aucun compte connu.';

-- ---------------------------------------------------------------------------
--  Le nombre de fans par fiche — « undefined fan la réclame »
-- ---------------------------------------------------------------------------
--  Le même lot de travail : l'écran « Mes réclamations » affichait
--  « undefined fan la réclame » et une pastille vide. L'API renvoyait le nom
--  et le slug, jamais le compteur — or c'est le compteur qui donne envie
--  d'interpeller la personnalité (« nous sommes déjà 342 »).
--
--  Compter côté serveur en rapatriant les réclamations aurait plafonné à mille
--  lignes sans le dire : une star à trois mille fans en aurait affiché mille.
--  Le comptage se fait donc en base, en une requête pour toutes les fiches.

create or replace function public.fans_par_star(p_ids uuid[])
returns table (star_id uuid, fans bigint)
language sql
stable
security definer
set search_path = public
as $$
  select r.star_id, count(*)::bigint
    from public.reclamations r
   where r.star_id = any(p_ids)
   group by r.star_id;
$$;

-- Le même public que `dossier_audience` : ce sont des chiffres agrégés, déjà
-- affichés par le classement public. Aucun nom de fan n'en sort.
grant execute on function public.fans_par_star(uuid[]) to anon, authenticated;

-- ---------------------------------------------------------------------------
--  Vérification — à passer après le script d'enrichissement
-- ---------------------------------------------------------------------------
--  1. Combien de fiches ont au moins un réseau :
--       select count(*) from stars_reclamees where reseaux is not null and reseaux <> '{}'::jsonb;
--  2. Le détail d'une fiche connue :
--       select nom_affiche, reseaux from stars_reclamees where slug = 'zinedine-zidane';
-- ============================================================================
