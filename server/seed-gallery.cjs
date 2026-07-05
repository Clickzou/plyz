// Régénère la galerie de "photos dédicacées" (memories) — fausses stars variées, avec autographe.
// Insérées sur les DEUX comptes test pour être visibles quel que soit le compte connecté.
const fs = require("fs");
const crypto = require("crypto");
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
const supa = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

// Comptes test de JC (jamais supprimés) : célébrité + fan
const ACCOUNTS = ["e7c06a67-2cd0-4aa1-bbf6-477fbb162ce8", "cec8b9f5-9d3b-417b-9f9d-3f1f81932707"];

async function genImage(prompt, aspect_ratio = "3:4") {
  const r = await fetch("https://fal.run/fal-ai/flux-pro/v1.1-ultra", {
    method: "POST",
    headers: { Authorization: "Key " + FAL_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, aspect_ratio, num_images: 1, output_format: "jpeg", safety_tolerance: "2" }),
  });
  const j = await r.json();
  if (!j.images || !j.images[0]) throw new Error("FAL: " + JSON.stringify(j).slice(0, 300));
  const img = await fetch(j.images[0].url);
  return Buffer.from(await img.arrayBuffer());
}
async function upload(path, buf) {
  const { error } = await supa.storage.from("memories").upload(path, buf, { contentType: "image/jpeg", upsert: true });
  if (error) throw new Error("upload " + path + ": " + error.message);
  return path;
}

const SIG = "with a handwritten silver marker autograph signature and a short dedication note scrawled across the lower part of the photo, authentic signed celebrity photo, photorealistic, high detail, natural skin texture, not AI";

// Stars fictives variées (visages 100% inventés)
const DEDIS = [
  { who: "Tom Rivière", type: "match", place: "Stade de France",
    p: `a confident young white male professional football player in a team jersey on a stadium pitch, ${SIG}` },
  { who: "Léna Marchal", type: "concert", place: "AccorArena, Paris",
    p: `a charismatic young mixed-race female pop singer holding a microphone on a concert stage with colorful lights, ${SIG}` },
  { who: "Victor Delcourt", type: "rencontre", place: "Paris",
    p: `a fictional distinguished middle-aged male politician in a navy suit and tie, friendly smile, flags blurred in background, ${SIG}` },
  { who: "Jordan Blake", type: "match", place: "Bercy, Paris",
    p: `a tall athletic black male professional basketball player in a jersey holding a basketball in an arena, ${SIG}` },
  { who: "Marcus Reed", type: "dedicace", place: "Festival de Cannes",
    p: `a handsome charismatic black male movie actor in an elegant tuxedo on a red carpet, ${SIG}` },
  { who: "Sofia Vance", type: "dedicace", place: "Paris",
    p: `an elegant white female actress in a glamorous evening gown smiling, soft cinematic lighting, ${SIG}` },
  { who: "Rafael Moreau", type: "concert", place: "Lyon",
    p: `a cool male rock singer with guitar on stage, energetic, stage lights, ${SIG}` },
  { who: "Alex Nova", type: "concert", place: "Ibiza",
    p: `a cool young asian male DJ with headphones at a nightclub DJ booth, laser lights, ${SIG}` },
  { who: "Enzo Carraro", type: "rencontre", place: "Monaco",
    p: `a male racing driver in a white racing suit with helmet under his arm in front of a race car, ${SIG}` },
  { who: "Lucas Berger", type: "rencontre", place: "Paris",
    p: `a friendly male michelin star chef in white chef jacket in a modern restaurant kitchen, ${SIG}` },
];

async function mapLimit(arr, limit, fn) {
  const out = []; let i = 0;
  async function worker() { while (i < arr.length) { const idx = i++; out[idx] = await fn(arr[idx], idx); } }
  await Promise.all(Array.from({ length: Math.min(limit, arr.length) }, worker));
  return out;
}

(async () => {
  // Nettoyage des anciennes dédicaces démo
  for (const acc of ACCOUNTS) {
    await supa.from("memories").delete().eq("user_id", acc).like("image_path", "demo/gallery/%");
  }
  console.log("Anciennes dédicaces démo supprimées.");

  const now = new Date().toISOString();
  await mapLimit(DEDIS, 3, async (d, idx) => {
    const buf = await genImage(d.p, "3:4");
    const path = `demo/gallery/ded-${idx}.jpg`;
    await upload(path, buf);
    const ts = Date.now() - idx * 86400000; // une par jour, décroissant
    for (const acc of ACCOUNTS) {
      const e = (await supa.from("memories").insert({
        id: crypto.randomUUID(), user_id: acc, image_path: path, timestamp: ts,
        metadata: { personMet: d.who, eventType: d.type, eventLocation: d.place, eventDate: new Date(ts).toISOString().slice(0, 10) },
        created_at: now,
      })).error;
      if (e) throw new Error("memory " + d.who + " (" + acc.slice(0, 8) + "): " + e.message);
    }
    console.log("  ✔ dédicace " + d.who);
  });
  console.log("=== GALERIE TERMINÉE === " + DEDIS.length + " dédicaces sur " + ACCOUNTS.length + " comptes");
})().catch((e) => { console.error("ERREUR:", e.message); process.exit(1); });
