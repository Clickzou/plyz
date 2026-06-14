-- Table des demandes de vérification "personnalité publique"
-- (sportif, acteur, chanteur, artiste...).
-- À exécuter dans Supabase → SQL Editor.

CREATE TABLE IF NOT EXISTS public.celebrity_verification_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  display_name text NOT NULL,
  category text NOT NULL,                 -- athlete | actor | singer | artist | other
  proof_links jsonb DEFAULT '{}'::jsonb,  -- { wikipedia, website, ... }
  additional_info text,
  status text NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  admin_notes text,
  created_at timestamptz DEFAULT now(),
  reviewed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_celebrity_verif_user
  ON public.celebrity_verification_requests (user_id);
