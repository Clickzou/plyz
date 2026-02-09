const express = require('express');
const cors = require('cors');
const Stripe = require('stripe');

const app = express();

let stripeClient = null;

async function getStripeCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? 'depl ' + process.env.WEB_REPL_RENEWAL
      : null;

  if (!xReplitToken || !hostname) {
    if (process.env.STRIPE_SECRET_KEY) {
      console.log('[Stripe] Using STRIPE_SECRET_KEY from env');
      return { secretKey: process.env.STRIPE_SECRET_KEY };
    }
    throw new Error('No Stripe credentials available');
  }

  const isProduction = process.env.REPLIT_DEPLOYMENT === '1';
  const targetEnvironment = isProduction ? 'production' : 'development';

  const url = new URL(`https://${hostname}/api/v2/connection`);
  url.searchParams.set('include_secrets', 'true');
  url.searchParams.set('connector_names', 'stripe');
  url.searchParams.set('environment', targetEnvironment);

  const response = await fetch(url.toString(), {
    headers: {
      'Accept': 'application/json',
      'X_REPLIT_TOKEN': xReplitToken
    }
  });

  const data = await response.json();
  const connectionSettings = data.items?.[0];

  if (!connectionSettings?.settings?.secret) {
    throw new Error(`Stripe ${targetEnvironment} connection not found`);
  }

  return {
    secretKey: connectionSettings.settings.secret,
    publishableKey: connectionSettings.settings.publishable,
  };
}

async function getStripe() {
  if (!stripeClient) {
    const { secretKey } = await getStripeCredentials();
    stripeClient = new Stripe(secretKey);
  }
  return stripeClient;
}

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
}));

app.post('/api/stripe-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    const stripe = await getStripe();
    if (webhookSecret && sig) {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } else {
      event = JSON.parse(req.body.toString());
    }
  } catch (err) {
    console.error('[Webhook] Signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log('[Webhook] Event received:', event.type);

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const { session_id, fan_id, celebrity_id } = session.metadata || {};

    console.log('[Webhook] Payment completed for session:', session_id, 'fan:', fan_id);
  }

  res.json({ received: true });
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

app.post('/api/create-connect-account', async (req, res) => {
  try {
    const stripe = await getStripe();
    const { celebrityName, celebrityEmail, celebrityId } = req.body;

    if (!celebrityEmail) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const account = await stripe.accounts.create({
      type: 'express',
      country: 'FR',
      email: celebrityEmail,
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

    console.log('[Connect] Account created:', account.id, 'for:', celebrityEmail);

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

    res.json({
      id: account.id,
      charges_enabled: account.charges_enabled,
      payouts_enabled: account.payouts_enabled,
      details_submitted: account.details_submitted,
      onboarding_complete: account.charges_enabled && account.payouts_enabled,
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

    const signTouchFeeCents = Math.round(priceCents * 0.30);

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
      success_url: successUrl || `${req.headers.origin || 'https://signtouch.app'}/payment-success?checkout_session_id={CHECKOUT_SESSION_ID}&live_session_id=${sessionId}&celebrity_id=${celebrityId}`,
      cancel_url: cancelUrl || `${req.headers.origin || 'https://signtouch.app'}/payment-cancel`,
    };

    if (celebrityStripeAccountId) {
      sessionParams.payment_intent_data = {
        application_fee_amount: signTouchFeeCents,
        transfer_data: {
          destination: celebrityStripeAccountId,
        },
      };
    }

    const checkoutSession = await stripe.checkout.sessions.create(sessionParams);

    console.log('[Checkout] Session created:', checkoutSession.id, 'for live session:', sessionId);

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

const PORT = process.env.STRIPE_SERVER_PORT || 3001;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Stripe Server] Running on port ${PORT}`);
  getStripe()
    .then(() => console.log('[Stripe Server] Stripe credentials loaded successfully'))
    .catch((err) => console.warn('[Stripe Server] Warning: Stripe credentials will be loaded on first request:', err.message));
});
