// Ajoute les clés i18n "Critères d'éligibilité célébrité" dans les 15 langues.
const fs = require('fs');
function readEnv(file, key) { try { const t = fs.readFileSync(file,'utf8'); const m = t.match(new RegExp('^'+key+'=\\s*"?([^"\\n\\r]+)"?','m')); return m?m[1].trim():null; } catch { return null; } }
const KEY = readEnv('../.env','ANTHROPIC_API_KEY');
const LOC = '../signtouch-app-main/locales/';
const LANGS = { en:'English', es:'Spanish', de:'German', it:'Italian', pt:'Portuguese', ru:'Russian', ja:'Japanese', zh:'Chinese', ar:'Arabic', hi:'Hindi', bn:'Bengali', ur:'Urdu', ms:'Malay', id:'Indonesian' };

const KEYS_FR = {
  celebVerifCriteriaTitle: "Critères pour être accepté",
  celebVerifCriteriaIntro: "Avant d'envoyer ta demande, vérifie que tu remplis ces critères — sinon elle sera refusée :",
  celebVerifCrit1: "Notoriété publique vérifiable : compte certifié, page Wikipédia, au moins 100 000 abonnés sur un réseau officiel, ou couverture presse.",
  celebVerifCrit2: "Identité réelle correspondant à la personne (aucune usurpation).",
  celebVerifCrit3: "Au moins un lien officiel vérifiable (réseau certifié, site officiel, Wikipédia ou presse).",
  celebVerifCrit4: "Être majeur (ou représenté légalement) et capable de réaliser des dédicaces vidéo ou des lives.",
  celebVerifCrit5: "Respect de la loi et des règles de contenu (rien d'illégal, haineux ou à caractère sexuel explicite).",
};
const NAMES = Object.keys(KEYS_FR);

function block(valuesByKey) {
  return NAMES.map(k => '  ' + k + ': ' + JSON.stringify(valuesByKey[k]) + ',').join('\n');
}
function insertKeys(content, keysBlock) {
  let c = content.replace(/\n};\s*$/, ',\n' + keysBlock + '\n};\n');
  c = c.replace(/,(\s*),/g, ',$1'); // garde-fou anti double-virgule (bug CRLF connu)
  return c;
}
async function translateValues(langName) {
  const system = `You are a professional translator for a mobile app UI. These strings explain the eligibility criteria for a public figure ("celebrity") to be accepted on the Plyz app. Translate each string value into ${langName}, natural and UI-appropriate. Keep "Wikipédia/Wikipedia", "Plyz", and numbers like "100 000" as-is (localize the number format if natural). Output ONLY a JSON array of strings, same length and order as the input.`;
  const inputs = NAMES.map(k => KEYS_FR[k]);
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method:'POST', headers:{'content-type':'application/json','x-api-key':KEY,'anthropic-version':'2023-06-01'},
    body: JSON.stringify({ model:'claude-haiku-4-5-20251001', max_tokens:3000, system:[{type:'text',text:system}], messages:[{role:'user',content:JSON.stringify(inputs)}] }),
  });
  const j = await r.json();
  if (!j.content || !j.content[0]) throw new Error('Anthropic: ' + JSON.stringify(j).slice(0,300));
  let t = j.content[0].text.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/i,'').trim();
  const arr = JSON.parse(t);
  if (!Array.isArray(arr) || arr.length !== NAMES.length) throw new Error('bad array');
  const out = {}; NAMES.forEach((k,i) => out[k] = arr[i]); return out;
}
(async () => {
  // FR
  { let c = fs.readFileSync(LOC+'fr.ts','utf8');
    if (c.includes('celebVerifCriteriaTitle:')) { console.log('  (fr deja present, skip)'); }
    else { c = insertKeys(c, block(KEYS_FR)); fs.writeFileSync(LOC+'fr.ts', c); console.log('  ✔ fr'); } }
  for (const [code,name] of Object.entries(LANGS)) {
    const file = LOC+code+'.ts'; if (!fs.existsSync(file)){console.log('  ABSENT '+code);continue;}
    let c = fs.readFileSync(file,'utf8');
    if (c.includes('celebVerifCriteriaTitle:')) { console.log('  ('+code+' deja present, skip)'); continue; }
    const vals = await translateValues(name);
    c = insertKeys(c, block(vals));
    fs.writeFileSync(file, c); console.log('  ✔ '+code);
  }
  console.log('=== CLES CRITERES AJOUTEES ===');
})().catch(e=>{console.error('ERREUR:',e.message);process.exit(1);});
