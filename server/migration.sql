-- ============================================================
-- SignTouch Marketplace Migration
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 1) profiles
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  avatar_url text,
  role text DEFAULT 'fan' CHECK (role IN ('fan', 'celebrity', 'admin')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2) celebrity_profiles
CREATE TABLE IF NOT EXISTS celebrity_profiles (
  user_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  stage_name text NOT NULL,
  bio text,
  website text,
  stripe_account_id text,
  stripe_charges_enabled boolean DEFAULT false,
  stripe_payouts_enabled boolean DEFAULT false,
  stripe_verified boolean DEFAULT false,
  official_verified boolean DEFAULT false,
  is_listed boolean DEFAULT true,
  wikidata_id text,
  wikidata_label text,
  wikipedia_url text,
  wikidata_image_url text,
  wikidata_occupations text[],
  wikidata_types text[],
  wikidata_confidence integer DEFAULT 0,
  wikidata_last_sync timestamptz,
  popularity_score integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_celebrity_stage_name_trgm 
  ON celebrity_profiles USING gin (stage_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_celebrity_popularity 
  ON celebrity_profiles(popularity_score DESC);
CREATE INDEX IF NOT EXISTS idx_celebrity_listed 
  ON celebrity_profiles(is_listed) WHERE is_listed = true;

-- 3) celebrity_pricing
CREATE TABLE IF NOT EXISTS celebrity_pricing (
  user_id uuid PRIMARY KEY REFERENCES celebrity_profiles(user_id) ON DELETE CASCADE,
  video_call_price_cents integer DEFAULT 0,
  video_call_unit text DEFAULT 'session' CHECK (video_call_unit IN ('minute', 'session')),
  video_call_duration_minutes integer DEFAULT 15,
  autograph_price_cents integer DEFAULT 0,
  live_dedication_price_cents integer DEFAULT 0,
  currency text DEFAULT 'eur',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 4) booking_requests
CREATE TABLE IF NOT EXISTS booking_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fan_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  celebrity_id uuid REFERENCES celebrity_profiles(user_id) ON DELETE CASCADE,
  status text DEFAULT 'pending_payment' CHECK (status IN ('pending_payment', 'paid', 'confirmed', 'completed', 'cancelled')),
  duration_minutes integer DEFAULT 15,
  price_cents integer NOT NULL,
  currency text DEFAULT 'eur',
  stripe_session_id text,
  stripe_payment_intent_id text,
  scheduled_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_booking_fan ON booking_requests(fan_id);
CREATE INDEX IF NOT EXISTS idx_booking_celebrity ON booking_requests(celebrity_id);
CREATE INDEX IF NOT EXISTS idx_booking_status ON booking_requests(status);

-- 5) autograph_requests
CREATE TABLE IF NOT EXISTS autograph_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fan_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  celebrity_id uuid REFERENCES celebrity_profiles(user_id) ON DELETE CASCADE,
  message text,
  status text DEFAULT 'pending_payment' CHECK (status IN ('pending_payment', 'paid', 'confirmed', 'delivered', 'cancelled')),
  price_cents integer NOT NULL,
  currency text DEFAULT 'eur',
  stripe_session_id text,
  delivery_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_autograph_fan ON autograph_requests(fan_id);
CREATE INDEX IF NOT EXISTS idx_autograph_celebrity ON autograph_requests(celebrity_id);

-- 6) posts
CREATE TABLE IF NOT EXISTS posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  celebrity_id uuid REFERENCES celebrity_profiles(user_id) ON DELETE CASCADE,
  kind text DEFAULT 'post' CHECK (kind IN ('post', 'event')),
  title text,
  body text,
  media_url text,
  event_date timestamptz,
  price_cents integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_posts_celebrity ON posts(celebrity_id);
CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC);

-- 7) wikidata_entities (cache)
CREATE TABLE IF NOT EXISTS wikidata_entities (
  wikidata_id text PRIMARY KEY,
  label text,
  description text,
  image_url text,
  wikipedia_url text,
  occupations text[],
  types text[],
  updated_at timestamptz DEFAULT now()
);

-- 8) reports
CREATE TABLE IF NOT EXISTS reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  celebrity_id uuid REFERENCES celebrity_profiles(user_id) ON DELETE CASCADE,
  reason text NOT NULL,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'dismissed')),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reports_celebrity ON reports(celebrity_id);

-- ============================================================
-- RLS POLICIES
-- ============================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE celebrity_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE celebrity_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE autograph_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE wikidata_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN CREATE POLICY profiles_select ON profiles FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY profiles_insert ON profiles FOR INSERT WITH CHECK (auth.uid() = id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY profiles_update ON profiles FOR UPDATE USING (auth.uid() = id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY celebrity_profiles_select ON celebrity_profiles FOR SELECT USING (is_listed = true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY celebrity_profiles_insert ON celebrity_profiles FOR INSERT WITH CHECK (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY celebrity_profiles_update ON celebrity_profiles FOR UPDATE USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY celebrity_pricing_select ON celebrity_pricing FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY celebrity_pricing_insert ON celebrity_pricing FOR INSERT WITH CHECK (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY celebrity_pricing_update ON celebrity_pricing FOR UPDATE USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY booking_select_fan ON booking_requests FOR SELECT USING (auth.uid() = fan_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY booking_select_celebrity ON booking_requests FOR SELECT USING (auth.uid() = celebrity_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY autograph_select_fan ON autograph_requests FOR SELECT USING (auth.uid() = fan_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY autograph_select_celebrity ON autograph_requests FOR SELECT USING (auth.uid() = celebrity_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY posts_select ON posts FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY posts_insert ON posts FOR INSERT WITH CHECK (auth.uid() = celebrity_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY posts_update ON posts FOR UPDATE USING (auth.uid() = celebrity_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY wikidata_select ON wikidata_entities FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY reports_insert ON reports FOR INSERT WITH CHECK (auth.uid() = reporter_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 9) organization_verification_requests
CREATE TABLE IF NOT EXISTS organization_verification_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  org_name text NOT NULL,
  org_type text NOT NULL CHECK (org_type IN ('sports_club', 'brand', 'association', 'media', 'label', 'agency', 'other')),
  official_website text,
  contact_email text NOT NULL,
  representative_name text NOT NULL,
  representative_role text,
  proof_description text,
  proof_url text,
  social_links jsonb DEFAULT '{}',
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'more_info')),
  admin_notes text,
  reviewed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_org_verif_user ON organization_verification_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_org_verif_status ON organization_verification_requests(status);

ALTER TABLE organization_verification_requests ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN CREATE POLICY org_verif_select ON organization_verification_requests FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY org_verif_insert ON organization_verification_requests FOR INSERT WITH CHECK (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Add account_type column to celebrity_profiles (individual or organization)
ALTER TABLE celebrity_profiles ADD COLUMN IF NOT EXISTS account_type text DEFAULT 'individual' CHECK (account_type IN ('individual', 'organization'));
ALTER TABLE celebrity_profiles ADD COLUMN IF NOT EXISTS org_verified boolean DEFAULT false;

-- Allow service role to bypass RLS for server-side operations
-- (service_role key already bypasses RLS by default in Supabase)
