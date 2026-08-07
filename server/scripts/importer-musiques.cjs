#!/usr/bin/env node
/**
 * Remplit la bibliothèque musicale de Plyz.
 *
 *   node scripts/importer-musiques.cjs mes-morceaux.json
 *
 * Le fichier attendu est une liste d'objets :
 *
 *   [
 *     {
 *       "titre": "Morning Light",
 *       "artiste": "Kevin MacLeod",
 *       "licence": "cc_by",                 // cc0 | domaine_public | cc_by
 *       "attribution": "Morning Light par Kevin MacLeod (incompetech.com), CC BY 4.0",
 *       "source_url": "https://incompetech.com/...",
 *       "ambiance": "calme",
 *       "fichier": "./audio/morning-light.mp3"   // OU "url": "https://…"
 *     }
 *   ]
 *
 * ⚠️ LICENCES — le script REFUSE un morceau CC-BY sans attribution. Ce n'est
 * pas une coquetterie : sans le crédit de l'auteur, la licence n'est pas
 * respectée et Plyz diffuse illégalement. Mieux vaut un import qui s'arrête
 * qu'un catalogue qui expose l'application à un retrait des stores.
 *
 * Le script est IDEMPOTENT : relancé, il met à jour les morceaux déjà présents
 * (même titre + même artiste) au lieu de les dupliquer.
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { execFile } = require('child_process');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('SUPABASE_URL et SUPABASE_SERVICE_ROLE doivent être définis.');
  process.exit(1);
}

let cheminFfprobe = null;
try {
  cheminFfprobe = require('ffprobe-static').path;
} catch {
  console.warn('ffprobe absent : les durées seront à 0 (npm install d’abord).');
}

const db = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

function dureeDe(chemin) {
  return new Promise((resolve) => {
    if (!cheminFfprobe) return resolve(0);
    execFile(cheminFfprobe, [
      '-v', 'error', '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1', chemin,
    ], (err, stdout) => {
      if (err) return resolve(0);
      resolve(Math.round(parseFloat(String(stdout).trim()) || 0));
    });
  });
}

function nomDeFichier(titre, artiste, ext) {
  const propre = `${artiste}-${titre}`
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${propre}${ext || '.mp3'}`;
}

async function importer(entree, index) {
  const { titre, artiste, licence, attribution, source_url, ambiance } = entree;

  if (!titre || !artiste || !licence) {
    throw new Error('titre, artiste et licence sont obligatoires');
  }
  if (!['cc0', 'domaine_public', 'cc_by'].includes(licence)) {
    throw new Error(`licence inconnue : ${licence}`);
  }
  if (licence === 'cc_by' && !String(attribution || '').trim()) {
    throw new Error('un morceau CC-BY sans attribution ne peut pas être diffusé');
  }

  // Contenu : fichier local ou téléchargement.
  let buffer;
  let ext = '.mp3';
  if (entree.fichier) {
    buffer = await fs.promises.readFile(entree.fichier);
    ext = path.extname(entree.fichier) || '.mp3';
  } else if (entree.url) {
    const r = await fetch(entree.url);
    if (!r.ok) throw new Error(`téléchargement impossible (${r.status})`);
    buffer = Buffer.from(await r.arrayBuffer());
    ext = path.extname(new URL(entree.url).pathname) || '.mp3';
  } else {
    throw new Error('il faut un "fichier" ou une "url"');
  }

  const nom = nomDeFichier(titre, artiste, ext);

  // Durée : calculée sur un fichier temporaire, pour l'afficher dans la liste.
  const tmp = path.join(require('os').tmpdir(), `plyz-import-${Date.now()}${ext}`);
  await fs.promises.writeFile(tmp, buffer);
  const duree = await dureeDe(tmp);
  fs.promises.unlink(tmp).catch(() => {});

  const { error: errUp } = await db.storage.from('musiques').upload(nom, buffer, {
    contentType: ext === '.wav' ? 'audio/wav' : 'audio/mpeg',
    upsert: true,
  });
  if (errUp) throw new Error(`envoi refusé : ${errUp.message}`);

  const { data: pub } = db.storage.from('musiques').getPublicUrl(nom);

  // Relancer l'import ne doit pas créer de doublons : on remplace le morceau
  // de même titre et même artiste s'il existe déjà.
  const { data: existant } = await db.from('musiques_libres')
    .select('id').eq('titre', titre).eq('artiste', artiste).maybeSingle();

  const ligne = {
    titre, artiste, licence,
    attribution: attribution || null,
    source_url: source_url || null,
    url_fichier: pub.publicUrl,
    duree_sec: duree,
    ambiance: ambiance || null,
    actif: true,
    ordre: index,
  };

  const { error: errDb } = existant
    ? await db.from('musiques_libres').update(ligne).eq('id', existant.id)
    : await db.from('musiques_libres').insert(ligne);
  if (errDb) throw new Error(`base : ${errDb.message}`);

  return { nom, duree, remplace: !!existant };
}

(async () => {
  const chemin = process.argv[2];
  if (!chemin) {
    console.error('Usage : node scripts/importer-musiques.cjs <fichier.json>');
    process.exit(1);
  }

  const liste = JSON.parse(await fs.promises.readFile(chemin, 'utf8'));
  if (!Array.isArray(liste) || !liste.length) {
    console.error('Le fichier doit contenir une liste non vide.');
    process.exit(1);
  }

  let ok = 0;
  const echecs = [];

  for (let i = 0; i < liste.length; i++) {
    const e = liste[i];
    const etiquette = `${e.titre || '?'} — ${e.artiste || '?'}`;
    try {
      const r = await importer(e, i);
      ok++;
      console.log(`✓ ${etiquette} (${r.duree}s)${r.remplace ? ' [mis à jour]' : ''}`);
    } catch (err) {
      echecs.push({ etiquette, raison: err.message });
      console.error(`✗ ${etiquette} — ${err.message}`);
    }
  }

  // Un compte-rendu explicite : un import à moitié réussi doit se voir, sinon
  // on croit le catalogue complet alors qu'il manque des morceaux.
  console.log(`\n${ok}/${liste.length} morceau(x) en ligne.`);
  if (echecs.length) {
    console.log(`${echecs.length} refusé(s) :`);
    echecs.forEach((f) => console.log(`  · ${f.etiquette} : ${f.raison}`));
    process.exit(1);
  }
})();
