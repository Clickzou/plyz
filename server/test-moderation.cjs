// Test rapide de l'appel Claude vision pour la modération d'image.
const fs = require('fs');
function readEnv(file, key) { try { const t = fs.readFileSync(file,'utf8'); const m = t.match(new RegExp('^'+key+'=\\s*"?([^"\\n\\r]+)"?','m')); return m?m[1].trim():null; } catch { return null; } }
const key = readEnv('../.env','ANTHROPIC_API_KEY');

async function moderate(buffer, mt) {
  const b64 = buffer.toString('base64');
  const system = `You are an image content-moderation classifier. BLOCK sexual, violent/gore/war, hate, or illegal content. ALLOW ordinary photos. Respond ONLY with JSON: {"safe": boolean, "category": "sexual"|"violence"|"hate"|"illegal"|"none", "reason": "<=8 words"}.`;
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method:'POST', headers:{'content-type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01'},
    body: JSON.stringify({ model:'claude-haiku-4-5-20251001', max_tokens:100, system:[{type:'text',text:system}],
      messages:[{role:'user',content:[{type:'image',source:{type:'base64',media_type:mt,data:b64}},{type:'text',text:'Classify this image for publication.'}]}] }),
  });
  const j = await resp.json();
  if (!j.content || !j.content[0]) return { error: JSON.stringify(j).slice(0,300) };
  return { raw: j.content[0].text };
}
(async () => {
  if (!key) { console.log('PAS DE CLE ANTHROPIC'); return; }
  // Portrait ordinaire (doit être safe:true)
  const url = 'https://picsum.photos/400';
  const img = Buffer.from(await (await fetch(url)).arrayBuffer());
  console.log('Image test:', img.length, 'octets');
  const r = await moderate(img, 'image/jpeg');
  console.log('Résultat Claude:', JSON.stringify(r));
})().catch(e=>{console.error('ERREUR:',e.message);process.exit(1);});
