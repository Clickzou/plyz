// Régénère les descriptions courtes (≤ 80 caractères) des 14 traductions store.
const fs = require('fs');
function readEnv(file, key) { try { const t = fs.readFileSync(file,'utf8'); const m = t.match(new RegExp('^'+key+'=\\s*"?([^"\\n\\r]+)"?','m')); return m?m[1].trim():null; } catch { return null; } }
const KEY = readEnv('../.env','ANTHROPIC_API_KEY');
const TR = '../signtouch-app-main/store/translations/';
const FR_SHORT = 'Réserve dédicaces, autographes et appels vidéo privés avec tes stars.';
const LANGS = { en:'English', es:'Spanish', pt:'Portuguese', de:'German', it:'Italian', ru:'Russian', hi:'Hindi', ar:'Arabic', ja:'Japanese', id:'Indonesian', bn:'Bengali', zh:'Chinese', ms:'Malay', ur:'Urdu' };
const clen = (s) => [...s].length;

async function claudeText(langName, maxChars) {
  const system = `You translate/adapt a mobile app store SHORT DESCRIPTION into ${langName}. HARD LIMIT: ${maxChars} characters maximum (count characters, this is critical — Google Play rejects longer). Keep it catchy, service-oriented: booking personalized dedications, autographs and private video calls with your favorite stars. Keep it natural in ${langName}. Output ONLY the final string — no quotes, no notes, no explanation.`;
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method:'POST', headers:{'content-type':'application/json','x-api-key':KEY,'anthropic-version':'2023-06-01'},
    body: JSON.stringify({ model:'claude-haiku-4-5-20251001', max_tokens:200, system:[{type:'text',text:system}], messages:[{role:'user',content:FR_SHORT}] }),
  });
  const j = await r.json();
  if (!j.content || !j.content[0]) throw new Error('Anthropic: ' + JSON.stringify(j).slice(0,200));
  return j.content[0].text.trim().replace(/^["'«»]+|["'«»]+$/g,'').trim();
}

async function shortFor(name) {
  let s = await claudeText(name, 72);
  if (clen(s) > 80) s = await claudeText(name, 58);
  if (clen(s) > 80) s = [...s].slice(0, 79).join('');
  return s;
}

(async () => {
  for (const [code, name] of Object.entries(LANGS)) {
    const file = TR + 'google-play-' + code + '.md';
    if (!fs.existsSync(file)) { console.log('  ABSENT ' + code); continue; }
    const sc = await shortFor(name);
    let txt = fs.readFileSync(file, 'utf8');
    const marker = '## Description courte (max 80 caractères)\n';
    const idx = txt.indexOf(marker);
    if (idx < 0) { console.log('  marqueur KO ' + code); continue; }
    const ls = idx + marker.length;
    const le = txt.indexOf('\n', ls);
    txt = txt.slice(0, ls) + sc + txt.slice(le);
    fs.writeFileSync(file, txt);
    console.log('  ✔ ' + code + ' (' + clen(sc) + ' car) : ' + sc);
  }
  console.log('=== DESCRIPTIONS COURTES ≤80 OK ===');
})().catch(e => { console.error('ERREUR:', e.message); process.exit(1); });
