-- =============================================
-- Plyz Payment System - Stratégie B
-- =============================================
-- À exécuter dans Supabase SQL Editor
-- =============================================

-- 0) Nettoyer les anciennes tables simples si elles existent
DROP POLICY IF EXISTS "fan_transactions_all" ON fan_transactions;
DROP POLICY IF EXISTS "celebrity_payouts_all" ON celebrity_payouts;
DROP TABLE IF EXISTS celebrity_payouts CASCADE;
DROP TABLE IF EXISTS fan_transactions CASCADE;

-- 1) Extension
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2) Types ENUM
DO $$ BEGIN
  CREATE TYPE fan_tx_status AS ENUM (
    'created',
    'store_confirmed',
    'refunded',
    'settled',
    'included_in_payout',
    'paid_out'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE settlement_status AS ENUM (
    'imported',
    'applied'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE payout_status AS ENUM (
    'created',
    'sent',
    'paid',
    'failed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3) Fonction updated_at
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- TABLE: fan_transactions
-- =============================================
CREATE TABLE IF NOT EXISTS fan_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT NOT NULL,
  fan_id TEXT NOT NULL,
  fan_name TEXT,
  celebrity_id TEXT NOT NULL,
  celebrity_name TEXT,
  platform TEXT NOT NULL CHECK (platform IN ('apple', 'google')),
  product_id TEXT,
  gross_amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'EUR',
  store_transaction_id TEXT,
  purchase_token TEXT,
  store_order_id TEXT,
  status fan_tx_status NOT NULL DEFAULT 'created',
  store_confirmed_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,
  net_final_cents INTEGER,
  net_currency TEXT,
  settled_at TIMESTAMPTZ,
  celebrity_revshare_bps INTEGER NOT NULL DEFAULT 5200,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ft_apple_tx
  ON fan_transactions (store_transaction_id)
  WHERE platform = 'apple' AND store_transaction_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ft_google_token
  ON fan_transactions (purchase_token)
  WHERE platform = 'google' AND purchase_token IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ft_session_fan
  ON fan_transactions (session_id, fan_id);

CREATE INDEX IF NOT EXISTS idx_ft_celebrity ON fan_transactions (celebrity_id);
CREATE INDEX IF NOT EXISTS idx_ft_status ON fan_transactions (status);
CREATE INDEX IF NOT EXISTS idx_ft_created ON fan_transactions (created_at);

DROP TRIGGER IF EXISTS trg_ft_updated_at ON fan_transactions;
CREATE TRIGGER trg_ft_updated_at
  BEFORE UPDATE ON fan_transactions
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- =============================================
-- TABLE: store_settlements (import rapports Apple/Google)
-- =============================================
CREATE TABLE IF NOT EXISTS store_settlements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  platform TEXT NOT NULL CHECK (platform IN ('apple', 'google')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  report_source TEXT,
  file_name TEXT,
  imported_at TIMESTAMPTZ DEFAULT NOW(),
  status settlement_status NOT NULL DEFAULT 'imported',
  raw_rows JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ss_platform_period
  ON store_settlements (platform, period_start, period_end);

DROP TRIGGER IF EXISTS trg_ss_updated_at ON store_settlements;
CREATE TRIGGER trg_ss_updated_at
  BEFORE UPDATE ON store_settlements
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- =============================================
-- TABLE: celebrity_earnings (ledger net -> part célébrité)
-- =============================================
CREATE TABLE IF NOT EXISTS celebrity_earnings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  celebrity_id TEXT NOT NULL,
  fan_transaction_id UUID NOT NULL UNIQUE REFERENCES fan_transactions(id),
  period_start DATE,
  period_end DATE,
  net_final_cents INTEGER NOT NULL,
  celebrity_share_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'EUR',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ce_celebrity ON celebrity_earnings (celebrity_id);
CREATE INDEX IF NOT EXISTS idx_ce_period ON celebrity_earnings (period_start, period_end);

-- =============================================
-- TABLE: payout_batches
-- =============================================
CREATE TABLE IF NOT EXISTS payout_batches (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  celebrity_id TEXT NOT NULL,
  period_start DATE,
  period_end DATE,
  total_share_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'EUR',
  status payout_status NOT NULL DEFAULT 'created',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  paid_at TIMESTAMPTZ,
  external_payout_ref TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pb_celebrity ON payout_batches (celebrity_id);
CREATE INDEX IF NOT EXISTS idx_pb_status ON payout_batches (status);

DROP TRIGGER IF EXISTS trg_pb_updated_at ON payout_batches;
CREATE TRIGGER trg_pb_updated_at
  BEFORE UPDATE ON payout_batches
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- =============================================
-- TABLE: payout_batch_items
-- =============================================
CREATE TABLE IF NOT EXISTS payout_batch_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  payout_batch_id UUID NOT NULL REFERENCES payout_batches(id),
  fan_transaction_id UUID NOT NULL REFERENCES fan_transactions(id),
  celebrity_share_cents INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(payout_batch_id, fan_transaction_id)
);

CREATE INDEX IF NOT EXISTS idx_pbi_batch ON payout_batch_items (payout_batch_id);

-- =============================================
-- FUNCTION: apply_settlement
-- Import des rapports financiers Apple/Google
-- =============================================
CREATE OR REPLACE FUNCTION public.apply_settlement(
  p_platform TEXT,
  p_period_start DATE,
  p_period_end DATE,
  p_mapping JSONB
)
RETURNS UUID AS $$
DECLARE
  v_settlement_id UUID;
  v_item JSONB;
  v_tx_id TEXT;
  v_net INTEGER;
  v_currency TEXT;
BEGIN
  INSERT INTO store_settlements (platform, period_start, period_end, status, raw_rows)
  VALUES (p_platform, p_period_start, p_period_end, 'applied', p_mapping)
  RETURNING id INTO v_settlement_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_mapping)
  LOOP
    v_net := (v_item->>'net_final_cents')::INTEGER;
    v_currency := COALESCE(v_item->>'currency', 'EUR');

    IF p_platform = 'apple' THEN
      v_tx_id := v_item->>'store_transaction_id';
      UPDATE fan_transactions
      SET net_final_cents = v_net,
          net_currency = v_currency,
          settled_at = NOW(),
          status = 'settled'
      WHERE store_transaction_id = v_tx_id
        AND platform = 'apple'
        AND status = 'store_confirmed';
    ELSIF p_platform = 'google' THEN
      v_tx_id := v_item->>'purchase_token';
      UPDATE fan_transactions
      SET net_final_cents = v_net,
          net_currency = v_currency,
          settled_at = NOW(),
          status = 'settled'
      WHERE purchase_token = v_tx_id
        AND platform = 'google'
        AND status = 'store_confirmed';
    END IF;
  END LOOP;

  RETURN v_settlement_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- FUNCTION: compute_celebrity_earnings
-- Calcule la part célébrité pour une période
-- =============================================
CREATE OR REPLACE FUNCTION public.compute_celebrity_earnings(
  p_period_start DATE,
  p_period_end DATE
)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER := 0;
  v_tx RECORD;
  v_share INTEGER;
BEGIN
  FOR v_tx IN
    SELECT id, celebrity_id, net_final_cents, celebrity_revshare_bps, net_currency
    FROM fan_transactions
    WHERE status = 'settled'
      AND settled_at >= p_period_start
      AND settled_at < p_period_end + INTERVAL '1 day'
      AND id NOT IN (SELECT fan_transaction_id FROM celebrity_earnings)
  LOOP
    v_share := ROUND(v_tx.net_final_cents * v_tx.celebrity_revshare_bps / 10000.0);

    INSERT INTO celebrity_earnings (
      celebrity_id, fan_transaction_id,
      period_start, period_end,
      net_final_cents, celebrity_share_cents, currency
    ) VALUES (
      v_tx.celebrity_id, v_tx.id,
      p_period_start, p_period_end,
      v_tx.net_final_cents, v_share,
      COALESCE(v_tx.net_currency, 'EUR')
    )
    ON CONFLICT (fan_transaction_id) DO NOTHING;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- FUNCTION: create_payout_batch
-- Prépare un batch de paiement pour une célébrité
-- =============================================
CREATE OR REPLACE FUNCTION public.create_payout_batch(
  p_celebrity_id TEXT,
  p_period_start DATE,
  p_period_end DATE
)
RETURNS UUID AS $$
DECLARE
  v_batch_id UUID;
  v_total INTEGER := 0;
  v_earning RECORD;
BEGIN
  INSERT INTO payout_batches (celebrity_id, period_start, period_end, total_share_cents, status)
  VALUES (p_celebrity_id, p_period_start, p_period_end, 0, 'created')
  RETURNING id INTO v_batch_id;

  FOR v_earning IN
    SELECT ce.id AS earning_id, ce.fan_transaction_id, ce.celebrity_share_cents
    FROM celebrity_earnings ce
    JOIN fan_transactions ft ON ft.id = ce.fan_transaction_id
    WHERE ce.celebrity_id = p_celebrity_id
      AND ce.period_start >= p_period_start
      AND ce.period_end <= p_period_end
      AND ft.status = 'settled'
  LOOP
    INSERT INTO payout_batch_items (payout_batch_id, fan_transaction_id, celebrity_share_cents)
    VALUES (v_batch_id, v_earning.fan_transaction_id, v_earning.celebrity_share_cents)
    ON CONFLICT (payout_batch_id, fan_transaction_id) DO NOTHING;

    UPDATE fan_transactions
    SET status = 'included_in_payout'
    WHERE id = v_earning.fan_transaction_id
      AND status = 'settled';

    v_total := v_total + v_earning.celebrity_share_cents;
  END LOOP;

  UPDATE payout_batches
  SET total_share_cents = v_total
  WHERE id = v_batch_id;

  RETURN v_batch_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- FUNCTION: mark_payout_paid
-- Marque un batch comme payé
-- =============================================
CREATE OR REPLACE FUNCTION public.mark_payout_paid(
  p_batch_id UUID,
  p_external_ref TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE payout_batches
  SET status = 'paid',
      paid_at = NOW(),
      external_payout_ref = p_external_ref
  WHERE id = p_batch_id
    AND status IN ('created', 'sent');

  UPDATE fan_transactions
  SET status = 'paid_out'
  WHERE id IN (
    SELECT fan_transaction_id FROM payout_batch_items WHERE payout_batch_id = p_batch_id
  )
  AND status = 'included_in_payout';

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- RLS (Row Level Security)
-- =============================================
ALTER TABLE fan_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE celebrity_earnings ENABLE ROW LEVEL SECURITY;
ALTER TABLE payout_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE payout_batch_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fan_transactions_insert" ON fan_transactions
  FOR INSERT WITH CHECK (true);

CREATE POLICY "fan_transactions_select" ON fan_transactions
  FOR SELECT USING (true);

CREATE POLICY "fan_transactions_update" ON fan_transactions
  FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "store_settlements_all" ON store_settlements
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "celebrity_earnings_select" ON celebrity_earnings
  FOR SELECT USING (true);

CREATE POLICY "celebrity_earnings_insert" ON celebrity_earnings
  FOR INSERT WITH CHECK (true);

CREATE POLICY "payout_batches_all" ON payout_batches
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "payout_batch_items_all" ON payout_batch_items
  FOR ALL USING (true) WITH CHECK (true);

-- =============================================
-- VUE: dashboard rapide pour admin
-- =============================================
CREATE OR REPLACE VIEW admin_payment_dashboard AS
SELECT
  celebrity_id,
  celebrity_name,
  COUNT(*) AS total_transactions,
  SUM(gross_amount_cents) AS total_gross_cents,
  SUM(CASE WHEN net_final_cents IS NOT NULL THEN net_final_cents ELSE 0 END) AS total_net_cents,
  COUNT(*) FILTER (WHERE status = 'created') AS pending_count,
  COUNT(*) FILTER (WHERE status = 'store_confirmed') AS confirmed_count,
  COUNT(*) FILTER (WHERE status = 'settled') AS settled_count,
  COUNT(*) FILTER (WHERE status = 'included_in_payout') AS in_payout_count,
  COUNT(*) FILTER (WHERE status = 'paid_out') AS paid_out_count,
  COUNT(*) FILTER (WHERE status = 'refunded') AS refunded_count,
  MAX(created_at) AS last_transaction_at
FROM fan_transactions
GROUP BY celebrity_id, celebrity_name;
