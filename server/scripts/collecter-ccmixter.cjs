#!/usr/bin/env node
/**
 * Constitue une liste de morceaux libres à partir de ccMixter, prête pour
 * `importer-musiques.cjs`.
 *
 *   node scripts/collecter-ccmixter.cjs 100 > musiques.json
 *
 * ⚠️ LICENCES — c'est tout l'objet de ce script.
 * Beaucoup de morceaux « gratuits » ne sont PAS utilisables par Plyz :
 *
 *   · NC (non commercial) — les personnalités vendent sur Plyz. Exclu.
 *   · ND (pas de modification) — incruster un morceau dans une vidéo crée une
 *     œuvre dérivée. Exclu.
 *   · SA (partage à l'identique) — obligerait la vidéo de la personnalité à
 *     être republiée sous la même licence. Exclu.
 *
 * Ne restent que CC-BY et CC0/domaine public. Le filtre est une LISTE BLANCHE :
 * une licence inconnue est rejetée plutôt qu'acceptée par défaut.
 *
 * Ce script ne remplace pas une écoute. Il rassemble des candidats vérifiés
 * juridiquement et techniquement (le lien répond) ; le tri à l'oreille reste à
 * faire dans l'application, en désactivant ce qui ne convient pas.
 */

const https = require('https');

/**
 * Requête HTTP maison plutôt que `fetch`.
 *
 * ccMixter renvoie une avalanche d'en-têtes (cookies) qui dépasse la limite
 * d'undici, le client interne de Node : `fetch` échoue sur un « Headers
 * Overflow Error » qu'aucune option de ligne de commande ne desserre. Le
 * module natif, lui, accepte `maxHeaderSize`.
 */
function requete(url, methode = 'GET', enTetes = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: methode,
      maxHeaderSize: 262144,
      headers: { 'User-Agent': 'Plyz/1.0 (catalogue musical)', ...enTetes },
      timeout: 30000,
    }, (res) => {
      if (methode === 'HEAD' || enTetes.Range) {
        res.resume();
        return resolve({ statut: res.statusCode, corps: '' });
      }
      let corps = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { corps += c; });
      res.on('end', () => resolve({ statut: res.statusCode, corps }));
    });
    req.on('timeout', () => req.destroy(new Error('délai dépassé')));
    req.on('error', reject);
    req.end();
  });
}

const LICENCES = [
  // [motif dans l'adresse de licence, valeur stockée en base]
  { motif: /creativecommons\.org\/publicdomain\/zero/i, valeur: 'cc0' },
  { motif: /creativecommons\.org\/publicdomain\/mark/i, valeur: 'domaine_public' },
  { motif: /creativecommons\.org\/licenses\/by\/[\d.]+\/?$/i, valeur: 'cc_by' },
];

/** Renvoie la licence retenue, ou null si elle n'est pas utilisable. */
function licenceUtilisable(url) {
  const u = String(url || '').trim();
  if (!u) return null;
  // Rejet explicite et prioritaire : ces mentions rendent le morceau inutilisable.
  if (/\/by-nc|\/by-nd|\/by-sa|\/nc-|-nd\/|-sa\//i.test(u)) return null;
  for (const l of LICENCES) if (l.motif.test(u)) return l.valeur;
  return null;
}

// Familles de recherche → ambiance affichée dans le sélecteur. Les mots-clés
// sont ceux des tags de ccMixter.
// Deux tiers du catalogue ccMixter est en licence NC, inutilisable ici : on
// ratisse donc large pour que le tiers restant suffise.
const FAMILLES = [
  { ambiance: 'calme', tags: 'ambient' },
  { ambiance: 'calme', tags: 'chill' },
  { ambiance: 'calme', tags: 'downtempo' },
  { ambiance: 'inspirant', tags: 'piano' },
  { ambiance: 'inspirant', tags: 'acoustic' },
  { ambiance: 'inspirant', tags: 'guitar' },
  { ambiance: 'energique', tags: 'electronic' },
  { ambiance: 'energique', tags: 'rock' },
  { ambiance: 'energique', tags: 'dance' },
  { ambiance: 'energique', tags: 'drum_and_bass' },
  { ambiance: 'urbain', tags: 'hiphop' },
  { ambiance: 'urbain', tags: 'funk' },
  { ambiance: 'urbain', tags: 'jazz' },
  { ambiance: 'urbain', tags: 'reggae' },
  { ambiance: 'cinematique', tags: 'soundtrack' },
  { ambiance: 'cinematique', tags: 'orchestral' },
  { ambiance: 'cinematique', tags: 'experimental' },
  { ambiance: 'cinematique', tags: 'instrumental' },
];

function dureeEnSecondes(ps) {
  const m = String(ps || '').match(/^(\d+):(\d+)$/);
  if (!m) return 0;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

// Au-delà d'une soixantaine de résultats, ccMixter renvoie une réponse que
// Node n'arrive plus à lire (« Header overflow »). On pagine donc par 50.
const PAR_PAGE = 50;

async function interroger(tags, pages) {
  const tout = [];
  for (let p = 0; p < pages; p++) {
    const url = 'https://ccmixter.org/api/query'
      + `?f=json&limit=${PAR_PAGE}&offset=${p * PAR_PAGE}`
      + `&tags=${encodeURIComponent(tags)}&sort=rank&ord=DESC`;
    const { statut, corps } = await requete(url);
    if (statut !== 200) throw new Error(`ccMixter ${statut}`);
    const lot = JSON.parse(corps);
    if (!Array.isArray(lot) || !lot.length) break;
    tout.push(...lot);
    if (lot.length < PAR_PAGE) break; // Dernière page atteinte.
  }
  return tout;
}

/**
 * Un lien mort dans le catalogue = une musique qui échoue à la publication.
 *
 * On demande les deux premiers octets plutôt que de faire un HEAD : ccMixter
 * répond 403 aux requêtes HEAD, ce qui faisait passer pour morts des liens
 * parfaitement valides.
 */
async function lienValide(url) {
  try {
    const { statut } = await requete(url, 'GET', {
      Range: 'bytes=0-1',
      // Sans ce Referer, ccMixter répond 403 à TOUT téléchargement — c'est une
      // protection contre les liens pillés depuis d'autres sites. L'oublier
      // faisait passer pour morts quatre cents liens parfaitement valides.
      Referer: 'https://ccmixter.org/',
    });
    return statut >= 200 && statut < 400;
  } catch {
    return false;
  }
}

(async () => {
  const voulus = parseInt(process.argv[2] || '100', 10);
  const retenus = [];
  const vus = new Set();
  const rejets = { licence: 0, sansFichier: 0, lienMort: 0, doublon: 0, tropLong: 0 };

  // Deux passages. Le premier impose un quota par famille — sans lui les
  // premières consommaient tout le compte et le filtre par ambiance n'offrait
  // que deux choix sur cinq. Le second comble ce qui manque, sans quota :
  // mieux vaut un catalogue complet un peu déséquilibré qu'un catalogue
  // équilibré mais trop maigre.
  const passes = [Math.ceil(voulus / FAMILLES.length), Infinity];

  for (const quota of passes) {
  if (retenus.length >= voulus) break;
  for (const famille of FAMILLES) {
    if (retenus.length >= voulus) break;
    let lot = [];
    // Une requête sur dix échoue en « Header overflow » sans raison visible.
    // Un simple second essai suffit, et évite de perdre une famille entière.
    for (let essai = 0; essai < 2 && !lot.length; essai++) {
      try {
        lot = await interroger(famille.tags, 3);
      } catch (e) {
        if (essai) console.error(`[${famille.tags}] ${e.message}`);
      }
    }
    if (!lot.length) continue;

    let prisIci = 0;
    for (const item of lot) {
      if (retenus.length >= voulus || prisIci >= quota) break;

      const licence = licenceUtilisable(item.license_url);
      if (!licence) { rejets.licence++; continue; }

      const fichier = (item.files || []).find(
        (f) => f.download_url && /\.mp3$/i.test(f.download_url));
      if (!fichier) { rejets.sansFichier++; continue; }

      const cle = fichier.download_url;
      if (vus.has(cle)) { rejets.doublon++; continue; }

      const duree = dureeEnSecondes(fichier.file_format_info?.ps);
      // Au-delà de dix minutes on télécharge un fichier énorme pour n'en garder
      // que trente secondes : la vidéo est coupée à 30 s de toute façon.
      if (duree > 600) { rejets.tropLong++; continue; }

      if (!(await lienValide(cle))) { rejets.lienMort++; continue; }
      vus.add(cle);
      prisIci++;

      const titre = String(item.upload_name || '').trim();
      const artiste = String(item.user_real_name || item.user_name || '').trim();
      const nomLicence = item.license_name || 'CC BY';

      retenus.push({
        titre,
        artiste,
        licence,
        // Le crédit affiché sous la vidéo. Obligatoire en CC-BY, et rédigé ici
        // une bonne fois : le reconstituer plus tard, morceau par morceau,
        // serait la garantie d'en oublier.
        attribution: licence === 'cc_by'
          ? `« ${titre} » par ${artiste} (ccMixter), ${nomLicence}`
          : null,
        source_url: item.file_page_url || null,
        ambiance: famille.ambiance,
        url: cle,
      });
    }
  }
  }

  console.error(`\n${retenus.length} morceau(x) retenus sur ${voulus} demandés.`);
  console.error('Écartés — licence inutilisable : ' + rejets.licence
    + ', sans mp3 : ' + rejets.sansFichier
    + ', lien mort : ' + rejets.lienMort
    + ', doublon : ' + rejets.doublon
    + ', trop long : ' + rejets.tropLong);
  if (retenus.length < voulus) {
    console.error('⚠️ Moins que demandé : élargir FAMILLES plutôt que baisser le filtre de licence.');
  }

  process.stdout.write(JSON.stringify(retenus, null, 2));
})();
