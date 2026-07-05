// Génère les images de couverture des événements (live_sessions) + aligne les prix.
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
const supa = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

async function genImage(prompt, aspect_ratio = "16:9") {
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
  const { error } = await supa.storage.from("events").upload(path, buf, { contentType: "image/jpeg", upsert: true });
  if (error) throw new Error("upload " + path + ": " + error.message);
  return supa.storage.from("events").getPublicUrl(path).data.publicUrl;
}
const slug = (s) => s.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// id de session -> { prix vidéo (cents), prompt cover }
const SESS = [
  { id: "e981f22d-2928-4e77-8c9d-0d2872a13c39", name: "Léna Marchal", price: 18000,
    cover: "wide cinematic photo of a pop singer performing on a big concert stage, dramatic colorful stage lighting, huge crowd with phone lights, atmospheric haze, photorealistic, high detail" },
  { id: "34387aa1-9302-44a6-85d6-1a7ef1f9f31d", name: "Tom Rivière", price: 25000,
    cover: "wide cinematic photo inside a packed football stadium at night, bright floodlights, green pitch, atmosphere, photorealistic, high detail" },
  { id: "a4f24ff9-6e35-4df5-8aa0-065c78dc4b2a", name: "Jordan Blake", price: 24000,
    cover: "wide cinematic photo of an indoor basketball arena, polished court, spotlights, crowd in the stands, photorealistic, high detail" },
  { id: "9f550ca6-0941-466a-963e-07ae6061b553", name: "Marcus Reed", price: 22000,
    cover: "wide cinematic photo of a glamorous red carpet movie premiere at night, spotlights and flashing cameras, elegant atmosphere, photorealistic, high detail" },
  { id: "25375978-8bb9-49d1-a23a-fc9d93a1b954", name: "Sofia Vance", price: 20000,
    cover: "wide cinematic photo of a professional film set, large cameras, lighting rigs and crew, cinematic mood, photorealistic, high detail" },
];

(async () => {
  for (const s of SESS) {
    const buf = await genImage(s.cover, "16:9");
    const url = await upload(`demo/covers/${slug(s.name)}.jpg`, buf);
    const { error } = await supa.from("live_sessions")
      .update({ cover_photo_url: url, price_cents: s.price })
      .eq("id", s.id);
    if (error) throw new Error("update " + s.name + ": " + error.message);
    console.log("  ✔ cover " + s.name + " (" + (s.price / 100) + " €)");
  }
  console.log("=== COVERS TERMINÉ ===");
})().catch((e) => { console.error("ERREUR:", e.message); process.exit(1); });
