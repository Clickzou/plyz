-- Ajoute la colonne "bio" (texte de présentation / "À propos" du profil célébrité)
-- à la table user_profiles.
-- À exécuter dans Supabase → SQL Editor.

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS bio text;
