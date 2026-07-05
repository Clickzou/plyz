// Interrupteur de langue du CONTENU DE DÉMO (bios + posts des fausses stars).
// Usage : node seed-lang.cjs fr   |   node seed-lang.cjs en
// Permet de faire des captures d'écran cohérentes par langue, puis de revenir au FR.
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
const supa = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const lang = (process.argv[2] || "fr").toLowerCase();
if (!["fr", "en"].includes(lang)) { console.error("Langue: fr ou en"); process.exit(1); }

// bio + post par célébrité, en FR et EN
const C = {
  "Léna Marchal": {
    fr: { bio: "Chanteuse pop-soul. 3 disques de platine. En tournée européenne cette année.",
          post: "En studio toute la semaine pour préparer la tournée 🎤 Vous n'êtes pas prêts pour ce qui arrive…" },
    en: { bio: "Pop-soul singer. 3 platinum records. On a European tour this year.",
          post: "In the studio all week getting ready for the tour 🎤 You're not ready for what's coming…" } },
  "Tom Rivière": {
    fr: { bio: "Milieu de terrain international. Champion en titre. Capitaine de son club.",
          post: "Quelle ambiance hier soir au stade ⚽️🔥 Merci à tous, on ne lâche rien pour la suite !" },
    en: { bio: "International midfielder. Reigning champion. Captain of his club.",
          post: "What an atmosphere at the stadium last night ⚽️🔥 Thank you all, we're not giving up!" } },
  "Marcus Reed": {
    fr: { bio: "Acteur de cinéma. Révélation de l'année. À l'affiche d'un thriller à succès.",
          post: "Première du film hier soir, encore sous le choc de votre accueil 🎬 Merci infiniment ❤️" },
    en: { bio: "Film actor. Breakout star of the year. Starring in a hit thriller.",
          post: "Film premiere last night, still blown away by your welcome 🎬 Thank you so much ❤️" } },
  "Sofia Vance": {
    fr: { bio: "Actrice et productrice. Plusieurs longs-métrages primés à son actif.",
          post: "Dernier jour de tournage aujourd'hui 🎥 Tellement fière de ce projet, hâte que vous le découvriez." },
    en: { bio: "Actress and producer. Several award-winning feature films to her name.",
          post: "Last day of filming today 🎥 So proud of this project, can't wait for you to discover it." } },
  "Alex Nova": {
    fr: { bio: "DJ et producteur électro. Résident des plus grands clubs. 2M d'auditeurs mensuels.",
          post: "Nouveau set ce week-end 🎧 Ça va être chaud, qui sera là ?" },
    en: { bio: "Electro DJ and producer. Resident at the biggest clubs. 2M monthly listeners.",
          post: "New set this weekend 🎧 It's going to be fire — who's coming?" } },
  "Maya Cruz": {
    fr: { bio: "Créatrice de contenu lifestyle & mode. Communauté de 4M d'abonnés.",
          post: "Petit moment coulisses du shooting du jour 📸 Vous préférez quelle tenue ?" },
    en: { bio: "Lifestyle & fashion content creator. Community of 4M followers.",
          post: "A little behind-the-scenes from today's shoot 📸 Which outfit do you prefer?" } },
  "Jordan Blake": {
    fr: { bio: "Basketteur professionnel. All-Star. Connu pour ses dunks spectaculaires.",
          post: "Entraînement intense ce matin 🏀 Le travail paie toujours. On se voit au prochain match !" },
    en: { bio: "Professional basketball player. All-Star. Known for his spectacular dunks.",
          post: "Intense training this morning 🏀 Hard work always pays off. See you at the next game!" } },
  "Lucas Berger": {
    fr: { bio: "Chef étoilé. Émissions culinaires et restaurant gastronomique réputé.",
          post: "Nouveau menu de saison dévoilé ce soir 🍽️ J'ai mis tout mon cœur dans chaque assiette." },
    en: { bio: "Michelin-starred chef. TV cooking shows and a renowned fine-dining restaurant.",
          post: "New seasonal menu revealed tonight 🍽️ I poured my whole heart into every plate." } },
};

(async () => {
  const { data: celebs, error } = await supa.from("celebrity_profiles").select("user_id, stage_name");
  if (error) throw new Error("select: " + error.message);
  let n = 0;
  for (const c of celebs) {
    const t = C[c.stage_name];
    if (!t) continue;
    const v = t[lang];
    let e = (await supa.from("celebrity_profiles").update({ bio: v.bio }).eq("user_id", c.user_id)).error;
    if (e) throw new Error("bio " + c.stage_name + ": " + e.message);
    e = (await supa.from("posts").update({ body: v.post }).eq("celebrity_id", c.user_id)).error;
    if (e) throw new Error("post " + c.stage_name + ": " + e.message);
    n++;
    console.log("  ✔ " + c.stage_name);
  }
  console.log("=== Contenu démo basculé en " + lang.toUpperCase() + " (" + n + " célébrités) ===");
})().catch((e) => { console.error("ERREUR:", e.message); process.exit(1); });
