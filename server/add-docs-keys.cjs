// Ajoute les clés i18n de l'écran "Mes documents" dans les 15 langues (fix CRLF).
const fs = require('fs');
function readEnv(file, key) { try { const t = fs.readFileSync(file,'utf8'); const m = t.match(new RegExp('^'+key+'=\\s*"?([^"\\n\\r]+)"?','m')); return m?m[1].trim():null; } catch { return null; } }
const KEY = readEnv('../.env','ANTHROPIC_API_KEY');
const LOC = '../signtouch-app-main/locales/';
const LANGS = { en:'English', es:'Spanish', de:'German', it:'Italian', pt:'Portuguese', ru:'Russian', ja:'Japanese', zh:'Chinese', ar:'Arabic', hi:'Hindi', bn:'Bengali', ur:'Urdu', ms:'Malay', id:'Indonesian' };

const KEYS_FR = {
  docsTitle: "Mes documents",
  docsSubtitle: "Retrouve ici les factures de tes prestations, à télécharger ou imprimer.",
  docsEmpty: "Aucune facture pour le moment.",
  docsBuyer: "Payé",
  docsSeller: "Revenu",
  docsRevenueTotal: "Total de tes revenus facturés",
  docsError: "Impossible d'ouvrir le document.",
  docsMenuItem: "Mes documents",
  docsMenuSub: "Tes factures et justificatifs",
};
const NAMES = Object.keys(KEYS_FR);

function block(vals) { return NAMES.map(k => '  ' + k + ': ' + JSON.stringify(vals[k]) + ',').join('\n'); }
function insertKeys(content, keysBlock) {
  content = content.replace(/(\r?\n)};\s*$/, ',$1' + keysBlock + '$1};$1');
  content = content.replace(/,(\s*),/g, ',$1');  // neutralise toute double-virgule (y compris CRLF)
  return content;
}
async function translateValues(langName) {
  const system = `You are a professional translator for a mobile app UI (a "My documents / invoices" screen). Translate each string value into ${langName}, natural and UI-appropriate. Keep "Plyz" as-is. Output ONLY a JSON array of strings, same length and order as the input.`;
  const inputs = NAMES.map(k => KEYS_FR[k]);
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method:'POST', headers:{'content-type':'application/json','x-api-key':KEY,'anthropic-version':'2023-06-01'},
    body: JSON.stringify({ model:'claude-haiku-4-5-20251001', max_tokens:2000, system:[{type:'text',text:system}], messages:[{role:'user',content:JSON.stringify(inputs)}] }),
  });
  const j = await r.json();
  if (!j.content || !j.content[0]) throw new Error('Anthropic: ' + JSON.stringify(j).slice(0,300));
  let t = j.content[0].text.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/i,'').trim();
  const arr = JSON.parse(t);
  if (!Array.isArray(arr) || arr.length !== NAMES.length) throw new Error('bad array');
  const out = {}; NAMES.forEach((k,i)=>out[k]=arr[i]); return out;
}
(async () => {
  { let c = fs.readFileSync(LOC+'fr.ts','utf8');
    if (c.includes('docsTitle:')) console.log('  (fr deja, skip)');
    else { c = insertKeys(c, block(KEYS_FR)); fs.writeFileSync(LOC+'fr.ts', c); console.log('  ✔ fr'); } }
  for (const [code,name] of Object.entries(LANGS)) {
    const file = LOC+code+'.ts'; if (!fs.existsSync(file)){console.log('  ABSENT '+code);continue;}
    let c = fs.readFileSync(file,'utf8');
    if (c.includes('docsTitle:')) { console.log('  ('+code+' deja, skip)'); continue; }
    const vals = await translateValues(name);
    c = insertKeys(c, block(vals)); fs.writeFileSync(file, c); console.log('  ✔ '+code);
  }
  console.log('=== CLES DOCUMENTS AJOUTEES ===');
})().catch(e=>{console.error('ERREUR:',e.message);process.exit(1);});
