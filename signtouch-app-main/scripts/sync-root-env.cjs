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

// On ne recopie QUE les variables EXPO_PUBLIC_* : ce sont les seules que Metro
// injecte dans le bundle, donc les seules dont l'app a besoin. Le .env racine
// contient aussi des secrets serveur (cle Stripe live, service_role Supabase,
// mot de passe SMTP, cle Daily...) : les dupliquer ici multiplierait
// inutilement les endroits ou ils trainent sur le disque.
const sourceContent = fs.readFileSync(source, 'utf8');
const kept = [];
const skipped = [];

for (const rawLine of sourceContent.split(/\r?\n/)) {
  const line = rawLine.trim();
  if (!line || line.startsWith('#')) continue;

  const eq = line.indexOf('=');
  if (eq === -1) continue;

  const name = line.slice(0, eq).trim();
  if (name.startsWith('EXPO_PUBLIC_')) {
    kept.push(`${name}=${line.slice(eq + 1)}`);
  } else {
    skipped.push(name);
  }
}

const header = [
  '# Genere automatiquement par scripts/sync-root-env.cjs — NE PAS EDITER A LA MAIN.',
  '# Seules les variables EXPO_PUBLIC_* du .env racine sont recopiees ici.',
  '# Les secrets serveur restent volontairement dans le .env racine.',
  '',
].join('\n');

const nextContent = header + kept.join('\n') + '\n';

if (fs.existsSync(target) && fs.readFileSync(target, 'utf8') === nextContent) {
  console.log('[env-sync] .env.local already up to date.');
  process.exit(0);
}

fs.writeFileSync(target, nextContent, 'utf8');
console.log(
  `[env-sync] Synced ${path.basename(source)} -> signtouch-app-main/.env.local ` +
    `(${kept.length} variables EXPO_PUBLIC_*, ${skipped.length} secrets ignores)`
);
