#!/usr/bin/env node
/**
 * Integrate the new Plyz icon into the app.
 *
 * Reads: logo-output/favicon-logo-seul-pliz.png
 * Writes:
 *   - assets/images/icon.png        (1024x1024, app icon + splash + adaptive foreground)
 *   - assets/images/favicon.png     (256x256, web favicon)
 *
 * Run: node scripts/integrate-plyz-icon.js
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const PROJECT_ROOT = path.join(__dirname, '..');
const SOURCE = path.join(PROJECT_ROOT, 'logo-output', 'favicon-pliz.png');
const ICON_OUT = path.join(PROJECT_ROOT, 'assets', 'images', 'icon.png');
const FAVICON_OUT = path.join(PROJECT_ROOT, 'assets', 'images', 'favicon.png');

async function main() {
  if (!fs.existsSync(SOURCE)) {
    console.error(`Source not found: ${SOURCE}`);
    process.exit(1);
  }

  const meta = await sharp(SOURCE).metadata();
  console.log(`Source: ${path.basename(SOURCE)} (${meta.width}x${meta.height})`);

  // 1024x1024 icon — main app icon (iOS + Android + splash + adaptive foreground)
  await sharp(SOURCE)
    .resize(1024, 1024, {
      kernel: sharp.kernel.lanczos3,
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .png({ quality: 95, compressionLevel: 9 })
    .toFile(ICON_OUT);
  console.log(`Wrote ${path.relative(PROJECT_ROOT, ICON_OUT)} (1024x1024)`);

  // 256x256 favicon
  await sharp(SOURCE)
    .resize(256, 256, {
      kernel: sharp.kernel.lanczos3,
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .png({ quality: 90, compressionLevel: 9 })
    .toFile(FAVICON_OUT);
  console.log(`Wrote ${path.relative(PROJECT_ROOT, FAVICON_OUT)} (256x256)`);

  console.log('\nDone. Rebuild the dev client to see the new icon on the home screen.');
  console.log('(In-app the new logo is already used wherever icon.png is referenced.)');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
