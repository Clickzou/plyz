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
let cheminFfmpeg = null;
try {
  cheminFfprobe = require('ffprobe-static').path;
  cheminFfmpeg = require('ffmpeg-static');
} catch {
  console.warn('ffmpeg/ffprobe absents : durées à 0 et morceaux non raccourcis (npm install d’abord).');
}

// Les vidéos de Plyz durent 30 secondes au maximum. Garder des morceaux de
// quatre minutes, c'est stocker cent fichiers de 7 Mo pour n'en utiliser qu'un
// vingtième : de l'espace payé pour rien chez Supabase, autant de données
// retéléchargées à chaque mixage, et une pré-écoute qui se fait attendre dans
// l'application. On garde 35 secondes — les 30 utiles, plus une marge.
const DUREE_GARDEE_S = 35;

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

/**
 * Ne garde que les premières secondes du morceau, avec un fondu de sortie.
 *
 * Le fondu n'est pas de la coquetterie : à la pré-écoute, un morceau coupé net
 * s'entend comme un fichier abîmé.
 *
 * Renvoie le fichier raccourci, ou `null` si l'opération n'a pas pu se faire —
 * l'appelant garde alors l'original. Mieux vaut un morceau trop long qu'un
 * morceau absent.
 */
function raccourcir(cheminEntree) {
  return new Promise((resolve) => {
    if (!cheminFfmpeg) return resolve(null);
    const sortie = cheminEntree.replace(/(\.[a-z0-9]+)?$/i, '-court.mp3');
    execFile(cheminFfmpeg, [
      '-y', '-i', cheminEntree,
      '-t', String(DUREE_GARDEE_S),
      '-af', `afade=t=out:st=${DUREE_GARDEE_S - 2}:d=2`,
      // Réencodage en 128 kbit/s : la qualité reste largement suffisante pour
      // une musique de fond, et le fichier fond encore de moitié.
      '-c:a', 'libmp3lame', '-b:a', '128k',
      sortie,
    ], { timeout: 120000 }, (err) => {
      if (err) return resolve(null);
      resolve(sortie);
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
    // Le Referer n'est pas une politesse : ccMixter (comme beaucoup de sites
    // d'hébergement audio) répond 403 aux téléchargements qui n'en portent pas,
    // pour empêcher que ses fichiers soient pillés depuis ailleurs.
    const origine = new URL(entree.url).origin + '/';
    const r = await fetch(entree.url, {
      headers: { Referer: origine, 'User-Agent': 'Plyz/1.0 (catalogue musical)' },
    });
    if (!r.ok) throw new Error(`téléchargement impossible (${r.status})`);
    buffer = Buffer.from(await r.arrayBuffer());
    ext = path.extname(new URL(entree.url).pathname) || '.mp3';
  } else {
    throw new Error('il faut un "fichier" ou une "url"');
  }

  // Passage par un fichier temporaire : ffprobe et ffmpeg travaillent sur des
  // fichiers, pas sur des blocs en mémoire.
  const tmp = path.join(require('os').tmpdir(), `plyz-import-${Date.now()}${ext}`);
  await fs.promises.writeFile(tmp, buffer);
  let duree = await dureeDe(tmp);
  const poidsAvant = buffer.length;

  let court = null;
  if (duree > DUREE_GARDEE_S) {
    court = await raccourcir(tmp);
    if (court) {
      buffer = await fs.promises.readFile(court);
      duree = DUREE_GARDEE_S;
      ext = '.mp3';
    }
  }

  fs.promises.unlink(tmp).catch(() => {});
  if (court) fs.promises.unlink(court).catch(() => {});

  const nom = nomDeFichier(titre, artiste, ext);

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

  return {
    nom, duree, remplace: !!existant,
    raccourci: !!court,
    koAvant: Math.round(poidsAvant / 1024),
    koApres: Math.round(buffer.length / 1024),
  };
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
  let koAvant = 0;
  let koApres = 0;
  const echecs = [];

  for (let i = 0; i < liste.length; i++) {
    const e = liste[i];
    const etiquette = `${e.titre || '?'} — ${e.artiste || '?'}`;
    try {
      const r = await importer(e, i);
      ok++;
      koAvant += r.koAvant;
      koApres += r.koApres;
      console.log(`✓ ${etiquette} (${r.duree}s`
        + `${r.raccourci ? `, ${r.koAvant} → ${r.koApres} Ko` : ''})`
        + `${r.remplace ? ' [mis à jour]' : ''}`);
    } catch (err) {
      echecs.push({ etiquette, raison: err.message });
      console.error(`✗ ${etiquette} — ${err.message}`);
    }
  }

  // Un compte-rendu explicite : un import à moitié réussi doit se voir, sinon
  // on croit le catalogue complet alors qu'il manque des morceaux.
  console.log(`\n${ok}/${liste.length} morceau(x) en ligne.`);
  if (koAvant > koApres) {
    console.log(`Stockage : ${Math.round(koAvant / 1024)} Mo ramenés à `
      + `${Math.round(koApres / 1024)} Mo en ne gardant que ${DUREE_GARDEE_S} s par morceau.`);
  }
  if (echecs.length) {
    console.log(`${echecs.length} refusé(s) :`);
    echecs.forEach((f) => console.log(`  · ${f.etiquette} : ${f.raison}`));
    process.exit(1);
  }
})();
