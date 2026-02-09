const express = require('express');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
}));

app.post('/api/stripe-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
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

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', stripe: !!process.env.STRIPE_SECRET_KEY });
});

app.post('/api/create-checkout-session', async (req, res) => {
  try {
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
  console.log(`[Stripe Server] Stripe key configured: ${!!process.env.STRIPE_SECRET_KEY}`);
});
