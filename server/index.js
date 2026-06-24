const express = require('express');
const cors = require('cors');
const Stripe = require('stripe');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { createClient } = require('@supabase/supabase-js');
const multer = require('multer');
const path = require('path');
const nsfw = require('nsfwjs');

// nodemailer en require optionnel : si le module n'est pas encore installé
// (npm install pas fait après un pull), le serveur démarre quand même.
let nodemailer = null;
try {
  nodemailer = require('nodemailer');
} catch (err) {
  console.warn('[Mail] nodemailer indisponible (faire npm install) :', err.message);
}

// Transporteur e-mail (SMTP). Configuré via les secrets Replit :
// SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, (optionnel) SMTP_FROM.
let mailTransporter = null;
function getMailTransporter() {
  if (!nodemailer) return null;
  if (mailTransporter) return mailTransporter;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  const port = parseInt(SMTP_PORT || '587', 10);
  mailTransporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465, // 465 = SSL, sinon STARTTLS
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return mailTransporter;
}

const SUPPORT_EMAIL = 'jc@clickzou.fr';

let tf = null;
try {
  tf = require('@tensorflow/tfjs-node');
} catch (err) {
  console.warn('[Moderation] @tensorflow/tfjs-node unavailable, moderation disabled:', err.message);
}
const canModerateImages = !!(tf && tf.node && typeof tf.node.decodeImage === 'function');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

let nsfwModel = null;
async function loadNsfwModel() {
  if (!canModerateImages) {
    return null;
  }

  if (!nsfwModel) {
    try {
      nsfwModel = await nsfw.load();
      console.log('[Moderation] NSFW model loaded successfully');
    } catch (err) {
      console.error('[Moderation] Failed to load NSFW model:', err.message);
    }
  }
  return nsfwModel;
}

async function moderateImage(imageBuffer) {
  if (!canModerateImages) {
    return { safe: true, skipped: true, reason: 'moderation_unavailable' };
  }

  const model = await loadNsfwModel();
  if (!model) {
    console.warn('[Moderation] Model not available, skipping moderation');
    return { safe: true, skipped: true };
  }

  try {
    const imageTensor = tf.node.decodeImage(imageBuffer, 3);
    const predictions = await model.classify(imageTensor);
    imageTensor.dispose();

    const result = {};
    for (const p of predictions) {
      result[p.className] = p.probability;
    }

    const pornScore = result['Porn'] || 0;
    const hentaiScore = result['Hentai'] || 0;
    const sexyScore = result['Sexy'] || 0;

    const isUnsafe = pornScore > 0.3 || hentaiScore > 0.3 || (sexyScore > 0.6 && (pornScore + hentaiScore) > 0.2);

    console.log(`[Moderation] Scores - Porn: ${(pornScore * 100).toFixed(1)}%, Hentai: ${(hentaiScore * 100).toFixed(1)}%, Sexy: ${(sexyScore * 100).toFixed(1)}% → ${isUnsafe ? 'BLOCKED' : 'OK'}`);

    return {
      safe: !isUnsafe,
      scores: result,
      reason: isUnsafe ? 'inappropriate_content' : null,
    };
  } catch (err) {
    console.error('[Moderation] Classification error:', err.message);
    return { safe: true, skipped: true, error: err.message };
  }
}

if (canModerateImages) {
  loadNsfwModel();
}

const app = express();

const MOCK_MODE = process.env.MOCK_MODE === 'true' || process.env.ENABLE_MOCK_CELEBS === 'true';
console.log(`[Server] Mock mode: ${MOCK_MODE ? 'ENABLED' : 'DISABLED'}`);

const SCHEMA_CAPS = { profilesHasDisplayName: false, profilesHasRole: false, liveSessionsHasScheduledAt: false };

async function detectSchema() {
  try {
    const db = getSupabaseAdmin();
    for (const [col, key] of [['display_name', 'profilesHasDisplayName'], ['role', 'profilesHasRole']]) {
      const { error } = await db.from('profiles').select(col).limit(0);
      SCHEMA_CAPS[key] = !error;
    }
    const { error: lse } = await db.from('live_sessions').select('scheduled_at').limit(0);
    SCHEMA_CAPS.liveSessionsHasScheduledAt = !lse;
    console.log('[Schema] Detected capabilities:', JSON.stringify(SCHEMA_CAPS));
    if (!SCHEMA_CAPS.profilesHasDisplayName) {
      console.warn('[Schema] profiles.display_name missing — run server/fix-profiles-columns.sql in Supabase SQL Editor');
    }
  } catch (e) {
    console.warn('[Schema] Detection failed:', e.message);
  }
}

function profilesSelect() {
  if (SCHEMA_CAPS.profilesHasDisplayName) return 'display_name, avatar_url';
  return 'avatar_url';
}

function profilesJoinInner() {
  return `profiles!inner(${profilesSelect()})`;
}

function profilesJoin() {
  return `profiles(${profilesSelect()})`;
}

const MOCK_CELEBS = {
  'mock-001': { stage_name: 'Zinedine Zidane', pricing: { video_call_price_cents: 15000, video_call_unit: 'session', video_call_duration_minutes: 10, autograph_price_cents: 5000, currency: 'eur' } },
  'mock-002': { stage_name: 'Marion Cotillard', pricing: { video_call_price_cents: 20000, video_call_unit: 'session', video_call_duration_minutes: 10, autograph_price_cents: 7500, currency: 'eur' } },
  'mock-003': { stage_name: 'Kylian Mbappé', pricing: { video_call_price_cents: 25000, video_call_unit: 'session', video_call_duration_minutes: 5, autograph_price_cents: 10000, currency: 'eur' } },
  'mock-005': { stage_name: 'Omar Sy', pricing: { video_call_price_cents: 22000, video_call_unit: 'session', video_call_duration_minutes: 10, autograph_price_cents: 8000, currency: 'eur' } },
};

function isMockCelebrity(id) {
  return MOCK_MODE && id && id.startsWith('mock-') && MOCK_CELEBS[id];
}

function isMockId(id) {
  return id && id.startsWith('mock-');
}

async function verifySupabaseJWT(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.replace('Bearer ', '');
  try {
    const supabase = getSupabase();
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return null;
    return user;
  } catch (e) {
    console.error('[Auth] JWT verification failed:', e.message);
    return null;
  }
}

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

let supabaseAdmin = null;
function getSupabaseAdmin() {
  if (!supabaseAdmin) {
    const url = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Missing Supabase service role key');
    supabaseAdmin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  }
  return supabaseAdmin;
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
      const { session_id, fan_id, celebrity_id, price_cents, signtouch_fee_cents, event_session_id, event_type } = session.metadata || {};
      console.log('[Webhook] ✅ checkout.session.completed');
      console.log('[Webhook]   Session live:', session_id);
      console.log('[Webhook]   Fan:', fan_id, '| Célébrité:', celebrity_id);
      console.log('[Webhook]   Montant:', price_cents, 'cents | Commission SignTouch:', signtouch_fee_cents, 'cents');
      console.log('[Webhook]   Payment status:', session.payment_status);
      console.log('[Webhook]   Stripe Checkout ID:', session.id);

      if (event_type === 'dedication' && event_session_id && fan_id && session.payment_status === 'paid') {
        if (!global.eventPaidRecords) global.eventPaidRecords = {};
        const key = `${event_session_id}_${fan_id}`;
        global.eventPaidRecords[key] = { paid: true, checkoutSessionId: session.id, paidAt: new Date().toISOString() };
        console.log('[Webhook] Recorded event paid access via webhook:', key);
      }
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

// Limite relevée pour accepter les photos/avatars envoyés en base64 (sinon
// PayloadTooLargeError : la limite par défaut d'express.json est ~100 ko).
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

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

    // Sécurité : seul un compte vérifié (célébrité, créateur ou club) peut créer une session vidéo.
    // En cas d'erreur de vérification, on ne bloque pas (pour ne pas casser le service).
    try {
      const adminClient = getSupabaseAdmin();
      const verifTables = [
        'celebrity_verification_requests',
        'creator_verification_requests',
        'organization_verification_requests',
      ];
      let isVerified = false;
      for (const table of verifTables) {
        const { data: vr } = await adminClient
          .from(table)
          .select('status')
          .eq('user_id', celebrity_id)
          .eq('status', 'approved')
          .limit(1);
        if (vr && vr.length > 0) { isVerified = true; break; }
      }
      if (!isVerified) {
        return res.status(403).json({
          error: 'not_verified',
          message: 'Votre compte doit être vérifié (célébrité, créateur ou club) pour créer une session.',
        });
      }
    } catch (verifErr) {
      console.error('[create-session] verification check failed (allowing through):', verifErr);
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

    if (scheduled_at && SCHEMA_CAPS.liveSessionsHasScheduledAt) {
      insertData.scheduled_at = scheduled_at;
    } else if (scheduled_at) {
      console.warn('[create-session] scheduled_at requested but column missing, session will be created as waiting');
      insertData.status = 'waiting';
    }

    let { data, error } = await supabase
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

app.post('/api/validate-event-promo-code', async (req, res) => {
  try {
    const supabase = getSupabase();
    const { code, event_session_id } = req.body;

    if (!code || !event_session_id) {
      return res.status(400).json({ error: 'Missing code or event_session_id' });
    }

    const upperCode = code.trim().toUpperCase();

    const { data: promos, error } = await supabase
      .from('promo_code_evenement_qr')
      .select('*')
      .eq('code', upperCode)
      .eq('is_active', true);

    if (error) {
      console.error('[EventPromoCode] Supabase error:', error.message);
      return res.status(500).json({ error: error.message });
    }

    const promo = (promos || []).find(p =>
      p.event_session_id === event_session_id || p.event_session_id === null
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
    console.error('[EventPromoCode] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/use-event-promo-code', async (req, res) => {
  try {
    const supabase = getSupabase();
    const { promo_id } = req.body;

    if (!promo_id) {
      return res.status(400).json({ error: 'Missing promo_id' });
    }

    const { data: promo } = await supabase
      .from('promo_code_evenement_qr')
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

    const { data: updated, error } = await supabase
      .from('promo_code_evenement_qr')
      .update({ used_count: newCount })
      .eq('id', promo_id)
      .eq('used_count', promo.used_count)
      .select('id');

    if (error) {
      console.error('[EventPromoCode] Increment error:', error.message);
      return res.status(500).json({ error: error.message });
    }

    if (!updated || updated.length === 0) {
      return res.status(409).json({ error: 'Concurrent update detected, please retry' });
    }

    console.log('[EventPromoCode] Used promo:', promo_id, '| New count:', newCount);
    res.json({ success: true });
  } catch (error) {
    console.error('[EventPromoCode] Use error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/stripe/express/create-and-onboard', async (req, res) => {
  try {
    const stripe = await getStripe();
    const { celebrityName, celebrityId, returnPath, lang } = req.body;
    const baseUrl = `https://${req.headers.host || req.hostname}`;
    // Destination (écran de retour) + langue, transmises aux pages /stripe/return et /stripe/refresh
    const returnQs = [
      returnPath ? `dest=${encodeURIComponent(returnPath)}` : '',
      lang ? `lang=${encodeURIComponent(lang)}` : '',
    ].filter(Boolean).join('&');
    const refreshQs = lang ? `lang=${encodeURIComponent(lang)}` : '';

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
      refresh_url: `${baseUrl}/stripe/refresh${refreshQs ? '?' + refreshQs : ''}`,
      return_url: `${baseUrl}/stripe/return${returnQs ? '?' + returnQs : ''}`,
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

if (!global.eventPaymentConfigs) global.eventPaymentConfigs = {};

app.post('/api/set-event-payment-config', async (req, res) => {
  try {
    const { eventSessionId, priceCents, celebrityStripeAccountId, celebrityName, creatorId } = req.body;
    if (!eventSessionId) return res.status(400).json({ error: 'Missing eventSessionId' });

    global.eventPaymentConfigs[eventSessionId] = {
      priceCents: priceCents || 0,
      celebrityStripeAccountId: celebrityStripeAccountId || null,
      celebrityName: celebrityName || null,
      creatorId: creatorId || null,
    };

    try {
      const supabase = getSupabase();
      await supabase
        .from('event_payment_configs')
        .upsert({
          event_session_id: eventSessionId,
          price_cents: priceCents || 0,
          celebrity_stripe_account_id: celebrityStripeAccountId || null,
          celebrity_name: celebrityName || null,
          creator_id: creatorId || null,
        }, { onConflict: 'event_session_id' });
    } catch (dbErr) {
      console.warn('[EventPayment] DB store failed (using in-memory):', dbErr.message);
    }

    console.log('[EventPayment] Config stored for event:', eventSessionId, '| Price:', priceCents);
    res.json({ success: true });
  } catch (error) {
    console.error('[EventPayment] Error:', error.message);
    if (req.body.eventSessionId) {
      global.eventPaymentConfigs[req.body.eventSessionId] = req.body;
    }
    res.json({ success: true });
  }
});

app.get('/api/get-event-payment-config', async (req, res) => {
  try {
    const { event_session_id } = req.query;
    if (!event_session_id) return res.status(400).json({ error: 'Missing event_session_id' });

    const memConfig = global.eventPaymentConfigs[event_session_id];
    if (memConfig) {
      return res.json(memConfig);
    }

    try {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('event_payment_configs')
        .select('*')
        .eq('event_session_id', event_session_id)
        .single();

      if (!error && data) {
        return res.json({
          priceCents: data.price_cents || 0,
          celebrityStripeAccountId: data.celebrity_stripe_account_id,
          celebrityName: data.celebrity_name,
          creatorId: data.creator_id,
        });
      }
    } catch (dbErr) {
      console.warn('[EventPayment] DB lookup failed:', dbErr.message);
    }

    res.json({ priceCents: 0 });
  } catch (error) {
    console.error('[EventPayment] Get config error:', error.message);
    res.json({ priceCents: 0 });
  }
});

app.post('/api/create-event-checkout', async (req, res) => {
  try {
    const stripe = await getStripe();
    const { eventSessionId, fanId, priceCents, celebrityStripeAccountId, celebrityName, successUrl, cancelUrl } = req.body;

    if (!priceCents || priceCents < 100) {
      return res.status(400).json({ error: 'Minimum price is 1€ (100 cents)' });
    }

    if (!eventSessionId) {
      return res.status(400).json({ error: 'Missing event session ID' });
    }

    const signTouchFeeCents = Math.round(priceCents * 0.15);

    let sessionParams = {
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: {
            name: `Dédicace Live - ${celebrityName || 'Événement'}`,
            description: 'Accès aux photos dédicacées en direct',
          },
          unit_amount: priceCents,
        },
        quantity: 1,
      }],
      metadata: {
        event_session_id: eventSessionId,
        fan_id: fanId || 'anonymous',
        event_type: 'dedication',
        price_cents: String(priceCents),
        signtouch_fee_cents: String(signTouchFeeCents),
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
    };

    if (celebrityStripeAccountId) {
      try {
        const account = await stripe.accounts.retrieve(celebrityStripeAccountId);
        const canTransfer = account.charges_enabled && (account.capabilities?.transfers === 'active' || account.capabilities?.legacy_payments === 'active');

        if (canTransfer) {
          sessionParams.payment_intent_data = {
            application_fee_amount: signTouchFeeCents,
            transfer_data: {
              destination: celebrityStripeAccountId,
            },
          };
        }
      } catch (e) {
        console.warn('[EventCheckout] Could not verify Stripe account:', e.message);
      }
    }

    const checkoutSession = await stripe.checkout.sessions.create(sessionParams);

    console.log('[EventCheckout] Session created:', checkoutSession.id, 'for event:', eventSessionId, '| Price:', priceCents, '| Fee:', signTouchFeeCents);

    res.json({
      checkoutSessionId: checkoutSession.id,
      url: checkoutSession.url,
    });
  } catch (error) {
    console.error('[EventCheckout] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

if (!global.eventPaidRecords) global.eventPaidRecords = {};

app.get('/api/verify-event-payment', async (req, res) => {
  try {
    const stripe = await getStripe();
    const { checkout_session_id } = req.query;

    if (!checkout_session_id) {
      return res.status(400).json({ error: 'Missing checkout_session_id' });
    }

    const session = await stripe.checkout.sessions.retrieve(checkout_session_id);
    const eventSessionId = session.metadata?.event_session_id;
    const fanId = session.metadata?.fan_id;
    const paid = session.payment_status === 'paid';

    if (paid && eventSessionId && fanId) {
      const key = `${eventSessionId}_${fanId}`;
      global.eventPaidRecords[key] = { paid: true, checkoutSessionId: checkout_session_id, paidAt: new Date().toISOString() };
      console.log('[EventPayment] Recorded paid access:', key);
    }

    res.json({
      paid,
      status: session.payment_status,
      eventSessionId,
      fanId,
    });
  } catch (error) {
    console.error('[EventPayment] Verify error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/event-session-earnings', async (req, res) => {
  try {
    const stripe = await getStripe();
    const { event_session_id } = req.query;

    if (!event_session_id) {
      return res.status(400).json({ error: 'Missing event_session_id' });
    }

    const checkoutSessions = await stripe.checkout.sessions.list({
      limit: 100,
    });

    let totalGrossCents = 0;
    let paidFanCount = 0;

    for (const cs of checkoutSessions.data) {
      if (cs.metadata?.event_session_id === event_session_id && cs.payment_status === 'paid') {
        totalGrossCents += cs.amount_total || 0;
        paidFanCount++;
      }
    }

    const signTouchFeeCents = Math.round(totalGrossCents * 0.15);
    const stripeFeeCents = Math.round(totalGrossCents * 0.029) + paidFanCount * 30;
    const netCents = totalGrossCents - signTouchFeeCents - stripeFeeCents;

    res.json({
      event_session_id,
      total_gross_cents: totalGrossCents,
      net_cents: Math.max(0, netCents),
      paid_fan_count: paidFanCount,
    });
  } catch (error) {
    console.error('[EventEarnings] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/check-event-access', async (req, res) => {
  try {
    const { event_session_id, fan_id } = req.query;

    if (!event_session_id || !fan_id) {
      return res.status(400).json({ error: 'Missing event_session_id or fan_id' });
    }

    const key = `${event_session_id}_${fan_id}`;
    const record = global.eventPaidRecords?.[key];

    if (record?.paid) {
      return res.json({ paid: true, paidAt: record.paidAt });
    }

    res.json({ paid: false });
  } catch (error) {
    console.error('[EventPayment] Check access error:', error.message);
    res.json({ paid: false });
  }
});

app.post('/api/record-free-event-access', async (req, res) => {
  try {
    const supabase = getSupabase();
    const { event_session_id, fan_id, promo_id } = req.body;

    if (!event_session_id || !fan_id || !promo_id) {
      return res.status(400).json({ error: 'Missing event_session_id, fan_id, or promo_id' });
    }

    const { data: promo } = await supabase
      .from('promo_code_evenement_qr')
      .select('id, discount_percent, is_active, event_session_id')
      .eq('id', promo_id)
      .eq('is_active', true)
      .single();

    if (!promo || promo.discount_percent !== 100) {
      return res.status(403).json({ error: 'Invalid or non-100% promo code' });
    }

    if (promo.event_session_id && promo.event_session_id !== event_session_id) {
      return res.status(403).json({ error: 'Promo code not valid for this event' });
    }

    const key = `${event_session_id}_${fan_id}`;
    if (!global.eventPaidRecords) global.eventPaidRecords = {};
    global.eventPaidRecords[key] = { paid: true, paidAt: new Date().toISOString(), method: 'promo_code', promo_id };

    console.log('[EventPromoAccess] Recorded free access for:', key, '| Promo:', promo_id);
    res.json({ success: true });
  } catch (error) {
    console.error('[EventPromoAccess] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Traductions des pages de retour Stripe (servies par le serveur, hors app) \u2014 15 langues
const STRIPE_PAGE_I18N = {
  fr: { done: "Inscription termin\u00e9e !", redirecting: "Redirection vers Plyz...", ifNot: "Si la redirection ne fonctionne pas :", back: "Retourner dans l'app", expired: "Session expir\u00e9e", retry: "Veuillez retourner dans l'app et r\u00e9essayer." },
  en: { done: "Registration complete!", redirecting: "Redirecting to Plyz...", ifNot: "If the redirect doesn't work:", back: "Back to the app", expired: "Session expired", retry: "Please return to the app and try again." },
  es: { done: "\u00a1Registro completado!", redirecting: "Redirigiendo a Plyz...", ifNot: "Si la redirecci\u00f3n no funciona:", back: "Volver a la app", expired: "Sesi\u00f3n expirada", retry: "Vuelve a la app e int\u00e9ntalo de nuevo." },
  de: { done: "Registrierung abgeschlossen!", redirecting: "Weiterleitung zu Plyz...", ifNot: "Falls die Weiterleitung nicht funktioniert:", back: "Zur\u00fcck zur App", expired: "Sitzung abgelaufen", retry: "Bitte kehre zur App zur\u00fcck und versuche es erneut." },
  it: { done: "Registrazione completata!", redirecting: "Reindirizzamento a Plyz...", ifNot: "Se il reindirizzamento non funziona:", back: "Torna all'app", expired: "Sessione scaduta", retry: "Torna all'app e riprova." },
  pt: { done: "Inscri\u00e7\u00e3o conclu\u00edda!", redirecting: "Redirecionando para o Plyz...", ifNot: "Se o redirecionamento n\u00e3o funcionar:", back: "Voltar ao app", expired: "Sess\u00e3o expirada", retry: "Volte ao app e tente novamente." },
  ru: { done: "\u0420\u0435\u0433\u0438\u0441\u0442\u0440\u0430\u0446\u0438\u044f \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043d\u0430!", redirecting: "\u041f\u0435\u0440\u0435\u043d\u0430\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u0438\u0435 \u0432 Plyz...", ifNot: "\u0415\u0441\u043b\u0438 \u043f\u0435\u0440\u0435\u043d\u0430\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u0438\u0435 \u043d\u0435 \u0440\u0430\u0431\u043e\u0442\u0430\u0435\u0442:", back: "\u0412\u0435\u0440\u043d\u0443\u0442\u044c\u0441\u044f \u0432 \u043f\u0440\u0438\u043b\u043e\u0436\u0435\u043d\u0438\u0435", expired: "\u0421\u0435\u0441\u0441\u0438\u044f \u0438\u0441\u0442\u0435\u043a\u043b\u0430", retry: "\u0412\u0435\u0440\u043d\u0438\u0442\u0435\u0441\u044c \u0432 \u043f\u0440\u0438\u043b\u043e\u0436\u0435\u043d\u0438\u0435 \u0438 \u043f\u043e\u043f\u0440\u043e\u0431\u0443\u0439\u0442\u0435 \u0441\u043d\u043e\u0432\u0430." },
  ar: { done: "\u0627\u0643\u062a\u0645\u0644 \u0627\u0644\u062a\u0633\u062c\u064a\u0644!", redirecting: "\u062c\u0627\u0631\u064d \u0627\u0644\u062a\u062d\u0648\u064a\u0644 \u0625\u0644\u0649 Plyz...", ifNot: "\u0625\u0630\u0627 \u0644\u0645 \u064a\u0639\u0645\u0644 \u0627\u0644\u062a\u062d\u0648\u064a\u0644:", back: "\u0627\u0644\u0639\u0648\u062f\u0629 \u0625\u0644\u0649 \u0627\u0644\u062a\u0637\u0628\u064a\u0642", expired: "\u0627\u0646\u062a\u0647\u062a \u0627\u0644\u062c\u0644\u0633\u0629", retry: "\u064a\u0631\u062c\u0649 \u0627\u0644\u0639\u0648\u062f\u0629 \u0625\u0644\u0649 \u0627\u0644\u062a\u0637\u0628\u064a\u0642 \u0648\u0627\u0644\u0645\u062d\u0627\u0648\u0644\u0629 \u0645\u0631\u0629 \u0623\u062e\u0631\u0649." },
  zh: { done: "\u6ce8\u518c\u5b8c\u6210\uff01", redirecting: "\u6b63\u5728\u8df3\u8f6c\u5230 Plyz...", ifNot: "\u5982\u679c\u8df3\u8f6c\u65e0\u6548\uff1a", back: "\u8fd4\u56de\u5e94\u7528", expired: "\u4f1a\u8bdd\u5df2\u8fc7\u671f", retry: "\u8bf7\u8fd4\u56de\u5e94\u7528\u5e76\u91cd\u8bd5\u3002" },
  ja: { done: "\u767b\u9332\u304c\u5b8c\u4e86\u3057\u307e\u3057\u305f\uff01", redirecting: "Plyz \u306b\u30ea\u30c0\u30a4\u30ec\u30af\u30c8\u3057\u3066\u3044\u307e\u3059...", ifNot: "\u30ea\u30c0\u30a4\u30ec\u30af\u30c8\u304c\u6a5f\u80fd\u3057\u306a\u3044\u5834\u5408\uff1a", back: "\u30a2\u30d7\u30ea\u306b\u623b\u308b", expired: "\u30bb\u30c3\u30b7\u30e7\u30f3\u306e\u6709\u52b9\u671f\u9650\u304c\u5207\u308c\u307e\u3057\u305f", retry: "\u30a2\u30d7\u30ea\u306b\u623b\u3063\u3066\u3082\u3046\u4e00\u5ea6\u304a\u8a66\u3057\u304f\u3060\u3055\u3044\u3002" },
  hi: { done: "\u092a\u0902\u091c\u0940\u0915\u0930\u0923 \u092a\u0942\u0930\u094d\u0923 \u0939\u0941\u0906!", redirecting: "Plyz \u092a\u0930 \u0930\u0940\u0921\u093e\u092f\u0930\u0947\u0915\u094d\u091f \u0939\u094b \u0930\u0939\u093e \u0939\u0948...", ifNot: "\u092f\u0926\u093f \u0930\u0940\u0921\u093e\u092f\u0930\u0947\u0915\u094d\u091f \u0915\u093e\u092e \u0928 \u0915\u0930\u0947:", back: "\u0910\u092a \u092a\u0930 \u0935\u093e\u092a\u0938 \u091c\u093e\u090f\u0901", expired: "\u0938\u0924\u094d\u0930 \u0938\u092e\u093e\u092a\u094d\u0924 \u0939\u094b \u0917\u092f\u093e", retry: "\u0915\u0943\u092a\u092f\u093e \u0910\u092a \u092a\u0930 \u0932\u094c\u091f\u0947\u0902 \u0914\u0930 \u092a\u0941\u0928\u0903 \u092a\u094d\u0930\u092f\u093e\u0938 \u0915\u0930\u0947\u0902\u0964" },
  bn: { done: "\u09a8\u09bf\u09ac\u09a8\u09cd\u09a7\u09a8 \u09b8\u09ae\u09cd\u09aa\u09a8\u09cd\u09a8 \u09b9\u09af\u09bc\u09c7\u099b\u09c7!", redirecting: "Plyz-\u098f \u09b0\u09bf\u09a1\u09be\u0987\u09b0\u09c7\u0995\u09cd\u099f \u0995\u09b0\u09be \u09b9\u099a\u09cd\u099b\u09c7...", ifNot: "\u09b0\u09bf\u09a1\u09be\u0987\u09b0\u09c7\u0995\u09cd\u099f \u0995\u09be\u099c \u09a8\u09be \u0995\u09b0\u09b2\u09c7:", back: "\u0985\u09cd\u09af\u09be\u09aa\u09c7 \u09ab\u09bf\u09b0\u09c7 \u09af\u09be\u09a8", expired: "\u09b8\u09c7\u09b6\u09a8\u09c7\u09b0 \u09ae\u09c7\u09af\u09bc\u09be\u09a6 \u09b6\u09c7\u09b7 \u09b9\u09af\u09bc\u09c7\u099b\u09c7", retry: "\u0985\u09a8\u09c1\u0997\u09cd\u09b0\u09b9 \u0995\u09b0\u09c7 \u0985\u09cd\u09af\u09be\u09aa\u09c7 \u09ab\u09bf\u09b0\u09c7 \u0997\u09bf\u09af\u09bc\u09c7 \u0986\u09ac\u09be\u09b0 \u099a\u09c7\u09b7\u09cd\u099f\u09be \u0995\u09b0\u09c1\u09a8\u0964" },
  ur: { done: "\u0631\u062c\u0633\u0679\u0631\u06cc\u0634\u0646 \u0645\u06a9\u0645\u0644 \u06c1\u0648 \u06af\u0626\u06cc!", redirecting: "Plyz \u067e\u0631 \u0631\u06cc \u0688\u0627\u0626\u0631\u06cc\u06a9\u0679 \u06c1\u0648 \u0631\u06c1\u0627 \u06c1\u06d2...", ifNot: "\u0627\u06af\u0631 \u0631\u06cc \u0688\u0627\u0626\u0631\u06cc\u06a9\u0679 \u06a9\u0627\u0645 \u0646\u06c1 \u06a9\u0631\u06d2:", back: "\u0627\u06cc\u067e \u067e\u0631 \u0648\u0627\u067e\u0633 \u062c\u0627\u0626\u06cc\u06ba", expired: "\u0633\u06cc\u0634\u0646 \u062e\u062a\u0645 \u06c1\u0648 \u06af\u06cc\u0627", retry: "\u0628\u0631\u0627\u06c1 \u06a9\u0631\u0645 \u0627\u06cc\u067e \u067e\u0631 \u0648\u0627\u067e\u0633 \u062c\u0627\u0626\u06cc\u06ba \u0627\u0648\u0631 \u062f\u0648\u0628\u0627\u0631\u06c1 \u06a9\u0648\u0634\u0634 \u06a9\u0631\u06cc\u06ba\u06d4" },
  id: { done: "Pendaftaran selesai!", redirecting: "Mengalihkan ke Plyz...", ifNot: "Jika pengalihan tidak berfungsi:", back: "Kembali ke aplikasi", expired: "Sesi kedaluwarsa", retry: "Silakan kembali ke aplikasi dan coba lagi." },
  ms: { done: "Pendaftaran selesai!", redirecting: "Mengalihkan ke Plyz...", ifNot: "Jika pengalihan tidak berfungsi:", back: "Kembali ke apl", expired: "Sesi tamat tempoh", retry: "Sila kembali ke apl dan cuba lagi." },
};
const STRIPE_RTL_LANGS = ['ar', 'ur'];
function stripePageLang(req) {
  const l = (req.query.lang || '').toString();
  return STRIPE_PAGE_I18N[l] ? l : 'fr';
}

app.get('/stripe/refresh', (req, res) => {
  const lang = stripePageLang(req);
  const tr = STRIPE_PAGE_I18N[lang];
  const dir = STRIPE_RTL_LANGS.includes(lang) ? 'rtl' : 'ltr';
  res.send(`<html lang="${lang}" dir="${dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="background:#0a1628;color:white;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="text-align:center"><h2>${tr.expired}</h2><p>${tr.retry}</p></div></body></html>`);
});

app.get('/stripe/return', (req, res) => {
  // Lien profond vers l'app mobile (scheme plyz://) pour revenir directement
  // sur l'écran d'où venait l'utilisateur ; le param stripe_return permet à
  // l'app de re-vérifier le statut du compte Stripe au retour.
  // Liste blanche pour éviter toute redirection arbitraire.
  const allowedDest = ['create-event', 'create-live-session'];
  const dest = allowedDest.includes(req.query.dest) ? req.query.dest : 'create-live-session';
  const appUrl = `plyz://${dest}?stripe_return=1`;
  const lang = stripePageLang(req);
  const tr = STRIPE_PAGE_I18N[lang];
  const dir = STRIPE_RTL_LANGS.includes(lang) ? 'rtl' : 'ltr';
  res.send(`<!DOCTYPE html>
<html lang="${lang}" dir="${dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Plyz - ${tr.done}</title>
<style>
  body{background:#0a1628;color:white;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
  .container{text-align:center;padding:20px}
  .spinner{width:40px;height:40px;border:4px solid rgba(255,255,255,0.2);border-top:4px solid #4CAF50;border-radius:50%;animation:spin 1s linear infinite;margin:20px auto}
  @keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}
  .btn{display:inline-block;margin-top:20px;padding:14px 28px;background:#4CAF50;color:white;text-decoration:none;border-radius:25px;font-size:16px;font-weight:bold}
</style>
</head><body>
<div class="container">
  <h2>✅ ${tr.done}</h2>
  <p>${tr.redirecting}</p>
  <div class="spinner"></div>
  <p style="margin-top:30px;font-size:14px;opacity:0.7">${tr.ifNot}</p>
  <a class="btn" href="${appUrl}">${tr.back}</a>
</div>
<script>setTimeout(function(){window.location.href="${appUrl}";},2000);</script>
</body></html>`);
});

// ============================================================
// MARKETPLACE API ENDPOINTS
// ============================================================

const MOCK_CELEBRITIES = [
  {
    user_id: 'mock-001',
    stage_name: 'Zinedine Zidane',
    bio: 'Ancien footballeur international et entraîneur. Ballon d\'Or 1998. Légende du Real Madrid et de l\'Équipe de France.',
    website: 'https://en.wikipedia.org/wiki/Zinedine_Zidane',
    avatar_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f3/Zinedine_Zidane_by_Tasnim_03.jpg/440px-Zinedine_Zidane_by_Tasnim_03.jpg',
    stripe_verified: true,
    official_verified: true,
    stripe_account_id: 'acct_mock_zidane',
    wikidata_image_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f3/Zinedine_Zidane_by_Tasnim_03.jpg/440px-Zinedine_Zidane_by_Tasnim_03.jpg',
    wikipedia_url: 'https://fr.wikipedia.org/wiki/Zinedine_Zidane',
    wikidata_occupations: ['footballer', 'manager'],
    wikidata_types: ['sports'],
    popularity_score: 98,
    created_at: '2025-01-15T10:00:00Z',
    pricing: { video_call_price_cents: 15000, video_call_unit: 'session', video_call_duration_minutes: 10, autograph_price_cents: 5000, live_dedication_price_cents: 8000, currency: 'eur' },
  },
  {
    user_id: 'mock-002',
    stage_name: 'Marion Cotillard',
    bio: 'Actrice française, lauréate de l\'Oscar de la meilleure actrice pour "La Môme". Ambassadrice Greenpeace.',
    website: null,
    avatar_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/68/Marion_Cotillard_2019.jpg/440px-Marion_Cotillard_2019.jpg',
    stripe_verified: true,
    official_verified: true,
    stripe_account_id: 'acct_mock_cotillard',
    wikidata_image_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/68/Marion_Cotillard_2019.jpg/440px-Marion_Cotillard_2019.jpg',
    wikipedia_url: 'https://fr.wikipedia.org/wiki/Marion_Cotillard',
    wikidata_occupations: ['actress', 'singer'],
    wikidata_types: ['entertainment'],
    popularity_score: 92,
    created_at: '2025-02-10T10:00:00Z',
    pricing: { video_call_price_cents: 20000, video_call_unit: 'session', video_call_duration_minutes: 10, autograph_price_cents: 7500, live_dedication_price_cents: 10000, currency: 'eur' },
  },
  {
    user_id: 'mock-003',
    stage_name: 'Kylian Mbappé',
    bio: 'Footballeur international français. Champion du Monde 2018. Attaquant du Real Madrid.',
    website: 'https://www.kmbappe.com',
    avatar_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/57/2019-07-17_SG_Dynamo_Dresden_vs._Paris_Saint-Germain_by_Sandro_Halank%E2%80%93129_%28cropped%29.jpg/440px-2019-07-17_SG_Dynamo_Dresden_vs._Paris_Saint-Germain_by_Sandro_Halank%E2%80%93129_%28cropped%29.jpg',
    stripe_verified: true,
    official_verified: true,
    stripe_account_id: 'acct_mock_mbappe',
    wikidata_image_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/57/2019-07-17_SG_Dynamo_Dresden_vs._Paris_Saint-Germain_by_Sandro_Halank%E2%80%93129_%28cropped%29.jpg/440px-2019-07-17_SG_Dynamo_Dresden_vs._Paris_Saint-Germain_by_Sandro_Halank%E2%80%93129_%28cropped%29.jpg',
    wikipedia_url: 'https://fr.wikipedia.org/wiki/Kylian_Mbapp%C3%A9',
    wikidata_occupations: ['footballer'],
    wikidata_types: ['sports'],
    popularity_score: 97,
    created_at: '2025-01-20T10:00:00Z',
    pricing: { video_call_price_cents: 25000, video_call_unit: 'session', video_call_duration_minutes: 5, autograph_price_cents: 10000, live_dedication_price_cents: 15000, currency: 'eur' },
  },
  {
    user_id: 'mock-004',
    stage_name: 'Aya Nakamura',
    bio: 'Chanteuse et auteure-compositrice. Artiste francophone la plus écoutée au monde sur les plateformes de streaming.',
    website: null,
    avatar_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e6/Tierra_Whack_%2848631292083%29_%28cropped%29.jpg/440px-Tierra_Whack_%2848631292083%29_%28cropped%29.jpg',
    stripe_verified: true,
    official_verified: true,
    stripe_account_id: 'acct_mock_nakamura',
    wikidata_image_url: null,
    wikipedia_url: 'https://fr.wikipedia.org/wiki/Aya_Nakamura',
    wikidata_occupations: ['singer', 'songwriter'],
    wikidata_types: ['music'],
    popularity_score: 90,
    created_at: '2025-03-01T10:00:00Z',
    pricing: { video_call_price_cents: 18000, video_call_unit: 'session', video_call_duration_minutes: 10, autograph_price_cents: 6000, live_dedication_price_cents: 9000, currency: 'eur' },
  },
  {
    user_id: 'mock-005',
    stage_name: 'Omar Sy',
    bio: 'Acteur et humoriste français. Connu pour "Intouchables" et la série Netflix "Lupin".',
    website: null,
    avatar_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/54/Omar_Sy_Cannes_2022.jpg/440px-Omar_Sy_Cannes_2022.jpg',
    stripe_verified: true,
    official_verified: true,
    stripe_account_id: 'acct_mock_omarsy',
    wikidata_image_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/54/Omar_Sy_Cannes_2022.jpg/440px-Omar_Sy_Cannes_2022.jpg',
    wikipedia_url: 'https://fr.wikipedia.org/wiki/Omar_Sy',
    wikidata_occupations: ['actor', 'comedian'],
    wikidata_types: ['entertainment'],
    popularity_score: 93,
    created_at: '2025-01-25T10:00:00Z',
    pricing: { video_call_price_cents: 22000, video_call_unit: 'session', video_call_duration_minutes: 10, autograph_price_cents: 8000, live_dedication_price_cents: 12000, currency: 'eur' },
  },
  {
    user_id: 'mock-006',
    stage_name: 'Teddy Riner',
    bio: 'Judoka français, triple champion olympique. Légende du judo mondial avec 10 titres de champion du monde.',
    website: null,
    avatar_url: null,
    stripe_verified: true,
    official_verified: true,
    stripe_account_id: 'acct_mock_riner',
    wikidata_image_url: null,
    wikipedia_url: 'https://fr.wikipedia.org/wiki/Teddy_Riner',
    wikidata_occupations: ['judoka'],
    wikidata_types: ['sports'],
    popularity_score: 88,
    created_at: '2025-02-15T10:00:00Z',
    pricing: { video_call_price_cents: 12000, video_call_unit: 'session', video_call_duration_minutes: 10, autograph_price_cents: 4000, live_dedication_price_cents: 7000, currency: 'eur' },
  },
  {
    user_id: 'mock-007',
    stage_name: 'Léa Seydoux',
    bio: 'Actrice française. James Bond Girl dans "Spectre" et "Mourir Peut Attendre". Palme d\'Or à Cannes.',
    website: null,
    avatar_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2b/L%C3%A9a_Seydoux_Cannes_2022.jpg/440px-L%C3%A9a_Seydoux_Cannes_2022.jpg',
    stripe_verified: false,
    official_verified: true,
    stripe_account_id: null,
    wikidata_image_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2b/L%C3%A9a_Seydoux_Cannes_2022.jpg/440px-L%C3%A9a_Seydoux_Cannes_2022.jpg',
    wikipedia_url: 'https://fr.wikipedia.org/wiki/L%C3%A9a_Seydoux',
    wikidata_occupations: ['actress'],
    wikidata_types: ['entertainment'],
    popularity_score: 85,
    created_at: '2025-03-10T10:00:00Z',
    pricing: { video_call_price_cents: 18000, video_call_unit: 'session', video_call_duration_minutes: 10, autograph_price_cents: 6500, live_dedication_price_cents: 9000, currency: 'eur' },
  },
  {
    user_id: 'mock-008',
    stage_name: 'DJ Snake',
    bio: 'DJ et producteur français. Connu pour "Turn Down for What", "Lean On" et "Taki Taki". Milliards de streams.',
    website: 'https://djsnake.com',
    avatar_url: null,
    stripe_verified: true,
    official_verified: false,
    stripe_account_id: 'acct_mock_djsnake',
    wikidata_image_url: null,
    wikipedia_url: 'https://fr.wikipedia.org/wiki/DJ_Snake',
    wikidata_occupations: ['DJ', 'producer'],
    wikidata_types: ['music'],
    popularity_score: 82,
    created_at: '2025-02-20T10:00:00Z',
    pricing: { video_call_price_cents: 15000, video_call_unit: 'session', video_call_duration_minutes: 10, autograph_price_cents: 5000, live_dedication_price_cents: 8000, currency: 'eur' },
  },
];

const MOCK_FEED = [
  {
    id: 'post-001', kind: 'post', title: 'Nouveau chapitre', body: 'Très heureux d\'annoncer une nouvelle aventure. Restez connectés pour la suite... Merci pour votre soutien incroyable !', media_url: null, event_date: null, created_at: '2025-12-10T14:30:00Z',
    celebrity: { user_id: 'mock-005', stage_name: 'Omar Sy', avatar_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/54/Omar_Sy_Cannes_2022.jpg/440px-Omar_Sy_Cannes_2022.jpg', official_verified: true, stripe_verified: true },
  },
  {
    id: 'post-002', kind: 'event', title: 'Session Live Exclusive', body: 'Rejoignez-moi pour une session live exclusive ce week-end. On parlera football, souvenirs et avenir.', media_url: null, event_date: '2026-02-20T18:00:00Z', price_cents: 15000, location: 'Paris, France', created_at: '2025-12-08T10:00:00Z',
    celebrity: { user_id: 'mock-001', stage_name: 'Zinedine Zidane', avatar_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f3/Zinedine_Zidane_by_Tasnim_03.jpg/440px-Zinedine_Zidane_by_Tasnim_03.jpg', official_verified: true, stripe_verified: true },
  },
  {
    id: 'post-003', kind: 'post', title: null, body: 'Merci à tous les fans pour votre énergie incroyable au concert de Paris ! Vous êtes les meilleurs. On se retrouve bientôt sur scène.', media_url: null, event_date: null, created_at: '2025-12-05T20:00:00Z',
    celebrity: { user_id: 'mock-004', stage_name: 'Aya Nakamura', avatar_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e6/Tierra_Whack_%2848631292083%29_%28cropped%29.jpg/440px-Tierra_Whack_%2848631292083%29_%28cropped%29.jpg', official_verified: true, stripe_verified: true },
  },
  {
    id: 'post-004', kind: 'event', title: 'Dédicace en Live', body: 'Réservez votre créneau pour une dédicace personnalisée en vidéo. Places limitées !', media_url: null, event_date: '2026-03-01T15:00:00Z', price_cents: 20000, location: 'Cannes, France', created_at: '2025-12-03T09:00:00Z',
    celebrity: { user_id: 'mock-002', stage_name: 'Marion Cotillard', avatar_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/68/Marion_Cotillard_2019.jpg/440px-Marion_Cotillard_2019.jpg', official_verified: true, stripe_verified: true },
  },
  {
    id: 'post-005', kind: 'post', title: 'Allez Paris !', body: 'Quel match incroyable hier soir ! On ne lâche rien. Le travail continue chaque jour.', media_url: null, event_date: null, created_at: '2025-11-28T22:00:00Z',
    celebrity: { user_id: 'mock-003', stage_name: 'Kylian Mbappé', avatar_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/57/2019-07-17_SG_Dynamo_Dresden_vs._Paris_Saint-Germain_by_Sandro_Halank%E2%80%93129_%28cropped%29.jpg/440px-2019-07-17_SG_Dynamo_Dresden_vs._Paris_Saint-Germain_by_Sandro_Halank%E2%80%93129_%28cropped%29.jpg', official_verified: true, stripe_verified: true },
  },
  {
    id: 'post-006', kind: 'post', title: 'Retour au dojo', body: 'La préparation pour les prochains championnats a commencé. Le judo c\'est ma vie, chaque jour sur le tatami.', media_url: null, event_date: null, created_at: '2025-11-25T08:00:00Z',
    celebrity: { user_id: 'mock-006', stage_name: 'Teddy Riner', avatar_url: null, official_verified: true, stripe_verified: true },
  },
];

function getMockCelebrities(search, sort) {
  let results = [...MOCK_CELEBRITIES];
  if (search && search.trim().length > 0) {
    const s = search.trim().toLowerCase();
    results = results.filter(c => c.stage_name.toLowerCase().includes(s) || (c.bio && c.bio.toLowerCase().includes(s)));
  }
  switch (sort) {
    case 'name_asc': results.sort((a, b) => a.stage_name.localeCompare(b.stage_name)); break;
    case 'name_desc': results.sort((a, b) => b.stage_name.localeCompare(a.stage_name)); break;
    case 'newest': results.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)); break;
    default: results.sort((a, b) => b.popularity_score - a.popularity_score);
  }
  return results;
}

app.get('/api/celebrities', async (req, res) => {
  try {
    const db = getSupabaseAdmin();
    const { search, sort, category, page, limit: lim } = req.query;
    const page_num = Math.max(1, parseInt(page) || 1);
    const per_page = Math.min(50, Math.max(1, parseInt(lim) || 20));
    const offset = (page_num - 1) * per_page;

    let query = db
      .from('celebrity_profiles')
      .select(`
        user_id, stage_name, bio, website,
        stripe_verified, official_verified, is_listed,
        wikidata_image_url, wikidata_occupations, wikidata_types,
        popularity_score, created_at,
        ${profilesJoinInner()},
        celebrity_pricing(video_call_price_cents, autograph_price_cents, live_dedication_price_cents, currency)
      `, { count: 'exact' })
      .eq('is_listed', true);

    if (search && search.trim().length > 0) {
      query = query.ilike('stage_name', `%${search.trim()}%`);
    }

    if (category && category !== 'all') {
      query = query.contains('wikidata_types', [category]);
    }

    switch (sort) {
      case 'name_asc':
        query = query.order('stage_name', { ascending: true });
        break;
      case 'name_desc':
        query = query.order('stage_name', { ascending: false });
        break;
      case 'price_asc':
        query = query.order('popularity_score', { ascending: true });
        break;
      case 'newest':
        query = query.order('created_at', { ascending: false });
        break;
      default:
        query = query.order('popularity_score', { ascending: false });
    }

    query = query.range(offset, offset + per_page - 1);

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({
      celebrities: (data || []).map(c => ({
        user_id: c.user_id,
        stage_name: c.stage_name,
        bio: c.bio,
        avatar_url: c.profiles?.avatar_url || c.wikidata_image_url,
        display_name: c.profiles?.display_name,
        stripe_verified: c.stripe_verified,
        official_verified: c.official_verified,
        occupations: c.wikidata_occupations || [],
        types: c.wikidata_types || [],
        popularity_score: c.popularity_score,
        pricing: c.celebrity_pricing?.[0] || null,
      })),
      total: count || 0,
      page: page_num,
      per_page,
      total_pages: Math.ceil((count || 0) / per_page),
    });
  } catch (error) {
    console.error('[Celebrities] Error:', error.message);
    if (!MOCK_MODE) {
      return res.status(500).json({ error: 'Service temporarily unavailable' });
    }
    console.log('[Celebrities] Falling back to mock data');
    const { search, sort, page, limit: lim } = req.query;
    const page_num = Math.max(1, parseInt(page) || 1);
    const per_page = Math.min(50, Math.max(1, parseInt(lim) || 20));
    const all = getMockCelebrities(search, sort);
    const offset = (page_num - 1) * per_page;
    const paged = all.slice(offset, offset + per_page);
    res.json({
      celebrities: paged.map(c => ({
        user_id: c.user_id,
        stage_name: c.stage_name,
        bio: c.bio,
        avatar_url: c.avatar_url,
        display_name: c.stage_name,
        stripe_verified: c.stripe_verified,
        official_verified: c.official_verified,
        occupations: c.wikidata_occupations || [],
        types: c.wikidata_types || [],
        popularity_score: c.popularity_score,
        pricing: c.pricing || null,
      })),
      total: all.length,
      page: page_num,
      per_page,
      total_pages: Math.ceil(all.length / per_page),
    });
  }
});

app.get('/api/celebrity/:id', async (req, res) => {
  try {
    const db = getSupabaseAdmin();
    const { id } = req.params;

    const { data: celeb, error: celebError } = await db
      .from('celebrity_profiles')
      .select(`
        *, 
        ${profilesJoin()},
        celebrity_pricing(*)
      `)
      .eq('user_id', id)
      .single();

    if (celebError) throw celebError;
    if (!celeb) return res.status(404).json({ error: 'Celebrity not found' });

    if (celeb.wikidata_id) {
      const SYNC_INTERVAL = 24 * 60 * 60 * 1000;
      const lastSync = celeb.wikidata_last_sync ? new Date(celeb.wikidata_last_sync).getTime() : 0;
      if (Date.now() - lastSync > SYNC_INTERVAL) {
        (async () => {
          try {
            console.log(`[Wikidata Auto-Sync] Refreshing ${celeb.stage_name} (${celeb.wikidata_id})`);
            const entityRes = await fetch(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${celeb.wikidata_id}&props=labels|descriptions|claims|sitelinks&languages=en|fr&format=json`);
            const entityData = await entityRes.json();
            const entity = entityData.entities?.[celeb.wikidata_id];
            if (!entity) return;

            const label = entity.labels?.en?.value || entity.labels?.fr?.value || celeb.wikidata_id;
            const description = entity.descriptions?.en?.value || entity.descriptions?.fr?.value || '';

            let image_url = null;
            const imageClaimValues = entity.claims?.P18;
            if (imageClaimValues && imageClaimValues.length > 0) {
              const fileName = imageClaimValues[0].mainsnak?.datavalue?.value;
              if (fileName) {
                const encodedName = encodeURIComponent(fileName.replace(/ /g, '_'));
                image_url = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodedName}?width=400`;
              }
            }

            let wikipedia_url = null;
            if (entity.sitelinks?.enwiki) {
              wikipedia_url = `https://en.wikipedia.org/wiki/${encodeURIComponent(entity.sitelinks.enwiki.title)}`;
            } else if (entity.sitelinks?.frwiki) {
              wikipedia_url = `https://fr.wikipedia.org/wiki/${encodeURIComponent(entity.sitelinks.frwiki.title)}`;
            }

            const occupations = [];
            const occupationClaims = entity.claims?.P106 || [];
            for (const claim of occupationClaims.slice(0, 5)) {
              const occId = claim.mainsnak?.datavalue?.value?.id;
              if (occId) occupations.push(occId);
            }

            const types = [];
            const instanceOfClaims = entity.claims?.P31 || [];
            for (const claim of instanceOfClaims.slice(0, 5)) {
              const typeId = claim.mainsnak?.datavalue?.value?.id;
              if (typeId) types.push(typeId);
            }

            const updateData = {
              wikidata_label: label,
              wikipedia_url: wikipedia_url || celeb.wikipedia_url,
              wikidata_image_url: image_url || celeb.wikidata_image_url,
              wikidata_occupations: occupations.length > 0 ? occupations : celeb.wikidata_occupations,
              wikidata_types: types.length > 0 ? types : celeb.wikidata_types,
              wikidata_confidence: 100,
              wikidata_last_sync: new Date().toISOString(),
              official_verified: true,
              updated_at: new Date().toISOString(),
            };

            if (description && description.length > 0) {
              updateData.bio = description;
            }

            await db.from('celebrity_profiles').update(updateData).eq('user_id', id);

            await db.from('wikidata_entities').upsert({
              wikidata_id: celeb.wikidata_id,
              label,
              description,
              image_url,
              wikipedia_url,
              occupations,
              types,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'wikidata_id' });

            console.log(`[Wikidata Auto-Sync] Updated ${celeb.stage_name} successfully`);
          } catch (syncErr) {
            console.error(`[Wikidata Auto-Sync] Error for ${celeb.stage_name}:`, syncErr.message);
          }
        })();
      }
    }

    const { data: recentPosts } = await db
      .from('posts')
      .select('*')
      .eq('celebrity_id', id)
      .order('created_at', { ascending: false })
      .limit(10);

    const { count: totalBookings } = await db
      .from('booking_requests')
      .select('*', { count: 'exact', head: true })
      .eq('celebrity_id', id)
      .eq('status', 'completed');

    res.json({
      celebrity: {
        ...celeb,
        avatar_url: celeb.profiles?.avatar_url || celeb.wikidata_image_url,
        display_name: celeb.profiles?.display_name,
        pricing: celeb.celebrity_pricing?.[0] || null,
        posts: recentPosts || [],
        completed_sessions: totalBookings || 0,
      },
    });
  } catch (error) {
    console.error('[Celebrity Detail] Error:', error.message);
    if (!MOCK_MODE) {
      return res.status(500).json({ error: 'Service temporarily unavailable' });
    }
    console.log('[Celebrity Detail] Falling back to mock data');
    const { id } = req.params;
    const mock = MOCK_CELEBRITIES.find(c => c.user_id === id);
    if (!mock) return res.status(404).json({ error: 'Celebrity not found' });
    const mockPosts = MOCK_FEED.filter(p => p.celebrity.user_id === id).map(p => ({
      id: p.id, kind: p.kind, title: p.title, body: p.body, media_url: p.media_url, event_date: p.event_date, price_cents: p.price_cents || 0, location: p.location || null, created_at: p.created_at,
    }));
    res.json({
      celebrity: {
        ...mock,
        display_name: mock.stage_name,
        posts: mockPosts,
        completed_sessions: Math.floor(Math.random() * 50) + 10,
      },
    });
  }
});

app.get('/api/feed', async (req, res) => {
  try {
    const db = getSupabaseAdmin();
    const { page, limit: lim, kind } = req.query;
    const page_num = Math.max(1, parseInt(page) || 1);
    const per_page = Math.min(50, Math.max(1, parseInt(lim) || 20));
    const offset = (page_num - 1) * per_page;

    let query = db
      .from('posts')
      .select(`
        *,
        celebrity_profiles!inner(stage_name, wikidata_image_url, official_verified, stripe_verified, user_id,
          ${profilesJoin()}
        )
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + per_page - 1);

    if (kind && kind !== 'all') {
      query = query.eq('kind', kind);
    }

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({
      posts: (data || []).map(p => ({
        ...p,
        celebrity: {
          user_id: p.celebrity_profiles?.user_id,
          stage_name: p.celebrity_profiles?.stage_name,
          avatar_url: p.celebrity_profiles?.profiles?.avatar_url || p.celebrity_profiles?.wikidata_image_url,
          official_verified: p.celebrity_profiles?.official_verified,
          stripe_verified: p.celebrity_profiles?.stripe_verified,
        },
        celebrity_profiles: undefined,
      })),
      total: count || 0,
      page: page_num,
      per_page,
    });
  } catch (error) {
    console.error('[Feed] Error:', error.message);
    if (!MOCK_MODE) {
      return res.status(500).json({ error: 'Service temporarily unavailable' });
    }
    console.log('[Feed] Falling back to mock data');
    const { kind } = req.query;
    let mockResults = [...MOCK_FEED];
    if (kind && kind !== 'all') {
      mockResults = mockResults.filter(p => p.kind === kind);
    }
    res.json({
      posts: mockResults,
      total: mockResults.length,
      page: 1,
      per_page: 20,
    });
  }
});

app.post('/api/moderate-image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image provided' });

    const result = await moderateImage(req.file.buffer);
    if (!result.safe) {
      return res.status(403).json({
        error: 'content_rejected',
        reason: result.reason,
        message: 'Image contains inappropriate content and cannot be published.',
      });
    }

    res.json({ safe: true });
  } catch (error) {
    console.error('[Moderation] Error:', error.message);
    res.json({ safe: true, skipped: true });
  }
});

app.post('/api/upload-post-image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image provided' });

    const modResult = await moderateImage(req.file.buffer);
    if (!modResult.safe) {
      return res.status(403).json({
        error: 'content_rejected',
        reason: modResult.reason,
        message: 'Image contains inappropriate content and cannot be published.',
      });
    }

    const db = getSupabaseAdmin();
    const timestamp = Date.now();
    const ext = path.extname(req.file.originalname) || '.jpg';
    const fileName = `posts/${timestamp}${ext}`;

    const { data, error } = await db.storage
      .from('memories')
      .upload(fileName, req.file.buffer, {
        contentType: req.file.mimetype || 'image/jpeg',
        upsert: false,
      });

    if (error) {
      console.error('[Upload] Storage error:', error.message);
      return res.status(500).json({ error: 'Upload failed: ' + error.message });
    }

    const { data: urlData } = db.storage.from('memories').getPublicUrl(data.path);
    console.log('[Upload] Image uploaded:', urlData.publicUrl);
    res.json({ url: urlData.publicUrl });
  } catch (error) {
    console.error('[Upload] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/celebrity-events', async (req, res) => {
  try {
    const db = getSupabaseAdmin();
    const { celebrity_id } = req.query;
    if (!celebrity_id) return res.status(400).json({ error: 'celebrity_id required' });

    let query = db
      .from('live_sessions')
      .select('*')
      .eq('celebrity_id', celebrity_id)
      .in('status', ['scheduled', 'waiting', 'active']);

    if (SCHEMA_CAPS.liveSessionsHasScheduledAt) {
      query = query.order('scheduled_at', { ascending: true, nullsFirst: false });
    } else {
      query = query.order('created_at', { ascending: true });
    }

    const { data, error } = await query;

    if (error) throw error;
    res.json({ events: data || [] });
  } catch (error) {
    console.error('[Celebrity Events] Error:', error.message);
    if (!MOCK_MODE) {
      return res.status(500).json({ error: 'Service temporarily unavailable' });
    }
    console.log('[Celebrity Events] Falling back to mock data');
    const { celebrity_id } = req.query;
    const demoEvents = [
      { id: 'evt-001', celebrity_id: celebrity_id || 'mock-001', celebrity_name: 'Zinedine Zidane', code: 'ZZ2026', status: 'scheduled', price_cents: 15000, duration_minutes: 30, max_slots: 20, location: 'Paris, France', scheduled_at: '2026-03-15T18:00:00Z', created_at: '2026-02-01T10:00:00Z' },
      { id: 'evt-002', celebrity_id: celebrity_id || 'mock-001', celebrity_name: 'Zinedine Zidane', code: 'ZZ2026B', status: 'active', price_cents: 20000, duration_minutes: 45, max_slots: 10, location: 'Lyon, France', scheduled_at: '2026-02-20T15:00:00Z', created_at: '2026-01-28T14:00:00Z' },
    ].filter(e => e.celebrity_id === celebrity_id);
    res.json({ events: demoEvents });
  }
});

app.post('/api/posts', async (req, res) => {
  try {
    const db = getSupabaseAdmin();
    const { celebrity_id, kind, title, body, media_url, event_date, price_cents } = req.body;

    if (!celebrity_id) return res.status(400).json({ error: 'celebrity_id required' });

    const { data, error } = await db
      .from('posts')
      .insert({
        celebrity_id,
        kind: kind || 'post',
        title: title || null,
        body: body || null,
        media_url: media_url || null,
        event_date: event_date || null,
        price_cents: price_cents || 0,
      })
      .select()
      .single();

    if (error) throw error;
    res.json({ post: data });
  } catch (error) {
    console.error('[Create Post] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/report', async (req, res) => {
  try {
    const db = getSupabaseAdmin();
    const { reporter_id, celebrity_id, reason } = req.body;

    if (!celebrity_id || !reason) {
      return res.status(400).json({ error: 'celebrity_id and reason required' });
    }

    const { data, error } = await db
      .from('reports')
      .insert({ reporter_id: reporter_id || null, celebrity_id, reason })
      .select()
      .single();

    if (error) throw error;
    res.json({ report: data });
  } catch (error) {
    console.error('[Report] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/book-video', async (req, res) => {
  try {
    const stripe = await getStripe();
    const { fan_id, celebrity_id, duration_minutes } = req.body;

    if (!fan_id || !celebrity_id) {
      return res.status(400).json({ error: 'fan_id and celebrity_id required' });
    }

    const user = await verifySupabaseJWT(req);
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (user.id !== fan_id) {
      return res.status(403).json({ error: 'fan_id does not match authenticated user' });
    }

    if (isMockId(celebrity_id) && !MOCK_MODE) {
      return res.status(400).json({ error: 'Mock celebrities are not available' });
    }

    const host = req.headers.host || req.hostname;
    const mockCeleb = isMockCelebrity(celebrity_id);

    if (mockCeleb) {
      const mock = MOCK_CELEBS[celebrity_id];
      const pricing = mock.pricing;
      const dur = duration_minutes || pricing.video_call_duration_minutes || 15;
      let price_cents = pricing.video_call_price_cents;
      if (pricing.video_call_unit === 'minute') {
        price_cents = pricing.video_call_price_cents * dur;
      }
      const mockBookingId = `test-booking-${Date.now()}`;
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: pricing.currency || 'eur',
            product_data: { name: `[TEST] Video Call - ${mock.stage_name} (${dur}min)` },
            unit_amount: price_cents,
          },
          quantity: 1,
        }],
        payment_intent_data: { capture_method: 'manual' },
        metadata: { booking_id: mockBookingId, fan_id, celebrity_id, type: 'video_booking', test_mode: 'true' },
        success_url: `https://${host}/booking-success?booking_id=${mockBookingId}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `https://${host}/celebrity-detail?id=${celebrity_id}`,
      });
      return res.json({ booking_id: mockBookingId, checkout_url: session.url, session_id: session.id });
    }

    const db = getSupabaseAdmin();
    const { data: celeb, error: celebError } = await db
      .from('celebrity_profiles')
      .select('stripe_account_id, stage_name, celebrity_pricing(*)')
      .eq('user_id', celebrity_id)
      .single();

    if (celebError || !celeb) {
      return res.status(404).json({ error: 'Celebrity not found' });
    }

    if (!celeb.stripe_account_id) {
      return res.status(400).json({ error: 'Celebrity has not set up payments' });
    }

    const pricing = celeb.celebrity_pricing?.[0];
    if (!pricing || pricing.video_call_price_cents <= 0) {
      return res.status(400).json({ error: 'Celebrity has not set video call pricing' });
    }

    const dur = duration_minutes || pricing.video_call_duration_minutes || 15;
    let price_cents = pricing.video_call_price_cents;
    if (pricing.video_call_unit === 'minute') {
      price_cents = pricing.video_call_price_cents * dur;
    }

    const signtouch_fee = Math.round(price_cents * 0.15);

    const { data: booking, error: bookingError } = await db
      .from('booking_requests')
      .insert({
        fan_id,
        celebrity_id,
        status: 'pending_payment',
        duration_minutes: dur,
        price_cents,
        currency: pricing.currency || 'eur',
      })
      .select()
      .single();

    if (bookingError) throw bookingError;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: pricing.currency || 'eur',
          product_data: {
            name: `Video Call - ${celeb.stage_name} (${dur}min)`,
          },
          unit_amount: price_cents,
        },
        quantity: 1,
      }],
      payment_intent_data: {
        capture_method: 'manual',
        application_fee_amount: signtouch_fee,
        transfer_data: { destination: celeb.stripe_account_id },
      },
      metadata: {
        booking_id: booking.id,
        fan_id,
        celebrity_id,
        type: 'video_booking',
      },
      success_url: `https://${host}/booking-success?booking_id=${booking.id}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `https://${host}/celebrity-detail?id=${celebrity_id}`,
    });

    await db
      .from('booking_requests')
      .update({ stripe_session_id: session.id })
      .eq('id', booking.id);

    res.json({
      booking_id: booking.id,
      checkout_url: session.url,
      session_id: session.id,
    });
  } catch (error) {
    console.error('[Book Video] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/autograph', async (req, res) => {
  try {
    const stripe = await getStripe();
    const { fan_id, celebrity_id, message } = req.body;

    if (!fan_id || !celebrity_id) {
      return res.status(400).json({ error: 'fan_id and celebrity_id required' });
    }

    const user = await verifySupabaseJWT(req);
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (user.id !== fan_id) {
      return res.status(403).json({ error: 'fan_id does not match authenticated user' });
    }

    if (isMockId(celebrity_id) && !MOCK_MODE) {
      return res.status(400).json({ error: 'Mock celebrities are not available' });
    }

    const host = req.headers.host || req.hostname;
    const mockCeleb = isMockCelebrity(celebrity_id);

    if (mockCeleb) {
      const mock = MOCK_CELEBS[celebrity_id];
      const pricing = mock.pricing;
      const price_cents = pricing.autograph_price_cents;
      const mockAutographId = `test-autograph-${Date.now()}`;
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: pricing.currency || 'eur',
            product_data: { name: `[TEST] Dédicace - ${mock.stage_name}` },
            unit_amount: price_cents,
          },
          quantity: 1,
        }],
        metadata: { autograph_id: mockAutographId, fan_id, celebrity_id, type: 'autograph_request', test_mode: 'true' },
        success_url: `https://${host}/autograph-success?autograph_id=${mockAutographId}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `https://${host}/celebrity-detail?id=${celebrity_id}`,
      });
      return res.json({ autograph_id: mockAutographId, checkout_url: session.url, session_id: session.id });
    }

    const db = getSupabaseAdmin();
    const { data: celeb, error: celebError } = await db
      .from('celebrity_profiles')
      .select('stripe_account_id, stage_name, celebrity_pricing(*)')
      .eq('user_id', celebrity_id)
      .single();

    if (celebError || !celeb) {
      return res.status(404).json({ error: 'Celebrity not found' });
    }

    if (!celeb.stripe_account_id) {
      return res.status(400).json({ error: 'Celebrity has not set up payments' });
    }

    const pricing = celeb.celebrity_pricing?.[0];
    if (!pricing || pricing.autograph_price_cents <= 0) {
      return res.status(400).json({ error: 'Celebrity has not set autograph pricing' });
    }

    const price_cents = pricing.autograph_price_cents;
    const signtouch_fee = Math.round(price_cents * 0.15);

    const { data: autograph, error: autographError } = await db
      .from('autograph_requests')
      .insert({
        fan_id,
        celebrity_id,
        message: message || null,
        status: 'pending_payment',
        price_cents,
        currency: pricing.currency || 'eur',
      })
      .select()
      .single();

    if (autographError) throw autographError;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: pricing.currency || 'eur',
          product_data: {
            name: `Dédicace - ${celeb.stage_name}`,
          },
          unit_amount: price_cents,
        },
        quantity: 1,
      }],
      payment_intent_data: {
        application_fee_amount: signtouch_fee,
        transfer_data: { destination: celeb.stripe_account_id },
      },
      metadata: {
        autograph_id: autograph.id,
        fan_id,
        celebrity_id,
        type: 'autograph_request',
      },
      success_url: `https://${host}/autograph-success?autograph_id=${autograph.id}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `https://${host}/celebrity-detail?id=${celebrity_id}`,
    });

    await db
      .from('autograph_requests')
      .update({ stripe_session_id: session.id })
      .eq('id', autograph.id);

    res.json({
      autograph_id: autograph.id,
      checkout_url: session.url,
      session_id: session.id,
    });
  } catch (error) {
    console.error('[Autograph] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/my-bookings', async (req, res) => {
  try {
    const db = getSupabaseAdmin();
    const { user_id, role } = req.query;
    if (!user_id) return res.status(400).json({ error: 'user_id required' });

    const column = role === 'celebrity' ? 'celebrity_id' : 'fan_id';
    const { data, error } = await db
      .from('booking_requests')
      .select(`
        *,
        celebrity_profiles!booking_requests_celebrity_id_fkey(stage_name, wikidata_image_url,
          ${profilesJoin()}
        ),
        profiles!booking_requests_fan_id_fkey(${profilesSelect()})
      `)
      .eq(column, user_id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ bookings: data || [] });
  } catch (error) {
    console.error('[My Bookings] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/my-autographs', async (req, res) => {
  try {
    const db = getSupabaseAdmin();
    const { user_id, role } = req.query;
    if (!user_id) return res.status(400).json({ error: 'user_id required' });

    const column = role === 'celebrity' ? 'celebrity_id' : 'fan_id';
    const { data, error } = await db
      .from('autograph_requests')
      .select(`
        *,
        celebrity_profiles!autograph_requests_celebrity_id_fkey(stage_name, wikidata_image_url,
          ${profilesJoin()}
        ),
        profiles!autograph_requests_fan_id_fkey(${profilesSelect()})
      `)
      .eq(column, user_id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ autographs: data || [] });
  } catch (error) {
    console.error('[My Autographs] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/update-booking-status', async (req, res) => {
  try {
    const db = getSupabaseAdmin();
    const { booking_id, status } = req.body;
    if (!booking_id || !status) return res.status(400).json({ error: 'booking_id and status required' });

    const update = { status, updated_at: new Date().toISOString() };
    if (status === 'completed') update.completed_at = new Date().toISOString();

    const { data, error } = await db
      .from('booking_requests')
      .update(update)
      .eq('id', booking_id)
      .select()
      .single();

    if (error) throw error;
    res.json({ booking: data });
  } catch (error) {
    console.error('[Update Booking] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/update-autograph-status', async (req, res) => {
  try {
    const db = getSupabaseAdmin();
    const { autograph_id, status, delivery_url } = req.body;
    if (!autograph_id || !status) return res.status(400).json({ error: 'autograph_id and status required' });

    const update = { status, updated_at: new Date().toISOString() };
    if (delivery_url) update.delivery_url = delivery_url;

    const { data, error } = await db
      .from('autograph_requests')
      .update(update)
      .eq('id', autograph_id)
      .select()
      .single();

    if (error) throw error;
    res.json({ autograph: data });
  } catch (error) {
    console.error('[Update Autograph] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// --- Contrôle de sécurité des liens de site web saisis par les célébrités ---
// Bloque les liens vers du contenu interdit (mots-clés) + vérifie via Google Safe
// Browsing (arnaques, virus, phishing) si la clé GOOGLE_SAFE_BROWSING_KEY est définie.
const BLOCKED_SITE_KEYWORDS = [
  'porn', 'porno', 'xxx', 'xnxx', 'xvideos', 'pornhub', 'redtube', 'youporn',
  'brazzers', 'onlyfans', 'camgirl', 'camsex', 'hentai', 'rule34', 'escort',
  'adultwork', 'nsfw', 'fuckbook', 'pedo', 'childporn', 'lolita', 'jailbait',
  'underage', 'preteen', 'inceste', 'rape',
];

async function checkWebsiteSafety(rawUrl) {
  if (!rawUrl || !String(rawUrl).trim()) return { ok: true };
  let url = String(rawUrl).trim();
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

  let parsed;
  try { parsed = new URL(url); } catch {
    return { ok: false, reason: 'invalid_url', message: "L'adresse du site n'est pas valide." };
  }
  if (!/^https?:$/.test(parsed.protocol)) {
    return { ok: false, reason: 'invalid_url', message: 'Le lien doit commencer par http:// ou https://.' };
  }

  const haystack = (parsed.hostname + parsed.pathname + parsed.search).toLowerCase();
  for (const kw of BLOCKED_SITE_KEYWORDS) {
    if (haystack.includes(kw)) {
      return { ok: false, reason: 'blocked_content', message: 'Ce lien a été refusé : il semble pointer vers un contenu interdit.' };
    }
  }

  const key = process.env.GOOGLE_SAFE_BROWSING_KEY;
  if (key) {
    try {
      const resp = await fetch('https://safebrowsing.googleapis.com/v4/threatMatches:find?key=' + key, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client: { clientId: 'plyz', clientVersion: '1.0' },
          threatInfo: {
            threatTypes: ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE', 'POTENTIALLY_HARMFUL_APPLICATION'],
            platformTypes: ['ANY_PLATFORM'],
            threatEntryTypes: ['URL'],
            threatEntries: [{ url }],
          },
        }),
      });
      const data = await resp.json();
      if (data && Array.isArray(data.matches) && data.matches.length > 0) {
        return { ok: false, reason: 'unsafe_site', message: 'Ce lien a été signalé comme dangereux (arnaque ou virus) par Google et a été refusé.' };
      }
    } catch (e) {
      console.warn('[SafeBrowsing] vérification ignorée:', e.message);
    }
  }
  return { ok: true, normalized: url };
}

app.post('/api/upsert-celebrity-profile', async (req, res) => {
  try {
    const db = getSupabaseAdmin();
    const { user_id, stage_name, bio, website } = req.body;
    if (!user_id || !stage_name) return res.status(400).json({ error: 'user_id and stage_name required' });

    let safeWebsite = website || null;
    if (website && String(website).trim()) {
      const check = await checkWebsiteSafety(website);
      if (!check.ok) return res.status(400).json({ error: check.reason, message: check.message });
      safeWebsite = check.normalized || website;
    }

    const { error: profileError } = await db
      .from('profiles')
      .upsert({ id: user_id, role: 'celebrity', updated_at: new Date().toISOString() }, { onConflict: 'id' });
    if (profileError) throw profileError;

    const { data, error } = await db
      .from('celebrity_profiles')
      .upsert({
        user_id,
        stage_name,
        bio: bio || null,
        website: safeWebsite,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })
      .select()
      .single();

    if (error) throw error;
    res.json({ profile: data });
  } catch (error) {
    console.error('[Upsert Celebrity Profile] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/upsert-celebrity-pricing', async (req, res) => {
  try {
    const db = getSupabaseAdmin();
    const { user_id, video_call_price_cents, video_call_unit, video_call_duration_minutes, autograph_price_cents, live_dedication_price_cents, currency } = req.body;
    if (!user_id) return res.status(400).json({ error: 'user_id required' });

    const { data, error } = await db
      .from('celebrity_pricing')
      .upsert({
        user_id,
        video_call_price_cents: video_call_price_cents || 0,
        video_call_unit: video_call_unit || 'session',
        video_call_duration_minutes: video_call_duration_minutes || 15,
        autograph_price_cents: autograph_price_cents || 0,
        live_dedication_price_cents: live_dedication_price_cents || 0,
        currency: currency || 'eur',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })
      .select()
      .single();

    if (error) throw error;
    res.json({ pricing: data });
  } catch (error) {
    console.error('[Upsert Celebrity Pricing] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/update-celebrity-profile', async (req, res) => {
  try {
    const db = getSupabaseAdmin();
    const { user_id, website, bio, stage_name } = req.body;
    if (!user_id) return res.status(400).json({ error: 'user_id required' });

    // Ne met à jour que les champs réellement fournis (mise à jour partielle).
    const fields = { updated_at: new Date().toISOString() };
    if (website !== undefined) {
      if (website && String(website).trim()) {
        const check = await checkWebsiteSafety(website);
        if (!check.ok) return res.status(400).json({ error: check.reason, message: check.message });
        fields.website = check.normalized || website;
      } else {
        fields.website = website; // vide/null = la célébrité efface son site (autorisé)
      }
    }
    if (bio !== undefined) fields.bio = bio;
    if (stage_name !== undefined) fields.stage_name = stage_name;

    const { data: existing } = await db
      .from('celebrity_profiles')
      .select('user_id')
      .eq('user_id', user_id)
      .maybeSingle();

    let data, error;
    if (existing) {
      ({ data, error } = await db
        .from('celebrity_profiles')
        .update(fields)
        .eq('user_id', user_id)
        .select()
        .single());
    } else {
      // Pas encore de profil célébrité : on le crée (nécessite un nom public).
      if (!stage_name) return res.status(400).json({ error: 'stage_name required to create profile' });
      await db
        .from('profiles')
        .upsert({ id: user_id, role: 'celebrity', updated_at: new Date().toISOString() }, { onConflict: 'id' });
      ({ data, error } = await db
        .from('celebrity_profiles')
        .insert({ user_id, ...fields })
        .select()
        .single());
    }

    if (error) throw error;
    res.json({ profile: data });
  } catch (error) {
    console.error('[Update Celebrity Profile] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Upload de la photo de profil célébrité -> Storage + profiles.avatar_url (servi au profil public)
app.post('/api/upload-celebrity-avatar', async (req, res) => {
  try {
    const authUser = await verifySupabaseJWT(req);
    if (!authUser) return res.status(401).json({ error: 'Authentication required' });

    const { user_id, image_base64, content_type } = req.body;
    if (!user_id || !image_base64) return res.status(400).json({ error: 'Missing required fields' });
    if (user_id !== authUser.id) return res.status(403).json({ error: 'user_id does not match authenticated user' });

    const db = getSupabaseAdmin();
    const isPng = (content_type || '').includes('png');
    const ext = isPng ? 'png' : 'jpg';
    const cleanB64 = String(image_base64).replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(cleanB64, 'base64');
    const path = `avatars/${user_id}-${Date.now()}.${ext}`;

    const { error: upErr } = await db.storage.from('events').upload(path, buffer, {
      contentType: content_type || 'image/jpeg',
      upsert: true,
    });
    if (upErr) throw upErr;

    const { data: pub } = db.storage.from('events').getPublicUrl(path);
    const avatarUrl = pub.publicUrl;

    // Le profil public lit profiles.avatar_url -> on l'y enregistre.
    const { error: profErr } = await db
      .from('profiles')
      .upsert({ id: user_id, avatar_url: avatarUrl, updated_at: new Date().toISOString() }, { onConflict: 'id' });
    if (profErr) throw profErr;

    res.json({ success: true, avatar_url: avatarUrl });
  } catch (error) {
    console.error('[upload-celebrity-avatar]', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/my-celebrity-pricing', async (req, res) => {
  try {
    const db = getSupabaseAdmin();
    const { user_id } = req.query;
    if (!user_id) return res.status(400).json({ error: 'user_id required' });

    const { data: pricing } = await db
      .from('celebrity_pricing')
      .select('*')
      .eq('user_id', user_id)
      .single();

    const { data: profile } = await db
      .from('celebrity_profiles')
      .select('website')
      .eq('user_id', user_id)
      .single();

    res.json({ pricing: pricing || null, website: profile?.website || '' });
  } catch (error) {
    console.error('[My Celebrity Pricing] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/wikidata/search', async (req, res) => {
  try {
    const { query: q, lang } = req.query;
    if (!q) return res.status(400).json({ error: 'query required' });
    const language = lang || 'en';

    const url = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(q)}&language=${language}&limit=5&format=json`;
    const response = await fetch(url);
    const data = await response.json();

    const candidates = (data.search || []).map(item => ({
      wikidata_id: item.id,
      label: item.label,
      description: item.description || '',
    }));

    res.json({ candidates });
  } catch (error) {
    console.error('[Wikidata Search] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/wikidata/entity/:id', async (req, res) => {
  try {
    const db = getSupabaseAdmin();
    const { id } = req.params;

    const { data: cached } = await db
      .from('wikidata_entities')
      .select('*')
      .eq('wikidata_id', id)
      .single();

    const oneDay = 24 * 60 * 60 * 1000;
    if (cached && cached.updated_at && (Date.now() - new Date(cached.updated_at).getTime()) < oneDay) {
      return res.json({ entity: cached, source: 'cache' });
    }

    const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${id}&props=labels|descriptions|claims|sitelinks&languages=en|fr&format=json`;
    const response = await fetch(url);
    const data = await response.json();
    const entity = data.entities?.[id];
    if (!entity) return res.status(404).json({ error: 'Entity not found' });

    const label = entity.labels?.en?.value || entity.labels?.fr?.value || id;
    const description = entity.descriptions?.en?.value || entity.descriptions?.fr?.value || '';

    let image_url = null;
    const imageClaimValues = entity.claims?.P18;
    if (imageClaimValues && imageClaimValues.length > 0) {
      const fileName = imageClaimValues[0].mainsnak?.datavalue?.value;
      if (fileName) {
        const encodedName = encodeURIComponent(fileName.replace(/ /g, '_'));
        image_url = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodedName}?width=400`;
      }
    }

    let wikipedia_url = null;
    if (entity.sitelinks?.enwiki) {
      wikipedia_url = `https://en.wikipedia.org/wiki/${encodeURIComponent(entity.sitelinks.enwiki.title)}`;
    } else if (entity.sitelinks?.frwiki) {
      wikipedia_url = `https://fr.wikipedia.org/wiki/${encodeURIComponent(entity.sitelinks.frwiki.title)}`;
    }

    const occupations = [];
    const occupationClaims = entity.claims?.P106 || [];
    for (const claim of occupationClaims.slice(0, 5)) {
      const occId = claim.mainsnak?.datavalue?.value?.id;
      if (occId) occupations.push(occId);
    }

    const types = [];
    const instanceOfClaims = entity.claims?.P31 || [];
    for (const claim of instanceOfClaims.slice(0, 5)) {
      const typeId = claim.mainsnak?.datavalue?.value?.id;
      if (typeId) types.push(typeId);
    }

    const entityRecord = {
      wikidata_id: id,
      label,
      description,
      image_url,
      wikipedia_url,
      occupations,
      types,
      updated_at: new Date().toISOString(),
    };

    await db.from('wikidata_entities').upsert(entityRecord, { onConflict: 'wikidata_id' });

    res.json({ entity: entityRecord, source: 'wikidata' });
  } catch (error) {
    console.error('[Wikidata Entity] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/wikidata/sync-celebrity', async (req, res) => {
  try {
    const db = getSupabaseAdmin();
    const { celebrity_id, wikidata_id } = req.body;
    if (!celebrity_id || !wikidata_id) return res.status(400).json({ error: 'celebrity_id and wikidata_id required' });

    const entityRes = await fetch(`http://localhost:${5000}/api/wikidata/entity/${wikidata_id}`);
    const entityData = await entityRes.json();
    if (!entityData.entity) return res.status(404).json({ error: 'Wikidata entity not found' });

    const ent = entityData.entity;
    const { error } = await db
      .from('celebrity_profiles')
      .update({
        wikidata_id: ent.wikidata_id,
        wikidata_label: ent.label,
        wikipedia_url: ent.wikipedia_url,
        wikidata_image_url: ent.image_url,
        wikidata_occupations: ent.occupations,
        wikidata_types: ent.types,
        wikidata_confidence: 100,
        wikidata_last_sync: new Date().toISOString(),
        official_verified: true,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', celebrity_id);

    if (error) throw error;
    console.log(`[Wikidata Sync] Auto-verified celebrity ${celebrity_id} (found on Wikidata: ${ent.wikidata_id})`);
    res.json({ success: true, entity: ent, auto_verified: true });
  } catch (error) {
    console.error('[Wikidata Sync] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/verify-booking-payment', async (req, res) => {
  try {
    const db = getSupabaseAdmin();
    const stripe = await getStripe();
    const { booking_id, session_id } = req.query;
    if (!session_id) return res.status(400).json({ error: 'session_id required' });

    const checkoutSession = await stripe.checkout.sessions.retrieve(session_id);
    const pi = checkoutSession.payment_intent;
    const paymentIntent = pi ? await stripe.paymentIntents.retrieve(pi) : null;

    const authorized = paymentIntent?.status === 'requires_capture';
    const paid = checkoutSession.payment_status === 'paid' || paymentIntent?.status === 'succeeded';

    if ((authorized || paid) && booking_id) {
      await db
        .from('booking_requests')
        .update({
          status: authorized ? 'paid' : 'paid',
          stripe_payment_intent_id: pi,
          updated_at: new Date().toISOString(),
        })
        .eq('id', booking_id);
    }

    res.json({ authorized, paid, status: paymentIntent?.status || checkoutSession.payment_status });
  } catch (error) {
    console.error('[Verify Booking] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// Organization Verification Endpoints
// ============================================================

app.post('/api/org-verification-request', async (req, res) => {
  try {
    const {
      user_id, org_name, org_type, official_website,
      contact_email, representative_name, representative_role,
      proof_description, proof_url, social_links
    } = req.body;

    if (!user_id || !org_name || !org_type || !contact_email || !representative_name) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const validTypes = ['sports_club', 'brand', 'association', 'media', 'label', 'agency', 'other'];
    if (!validTypes.includes(org_type)) {
      return res.status(400).json({ error: 'Invalid organization type' });
    }

    const supabase = getSupabaseAdmin();

    const { data: existing } = await supabase
      .from('organization_verification_requests')
      .select('id, status')
      .eq('user_id', user_id)
      .in('status', ['pending', 'approved'])
      .limit(1);

    if (existing && existing.length > 0) {
      const req = existing[0];
      if (req.status === 'approved') {
        return res.status(409).json({ error: 'already_verified', message: 'Your organization is already verified' });
      }
      return res.status(409).json({ error: 'request_pending', message: 'A verification request is already pending' });
    }

    const { data, error } = await supabase
      .from('organization_verification_requests')
      .insert({
        user_id,
        org_name,
        org_type,
        official_website: official_website || null,
        contact_email,
        representative_name,
        representative_role: representative_role || null,
        proof_description: proof_description || null,
        proof_url: proof_url || null,
        social_links: social_links || {},
        status: 'pending',
      })
      .select()
      .single();

    if (error) throw error;

    await supabase
      .from('celebrity_profiles')
      .update({ account_type: 'organization' })
      .eq('user_id', user_id);

    res.json({ success: true, request: data });
  } catch (error) {
    console.error('[org-verification-request]', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/org-verification-status', async (req, res) => {
  try {
    const { user_id } = req.query;
    if (!user_id) return res.status(400).json({ error: 'user_id required' });

    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from('organization_verification_requests')
      .select('*')
      .eq('user_id', user_id)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) throw error;

    if (!data || data.length === 0) {
      return res.json({ has_request: false, status: null });
    }

    const request = data[0];
    res.json({
      has_request: true,
      status: request.status,
      org_name: request.org_name,
      org_type: request.org_type,
      admin_notes: request.admin_notes,
      created_at: request.created_at,
      reviewed_at: request.reviewed_at,
    });
  } catch (error) {
    console.error('[org-verification-status]', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/creator-verification-request', async (req, res) => {
  try {
    const authUser = await verifySupabaseJWT(req);
    if (!authUser) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const {
      user_id, display_name, primary_platform, platform_links,
      follower_count, content_category, additional_info
    } = req.body;

    if (!user_id || !display_name || !primary_platform) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (user_id !== authUser.id) {
      return res.status(403).json({ error: 'user_id does not match authenticated user' });
    }

    const validPlatforms = ['twitch', 'youtube', 'tiktok', 'instagram', 'x'];
    if (!validPlatforms.includes(primary_platform)) {
      return res.status(400).json({ error: 'Invalid platform' });
    }

    if (!platform_links || Object.keys(platform_links).length === 0) {
      return res.status(400).json({ error: 'At least one platform link is required' });
    }

    const supabase = getSupabaseAdmin();

    const { data: existing } = await supabase
      .from('creator_verification_requests')
      .select('id, status')
      .eq('user_id', user_id)
      .in('status', ['pending', 'approved'])
      .limit(1);

    if (existing && existing.length > 0) {
      const req = existing[0];
      if (req.status === 'approved') {
        return res.status(409).json({ error: 'already_verified', message: 'Your creator profile is already verified' });
      }
      return res.status(409).json({ error: 'request_pending', message: 'A verification request is already pending' });
    }

    const validLinkPattern = /^https?:\/\/(www\.)?(twitch\.tv|youtube\.com|tiktok\.com|instagram\.com|x\.com|twitter\.com)\//i;
    const hasValidLinks = Object.values(platform_links).some(link => validLinkPattern.test(link));
    const followerNum = parseInt(follower_count, 10) || 0;
    const autoApproved = hasValidLinks && followerNum >= 10000;
    const assignedStatus = autoApproved ? 'approved' : 'pending';

    const { data, error } = await supabase
      .from('creator_verification_requests')
      .insert({
        user_id,
        display_name,
        primary_platform,
        platform_links: platform_links || {},
        follower_count: follower_count || null,
        content_category: content_category || null,
        additional_info: additional_info || null,
        status: assignedStatus,
        ...(autoApproved ? { reviewed_at: new Date().toISOString(), admin_notes: 'Auto-approved: valid social links + 10,000+ followers' } : {}),
      })
      .select()
      .single();

    if (error) throw error;

    if (autoApproved) {
      await supabase
        .from('celebrity_profiles')
        .update({ official_verified: true, updated_at: new Date().toISOString() })
        .eq('user_id', user_id);
      console.log(`[Creator Verification] Auto-approved ${display_name} (${followerNum} followers)`);
    }

    res.json({ success: true, request: data, auto_approved: autoApproved });
  } catch (error) {
    console.error('[creator-verification-request]', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/creator-verification-status', async (req, res) => {
  try {
    const { user_id } = req.query;
    if (!user_id) return res.status(400).json({ error: 'user_id required' });

    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from('creator_verification_requests')
      .select('*')
      .eq('user_id', user_id)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) throw error;

    if (!data || data.length === 0) {
      return res.json({ has_request: false, status: null });
    }

    const request = data[0];
    res.json({
      has_request: true,
      status: request.status,
      display_name: request.display_name,
      primary_platform: request.primary_platform,
      admin_notes: request.admin_notes,
      created_at: request.created_at,
      reviewed_at: request.reviewed_at,
    });
  } catch (error) {
    console.error('[creator-verification-status]', error);
    res.status(500).json({ error: error.message });
  }
});

// --- Vérification "personnalité publique" (sportif / acteur / chanteur / artiste) ---
app.post('/api/celebrity-verification-request', async (req, res) => {
  try {
    const authUser = await verifySupabaseJWT(req);
    if (!authUser) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { user_id, display_name, category, proof_links, additional_info } = req.body;

    if (!user_id || !display_name || !category) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (user_id !== authUser.id) {
      return res.status(403).json({ error: 'user_id does not match authenticated user' });
    }

    const validCategories = ['athlete', 'actor', 'singer', 'artist', 'other'];
    if (!validCategories.includes(category)) {
      return res.status(400).json({ error: 'Invalid category' });
    }

    const supabase = getSupabaseAdmin();

    const { data: existing } = await supabase
      .from('celebrity_verification_requests')
      .select('id, status')
      .eq('user_id', user_id)
      .in('status', ['pending', 'approved'])
      .limit(1);

    if (existing && existing.length > 0) {
      const r = existing[0];
      if (r.status === 'approved') {
        return res.status(409).json({ error: 'already_verified', message: 'Your profile is already verified' });
      }
      return res.status(409).json({ error: 'request_pending', message: 'A verification request is already pending' });
    }

    const { data, error } = await supabase
      .from('celebrity_verification_requests')
      .insert({
        user_id,
        display_name,
        category,
        proof_links: proof_links || {},
        additional_info: additional_info || null,
        status: 'pending',
      })
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, request: data });
  } catch (error) {
    console.error('[celebrity-verification-request]', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/celebrity-verification-status', async (req, res) => {
  try {
    const { user_id } = req.query;
    if (!user_id) return res.status(400).json({ error: 'user_id required' });

    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from('celebrity_verification_requests')
      .select('*')
      .eq('user_id', user_id)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) throw error;

    if (!data || data.length === 0) {
      return res.json({ has_request: false, status: null });
    }

    const request = data[0];
    res.json({
      has_request: true,
      status: request.status,
      display_name: request.display_name,
      category: request.category,
      admin_notes: request.admin_notes,
      created_at: request.created_at,
      reviewed_at: request.reviewed_at,
    });
  } catch (error) {
    console.error('[celebrity-verification-status]', error);
    res.status(500).json({ error: error.message });
  }
});

// Signalement d'un problème : envoie un e-mail au support (jc@clickzou.fr).
app.post('/api/report-problem', async (req, res) => {
  try {
    const { subject, message, userEmail, platform, appVersion } = req.body || {};
    if (!message || !String(message).trim()) {
      return res.status(400).json({ error: 'message_required' });
    }

    const transporter = getMailTransporter();
    if (!transporter) {
      // SMTP non configuré sur le serveur : l'app basculera sur le mailto de secours.
      return res.status(503).json({ error: 'email_not_configured' });
    }

    const subjectLine = subject && String(subject).trim()
      ? `[Plyz] ${String(subject).trim()}`
      : '[Plyz] Signalement d\'un problème';

    const body =
      `${String(message).trim()}\n\n` +
      `------------------------------\n` +
      `Envoyé depuis l'application Plyz\n` +
      `Compte : ${userEmail || 'non connecté'}\n` +
      `Plateforme : ${platform || 'inconnue'}\n` +
      `Version : ${appVersion || '1.0.0'}`;

    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: SUPPORT_EMAIL,
      replyTo: userEmail || undefined,
      subject: subjectLine,
      text: body,
    });

    res.json({ success: true });
  } catch (error) {
    console.error('[report-problem]', error);
    res.status(500).json({ error: error.message });
  }
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
      proxyReq.removeHeader('referer');
      proxyReq.setHeader('host', `localhost:${EXPO_PORT}`);
    },
    onProxyReqWs: (proxyReq) => {
      proxyReq.removeHeader('origin');
      proxyReq.removeHeader('referer');
      proxyReq.setHeader('host', `localhost:${EXPO_PORT}`);
    },
  })
);


app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Server] Running on port ${PORT} (API + proxy to Expo on ${EXPO_PORT})`);
  detectSchema();
  getStripe()
    .then(() => console.log('[Server] Stripe credentials loaded successfully'))
    .catch((err) => console.warn('[Server] Warning: Stripe credentials will be loaded on first request:', err.message));
});
