#!/usr/bin/env node
/**
 * Plyz logo generator using fal.ai
 *
 * Setup:
 *   1. Create an account at https://fal.ai
 *   2. Get your API key at https://fal.ai/dashboard/keys
 *   3. Set the env var FAL_KEY (Windows PowerShell: $env:FAL_KEY="your-key")
 *   4. Run: node scripts/generate-plyz-logo.js
 *
 * Cost: ~$0.04 per full run (4 images).
 * Output: ./logo-output/*.png
 */

const fs = require('fs');
const path = require('path');

// Load FAL_KEY: first from process.env, then from .env.local
function loadFalKey() {
  if (process.env.FAL_KEY) return process.env.FAL_KEY;
  const envPath = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(envPath)) return null;
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^\s*FAL_KEY\s*=\s*(.+?)\s*$/);
    if (m) {
      // Strip optional surrounding quotes
      return m[1].replace(/^['"]|['"]$/g, '');
    }
  }
  return null;
}

const FAL_KEY = loadFalKey();
if (!FAL_KEY) {
  console.error('\nMissing FAL_KEY.');
  console.error('Add a line to .env.local:  FAL_KEY=fal_xxx');
  console.error('Get a key at https://fal.ai/dashboard/keys\n');
  process.exit(1);
}

const BRAND_COLOR = '#10b981'; // emerald green
const OUT_DIR = path.join(__dirname, '..', 'logo-output');

const VARIATIONS = [
  {
    name: 'icon-1-monogram',
    model: 'fal-ai/recraft-v3',
    prompt: `Minimalist app icon design, square 1:1 format, bold solid emerald green background color ${BRAND_COLOR}, centered geometric lowercase letter 'p' in pure white, rounded modern sans-serif typography, slightly playful but very clean, no text labels outside, no decorations, flat 2D design only, no gradients, no shadows, no 3D effects, similar visual quality to App Store icons like Discord, Cash App, Spotify, professional iOS App Store ready icon, solid color blocks only`,
    style: 'vector_illustration',
    size: 'square_hd',
  },
  {
    name: 'icon-2-signature',
    model: 'fal-ai/recraft-v3',
    prompt: `Modern app icon for a celebrity autograph app, square 1:1 format, solid emerald green background color ${BRAND_COLOR}, centered white stylized lowercase letter 'p' with an elegant flowing signature pen stroke or swoosh underneath the letter that evokes a handwritten autograph mark, flat geometric design, no text outside the icon, no extra elements, App Store aesthetic, professional logo design, modern minimalist`,
    style: 'vector_illustration',
    size: 'square_hd',
  },
  {
    name: 'icon-3-abstract',
    model: 'fal-ai/recraft-v3',
    prompt: `Abstract minimalist app icon, square 1:1 format, solid emerald green background color ${BRAND_COLOR}, single continuous flowing white brushstroke that forms the abstract silhouette of a stylized letter 'p' with handwritten signature flow energy, evoking both a signature mark and a pen stroke in motion, flat 2D design, no text, no decorations, professional iOS App Store icon quality, modern energetic creative`,
    style: 'vector_illustration',
    size: 'square_hd',
  },
  {
    name: 'wordmark',
    model: 'fal-ai/recraft-v3',
    prompt: `Logo wordmark "plyz" written in lowercase, modern bold geometric sans-serif typography, emerald green color ${BRAND_COLOR}, plain white background, custom tight letter spacing, no decorations, no icons, no additional elements, professional clean app branding wordmark, similar visual style to modern tech company logos like Stripe or Linear`,
    style: 'vector_illustration',
    size: 'landscape_16_9',
  },
];

async function generateOne(variation) {
  console.log(`[${variation.name}] requesting...`);
  const url = `https://fal.run/${variation.model}`;
  const body = {
    prompt: variation.prompt,
    image_size: variation.size,
    style: variation.style,
  };

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Key ${FAL_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`[${variation.name}] HTTP ${resp.status}: ${errText}`);
  }

  const data = await resp.json();
  const imgUrl = data.images?.[0]?.url;
  if (!imgUrl) {
    throw new Error(`[${variation.name}] no image returned: ${JSON.stringify(data)}`);
  }

  console.log(`[${variation.name}] downloading ${imgUrl}`);
  const imgResp = await fetch(imgUrl);
  const buf = Buffer.from(await imgResp.arrayBuffer());
  // recraft-v3 with vector_illustration returns SVG; keep extension from URL
  const ext = imgUrl.toLowerCase().includes('.svg') ? 'svg' : 'png';
  const filePath = path.join(OUT_DIR, `${variation.name}.${ext}`);
  fs.writeFileSync(filePath, buf);
  console.log(`[${variation.name}] saved → ${filePath}`);
  return filePath;
}

(async () => {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log(`\nGenerating ${VARIATIONS.length} variations for Plyz logo...`);
  console.log(`Brand color: ${BRAND_COLOR}`);
  console.log(`Output: ${OUT_DIR}\n`);

  const results = await Promise.allSettled(VARIATIONS.map(generateOne));

  console.log('\n=== Summary ===');
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      console.log(`OK  ${VARIATIONS[i].name}`);
    } else {
      console.log(`ERR ${VARIATIONS[i].name}: ${r.reason.message}`);
    }
  });

  console.log('\nDone. Open logo-output/ to view the PNGs.');
  console.log('Rerun the script to get new variations (each run = different outputs).');
})();
