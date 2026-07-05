// Seed de contenu de démo réaliste pour Plyz (célébrités fictives, posts, événements, galerie)
// Images générées par FAL flux-pro/v1.1-ultra (photoréalistes). Exécuter depuis le dossier server/.
const fs = require("fs");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

// --- Chargement des variables d'env ---
function readEnv(file, key) {
  try {
    const txt = fs.readFileSync(file, "utf8");
    const m = txt.match(new RegExp("^" + key + "=\\s*\"?([^\"\\n\\r]+)\"?", "m"));
    return m ? m[1].trim() : null;
  } catch { return null; }
}
const ROOT = "../"; // dev/signtouch/
const FAL_KEY = readEnv("C:/Users/jc/Documents/CLICKZOU/2- SITE CLICKZOU/SITE IA/clickzou-v2/.env.local", "FAL_KEY");
const SUPABASE_URL = readEnv(ROOT + ".env", "EXPO_PUBLIC_SUPABASE_URL") || readEnv(ROOT + ".env", "SUPABASE_URL");
const SERVICE_ROLE = readEnv(ROOT + ".env", "SUPABASE_SERVICE_ROLE_KEY");
if (!FAL_KEY || !SUPABASE_URL || !SERVICE_ROLE) {
  console.error("Manque une clé:", { FAL_KEY: !!FAL_KEY, SUPABASE_URL: !!SUPABASE_URL, SERVICE_ROLE: !!SERVICE_ROLE });
  process.exit(1);
}
const supa = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const FAN_ID = "cec8b9f5-9d3b-417b-9f9d-3f1f81932707"; // compte fan de JC (jayc.events) pour la galerie

// --- Génération image FAL (retourne un Buffer JPEG) ---
async function genImage(prompt, aspect_ratio = "1:1") {
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
async function upload(bucket, path, buf) {
  const { error } = await supa.storage.from(bucket).upload(path, buf, { contentType: "image/jpeg", upsert: true });
  if (error) throw new Error("upload " + bucket + "/" + path + ": " + error.message);
  return supa.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}
const slug = (s) => s.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// --- 8 célébrités fictives (visages 100% inventés) ---
const PORTRAIT = "ultra realistic professional studio headshot portrait, natural realistic skin texture with subtle imperfections, soft cinematic studio lighting, looking at camera, shot on Canon 85mm f1.4, shallow depth of field, high detail, photorealistic, not AI";
const CELEBS = [
  { name: "Léna Marchal", occ: ["singer"], types: ["music"], pop: 94, video: 18000, auto: 6000,
    bio: "Chanteuse pop-soul. 3 disques de platine. En tournée européenne cette année.",
    avatar: `${PORTRAIT}, a charismatic young mixed-race woman pop singer, mid-20s, warm genuine smile, stylish`,
    post: "vibrant concert stage photo, female pop singer performing live with microphone, colorful lights, crowd silhouettes, energetic, photorealistic" },
  { name: "Tom Rivière", occ: ["footballer"], types: ["sports"], pop: 97, video: 25000, auto: 8000,
    bio: "Milieu de terrain international. Champion en titre. Capitaine de son club.",
    avatar: `${PORTRAIT}, a confident young white male professional football player, late 20s, athletic, friendly`,
    post: "professional football player celebrating a goal on a stadium pitch, green grass, floodlights, photorealistic" },
  { name: "Marcus Reed", occ: ["actor"], types: ["entertainment"], pop: 92, video: 22000, auto: 7000,
    bio: "Acteur de cinéma. Révélation de l'année. À l'affiche d'un thriller à succès.",
    avatar: `${PORTRAIT}, a handsome charismatic black male actor, mid-30s, elegant, confident warm expression`,
    post: "cinematic red carpet event photo, well-dressed male actor in a tuxedo smiling at premiere, flashing lights, photorealistic" },
  { name: "Sofia Vance", occ: ["actress"], types: ["entertainment"], pop: 90, video: 20000, auto: 6500,
    bio: "Actrice et productrice. Plusieurs longs-métrages primés à son actif.",
    avatar: `${PORTRAIT}, an elegant white female actress, early 30s, graceful, sophisticated soft smile`,
    post: "behind the scenes movie set photo, female actress on a film set with cameras and lighting equipment, cinematic, photorealistic" },
  { name: "Alex Nova", occ: ["dj","musician"], types: ["music"], pop: 88, video: 16000, auto: 5000,
    bio: "DJ et producteur électro. Résident des plus grands clubs. 2M d'auditeurs mensuels.",
    avatar: `${PORTRAIT}, a cool young asian male DJ, late 20s, modern style with headphones around neck, relaxed smile`,
    post: "energetic nightclub DJ booth photo, male DJ mixing with headphones, crowd and laser lights, photorealistic" },
  { name: "Maya Cruz", occ: ["influencer"], types: ["entertainment"], pop: 86, video: 14000, auto: 4500,
    bio: "Créatrice de contenu lifestyle & mode. Communauté de 4M d'abonnés.",
    avatar: `${PORTRAIT}, a stylish young latina female lifestyle influencer, mid-20s, trendy, bright joyful smile`,
    post: "aesthetic lifestyle content creator photo, young woman filming herself with a phone on a tripod in a bright modern apartment, photorealistic" },
  { name: "Jordan Blake", occ: ["basketball player"], types: ["sports"], pop: 91, video: 24000, auto: 7500,
    bio: "Basketteur professionnel. All-Star. Connu pour ses dunks spectaculaires.",
    avatar: `${PORTRAIT}, a tall athletic young black male basketball player, mid-20s, confident friendly smile`,
    post: "professional basketball player dunking during a game in an indoor arena, dynamic action shot, photorealistic" },
  { name: "Lucas Berger", occ: ["chef"], types: ["entertainment"], pop: 84, video: 15000, auto: 5000,
    bio: "Chef étoilé. Émissions culinaires et restaurant gastronomique réputé.",
    avatar: `${PORTRAIT}, a friendly white male chef, early 40s, in a white chef jacket, warm welcoming smile`,
    post: "professional chef plating a gourmet dish in a restaurant kitchen, elegant fine dining presentation, photorealistic" },
];

// Galerie de dédicaces (photos de moments / souvenirs)
const GALLERY = [
  { who: "Léna Marchal", type: "concert", place: "Paris", prompt: "selfie photo of a happy fan with a female pop singer backstage at a concert, warm lighting, candid, photorealistic" },
  { who: "Tom Rivière", type: "match", place: "Lyon", prompt: "photo of a fan with a professional footballer in a stadium, both smiling, photorealistic" },
  { who: "Marcus Reed", type: "dedicace", place: "Cannes", prompt: "photo of a fan getting an autograph from a male actor at a film premiere, candid, photorealistic" },
  { who: "Maya Cruz", type: "rencontre", place: "Nice", prompt: "selfie of a fan with a female lifestyle influencer at a meet and greet event, bright, photorealistic" },
  { who: "Jordan Blake", type: "match", place: "Paris", prompt: "photo of a fan with a tall basketball player courtside, both smiling, photorealistic" },
  { who: "Sofia Vance", type: "dedicace", place: "Paris", prompt: "photo of a fan with a female actress at a book signing, warm, photorealistic" },
  { who: "Alex Nova", type: "concert", place: "Ibiza", prompt: "selfie of a fan with a male DJ at a festival, colorful lights, photorealistic" },
  { who: "Lucas Berger", type: "rencontre", place: "Lyon", prompt: "photo of a fan with a chef in a restaurant kitchen, both smiling, photorealistic" },
];

async function mapLimit(arr, n, fn) {
  const out = []; let i = 0;
  async function worker() { while (i < arr.length) { const idx = i++; out[idx] = await fn(arr[idx], idx); } }
  await Promise.all(Array.from({ length: Math.min(n, arr.length) }, worker));
  return out;
}

(async () => {
  console.log("=== Génération des", CELEBS.length, "célébrités ===");
  const now = new Date().toISOString();
  const created = [];

  await mapLimit(CELEBS, 3, async (c) => {
    const sg = slug(c.name);
    const email = `demo-${sg}@plyz-demo.local`;
    // compte auth (requis par FK profiles.id -> auth.users)
    let id;
    const cu = await supa.auth.admin.createUser({ email, email_confirm: true, user_metadata: { demo: true } });
    if (cu.error) {
      const lu = await supa.auth.admin.listUsers({ perPage: 200 });
      const ex = lu.data && lu.data.users.find((x) => x.email === email);
      if (!ex) throw new Error("createUser " + c.name + ": " + cu.error.message);
      id = ex.id;
    } else id = cu.data.user.id;
    // avatar
    const avBuf = await genImage(c.avatar, "1:1");
    const avatarUrl = await upload("events", `demo/avatars/${sg}.jpg`, avBuf);
    // profiles (upsert car trigger handle_new_user a pu en créer un)
    let e = (await supa.from("profiles").upsert({ id, display_name: c.name, avatar_url: avatarUrl, role: "celebrity", subscription_active: false, updated_at: now }, { onConflict: "id" })).error;
    if (e) throw new Error("profiles " + c.name + ": " + e.message);
    // celebrity_profiles
    e = (await supa.from("celebrity_profiles").upsert({ user_id: id, stage_name: c.name, bio: c.bio, is_listed: true, official_verified: true, stripe_verified: true, popularity_score: c.pop, wikidata_occupations: c.occ, wikidata_types: c.types, created_at: now, updated_at: now }, { onConflict: "user_id" })).error;
    if (e) throw new Error("celeb " + c.name + ": " + e.message);
    // pricing
    e = (await supa.from("celebrity_pricing").upsert({ user_id: id, video_call_price_cents: c.video, video_call_unit: "session", video_call_duration_minutes: 10, autograph_price_cents: c.auto, currency: "eur", created_at: now, updated_at: now }, { onConflict: "user_id" })).error;
    if (e) throw new Error("pricing " + c.name + ": " + e.message);
    // post
    const postBuf = await genImage(c.post, "16:9");
    const postUrl = await upload("memories", `demo/posts/${sg}.jpg`, postBuf);
    e = (await supa.from("posts").insert({ celebrity_id: id, kind: "post", title: null, body: c.bio.split(".")[0] + ".", media_url: postUrl, created_at: now })).error;
    if (e) console.log("post warn " + c.name + ": " + e.message);
    created.push({ id, name: c.name });
    console.log("  ✔", c.name);
  });

  // --- Événements (live_sessions) : 2 en cours + 3 à venir parmi les célébrités ---
  console.log("=== Événements ===");
  const pick = (i) => created[i % created.length];
  const evs = [
    { c: pick(0), status: "active", when: 0, code: "LIVE01", price: 0 },
    { c: pick(2), status: "active", when: 0, code: "LIVE02", price: 0 },
    { c: pick(1), status: "scheduled", when: 2, code: "SOON01", price: 10000 },
    { c: pick(3), status: "scheduled", when: 24, code: "SOON02", price: 8000 },
    { c: pick(6), status: "scheduled", when: 48, code: "SOON03", price: 12000 },
  ];
  for (const ev of evs) {
    const sched = new Date(Date.now() + ev.when * 3600 * 1000).toISOString();
    const e = (await supa.from("live_sessions").insert({
      id: crypto.randomUUID(), celebrity_id: ev.c.id, celebrity_name: ev.c.name, code: ev.code,
      status: ev.status, duration_minutes: 60, duration_per_fan_minutes: 5, max_slots: 12,
      price_cents: ev.price, currency: "eur", scheduled_at: ev.status === "scheduled" ? sched : null,
      started_at: ev.status === "active" ? now : null, created_at: now, slots_used: ev.status === "active" ? 3 : 0,
    })).error;
    if (e) console.log("event warn:", e.message); else console.log("  ✔ event", ev.c.name, ev.status);
  }

  // --- Galerie de dédicaces (memories du compte fan de JC) ---
  console.log("=== Galerie ===");
  await mapLimit(GALLERY, 3, async (g, idx) => {
    const buf = await genImage(g.prompt, "3:4");
    const p = `demo/gallery/ded-${idx}.jpg`;
    await upload("memories", p, buf);
    const ts = Date.now() - idx * 86400000;
    const e = (await supa.from("memories").insert({
      id: crypto.randomUUID(), user_id: FAN_ID, image_path: p, timestamp: ts,
      metadata: { personMet: g.who, eventType: g.type, eventLocation: g.place, eventDate: new Date(ts).toISOString().slice(0, 10) },
      created_at: now,
    })).error;
    if (e) console.log("memory warn:", e.message); else console.log("  ✔ dédicace", g.who);
  });

  console.log("=== TERMINÉ ===", created.length, "célébrités créées");
})().catch((e) => { console.error("ERREUR:", e.message); process.exit(1); });
