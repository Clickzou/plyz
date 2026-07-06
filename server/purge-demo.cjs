// Purge COMPLÈTE du contenu de démo injecté par seed-demo.cjs.
// À exécuter depuis le dossier server/ :  node purge-demo.cjs
//
// ⚠️ RECOMMANDATION : garder le contenu de démo PENDANT la revue des stores
// (Apple/Google voient une app vivante = meilleure approbation), puis lancer
// cette purge JUSTE AVANT l'ouverture au public. Idempotent : peut être relancé.
//
// Supprime : comptes auth demo-*@plyz-demo.local + profiles/celebrity_profiles/
// pricing/posts associés, les 5 événements de démo, les 8 souvenirs de galerie
// (image_path 'demo/...') et tous les fichiers Storage sous demo/.
const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");

function readEnv(file, key) {
  try {
    const txt = fs.readFileSync(file, "utf8");
    const m = txt.match(new RegExp("^" + key + "=\\s*\"?([^\"\\n\\r]+)\"?", "m"));
    return m ? m[1].trim() : null;
  } catch { return null; }
}
const ROOT = "../";
const SUPABASE_URL = readEnv(ROOT + ".env", "EXPO_PUBLIC_SUPABASE_URL") || readEnv(ROOT + ".env", "SUPABASE_URL");
const SERVICE_ROLE = readEnv(ROOT + ".env", "SUPABASE_SERVICE_ROLE_KEY");
if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("Manque une clé:", { SUPABASE_URL: !!SUPABASE_URL, SERVICE_ROLE: !!SERVICE_ROLE });
  process.exit(1);
}
const supa = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const DEMO_EMAIL_RE = /^demo-.*@plyz-demo\.local$/i;
const DEMO_EVENT_CODES = ["LIVE01", "LIVE02", "SOON01", "SOON02", "SOON03"];

async function removeStorageDir(bucket, dir) {
  try {
    const { data, error } = await supa.storage.from(bucket).list(dir, { limit: 1000 });
    if (error) { console.log(`  storage list ${bucket}/${dir}:`, error.message); return; }
    const paths = (data || []).filter((f) => f.id || f.name).map((f) => `${dir}/${f.name}`);
    if (paths.length) {
      const { error: rmErr } = await supa.storage.from(bucket).remove(paths);
      if (rmErr) console.log(`  storage remove ${bucket}/${dir}:`, rmErr.message);
      else console.log(`  ✔ storage: ${paths.length} fichier(s) supprimé(s) dans ${bucket}/${dir}`);
    }
  } catch (e) { console.log(`  storage ${bucket}/${dir} exception:`, e.message); }
}

(async () => {
  // 1) Repérer tous les comptes de démo
  const { data: lu, error: luErr } = await supa.auth.admin.listUsers({ perPage: 1000 });
  if (luErr) { console.error("listUsers:", luErr.message); process.exit(1); }
  const demoUsers = (lu?.users || []).filter((u) => u.email && DEMO_EMAIL_RE.test(u.email));
  const ids = demoUsers.map((u) => u.id);
  console.log(`=== ${demoUsers.length} compte(s) de démo repéré(s) ===`);

  if (ids.length) {
    // 2) Enfants d'abord (évite les soucis de FK)
    for (const [table, col] of [["posts", "celebrity_id"], ["live_sessions", "celebrity_id"],
                                 ["celebrity_pricing", "user_id"], ["celebrity_profiles", "user_id"],
                                 ["profiles", "id"]]) {
      const { error } = await supa.from(table).delete().in(col, ids);
      console.log(`  ${error ? "⚠ " + table + ": " + error.message : "✔ " + table + " nettoyé"}`);
    }
  }

  // 3) Événements de démo par code (filet en plus du celebrity_id)
  {
    const { error } = await supa.from("live_sessions").delete().in("code", DEMO_EVENT_CODES);
    console.log(`  ${error ? "⚠ live_sessions(codes): " + error.message : "✔ événements de démo (codes) nettoyés"}`);
  }

  // 4) Galerie de démo (souvenirs injectés sous image_path 'demo/...')
  {
    const { error } = await supa.from("memories").delete().like("image_path", "demo/%");
    console.log(`  ${error ? "⚠ memories: " + error.message : "✔ souvenirs de galerie de démo nettoyés"}`);
  }

  // 5) Fichiers Storage de démo
  await removeStorageDir("events", "demo/avatars");
  await removeStorageDir("memories", "demo/posts");
  await removeStorageDir("memories", "demo/gallery");

  // 6) Comptes auth de démo (en dernier)
  let deleted = 0;
  for (const u of demoUsers) {
    const { error } = await supa.auth.admin.deleteUser(u.id);
    if (error) console.log(`  ⚠ deleteUser ${u.email}: ${error.message}`);
    else deleted++;
  }
  console.log(`  ✔ ${deleted}/${demoUsers.length} compte(s) auth supprimé(s)`);

  console.log("=== PURGE TERMINÉE ===");
})().catch((e) => { console.error("ERREUR:", e.message); process.exit(1); });
