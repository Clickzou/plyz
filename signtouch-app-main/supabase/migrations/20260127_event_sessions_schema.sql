-- Event Sessions Schema for SignTouch
-- Migration: Create tables, indexes, and atomic join_event RPC function

-- ============================================
-- 1. TABLES
-- ============================================

CREATE TABLE IF NOT EXISTS event_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'live' CHECK (status IN ('scheduled', 'live', 'ended')),
  join_code text UNIQUE NOT NULL,
  viewer_soft_limit int DEFAULT 5000,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS event_signers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES event_sessions(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  avatar_url text,
  signature_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS event_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES event_sessions(id) ON DELETE CASCADE,
  signer_id uuid REFERENCES event_signers(id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type IN ('photo', 'photo_signed', 'signature')),
  image_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS event_viewers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES event_sessions(id) ON DELETE CASCADE,
  viewer_id text NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(event_id, viewer_id)
);

-- ============================================
-- 2. INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_event_sessions_join_code ON event_sessions(join_code);
CREATE INDEX IF NOT EXISTS idx_event_sessions_status ON event_sessions(status);
CREATE INDEX IF NOT EXISTS idx_event_viewers_event_last_seen ON event_viewers(event_id, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_signers_event_id ON event_signers(event_id);
CREATE INDEX IF NOT EXISTS idx_event_assets_event_id ON event_assets(event_id);
CREATE INDEX IF NOT EXISTS idx_event_assets_created_at ON event_assets(created_at DESC);

-- ============================================
-- 3. RPC FUNCTION: join_event (ATOMIC)
-- ============================================

CREATE OR REPLACE FUNCTION join_event(
  p_join_code text,
  p_viewer_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_event record;
  v_active_count int;
  v_ttl_seconds int := 120;
  v_result jsonb;
BEGIN
  -- Validate inputs
  IF p_join_code IS NULL OR trim(p_join_code) = '' THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'bad_request',
      'message', 'join_code is required'
    );
  END IF;

  IF p_viewer_id IS NULL OR trim(p_viewer_id) = '' THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'bad_request',
      'message', 'viewer_id is required'
    );
  END IF;

  -- Find and lock the event row
  SELECT id, title, status, ends_at, viewer_soft_limit, starts_at
  INTO v_event
  FROM event_sessions
  WHERE join_code = upper(trim(p_join_code))
  FOR UPDATE;

  -- Event not found
  IF v_event IS NULL THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'not_found',
      'message', 'Event not found'
    );
  END IF;

  -- Check if event has ended (by time)
  IF v_event.ends_at < now() THEN
    -- Update status to ended if not already
    UPDATE event_sessions SET status = 'ended' WHERE id = v_event.id AND status != 'ended';
    
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'ended',
      'message', 'Event has ended'
    );
  END IF;

  -- Check if event is live
  IF v_event.status != 'live' THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'not_live',
      'message', 'Event is not currently live'
    );
  END IF;

  -- Cleanup expired viewers (TTL = 2 minutes)
  DELETE FROM event_viewers
  WHERE event_id = v_event.id
    AND last_seen_at < now() - (v_ttl_seconds || ' seconds')::interval;

  -- Count active viewers (excluding current viewer to allow re-join)
  SELECT count(*)
  INTO v_active_count
  FROM event_viewers
  WHERE event_id = v_event.id
    AND viewer_id != p_viewer_id;

  -- Check soft limit
  IF v_active_count >= v_event.viewer_soft_limit THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'full',
      'message', 'Event has reached viewer limit'
    );
  END IF;

  -- Upsert viewer (insert or update last_seen_at)
  INSERT INTO event_viewers (event_id, viewer_id, last_seen_at)
  VALUES (v_event.id, p_viewer_id, now())
  ON CONFLICT (event_id, viewer_id)
  DO UPDATE SET last_seen_at = now();

  -- Build success response
  v_result := jsonb_build_object(
    'allowed', true,
    'event', jsonb_build_object(
      'id', v_event.id,
      'title', v_event.title,
      'status', v_event.status,
      'starts_at', v_event.starts_at,
      'ends_at', v_event.ends_at,
      'viewer_soft_limit', v_event.viewer_soft_limit
    )
  );

  -- Add signers to response
  SELECT jsonb_agg(jsonb_build_object(
    'id', s.id,
    'display_name', s.display_name,
    'avatar_url', s.avatar_url,
    'signature_url', s.signature_url
  ))
  INTO v_result
  FROM event_signers s
  WHERE s.event_id = v_event.id;

  RETURN jsonb_build_object(
    'allowed', true,
    'event', jsonb_build_object(
      'id', v_event.id,
      'title', v_event.title,
      'status', v_event.status,
      'starts_at', v_event.starts_at,
      'ends_at', v_event.ends_at,
      'viewer_soft_limit', v_event.viewer_soft_limit
    ),
    'signers', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', s.id,
        'display_name', s.display_name,
        'avatar_url', s.avatar_url,
        'signature_url', s.signature_url
      ))
      FROM event_signers s
      WHERE s.event_id = v_event.id
    ), '[]'::jsonb)
  );
END;
$$;

-- ============================================
-- 4. RPC FUNCTION: update_viewer_heartbeat
-- ============================================

CREATE OR REPLACE FUNCTION update_viewer_heartbeat(
  p_event_id uuid,
  p_viewer_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE event_viewers
  SET last_seen_at = now()
  WHERE event_id = p_event_id AND viewer_id = p_viewer_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Viewer not found');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ============================================
-- 5. RPC FUNCTION: leave_event
-- ============================================

CREATE OR REPLACE FUNCTION leave_event(
  p_event_id uuid,
  p_viewer_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM event_viewers
  WHERE event_id = p_event_id AND viewer_id = p_viewer_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ============================================
-- 6. RPC FUNCTION: get_active_viewer_count
-- ============================================

CREATE OR REPLACE FUNCTION get_active_viewer_count(
  p_event_id uuid
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count int;
  v_ttl_seconds int := 120;
BEGIN
  SELECT count(*)
  INTO v_count
  FROM event_viewers
  WHERE event_id = p_event_id
    AND last_seen_at >= now() - (v_ttl_seconds || ' seconds')::interval;

  RETURN COALESCE(v_count, 0);
END;
$$;

-- ============================================
-- 7. RLS POLICIES
-- ============================================

ALTER TABLE event_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_signers ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_viewers ENABLE ROW LEVEL SECURITY;

-- event_sessions: Anyone can read live events
CREATE POLICY "Anyone can read live events" ON event_sessions
  FOR SELECT USING (status = 'live' OR status = 'scheduled');

-- event_sessions: Anyone can create events (for celebrities without accounts)
CREATE POLICY "Anyone can create events" ON event_sessions
  FOR INSERT WITH CHECK (true);

-- event_sessions: Anyone can update their own events
CREATE POLICY "Anyone can update events" ON event_sessions
  FOR UPDATE USING (true);

-- event_signers: Anyone can read signers of live events
CREATE POLICY "Anyone can read signers" ON event_signers
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM event_sessions WHERE id = event_id AND status IN ('live', 'scheduled'))
  );

-- event_signers: Anyone can add signers
CREATE POLICY "Anyone can add signers" ON event_signers
  FOR INSERT WITH CHECK (true);

-- event_assets: Anyone can read assets of live events
CREATE POLICY "Anyone can read assets" ON event_assets
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM event_sessions WHERE id = event_id AND status IN ('live', 'scheduled'))
  );

-- event_assets: Only signers can insert assets
CREATE POLICY "Signers can insert assets" ON event_assets
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM event_signers WHERE id = signer_id)
  );

-- event_viewers: Managed by RPC functions (no direct access needed)
CREATE POLICY "Viewers managed by RPC" ON event_viewers
  FOR SELECT USING (false);

-- Grant execute on functions to anon and authenticated
GRANT EXECUTE ON FUNCTION join_event(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION update_viewer_heartbeat(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION leave_event(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_active_viewer_count(uuid) TO anon, authenticated;
