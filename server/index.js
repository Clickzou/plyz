const express = require('express');
const cors = require('cors');
const Stripe = require('stripe');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();

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

app.get('/api/test-supabase-insert', async (req, res) => {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      return res.json({ error: 'Missing Supabase credentials', url: !!supabaseUrl, key: !!supabaseKey });
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const { data: readTest, error: readError } = await supabase
      .from('live_sessions')
      .select('id')
      .limit(1);
    
    const { data, error } = await supabase
      .from('live_sessions')
      .insert({
        code: 'TEST99',
        celebrity_id: 'test_debug',
        celebrity_name: 'Test Debug',
        duration_minutes: 5,
        duration_per_fan_minutes: 5,
        max_slots: 1,
        price_cents: 0,
        status: 'waiting',
      })
      .select()
      .single();
    
    if (data) {
      await supabase.from('live_sessions').delete().eq('id', data.id);
    }
    
    res.json({ 
      readTest: { data: readTest, error: readError },
      insertTest: { data: data ? { id: data.id, code: data.code } : null, error },
      cleaned: !!data
    });
  } catch (e) {
    res.json({ error: e.message, stack: e.stack });
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

    if (!account.charges_enabled) {
      console.error('[Checkout] Blocked: charges_enabled=false for', celebrityStripeAccountId);
      return res.status(403).json({
        error: 'Celebrity account cannot accept payments yet. Onboarding must be completed.',
        code: 'CHARGES_NOT_ENABLED',
      });
    }

    if (!account.payouts_enabled) {
      console.error('[Checkout] Blocked: payouts_enabled=false for', celebrityStripeAccountId);
      return res.status(403).json({
        error: 'Celebrity account cannot receive payouts yet. Onboarding must be completed.',
        code: 'PAYOUTS_NOT_ENABLED',
      });
    }

    const signTouchFeeCents = Math.round(priceCents * 0.15);

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
      payment_intent_data: {
        application_fee_amount: signTouchFeeCents,
        transfer_data: {
          destination: celebrityStripeAccountId,
        },
      },
      success_url: successUrl || `${req.headers.origin || 'https://signtouch.app'}/payment-success?checkout_session_id={CHECKOUT_SESSION_ID}&live_session_id=${sessionId}&celebrity_id=${celebrityId}`,
      cancel_url: cancelUrl || `${req.headers.origin || 'https://signtouch.app'}/payment-cancel`,
    };

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

    res.json({
      paid: session.payment_status === 'paid',
      status: session.payment_status,
      metadata: session.metadata,
    });
  } catch (error) {
    console.error('[Verify] Error:', error.message);
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
  })
);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Server] Running on port ${PORT} (API + proxy to Expo on ${EXPO_PORT})`);
  getStripe()
    .then(() => console.log('[Server] Stripe credentials loaded successfully'))
    .catch((err) => console.warn('[Server] Warning: Stripe credentials will be loaded on first request:', err.message));
});
