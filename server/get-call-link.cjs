// Génère un lien navigateur (PC) pour rejoindre la visio Daily de l'appel en cours.
// Usage : node get-call-link.cjs   (lance APRÈS avoir démarré un appel sur le téléphone)
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
const DAILY_API_KEY = readEnv(ROOT + ".env", "DAILY_API_KEY");
const SUPABASE_URL = readEnv(ROOT + ".env", "EXPO_PUBLIC_SUPABASE_URL") || readEnv(ROOT + ".env", "SUPABASE_URL");
const SERVICE_ROLE = readEnv(ROOT + ".env", "SUPABASE_SERVICE_ROLE_KEY");
if (!DAILY_API_KEY || !SUPABASE_URL || !SERVICE_ROLE) {
  console.error("Manque une clé:", { DAILY_API_KEY: !!DAILY_API_KEY, SUPABASE_URL: !!SUPABASE_URL, SERVICE_ROLE: !!SERVICE_ROLE });
  process.exit(1);
}
const supa = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

(async () => {
  // Dernière session avec une salle Daily active
  const { data, error } = await supa
    .from("live_sessions")
    .select("celebrity_name, room_url, status, started_at")
    .not("room_url", "is", null)
    .order("started_at", { ascending: false })
    .limit(1);
  if (error) throw new Error("supabase: " + error.message);
  if (!data || !data.length) {
    console.log("Aucun appel avec salle vidéo trouvé. Lance d'abord un appel sur le téléphone.");
    return;
  }
  const s = data[0];
  const roomUrl = s.room_url;
  const roomName = roomUrl.split("/").pop();
  console.log("Salle trouvée :", s.celebrity_name, "(" + s.status + ") ->", roomUrl);

  // Jeton d'accès (room privée)
  const r = await fetch("https://api.daily.co/v1/meeting-tokens", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + DAILY_API_KEY },
    body: JSON.stringify({
      properties: {
        room_name: roomName,
        user_name: "Test PC",
        is_owner: true,
        start_video_off: false,
        start_audio_off: false,
        exp: Math.floor(new Date().getTime() / 1000) + 3600,
      },
    }),
  });
  const j = await r.json();
  if (!j.token) throw new Error("Daily token: " + JSON.stringify(j).slice(0, 300));

  console.log("\n=================== LIEN À OUVRIR DANS CHROME (PC) ===================\n");
  console.log(roomUrl + "?t=" + j.token);
  console.log("\n=====================================================================\n");
})().catch((e) => { console.error("ERREUR:", e.message); process.exit(1); });
