// Génère des portraits photoréalistes FICTIFS (FAL flux-pro) pour les célébrités
// "mock" de repli de l'app (discover / activity / celebrity-detail), et les uploade
// dans Supabase Storage. Aucune vraie personne. Exécuter depuis le dossier server/ :
//   node gen-mock-avatars.cjs
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
const FAL_KEY = readEnv("C:/Users/jc/Documents/CLICKZOU/2- SITE CLICKZOU/SITE IA/clickzou-v2/.env.local", "FAL_KEY");
const SUPABASE_URL = readEnv(ROOT + ".env", "EXPO_PUBLIC_SUPABASE_URL") || readEnv(ROOT + ".env", "SUPABASE_URL");
const SERVICE_ROLE = readEnv(ROOT + ".env", "SUPABASE_SERVICE_ROLE_KEY");
if (!FAL_KEY || !SUPABASE_URL || !SERVICE_ROLE) {
  console.error("Manque une clé:", { FAL_KEY: !!FAL_KEY, SUPABASE_URL: !!SUPABASE_URL, SERVICE_ROLE: !!SERVICE_ROLE });
  process.exit(1);
}
const supa = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const PORTRAIT = "ultra realistic professional studio headshot portrait, natural realistic skin texture with subtle imperfections, soft cinematic studio lighting, looking at camera, shot on Canon 85mm f1.4, shallow depth of field, high detail, photorealistic, not AI";

// Personnalités 100% FICTIVES (visages inventés), alignées sur les mock ids de l'app.
const CELEBS = [
  { id: "mock-001", prompt: `${PORTRAIT}, an athletic young latino male professional football player, late 20s, short dark hair, confident friendly smile` },
  { id: "mock-003", prompt: `${PORTRAIT}, a young white male football player, early 20s, modern fade haircut, energetic confident expression` },
  { id: "mock-005", prompt: `${PORTRAIT}, a handsome charismatic young male actor, early 30s, light stubble, elegant warm confident expression` },
  { id: "mock-002", prompt: `${PORTRAIT}, an elegant white female actress, early 30s, brown hair, graceful sophisticated soft smile` },
  { id: "mock-004", prompt: `${PORTRAIT}, a charismatic young mixed-race female pop singer, mid-20s, stylish, warm genuine smile` },
  { id: "mock-006", prompt: `${PORTRAIT}, a tall athletic young black male athlete, mid-20s, short hair, confident friendly smile` },
  { id: "mock-007", prompt: `${PORTRAIT}, a graceful young white female actress, late 20s, blonde hair, elegant gentle smile` },
  { id: "mock-008", prompt: `${PORTRAIT}, a cool young asian male DJ, late 20s, modern style with headphones around neck, relaxed smile` },
];

async function genImage(prompt) {
  const r = await fetch("https://fal.run/fal-ai/flux-pro/v1.1-ultra", {
    method: "POST",
    headers: { Authorization: "Key " + FAL_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, aspect_ratio: "1:1", num_images: 1, output_format: "jpeg", safety_tolerance: "2" }),
  });
  const j = await r.json();
  if (!j.images || !j.images[0]) throw new Error("FAL: " + JSON.stringify(j).slice(0, 300));
  const img = await fetch(j.images[0].url);
  return Buffer.from(await img.arrayBuffer());
}

(async () => {
  const results = {};
  for (const c of CELEBS) {
    try {
      const buf = await genImage(c.prompt);
      const path = `mock-avatars/${c.id}.jpg`;
      const { error } = await supa.storage.from("events").upload(path, buf, { contentType: "image/jpeg", upsert: true });
      if (error) throw new Error(error.message);
      const url = supa.storage.from("events").getPublicUrl(path).data.publicUrl;
      results[c.id] = url;
      console.log("  ✔", c.id, "→", url);
    } catch (e) {
      console.error("  ✖", c.id, ":", e.message);
    }
  }
  console.log("\n=== URLS (à coller dans les tableaux mock) ===");
  console.log(JSON.stringify(results, null, 2));
})().catch((e) => { console.error("ERREUR:", e.message); process.exit(1); });
