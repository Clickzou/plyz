#!/usr/bin/env node
/**
 * Les réseaux sociaux des personnalités du catalogue.
 * ---------------------------------------------------------------------------
 *
 *  Pourquoi : réclamer quelqu'un ne servait qu'à envoyer un lien Plyz à ses
 *  proches. La personne concernée, elle, n'apprenait jamais que trois cents
 *  fans l'attendaient. Pour qu'un fan puisse l'interpeller chez elle, il faut
 *  connaître sa page — et Wikidata la connaît déjà pour la plupart des sept
 *  mille fiches importées.
 *
 *  Aucune requête SPARQL ici : chaque fiche du catalogue garde son identifiant
 *  Wikidata dans `reseau_url` (« https://www.wikidata.org/wiki/Q3821 »). On
 *  interroge donc directement les entités, cinquante à la fois — c'est cent
 *  cinquante appels pour tout le catalogue au lieu de sept mille.
 *
 *  PRÉREQUIS : exécuter `sql/stars_reseaux.sql` d'abord (colonne `reseaux`).
 *
 *  Usage :
 *    node scripts/enrichir-reseaux-stars.cjs --essai --tout --limite 50
 *                                              (n'écrit rien, contrôle sur 50 fiches)
 *    node scripts/enrichir-reseaux-stars.cjs           (les fiches jamais cherchées)
 *    node scripts/enrichir-reseaux-stars.cjs --tout    (refait TOUT, même le déjà fait)
 */

const { createClient } = require('@supabase/supabase-js');

const ESSAI = process.argv.includes('--essai');
const TOUT = process.argv.includes('--tout');
// Pour vérifier que tout fonctionne sans attendre sept mille fiches.
const LIMITE = (() => {
  const i = process.argv.indexOf('--limite');
  return i > -1 ? Number(process.argv[i + 1]) || 0 : 0;
})();

/**
 * Les propriétés Wikidata qui portent un compte, et comment en faire une URL.
 *
 * L'ordre compte : c'est celui dans lequel l'application proposera d'aller
 * interpeller la personnalité. Facebook d'abord — c'est là que les pages
 * publiques acceptent le plus largement les commentaires d'inconnus — puis
 * Instagram, où se trouve l'essentiel des personnalités jeunes.
 *
 * ⚠️ Wikidata stocke l'IDENTIFIANT, pas l'adresse : « zidane », pas
 * « facebook.com/zidane ». Reconstruire l'adresse est donc notre affaire, et
 * une erreur ici enverrait des milliers de fans sur des pages inexistantes.
 */
const RESEAUX = [
  { cle: 'facebook',  propriete: 'P2013', url: (id) => `https://www.facebook.com/${id}` },
  { cle: 'instagram', propriete: 'P2003', url: (id) => `https://www.instagram.com/${id}` },
  { cle: 'youtube',   propriete: 'P2397', url: (id) => `https://www.youtube.com/channel/${id}` },
  { cle: 'x',         propriete: 'P2002', url: (id) => `https://x.com/${id}` },
  { cle: 'tiktok',    propriete: 'P7085', url: (id) => `https://www.tiktok.com/@${id.replace(/^@/, '')}` },
  // Le site officiel est déjà une adresse complète : on la prend telle quelle.
  { cle: 'site',      propriete: 'P856',  url: (id) => id },
];

const ENTETES = {
  // Wikidata exige un agent identifiable ; les requêtes anonymes sont
  // ralenties, puis refusées.
  'User-Agent': 'Plyz/1.0 (https://plyz.io; contact@plyz.io)',
  Accept: 'application/json',
};

const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const MAX_TENTATIVES = 3;

/** Les identifiants Supabase, depuis l'environnement ou le `.env` du projet. */
function lireEnv(cle) {
  if (process.env[cle]) return process.env[cle].replace(/^["']|["']$/g, '');
  const fs = require('fs');
  const path = require('path');
  for (const candidat of ['../.env', '.env']) {
    try {
      const chemin = path.resolve(__dirname, '..', candidat);
      const contenu = fs.readFileSync(chemin, 'utf8');
      const m = contenu.match(new RegExp('^' + cle + '=(.*)$', 'm'));
      if (m) return m[1].trim().replace(/^["']|["']$/g, '');
    } catch { /* fichier absent : on essaie le suivant */ }
  }
  return null;
}

/** L'identifiant Wikidata caché dans le lien de la fiche, ou null. */
function qidDepuis(lien) {
  const m = String(lien || '').match(/\/(Q\d+)(?:[#?].*)?$/);
  return m ? m[1] : null;
}

/**
 * Les comptes d'un paquet d'entités Wikidata.
 *
 * `props=claims` seul : on ne rapatrie ni les libellés ni les descriptions,
 * qu'on possède déjà. Sur cinquante entités, cela divise la réponse par dix —
 * et une réponse de dix mégaoctets finit par expirer.
 */
async function comptesDe(qids, tentative = 1) {
  const url = 'https://www.wikidata.org/w/api.php'
    + '?action=wbgetentities&format=json&props=claims&ids=' + qids.join('|');

  let rep;
  try {
    rep = await fetch(url, { headers: ENTETES, signal: AbortSignal.timeout(60000) });
  } catch (e) {
    if (tentative >= MAX_TENTATIVES) throw e;
    await pause(tentative * 5000);
    return comptesDe(qids, tentative + 1);
  }
  if (!rep.ok) {
    if (tentative >= MAX_TENTATIVES) throw new Error(`wbgetentities ${rep.status}`);
    await pause(tentative * 5000);
    return comptesDe(qids, tentative + 1);
  }

  const donnees = await rep.json();
  const parQid = {};

  for (const [qid, entite] of Object.entries(donnees?.entities || {})) {
    const trouves = {};

    // La date de naissance (P569) voyage avec les comptes : c'est le même
    // appel, et elle ouvre le mur d'anniversaire — le seul jour de l'année où
    // des milliers de messages font plaisir à une personnalité au lieu de
    // l'agacer.
    const naissance = (entite?.claims?.P569 || [])
      .find((c) => c.rank !== 'deprecated' && c?.mainsnak?.datavalue?.value?.time);
    if (naissance) {
      // Wikidata écrit « +1972-06-23T00:00:00Z », et la précision compte :
      // 9 = l'année seule, 10 = le mois, 11 = le jour. En dessous de 11, on ne
      // connaît pas le jour — souhaiter un anniversaire au hasard serait pire
      // que de se taire.
      const precision = Number(naissance.mainsnak.datavalue.value.precision || 0);
      const m = String(naissance.mainsnak.datavalue.value.time).match(/^\+(\d{4})-(\d{2})-(\d{2})/);
      if (precision >= 11 && m && m[2] !== '00' && m[3] !== '00') {
        trouves.__naissance = `${m[1]}-${m[2]}-${m[3]}`;
      }
    }
    for (const reseau of RESEAUX) {
      const revendications = entite?.claims?.[reseau.propriete] || [];
      // « deprecated » : un compte que Wikidata sait fermé ou usurpé. L'ouvrir
      // enverrait le fan sur une page morte — ou pire, sur celle d'un
      // imposteur qui a récupéré le pseudonyme.
      const valide = revendications.find((c) => c.rank !== 'deprecated'
        && typeof c?.mainsnak?.datavalue?.value === 'string');
      const identifiant = valide?.mainsnak?.datavalue?.value;
      if (!identifiant) continue;

      const adresse = reseau.url(identifiant.trim());
      // Le site officiel arrive parfois sans protocole, ou en « http:// » :
      // une adresse qu'un téléphone refuse d'ouvrir ne vaut pas mieux que pas
      // d'adresse du tout.
      if (!/^https?:\/\//i.test(adresse)) continue;
      trouves[reseau.cle] = adresse.replace(/^http:\/\//i, 'https://');
    }
    parQid[qid] = trouves;
  }

  return parQid;
}

async function main() {
  const url = lireEnv('SUPABASE_URL') || lireEnv('EXPO_PUBLIC_SUPABASE_URL');
  const cle = lireEnv('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !cle) {
    console.error('SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont nécessaires.');
    process.exit(1);
  }
  const db = createClient(url, cle, { auth: { persistSession: false } });

  // Les fiches à traiter, par pages de mille : Supabase plafonne toute requête
  // à mille lignes, et sans pagination le script s'arrêterait au septième du
  // catalogue en annonçant tranquillement avoir terminé.
  const fiches = [];
  const PAGE = 1000;
  for (let debut = 0; ; debut += PAGE) {
    let requete = db.from('stars_reclamees')
      .select('id, slug, nom_affiche, reseau_url')
      .like('reseau_url', '%wikidata.org%')
      .order('id')
      .range(debut, debut + PAGE - 1);
    if (!TOUT) requete = requete.is('reseaux', null);

    const { data, error } = await requete;
    if (error) { console.error('Lecture impossible :', error.message); process.exit(1); }
    fiches.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }

  let aTraiter = fiches
    .map((f) => ({ ...f, qid: qidDepuis(f.reseau_url) }))
    .filter((f) => f.qid);
  if (LIMITE > 0) aTraiter = aTraiter.slice(0, LIMITE);

  console.log(`${aTraiter.length} fiche(s) à interroger${ESSAI ? ' (essai)' : ''}.`);
  if (!aTraiter.length) return;

  let avecReseau = 0;
  let sansReseau = 0;
  let naissances = 0;
  const compte = { facebook: 0, instagram: 0, youtube: 0, x: 0, tiktok: 0, site: 0 };

  const LOT = 50; // la limite de l'API Wikidata pour les comptes anonymes
  for (let i = 0; i < aTraiter.length; i += LOT) {
    const lot = aTraiter.slice(i, i + LOT);
    let parQid;
    try {
      parQid = await comptesDe(lot.map((f) => f.qid));
    } catch (e) {
      console.warn(`  ⚠ lot ${i}-${i + lot.length} : ${e.message}`);
      await pause(5000);
      continue;
    }

    const ecritures = [];
    for (const fiche of lot) {
      const brut = parQid[fiche.qid] || {};
      // La date de naissance a sa propre colonne : elle n'a rien à faire dans
      // l'objet des réseaux sociaux, que l'application parcourt pour proposer
      // « où lui écrire ».
      const { __naissance: naissance, ...reseaux } = brut;
      const nb = Object.keys(reseaux).length;
      if (nb) { avecReseau++; for (const k of Object.keys(reseaux)) compte[k]++; }
      else sansReseau++;

      if (naissance) naissances++;

      if (ESSAI) {
        if (i < 20) {
          console.log(`  ${fiche.nom_affiche} → ${nb ? Object.keys(reseaux).join(', ') : '—'}`
            + (naissance ? `  🎂 ${naissance}` : ''));
        }
        continue;
      }
      // `{}` et non `null` quand rien n'est trouvé : c'est ce qui distingue
      // « cherché, rien » de « jamais cherché », et évite de repasser
      // indéfiniment sur les mêmes fiches à chaque relance.
      ecritures.push(db.from('stars_reclamees')
        .update(naissance ? { reseaux, date_naissance: naissance } : { reseaux })
        .eq('id', fiche.id));
    }

    if (ecritures.length) {
      const resultats = await Promise.all(ecritures);
      const rate = resultats.find((r) => r.error);
      if (rate) console.error(`  ⚠ écriture : ${rate.error.message}`);
    }

    process.stdout.write(`\r  ${Math.min(i + LOT, aTraiter.length)}/${aTraiter.length}`);
    // Un lot par seconde : Wikidata tolère bien davantage, mais rien ne presse
    // et se faire bannir coûterait une journée.
    await pause(400);
  }

  console.log('\n');
  console.log(`Avec au moins un réseau : ${avecReseau}`);
  console.log(`Aucun compte connu      : ${sansReseau}`);
  console.log(`Date de naissance       : ${naissances}`);
  console.log('Détail :', Object.entries(compte).map(([k, n]) => `${k} ${n}`).join(' · '));
  if (ESSAI) console.log('\n(essai : rien n’a été écrit)');
}

main().catch((e) => { console.error(e); process.exit(1); });
