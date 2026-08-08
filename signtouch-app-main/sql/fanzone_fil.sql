-- ============================================================================
--  Le fil d'activité de la Fan zone
-- ============================================================================
--
--  Le trou que ce fichier comble : « Les plus réclamées » a quitté la Fan zone
--  — le classement a sa page dédiée, et le répéter occupait la place de ce que
--  les fans font entre eux. Sauf que rien n'est venu le remplacer : la Fan zone
--  est aujourd'hui plus vide qu'avant.
--
--  Ce qui doit prendre cette place, c'est l'activité des espaces où le fan est
--  DÉJÀ entré : les sujets ouverts, les questions posées, les photos partagées.
--  Un fil qui bouge donne une raison de revenir ; un classement figé, non.
--
--  Pourquoi une fonction plutôt qu'une simple lecture de `fanzone_sujets_public` :
--  cette vue s'exécute avec les droits du lecteur, et ses règles appellent
--  `fz_a_acces` LIGNE PAR LIGNE. Sans filtre de personnalité, la base
--  évaluerait la règle sur tous les sujets de la table avant d'en garder
--  trente. Ici, on part des espaces du fan — quelques dizaines de lignes — et
--  l'on remonte à ses sujets.
--
--  ⚠️ La sécurité n'est pas relâchée pour autant : les deux mêmes portes qu'en
--  RLS sont recopiées dans le `where` (abonné à la personnalité, ou réclamant
--  de la fiche), plus le filtre des blocages. Toute modification des règles
--  d'accès dans `fanzone_groupes.sql` ou `fanzone_stars_absentes.sql` doit être
--  répercutée ICI — sans quoi ce fil deviendrait la porte dérobée de la Fan zone.
--
--  ⚠️ PRÉREQUIS : `fanzone_groupes.sql`, `fanzone_stars_absentes.sql`.
--  À exécuter dans Supabase → SQL Editor.
-- ============================================================================

create or replace function public.fz_fil_activite(p_limite integer default 30)
returns table (
  id            uuid,
  celebrity_id  uuid,
  star_id       uuid,
  type          text,
  titre         text,
  contenu       text,
  media_url     text,
  nb_messages   integer,
  nb_soutiens   integer,
  dernier_le    timestamptz,
  auteur_nom    text,
  auteur_avatar text,
  par_la_star   boolean,
  soutenu       boolean,
  -- De quel espace vient ce sujet. Sans lui, le fil serait une liste de
  -- messages sans contexte : « Il arrive quand ? » ne veut rien dire si l'on
  -- ne sait pas de qui l'on parle.
  espace_nom    text,
  espace_avatar text,
  espace_slug   text
)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.celebrity_id, s.star_id, s.type, s.titre, s.contenu,
         s.media_url, s.nb_messages, s.nb_soutiens, s.dernier_le,
         coalesce(nullif(btrim(pa.display_name), ''), 'Fan') as auteur_nom,
         pa.avatar_url                                       as auteur_avatar,
         (s.celebrity_id is not null and s.auteur_id = s.celebrity_id) as par_la_star,
         exists (
           select 1 from public.fanzone_soutiens f
            where f.sujet_id = s.id and f.fan_id = (select auth.uid())
         ) as soutenu,
         coalesce(nullif(btrim(pc.display_name), ''), sr.nom_affiche) as espace_nom,
         pc.avatar_url as espace_avatar,
         sr.slug       as espace_slug
    from public.fanzone_sujets s
    left join public.profiles         pa on pa.id = s.auteur_id
    left join public.profiles         pc on pc.id = s.celebrity_id
    left join public.stars_reclamees  sr on sr.id = s.star_id
   where s.supprime_le is null
     -- Les mêmes règles que la lecture directe, recopiées à l'identique.
     and not public.blocage_entre(s.auteur_id, (select auth.uid()))
     and (
       (s.celebrity_id is not null and (
          s.celebrity_id = (select auth.uid())
          or exists (
            select 1 from public.abonnements a
             where a.celebrity_id = s.celebrity_id and a.fan_id = (select auth.uid())
          )
       ))
       or (s.star_id is not null and exists (
            select 1 from public.reclamations r
             where r.star_id = s.star_id and r.fan_id = (select auth.uid())
          ))
     )
   -- `dernier_le` et non `created_at` : un sujet ouvert il y a trois semaines
   -- où l'on répond ce matin est vivant, et c'est cela qu'on veut voir remonter.
   order by s.dernier_le desc
   limit least(coalesce(p_limite, 30), 100);
$$;

revoke all on function public.fz_fil_activite(integer) from public;
grant execute on function public.fz_fil_activite(integer) to authenticated;

-- ============================================================================
--  Vérification
-- ============================================================================
--  1. Connecté en fan abonné à une personnalité, le fil doit remonter ses
--     sujets :   select * from public.fz_fil_activite(30);
--  2. Connecté en fan abonné à PERSONNE, il doit être VIDE — et non pas
--     remonter les sujets de tout le monde. C'est le contrôle qui compte.
--  3. Après blocage d'un auteur, ses sujets doivent disparaître du fil.
-- ============================================================================
