const fs = require('fs');
const path = require('path');

const appRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(appRoot, '..');

const preferredSources = [
  path.join(repoRoot, '.env.local'),
  path.join(repoRoot, '.env'),
];

const source = preferredSources.find((filePath) => fs.existsSync(filePath));
const target = path.join(appRoot, '.env.local');

if (!source) {
  console.log('[env-sync] No root .env file found, skipping.');
  process.exit(0);
}

const sourceContent = fs.readFileSync(source, 'utf8');
const targetExists = fs.existsSync(target);
const targetContent = targetExists ? fs.readFileSync(target, 'utf8') : '';

if (sourceContent === targetContent) {
  console.log('[env-sync] .env.local already up to date.');
  process.exit(0);
}

fs.writeFileSync(target, sourceContent, 'utf8');
console.log(`[env-sync] Synced ${path.basename(source)} -> signtouch-app-main/.env.local`);
