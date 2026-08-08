-- ============================================================================
--  Parcourir le catalogue par famille de métier
-- ============================================================================
--
--  Sept mille fiches ne se parcourent pas : sans filtre, on ne trouve que ce
--  qu'on sait déjà chercher — et un fan qui ne sait pas encore qui réclamer
--  repart sans rien. Les familles donnent une porte d'entrée à celui qui vient
--  voir « ce qu'il y a ».
--
--  Pourquoi des FAMILLES et non les métiers bruts : le catalogue compte une
--  trentaine de professions. Trente boutons ne se lisent pas ; huit, oui. Et
--  personne ne cherche « judoka » — on cherche « du sport ».
--
--  ⚠️ PRÉREQUIS : `catalogue_stars.sql` et l'import du catalogue.
--  À exécuter dans Supabase → SQL Editor.
-- ============================================================================

create or replace function public.catalogue_par_famille(
  p_famille text,
  p_limite integer default 40
)
returns table (
  slug text,
  nom text,
  fans bigint,
  metier text,
  pays text,
  arrivee boolean,
  celebrity_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  with metiers as (
    select case p_famille
      when 'football'  then array['Footballeur']
      when 'sport'     then array['Joueur de football américain','Joueur de baseball',
                                  'Joueur de hockey sur glace','Joueur de rugby','Basketteur',
                                  'Joueur de tennis','Nageur','Athlète','Cycliste',
                                  'Pilote de course','Judoka','Gymnaste','Boxeur']
      when 'musique'   then array['Chanteur','Musicien']
      when 'cinema'    then array['Acteur','Réalisateur','Producteur de cinéma','Doubleur']
      when 'tv'        then array['Présentateur TV','Humoriste']
      when 'web'       then array['Youtubeur','Influenceur','Streameur','Streameur Twitch',
                                  'Tiktokeur','Vidéaste web']
      when 'politique' then array['Personnalité politique']
      when 'culture'   then array['Écrivain','Artiste']
      else array[]::text[]
    end as liste
  )
  select s.slug,
         s.nom_affiche,
         (select count(*) from public.reclamations r where r.star_id = s.id),
         s.metier,
         s.pays,
         s.arrivee_user_id is not null,
         s.arrivee_user_id
    from public.stars_reclamees s, metiers m
   where s.visible = true
     and coalesce(s.retrait_demande, false) = false
     and (m.liste = array[]::text[] or s.metier = any(m.liste))
   -- Les plus demandées d'abord : le catalogue doit montrer qu'il vit. À
   -- égalité, l'ordre d'import fait foi — Wikidata les a déjà classées par
   -- notoriété, on ne va pas refaire ce tri moins bien.
   order by (select count(*) from public.reclamations r where r.star_id = s.id) desc,
            s.created_at
   limit greatest(1, least(coalesce(p_limite, 40), 100));
$$;

revoke all on function public.catalogue_par_famille(text, integer) from public;
grant execute on function public.catalogue_par_famille(text, integer) to anon, authenticated;

/** Ce que le catalogue contient réellement, par famille. Sert à n'afficher
 *  que les boutons qui mènent quelque part : proposer « Baseball » sur un
 *  catalogue qui n'en compte aucun ferait douter de tout le reste. */
create or replace function public.catalogue_familles()
returns table (famille text, total bigint)
language sql
stable
security definer
set search_path = public
as $$
  select f.famille, count(s.id)
    from (values
      ('football'), ('sport'), ('musique'), ('cinema'),
      ('tv'), ('web'), ('politique'), ('culture')
    ) as f(famille)
    left join lateral (
      select * from public.catalogue_par_famille(f.famille, 100)
    ) c on true
    left join public.stars_reclamees s on s.slug = c.slug
   group by f.famille
   order by count(s.id) desc;
$$;

revoke all on function public.catalogue_familles() from public;
grant execute on function public.catalogue_familles() to anon, authenticated;

-- ============================================================================
--  Vérification
-- ============================================================================
--   select * from public.catalogue_par_famille('web', 20);
--   select * from public.catalogue_par_famille('football', 10);
--   select * from public.catalogue_familles();
-- ============================================================================
