import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const REVENUECAT_SECRET_API_KEY = Deno.env.get('REVENUECAT_SECRET_API_KEY') || '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function verifyRevenueCatTransaction(
  appUserId: string,
  rcTransactionId: string
): Promise<{ valid: boolean; error?: string }> {
  try {
    const response = await fetch(
      `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`,
      {
        headers: {
          'Authorization': `Bearer ${REVENUECAT_SECRET_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      return { valid: false, error: `RevenueCat API error: ${response.status}` };
    }

    const data = await response.json();
    const nonSubs = data.subscriber?.non_subscriptions || {};

    for (const productId of Object.keys(nonSubs)) {
      for (const purchase of nonSubs[productId]) {
        if (purchase.id === rcTransactionId || purchase.store_transaction_id === rcTransactionId) {
          return { valid: true };
        }
      }
    }

    return { valid: false, error: 'Transaction not found for this user' };
  } catch (error) {
    return { valid: false, error: `Verification failed: ${error.message}` };
  }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const {
      celebrity_id,
      product_id,
      duration_minutes,
      rc_transaction_id,
      platform,
      gross_amount_cents,
      currency = 'EUR',
    } = body;

    if (!celebrity_id || !rc_transaction_id || !platform || !gross_amount_cents) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!['apple', 'google'].includes(platform)) {
      return new Response(
        JSON.stringify({ error: 'Platform must be apple or google' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: existingTx } = await supabase
      .from('fan_transactions')
      .select('id, session_id')
      .eq('rc_transaction_id', rc_transaction_id)
      .maybeSingle();

    if (existingTx) {
      return new Response(
        JSON.stringify({
          session_id: existingTx.session_id,
          transaction_id: existingTx.id,
          idempotent: true,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (REVENUECAT_SECRET_API_KEY) {
      const verification = await verifyRevenueCatTransaction(user.id, rc_transaction_id);
      if (!verification.valid) {
        return new Response(
          JSON.stringify({ error: verification.error || 'Transaction verification failed' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const { data: session, error: sessionError } = await supabase
      .from('live_sessions')
      .insert({
        fan_id: user.id,
        celebrity_id,
        duration_minutes: duration_minutes || 5,
        status: 'ready',
        scheduled_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (sessionError) {
      return new Response(
        JSON.stringify({ error: `Failed to create session: ${sessionError.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: transaction, error: txError } = await supabase
      .from('fan_transactions')
      .insert({
        session_id: session.id,
        fan_id: user.id,
        celebrity_id,
        platform,
        product_id: product_id || null,
        gross_amount_cents,
        currency,
        rc_transaction_id,
        status: 'store_confirmed',
        store_confirmed_at: new Date().toISOString(),
        celebrity_revshare_bps: 5200,
      })
      .select('id')
      .single();

    if (txError) {
      return new Response(
        JSON.stringify({ error: `Failed to create transaction: ${txError.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        session_id: session.id,
        transaction_id: transaction.id,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
