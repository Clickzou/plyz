// Test isolé du moteur de traduction Claude (clé + modèle + format JSON).
const fs = require("fs");
function readEnv(file, key) {
  try {
    const txt = fs.readFileSync(file, "utf8");
    const m = txt.match(new RegExp("^" + key + "=\\s*\"?([^\"\\n\\r]+)\"?", "m"));
    return m ? m[1].trim() : null;
  } catch { return null; }
}
const KEY = readEnv("../.env", "ANTHROPIC_API_KEY");
if (!KEY) { console.error("Pas de clé"); process.exit(1); }

async function claudeTranslateBatch(texts, langName) {
  const system = `You are a professional translation engine for a social app where celebrities post short messages, captions and bios. Translate each input string into ${langName}.
Rules:
- Preserve the meaning, tone, style, emojis, #hashtags, @mentions and line breaks.
- Keep proper nouns (people, places, brands) unchanged.
- Do NOT add quotes, notes or explanations.
- If a string is already written in ${langName}, return it unchanged.
- Output ONLY a JSON array of strings, exactly the same length and order as the input.`;
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: Math.min(8000, texts.length * 220 + 500),
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: JSON.stringify(texts) }],
    }),
  });
  const j = await resp.json();
  if (!j.content || !j.content[0] || !j.content[0].text) throw new Error("Anthropic: " + JSON.stringify(j).slice(0, 400));
  let txt = j.content[0].text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const arr = JSON.parse(txt);
  console.log("usage:", JSON.stringify(j.usage));
  return arr;
}

(async () => {
  const fr = [
    "En studio toute la semaine pour préparer la tournée 🎤 Vous n'êtes pas prêts pour ce qui arrive…",
    "Milieu de terrain international. Champion en titre. Capitaine de son club.",
  ];
  for (const lang of ["Spanish", "Arabic", "Japanese"]) {
    console.log("\n=== " + lang + " ===");
    const out = await claudeTranslateBatch(fr, lang);
    out.forEach((t, i) => console.log("  " + (i + 1) + ". " + t));
  }
  console.log("\nOK");
})().catch((e) => { console.error("ERREUR:", e.message); process.exit(1); });
