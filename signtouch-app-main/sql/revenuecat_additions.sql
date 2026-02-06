-- =============================================
-- RevenueCat Integration - SQL Additions
-- À exécuter dans Supabase SQL Editor
-- =============================================

ALTER TABLE fan_transactions
  ADD COLUMN IF NOT EXISTS rc_transaction_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS rc_event_id TEXT;

CREATE TABLE IF NOT EXISTS webhook_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id TEXT UNIQUE NOT NULL,
  source TEXT NOT NULL DEFAULT 'revenuecat',
  received_at TIMESTAMPTZ DEFAULT NOW(),
  payload JSONB NOT NULL,
  processed BOOLEAN DEFAULT TRUE
);

ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "webhook_events_service_only" ON webhook_events
  FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_we_event_id ON webhook_events (event_id);
CREATE INDEX IF NOT EXISTS idx_ft_rc_tx ON fan_transactions (rc_transaction_id);
