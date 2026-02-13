const express = require('express');
const cors = require('cors');
const Stripe = require('stripe');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { createClient } = require('@supabase/supabase-js');

const app = express();

let supabaseClient = null;
function getSupabase() {
  if (!supabaseClient) {
    const url = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Missing Supabase credentials');
    supabaseClient = createClient(url, key);
  }
  return supabaseClient;
}

let stripeClient = null;

function getStripeCredentials() {
  const userKey = process.env.STRIPE_TEST_SECRET_KEY || process.env.STRIPE_SECRET_KEY;

  if (!userKey) {
    throw new Error('No Stripe credentials available. Set STRIPE_TEST_SECRET_KEY or STRIPE_SECRET_KEY.');
  }

  const keyPrefix = userKey.substring(0, 8);
  const isTestKey = userKey.startsWith('sk_test_');
  console.log(`[Stripe] Using key: ${keyPrefix}... (test mode: ${isTestKey})`);

  return { secretKey: userKey };
}

async function getStripe() {
  if (!stripeClient) {
    const { secretKey } = getStripeCredentials();
    stripeClient = new Stripe(secretKey);
  }
  return stripeClient;
}

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
}));

app.get('/api/ping', (req, res) => res.status(200).send('ok'));

app.get('/api/stripe-webhook', (req, res) => res.status(200).send('webhook route exists'));

app.post('/api/stripe-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    const stripe = await getStripe();
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('❌ Webhook signature invalide :', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log('✅ Webhook Stripe sécurisé reçu :', event.type);

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const { session_id, fan_id, celebrity_id, price_cents, signtouch_fee_cents } = session.metadata || {};
      console.log('[Webhook] ✅ checkout.session.completed');
      console.log('[Webhook]   Session live:', session_id);
      console.log('[Webhook]   Fan:', fan_id, '| Célébrité:', celebrity_id);
      console.log('[Webhook]   Montant:', price_cents, 'cents | Commission SignTouch:', signtouch_fee_cents, 'cents');
      console.log('[Webhook]   Payment status:', session.payment_status);
      console.log('[Webhook]   Stripe Checkout ID:', session.id);
      break;
    }

    case 'payment_intent.succeeded': {
      const paymentIntent = event.data.object;
      console.log('[Webhook] ✅ payment_intent.succeeded');
      console.log('[Webhook]   PaymentIntent ID:', paymentIntent.id);
      console.log('[Webhook]   Montant:', paymentIntent.amount, paymentIntent.currency);
      console.log('[Webhook]   Destination:', paymentIntent.transfer_data?.destination || 'N/A');
      if (paymentIntent.application_fee_amount) {
        console.log('[Webhook]   Commission SignTouch:', paymentIntent.application_fee_amount, 'cents');
      }
      break;
    }

    case 'account.updated': {
      const account = event.data.object;
      console.log('[Webhook] 📋 account.updated:', account.id);
      console.log('[Webhook]   charges_enabled:', account.charges_enabled);
      console.log('[Webhook]   payouts_enabled:', account.payouts_enabled);
      console.log('[Webhook]   details_submitted:', account.details_submitted);
      break;
    }

    default:
      console.log('[Webhook] Event non géré:', event.type);
  }

  res.status(200).json({ received: true });
});

app.use(express.json());

app.get('/api/health', async (req, res) => {
  try {
    await getStripe();
    res.json({ status: 'ok', stripe: true });
  } catch (e) {
    res.json({ status: 'ok', stripe: false, error: e.message });
  }
});

app.post('/api/create-session', async (req, res) => {
  try {
    const supabase = getSupabase();
    const {
      celebrity_id,
      celebrity_name,
      duration_minutes,
      duration_per_fan_minutes = 5,
      max_slots,
      price_cents = 0,
      cover_photo_url = null,
      celebrity_stripe_account_id = null,
      scheduled_at = null
    } = req.body;

    if (!celebrity_id || !celebrity_name || !duration_minutes || !max_slots) {
      return res.status(400).json({ error: 'Missing required fields: celebrity_id, celebrity_name, duration_minutes, max_slots' });
    }

    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    const durationPerFanValue = Number(duration_per_fan_minutes);
    const durationPerFanInt = durationPerFanValue < 1 
      ? Math.max(1, Math.round(durationPerFanValue * 60))
      : Math.round(durationPerFanValue);

    const insertData = {
      code,
      celebrity_id,
      celebrity_name,
      duration_minutes,
      duration_per_fan_minutes: durationPerFanValue < 1 ? 1 : durationPerFanInt,
      max_slots,
      price_cents,
      status: scheduled_at ? 'scheduled' : 'waiting',
      cover_photo_url,
    };
    if (celebrity_stripe_account_id) {
      insertData.celebrity_stripe_account_id = celebrity_stripe_account_id;
    }

    console.log('[create-session] Inserting session with code:', code);

    const { data, error } = await supabase
      .from('live_sessions')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('[create-session] Supabase error:', JSON.stringify(error));
      return res.status(500).json({ error: error.message, details: error });
    }

    console.log('[create-session] Session created successfully:', data.id, data.code);

    res.json({ session: data });
  } catch (e) {
    console.error('[create-session] Exception:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/launch-scheduled-session', async (req, res) => {
  try {
    const supabase = getSupabase();
    const { session_id } = req.body;

    if (!session_id) {
      return res.status(400).json({ error: 'Missing session_id' });
    }

    const { data: currentSession } = await supabase
      .from('live_sessions')
      .select('*')
      .eq('id', session_id)
      .single();

    if (!currentSession) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (currentSession.status === 'waiting' || currentSession.status === 'active') {
      console.log('[launch-session] Session already launched:', session_id);
      return res.json({ session: currentSession });
    }

    const { data, error } = await supabase
      .from('live_sessions')
      .update({ status: 'waiting' })
      .eq('id', session_id)
      .select()
      .single();

    if (error) {
      console.error('[launch-session] Error:', error.message);
      return res.status(500).json({ error: error.message });
    }

    const { error: eventError } = await supabase
      .from('event_sessions')
      .update({ status: 'live' })
      .eq('live_session_id', session_id);

    if (eventError) {
      console.warn('[launch-session] Event status update warning:', eventError.message);
    }

    console.log('[launch-session] Session launched:', data.id);
    res.json({ session: data });
  } catch (e) {
    console.error('[launch-session] Exception:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/create-connect-account', async (req, res) => {
  try {
    const stripe = await getStripe();
    const { celebrityName, celebrityEmail, celebrityId } = req.body;

    const accountParams = {
      type: 'express',
      country: 'FR',
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      business_type: 'individual',
      metadata: {
        celebrity_id: celebrityId || '',
        celebrity_name: celebrityName || '',
        platform: 'signtouch',
      },
    };

    if (celebrityEmail) {
      accountParams.email = celebrityEmail;
    }

    const account = await stripe.accounts.create(accountParams);

    console.log('[Connect] Account created:', account.id, 'for:', celebrityEmail || '(existing account)');

    res.json({ accountId: account.id });
  } catch (error) {
    console.error('[Connect] Error creating account:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/create-account-link', async (req, res) => {
  try {
    const stripe = await getStripe();
    const { accountId, returnUrl, refreshUrl } = req.body;

    if (!accountId) {
      return res.status(400).json({ error: 'Account ID is required' });
    }

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl || returnUrl || 'https://signtouch.app/stripe-refresh',
      return_url: returnUrl || 'https://signtouch.app/stripe-return',
      type: 'account_onboarding',
    });

    console.log('[Connect] Account link created for:', accountId);

    res.json({ url: accountLink.url });
  } catch (error) {
    console.error('[Connect] Error creating account link:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/connect-account-status', async (req, res) => {
  try {
    const stripe = await getStripe();
    const { account_id } = req.query;

    if (!account_id) {
      return res.status(400).json({ error: 'Account ID is required' });
    }

    const account = await stripe.accounts.retrieve(account_id);

    const fullyActive = account.charges_enabled && account.payouts_enabled;
    const canAcceptPayments = fullyActive || account.details_submitted;

    res.json({
      id: account.id,
      charges_enabled: account.charges_enabled,
      payouts_enabled: account.payouts_enabled,
      details_submitted: account.details_submitted,
      onboarding_complete: canAcceptPayments,
      fully_active: fullyActive,
    });
  } catch (error) {
    console.error('[Connect] Error checking account status:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/create-checkout-session', async (req, res) => {
  try {
    const stripe = await getStripe();
    const {
      sessionId,
      celebrityId,
      celebrityName,
      fanId,
      priceCents,
      currency = 'eur',
      successUrl,
      cancelUrl,
      celebrityStripeAccountId,
    } = req.body;

    if (!priceCents || priceCents < 200) {
      return res.status(400).json({ error: 'Minimum price is 2€ (200 cents)' });
    }

    if (!sessionId || !celebrityId) {
      return res.status(400).json({ error: 'Missing session or celebrity ID' });
    }

    if (!celebrityStripeAccountId) {
      return res.status(400).json({ error: 'Celebrity Stripe account is required for paid sessions' });
    }

    const account = await stripe.accounts.retrieve(celebrityStripeAccountId);
    const stripeKey = process.env.STRIPE_TEST_SECRET_KEY || process.env.STRIPE_SECRET_KEY || '';
    const isTestMode = stripeKey.startsWith('sk_test_');

    if (!account.charges_enabled) {
      if (isTestMode) {
        console.warn('[Checkout] WARNING: charges_enabled=false for', celebrityStripeAccountId, '- proceeding in TEST mode');
      } else {
        console.error('[Checkout] Blocked: charges_enabled=false for', celebrityStripeAccountId);
        return res.status(403).json({
          error: 'Celebrity account cannot accept payments yet. Onboarding must be completed.',
          code: 'CHARGES_NOT_ENABLED',
        });
      }
    }

    if (!account.payouts_enabled && !isTestMode) {
      console.error('[Checkout] Blocked: payouts_enabled=false for', celebrityStripeAccountId);
      return res.status(403).json({
        error: 'Celebrity account cannot receive payouts yet. Onboarding must be completed.',
        code: 'PAYOUTS_NOT_ENABLED',
      });
    }

    const signTouchFeeCents = Math.round(priceCents * 0.15);

    const canTransfer = account.charges_enabled && (account.capabilities?.transfers === 'active' || account.capabilities?.legacy_payments === 'active');

    const sessionParams = {
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: currency,
            product_data: {
              name: `Session Live avec ${celebrityName || 'Célébrité'}`,
              description: `Signature personnalisée en direct`,
            },
            unit_amount: priceCents,
          },
          quantity: 1,
        },
      ],
      metadata: {
        session_id: sessionId,
        fan_id: fanId || 'anonymous',
        celebrity_id: celebrityId,
        price_cents: String(priceCents),
        signtouch_fee_cents: String(signTouchFeeCents),
      },
      payment_intent_data: canTransfer ? {
        capture_method: 'manual',
        application_fee_amount: signTouchFeeCents,
        transfer_data: {
          destination: celebrityStripeAccountId,
        },
      } : {
        capture_method: 'manual',
      },
      success_url: successUrl || `${req.headers.origin || 'https://signtouch.app'}/payment-success?checkout_session_id={CHECKOUT_SESSION_ID}&live_session_id=${sessionId}&celebrity_id=${celebrityId}`,
      cancel_url: cancelUrl || `${req.headers.origin || 'https://signtouch.app'}/payment-cancel`,
    };

    if (!canTransfer && isTestMode) {
      console.warn('[Checkout] WARNING: Account', celebrityStripeAccountId, 'cannot receive transfers - creating session WITHOUT transfer_data (TEST MODE)');
    }

    const checkoutSession = await stripe.checkout.sessions.create(sessionParams);

    console.log('[Checkout] Session created:', checkoutSession.id, 'for live session:', sessionId, '| Fee:', signTouchFeeCents, 'cents | Destination:', celebrityStripeAccountId);

    res.json({
      sessionId: checkoutSession.id,
      url: checkoutSession.url,
    });
  } catch (error) {
    console.error('[Checkout] Error creating session:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/verify-payment', async (req, res) => {
  try {
    const stripe = await getStripe();
    const { checkout_session_id } = req.query;

    if (!checkout_session_id) {
      return res.status(400).json({ error: 'Missing checkout_session_id' });
    }

    const session = await stripe.checkout.sessions.retrieve(checkout_session_id);

    let paymentIntentStatus = null;
    let authorized = false;
    if (session.payment_intent) {
      const pi = await stripe.paymentIntents.retrieve(session.payment_intent);
      paymentIntentStatus = pi.status;
      authorized = pi.status === 'requires_capture';
    }

    res.json({
      paid: session.payment_status === 'paid',
      authorized: authorized,
      status: session.payment_status,
      payment_intent_status: paymentIntentStatus,
      payment_intent_id: session.payment_intent,
      metadata: session.metadata,
    });
  } catch (error) {
    console.error('[Verify] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/capture-payment', async (req, res) => {
  try {
    const stripe = await getStripe();
    const { checkout_session_id } = req.body;

    if (!checkout_session_id) {
      return res.status(400).json({ error: 'Missing checkout_session_id' });
    }

    const session = await stripe.checkout.sessions.retrieve(checkout_session_id);
    const paymentIntentId = session.payment_intent;

    if (!paymentIntentId) {
      return res.status(400).json({ error: 'No payment intent found for this session' });
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status === 'succeeded') {
      console.log('[Capture] Payment already captured:', paymentIntentId);
      return res.json({ captured: true, already_captured: true, paymentIntentId });
    }

    if (paymentIntent.status !== 'requires_capture') {
      console.error('[Capture] Cannot capture - status:', paymentIntent.status);
      return res.status(400).json({ error: `Cannot capture payment in status: ${paymentIntent.status}` });
    }

    const captured = await stripe.paymentIntents.capture(paymentIntentId);

    console.log('[Capture] Payment captured:', paymentIntentId, '| Amount:', captured.amount, captured.currency);

    res.json({
      captured: true,
      paymentIntentId: captured.id,
      amount: captured.amount,
      currency: captured.currency,
    });
  } catch (error) {
    console.error('[Capture] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/cancel-payment', async (req, res) => {
  try {
    const stripe = await getStripe();
    const { checkout_session_id } = req.body;

    if (!checkout_session_id) {
      return res.status(400).json({ error: 'Missing checkout_session_id' });
    }

    const session = await stripe.checkout.sessions.retrieve(checkout_session_id);
    const paymentIntentId = session.payment_intent;

    if (!paymentIntentId) {
      return res.status(400).json({ error: 'No payment intent found for this session' });
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status === 'succeeded') {
      console.log('[Cancel] Payment already captured, cannot cancel:', paymentIntentId);
      return res.status(400).json({ error: 'Payment already captured, cannot cancel' });
    }

    if (paymentIntent.status === 'canceled') {
      console.log('[Cancel] Payment already canceled:', paymentIntentId);
      return res.json({ canceled: true, already_canceled: true });
    }

    const canceled = await stripe.paymentIntents.cancel(paymentIntentId);

    console.log('[Cancel] Payment canceled:', paymentIntentId);

    res.json({ canceled: true, paymentIntentId: canceled.id });
  } catch (error) {
    console.error('[Cancel] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/session-earnings', async (req, res) => {
  try {
    const stripe = await getStripe();
    const supabase = getSupabase();
    const { session_id } = req.query;

    if (!session_id) {
      return res.status(400).json({ error: 'Missing session_id' });
    }

    const { data: session } = await supabase
      .from('live_sessions')
      .select('celebrity_id, price_cents')
      .eq('id', session_id)
      .single();

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const { data: capturedEntries } = await supabase
      .from('session_queue')
      .select('id')
      .eq('session_id', session_id)
      .eq('status', 'completed')
      .eq('payment_captured', true);

    const completedCount = (capturedEntries || []).length;

    let totalCapturedCents = 0;
    if (session.price_cents > 0 && completedCount > 0) {
      const signTouchFee = Math.round(session.price_cents * 0.15);
      const celebrityPerFan = session.price_cents - signTouchFee;
      totalCapturedCents = celebrityPerFan * completedCount;
    }

    res.json({
      session_id,
      total_captured_cents: totalCapturedCents,
      captured_count: completedCount,
    });
  } catch (error) {
    console.error('[SessionEarnings] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/celebrity-earnings', async (req, res) => {
  try {
    const stripe = await getStripe();
    const supabase = getSupabase();
    const { celebrity_id } = req.query;

    if (!celebrity_id) {
      return res.status(400).json({ error: 'Missing celebrity_id' });
    }

    const { data: sessions, error: sessionsError } = await supabase
      .from('live_sessions')
      .select('*')
      .eq('celebrity_id', celebrity_id)
      .order('created_at', { ascending: false });

    if (sessionsError) {
      console.error('[CelebrityEarnings] Supabase error:', sessionsError);
      return res.status(500).json({ error: sessionsError.message });
    }

    const sessionStats = [];
    let totalEarningsCents = 0;
    let totalFans = 0;

    for (const session of (sessions || [])) {
      const { data: queueEntries } = await supabase
        .from('session_queue')
        .select('id, status, payment_captured, fan_name, created_at, called_at')
        .eq('session_id', session.id);

      const completedFans = (queueEntries || []).filter(
        e => e.status === 'completed' && e.payment_captured === true
      ).length;

      const allFans = (queueEntries || []).length;
      
      let sessionEarningsCents = 0;
      if (session.price_cents > 0 && completedFans > 0) {
        const signTouchFee = Math.round(session.price_cents * 0.15);
        const celebrityPerFan = session.price_cents - signTouchFee;
        sessionEarningsCents = celebrityPerFan * completedFans;
      }

      totalEarningsCents += sessionEarningsCents;
      totalFans += completedFans;

      let durationMinutes = 0;
      if (session.started_at && session.ends_at) {
        const start = new Date(session.started_at).getTime();
        const end = new Date(session.ends_at).getTime();
        durationMinutes = Math.round((end - start) / 60000);
      } else if (session.started_at) {
        const start = new Date(session.started_at).getTime();
        durationMinutes = Math.round((Date.now() - start) / 60000);
      }

      sessionStats.push({
        id: session.id,
        code: session.code,
        celebrity_name: session.celebrity_name,
        status: session.status,
        price_cents: session.price_cents,
        currency: session.currency || 'EUR',
        max_slots: session.max_slots,
        total_fans: allFans,
        completed_fans: completedFans,
        duration_minutes: durationMinutes,
        duration_per_fan_minutes: session.duration_per_fan_minutes,
        session_earnings_cents: sessionEarningsCents,
        created_at: session.created_at,
        started_at: session.started_at,
        ended_at: session.ends_at,
      });
    }

    const estimatedPayoutDate = new Date();
    estimatedPayoutDate.setDate(estimatedPayoutDate.getDate() + 7);
    const nextBusinessDay = estimatedPayoutDate;
    while (nextBusinessDay.getDay() === 0 || nextBusinessDay.getDay() === 6) {
      nextBusinessDay.setDate(nextBusinessDay.getDate() + 1);
    }

    res.json({
      celebrity_id,
      total_earnings_cents: totalEarningsCents,
      total_fans: totalFans,
      total_sessions: (sessions || []).length,
      estimated_payout_date: nextBusinessDay.toISOString().split('T')[0],
      sessions: sessionStats,
    });
  } catch (error) {
    console.error('[CelebrityEarnings] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/validate-promo-code', async (req, res) => {
  try {
    const supabase = getSupabase();
    const { code, session_id } = req.body;

    if (!code || !session_id) {
      return res.status(400).json({ error: 'Missing code or session_id' });
    }

    const upperCode = code.trim().toUpperCase();

    const { data: promos, error } = await supabase
      .from('promo_code_live_video')
      .select('*')
      .eq('code', upperCode)
      .eq('is_active', true);

    if (error) {
      console.error('[PromoCode] Supabase error:', error.message);
      return res.status(500).json({ error: error.message });
    }

    const promo = (promos || []).find(p =>
      p.session_id === session_id || p.session_id === null
    );

    if (!promo) {
      return res.json({ valid: false, reason: 'invalid_code' });
    }

    if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
      return res.json({ valid: false, reason: 'expired' });
    }

    if (promo.max_uses !== null && promo.used_count >= promo.max_uses) {
      return res.json({ valid: false, reason: 'max_uses_reached' });
    }

    return res.json({
      valid: true,
      promo_id: promo.id,
      discount_percent: promo.discount_percent,
    });
  } catch (error) {
    console.error('[PromoCode] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/use-promo-code', async (req, res) => {
  try {
    const supabase = getSupabase();
    const { promo_id } = req.body;

    if (!promo_id) {
      return res.status(400).json({ error: 'Missing promo_id' });
    }

    const { data: promo } = await supabase
      .from('promo_code_live_video')
      .select('used_count, max_uses, is_active')
      .eq('id', promo_id)
      .single();

    if (!promo || !promo.is_active) {
      return res.status(400).json({ error: 'Promo code not found or inactive' });
    }

    if (promo.max_uses !== null && promo.used_count >= promo.max_uses) {
      return res.status(400).json({ error: 'Promo code usage limit reached' });
    }

    const newCount = (promo.used_count || 0) + 1;

    const query = supabase
      .from('promo_code_live_video')
      .update({ used_count: newCount })
      .eq('id', promo_id)
      .eq('used_count', promo.used_count);

    const { error, count } = await query;

    if (error) {
      console.error('[PromoCode] Increment error:', error.message);
      return res.status(500).json({ error: error.message });
    }

    console.log('[PromoCode] Used promo:', promo_id, '| New count:', newCount);
    res.json({ success: true });
  } catch (error) {
    console.error('[PromoCode] Use error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/stripe/express/create-and-onboard', async (req, res) => {
  try {
    const stripe = await getStripe();
    const { celebrityName, celebrityId } = req.body;
    const baseUrl = `https://${req.headers.host || req.hostname}`;

    console.log('[Connect Express] Creating account with key prefix:', (process.env.STRIPE_TEST_SECRET_KEY || process.env.STRIPE_SECRET_KEY || '').substring(0, 12) + '...');

    const account = await stripe.accounts.create({
      type: 'express',
      country: 'FR',
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      business_type: 'individual',
      metadata: {
        celebrity_id: celebrityId || '',
        celebrity_name: celebrityName || '',
        platform: 'signtouch',
      },
    });

    console.log('[Connect Express] Account created:', account.id);

    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      type: 'account_onboarding',
      refresh_url: `${baseUrl}/stripe/refresh`,
      return_url: `${baseUrl}/stripe/return`,
    });

    console.log('[Connect Express] Onboarding link created:', accountLink.url);

    res.json({ account_id: account.id, url: accountLink.url });
  } catch (error) {
    console.error('[Connect Express] Error create-and-onboard:', error.message);
    console.error('[Connect Express] Full error type:', error.type, '| code:', error.code);

    if (error.message.includes('signed up for Connect')) {
      return res.status(403).json({
        error: 'Stripe Connect is not enabled on the platform account. Please enable Stripe Connect at https://dashboard.stripe.com/test/connect/overview',
        code: 'CONNECT_NOT_ENABLED',
        help: 'Go to https://dashboard.stripe.com/test/connect/overview and click "Get started" to enable Connect on your Stripe account.',
      });
    }

    res.status(500).json({ error: error.message });
  }
});

app.get('/api/stripe/express/account-link', async (req, res) => {
  try {
    const stripe = await getStripe();
    const { account_id } = req.query;

    if (!account_id) {
      return res.status(400).json({ error: 'account_id is required' });
    }

    const baseUrl = `https://${req.headers.host || '3aa55d0d-178c-4720-bdee-f8cea294f71b-00-3sqzk84ygwh7z.picard.replit.dev'}`;

    const accountLink = await stripe.accountLinks.create({
      account: account_id,
      type: 'account_onboarding',
      refresh_url: `${baseUrl}/stripe/refresh`,
      return_url: `${baseUrl}/stripe/return`,
    });

    console.log('[Connect Express] Account link created for:', account_id, '→', accountLink.url);

    res.json({ url: accountLink.url });
  } catch (error) {
    console.error('[Connect Express] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/stripe/refresh', (req, res) => {
  res.send('<html><body style="background:#0a1628;color:white;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="text-align:center"><h2>Session expir\u00e9e</h2><p>Veuillez retourner dans l\'app et r\u00e9essayer.</p></div></body></html>');
});

app.get('/stripe/return', (req, res) => {
  const appUrl = `https://${req.headers.host || req.hostname}/create-live-session`;
  res.send(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SignTouch - Inscription terminée</title>
<style>
  body{background:#0a1628;color:white;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
  .container{text-align:center;padding:20px}
  .spinner{width:40px;height:40px;border:4px solid rgba(255,255,255,0.2);border-top:4px solid #4CAF50;border-radius:50%;animation:spin 1s linear infinite;margin:20px auto}
  @keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}
  .btn{display:inline-block;margin-top:20px;padding:14px 28px;background:#4CAF50;color:white;text-decoration:none;border-radius:25px;font-size:16px;font-weight:bold}
</style>
</head><body>
<div class="container">
  <h2>✅ Inscription terminée !</h2>
  <p>Redirection vers SignTouch...</p>
  <div class="spinner"></div>
  <p style="margin-top:30px;font-size:14px;opacity:0.7">Si la redirection ne fonctionne pas :</p>
  <a class="btn" href="${appUrl}">Retourner dans l'app</a>
</div>
<script>setTimeout(function(){window.location.href="${appUrl}";},2000);</script>
</body></html>`);
});

const EXPO_PORT = 19006;
const PORT = 5000;

app.use(
  '/',
  createProxyMiddleware({
    target: `http://127.0.0.1:${EXPO_PORT}`,
    changeOrigin: true,
    ws: true,
    logLevel: 'warn',
    onProxyReq: (proxyReq) => {
      proxyReq.removeHeader('origin');
    },
  })
);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Server] Running on port ${PORT} (API + proxy to Expo on ${EXPO_PORT})`);
  getStripe()
    .then(() => console.log('[Server] Stripe credentials loaded successfully'))
    .catch((err) => console.warn('[Server] Warning: Stripe credentials will be loaded on first request:', err.message));
});
