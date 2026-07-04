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

// ============================================================
// Alertes de service : enregistre un incident (Claude limite atteinte, Stripe,
// Supabase, e-mail...) dans la table service_alerts ET envoie un e-mail à
// l'admin (throttlé : au plus 1 e-mail / heure / service pour éviter le spam).
// Consultable sur le tableau de bord (carte « État des services »).
// ============================================================
// Analyse IA (texte FR) d'une alerte : ce qui s'est passé, intention, risque, action.
// Réutilisée par l'auto-analyse et par l'endpoint manuel de ré-analyse.
async function analyzeAlertText(service, severity, message) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  try {
    const system = `Tu es un analyste sécurité pour l'application Plyz (marketplace de prestations de célébrités : appels vidéo, dédicaces, paiements Stripe, base Supabase). On te donne une alerte technique/sécurité. Réponds en FRANÇAIS, clair pour un non-technicien, en 4 sections courtes :
1) CE QUI S'EST PASSÉ : explique simplement ce que la personne a tenté.
2) INTENTION PROBABLE : quel était vraisemblablement son but.
3) RISQUE : a-t-elle pu réussir/accéder à des données ? niveau (faible/moyen/élevé) et pourquoi.
4) ACTION RECOMMANDÉE : quoi faire concrètement.
Sois factuel, ne dramatise pas. N'invente pas de détails absents de l'alerte.`;
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001', max_tokens: 700,
        system: [{ type: 'text', text: system }],
        messages: [{ role: 'user', content: `Alerte à analyser :\nService : ${service || 'inconnu'}\nGravité : ${severity || 'inconnue'}\nDétail : ${message || '(vide)'}` }],
      }),
    });
    const j = await r.json();
    if (j.error || !j.content || !j.content[0] || !j.content[0].text) return null;
    return j.content[0].text.trim();
  } catch (e) { console.error('[analyzeAlertText]', e.message); return null; }
}

// Auto-analyse DÉDUPLIQUÉE : 1 seul appel Claude par TYPE d'alerte (signature =
// service + début du message), réutilisé pour toutes les suivantes → tient même
// avec des milliers d'alertes sans exploser les coûts / la limite Claude.
const _analysisCache = {};
async function autoAnalyzeAlert(id, service, severity, message) {
  try {
    const sig = service + '|' + String(message || '').slice(0, 80);
    if (!(sig in _analysisCache)) {
      _analysisCache[sig] = await analyzeAlertText(service, severity, message); // en cache même si null
    }
    const text = _analysisCache[sig];
    if (text) await getSupabaseAdmin().from('service_alerts').update({ analysis: text }).eq('id', id);
  } catch (e) { console.error('[autoAnalyzeAlert]', e.message); }
}

const _alertEmailThrottle = {};
async function recordServiceAlert(service, severity, message) {
  const msg = String(message == null ? '' : message).slice(0, 1000);
  let insertedId = null;
  try {
    const { data } = await getSupabaseAdmin().from('service_alerts').insert({ service, severity: severity || 'warning', message: msg }).select('id').single();
    insertedId = data ? data.id : null;
    console.warn('[Alert]', service, '-', severity, '-', msg);
  } catch (e) { console.error('[Alert] insert failed:', e.message); }
  // Auto-analyse IA en tâche de fond (non bloquant, dédupliqué par type)
  if (insertedId) autoAnalyzeAlert(insertedId, service, severity, msg);
  try {
    const now = Date.now();
    if (_alertEmailThrottle[service] && (now - _alertEmailThrottle[service]) < 3600000) return;
    _alertEmailThrottle[service] = now;
    const transporter = getMailTransporter();
    if (!transporter) return;
    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: SUPPORT_EMAIL,
      subject: `[Plyz] ⚠️ Alerte service : ${service}`,
      text:
        `Une alerte vient d'être déclenchée sur Plyz.\n\n` +
        `Service : ${service}\n` +
        `Gravité : ${severity || 'warning'}\n` +
        `Détail : ${msg}\n` +
        `Heure : ${new Date().toISOString()}\n\n` +
        `→ Tableau de bord : https://plyz.io/tableaustats`,
    });
    console.log('[Alert] email sent for', service);
  } catch (e) { console.error('[Alert] email failed:', e.message); }
}

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

// Modération d'image via Claude vision (couvre le contenu sexuel ET la violence/
// guerre/armes/haine — ce que le modèle NSFW local ne détecte pas). Réutilise
// ANTHROPIC_API_KEY (déjà présent pour la traduction). Renvoie null en cas
// d'indisponibilité/erreur → le code appelant retombe sur le modèle local.
async function moderateImageWithClaude(imageBuffer, mimeType) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  try {
    let mt = String(mimeType || 'image/jpeg').toLowerCase();
    if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mt)) mt = 'image/jpeg';
    const b64 = imageBuffer.toString('base64');
    const system = `You are an image content-moderation classifier for a public social app where verified public figures post profile photos and news posts. Decide whether an image is allowed to be published.
BLOCK (unsafe) if the image contains any of:
- sexual or pornographic content, explicit nudity, or sexually suggestive content
- graphic violence, gore, blood, serious injuries, death, or war scenes
- weapons shown in a threatening or violent context
- hate symbols, extremist or terrorist content
- other clearly illegal content
ALLOW (safe) ordinary photos: portraits, selfies, sport, concerts, events, landscapes, everyday non-graphic scenes.
Respond ONLY with a compact JSON object: {"safe": boolean, "category": "sexual"|"violence"|"hate"|"illegal"|"none", "reason": "<=8 words"}.`;
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 100,
        system: [{ type: 'text', text: system }],
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: mt, data: b64 } },
          { type: 'text', text: 'Classify this image for publication.' },
        ] }],
      }),
    });
    const j = await resp.json();
    if (j.error) {
      const et = j.error.type || '', em = j.error.message || '';
      // On alerte seulement sur une VRAIE panne de service (quota/limite/auth/surcharge),
      // pas sur une image invalide ponctuelle.
      if (['rate_limit_error', 'overloaded_error', 'authentication_error', 'api_error'].includes(et)
          || /credit|quota|balance|limit/i.test(em)) {
        recordServiceAlert('anthropic', 'critical', 'Claude indisponible — la MODÉRATION des images est dégradée : ' + (em || et));
      }
      return null;
    }
    if (!j.content || !j.content[0] || !j.content[0].text) return null;
    let txt = j.content[0].text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const parsed = JSON.parse(txt);
    if (typeof parsed.safe !== 'boolean') return null;
    return {
      safe: parsed.safe,
      engine: 'claude',
      reason: parsed.safe ? null : (parsed.category || parsed.reason || 'inappropriate_content'),
    };
  } catch (e) {
    console.error('[Moderation/Claude] error:', e.message);
    return null;
  }
}

async function moderateImage(imageBuffer, mimeType) {
  // 1) Claude vision en priorité (sexuel + violence/guerre/haine)
  const claude = await moderateImageWithClaude(imageBuffer, mimeType);
  if (claude) {
    console.log('[Moderation] Claude verdict →', claude.safe ? 'OK' : ('BLOCKED (' + claude.reason + ')'));
    return claude;
  }

  // 2) Repli : modèle NSFW local (contenu sexuel uniquement), si disponible
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

// True si la plateforme tourne sur une clé Stripe de TEST (sk_test_...).
// Sert à la règle anti-casse C2 : en TEST on tolère (warning) quand une donnée
// de vérification de propriété est introuvable ; en LIVE on refuse (403).
function isStripeTestMode() {
  try {
    return getStripeCredentials().secretKey.startsWith('sk_test_');
  } catch (e) {
    return false; // par sécurité, en cas de doute on est en mode strict (LIVE)
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

// ---------------------------------------------------------------------------
// Notifications push Expo (envoyées DEPUIS le serveur, plus fiables que depuis
// le téléphone de la célébrité qui peut fermer l'app juste après la dédicace).
// API Expo : POST https://exp.host/--/api/v2/push/send (accepte un tableau).
// Utilise fetch natif (Node 18+). Ne throw jamais : best-effort.
// ---------------------------------------------------------------------------
async function sendExpoPush(pushTokens, title, body, data = {}) {
  try {
    const tokens = Array.isArray(pushTokens) ? pushTokens : [pushTokens];
    const unique = [...new Set(tokens.filter((t) => typeof t === 'string' && t.length > 0))];
    if (unique.length === 0) {
      console.log('[Push] No valid push token, skipping');
      return;
    }

    const messages = unique.map((to) => ({
      to,
      sound: 'default',
      priority: 'high',
      channelId: 'default',
      title,
      body,
      data,
    }));

    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });

    const result = await response.json().catch(() => null);
    console.log(`[Push] Sent ${messages.length} notification(s) "${title}"`, result?.data ? '(ok)' : '');
  } catch (err) {
    console.error('[Push] sendExpoPush error:', err.message);
  }
}

let stripeClient = null;

function getStripeCredentials() {
  // DÉFAUT = TEST. Le mode LIVE ne s'active QUE si STRIPE_MODE === 'live'
  // (sécurité absolue : jamais de live par accident).
  const mode = process.env.STRIPE_MODE === 'live' ? 'live' : 'test';

  let userKey;
  if (mode === 'live') {
    userKey = process.env.SECRET_KEY_LIVE_STRIPE || process.env.STRIPE_SECRET_KEY_LIVE;

    // Garde-fou : live demandé mais clé absente ou clé de test → on bloque.
    if (!userKey || userKey.startsWith('sk_test_')) {
      throw new Error('STRIPE_MODE=live mais cle live absente ou invalide (sk_test_)');
    }
  } else {
    userKey = process.env.STRIPE_TEST_SECRET_KEY || process.env.STRIPE_SECRET_KEY;

    if (!userKey) {
      throw new Error('No Stripe credentials available. Set STRIPE_TEST_SECRET_KEY or STRIPE_SECRET_KEY.');
    }

    // Garde-fou : mode test mais clé live fournie → on alerte sans bloquer.
    if (userKey.startsWith('sk_live_')) {
      console.warn('[Stripe] ALERTE : STRIPE_MODE=test mais une cle sk_live_ est fournie (paiements REELS).');
    }
  }

  const keyPrefix = userKey.substring(0, 8);
  console.log(`[Stripe] MODE=${mode} key=${keyPrefix}...`);

  return { secretKey: userKey, mode };
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
    logSecurityEvent(req, 'webhook Stripe falsifié', 'signature invalide (tentative de forge ou mauvaise config)');
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

      // Facture pour les DÉDICACES AUTOGRAPHE (capture immédiate) — best-effort, idempotent.
      // Les autres prestations (appel vidéo, dédicace événement) sont facturées à leur
      // point de capture ; l'autographe est encaissé tout de suite, donc facturé ici.
      if (session.metadata?.type === 'autograph_request'
          && session.payment_status === 'paid'
          && session.metadata?.test_mode !== 'true') {
        try {
          const db = getSupabaseAdmin();
          const meta = session.metadata;
          if (meta.autograph_id) {
            await db.from('autograph_requests').update({ status: 'paid' }).eq('id', meta.autograph_id);
          }
          await createInvoice({
            transactionRef: 'autograph_' + (meta.autograph_id || session.id),
            fanId: meta.fan_id || null,
            celebrityId: meta.celebrity_id || null,
            prestationType: 'autograph',
            prestationLabel: 'Dédicace (autographe)',
            amountCents: session.amount_total,
            currency: session.currency,
          });
          console.log('[Webhook] Autograph invoice generated for', meta.autograph_id || session.id);
        } catch (e) { console.error('[Webhook] autograph invoice error:', e.message); }
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

// ============================================================
// SEND EMAIL HOOK Supabase — envoie les emails d'authentification (code OTP)
// dans la LANGUE du fan (user_metadata.preferred_language), via nodemailer.
// Défini AVANT express.json car la vérification de signature a besoin du corps BRUT.
// ============================================================
let AUTH_EMAIL_I18N = {};
try { AUTH_EMAIL_I18N = require('./auth-email-i18n.json'); }
catch (e) { console.warn('[AuthEmail] auth-email-i18n.json introuvable'); }

function verifyStandardWebhook(secret, id, timestamp, signatureHeader, body) {
  try {
    if (!secret) return false;
    const key = String(secret).replace(/^v1,/, '').replace(/^whsec_/, '');
    const secretBytes = Buffer.from(key, 'base64');
    const signed = `${id}.${timestamp}.${body}`;
    const expected = require('crypto').createHmac('sha256', secretBytes).update(signed).digest('base64');
    const sigs = String(signatureHeader || '').split(' ').map((s) => s.split(',')[1]).filter(Boolean);
    return sigs.some((s) => {
      try { return require('crypto').timingSafeEqual(Buffer.from(s), Buffer.from(expected)); } catch { return false; }
    });
  } catch { return false; }
}

app.post('/api/auth-email-hook', express.raw({ type: '*/*' }), async (req, res) => {
  try {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8')
      : (typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {}));
    const secret = process.env.SEND_EMAIL_HOOK_SECRET;
    if (secret) {
      const ok = verifyStandardWebhook(secret, req.headers['webhook-id'], req.headers['webhook-timestamp'], req.headers['webhook-signature'], raw);
      if (!ok) { console.warn('[AuthEmail] signature invalide'); return res.status(401).json({ error: 'invalid_signature' }); }
    }
    const payload = JSON.parse(raw);
    const user = payload.user || {};
    const ed = payload.email_data || {};
    const email = user.email;
    const code = ed.token || ed.otp || '';
    if (!email || !code) return res.status(200).json({}); // rien à envoyer (ex: type non géré)
    const lang = (user.user_metadata && user.user_metadata.preferred_language) || 'fr';
    const tpl = AUTH_EMAIL_I18N[lang] || AUTH_EMAIL_I18N.fr || { subject: 'Ton code de connexion Plyz', body: '{{code}}' };
    const bodyRaw = String(tpl.body);
    const text = bodyRaw.replace(/\{\{code\}\}/g, code);
    // Version HTML habillée (logo Plyz + code stylé), traduite. On garde le corps
    // traduit et on remplace {{code}} par un bloc code bien visible.
    const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const codeBlock = `<div style="font-size:34px;font-weight:800;letter-spacing:8px;background:#f4f4f5;border-radius:12px;padding:18px 0;text-align:center;color:#0f172a;margin:18px 0;">${esc(code)}</div>`;
    const bodyHtml = esc(bodyRaw).replace(/\{\{code\}\}/g, codeBlock).replace(/\n/g, '<br>');
    const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0f172a;">
<div style="text-align:center;padding:6px 0 24px;"><img src="https://plyz-app.replit.app/plyz-logo-email.png" alt="Plyz" style="height:40px"></div>
<div style="font-size:15px;line-height:1.6;">${bodyHtml}</div>
<div style="margin-top:22px;border-top:1px solid #eee;padding-top:12px;color:#94a3b8;font-size:12px;text-align:center;">Plyz — CLICKZOU (SAS), Toulouse</div>
</div>`;
    const transporter = getMailTransporter();
    if (!transporter) { console.warn('[AuthEmail] SMTP non configuré'); return res.status(500).json({ error: 'smtp_unavailable' }); }
    // ⏱️ Supabase impose une réponse < 5s : on répond IMMÉDIATEMENT puis on envoie
    // l'email en arrière-plan (le SMTP Zoho peut être lent, surtout au 1er envoi).
    res.status(200).json({});
    transporter.sendMail({
      from: process.env.SMTP_FROM || `Plyz <${process.env.SMTP_USER}>`,
      to: email,
      subject: tpl.subject,
      text,
      html,
    }).then(() => console.log('[AuthEmail] code envoyé à', email, '| langue:', lang))
      .catch((e) => console.error('[AuthEmail] send failed:', e.message));
    return;
  } catch (e) {
    console.error('[auth-email-hook] error:', e.message);
    return res.status(500).json({ error: e.message });
  }
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
    // 🔒 IDOR — AUTH + PROPRIÉTÉ : la session est TOUJOURS créée au nom de
    // l'utilisateur authentifié. On ignore tout celebrity_id du body (un appelant
    // ne peut pas créer une session pour le compte d'autrui).
    const authUser = await verifySupabaseJWT(req);
    if (!authUser) return res.status(401).json({ error: 'unauthorized' });

    const {
      celebrity_name,
      duration_minutes,
      duration_per_fan_minutes = 5,
      max_slots,
      price_cents = 0,
      cover_photo_url = null,
      scheduled_at = null
    } = req.body;

    // FORCÉ : la célébrité est l'utilisateur authentifié (jamais le body).
    const celebrity_id = authUser.id;

    if (!celebrity_name || !duration_minutes || !max_slots) {
      return res.status(400).json({ error: 'Missing required fields: celebrity_name, duration_minutes, max_slots' });
    }

    // 🔒 IDOR — Le compte Stripe destinataire est rechargé depuis la base
    // (celebrity_profiles.stripe_account_id de l'appelant), JAMAIS depuis le body
    // (sinon détournement des fonds vers un compte Stripe arbitraire).
    let celebrity_stripe_account_id = null;
    try {
      const { data: celebProfile } = await getSupabaseAdmin()
        .from('celebrity_profiles')
        .select('stripe_account_id')
        .eq('user_id', celebrity_id)
        .maybeSingle();
      celebrity_stripe_account_id = celebProfile?.stripe_account_id || null;
    } catch (stripeErr) {
      console.warn('[create-session] stripe_account_id lookup failed:', stripeErr.message);
    }

    // Sécurité : seul un compte vérifié (célébrité, créateur ou club) peut créer une session vidéo.
    // En cas d'erreur de vérification, on ne bloque pas (pour ne pas casser le service).
    try {
      const adminClient = getSupabaseAdmin();
      // Même source de vérité que les événements dédicace : la fonction is_user_verified
      // (3 tables *_verification_requests 'approved' + l'admin jc@clickzou.fr).
      const { data: verified, error: vErr } = await adminClient.rpc('is_user_verified', { uid: celebrity_id });
      if (!vErr && verified !== true) {
        return res.status(403).json({
          error: 'not_verified',
          message: 'Votre compte doit être vérifié (célébrité, créateur ou club) pour créer une session.',
        });
      }
      if (vErr) {
        console.error('[create-session] is_user_verified RPC error (allowing through):', vErr.message);
      }
    } catch (verifErr) {
      console.error('[create-session] verification check failed (allowing through):', verifErr);
    }

    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    // La colonne duration_per_fan_minutes est NUMERIC : on garde la valeur REELLE, y compris les
    // demi-minutes (ex 0.5 = 30 s), demandee pour les sessions courtes (club de sport, 30 s/fan...).
    // On borne juste a un minimum de securite (0.25 min = 15 s) pour ne jamais stocker 0.
    const durationPerFanValue = Math.max(0.25, Number(duration_per_fan_minutes) || 5);

    const insertData = {
      code,
      celebrity_id,
      celebrity_name,
      duration_minutes,
      duration_per_fan_minutes: durationPerFanValue,
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

    let { data, error } = await getSupabaseAdmin()
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

    // 🔒 IDOR — AUTH + PROPRIÉTÉ : seule la célébrité hôte peut lancer sa session.
    const authUser = await verifySupabaseJWT(req);
    if (!authUser) return res.status(401).json({ error: 'unauthorized' });

    const { data: currentSession } = await supabase
      .from('live_sessions')
      .select('*')
      .eq('id', session_id)
      .single();

    if (!currentSession) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (String(currentSession.celebrity_id) !== String(authUser.id)) {
      return res.status(403).json({ error: 'Not the host of this session' });
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

    // 🔒 IDOR — AUTH : JWT obligatoire. Ownership : si l'appelant a déjà un compte
    // Stripe en base, l'account_id demandé doit être le sien. Si aucun compte n'est
    // encore enregistré (onboarding en cours, account fraîchement créé côté Stripe),
    // on tolère pour ne pas casser le flux d'onboarding.
    const authUser = await verifySupabaseJWT(req);
    if (!authUser) return res.status(401).json({ error: 'unauthorized' });
    try {
      const { data: prof } = await getSupabaseAdmin()
        .from('celebrity_profiles')
        .select('stripe_account_id')
        .eq('user_id', authUser.id)
        .maybeSingle();
      if (prof?.stripe_account_id && String(prof.stripe_account_id) !== String(account_id)) {
        return res.status(403).json({ error: 'forbidden' });
      }
    } catch (ownErr) {
      console.warn('[Connect] ownership check failed (allowing, onboarding):', ownErr.message);
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

// Logo Plyz servi pour les e-mails (fond clair, texte foncé). Fichier livré avec
// le serveur → URL stable https://plyz-app.replit.app/plyz-logo-email.png
app.get('/plyz-logo-email.png', (req, res) => {
  res.set('Cache-Control', 'public, max-age=86400');
  res.sendFile(path.join(__dirname, 'plyz-logo-email.png'));
});

// [DIAG] Indique quel compte Stripe le serveur DÉPLOYÉ utilise réellement + si
// Connect répond. Ne renvoie que le PRÉFIXE (14 car.) de la clé = partie qui
// identifie le compte (non secret, présent aussi dans la clé publique).
app.get('/api/_diag/stripe', async (req, res) => {
  try {
    const { secretKey, mode } = getStripeCredentials();
    const stripe = await getStripe();
    let connectOk = false, connectError = null;
    try {
      await stripe.accounts.list({ limit: 1 });
      connectOk = true;
    } catch (e) { connectError = e.message; }
    res.json({ mode, keyPrefix: String(secretKey).substring(0, 14), connectOk, connectError });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/create-checkout-session', async (req, res) => {
  try {
    const stripe = await getStripe();
    const {
      sessionId,
      celebrityId,
      fanId,
      currency = 'eur',
      successUrl,
      cancelUrl,
    } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'Missing session ID' });
    }

    const stripeKey = getStripeCredentials().secretKey;
    const isTestMode = stripeKey.startsWith('sk_test_');

    // 🔒 SÉCURITÉ : le prix et le compte destinataire sont rechargés depuis la base,
    // JAMAIS depuis le client (sinon un fan pourrait payer 0€ ou détourner les fonds
    // vers son propre compte Stripe en falsifiant le corps de la requête).
    const adminDb = getSupabaseAdmin();
    const { data: liveSession } = await adminDb
      .from('live_sessions')
      .select('price_cents, celebrity_id, celebrity_name, celebrity_stripe_account_id')
      .eq('id', sessionId)
      .maybeSingle();

    let priceCents, celebrityStripeAccountId, celebrityName;
    if (liveSession) {
      priceCents = liveSession.price_cents;
      celebrityName = liveSession.celebrity_name;
      // Destinataire fiable : on privilégie le compte Stripe du profil célébrité
      // (source de vérité protégée), avec repli sur celui stocké dans la session.
      const { data: celebProfile } = await adminDb
        .from('celebrity_profiles')
        .select('stripe_account_id')
        .eq('user_id', liveSession.celebrity_id)
        .maybeSingle();
      celebrityStripeAccountId = celebProfile?.stripe_account_id || liveSession.celebrity_stripe_account_id;
    } else if (isTestMode) {
      // Mode TEST uniquement : session non persistée en base → on tolère les valeurs client.
      priceCents = req.body.priceCents;
      celebrityStripeAccountId = req.body.celebrityStripeAccountId;
      celebrityName = req.body.celebrityName;
      console.warn('[Checkout] TEST: live session not found in DB, falling back to client values for', sessionId);
    } else {
      return res.status(404).json({ error: 'Live session not found' });
    }

    if (!priceCents || priceCents < 200) {
      return res.status(400).json({ error: 'Minimum price is 2€ (200 cents)' });
    }

    if (!celebrityStripeAccountId) {
      return res.status(400).json({ error: 'Celebrity Stripe account is required for paid sessions' });
    }

    const account = await stripe.accounts.retrieve(celebrityStripeAccountId);

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

    // 🔒 C2 — AUTH + PROPRIÉTÉ : seule la célébrité hôte du live peut capturer.
    // On remonte checkout_session_id → session_queue → live_sessions.celebrity_id.
    const authUser = await verifySupabaseJWT(req);
    if (!authUser) return res.status(401).json({ error: 'Authentication required' });
    {
      const admin = getSupabaseAdmin();
      const { data: qEntry } = await admin
        .from('session_queue')
        .select('session_id')
        .eq('checkout_session_id', checkout_session_id)
        .maybeSingle();
      let ownerCelebId = null;
      if (qEntry?.session_id) {
        const { data: live } = await admin
          .from('live_sessions')
          .select('celebrity_id')
          .eq('id', qEntry.session_id)
          .maybeSingle();
        ownerCelebId = live?.celebrity_id || null;
      }
      if (!ownerCelebId) {
        if (isStripeTestMode()) {
          console.warn('[Capture] TEST: owner introuvable pour checkout', checkout_session_id, '→ toléré');
        } else {
          return res.status(403).json({ error: 'Ownership could not be verified' });
        }
      } else if (String(ownerCelebId) !== String(authUser.id)) {
        return res.status(403).json({ error: 'Not the owner of this session' });
      }
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

    // 🔒 C2 — AUTH + PROPRIÉTÉ : appelé par la célébrité hôte OU par le fan.
    // Autorisé si user == celebrity de la session OU user == fan de l'entrée.
    const authUser = await verifySupabaseJWT(req);
    if (!authUser) return res.status(401).json({ error: 'Authentication required' });
    {
      const admin = getSupabaseAdmin();
      const { data: qEntry } = await admin
        .from('session_queue')
        .select('session_id, fan_id')
        .eq('checkout_session_id', checkout_session_id)
        .maybeSingle();
      let ownerCelebId = null;
      if (qEntry?.session_id) {
        const { data: live } = await admin
          .from('live_sessions')
          .select('celebrity_id')
          .eq('id', qEntry.session_id)
          .maybeSingle();
        ownerCelebId = live?.celebrity_id || null;
      }
      const isCeleb = ownerCelebId && String(ownerCelebId) === String(authUser.id);
      const isFan = qEntry?.fan_id && String(qEntry.fan_id) === String(authUser.id);
      if (!qEntry) {
        if (isStripeTestMode()) {
          console.warn('[Cancel] TEST: entrée introuvable pour checkout', checkout_session_id, '→ toléré (user authentifié)');
        } else {
          return res.status(403).json({ error: 'Ownership could not be verified' });
        }
      } else if (!isCeleb && !isFan) {
        return res.status(403).json({ error: 'Not authorized to cancel this payment' });
      }
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

// ---------------------------------------------------------------------------
// POST /api/end-fan-call
// Déclenché par la célébrité à la fin (ou à l'annulation) d'un échange avec un
// fan. Capture le paiement si l'appel a eu lieu, le libère sinon. FIABLE :
// idempotent + compare-and-set anti-race AVANT l'appel Stripe.
// Body : { queueEntryId, callHappened: boolean, sessionId }
// ---------------------------------------------------------------------------
app.post('/api/end-fan-call', async (req, res) => {
  const { queueEntryId, callHappened, sessionId } = req.body || {};
  try {
    if (!queueEntryId) {
      return res.status(400).json({ ok: false, error: 'Missing queueEntryId' });
    }
    if (typeof callHappened !== 'boolean') {
      return res.status(400).json({ ok: false, error: 'Missing or invalid callHappened (boolean)' });
    }

    const supabase = getSupabaseAdmin();
    const stripe = await getStripe();

    // 🔒 C2 — AUTH + PROPRIÉTÉ : seule la célébrité hôte peut terminer l'appel et
    // déclencher la capture/release. queueEntryId → session_queue → live_sessions.
    const authUser = await verifySupabaseJWT(req);
    if (!authUser) return res.status(401).json({ ok: false, error: 'Authentication required' });
    {
      const { data: qOwn } = await supabase
        .from('session_queue')
        .select('session_id')
        .eq('id', queueEntryId)
        .maybeSingle();
      let ownerCelebId = null;
      if (qOwn?.session_id) {
        const { data: live } = await supabase
          .from('live_sessions')
          .select('celebrity_id')
          .eq('id', qOwn.session_id)
          .maybeSingle();
        ownerCelebId = live?.celebrity_id || null;
      }
      if (!ownerCelebId) {
        if (isStripeTestMode()) {
          console.warn('[EndFanCall] TEST: owner introuvable pour entry', queueEntryId, '→ toléré');
        } else {
          return res.status(403).json({ ok: false, error: 'Ownership could not be verified' });
        }
      } else if (String(ownerCelebId) !== String(authUser.id)) {
        return res.status(403).json({ ok: false, error: 'Not the owner of this session' });
      }
    }

    // 1. Lire l'entrée session_queue
    const { data: entry, error: readError } = await supabase
      .from('session_queue')
      .select('id, checkout_session_id, payment_intent_id, payment_captured, session_id, status')
      .eq('id', queueEntryId)
      .single();

    if (readError || !entry) {
      console.error('[EndFanCall] Queue entry not found:', queueEntryId, readError?.message);
      return res.status(404).json({ ok: false, error: 'queue_entry_not_found' });
    }

    console.log(
      `[EndFanCall] entry=${queueEntryId} session=${entry.session_id} callHappened=${callHappened} ` +
      `captured=${entry.payment_captured} checkout=${entry.checkout_session_id || 'none'} pi=${entry.payment_intent_id || 'none'}`
    );

    // 2. IDEMPOTENCE : déjà capturé -> no-op
    if (entry.payment_captured === true) {
      console.log('[EndFanCall] Already captured, idempotent no-op:', queueEntryId);
      return res.json({ ok: true, captured: true, already: true });
    }

    // 3. Pas de checkout_session_id -> session gratuite / pas de paiement
    if (!entry.checkout_session_id) {
      console.log('[EndFanCall] No checkout_session_id (free session), no payment:', queueEntryId);
      return res.json({ ok: true, captured: false, reason: 'no_payment' });
    }

    // 4. Résoudre le PaymentIntent (le persister s'il manque)
    let paymentIntentId = entry.payment_intent_id;
    if (!paymentIntentId) {
      const checkoutSession = await stripe.checkout.sessions.retrieve(entry.checkout_session_id);
      paymentIntentId = checkoutSession.payment_intent;
      if (!paymentIntentId) {
        console.log('[EndFanCall] No payment_intent on checkout session (no payment):', entry.checkout_session_id);
        return res.json({ ok: true, captured: false, reason: 'no_payment' });
      }
      await supabase
        .from('session_queue')
        .update({ payment_intent_id: paymentIntentId })
        .eq('id', queueEntryId);
      console.log('[EndFanCall] Resolved & persisted payment_intent:', paymentIntentId);
    }

    // 5. DÉCISION
    if (callHappened === true) {
      // --- CAPTURE ---
      // Compare-and-set anti-race AVANT Stripe : ne capture que si pas déjà capturé.
      const { data: claimed, error: claimError } = await supabase
        .from('session_queue')
        .update({ payment_captured: true })
        .eq('id', queueEntryId)
        .not('payment_captured', 'is', true)
        .select('id');

      if (claimError) {
        console.error('[EndFanCall] Compare-and-set error:', claimError.message);
        return res.status(500).json({ ok: false, error: claimError.message });
      }

      // 0 ligne modifiée -> un autre process a déjà capturé
      if (!claimed || claimed.length === 0) {
        console.log('[EndFanCall] Lost the race, already captured by another process:', queueEntryId);
        return res.json({ ok: true, captured: true, already: true });
      }

      // On a remporté le verrou : capturer côté Stripe
      try {
        const pi = await stripe.paymentIntents.retrieve(paymentIntentId);

        if (pi.status === 'requires_capture') {
          const captured = await stripe.paymentIntents.capture(paymentIntentId);
          console.log('[EndFanCall] Payment captured:', paymentIntentId, '| Amount:', captured.amount, captured.currency);
          // Facture (best-effort : n'interrompt jamais l'encaissement)
          try {
            const { data: qf } = await supabase.from('session_queue').select('fan_id, session_id, push_token').eq('id', queueEntryId).maybeSingle();
            let celebId = null;
            if (qf?.session_id) {
              const { data: ls } = await supabase.from('live_sessions').select('celebrity_id').eq('id', qf.session_id).maybeSingle();
              celebId = ls?.celebrity_id || null;
            }
            await createInvoice({
              transactionRef: 'vc_' + queueEntryId,
              fanId: qf?.fan_id || null,
              celebrityId: celebId,
              prestationType: 'video_call',
              prestationLabel: 'Appel vidéo privé',
              amountCents: captured.amount,
              currency: captured.currency,
            });
            // Invite le fan à noter sa rencontre (best-effort, ne bloque rien)
            if (qf?.push_token) {
              sendExpoPush([qf.push_token], 'Plyz', '⭐ Comment s\'est passée ta rencontre ? Laisse une note à la personnalité.', { type: 'rate_prestation', queueEntryId });
            }
          } catch (invErr) { console.error('[EndFanCall] invoice/notif error:', invErr.message); }
        } else if (pi.status === 'succeeded') {
          console.log('[EndFanCall] PaymentIntent already succeeded (idempotent OK):', paymentIntentId);
        } else if (pi.status === 'canceled') {
          // Impossible de capturer : on remet le flag à false (release du verrou)
          await supabase
            .from('session_queue')
            .update({ payment_captured: false })
            .eq('id', queueEntryId);
          console.error('[EndFanCall] PaymentIntent already canceled, cannot capture:', paymentIntentId);
          return res.json({ ok: false, error: 'already_canceled' });
        } else {
          // Statut inattendu (requires_payment_method, etc.) : on relâche le verrou
          await supabase
            .from('session_queue')
            .update({ payment_captured: false })
            .eq('id', queueEntryId);
          console.error('[EndFanCall] Cannot capture, unexpected status:', pi.status, paymentIntentId);
          return res.json({ ok: false, error: `cannot_capture_status_${pi.status}` });
        }
      } catch (stripeErr) {
        // L'appel Stripe a échoué : relâcher le verrou pour permettre un retry
        await supabase
          .from('session_queue')
          .update({ payment_captured: false })
          .eq('id', queueEntryId);
        console.error('[EndFanCall] Stripe capture error (lock released):', stripeErr.message);
        return res.status(500).json({ ok: false, error: stripeErr.message });
      }

      return res.json({ ok: true, captured: true });
    } else {
      // --- RELEASE (cancel) ---
      // payment_captured reste false ; on libère l'autorisation.
      const pi = await stripe.paymentIntents.retrieve(paymentIntentId);

      if (pi.status === 'succeeded') {
        // Déjà capturé côté Stripe : impossible d'annuler proprement -> no-op.
        console.log('[EndFanCall] PaymentIntent already succeeded, cannot release:', paymentIntentId);
        return res.json({ ok: true, captured: false, released: false, reason: 'already_succeeded' });
      }

      if (pi.status === 'canceled') {
        console.log('[EndFanCall] PaymentIntent already canceled (no-op):', paymentIntentId);
        return res.json({ ok: true, captured: false, released: true, already: true });
      }

      const canceled = await stripe.paymentIntents.cancel(paymentIntentId);
      console.log('[EndFanCall] Payment released (canceled):', canceled.id);
      return res.json({ ok: true, captured: false, released: true });
    }
  } catch (error) {
    console.error('[EndFanCall] Error:', error?.message || error);
    return res.status(500).json({ ok: false, error: error?.message || 'internal_error' });
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

    // 🔒 IDOR — AUTH + PROPRIÉTÉ : seule la célébrité de la session lit ses gains.
    const authUser = await verifySupabaseJWT(req);
    if (!authUser) return res.status(401).json({ error: 'unauthorized' });

    const { data: session } = await supabase
      .from('live_sessions')
      .select('celebrity_id, price_cents')
      .eq('id', session_id)
      .single();

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (String(session.celebrity_id) !== String(authUser.id)) {
      return res.status(403).json({ error: 'forbidden' });
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

    // 🔒 IDOR — AUTH + PROPRIÉTÉ : une célébrité ne lit QUE ses propres gains.
    const authUser = await verifySupabaseJWT(req);
    if (!authUser) return res.status(401).json({ error: 'unauthorized' });
    if (String(celebrity_id) !== String(authUser.id)) {
      return res.status(403).json({ error: 'forbidden' });
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

    // ---- MOIS CIVIL EN COURS : helper commun (année + mois locaux) ----------
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth();
    const isCurrentMonth = (dateStr) => {
      if (!dateStr) return false;
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return false;
      return d.getFullYear() === curYear && d.getMonth() === curMonth;
    };

    // ---- VIDÉO : portion du mois civil courant (même base que sessionStats) --
    // On réutilise sessionStats (déjà 85% appliqué) et la date ended_at|created_at,
    // cohérent avec le calcul historique côté client de my-earnings/account.
    let videoMonthCents = 0;
    for (const s of sessionStats) {
      const ref = s.ended_at || s.created_at;
      if (isCurrentMonth(ref)) {
        videoMonthCents += s.session_earnings_cents || 0;
      }
    }

    // ---- DÉDICACES : revenus des événements créés par cette célébrité --------
    // Modèle : event_paid_fans (paiements capturés) ⋈ event_sessions via
    // event_session_id = event_sessions.id. On ne garde que les événements dont
    // created_by = authUser.id. Montant brut = amount_cents capturé ; la célébrité
    // touche 85% (frais plateforme 15%), identique à /api/event-session-earnings.
    // Date de référence = event_paid_fans.created_at (pas de colonne captured_at).
    let dedicationTotalCents = 0;
    let dedicationMonthCents = 0;
    try {
      const admin = getSupabaseAdmin();

      // 1) Événements créés par cette célébrité (id en uuid -> comparé en text).
      const { data: myEvents, error: evErr } = await admin
        .from('event_sessions')
        .select('id')
        .eq('created_by', authUser.id);
      if (evErr) throw new Error(`event_sessions read failed: ${evErr.message}`);

      const myEventIds = (myEvents || []).map((e) => String(e.id));

      if (myEventIds.length > 0) {
        // 2) Paiements dédicace CAPTURÉS rattachés à ces événements.
        const { data: paidRows, error: pErr } = await admin
          .from('event_paid_fans')
          .select('amount_cents, created_at')
          .in('event_session_id', myEventIds)
          .eq('payment_captured', true);
        if (pErr) throw new Error(`event_paid_fans read failed: ${pErr.message}`);

        for (const r of (paidRows || [])) {
          if (typeof r.amount_cents !== 'number') continue; // ignore les null (legacy)
          const gross = r.amount_cents;
          const fee = Math.round(gross * 0.15);
          const net = Math.max(0, gross - fee); // 85% célébrité
          dedicationTotalCents += net;
          if (isCurrentMonth(r.created_at)) {
            dedicationMonthCents += net;
          }
        }
      }
    } catch (dedErr) {
      // Catch silencieux : si le calcul dédicace échoue, on renvoie 0 pour cette
      // portion sans casser la réponse vidéo (rétrocompatible).
      console.warn('[CelebrityEarnings] dedication calc failed:', dedErr.message);
    }

    res.json({
      celebrity_id,
      total_earnings_cents: totalEarningsCents,
      total_fans: totalFans,
      total_sessions: (sessions || []).length,
      estimated_payout_date: nextBusinessDay.toISOString().split('T')[0],
      sessions: sessionStats,
      // --- NOUVEAUX CHAMPS (vidéo + dédicaces) — n'altèrent pas l'existant ---
      video_month_cents: videoMonthCents,
      dedication_total_cents: dedicationTotalCents,
      dedication_month_cents: dedicationMonthCents,
      grand_total_cents: totalEarningsCents + dedicationTotalCents,
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
    const admin = getSupabaseAdmin();
    const { code, event_session_id } = req.body;

    if (!code || !event_session_id) {
      return res.status(400).json({ error: 'Missing code or event_session_id' });
    }

    const upperCode = code.trim().toUpperCase();

    const { data: promos, error } = await admin
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
    const admin = getSupabaseAdmin();
    const { promo_id } = req.body;

    if (!promo_id) {
      return res.status(400).json({ error: 'Missing promo_id' });
    }

    const { data: promo } = await admin
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

    const { data: updated, error } = await admin
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

    console.log('[Connect Express] Creating account with key prefix:', getStripeCredentials().secretKey.substring(0, 12) + '...');

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

    // 🔒 IDOR — AUTH : JWT obligatoire. Ownership : si l'appelant a déjà un compte
    // Stripe en base, l'account_id doit être le sien. Pendant l'onboarding (compte
    // tout juste créé, pas encore en base), on tolère pour ne pas casser le flux.
    const authUser = await verifySupabaseJWT(req);
    if (!authUser) return res.status(401).json({ error: 'unauthorized' });
    try {
      const { data: prof } = await getSupabaseAdmin()
        .from('celebrity_profiles')
        .select('stripe_account_id')
        .eq('user_id', authUser.id)
        .maybeSingle();
      if (prof?.stripe_account_id && String(prof.stripe_account_id) !== String(account_id)) {
        return res.status(403).json({ error: 'forbidden' });
      }
    } catch (ownErr) {
      console.warn('[Connect Express] ownership check failed (allowing, onboarding):', ownErr.message);
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

    // 🔒 C2 — AUTH + PROPRIÉTÉ : seule la célébrité créatrice de l'événement peut
    // définir le prix/destinataire. Vérif via event_sessions.created_by.
    const authUser = await verifySupabaseJWT(req);
    if (!authUser) return res.status(401).json({ error: 'Authentication required' });
    {
      const admin = getSupabaseAdmin();
      const { data: evt } = await admin
        .from('event_sessions')
        .select('created_by')
        .eq('id', eventSessionId)
        .maybeSingle();
      if (!evt) {
        if (isStripeTestMode()) {
          console.warn('[EventPayment] TEST: event introuvable pour config', eventSessionId, '→ toléré');
        } else {
          return res.status(403).json({ error: 'Ownership could not be verified' });
        }
      } else if (String(evt.created_by) !== String(authUser.id)) {
        return res.status(403).json({ error: 'Not the creator of this event' });
      }
    }

    global.eventPaymentConfigs[eventSessionId] = {
      priceCents: priceCents || 0,
      celebrityStripeAccountId: celebrityStripeAccountId || null,
      celebrityName: celebrityName || null,
      creatorId: creatorId || null,
    };

    try {
      const admin = getSupabaseAdmin();
      await admin
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
      const admin = getSupabaseAdmin();
      const { data, error } = await admin
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
    const { eventSessionId, fanId, successUrl, cancelUrl } = req.body;

    if (!eventSessionId) {
      return res.status(400).json({ error: 'Missing event session ID' });
    }

    const stripeKey = getStripeCredentials().secretKey;
    const isTestMode = stripeKey.startsWith('sk_test_');

    // 🔒 SÉCURITÉ : le prix et le compte destinataire viennent de la config serveur
    // (event_payment_configs), JAMAIS du client (sinon paiement à 0€ / détournement).
    const adminDb = getSupabaseAdmin();
    const { data: cfg } = await adminDb
      .from('event_payment_configs')
      .select('price_cents, celebrity_stripe_account_id, celebrity_name')
      .eq('event_session_id', eventSessionId)
      .maybeSingle();

    let priceCents, celebrityStripeAccountId, celebrityName;
    if (cfg) {
      priceCents = cfg.price_cents;
      celebrityStripeAccountId = cfg.celebrity_stripe_account_id;
      celebrityName = cfg.celebrity_name;
    } else if (isTestMode) {
      // Mode TEST uniquement : config absente en base → repli sur les valeurs client.
      priceCents = req.body.priceCents;
      celebrityStripeAccountId = req.body.celebrityStripeAccountId;
      celebrityName = req.body.celebrityName;
      console.warn('[EventCheckout] TEST: payment config not found in DB, falling back to client values for', eventSessionId);
    } else {
      return res.status(404).json({ error: 'Event payment config not found' });
    }

    if (!priceCents || priceCents < 100) {
      return res.status(400).json({ error: 'Minimum price is 1€ (100 cents)' });
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

    // Pré-autorisation SYSTÉMATIQUE (capture différée), comme le flux vidéo.
    // Le débit n'a lieu qu'à la capture en masse (1ère photo). Sans ce flag,
    // Stripe débiterait immédiatement.
    sessionParams.payment_intent_data = { capture_method: 'manual' };

    if (celebrityStripeAccountId) {
      try {
        const account = await stripe.accounts.retrieve(celebrityStripeAccountId);
        const canTransfer = account.charges_enabled && (account.capabilities?.transfers === 'active' || account.capabilities?.legacy_payments === 'active');

        if (canTransfer) {
          sessionParams.payment_intent_data.application_fee_amount = signTouchFeeCents;
          sessionParams.payment_intent_data.transfer_data = {
            destination: celebrityStripeAccountId,
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

    // push_token : optionnel, sert à notifier le fan en cas de remboursement
    // (événement terminé sans dédicace). Accepté en query OU body.
    const pushToken = req.query.push_token || req.body?.push_token || null;

    const session = await stripe.checkout.sessions.retrieve(checkout_session_id);
    const eventSessionId = session.metadata?.event_session_id;
    const fanId = session.metadata?.fan_id;
    const paymentIntentId = session.payment_intent || null;

    // Avec capture manuelle, payment_status reste 'unpaid' mais le PI passe
    // 'requires_capture' (autorisé). On considère le paiement AUTORISÉ dans
    // les deux cas.
    let piStatus = null;
    if (paymentIntentId) {
      try {
        const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
        piStatus = pi.status;
      } catch (piErr) {
        console.warn('[EventPayment] Could not retrieve PaymentIntent:', piErr.message);
      }
    }
    const authorized = session.payment_status === 'paid' || piStatus === 'requires_capture';

    if (authorized && eventSessionId && fanId) {
      const key = `${eventSessionId}_${fanId}`;
      global.eventPaidRecords[key] = { paid: true, checkoutSessionId: checkout_session_id, paidAt: new Date().toISOString() };
      console.log('[EventPayment] Recorded paid access (memory):', key);

      // Persistance durable (le registre mémoire est volatile sur Replit).
      try {
        const admin = getSupabaseAdmin();
        const upsertRow = {
          event_session_id: eventSessionId,
          fan_id: fanId,
          checkout_session_id: checkout_session_id,
          payment_intent_id: paymentIntentId,
          payment_captured: false,
        };
        // N'écrase le push_token QUE s'il est fourni (sinon on garde l'existant).
        if (pushToken) upsertRow.push_token = pushToken;
        // Montant payé par le fan (centimes). Comme push_token : on ne l'écrit
        // que s'il est disponible, pour ne pas écraser une valeur existante.
        if (typeof session.amount_total === 'number') upsertRow.amount_cents = session.amount_total;
        const { error: upsertErr } = await admin
          .from('event_paid_fans')
          .upsert(upsertRow, { onConflict: 'event_session_id,fan_id' });
        if (upsertErr) {
          console.error('[EventPayment] event_paid_fans upsert error:', upsertErr.message);
        } else {
          console.log('[EventPayment] Persisted event_paid_fans:', key, '| pi:', paymentIntentId || 'none');
        }
      } catch (dbErr) {
        console.error('[EventPayment] event_paid_fans persist failed:', dbErr.message);
      }
    }

    res.json({
      paid: authorized,
      status: session.payment_status,
      paymentIntentStatus: piStatus,
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
    const { event_session_id } = req.query;

    if (!event_session_id) {
      return res.status(400).json({ error: 'Missing event_session_id' });
    }

    // 🔒 IDOR — AUTH + PROPRIÉTÉ : seul le créateur de l'événement lit ses gains.
    const authUser = await verifySupabaseJWT(req);
    if (!authUser) return res.status(401).json({ error: 'unauthorized' });
    {
      const { data: evt } = await getSupabaseAdmin()
        .from('event_sessions')
        .select('created_by')
        .eq('id', event_session_id)
        .maybeSingle();
      if (!evt) {
        return res.status(404).json({ error: 'Event session not found' });
      }
      if (String(evt.created_by) !== String(authUser.id)) {
        return res.status(403).json({ error: 'forbidden' });
      }
    }

    // Source de vérité : la base. On lit les paiements RÉELLEMENT capturés
    // (payment_captured = true) dans event_paid_fans. Reflète 0 tant qu'aucune
    // dédicace n'est publiée (rien n'est encore capturé). Plus fiable que de
    // scanner les 100 derniers paiements Stripe (fragile à grande échelle).
    const admin = getSupabaseAdmin();
    const { data: capturedRows, error: dbErr } = await admin
      .from('event_paid_fans')
      .select('amount_cents')
      .eq('event_session_id', event_session_id)
      .eq('payment_captured', true);

    if (dbErr) {
      throw new Error(`event_paid_fans read failed: ${dbErr.message}`);
    }

    const rows = capturedRows || [];
    const paidFanCount = rows.length;
    const rowsWithAmount = rows.filter((r) => typeof r.amount_cents === 'number');

    // FALLBACK robustesse : si des lignes sont capturées mais qu'AUCUNE n'a
    // d'amount_cents (vieux enregistrements d'avant l'ajout de la colonne), on
    // retombe sur l'ancien scan Stripe pour ne pas afficher 0 à tort.
    if (paidFanCount > 0 && rowsWithAmount.length === 0) {
      console.log('[EventEarnings] No amount_cents on captured rows, fallback Stripe scan for', event_session_id);
      const stripe = await getStripe();
      const checkoutSessions = await stripe.checkout.sessions.list({ limit: 100 });

      let totalGrossCents = 0;
      let fanCount = 0;
      for (const cs of checkoutSessions.data) {
        if (cs.metadata?.event_session_id === event_session_id && cs.payment_status === 'paid') {
          totalGrossCents += cs.amount_total || 0;
          fanCount++;
        }
      }
      const feeCents = Math.round(totalGrossCents * 0.15);
      return res.json({
        event_session_id,
        total_gross_cents: totalGrossCents,
        net_cents: Math.max(0, totalGrossCents - feeCents),
        paid_fan_count: fanCount,
      });
    }

    // Cas normal : on somme les montants en base (on ignore les null).
    const totalGrossCents = rowsWithAmount.reduce((sum, r) => sum + r.amount_cents, 0);
    const signTouchFeeCents = Math.round(totalGrossCents * 0.15);
    // NE PAS déduire les frais Stripe : la célébrité touche 85% brut via
    // transfer_data (cohérent avec le flux vidéo /api/session-earnings).
    const netCents = totalGrossCents - signTouchFeeCents;

    console.log('[EventEarnings] DB earnings for', event_session_id, '| captured fans:', paidFanCount, '| gross:', totalGrossCents, '| net:', netCents);

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
  // C2 — CAS SPÉCIAL : endpoint appelé par des fans potentiellement NON connectés
  // (identifiés par device_id/fan_id). On N'EXIGE PAS de JWT ici, sinon les fans
  // anonymes seraient cassés. Lecture seule (renvoie paid: true/false).
  // TODO durcir après migration device_id → compte (exiger le JWT + user==fan_id).
  try {
    const { event_session_id, fan_id } = req.query;

    if (!event_session_id || !fan_id) {
      return res.status(400).json({ error: 'Missing event_session_id or fan_id' });
    }

    const key = `${event_session_id}_${fan_id}`;
    const record = global.eventPaidRecords?.[key];

    if (record?.paid) {
      return res.json({ paid: true, paidAt: record.paidAt, source: 'memory' });
    }

    // Fallback durable : le registre mémoire est volatile (redémarrage Replit).
    // Présence dans event_paid_fans = pré-autorisé (même non capturé) = accès OK.
    try {
      const admin = getSupabaseAdmin();
      const { data: row, error: dbErr } = await admin
        .from('event_paid_fans')
        .select('id, payment_captured, created_at')
        .eq('event_session_id', event_session_id)
        .eq('fan_id', fan_id)
        .maybeSingle();

      if (!dbErr && row) {
        return res.json({ paid: true, paidAt: row.created_at, source: 'db' });
      }
    } catch (dbErr) {
      console.warn('[EventPayment] check-event-access DB fallback failed:', dbErr.message);
    }

    res.json({ paid: false });
  } catch (error) {
    console.error('[EventPayment] Check access error:', error.message);
    res.json({ paid: false });
  }
});

// ---------------------------------------------------------------------------
// RÉCUPÉRATION DES ÉVÉNEMENTS EN COURS DU FAN (anti « on me redemande de payer »)
//
// Bug corrigé : un fan qui a déjà payé/pré-autorisé un événement et qui
// ferme/rafraîchit l'app ne le retrouvait plus (l'app ne relisait pas la base).
// Cet endpoint relit les 2 sources de vérité serveur :
//   - VIDÉO    : session_queue ⋈ live_sessions   (fan_id = "fan_user_<user.id>")
//   - DÉDICACE : event_paid_fans ⋈ event_sessions (fan_id = user.id OU device_id legacy)
//
// Identification du fan :
//   - vidéo    : la file stocke fan_id = `fan_user_<user.id>` (entrées récentes).
//                Les vieilles entrées legacy device (`fan_<ts>_<rand>`) ne sont
//                PAS rattachables à un compte → ignorées ici (pas de device_id
//                fiable pour la vidéo).
//   - dédicace : event_paid_fans.fan_id = device_id (legacy, pas encore migré
//                vers le compte). On accepte donc fan_id = user.id (futur) OU le
//                device_id passé en query (présent).
//
// Statuts NON terminaux pris en compte :
//   - session_queue : 'waiting', 'called'  (terminal = 'completed' ; on inclut
//     aussi 'current'/'in_call'/'signing' par prudence s'ils apparaissent).
//   - live_sessions : non 'ended'  (actifs observés : 'active' ; on tolère
//     'scheduled'/'waiting' au cas où).
//   - event_sessions : non 'ended' et non 'deleted' (actif observé : 'live').
//
// Best-effort : si une des deux sous-requêtes échoue, on renvoie quand même
// l'autre (on n'écroule pas toute la réponse).
// ---------------------------------------------------------------------------
const VIDEO_QUEUE_TERMINAL_STATUSES = ['completed', 'cancelled', 'canceled', 'removed'];
const LIVE_SESSION_TERMINAL_STATUSES = ['ended'];
const EVENT_SESSION_TERMINAL_STATUSES = ['ended', 'deleted'];

app.get('/api/my-ongoing-events', async (req, res) => {
  try {
    const user = await verifySupabaseJWT(req);
    if (!user) return res.status(401).json({ error: 'Authentication required' });

    const deviceId = req.query.device_id ? String(req.query.device_id) : null;
    const admin = getSupabaseAdmin();
    const events = [];

    // ---- VIDÉO : session_queue ⋈ live_sessions -----------------------------
    try {
      const videoFanId = `fan_user_${user.id}`;
      const { data: qRows, error: qErr } = await admin
        .from('session_queue')
        .select('id, session_id, fan_id, status, checkout_session_id, payment_intent_id, payment_captured, created_at')
        .eq('fan_id', videoFanId)
        .not('status', 'in', `(${VIDEO_QUEUE_TERMINAL_STATUSES.join(',')})`)
        .order('created_at', { ascending: false });

      if (qErr) {
        console.warn('[MyOngoing] session_queue read failed:', qErr.message);
      } else if (qRows && qRows.length > 0) {
        const sessionIds = [...new Set(qRows.map((r) => r.session_id).filter(Boolean))];
        let liveById = {};
        if (sessionIds.length > 0) {
          const { data: lives, error: lErr } = await admin
            .from('live_sessions')
            .select('id, code, celebrity_name, status, scheduled_at')
            .in('id', sessionIds);
          if (lErr) {
            console.warn('[MyOngoing] live_sessions read failed:', lErr.message);
          } else {
            for (const l of (lives || [])) liveById[l.id] = l;
          }
        }
        // Dédupliquer par session : on garde la 1ère entrée non terminale (la
        // plus récente) pour chaque live, pour ne pas afficher 2x le même event.
        const seenSessions = new Set();
        for (const q of qRows) {
          const live = liveById[q.session_id];
          if (!live) continue; // live introuvable -> on ignore
          if (LIVE_SESSION_TERMINAL_STATUSES.includes(live.status)) continue;
          if (seenSessions.has(q.session_id)) continue;
          seenSessions.add(q.session_id);
          events.push({
            type: 'video',
            session_id: q.session_id,
            queue_entry_id: q.id,
            code: live.code || null,
            celebrity_name: live.celebrity_name || null,
            status: q.status,
            scheduled_at: live.scheduled_at || null,
            checkout_session_id: q.checkout_session_id || null,
            payment_intent_id: q.payment_intent_id || null,
            payment_captured: q.payment_captured === true,
          });
        }
      }
    } catch (videoErr) {
      console.warn('[MyOngoing] video branch error (ignored):', videoErr.message);
    }

    // ---- DÉDICACE : event_paid_fans ⋈ event_sessions -----------------------
    try {
      // fan_id peut être l'user.id (futur) OU le device_id legacy (présent).
      const fanIds = [String(user.id)];
      if (deviceId) fanIds.push(deviceId);

      const { data: paidRows, error: pErr } = await admin
        .from('event_paid_fans')
        .select('id, event_session_id, fan_id, checkout_session_id, payment_intent_id, payment_captured, amount_cents, created_at')
        .in('fan_id', fanIds)
        .order('created_at', { ascending: false });

      if (pErr) {
        console.warn('[MyOngoing] event_paid_fans read failed:', pErr.message);
      } else if (paidRows && paidRows.length > 0) {
        const eventIds = [...new Set(paidRows.map((r) => r.event_session_id).filter(Boolean))];
        let evtById = {};
        if (eventIds.length > 0) {
          const { data: evts, error: eErr } = await admin
            .from('event_sessions')
            .select('id, title, join_code, status, starts_at, created_by')
            .in('id', eventIds);
          if (eErr) {
            console.warn('[MyOngoing] event_sessions read failed:', eErr.message);
          } else {
            for (const e of (evts || [])) evtById[e.id] = e;
          }
        }

        // celebrity_name : event_sessions n'a pas de colonne dédiée. On résout
        // via user_profiles.display_name (clé = created_by). Best-effort.
        const creatorIds = [...new Set(Object.values(evtById).map((e) => e.created_by).filter(Boolean))];
        let nameByCreator = {};
        if (creatorIds.length > 0) {
          try {
            const { data: profs } = await admin
              .from('user_profiles')
              .select('id, display_name')
              .in('id', creatorIds);
            for (const p of (profs || [])) nameByCreator[p.id] = p.display_name;
          } catch (nameErr) {
            console.warn('[MyOngoing] creator name lookup failed:', nameErr.message);
          }
        }

        const seenEvents = new Set();
        for (const row of paidRows) {
          const evt = evtById[row.event_session_id];
          if (!evt) continue;
          if (EVENT_SESSION_TERMINAL_STATUSES.includes(evt.status)) continue;
          if (seenEvents.has(row.event_session_id)) continue;
          seenEvents.add(row.event_session_id);
          events.push({
            type: 'dedication',
            event_session_id: row.event_session_id,
            code: evt.join_code || null,
            celebrity_name: nameByCreator[evt.created_by] || evt.title || null,
            status: evt.status,
            scheduled_at: evt.starts_at || null,
            checkout_session_id: row.checkout_session_id || null,
            payment_intent_id: row.payment_intent_id || null,
            payment_captured: row.payment_captured === true,
            amount_cents: typeof row.amount_cents === 'number' ? row.amount_cents : null,
          });
        }
      }
    } catch (dedicErr) {
      console.warn('[MyOngoing] dedication branch error (ignored):', dedicErr.message);
    }

    // ---- LISTE D'ATTENTE : event_reservations (réservations « gratuites », dédicace OU live) ----
    // Un fan qui a RÉSERVÉ sans (encore) payer n'est ni dans event_paid_fans ni dans
    // session_queue → sans cette branche, il ne retrouvait pas son événement réservé.
    try {
      const fanIdsR = [String(user.id)];
      if (deviceId) fanIdsR.push(deviceId);
      const { data: resvRows, error: rErr } = await admin
        .from('event_reservations')
        .select('event_id, created_at')
        .in('fan_id', fanIdsR)
        .order('created_at', { ascending: false });
      if (rErr) {
        console.warn('[MyOngoing] event_reservations read failed:', rErr.message);
      } else if (resvRows && resvRows.length > 0) {
        // On évite les doublons avec les événements déjà ajoutés (payés / dans la file).
        const already = new Set(events.map((e) => String(e.session_id || e.event_session_id || '')));
        const resvIds = [...new Set(resvRows.map((r) => String(r.event_id)).filter((id) => id && !already.has(id)))];
        if (resvIds.length > 0) {
          const [{ data: evts }, { data: lives }] = await Promise.all([
            admin.from('event_sessions').select('id, title, join_code, status, starts_at, created_by').in('id', resvIds),
            admin.from('live_sessions').select('id, code, celebrity_name, status, scheduled_at').in('id', resvIds),
          ]);
          const evtById = {}; for (const e of (evts || [])) evtById[e.id] = e;
          const liveById = {}; for (const l of (lives || [])) liveById[l.id] = l;
          const creatorIds = [...new Set((evts || []).map((e) => e.created_by).filter(Boolean))];
          let nameByCreator = {};
          if (creatorIds.length > 0) {
            try {
              const { data: profs } = await admin.from('user_profiles').select('id, display_name').in('id', creatorIds);
              for (const p of (profs || [])) nameByCreator[p.id] = p.display_name;
            } catch {}
          }
          const seenR = new Set();
          for (const id of resvIds) {
            if (seenR.has(id)) continue; seenR.add(id);
            if (liveById[id]) {
              const l = liveById[id];
              if (LIVE_SESSION_TERMINAL_STATUSES.includes(l.status)) continue;
              events.push({ type: 'video', session_id: id, code: l.code || null, celebrity_name: l.celebrity_name || null, status: l.status, scheduled_at: l.scheduled_at || null, reserved: true });
            } else if (evtById[id]) {
              const e = evtById[id];
              if (EVENT_SESSION_TERMINAL_STATUSES.includes(e.status)) continue;
              events.push({ type: 'dedication', event_session_id: id, code: e.join_code || null, celebrity_name: nameByCreator[e.created_by] || e.title || null, status: e.status, scheduled_at: e.starts_at || null, reserved: true });
            }
          }
        }
      }
    } catch (resvErr) {
      console.warn('[MyOngoing] reservation branch error (ignored):', resvErr.message);
    }

    return res.json({ events });
  } catch (error) {
    console.error('[MyOngoing] Error:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// VÉRIFICATION D'UN PAIEMENT ACTIF POUR UN ÉVÉNEMENT DONNÉ
//
// L'app appelle ceci AVANT de proposer le paiement : si le fan a déjà une
// pré-autorisation valide (PaymentIntent en 'requires_capture' ou déjà
// 'succeeded'), on le laisse rejoindre SANS repayer. Si l'autorisation a
// expiré / été annulée, on renvoie expired:true et l'app peut reproposer
// le paiement.
//
// Params (query) :
//   - type             : 'video' | 'dedication'   (requis)
//   - session_id       : id live_sessions          (requis si type=video)
//   - event_session_id : id event_sessions         (requis si type=dedication)
//   - device_id        : device_id legacy          (optionnel, dédicace)
//
// Réutilise la logique Stripe de /api/verify-payment :
//   requires_capture | succeeded -> hasActivePayment:true
//   canceled / expiré / absent   -> hasActivePayment:false (+ expired si annulé)
// ---------------------------------------------------------------------------
app.get('/api/check-active-payment', async (req, res) => {
  try {
    const user = await verifySupabaseJWT(req);
    if (!user) return res.status(401).json({ error: 'Authentication required' });

    const type = req.query.type;
    if (type !== 'video' && type !== 'dedication') {
      return res.status(400).json({ error: "Invalid or missing 'type' (video|dedication)" });
    }

    const admin = getSupabaseAdmin();
    let row = null; // { checkout_session_id, payment_intent_id, payment_captured }

    if (type === 'video') {
      const sessionId = req.query.session_id;
      if (!sessionId) return res.status(400).json({ error: 'Missing session_id' });
      const videoFanId = `fan_user_${user.id}`;
      const { data, error } = await admin
        .from('session_queue')
        .select('checkout_session_id, payment_intent_id, payment_captured, status')
        .eq('session_id', sessionId)
        .eq('fan_id', videoFanId)
        .not('status', 'in', `(${VIDEO_QUEUE_TERMINAL_STATUSES.join(',')})`)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) {
        console.warn('[CheckActivePayment] session_queue read failed:', error.message);
      }
      row = data || null;
    } else {
      const eventSessionId = req.query.event_session_id;
      if (!eventSessionId) return res.status(400).json({ error: 'Missing event_session_id' });
      const deviceId = req.query.device_id ? String(req.query.device_id) : null;
      const fanIds = [String(user.id)];
      if (deviceId) fanIds.push(deviceId);
      const { data, error } = await admin
        .from('event_paid_fans')
        .select('checkout_session_id, payment_intent_id, payment_captured')
        .eq('event_session_id', eventSessionId)
        .in('fan_id', fanIds)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) {
        console.warn('[CheckActivePayment] event_paid_fans read failed:', error.message);
      }
      row = data || null;
    }

    // Aucune entrée payée -> pas de paiement actif (l'app proposera de payer).
    if (!row || !row.checkout_session_id) {
      return res.json({ hasActivePayment: false });
    }

    // Si déjà capturé en base, c'est forcément un paiement actif (succeeded).
    if (row.payment_captured === true) {
      return res.json({
        hasActivePayment: true,
        checkoutSessionId: row.checkout_session_id,
        paymentIntentId: row.payment_intent_id || null,
        paymentCaptured: true,
      });
    }

    // Sinon on vérifie l'état réel côté Stripe (même logique que verify-payment).
    try {
      const stripe = await getStripe();
      let paymentIntentId = row.payment_intent_id || null;
      if (!paymentIntentId) {
        const session = await stripe.checkout.sessions.retrieve(row.checkout_session_id);
        paymentIntentId = session.payment_intent || null;
      }
      if (!paymentIntentId) {
        return res.json({ hasActivePayment: false });
      }
      const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
      if (pi.status === 'requires_capture' || pi.status === 'succeeded') {
        return res.json({
          hasActivePayment: true,
          checkoutSessionId: row.checkout_session_id,
          paymentIntentId,
          paymentCaptured: pi.status === 'succeeded',
        });
      }
      if (pi.status === 'canceled') {
        return res.json({ hasActivePayment: false, expired: true });
      }
      // requires_payment_method / processing / etc. : paiement non finalisé.
      return res.json({ hasActivePayment: false, paymentIntentStatus: pi.status });
    } catch (stripeErr) {
      console.warn('[CheckActivePayment] Stripe check failed:', stripeErr.message);
      // On ne bloque pas le fan : on signale juste qu'on n'a pas pu confirmer.
      return res.json({ hasActivePayment: false, error: 'stripe_check_failed' });
    }
  } catch (error) {
    console.error('[CheckActivePayment] Error:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// CAPTURE EN MASSE des dédicaces — déclenchée à la 1ère photo dédicacée.
// Aligné sur le flux vidéo (/api/end-fan-call) : pré-autorisations posées au
// checkout, capturées toutes d'un coup ici. Idempotent à 2 niveaux :
//   - événement : event_sessions.dedication_captures_triggered (compare-and-set)
//   - fan       : event_paid_fans.payment_captured (compare-and-set)
// Body : { eventSessionId }
// ---------------------------------------------------------------------------
app.post('/api/capture-event-payments', async (req, res) => {
  const { eventSessionId } = req.body || {};
  try {
    if (!eventSessionId) {
      return res.status(400).json({ ok: false, error: 'Missing eventSessionId' });
    }

    const supabase = getSupabaseAdmin();
    const stripe = await getStripe();

    // 🔒 C2 — AUTH + PROPRIÉTÉ : seule la célébrité créatrice de l'événement.
    const authUser = await verifySupabaseJWT(req);
    if (!authUser) return res.status(401).json({ ok: false, error: 'Authentication required' });
    {
      const { data: evt } = await supabase
        .from('event_sessions')
        .select('created_by')
        .eq('id', eventSessionId)
        .maybeSingle();
      if (!evt) {
        if (isStripeTestMode()) {
          console.warn('[EventCapture] TEST: event introuvable', eventSessionId, '→ toléré');
        } else {
          return res.status(403).json({ ok: false, error: 'Ownership could not be verified' });
        }
      } else if (String(evt.created_by) !== String(authUser.id)) {
        return res.status(403).json({ ok: false, error: 'Not the creator of this event' });
      }
    }

    // 1. Compare-and-set ÉVÉNEMENT : ne déclenche qu'une fois.
    const { data: triggered, error: triggerErr } = await supabase
      .from('event_sessions')
      .update({ dedication_captures_triggered: true })
      .eq('id', eventSessionId)
      .not('dedication_captures_triggered', 'is', true)
      .select('id');

    if (triggerErr) {
      console.error('[EventCapture] Trigger compare-and-set error:', triggerErr.message);
      return res.status(500).json({ ok: false, error: triggerErr.message });
    }

    if (!triggered || triggered.length === 0) {
      console.log('[EventCapture] Already triggered (idempotent no-op):', eventSessionId);
      return res.json({ ok: true, already: true });
    }

    console.log('[EventCapture] Triggered mass capture for event:', eventSessionId);

    // 2. Tous les fans pré-autorisés non encore capturés.
    const { data: fans, error: fansErr } = await supabase
      .from('event_paid_fans')
      .select('*')
      .eq('event_session_id', eventSessionId)
      .eq('payment_captured', false);

    if (fansErr) {
      console.error('[EventCapture] Fetch fans error:', fansErr.message);
      return res.status(500).json({ ok: false, error: fansErr.message });
    }

    let capturedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    for (const fan of (fans || [])) {
      try {
        // Compare-and-set PAR FAN : verrou anti-race avant Stripe.
        const { data: claimed, error: claimErr } = await supabase
          .from('event_paid_fans')
          .update({ payment_captured: true })
          .eq('id', fan.id)
          .not('payment_captured', 'is', true)
          .select('id');

        if (claimErr) {
          console.error('[EventCapture] Claim error for fan', fan.fan_id, ':', claimErr.message);
          failedCount++;
          continue;
        }

        if (!claimed || claimed.length === 0) {
          // Un autre process a déjà capturé ce fan.
          console.log('[EventCapture] Fan already captured (skip):', fan.fan_id);
          skippedCount++;
          continue;
        }

        // Résoudre le payment_intent_id si manquant.
        let paymentIntentId = fan.payment_intent_id;
        if (!paymentIntentId && fan.checkout_session_id) {
          const cs = await stripe.checkout.sessions.retrieve(fan.checkout_session_id);
          paymentIntentId = cs.payment_intent;
          if (paymentIntentId) {
            await supabase
              .from('event_paid_fans')
              .update({ payment_intent_id: paymentIntentId })
              .eq('id', fan.id);
          }
        }

        if (!paymentIntentId) {
          // Pas de PI : rien à capturer, on relâche le verrou.
          await supabase
            .from('event_paid_fans')
            .update({ payment_captured: false })
            .eq('id', fan.id);
          console.warn('[EventCapture] No payment_intent for fan (lock released):', fan.fan_id);
          failedCount++;
          continue;
        }

        const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
        if (pi.status === 'requires_capture') {
          const cap = await stripe.paymentIntents.capture(paymentIntentId);
          console.log('[EventCapture] Captured:', paymentIntentId, '| fan:', fan.fan_id, '| amount:', cap.amount, cap.currency);
          // Facture (best-effort : n'interrompt jamais l'encaissement)
          try {
            let celebId = null;
            if (fan.event_session_id) {
              const { data: ev } = await supabase.from('event_sessions').select('created_by').eq('id', fan.event_session_id).maybeSingle();
              celebId = ev?.created_by || null;
            }
            await createInvoice({
              transactionRef: 'evt_' + fan.event_session_id + '_' + fan.fan_id,
              fanId: fan.fan_id,
              celebrityId: celebId,
              prestationType: 'event_dedication',
              prestationLabel: 'Dédicace en événement',
              amountCents: cap.amount,
              currency: cap.currency,
            });
          } catch (invErr) { console.error('[EventCapture] invoice error:', invErr.message); }
          capturedCount++;
        } else if (pi.status === 'succeeded') {
          console.log('[EventCapture] Already succeeded (idempotent OK):', paymentIntentId, '| fan:', fan.fan_id);
          capturedCount++;
        } else {
          // Statut non capturable : relâcher le verrou.
          await supabase
            .from('event_paid_fans')
            .update({ payment_captured: false })
            .eq('id', fan.id);
          console.error('[EventCapture] Cannot capture status', pi.status, 'for fan (lock released):', fan.fan_id);
          failedCount++;
        }
      } catch (fanErr) {
        // Erreur sur ce fan : relâcher SON verrou et CONTINUER les autres.
        try {
          await supabase
            .from('event_paid_fans')
            .update({ payment_captured: false })
            .eq('id', fan.id);
        } catch (_) {}
        console.error('[EventCapture] Capture error for fan', fan.fan_id, '(lock released):', fanErr.message);
        failedCount++;
      }
    }

    console.log(`[EventCapture] Done event=${eventSessionId} captured=${capturedCount} skipped=${skippedCount} failed=${failedCount}`);
    return res.json({ ok: true, capturedCount, skippedCount, failedCount });
  } catch (error) {
    console.error('[EventCapture] Error:', error?.message || error);
    return res.status(500).json({ ok: false, error: error?.message || 'internal_error' });
  }
});

// ---------------------------------------------------------------------------
// RELEASE en masse — annule les pré-autorisations non capturées (événement
// terminé sans dédicace, annulation...). Idempotent. Même logique RELEASE que
// /api/end-fan-call.
// Body : { eventSessionId }
// ---------------------------------------------------------------------------
app.post('/api/release-event-payments', async (req, res) => {
  const { eventSessionId } = req.body || {};
  try {
    if (!eventSessionId) {
      return res.status(400).json({ ok: false, error: 'Missing eventSessionId' });
    }

    const supabase = getSupabaseAdmin();
    const stripe = await getStripe();

    // 🔒 C2 — AUTH + PROPRIÉTÉ : seule la célébrité créatrice de l'événement.
    const authUser = await verifySupabaseJWT(req);
    if (!authUser) return res.status(401).json({ ok: false, error: 'Authentication required' });
    {
      const { data: evt } = await supabase
        .from('event_sessions')
        .select('created_by')
        .eq('id', eventSessionId)
        .maybeSingle();
      if (!evt) {
        if (isStripeTestMode()) {
          console.warn('[EventRelease] TEST: event introuvable', eventSessionId, '→ toléré');
        } else {
          return res.status(403).json({ ok: false, error: 'Ownership could not be verified' });
        }
      } else if (String(evt.created_by) !== String(authUser.id)) {
        return res.status(403).json({ ok: false, error: 'Not the creator of this event' });
      }
    }

    const { data: fans, error: fansErr } = await supabase
      .from('event_paid_fans')
      .select('*')
      .eq('event_session_id', eventSessionId)
      .eq('payment_captured', false);

    if (fansErr) {
      console.error('[EventRelease] Fetch fans error:', fansErr.message);
      return res.status(500).json({ ok: false, error: fansErr.message });
    }

    let releasedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    // Push tokens des fans RÉELLEMENT libérés (pré-auto annulée), pour la notif
    // « remboursé ». On exclut les déjà succeeded/capturés.
    const refundedPushTokens = [];

    for (const fan of (fans || [])) {
      try {
        let paymentIntentId = fan.payment_intent_id;
        if (!paymentIntentId && fan.checkout_session_id) {
          const cs = await stripe.checkout.sessions.retrieve(fan.checkout_session_id);
          paymentIntentId = cs.payment_intent;
          if (paymentIntentId) {
            await supabase
              .from('event_paid_fans')
              .update({ payment_intent_id: paymentIntentId })
              .eq('id', fan.id);
          }
        }

        if (!paymentIntentId) {
          console.warn('[EventRelease] No payment_intent for fan (skip):', fan.fan_id);
          skippedCount++;
          continue;
        }

        const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
        if (pi.status === 'requires_capture' || pi.status === 'requires_payment_method') {
          const canceled = await stripe.paymentIntents.cancel(paymentIntentId);
          console.log('[EventRelease] Released (canceled):', canceled.id, '| fan:', fan.fan_id);
          releasedCount++;
          if (fan.push_token) refundedPushTokens.push(fan.push_token);
        } else if (pi.status === 'canceled') {
          console.log('[EventRelease] Already canceled (no-op):', paymentIntentId, '| fan:', fan.fan_id);
          releasedCount++;
          if (fan.push_token) refundedPushTokens.push(fan.push_token);
        } else if (pi.status === 'succeeded') {
          console.log('[EventRelease] Already succeeded, cannot release (skip):', paymentIntentId, '| fan:', fan.fan_id);
          skippedCount++;
        } else {
          console.log('[EventRelease] Status', pi.status, 'not cancelable (skip):', paymentIntentId, '| fan:', fan.fan_id);
          skippedCount++;
        }
      } catch (fanErr) {
        console.error('[EventRelease] Release error for fan', fan.fan_id, ':', fanErr.message);
        failedCount++;
      }
    }

    console.log(`[EventRelease] Done event=${eventSessionId} released=${releasedCount} skipped=${skippedCount} failed=${failedCount}`);

    // Notif « remboursé » aux fans réellement libérés (fire-and-forget).
    // body : FR par défaut, ou texte fourni par l'app (déjà traduit).
    try {
      const tokens = [...new Set(refundedPushTokens.filter((t) => typeof t === 'string' && t.length > 0))];
      if (tokens.length > 0) {
        const refundBody = (typeof req.body?.body === 'string' && req.body.body.length > 0)
          ? req.body.body
          : "L'événement s'est terminé sans dédicace — vous n'avez pas été débité(e) (remboursé).";
        console.log(`[EventRefundNotif] Sending refund push to ${tokens.length} fan(s) for event=${eventSessionId}`);
        sendExpoPush(tokens, 'Plyz', refundBody, { eventSessionId, action: 'event_refunded' })
          .catch((e) => console.error('[EventRefundNotif] send error:', e?.message || e));
      } else {
        console.log(`[EventRefundNotif] No push token among released fans for event=${eventSessionId}, skipping`);
      }
    } catch (notifErr) {
      console.error('[EventRefundNotif] error:', notifErr?.message || notifErr);
    }

    return res.json({ ok: true, releasedCount, skippedCount, failedCount });
  } catch (error) {
    console.error('[EventRelease] Error:', error?.message || error);
    return res.status(500).json({ ok: false, error: error?.message || 'internal_error' });
  }
});

app.post('/api/record-free-event-access', async (req, res) => {
  try {
    const admin = getSupabaseAdmin();
    const { event_session_id, fan_id, promo_id } = req.body;

    if (!event_session_id || !fan_id || !promo_id) {
      return res.status(400).json({ error: 'Missing event_session_id, fan_id, or promo_id' });
    }

    // 🔒 C2 — AUTH : durcissement préventif (aucun appel client actuel). On exige
    // un user authentifié, et que fan_id corresponde à l'utilisateur connecté.
    const authUser = await verifySupabaseJWT(req);
    if (!authUser) return res.status(401).json({ error: 'Authentication required' });
    if (String(fan_id) !== String(authUser.id)) {
      if (isStripeTestMode()) {
        console.warn('[EventPromoAccess] TEST: fan_id != user', fan_id, authUser.id, '→ toléré');
      } else {
        return res.status(403).json({ error: 'fan_id does not match authenticated user' });
      }
    }

    const { data: promo } = await admin
      .from('promo_code_evenement_qr')
      .select('id, discount_percent, is_active, event_session_id, used_count, max_uses')
      .eq('id', promo_id)
      .eq('is_active', true)
      .single();

    if (!promo || promo.discount_percent !== 100) {
      return res.status(403).json({ error: 'Invalid or non-100% promo code' });
    }

    if (promo.event_session_id && promo.event_session_id !== event_session_id) {
      return res.status(403).json({ error: 'Promo code not valid for this event' });
    }

    if (promo.max_uses !== null && (promo.used_count || 0) >= promo.max_uses) {
      return res.status(400).json({ error: 'Promo code usage limit reached' });
    }

    // Incrément ATOMIQUE de used_count (compare-and-set, même pattern que
    // /api/use-event-promo-code) pour éviter la double consommation.
    const newCount = (promo.used_count || 0) + 1;
    const { data: incremented, error: incErr } = await admin
      .from('promo_code_evenement_qr')
      .update({ used_count: newCount })
      .eq('id', promo_id)
      .eq('used_count', promo.used_count)
      .select('id');

    if (incErr) {
      console.error('[EventPromoAccess] Increment error:', incErr.message);
      return res.status(500).json({ error: incErr.message });
    }
    if (!incremented || incremented.length === 0) {
      return res.status(409).json({ error: 'Concurrent update detected, please retry' });
    }

    const key = `${event_session_id}_${fan_id}`;
    if (!global.eventPaidRecords) global.eventPaidRecords = {};
    global.eventPaidRecords[key] = { paid: true, paidAt: new Date().toISOString(), method: 'promo_code', promo_id };

    console.log('[EventPromoAccess] Recorded free access for:', key, '| Promo:', promo_id, '| New count:', newCount);
    res.json({ success: true });
  } catch (error) {
    console.error('[EventPromoAccess] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// Notification de dédicace prête, envoyée DEPUIS le serveur.
// L'app (côté célébrité) enregistre la dédicace dans Supabase puis appelle cet
// endpoint en fire-and-forget. Comme c'est le serveur qui envoie le push, la
// notif part même si la célébrité ferme l'app juste après. On répond tout de
// suite (200) et on envoie le push en arrière-plan.
//
// Body attendu :
//   - sessionId        (string, requis)  : id de la session live / appel vidéo
//   - queueEntryId     (string, optionnel): id de la ligne session_queue du fan
//   - celebrityName    (string, optionnel)
//   - message          (string, optionnel): corps déjà traduit (peut contenir {name})
// ---------------------------------------------------------------------------
app.post('/api/notify-dedication', async (req, res) => {
  const { sessionId, queueEntryId, celebrityName, message } = req.body || {};

  if (!sessionId) {
    return res.status(400).json({ error: 'Missing sessionId' });
  }

  // Répond immédiatement : l'envoi du push ne doit pas bloquer le client.
  res.json({ success: true });

  // Fire-and-forget : récupère le(s) push_token puis envoie.
  (async () => {
    try {
      const supabase = getSupabase();

      // 1) Cas appel vidéo / dédicace ciblée : un fan précis (queueEntryId).
      // 2) Fallback : tous les fans encore en file pour cette session.
      let rows = [];
      if (queueEntryId) {
        const { data } = await supabase
          .from('session_queue')
          .select('push_token, fan_name')
          .eq('id', queueEntryId)
          .single();
        if (data) rows = [data];
      } else {
        const { data } = await supabase
          .from('session_queue')
          .select('push_token, fan_name')
          .eq('session_id', sessionId);
        if (data) rows = data;
      }

      const tokens = rows.map((r) => r && r.push_token).filter(Boolean);
      if (tokens.length === 0) {
        console.log('[NotifyDedication] No push token found for session', sessionId);
        return;
      }

      const fanName = (rows[0] && rows[0].fan_name) || 'Fan';
      const title = celebrityName ? `${celebrityName} - Plyz` : 'Nouvelle dédicace ! 🎉';
      const body = message
        ? message.replace('{name}', fanName)
        : `🎁 ${fanName}, votre dédicace personnalisée est prête ! Ouvrez l'app pour la voir.`;

      await sendExpoPush(tokens, title, body, { sessionId, action: 'dedication_ready' });
    } catch (err) {
      console.error('[NotifyDedication] Error:', err.message);
    }
  })();
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

    const result = await moderateImage(req.file.buffer, req.file.mimetype);
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

    const modResult = await moderateImage(req.file.buffer, req.file.mimetype);
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

    // 🧹 Auto-clôture des sessions périmées (jamais clôturées manuellement).
    // Une session "active/waiting/scheduled" dont le créneau est manifestement
    // passé doit être marquée 'ended' pour ne plus s'afficher « En cours » et
    // ne plus laisser un fan PAYER une session morte (le contrôle status==='ended'
    // côté app n'arrive qu'APRÈS paiement). On ne clôture QUE selon une date fiable.
    const now = Date.now();
    const sessions = data || [];
    const staleIds = [];

    for (const s of sessions) {
      const durMs = ((s.duration_minutes || 30) * 60 * 1000);
      const endsAt = s.ends_at ? Date.parse(s.ends_at) : NaN;
      const startedAt = s.started_at ? Date.parse(s.started_at) : NaN;
      const scheduledAt = s.scheduled_at ? Date.parse(s.scheduled_at) : NaN;
      let isStale = false;

      if ((s.status === 'active' || s.status === 'paused' || s.status === 'waiting') && !Number.isNaN(endsAt)) {
        // Date de fin explicite dépassée → terminée.
        if (endsAt < now) isStale = true;
      } else if ((s.status === 'active' || s.status === 'paused') && !Number.isNaN(startedAt)) {
        // Démarrée + durée écoulée → terminée.
        if (startedAt + durMs < now) isStale = true;
      } else if (s.status === 'scheduled' && !Number.isNaN(scheduledAt)) {
        // Créneau programmé + durée écoulée → terminée.
        if (scheduledAt + durMs < now) isStale = true;
      } else if (s.status === 'active' || s.status === 'paused' || s.status === 'waiting') {
        // Filet de sécurité : session active/en attente SANS aucune date fiable
        // (ni ends_at, ni started_at) — cas des sessions créées "actives" sans started_at.
        // Si elle a été créée il y a plus que (durée + 3h de marge), elle est abandonnée.
        const createdAt = s.created_at ? Date.parse(s.created_at) : NaN;
        const STALE_GRACE_MS = 3 * 60 * 60 * 1000; // 3h de marge pour ne pas couper une session en cours
        if (!Number.isNaN(createdAt) && (createdAt + durMs + STALE_GRACE_MS < now)) isStale = true;
      }

      if (isStale) staleIds.push(s.id);
    }

    // Best-effort : on clôture en base sans casser la réponse en cas d'échec.
    if (staleIds.length > 0) {
      try {
        const { error: closeErr } = await db
          .from('live_sessions')
          .update({ status: 'ended' })
          .in('id', staleIds);
        if (closeErr) {
          console.error('[Celebrity Events] Auto-close failed:', closeErr.message);
        } else {
          console.log('[Celebrity Events] Auto-closed stale sessions:', staleIds.length);
        }
      } catch (closeError) {
        console.error('[Celebrity Events] Auto-close exception:', closeError.message);
      }
    }

    // On exclut de la réponse les sessions clôturées ci-dessus ET toute session
    // déjà 'ended' : seules les sessions réellement actives ou à venir sont renvoyées.
    const staleSet = new Set(staleIds);
    const events = sessions.filter(s => !staleSet.has(s.id) && s.status !== 'ended');

    res.json({ events });
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
    const { kind, title, body, media_url, event_date, price_cents } = req.body;

    // 🔒 IDOR — AUTH + PROPRIÉTÉ : le post est toujours créé au nom de l'appelant.
    const authUser = await verifySupabaseJWT(req);
    if (!authUser) return res.status(401).json({ error: 'unauthorized' });
    const celebrity_id = authUser.id;

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
      req.__authUserId = user.id;
      logSecurityEvent(req, 'IDOR prestation payante', `tentative d'agir au nom d'un autre compte (fan_id ${fan_id})`);
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
      req.__authUserId = user.id;
      logSecurityEvent(req, 'IDOR prestation payante', `tentative d'agir au nom d'un autre compte (fan_id ${fan_id})`);
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
    const { role } = req.query;

    // 🔒 IDOR — AUTH + PROPRIÉTÉ : on ne lit QUE les réservations de l'appelant.
    const authUser = await verifySupabaseJWT(req);
    if (!authUser) return res.status(401).json({ error: 'unauthorized' });
    const user_id = authUser.id;

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
    const { role } = req.query;

    // 🔒 IDOR — AUTH + PROPRIÉTÉ : on ne lit QUE les dédicaces de l'appelant.
    const authUser = await verifySupabaseJWT(req);
    if (!authUser) return res.status(401).json({ error: 'unauthorized' });
    const user_id = authUser.id;

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

    // 🔒 C2 — AUTH + PROPRIÉTÉ : autorisé si user == celebrity_id OU fan_id du booking.
    const authUser = await verifySupabaseJWT(req);
    if (!authUser) return res.status(401).json({ error: 'Authentication required' });
    {
      const { data: bk } = await db
        .from('booking_requests')
        .select('celebrity_id, fan_id')
        .eq('id', booking_id)
        .maybeSingle();
      if (!bk) {
        if (isStripeTestMode()) {
          console.warn('[Update Booking] TEST: booking introuvable', booking_id, '→ toléré');
        } else {
          return res.status(403).json({ error: 'Ownership could not be verified' });
        }
      } else if (String(bk.celebrity_id) !== String(authUser.id) && String(bk.fan_id) !== String(authUser.id)) {
        return res.status(403).json({ error: 'Not authorized for this booking' });
      }
    }

    const update = { status, updated_at: new Date().toISOString() };
    if (status === 'completed') update.completed_at = new Date().toISOString();

    const { data, error } = await db
      .from('booking_requests')
      .update(update)
      .eq('id', booking_id)
      .select()
      .single();

    if (error) throw error;

    // 💶 CAPTURE du paiement pré-autorisé quand la réservation est TERMINÉE (best-effort,
    // idempotent : ne capture que si le PaymentIntent est encore 'requires_capture').
    if (status === 'completed' && data?.stripe_session_id) {
      try {
        const stripe = await getStripe();
        const sess = await stripe.checkout.sessions.retrieve(data.stripe_session_id);
        const piId = sess.payment_intent;
        if (piId) {
          const pi = await stripe.paymentIntents.retrieve(piId);
          if (pi.status === 'requires_capture') {
            const captured = await stripe.paymentIntents.capture(piId);
            console.log('[Update Booking] Payment captured:', piId, '| Amount:', captured.amount, captured.currency);
            try {
              await createInvoice({
                transactionRef: 'booking_' + booking_id,
                fanId: data.fan_id || null,
                celebrityId: data.celebrity_id || null,
                prestationType: 'video_booking',
                prestationLabel: 'Appel vidéo (réservation)',
                amountCents: captured.amount,
                currency: captured.currency,
              });
            } catch (invErr) { console.error('[Update Booking] invoice error:', invErr.message); }
          } else {
            console.log('[Update Booking] PaymentIntent not capturable (status:', pi.status, ') — skip');
          }
        }
      } catch (capErr) { console.error('[Update Booking] capture error:', capErr.message); }
    }

    // 🔓 LIBÈRE la pré-autorisation (empreinte bancaire du fan) si la réservation est REFUSÉE/ANNULÉE.
    if (['declined', 'cancelled', 'canceled', 'rejected'].includes(status) && data?.stripe_session_id) {
      try {
        const stripe = await getStripe();
        const sess = await stripe.checkout.sessions.retrieve(data.stripe_session_id);
        const piId = sess.payment_intent;
        if (piId) {
          const pi = await stripe.paymentIntents.retrieve(piId);
          if (pi.status === 'requires_capture') {
            await stripe.paymentIntents.cancel(piId);
            console.log('[Update Booking] Pre-auth released for declined booking:', piId);
          }
        }
      } catch (relErr) { console.error('[Update Booking] release error:', relErr.message); }
    }

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

    // 🔒 C2 — AUTH + PROPRIÉTÉ : autorisé si user == celebrity_id OU fan_id de la dédicace.
    const authUser = await verifySupabaseJWT(req);
    if (!authUser) return res.status(401).json({ error: 'Authentication required' });
    {
      const { data: ag } = await db
        .from('autograph_requests')
        .select('celebrity_id, fan_id')
        .eq('id', autograph_id)
        .maybeSingle();
      if (!ag) {
        if (isStripeTestMode()) {
          console.warn('[Update Autograph] TEST: dédicace introuvable', autograph_id, '→ toléré');
        } else {
          return res.status(403).json({ error: 'Ownership could not be verified' });
        }
      } else if (String(ag.celebrity_id) !== String(authUser.id) && String(ag.fan_id) !== String(authUser.id)) {
        return res.status(403).json({ error: 'Not authorized for this autograph' });
      }
    }

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
    const { stage_name, bio, website } = req.body;

    // 🔒 IDOR — AUTH + PROPRIÉTÉ : on ne modifie QUE le profil de l'appelant.
    const authUser = await verifySupabaseJWT(req);
    if (!authUser) return res.status(401).json({ error: 'unauthorized' });
    const user_id = authUser.id;

    if (!stage_name) return res.status(400).json({ error: 'stage_name required' });

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
    const { video_call_price_cents, video_call_unit, video_call_duration_minutes, autograph_price_cents, live_dedication_price_cents, currency } = req.body;

    // 🔒 IDOR — AUTH + PROPRIÉTÉ : on ne modifie QUE les tarifs de l'appelant.
    const authUser = await verifySupabaseJWT(req);
    if (!authUser) return res.status(401).json({ error: 'unauthorized' });
    const user_id = authUser.id;

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
    const { website, bio, stage_name } = req.body;

    // 🔒 IDOR — AUTH + PROPRIÉTÉ : on ne modifie QUE le profil de l'appelant.
    const authUser = await verifySupabaseJWT(req);
    if (!authUser) return res.status(401).json({ error: 'unauthorized' });
    const user_id = authUser.id;

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
    if (user_id !== authUser.id) {
      req.__authUserId = authUser.id;
      logSecurityEvent(req, 'IDOR photo de profil', `tentative de modifier l'avatar d'un autre compte (user_id ${user_id})`);
      return res.status(403).json({ error: 'user_id does not match authenticated user' });
    }

    const db = getSupabaseAdmin();
    const isPng = (content_type || '').includes('png');
    const ext = isPng ? 'png' : 'jpg';
    const cleanB64 = String(image_base64).replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(cleanB64, 'base64');

    // 🛡️ Modération : bloque les photos de profil à caractère sexuel/violent/interdit.
    const mod = await moderateImage(buffer, content_type || (isPng ? 'image/png' : 'image/jpeg'));
    if (!mod.safe) {
      return res.status(403).json({
        error: 'content_rejected',
        reason: mod.reason,
        message: 'Cette image ne respecte pas nos règles de contenu et ne peut pas être utilisée comme photo de profil.',
      });
    }

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

    // 🔒 IDOR — AUTH + PROPRIÉTÉ : on ne lit QUE les tarifs de l'appelant.
    const authUser = await verifySupabaseJWT(req);
    if (!authUser) return res.status(401).json({ error: 'unauthorized' });
    const user_id = authUser.id;

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
    const { wikidata_id } = req.body;

    // 🔒 IDOR — AUTH + PROPRIÉTÉ : on ne synchronise QUE le profil de l'appelant
    // (l'auto-vérification official_verified ne doit pas être déclenchable pour autrui).
    const authUser = await verifySupabaseJWT(req);
    if (!authUser) return res.status(401).json({ error: 'unauthorized' });
    const celebrity_id = authUser.id;

    if (!wikidata_id) return res.status(400).json({ error: 'wikidata_id required' });

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
    // 🔒 IDOR — AUTH + PROPRIÉTÉ : la demande est toujours au nom de l'appelant
    // (aligné sur creator/celebrity-verification-request).
    const authUser = await verifySupabaseJWT(req);
    if (!authUser) return res.status(401).json({ error: 'unauthorized' });

    const {
      org_name, org_type, official_website,
      contact_email, representative_name, representative_role,
      proof_description, proof_url, social_links
    } = req.body;

    const user_id = authUser.id;

    if (!org_name || !org_type || !contact_email || !representative_name) {
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

// =====================================================================
// DAILY.CO — proxy serveur (la clé admin Daily reste côté serveur)
// La clé EXPO_PUBLIC_DAILY_API_KEY ne doit plus jamais être utilisée par
// le client. Toutes les opérations admin Daily passent par ces endpoints,
// protégés par verifySupabaseJWT (401 si non authentifié).
// =====================================================================
const DAILY_API_URL = 'https://api.daily.co/v1';

function getDailyApiKey() {
  // Clé NON-publique (jamais embarquée dans l'app)
  return process.env.DAILY_API_KEY || null;
}

// POST /api/daily/create-room
// body: { name?, expiryMinutes?, maxParticipants?, isPrivate? }
// renvoie l'objet room Daily complet (incl. .url et .name)
app.post('/api/daily/create-room', async (req, res) => {
  try {
    const authUser = await verifySupabaseJWT(req);
    if (!authUser) return res.status(401).json({ error: 'Authentication required' });

    const apiKey = getDailyApiKey();
    if (!apiKey) return res.status(500).json({ error: 'Daily API key not configured' });

    const {
      name = `plyz-${Date.now()}`,
      expiryMinutes = 120,
      maxParticipants = 50,
      isPrivate = true,
    } = req.body || {};

    const response = await fetch(`${DAILY_API_URL}/rooms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        name,
        privacy: isPrivate ? 'private' : 'public',
        properties: {
          exp: Math.floor(Date.now() / 1000) + expiryMinutes * 60,
          max_participants: maxParticipants,
          enable_chat: true,
          enable_screenshare: false,
          enable_prejoin_ui: false,
          start_video_off: false,
          start_audio_off: false,
        },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('[Daily] Failed to create room:', errorData);
      return res.status(response.status).json({ error: 'create_room_failed', details: errorData });
    }

    const room = await response.json();
    return res.json(room);
  } catch (error) {
    console.error('[Daily] Error creating room:', error);
    return res.status(500).json({ error: error.message });
  }
});

// POST /api/daily/meeting-token
// body: { roomName, userName, userId, isOwner?, expiryMinutes? }
// renvoie: { token }
app.post('/api/daily/meeting-token', async (req, res) => {
  try {
    const authUser = await verifySupabaseJWT(req);
    if (!authUser) return res.status(401).json({ error: 'Authentication required' });

    const apiKey = getDailyApiKey();
    if (!apiKey) return res.status(500).json({ error: 'Daily API key not configured' });

    const {
      roomName,
      userName,
      userId,
      isOwner = false,
      expiryMinutes = 120,
    } = req.body || {};

    if (!roomName) return res.status(400).json({ error: 'roomName required' });

    const response = await fetch(`${DAILY_API_URL}/meeting-tokens`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        properties: {
          room_name: roomName,
          user_name: userName,
          user_id: userId,
          is_owner: isOwner,
          enable_screenshare: false,
          enable_prejoin_ui: false,
          start_video_off: false,
          start_audio_off: false,
          exp: Math.floor(Date.now() / 1000) + expiryMinutes * 60,
        },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('[Daily] Failed to create meeting token:', errorData);
      return res.status(response.status).json({ error: 'meeting_token_failed', details: errorData });
    }

    const data = await response.json();
    return res.json({ token: data.token });
  } catch (error) {
    console.error('[Daily] Error creating meeting token:', error);
    return res.status(500).json({ error: error.message });
  }
});

// POST /api/daily/delete-room
// body: { roomName }
// renvoie: { ok: boolean }
app.post('/api/daily/delete-room', async (req, res) => {
  try {
    const authUser = await verifySupabaseJWT(req);
    if (!authUser) return res.status(401).json({ error: 'Authentication required' });

    const apiKey = getDailyApiKey();
    if (!apiKey) return res.status(500).json({ error: 'Daily API key not configured' });

    const { roomName } = req.body || {};
    if (!roomName) return res.status(400).json({ error: 'roomName required' });

    const response = await fetch(`${DAILY_API_URL}/rooms/${roomName}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    return res.json({ ok: response.ok });
  } catch (error) {
    console.error('[Daily] Error deleting room:', error);
    return res.status(500).json({ error: error.message });
  }
});

// POST /api/daily/get-room
// body: { roomName }
// renvoie l'objet room Daily, ou 404 si absente
app.post('/api/daily/get-room', async (req, res) => {
  try {
    const authUser = await verifySupabaseJWT(req);
    if (!authUser) return res.status(401).json({ error: 'Authentication required' });

    const apiKey = getDailyApiKey();
    if (!apiKey) return res.status(500).json({ error: 'Daily API key not configured' });

    const { roomName } = req.body || {};
    if (!roomName) return res.status(400).json({ error: 'roomName required' });

    const response = await fetch(`${DAILY_API_URL}/rooms/${roomName}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      return res.status(404).json({ error: 'room_not_found' });
    }

    const room = await response.json();
    return res.json(room);
  } catch (error) {
    console.error('[Daily] Error getting room:', error);
    return res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// Notation d'un utilisateur après une session (anti-triche).
//
// 🔒 SÉCURITÉ : autrefois le CLIENT calculait la moyenne et écrivait directement
// average_rating / total_ratings / is_banned / ban_reason dans user_profiles.
// Un utilisateur pouvait donc se débannir, bannir un concurrent ou truquer sa
// note. On déplace ici, côté serveur (service role), TOUTE écriture de ces
// colonnes. Le client ne fait plus qu'appeler cet endpoint.
//
// Body attendu :
//   - session_id (string, requis)
//   - rated_id   (string, requis)  : device_id de l'utilisateur noté
//   - rating     (number, requis)  : 1..5
//   - rater_id   (string, requis)  : device_id de l'auteur de la note
//   - queue_entry_id (string, optionnel)
//   - rater_type / rated_type ('fan' | 'celebrity', optionnels)
//   - comment    (string, optionnel)
//
// Règle de ban (IDENTIQUE au client historique) : moyenne < 3 ET total >= 3.
// Réponse : { ok: true, average, total, banned }
// ---------------------------------------------------------------------------
app.post('/api/submit-rating', async (req, res) => {
  try {
    // Auth obligatoire : seul un utilisateur connecté peut noter.
    const authUser = await verifySupabaseJWT(req);
    if (!authUser) return res.status(401).json({ error: 'Authentication required' });

    const admin = getSupabaseAdmin();
    const {
      session_id,
      rated_id,
      rating,
      rater_id,
      queue_entry_id,
      rater_type,
      rated_type,
      comment,
    } = req.body || {};

    if (!session_id || !rated_id || !rater_id) {
      return res.status(400).json({ error: 'Missing session_id, rated_id or rater_id' });
    }

    const numericRating = Number(rating);
    if (!Number.isFinite(numericRating) || numericRating < 1 || numericRating > 5) {
      return res.status(400).json({ error: 'rating must be a number between 1 and 5' });
    }

    // Anti-doublon : une seule note par (session_id, rater_id, rated_id).
    const { data: existingRating } = await admin
      .from('session_ratings')
      .select('id')
      .eq('session_id', session_id)
      .eq('rater_id', rater_id)
      .eq('rated_id', rated_id)
      .maybeSingle();

    if (!existingRating) {
      const { error: insertErr } = await admin
        .from('session_ratings')
        .insert({
          session_id,
          queue_entry_id: queue_entry_id || null,
          rater_id,
          rater_type: rater_type || null,
          rated_id,
          rated_type: rated_type || null,
          rating: numericRating,
          comment: comment || null,
        });

      if (insertErr) {
        console.error('[SubmitRating] Insert error:', insertErr.message);
        return res.status(500).json({ error: insertErr.message });
      }
    } else {
      console.log('[SubmitRating] Rating already exists, skipping insert');
    }

    // Recalcul SERVEUR de la moyenne du noté (toutes ses notes).
    const { data: ratings, error: aggErr } = await admin
      .from('session_ratings')
      .select('rating')
      .eq('rated_id', rated_id);

    if (aggErr) {
      console.error('[SubmitRating] Aggregate error:', aggErr.message);
      return res.status(500).json({ error: aggErr.message });
    }

    const totalRatings = ratings ? ratings.length : 0;
    if (totalRatings === 0) {
      return res.json({ ok: true, average: 0, total: 0, banned: false });
    }

    const sumRatings = ratings.reduce((sum, r) => sum + Number(r.rating || 0), 0);
    const averageRating = sumRatings / totalRatings;
    const roundedAverage = Math.round(averageRating * 100) / 100;

    // MÊME seuil que le client historique : avg < 3 ET total >= 3.
    const shouldBan = averageRating < 3 && totalRatings >= 3;

    const { error: updateErr } = await admin
      .from('user_profiles')
      .update({
        average_rating: roundedAverage,
        total_ratings: totalRatings,
        is_banned: shouldBan,
        ban_reason: shouldBan ? 'Note moyenne inférieure à 3 étoiles' : null,
        updated_at: new Date().toISOString(),
      })
      .eq('device_id', rated_id);

    if (updateErr) {
      console.error('[SubmitRating] Profile update error:', updateErr.message);
      return res.status(500).json({ error: updateErr.message });
    }

    console.log(
      `[SubmitRating] rated=${rated_id} avg=${roundedAverage} total=${totalRatings} banned=${shouldBan}`
    );
    return res.json({ ok: true, average: roundedAverage, total: totalRatings, banned: shouldBan });
  } catch (error) {
    console.error('[SubmitRating] Error:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

// ============================================================
// Traduction automatique du contenu UGC (posts, bios) via Claude.
// Cache en base (table translations) → chaque texte n'est traduit
// qu'UNE fois par langue. Le coût ne dépend donc pas du nombre de lecteurs.
// ============================================================
const TRANSLATE_LANG_NAMES = {
  en: 'English', fr: 'French', es: 'Spanish', de: 'German', pt: 'Portuguese',
  it: 'Italian', hi: 'Hindi', ur: 'Urdu', ar: 'Arabic', zh: 'Chinese',
  bn: 'Bengali', ru: 'Russian', id: 'Indonesian', ja: 'Japanese', ms: 'Malay',
};
const MAX_TRANSLATE_ITEMS = 50;
const MAX_TRANSLATE_CHARS = 2000;

function translateHash(targetLang, text) {
  return require('crypto').createHash('sha256').update(targetLang + '' + text).digest('hex');
}

async function claudeTranslateBatch(texts, langName) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY missing');
  const system = `You are a professional translation engine for a social app where celebrities post short messages, captions and bios. Translate each input string into ${langName}.
Rules:
- Preserve the meaning, tone, style, emojis, #hashtags, @mentions and line breaks.
- Keep proper nouns (people, places, brands) unchanged.
- Do NOT add quotes, notes or explanations.
- If a string is already written in ${langName}, return it unchanged.
- Output ONLY a JSON array of strings, exactly the same length and order as the input.`;
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: Math.min(8000, texts.length * 220 + 500),
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: JSON.stringify(texts) }],
    }),
  });
  const j = await resp.json();
  if (!j.content || !j.content[0] || !j.content[0].text) {
    const et = j.error?.type || '', em = j.error?.message || '';
    if (['rate_limit_error', 'overloaded_error', 'authentication_error', 'api_error'].includes(et)
        || /credit|quota|balance|limit/i.test(em)) {
      recordServiceAlert('anthropic', 'critical', 'Claude indisponible — la TRADUCTION est dégradée : ' + (em || et));
    }
    throw new Error('Anthropic error: ' + JSON.stringify(j).slice(0, 300));
  }
  let txt = j.content[0].text.trim();
  txt = txt.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const arr = JSON.parse(txt);
  if (!Array.isArray(arr) || arr.length !== texts.length) {
    throw new Error('Unexpected translation array length');
  }
  return arr.map((s) => String(s));
}

app.post('/api/translate', async (req, res) => {
  try {
    const { texts, targetLang } = req.body || {};
    const langName = TRANSLATE_LANG_NAMES[targetLang];
    if (!Array.isArray(texts) || !langName) {
      return res.status(400).json({ error: 'texts[] and a supported targetLang are required' });
    }
    // Normalisation + garde-fous anti-abus
    const clean = texts.slice(0, MAX_TRANSLATE_ITEMS).map((t) =>
      typeof t === 'string' ? t.slice(0, MAX_TRANSLATE_CHARS) : ''
    );
    const uniq = Array.from(new Set(clean.filter((s) => s.trim().length > 0)));
    if (uniq.length === 0) return res.json({ translations: clean });

    const db = getSupabaseAdmin();
    const hashes = uniq.map((s) => translateHash(targetLang, s));

    // 1) Lecture du cache
    const { data: cached } = await db
      .from('translations')
      .select('text_hash, translated_text')
      .eq('target_lang', targetLang)
      .in('text_hash', hashes);
    const byHash = new Map((cached || []).map((r) => [r.text_hash, r.translated_text]));

    // 2) Traduction des manquants via Claude, puis mise en cache
    const missing = uniq.filter((s, i) => !byHash.has(hashes[i]));
    if (missing.length > 0) {
      const translated = await claudeTranslateBatch(missing, langName);
      const rows = missing.map((s, i) => ({
        text_hash: translateHash(targetLang, s),
        target_lang: targetLang,
        translated_text: translated[i],
      }));
      await db.from('translations').upsert(rows, { onConflict: 'text_hash,target_lang' });
      missing.forEach((s, i) => byHash.set(translateHash(targetLang, s), translated[i]));
    }

    // 3) Réponse dans l'ordre d'entrée (texte vide => inchangé)
    const out = clean.map((s) =>
      s.trim().length > 0 ? byHash.get(translateHash(targetLang, s)) ?? s : s
    );
    return res.json({ translations: out });
  } catch (e) {
    console.error('[translate] error:', e.message);
    return res.status(500).json({ error: 'translation_failed' });
  }
});

// ============================================================
// Infos fiscales des Personnalités (conformité DAC7).
// La collecte du NIF/statut est requise pour la déclaration annuelle
// des revenus des prestataires (directive UE 2021/514).
// ============================================================
app.get('/api/celebrity/tax-info', async (req, res) => {
  try {
    const authUser = await verifySupabaseJWT(req);
    if (!authUser) return res.status(401).json({ error: 'Authentication required' });
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from('celebrity_profiles')
      .select('tax_status, tax_country, tax_id, business_number, vat_number, tax_info_completed')
      .eq('user_id', authUser.id)
      .maybeSingle();
    if (error) throw error;
    return res.json({ taxInfo: data || null });
  } catch (e) {
    console.error('[tax-info GET] error:', e.message);
    return res.status(500).json({ error: 'tax_info_read_failed' });
  }
});

app.post('/api/celebrity/tax-info', async (req, res) => {
  try {
    const authUser = await verifySupabaseJWT(req);
    if (!authUser) return res.status(401).json({ error: 'Authentication required' });
    const { tax_status, tax_country, tax_id, business_number, vat_number } = req.body || {};
    if (!['individual', 'business'].includes(tax_status)) {
      return res.status(400).json({ error: 'tax_status must be individual or business' });
    }
    if (!tax_country || !tax_id) {
      return res.status(400).json({ error: 'tax_country and tax_id are required' });
    }
    const db = getSupabaseAdmin();
    const { error } = await db
      .from('celebrity_profiles')
      .update({
        tax_status,
        tax_country: String(tax_country).trim().toUpperCase().slice(0, 2),
        tax_id: String(tax_id).trim().slice(0, 60),
        business_number: business_number ? String(business_number).trim().slice(0, 60) : null,
        vat_number: vat_number ? String(vat_number).trim().slice(0, 40) : null,
        tax_info_completed: true,
        tax_info_updated_at: new Date().toISOString(),
      })
      .eq('user_id', authUser.id);
    if (error) throw error;
    return res.json({ ok: true });
  } catch (e) {
    console.error('[tax-info POST] error:', e.message);
    return res.status(500).json({ error: 'tax_info_save_failed' });
  }
});

// ============================================================
// Factures : émises par Plyz au nom de la Personnalité (mandat de
// facturation, art. 289 CGI). Une facture par prestation payée (idempotent).
// ============================================================
function invEscape(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function invMoney(cents, currency) {
  const sym = { eur: '€', usd: '$', gbp: '£' }[String(currency || 'eur').toLowerCase()] || (currency || '');
  return (Number(cents || 0) / 100).toFixed(2).replace('.', ',') + ' ' + sym;
}
function renderInvoiceHtml(inv) {
  const s = inv.seller_snapshot || {};
  const b = inv.buyer_snapshot || {};
  const dateStr = new Date(inv.prestation_date || Date.now()).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  const sellerLegal = [
    s.name ? invEscape(s.name) : 'Personnalité',
    s.status === 'business' ? 'Professionnel' : (s.status === 'individual' ? 'Particulier' : ''),
    s.country ? ('Pays : ' + invEscape(s.country)) : '',
    s.business_number ? ('SIREN : ' + invEscape(s.business_number)) : '',
    s.vat_number ? ('TVA : ' + invEscape(s.vat_number)) : '',
    s.tax_id ? ('NIF : ' + invEscape(s.tax_id)) : '',
  ].filter(Boolean).join('<br>');
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Facture ${invEscape(inv.invoice_number)}</title>
<style>body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111;max-width:720px;margin:0 auto;padding:32px;font-size:14px;line-height:1.5}h1{font-size:22px;margin:0 0 4px}.muted{color:#666}.row{display:flex;justify-content:space-between;gap:24px;flex-wrap:wrap}.box{border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin:12px 0}.total{font-size:18px;font-weight:700}table{width:100%;border-collapse:collapse;margin:12px 0}td,th{text-align:left;padding:8px;border-bottom:1px solid #eee}th{color:#666;font-weight:600}.right{text-align:right}.small{font-size:12px;color:#666}</style></head>
<body>
<h1>FACTURE</h1>
<div class="muted">N° ${invEscape(inv.invoice_number)} — ${dateStr}</div>
<div class="box small">Facture émise par <strong>Plyz — CLICKZOU (SAS)</strong>, 5 impasse de la Colombette, 31000 Toulouse, France, <strong>au nom et pour le compte</strong> de la Personnalité ci-dessous (mandat de facturation, art. 289 CGI).</div>
<div class="row">
  <div class="box" style="flex:1;min-width:240px"><div class="muted">Prestataire (vendeur)</div><strong>${sellerLegal}</strong></div>
  <div class="box" style="flex:1;min-width:240px"><div class="muted">Client</div><strong>${invEscape(b.name || 'Client')}</strong></div>
</div>
<table><thead><tr><th>Prestation</th><th>Date</th><th class="right">Montant</th></tr></thead>
<tbody><tr><td>${invEscape(inv.prestation_label || 'Prestation')}</td><td>${dateStr}</td><td class="right">${invMoney(inv.amount_cents, inv.currency)}</td></tr></tbody></table>
<div class="row"><div></div><div class="total">Total payé : ${invMoney(inv.amount_cents, inv.currency)}</div></div>
<div class="box small">La Personnalité est seule responsable, le cas échéant, de la TVA applicable à sa prestation. Plyz a perçu une commission de service de ${invMoney(inv.commission_cents, inv.currency)} au titre de la mise en relation.</div>
<div class="small">Plyz est un service édité par CLICKZOU (SAS) — contact@plyz.io — Toulouse, France.</div>
</body></html>`;
}
async function createInvoice(params) {
  try {
    if (!params || !params.transactionRef || !params.amountCents) return null;
    const db = getSupabaseAdmin();
    const ref = String(params.transactionRef);
    const { data: existing } = await db.from('invoices').select('id, invoice_number').eq('transaction_ref', ref).maybeSingle();
    if (existing) return existing;
    const cleanId = (v) => (v ? String(v).replace(/^fan_user_/, '') : null);
    const fanId = cleanId(params.fanId);
    const celebId = cleanId(params.celebrityId);
    let celeb = null, fan = null;
    if (celebId) { const r = await db.from('celebrity_profiles').select('stage_name, tax_status, tax_country, tax_id, business_number, vat_number').eq('user_id', celebId).maybeSingle(); celeb = r.data; }
    if (fanId) { const r = await db.from('profiles').select('display_name').eq('id', fanId).maybeSingle(); fan = r.data; }
    const seller_snapshot = { name: celeb?.stage_name || null, status: celeb?.tax_status || null, country: celeb?.tax_country || null, tax_id: celeb?.tax_id || null, business_number: celeb?.business_number || null, vat_number: celeb?.vat_number || null };
    const buyer_snapshot = { name: fan?.display_name || null };
    let seq = null;
    try { const { data } = await db.rpc('next_invoice_seq'); if (data != null) seq = Number(data); } catch {}
    if (seq == null) seq = Date.now() % 1000000;
    const invoice_number = 'PLYZ-' + new Date().getFullYear() + '-' + String(seq).padStart(6, '0');
    const inv = {
      invoice_number, transaction_ref: ref, fan_id: fanId, celebrity_id: celebId,
      prestation_type: params.prestationType || null, prestation_label: params.prestationLabel || 'Prestation',
      prestation_date: params.prestationDate || new Date().toISOString(),
      amount_cents: params.amountCents, currency: (params.currency || 'eur').toLowerCase(),
      commission_cents: params.commissionCents != null ? params.commissionCents : Math.round(params.amountCents * 0.15),
      seller_snapshot, buyer_snapshot,
    };
    const html = renderInvoiceHtml(inv);
    const html_path = (celebId || 'x') + '/' + invoice_number + '.html';
    await db.storage.from('invoices').upload(html_path, Buffer.from(html, 'utf8'), { contentType: 'text/html; charset=utf-8', upsert: true });
    const { error } = await db.from('invoices').insert({ ...inv, html_path });
    if (error) throw error;
    console.log('[Invoice] created', invoice_number, 'for', ref);
    return { invoice_number };
  } catch (e) {
    console.error('[createInvoice] error:', e.message);
    return null;
  }
}

// Liste des factures de l'utilisateur (comme fan OU comme personnalité)
app.get('/api/invoices', async (req, res) => {
  try {
    const authUser = await verifySupabaseJWT(req);
    if (!authUser) return res.status(401).json({ error: 'Authentication required' });
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from('invoices')
      .select('id, invoice_number, prestation_label, prestation_date, amount_cents, currency, commission_cents, fan_id, celebrity_id, created_at')
      .or(`fan_id.eq.${authUser.id},celebrity_id.eq.${authUser.id}`)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    const invoices = (data || []).map((i) => ({
      ...i,
      role: String(i.celebrity_id) === String(authUser.id) ? 'seller' : 'buyer',
    }));
    return res.json({ invoices });
  } catch (e) {
    console.error('[invoices GET] error:', e.message);
    return res.status(500).json({ error: 'invoices_read_failed' });
  }
});

// Lien de téléchargement signé d'une facture (accès réservé au fan ou à la personnalité concernée)
app.get('/api/invoice/:id/download', async (req, res) => {
  try {
    const authUser = await verifySupabaseJWT(req);
    if (!authUser) return res.status(401).json({ error: 'Authentication required' });
    const db = getSupabaseAdmin();
    const { data: inv } = await db.from('invoices').select('html_path, fan_id, celebrity_id').eq('id', req.params.id).maybeSingle();
    if (!inv) return res.status(404).json({ error: 'not_found' });
    const ADMIN_UID = 'e7c06a67-2cd0-4aa1-bbf6-477fbb162ce8';
    if (String(inv.fan_id) !== String(authUser.id) && String(inv.celebrity_id) !== String(authUser.id) && String(authUser.id) !== ADMIN_UID) {
      return res.status(403).json({ error: 'forbidden' });
    }
    const { data: signed, error } = await db.storage.from('invoices').createSignedUrl(inv.html_path, 300);
    if (error) throw error;
    return res.json({ url: signed.signedUrl });
  } catch (e) {
    console.error('[invoice download] error:', e.message);
    return res.status(500).json({ error: 'download_failed' });
  }
});

// [ADMIN] Récupère les infos KYC d'un compte Stripe Connect (vrai nom/prénom,
// adresse, date de naissance, statut de vérification...). Réservé à l'admin.
// Usage : GET /api/admin/stripe-account?user_id=<uuid>  (ou ?account=<acct_id>)
app.get('/api/admin/stripe-account', async (req, res) => {
  try {
    const authUser = await verifySupabaseJWT(req);
    const ADMIN_UID = 'e7c06a67-2cd0-4aa1-bbf6-477fbb162ce8';
    if (!authUser || String(authUser.id) !== ADMIN_UID) {
      req.__authUserId = authUser ? authUser.id : null;
      logSecurityEvent(req, 'accès admin refusé', 'appel de /api/admin/stripe-account sans droits admin');
      return res.status(403).json({ error: 'forbidden' });
    }
    let acct = req.query.account;
    if (!acct && req.query.user_id) {
      const db = getSupabaseAdmin();
      const { data: cp } = await db.from('celebrity_profiles')
        .select('stripe_account_id').eq('user_id', req.query.user_id).maybeSingle();
      acct = cp && cp.stripe_account_id;
    }
    if (!acct) return res.status(404).json({ error: 'no_stripe_account' });

    const stripe = await getStripe();
    const a = await stripe.accounts.retrieve(String(acct));
    const ind = a.individual || {};
    const comp = a.company || {};
    const fmtAddr = (ad) => ad ? [ad.line1, ad.line2, ad.postal_code, ad.city, ad.country].filter(Boolean).join(', ') : null;
    const fmtDob = (d) => d && d.year ? `${String(d.day||'').padStart(2,'0')}/${String(d.month||'').padStart(2,'0')}/${d.year}` : null;

    return res.json({
      id: a.id,
      business_type: a.business_type,
      email: a.email,
      country: a.country,
      default_currency: a.default_currency,
      charges_enabled: a.charges_enabled,
      payouts_enabled: a.payouts_enabled,
      details_submitted: a.details_submitted,
      individual: {
        first_name: ind.first_name || null,
        last_name: ind.last_name || null,
        dob: fmtDob(ind.dob),
        email: ind.email || null,
        phone: ind.phone || null,
        address: fmtAddr(ind.address),
        verification_status: (ind.verification && ind.verification.status) || null,
      },
      company: {
        name: comp.name || null,
        phone: comp.phone || null,
        address: fmtAddr(comp.address),
        tax_id_provided: comp.tax_id_provided || false,
        vat_id_provided: comp.vat_id_provided || false,
      },
      requirements_due: (a.requirements && a.requirements.currently_due) || [],
    });
  } catch (e) {
    console.error('[admin stripe-account] error:', e.message);
    return res.status(500).json({ error: e.message });
  }
});

// ============================================================
// SÉCURITÉ : journalise une tentative suspecte (intrusion) + alerte admin.
// ============================================================
function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()
    || (req.socket && req.socket.remoteAddress) || 'inconnue';
}
function logSecurityEvent(req, kind, detail) {
  try {
    const who = req.__authUserId ? ('user ' + req.__authUserId) : 'non authentifié';
    const ctx = `${req.method} ${(req.originalUrl || req.url || '').split('?')[0]} | IP ${clientIp(req)} | ${who}`;
    // service='security' → visible sur le dashboard + email throttlé (1/h).
    recordServiceAlert('security', 'critical', `🔒 ${kind} : ${detail} — ${ctx}`);
  } catch (e) { console.error('[Security] log failed:', e.message); }
}

// [ADMIN] Vérifie en direct l'état des services critiques (Claude, Stripe, Supabase,
// e-mail). Enregistre une alerte pour chaque service en panne. Réservé à l'admin.
app.get('/api/admin/health-check', async (req, res) => {
  const authUser = await verifySupabaseJWT(req);
  const ADMIN_UID = 'e7c06a67-2cd0-4aa1-bbf6-477fbb162ce8';
  if (!authUser || String(authUser.id) !== ADMIN_UID) {
    req.__authUserId = authUser ? authUser.id : null;
    logSecurityEvent(req, 'accès admin refusé', 'appel de /api/admin/health-check sans droits admin');
    return res.status(403).json({ error: 'forbidden' });
  }
  const out = {};
  // Anthropic (Claude) — petit appel réel
  try {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) { out.anthropic = { ok: false, detail: 'clé absente' }; }
    else {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 5, messages: [{ role: 'user', content: 'ping' }] }),
      });
      const j = await r.json();
      if (j.error) { out.anthropic = { ok: false, detail: j.error.message || j.error.type }; recordServiceAlert('anthropic', 'critical', 'Health-check: ' + (j.error.message || j.error.type)); }
      else out.anthropic = { ok: true };
    }
  } catch (e) { out.anthropic = { ok: false, detail: e.message }; }
  // Stripe
  try {
    const stripe = await getStripe();
    await stripe.balance.retrieve();
    out.stripe = { ok: true };
  } catch (e) { out.stripe = { ok: false, detail: e.message }; recordServiceAlert('stripe', 'critical', 'Health-check Stripe: ' + e.message); }
  // Supabase
  try {
    const { error } = await getSupabaseAdmin().from('service_alerts').select('id').limit(1);
    if (error) throw error;
    out.supabase = { ok: true };
  } catch (e) { out.supabase = { ok: false, detail: e.message }; recordServiceAlert('supabase', 'critical', 'Health-check Supabase: ' + e.message); }
  // E-mail (configuré ?)
  out.email = { ok: !!getMailTransporter(), detail: getMailTransporter() ? undefined : 'SMTP non configuré' };
  res.json({ checked_at: new Date().toISOString(), services: out });
});

// [ADMIN] Analyse une alerte (surtout sécurité/intrusion) avec Claude :
// intentions probables, ce qui a été tenté, niveau de risque, action recommandée.
app.post('/api/admin/analyze-alert', async (req, res) => {
  const authUser = await verifySupabaseJWT(req);
  const ADMIN_UID = 'e7c06a67-2cd0-4aa1-bbf6-477fbb162ce8';
  if (!authUser || String(authUser.id) !== ADMIN_UID) {
    req.__authUserId = authUser ? authUser.id : null;
    logSecurityEvent(req, 'accès admin refusé', 'appel de /api/admin/analyze-alert sans droits admin');
    return res.status(403).json({ error: 'forbidden' });
  }
  try {
    if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'anthropic_unavailable' });
    const { id, service, severity, message } = req.body || {};
    const analysis = await analyzeAlertText(service, severity, message);
    if (!analysis) return res.status(502).json({ error: 'analysis_failed' });
    // Si un id est fourni, on persiste l'analyse (ré-analyse manuelle).
    if (id) { try { await getSupabaseAdmin().from('service_alerts').update({ analysis }).eq('id', id); } catch {} }
    res.json({ analysis });
  } catch (e) {
    console.error('[analyze-alert] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// NOTIFICATIONS PUSH — enregistrement du token + worker (outbox + rappels)
// ============================================================
app.post('/api/register-push-token', async (req, res) => {
  try {
    const authUser = await verifySupabaseJWT(req);
    if (!authUser) return res.status(401).json({ error: 'unauthorized' });
    const { token, platform } = req.body || {};
    if (!token) return res.status(400).json({ error: 'token required' });
    await getSupabaseAdmin().from('user_push_tokens').upsert(
      { user_id: authUser.id, token: String(token), platform: platform || null, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' });
    res.json({ success: true });
  } catch (e) { console.error('[register-push-token]', e.message); res.status(500).json({ error: e.message }); }
});

// Réservation d'un événement PROGRAMMÉ (fan ↔ événement). Persiste en base pour :
// (1) compter « X fans ont réservé », (2) envoyer les rappels push aux réservés.
app.post('/api/reserve-event', async (req, res) => {
  try {
    const { event_id, fan_id, fan_name, push_token } = req.body || {};
    if (!event_id || !fan_id) return res.status(400).json({ error: 'event_id and fan_id required' });
    const authUser = await verifySupabaseJWT(req);
    const fid = authUser ? authUser.id : String(fan_id); // si connecté, on force l'identité
    const db = getSupabaseAdmin();
    // Nouvelle réservation ? (pour ne notifier la personnalité qu'une seule fois)
    const { data: existingResv } = await db.from('event_reservations').select('id').eq('event_id', String(event_id)).eq('fan_id', fid).maybeSingle();
    await db.from('event_reservations').upsert(
      { event_id: String(event_id), fan_id: fid, fan_name: fan_name || null, push_token: push_token || null },
      { onConflict: 'event_id,fan_id' });
    const { count } = await db.from('event_reservations').select('id', { count: 'exact', head: true }).eq('event_id', String(event_id));
    res.json({ success: true, count: count || 0 });

    // 🔔 Notifie la personnalité qu'un fan vient de réserver (best-effort, uniquement si NOUVELLE résa).
    if (!existingResv) {
      try {
        let creatorId = null;
        const { data: es } = await db.from('event_sessions').select('created_by').eq('id', String(event_id)).maybeSingle();
        if (es && es.created_by) creatorId = es.created_by;
        else {
          const { data: ls } = await db.from('live_sessions').select('celebrity_id').eq('id', String(event_id)).maybeSingle();
          if (ls && ls.celebrity_id) creatorId = ls.celebrity_id;
        }
        if (creatorId) {
          const { data: tk } = await db.from('user_push_tokens').select('token').eq('user_id', creatorId).maybeSingle();
          if (tk && tk.token) sendExpoPush([tk.token], 'Plyz', '🎉 Un nouveau fan a réservé ton événement !', { type: 'new_reservation', eventId: String(event_id) });
        }
      } catch (nErr) { console.error('[reserve-event notif]', nErr.message); }
    }
    return;
  } catch (e) { console.error('[reserve-event]', e.message); res.status(500).json({ error: e.message }); }
});

app.post('/api/unreserve-event', async (req, res) => {
  try {
    const { event_id, fan_id } = req.body || {};
    if (!event_id || !fan_id) return res.status(400).json({ error: 'event_id and fan_id required' });
    const authUser = await verifySupabaseJWT(req);
    const fid = authUser ? authUser.id : String(fan_id);
    await getSupabaseAdmin().from('event_reservations').delete().eq('event_id', String(event_id)).eq('fan_id', fid);
    res.json({ success: true });
  } catch (e) { console.error('[unreserve-event]', e.message); res.status(500).json({ error: e.message }); }
});

// Compteur public « X ont réservé » pour un événement à venir (réservations gratuites
// + fans ayant déjà payé/pré-autorisé, sans doublon).
app.get('/api/event-reservation-count', async (req, res) => {
  try {
    const event_id = req.query.event_id;
    if (!event_id) return res.status(400).json({ error: 'event_id required' });
    const { data, error } = await getSupabaseAdmin().rpc('event_attendee_count', { p_event_id: String(event_id) });
    if (error) throw error;
    res.json({ count: Number(data) || 0 });
  } catch (e) { console.error('[event-reservation-count]', e.message); res.status(500).json({ error: e.message }); }
});

// Envoie les push en attente dans push_outbox (ex: "compte validé").
async function processPushOutbox() {
  const db = getSupabaseAdmin();
  const { data: rows } = await db.from('push_outbox').select('id, user_id, title, body, data').eq('sent', false).limit(50);
  for (const row of (rows || [])) {
    try {
      let token = null;
      if (row.user_id) {
        const { data: t } = await db.from('user_push_tokens').select('token').eq('user_id', row.user_id).maybeSingle();
        token = t && t.token;
      }
      if (token) await sendExpoPush([token], row.title || 'Plyz', row.body || '', row.data || {});
      await db.from('push_outbox').update({ sent: true, sent_at: new Date().toISOString() }).eq('id', row.id);
    } catch (e) { console.error('[Outbox]', e.message); }
  }
}

// Rappels d'événement : envoie aux inscrits (fans) + à la personnalité (créateur),
// dans une fenêtre autour de T-minutes, une seule fois (drapeau flagCol).
async function sendEventReminders(table, timeCol, creatorCol, fanTable, fanKeyCol, titleCol, fallbackName, minutes, flagCol) {
  const db = getSupabaseAdmin();
  const lo = new Date(Date.now() + (minutes * 60 - 90) * 1000).toISOString();
  const hi = new Date(Date.now() + (minutes * 60 + 90) * 1000).toISOString();
  const { data: rows } = await db.from(table).select('*').eq(flagCol, false).gte(timeCol, lo).lte(timeCol, hi);
  for (const ev of (rows || [])) {
    try {
      const tokens = [];
      if (ev[creatorCol]) {
        const { data: t } = await db.from('user_push_tokens').select('token').eq('user_id', ev[creatorCol]).maybeSingle();
        if (t && t.token) tokens.push(t.token);
      }
      if (fanTable) {
        const { data: fans } = await db.from(fanTable).select('push_token').eq(fanKeyCol, String(ev.id));
        (fans || []).forEach((f) => { if (f && f.push_token) tokens.push(f.push_token); });
      }
      // Fans ayant RÉSERVÉ (dédicace ET live) — débloque les rappels des lives programmés.
      const { data: resv } = await db.from('event_reservations').select('push_token').eq('event_id', String(ev.id));
      (resv || []).forEach((f) => { if (f && f.push_token) tokens.push(f.push_token); });
      const name = (titleCol && ev[titleCol]) ? ev[titleCol] : fallbackName;
      const body = minutes <= 0
        ? `🔴 C'est parti ! « ${name} » commence maintenant.`
        : `⏰ « ${name} » commence ${minutes >= 60 ? 'dans 1 heure' : 'dans quelques minutes'} !`;
      await sendExpoPush(tokens, 'Plyz', body, { type: 'event_reminder', eventId: ev.id });
      await db.from(table).update({ [flagCol]: true }).eq('id', ev.id);
      if (tokens.length) console.log(`[Reminder] ${table} ${ev.id} (${minutes}min) → ${tokens.length} destinataire(s)`);
    } catch (e) { console.error('[Reminder]', e.message); }
  }
}

async function runNotificationWorker() {
  try {
    await processPushOutbox();
    await sendEventReminders('event_sessions', 'starts_at', 'created_by', 'event_paid_fans', 'event_session_id', 'title', 'Ton événement', 60, 'reminded_1h');
    await sendEventReminders('event_sessions', 'starts_at', 'created_by', 'event_paid_fans', 'event_session_id', 'title', 'Ton événement', 2, 'reminded_2m');
    await sendEventReminders('live_sessions', 'scheduled_at', 'celebrity_id', 'session_queue', 'session_id', null, 'Ton live vidéo', 60, 'reminded_1h');
    await sendEventReminders('live_sessions', 'scheduled_at', 'celebrity_id', 'session_queue', 'session_id', null, 'Ton live vidéo', 2, 'reminded_2m');
    // « Ta session commence » : à l'heure de début (T≈0), aux fans inscrits + à la personnalité.
    await sendEventReminders('event_sessions', 'starts_at', 'created_by', 'event_paid_fans', 'event_session_id', 'title', 'Ton événement', 0, 'reminded_start');
    await sendEventReminders('live_sessions', 'scheduled_at', 'celebrity_id', 'session_queue', 'session_id', null, 'Ton live vidéo', 0, 'reminded_start');
  } catch (e) { console.error('[NotifWorker]', e.message); }
}

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
  // Worker notifications : outbox (compte validé) + rappels d'événement, chaque minute.
  setTimeout(runNotificationWorker, 8000);
  setInterval(runNotificationWorker, 60000);
  console.log('[Server] Notification worker started (outbox + event reminders, every 60s)');
});
