// Insère les 5 clauses marketplace (mandat facturation, fiscal, DAC7) dans cgv.ts, 15 langues.
const fs = require('fs');
function readEnv(file, key) { try { const t = fs.readFileSync(file,'utf8'); const m = t.match(new RegExp('^'+key+'=\\s*"?([^"\\n\\r]+)"?','m')); return m?m[1].trim():null; } catch { return null; } }
const KEY = readEnv('../.env','ANTHROPIC_API_KEY');
const FILE = '../signtouch-app-main/assets/legal/cgv.ts';
const LANGS = { en:'English', es:'Spanish', de:'German', it:'Italian', pt:'Portuguese', ru:'Russian', ja:'Japanese', zh:'Chinese', ar:'Arabic', hi:'Hindi', bn:'Bengali', ur:'Urdu', ms:'Malay', id:'Indonesian' };

const FR_CLAUSES = `
DISPOSITIONS COMPLÉMENTAIRES – PLACE DE MARCHÉ ET FACTURATION

ARTICLE - MANDAT D'ENCAISSEMENT
La Personnalité donne expressément mandat à Plyz d'encaisser en son nom et pour son compte, par l'intermédiaire du prestataire de paiement (Stripe), les sommes dues par les Fans au titre des Prestations qu'elle réalise, puis de lui reverser sa rémunération après déduction de la commission de service de Plyz. Ce mandat n'emporte aucun transfert de propriété des Prestations à Plyz, qui demeure un simple intermédiaire.

ARTICLE - MANDAT DE FACTURATION
Conformément à l'article 289, I-2 du Code général des impôts et à la directive 2006/112/CE, la Personnalité donne mandat à Plyz pour établir en son nom et pour son compte les factures ou reçus destinés aux Fans au titre des Prestations qu'elle fournit. Plyz émet ces documents à partir des informations fournies par la Personnalité, qui reste seule responsable de l'exactitude des mentions la concernant et, s'il y a lieu, de la TVA afférente à ses Prestations. À défaut de contestation écrite dans un délai de trente (30) jours suivant l'émission, les factures sont réputées acceptées. Ce mandat peut être révoqué par écrit avec un préavis raisonnable. Plyz établit par ailleurs une facture distincte pour sa propre commission de service, adressée à la Personnalité.

ARTICLE - OBLIGATIONS ET RESPONSABILITÉ FISCALES ET SOCIALES DE LA PERSONNALITÉ
La Personnalité est seule responsable de l'ensemble de ses obligations fiscales et sociales relatives aux revenus perçus via Plyz : détermination et régularité de son statut (particulier ou professionnel, immatriculation, régime applicable selon son pays), déclaration et paiement de tous impôts, taxes, contributions et cotisations, ainsi que, le cas échéant, collecte et reversement de la TVA sur ses Prestations. Plyz agissant exclusivement comme intermédiaire de mise en relation et d'encaissement, elle ne saurait être tenue responsable des manquements de la Personnalité à ces obligations, ni requalifiée en employeur ou co-contractant de la Prestation.

ARTICLE - OBLIGATIONS DÉCLARATIVES DE LA PLATEFORME (DAC7)
Conformément à la directive (UE) 2021/514 (« DAC7 ») et aux articles 1649 ter A et suivants du Code général des impôts, Plyz collecte, vérifie et déclare chaque année à l'administration fiscale les informations relatives aux Personnalités percevant des revenus via la Plateforme. La Personnalité s'engage à fournir et tenir à jour : identité complète, adresse, date de naissance (personne physique) ou numéro d'immatriculation et de TVA (professionnel), pays de résidence fiscale et numéro d'identification fiscale (NIF). Plyz lui communique une fois par an le montant déclaré la concernant. À défaut de communication des informations requises, et après relance, Plyz peut suspendre les reversements et/ou le compte de la Personnalité.

ARTICLE - RÔLE D'INTERMÉDIAIRE (INFORMATION DU FAN)
Le Fan reconnaît que Plyz agit en qualité d'intermédiaire technique de mise en relation, que la Prestation est fournie par la Personnalité qui en est seule responsable, et que le reçu ou la facture qui lui est délivré est émis par Plyz au nom et pour le compte de la Personnalité. Le montant acquitté rémunère la Prestation de la Personnalité ; la commission de service de Plyz est prélevée sur ce montant au titre de la mise en relation.
`.trim();

// Sécurité : neutralise tout caractère qui casserait la template string du .ts
function safe(t) { return t.replace(/`/g, "'").replace(/\$\{/g, '$ {'); }

async function translate(text, langName) {
  const system = `You are a professional legal translator. Translate the following marketplace Terms of Sale excerpt into ${langName}, preserving the legal tone and the "ARTICLE - ..." structure (translate the ARTICLE titles too). Keep unchanged: "Plyz", "Stripe", "DAC7", "IBAN", "NIF", and legal references (art. 289 CGI, directive 2006/112/CE, directive 2021/514, art. 1649 ter A). Output ONLY the translated text, no notes, no code fences.`;
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method:'POST', headers:{'content-type':'application/json','x-api-key':KEY,'anthropic-version':'2023-06-01'},
    body: JSON.stringify({ model:'claude-haiku-4-5-20251001', max_tokens:4000, system:[{type:'text',text:system}], messages:[{role:'user',content:text}] }),
  });
  const j = await r.json();
  if (!j.content || !j.content[0]) throw new Error('Anthropic: ' + JSON.stringify(j).slice(0,300));
  return j.content[0].text.trim().replace(/^```[\s\S]*?\n/, '').replace(/```$/,'').trim();
}

function insertForLang(content, code, clausesText) {
  const re = new RegExp('(\\n  ' + code + ': `)([^`]*)(`)');
  if (!re.test(content)) { console.log('  ⚠ NON TROUVÉ ' + code); return content; }
  return content.replace(re, (m, p1, p2, p3) => p1 + p2 + '\n\n' + safe(clausesText) + '\n' + p3);
}

(async () => {
  let content = fs.readFileSync(FILE, 'utf8');
  content = insertForLang(content, 'fr', FR_CLAUSES);
  console.log('  ✔ fr');
  for (const [code, name] of Object.entries(LANGS)) {
    const tr = await translate(FR_CLAUSES, name);
    content = insertForLang(content, code, tr);
    console.log('  ✔ ' + code);
  }
  fs.writeFileSync(FILE, content);
  console.log('=== CLAUSES INSÉRÉES DANS cgv.ts (15 langues) ===');
})().catch(e => { console.error('ERREUR:', e.message); process.exit(1); });
