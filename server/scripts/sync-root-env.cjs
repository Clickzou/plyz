const fs = require('fs');
const path = require('path');

const serverRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(serverRoot, '..');

const preferredSources = [
  path.join(repoRoot, '.env.local'),
  path.join(repoRoot, '.env'),
];

const source = preferredSources.find((filePath) => fs.existsSync(filePath));
const target = path.join(serverRoot, '.env.local');

if (!source) {
  if (!fs.existsSync(target)) {
    fs.writeFileSync(target, '', 'utf8');
  }
  console.log('[env-sync] No root .env file found, keeping existing server/.env.local');
  process.exit(0);
}

const sourceContent = fs.readFileSync(source, 'utf8');
const targetExists = fs.existsSync(target);
const targetContent = targetExists ? fs.readFileSync(target, 'utf8') : '';

if (sourceContent === targetContent) {
  console.log('[env-sync] server/.env.local already up to date.');
  process.exit(0);
}

fs.writeFileSync(target, sourceContent, 'utf8');
console.log(`[env-sync] Synced ${path.basename(source)} -> server/.env.local`);
