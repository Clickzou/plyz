// Génère l'analyse IA (Claude) pour les alertes sans analyse et met à jour la base.
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
function env(k){ try{const t=fs.readFileSync('../.env','utf8');const m=t.match(new RegExp('^'+k+'=\\s*"?([^"\\n\\r]+)"?','m'));return m?m[1].trim():null;}catch{return null;} }
const KEY = env('ANTHROPIC_API_KEY');
const URL = env('EXPO_PUBLIC_SUPABASE_URL') || env('SUPABASE_URL');
const SRK = env('SUPABASE_SERVICE_ROLE_KEY');

async function analyze(service, severity, message) {
  const system = `Tu es un analyste sécurité pour l'application Plyz (marketplace de célébrités : appels vidéo, dédicaces, paiements Stripe, base Supabase). On te donne une alerte. Réponds en FRANÇAIS, clair pour un non-technicien, en 4 sections courtes :
1) CE QUI S'EST PASSÉ 2) INTENTION PROBABLE 3) RISQUE (a-t-elle pu réussir ? niveau faible/moyen/élevé et pourquoi) 4) ACTION RECOMMANDÉE. Factuel, sans dramatiser, sans inventer.`;
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method:'POST', headers:{'content-type':'application/json','x-api-key':KEY,'anthropic-version':'2023-06-01'},
    body: JSON.stringify({ model:'claude-haiku-4-5-20251001', max_tokens:700, system:[{type:'text',text:system}],
      messages:[{role:'user',content:`Alerte :\nService : ${service}\nGravité : ${severity}\nDétail : ${message}`}] }),
  });
  const j = await r.json();
  if (j.error || !j.content || !j.content[0]) throw new Error(JSON.stringify(j).slice(0,200));
  return j.content[0].text.trim();
}
(async () => {
  if (!KEY || !URL || !SRK) { console.log('Env manquante:', {KEY:!!KEY, URL:!!URL, SRK:!!SRK}); return; }
  const db = createClient(URL, SRK, { auth:{persistSession:false} });
  const { data: rows, error } = await db.from('service_alerts').select('id, service, severity, message').is('analysis', null).limit(20);
  if (error) { console.error(error.message); return; }
  console.log(rows.length, 'alerte(s) à analyser');
  for (const a of rows) {
    try {
      const text = await analyze(a.service, a.severity, a.message);
      await db.from('service_alerts').update({ analysis: text }).eq('id', a.id);
      console.log('✔', a.service, '→ analysé');
    } catch (e) { console.error('✗', a.id, e.message); }
  }
  console.log('=== TERMINÉ ===');
})().catch(e=>{console.error('ERREUR:',e.message);process.exit(1);});
