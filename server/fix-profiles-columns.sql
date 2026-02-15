-- ============================================================
-- Fix profiles table: Add missing columns
-- Run this in Supabase Dashboard > SQL Editor
-- ============================================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role text DEFAULT 'fan' CHECK (role IN ('fan', 'celebrity', 'admin'));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
