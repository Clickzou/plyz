// Génère server/auth-email-i18n.json : sujet + corps de l'email de code de connexion,
// dans les 15 langues. Placeholder {{code}} pour le code OTP.
const fs = require('fs');
function readEnv(file, key) { try { const t = fs.readFileSync(file,'utf8'); const m = t.match(new RegExp('^'+key+'=\\s*"?([^"\\n\\r]+)"?','m')); return m?m[1].trim():null; } catch { return null; } }
const KEY = readEnv('../.env','ANTHROPIC_API_KEY');
const LANGS = { fr:'French', en:'English', es:'Spanish', de:'German', it:'Italian', pt:'Portuguese', ru:'Russian', ja:'Japanese', zh:'Chinese', ar:'Arabic', hi:'Hindi', bn:'Bengali', ur:'Urdu', ms:'Malay', id:'Indonesian' };

const FR = {
  subject: "Ton code de connexion Plyz",
  body: "Bonjour,\n\nVoici ton code de connexion à Plyz :\n\n{{code}}\n\nCe code est valable 1 heure. Si tu n'es pas à l'origine de cette demande, ignore simplement ce message.\n\nÀ très vite sur Plyz,\nL'équipe Plyz",
};

async function translate(langName) {
  const system = `You are a professional translator for transactional emails of the Plyz app (a platform for video dedications and live calls with public figures). Translate the two email strings (subject, body) into ${langName}, natural and trustworthy. IMPORTANT: keep the placeholder {{code}} EXACTLY as-is (it will be replaced by a login code). Keep "Plyz" unchanged. Output ONLY a JSON object {"subject":"...","body":"..."}.`;
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method:'POST', headers:{'content-type':'application/json','x-api-key':KEY,'anthropic-version':'2023-06-01'},
    body: JSON.stringify({ model:'claude-haiku-4-5-20251001', max_tokens:1200, system:[{type:'text',text:system}], messages:[{role:'user',content:JSON.stringify(FR)}] }),
  });
  const j = await r.json();
  if (!j.content || !j.content[0]) throw new Error('Anthropic: ' + JSON.stringify(j).slice(0,300));
  let t = j.content[0].text.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/i,'').trim();
  const obj = JSON.parse(t);
  if (!obj.subject || !obj.body || !obj.body.includes('{{code}}')) throw new Error('bad translation for '+langName);
  return { subject: obj.subject, body: obj.body };
}
(async () => {
  if (!KEY) { console.log('PAS DE CLE ANTHROPIC'); return; }
  const out = { fr: FR };
  for (const [code,name] of Object.entries(LANGS)) {
    if (code === 'fr') continue;
    out[code] = await translate(name);
    console.log('  ✔ '+code);
  }
  fs.writeFileSync('./auth-email-i18n.json', JSON.stringify(out, null, 2), 'utf8');
  console.log('=== auth-email-i18n.json ECRIT (' + Object.keys(out).length + ' langues) ===');
})().catch(e=>{console.error('ERREUR:',e.message);process.exit(1);});
