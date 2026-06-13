const fs = require('fs');
const path = require('path');

const ngrokFile = path.join(
  __dirname,
  '..',
  'node_modules',
  '@expo',
  'cli',
  'build',
  'src',
  'start',
  'server',
  'AsyncNgrok.js'
);

if (!fs.existsSync(ngrokFile)) {
  console.log('[tunnel-patch] AsyncNgrok.js not found, skipping patch.');
  process.exit(0);
}

const source = fs.readFileSync(ngrokFile, 'utf8');
const patched = source.replace(
  /const TUNNEL_TIMEOUT = \d+ \* 1000;/,
  'const TUNNEL_TIMEOUT = 60 * 1000;'
);

if (source === patched) {
  console.log('[tunnel-patch] Timeout already patched.');
  process.exit(0);
}

fs.writeFileSync(ngrokFile, patched, 'utf8');
console.log('[tunnel-patch] ngrok timeout patched to 60s.');
