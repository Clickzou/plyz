// Reformule l'onboarding paiement célébrité : "Connecter Stripe" -> "Activer mes paiements".
// Applique aux 15 fichiers locales (FR direct, autres langues via Claude).
const fs = require('fs');
function readEnv(file, key) {
  try { const t = fs.readFileSync(file, 'utf8'); const m = t.match(new RegExp('^' + key + '=\\s*"?([^"\\n\\r]+)"?', 'm')); return m ? m[1].trim() : null; } catch { return null; }
}
const KEY = readEnv('../.env', 'ANTHROPIC_API_KEY');
const LOC = '../signtouch-app-main/locales/';

const LANGS = { en:'English', es:'Spanish', de:'German', pt:'Portuguese', it:'Italian', hi:'Hindi', ur:'Urdu', ar:'Arabic', zh:'Chinese', bn:'Bengali', ru:'Russian', id:'Indonesian', ja:'Japanese', ms:'Malay' };

// Clés d'ACTION à reformuler (retirer "compte Stripe" du 1er plan). Valeurs FR de référence.
const NEW_FR = {
  celVerifiedStripe: 'Paiements activés',
  celOnboardStep3: 'Activez votre espace de paiement pour recevoir vos revenus',
  celOnboardStripeLinked: 'Vos paiements sont activés. Vous pouvez recevoir vos revenus.',
  celOnboardStripeNotLinked: 'Activez vos paiements pour recevoir les revenus de vos fans.',
  celOnboardStripeConnect: 'Activer mes paiements',
  celOnboardStripeSection: 'PAIEMENTS',
  stripeConnectExisting: "J'ai déjà activé mes paiements",
  stripeConnectSubtitle: "Pour recevoir vos revenus, activez votre espace de paiement sécurisé. C'est rapide (identité + IBAN), gratuit et 100% sécurisé.",
  stripeModalSubtitle: "Pour recevoir vos revenus, activez votre espace de paiement sécurisé.",
  stripeConnectIncomplete: "Veuillez d'abord compléter toutes les étapes de configuration, puis revenez ici.",
  stripeConnectTitle: 'Recevez vos paiements',
  stripeConnectFeature1Desc: "Paiements sécurisés par notre partenaire de paiement, utilisé par des millions d'entreprises dans le monde.",
};
const KEYS = Object.keys(NEW_FR);

function replaceKey(txt, key, newVal) {
  const re = new RegExp('(\\b' + key + '\\s*:\\s*)(\'(?:\\\\.|[^\'\\\\])*\'|"(?:\\\\.|[^"\\\\])*")');
  if (!re.test(txt)) return { txt, found: false };
  return { txt: txt.replace(re, '$1' + JSON.stringify(newVal)), found: true };
}

async function translateBatch(texts, langName) {
  const system = `You are a professional translation engine for a mobile app UI (celebrity payment onboarding). Translate each input string into ${langName}. Keep it natural, short and UI-appropriate. Preserve the meaning and tone (reassuring, "activate my payments / receive my income"). Do NOT mention Stripe. Keep "IBAN" as is. Output ONLY a JSON array of strings, same length and order.`;
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 2000, system: [{ type:'text', text: system }], messages: [{ role:'user', content: JSON.stringify(texts) }] }),
  });
  const j = await r.json();
  if (!j.content || !j.content[0]) throw new Error('Anthropic: ' + JSON.stringify(j).slice(0,300));
  let t = j.content[0].text.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/i,'').trim();
  const arr = JSON.parse(t);
  if (!Array.isArray(arr) || arr.length !== texts.length) throw new Error('bad array');
  return arr;
}

(async () => {
  // FR direct
  { let txt = fs.readFileSync(LOC + 'fr.ts', 'utf8'); let n = 0;
    for (const k of KEYS) { const r = replaceKey(txt, k, NEW_FR[k]); if (r.found) { txt = r.txt; n++; } }
    fs.writeFileSync(LOC + 'fr.ts', txt); console.log('  ✔ fr (' + n + ')'); }
  // autres langues
  const frVals = KEYS.map(k => NEW_FR[k]);
  for (const [code, name] of Object.entries(LANGS)) {
    const file = LOC + code + '.ts';
    if (!fs.existsSync(file)) { console.log('  ABSENT ' + code); continue; }
    const tr = await translateBatch(frVals, name);
    let txt = fs.readFileSync(file, 'utf8'); let n = 0;
    KEYS.forEach((k, i) => { const r = replaceKey(txt, k, tr[i]); if (r.found) { txt = r.txt; n++; } });
    fs.writeFileSync(file, txt); console.log('  ✔ ' + code + ' (' + n + ')');
  }
  console.log('=== REFORMULATION PAIEMENTS TERMINÉE ===');
})().catch(e => { console.error('ERREUR:', e.message); process.exit(1); });
