// Régénère les 14 traductions de la fiche Google Play depuis la fiche FR mise à jour.
const fs = require('fs');
function readEnv(file, key) { try { const t = fs.readFileSync(file,'utf8'); const m = t.match(new RegExp('^'+key+'=\\s*"?([^"\\n\\r]+)"?','m')); return m?m[1].trim():null; } catch { return null; } }
const KEY = readEnv('../.env','ANTHROPIC_API_KEY');
const STORE = '../signtouch-app-main/store/';
const TR = STORE + 'translations/';

const FICHE = fs.readFileSync(STORE + 'FICHE-GOOGLE-PLAY.md','utf8');
// Description courte : le **texte** sous le titre
const scM = FICHE.match(/## Description courte[^\n]*\n\s*\n\*\*([^*]+)\*\*/);
const shortDesc = scM ? scM[1].trim() : '';
// Description complète : bloc entre le titre et "## Coordonnées"
const fs0 = FICHE.indexOf('## Description complète');
const from = FICHE.indexOf('\n', fs0) + 1;
const to = FICHE.indexOf('## Coordonnées', from);
let fullDesc = FICHE.slice(from, to).replace(/^\s*---\s*$/gm, '').trim();
if (!shortDesc || !fullDesc) { console.error('Extraction KO', {shortDesc: !!shortDesc, fullDesc: !!fullDesc}); process.exit(1); }

const LANGS = { en:'English', es:'Spanish', pt:'Portuguese', de:'German', it:'Italian', ru:'Russian', hi:'Hindi', ar:'Arabic', ja:'Japanese', id:'Indonesian', bn:'Bengali', zh:'Chinese', ms:'Malay', ur:'Urdu' };

async function translateBatch(texts, langName) {
  const system = `You are a professional translator for an app store listing (mobile app "Plyz", a marketplace connecting fans and celebrities for personalized services: private live video calls, made-to-order dedications, autographs, live events). Translate each input string into ${langName}. Keep the marketing tone, the ★ headers and • bullet points, emojis, and line breaks EXACTLY. Keep the brand name "Plyz", "QR code", "IBAN", "Stripe" unchanged. Frame it as booking personalized services, never as buying digital content. Output ONLY a JSON array of strings, same length and order.`;
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method:'POST', headers:{'content-type':'application/json','x-api-key':KEY,'anthropic-version':'2023-06-01'},
    body: JSON.stringify({ model:'claude-haiku-4-5-20251001', max_tokens:4000, system:[{type:'text',text:system}], messages:[{role:'user',content:JSON.stringify(texts)}] }),
  });
  const j = await r.json();
  if (!j.content || !j.content[0]) throw new Error('Anthropic: ' + JSON.stringify(j).slice(0,300));
  let t = j.content[0].text.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/i,'').trim();
  const arr = JSON.parse(t);
  if (!Array.isArray(arr) || arr.length !== texts.length) throw new Error('bad array');
  return arr;
}

(async () => {
  for (const [code, name] of Object.entries(LANGS)) {
    const [sc, fd] = await translateBatch([shortDesc, fullDesc], name);
    const out = `# Plyz — Google Play (${name})\n\n## Description courte (max 80 caractères)\n${sc}\n\n## Description complète\n${fd}\n`;
    fs.writeFileSync(TR + 'google-play-' + code + '.md', out);
    console.log('  ✔ ' + code);
  }
  console.log('=== TRADUCTIONS FICHE STORE RÉGÉNÉRÉES ===');
})().catch(e => { console.error('ERREUR:', e.message); process.exit(1); });
