-- LANGUES PARLÉES PAR LA PERSONNALITÉ
--
-- Pourquoi : un fan qui réserve un appel vidéo en tête-à-tête doit savoir s'il
-- pourra se comprendre avec la personnalité. Sans cette information, il paie un
-- créneau en espérant que ça se passe bien — et une visio où personne ne se
-- comprend finit en litige, remboursement et mauvaise note.
--
-- Format : tableau d'objets [{ "code": "fr", "level": 5 }, ...]
--   code  : code de langue de l'app (fr, en, es, de, pt, it, ar, zh, ja, ru,
--           hi, bn, id, ur, ms)
--   level : 1 (notions) à 5 (langue maternelle)
--
-- Un jsonb plutôt qu'une table dédiée : la liste est courte, toujours lue en
-- entier avec le profil, et jamais interrogée séparément.
--
-- À exécuter dans Supabase → SQL Editor.

ALTER TABLE public.celebrity_profiles
  ADD COLUMN IF NOT EXISTS spoken_languages jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Garde-fou : on n'accepte qu'un TABLEAU. Une valeur mal formée rendrait la
-- fiche publique impossible à afficher pour tous les fans.
ALTER TABLE public.celebrity_profiles
  DROP CONSTRAINT IF EXISTS celebrity_profiles_spoken_languages_is_array;
ALTER TABLE public.celebrity_profiles
  ADD CONSTRAINT celebrity_profiles_spoken_languages_is_array
  CHECK (jsonb_typeof(spoken_languages) = 'array');
