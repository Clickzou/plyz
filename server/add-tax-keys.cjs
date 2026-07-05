// Ajoute les clés i18n de l'écran "Informations fiscales" (DAC7) dans les 15 langues.
const fs = require('fs');
function readEnv(file, key) { try { const t = fs.readFileSync(file,'utf8'); const m = t.match(new RegExp('^'+key+'=\\s*"?([^"\\n\\r]+)"?','m')); return m?m[1].trim():null; } catch { return null; } }
const KEY = readEnv('../.env','ANTHROPIC_API_KEY');
const LOC = '../signtouch-app-main/locales/';
const LANGS = { en:'English', es:'Spanish', de:'German', it:'Italian', pt:'Portuguese', ru:'Russian', ja:'Japanese', zh:'Chinese', ar:'Arabic', hi:'Hindi', bn:'Bengali', ur:'Urdu', ms:'Malay', id:'Indonesian' };

const KEYS_FR = {
  taxInfoTitle: "Informations fiscales",
  taxInfoSubtitle: "Ces informations sont nécessaires à la déclaration de tes revenus (obligation légale des plateformes, DAC7).",
  taxInfoStatusLabel: "Ton statut",
  taxInfoIndividual: "Particulier",
  taxInfoBusiness: "Professionnel / Entreprise",
  taxInfoCountryLabel: "Pays de résidence fiscale",
  taxInfoCountryPlaceholder: "Ex : FR, BE, CH…",
  taxInfoTaxIdLabel: "Numéro d'identification fiscale (NIF)",
  taxInfoTaxIdPlaceholder: "Ton numéro fiscal",
  taxInfoTaxIdHint: "En France : ton numéro fiscal à 13 chiffres, indiqué sur ton avis d'imposition.",
  taxInfoBusinessNumberLabel: "Numéro d'entreprise (SIREN)",
  taxInfoVatNumberLabel: "Numéro de TVA (si applicable)",
  taxInfoSaveBtn: "Enregistrer",
  taxInfoSavedMsg: "Tes informations fiscales ont bien été enregistrées.",
  taxInfoRequiredMsg: "Merci de renseigner ton statut, ton pays et ton numéro fiscal.",
  taxInfoErrorMsg: "Une erreur est survenue lors de l'enregistrement.",
  taxInfoWhyTitle: "Pourquoi ces informations ?",
  taxInfoWhyText: "En tant que plateforme, Plyz doit déclarer chaque année aux administrations fiscales les revenus versés aux créateurs (directive européenne DAC7). Tes données sont conservées de façon sécurisée et servent uniquement à cette obligation légale.",
  taxInfoMenuItem: "Informations fiscales",
  taxInfoMenuSub: "Requis pour recevoir tes revenus (DAC7)",
};
const NAMES = Object.keys(KEYS_FR);

function block(valuesByKey) {
  return NAMES.map(k => '  ' + k + ': ' + JSON.stringify(valuesByKey[k]) + ',').join('\n');
}
function insertKeys(content, keysBlock) {
  // insère avant l'accolade finale "};" (ajoute une virgule à la derniere cle existante)
  return content.replace(/\n};\s*$/, ',\n' + keysBlock + '\n};\n');
}
async function translateValues(langName) {
  const system = `You are a professional translator for a mobile app UI (a tax information form for creators, DAC7 compliance). Translate each string value into ${langName}, natural and UI-appropriate. Keep "DAC7", "SIREN", "NIF", "TVA/VAT", "Plyz", country codes (FR, BE, CH) as-is. Output ONLY a JSON array of strings, same length and order as the input.`;
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
    if (c.includes('taxInfoTitle:')) { console.log('  (fr deja present, skip)'); }
    else { c = insertKeys(c, block(KEYS_FR)); fs.writeFileSync(LOC+'fr.ts', c); console.log('  ✔ fr'); } }
  for (const [code,name] of Object.entries(LANGS)) {
    const file = LOC+code+'.ts'; if (!fs.existsSync(file)){console.log('  ABSENT '+code);continue;}
    let c = fs.readFileSync(file,'utf8');
    if (c.includes('taxInfoTitle:')) { console.log('  ('+code+' deja present, skip)'); continue; }
    const vals = await translateValues(name);
    c = insertKeys(c, block(vals));
    fs.writeFileSync(file, c); console.log('  ✔ '+code);
  }
  console.log('=== CLES FISCALES AJOUTEES ===');
})().catch(e=>{console.error('ERREUR:',e.message);process.exit(1);});
