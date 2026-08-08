#!/usr/bin/env node
/**
 * Pré-création des fiches de personnalités — le catalogue.
 * ---------------------------------------------------------------------------
 *
 *  Pourquoi : qu'un fan qui cherche sa star la trouve sans avoir à la saisir,
 *  et que quelqu'un qui tape « contacter [nom] » sur Google tombe sur Plyz.
 *
 *  ⚠️ Une fiche versée ici n'entre PAS dans le classement. Le classement ne
 *  montre que ce qui est réellement réclamé — c'est ce chiffre qu'on présente
 *  à un agent, et 15 000 fiches à zéro le rendraient muet. Voir la fonction
 *  `classement_stars` dans `sql/catalogue_stars.sql`.
 *
 *  Source : Wikidata. Chaque personne y est vérifiable, vivante (aucune date
 *  de décès), et rattachée à un métier et à un pays. C'est déjà l'arbitre de
 *  la notoriété à l'inscription d'une célébrité et des suggestions de noms :
 *  une seule autorité, donc pas deux vérités.
 *
 *  Le tri se fait par nombre de pages Wikipédia (`sitelinks`) : c'est la
 *  mesure de notoriété la plus honnête qui soit gratuite — quelqu'un dont
 *  l'article existe en trente langues est connu dans trente pays.
 *
 *  PRÉREQUIS : exécuter `sql/catalogue_stars.sql` d'abord.
 *
 *  Usage :
 *    node scripts/importer-catalogue-stars.cjs --essai        (n'écrit rien)
 *    node scripts/importer-catalogue-stars.cjs --pays FR
 *    node scripts/importer-catalogue-stars.cjs                (tout)
 */

const { createClient } = require('@supabase/supabase-js');

const ESSAI = process.argv.includes('--essai');
const PAYS_DEMANDE = (() => {
  const i = process.argv.indexOf('--pays');
  return i > -1 ? (process.argv[i + 1] || '').toUpperCase() : null;
})();

// Les dix pays retenus : ceux d'où viennent les fans, et ceux dont les
// personnalités sont connues au-delà de leurs frontières.
const PAYS = [
  { code: 'FR', qid: 'Q142',  nom: 'France' },
  { code: 'GB', qid: 'Q145',  nom: 'Royaume-Uni' },
  { code: 'US', qid: 'Q30',   nom: 'États-Unis' },
  { code: 'ES', qid: 'Q29',   nom: 'Espagne' },
  { code: 'IT', qid: 'Q38',   nom: 'Italie' },
  { code: 'DE', qid: 'Q183',  nom: 'Allemagne' },
  { code: 'BR', qid: 'Q155',  nom: 'Brésil' },
  { code: 'AR', qid: 'Q414',  nom: 'Argentine' },
  { code: 'PT', qid: 'Q45',   nom: 'Portugal' },
  // ⚠️ Q29999 (Royaume des Pays-Bas) et non Q55 (Pays-Bas) : c'est le premier
  // que Wikidata donne comme nationalité. Avec Q55, la requête ne trouvait que
  // TROIS footballeurs vivants au lieu de près de sept mille — et le pays
  // était sorti du catalogue sans la moindre erreur pour le signaler.
  { code: 'NL', qid: 'Q29999', nom: 'Pays-Bas' },
  { code: 'CN', qid: 'Q148',  nom: 'Chine' },
];

/**
 * Les métiers recherchés, avec leur identifiant Wikidata.
 *
 * `limite` est volontairement inégale : il y a plus de footballeurs connus que
 * de pilotes de MotoGP, et remplir un quota identique partout ferait descendre
 * très bas dans la notoriété pour les disciplines étroites — on récolterait
 * des inconnus.
 */
const METIERS = [
  { qid: 'Q937857',  libelle: 'Footballeur',            limite: 100 },
  { qid: 'Q11338576', libelle: 'Joueur de football américain', limite: 40 },
  { qid: 'Q10871364', libelle: 'Joueur de baseball',    limite: 40 },
  { qid: 'Q11774891', libelle: 'Joueur de hockey sur glace', limite: 40 },
  { qid: 'Q13381863', libelle: 'Joueur de rugby',       limite: 40 },
  { qid: 'Q3665646',  libelle: 'Basketteur',            limite: 40 },
  { qid: 'Q10833314', libelle: 'Joueur de tennis',      limite: 30 },
  { qid: 'Q10843402', libelle: 'Nageur',                limite: 20 },
  { qid: 'Q11513337', libelle: 'Athlète',               limite: 30 },
  { qid: 'Q13381376', libelle: 'Cycliste',              limite: 25 },
  { qid: 'Q15117302', libelle: 'Pilote de course',      limite: 25 },
  { qid: 'Q10349745', libelle: 'Judoka',                limite: 15 },
  { qid: 'Q13141064', libelle: 'Gymnaste',              limite: 15 },
  { qid: 'Q13365117', libelle: 'Boxeur',                limite: 20 },
  { qid: 'Q177220',   libelle: 'Chanteur',              limite: 100 },
  { qid: 'Q639669',   libelle: 'Musicien',              limite: 50 },
  { qid: 'Q33999',    libelle: 'Acteur',                limite: 100 },
  { qid: 'Q245068',   libelle: 'Humoriste',             limite: 50 },
  { qid: 'Q947873',   libelle: 'Présentateur TV',       limite: 40 },
  { qid: 'Q82955',    libelle: 'Personnalité politique', limite: 50 },
  { qid: 'Q2405480',  libelle: 'Doubleur',              limite: 15 },
  { qid: 'Q3282637',  libelle: 'Producteur de cinéma',  limite: 20 },
  { qid: 'Q2526255',  libelle: 'Réalisateur',           limite: 30 },
  { qid: 'Q36180',    libelle: 'Écrivain',              limite: 30 },
  { qid: 'Q483501',   libelle: 'Artiste',               limite: 20 },

  // Les métiers du web. Ce sont souvent les plus accessibles — un vidéaste
  // suivi par 500 000 personnes répond lui-même à ses messages, là où un
  // footballeur international passe par trois intermédiaires. Ils ont donc
  // plus de chances de venir les premiers.
  //
  // ⚠️ Ces identifiants ont été vérifiés un par un contre Wikidata : sur six
  // essayés « de mémoire », un seul existait. Ne jamais en ajouter sans avoir
  // compté ce qu'ils rendent.
  { qid: 'Q17125263', libelle: 'Youtubeur',             limite: 60 },
  { qid: 'Q2906862',  libelle: 'Influenceur',           limite: 60 },
  { qid: 'Q57414145', libelle: 'Streameur',             limite: 40 },
  { qid: 'Q50279140', libelle: 'Streameur Twitch',      limite: 40 },
  { qid: 'Q94791573', libelle: 'Tiktokeur',             limite: 40 },
  { qid: 'Q118371929', libelle: 'Vidéaste web',         limite: 25 },
];

const ENTETES = { 'User-Agent': 'Plyz/1.0 (contact@plyz.io)' };
const SPARQL = 'https://query.wikidata.org/sparql';

/** Même transformation que le serveur : deux orthographes d'un même nom
 *  doivent produire le même identifiant, sinon le compteur se divise. */
function slugDeStar(nom) {
  return String(nom || '')
    .trim()
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Les personnes vivantes d'un métier et d'un pays, les plus connues d'abord.
 *
 * `wikibase:sitelinks` compte les Wikipédia où la personne a un article. Trier
 * dessus évite de récolter des inconnus qui partagent seulement la profession.
 * `FILTER NOT EXISTS { ?p wdt:P570 [] }` écarte les personnes décédées : une
 * fiche « Réclamez [mort] » serait au mieux ridicule, au pire blessante.
 */
async function interroger(metierQid, paysQid, limite, tentative = 1) {
  const MAX_TENTATIVES = 4;
  const requete = `
    SELECT ?p ?nom ?liens WHERE {
      ?p wdt:P31 wd:Q5 ;
         wdt:P106 wd:${metierQid} ;
         wdt:P27 wd:${paysQid} ;
         wikibase:sitelinks ?liens .
      FILTER NOT EXISTS { ?p wdt:P570 [] }
      FILTER (?liens >= 5)
      SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en". ?p rdfs:label ?nom }
    }
    ORDER BY DESC(?liens)
    LIMIT ${limite}`;

  const url = `${SPARQL}?format=json&query=${encodeURIComponent(requete)}`;

  // Wikidata renvoie régulièrement 500, 502 ou 504 quand plusieurs requêtes
  // s'enchaînent : le service est partagé et se protège. Sans réessai, le
  // premier essai a perdu 7 catégories sur 25 — dont « Footballeur », la plus
  // importante — et un catalogue à trous serait pire que pas de catalogue,
  // parce que personne ne saurait ce qui manque.
  let rep;
  try {
    rep = await fetch(url, { headers: ENTETES, signal: AbortSignal.timeout(120000) });
  } catch (e) {
    if (tentative >= MAX_TENTATIVES) throw e;
    await pause(tentative * 8000);
    return interroger(metierQid, paysQid, limite, tentative + 1);
  }
  if (!rep.ok) {
    if (tentative >= MAX_TENTATIVES) throw new Error(`SPARQL ${rep.status}`);
    // Attente croissante : 8 s, 16 s, 24 s. Réessayer aussitôt ne ferait
    // qu'ajouter à la charge qui vient de faire échouer la requête.
    process.stdout.write(`  … ${rep.status}, nouvel essai dans ${tentative * 8}s\n`);
    await pause(tentative * 8000);
    return interroger(metierQid, paysQid, limite, tentative + 1);
  }
  const donnees = await rep.json();

  return (donnees?.results?.bindings || [])
    .map((b) => ({
      qid: (b.p?.value || '').split('/').pop(),
      nom: b.nom?.value || '',
      liens: Number(b.liens?.value || 0),
    }))
    // Un label resté sous forme « Q12345 » signifie que Wikidata n'a de nom
    // ni en français ni en anglais : inutilisable pour un affichage.
    .filter((p) => p.nom && !/^Q\d+$/.test(p.nom));
}

/**
 * Les identifiants Supabase, depuis l'environnement ou le `.env` du projet.
 *
 * Les valeurs y sont parfois entourées de guillemets : laissés en place, ils
 * partent dans l'adresse et la requête échoue sur une URL invalide.
 */
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

async function main() {
  const url = lireEnv('SUPABASE_URL') || lireEnv('EXPO_PUBLIC_SUPABASE_URL');
  const cle = lireEnv('SUPABASE_SERVICE_ROLE_KEY');
  if (!ESSAI && (!url || !cle)) {
    console.error('SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont nécessaires.');
    process.exit(1);
  }
  const db = ESSAI ? null : createClient(url, cle, { auth: { persistSession: false } });

  const paysATraiter = PAYS_DEMANDE ? PAYS.filter((p) => p.code === PAYS_DEMANDE) : PAYS;
  if (!paysATraiter.length) {
    console.error('Pays inconnu. Codes acceptés :', PAYS.map((p) => p.code).join(', '));
    process.exit(1);
  }

  // Deux personnes différentes peuvent porter le même nom, et une même
  // personne peut sortir sur deux métiers (chanteur ET acteur). Le slug
  // dédoublonne les deux cas avant la moindre écriture.
  const vus = new Set();
  let total = 0;
  let ecrits = 0;

  for (const pays of paysATraiter) {
    for (const metier of METIERS) {
      let personnes = [];
      try {
        personnes = await interroger(metier.qid, pays.qid, metier.limite);
      } catch (e) {
        console.warn(`  ⚠ ${pays.code}/${metier.libelle} : ${e.message}`);
        // Wikidata limite le débit : on souffle plus longtemps après un échec
        // plutôt que d'insister et de se faire refuser la suite.
        await pause(5000);
        continue;
      }

      const lignes = [];
      for (const p of personnes) {
        const slug = slugDeStar(p.nom);
        if (!slug || vus.has(slug)) continue;
        vus.add(slug);
        total++;
        lignes.push({
          slug,
          nom_affiche: p.nom,
          metier: metier.libelle,
          pays: pays.code,
          pre_creee: true,
          source_import: 'wikidata',
          reseau_url: `https://www.wikidata.org/wiki/${p.qid}`,
          // Visible : la fiche doit être trouvable. Elle n'entre pas au
          // classement pour autant — c'est `classement_stars` qui exige au
          // moins une réclamation, pas ce drapeau.
          visible: true,
        });
      }

      console.log(`${pays.code} · ${metier.libelle} : ${lignes.length}`);

      if (!ESSAI && lignes.length) {
        // `ignoreDuplicates` : une fiche déjà ouverte par un fan garde son
        // nom et son historique. On complète le catalogue, on ne l'écrase pas.
        const { error } = await db
          .from('stars_reclamees')
          .upsert(lignes, { onConflict: 'slug', ignoreDuplicates: true });
        if (error) console.error(`  ⚠ écriture : ${error.message}`);
        else ecrits += lignes.length;
      }

      // Wikidata est un service public et gratuit. Deux secondes entre deux
      // requêtes : à 1,2 s, une requête sur quatre revenait en erreur. Mieux
      // vaut un import qui dure vingt minutes qu'un import rapide et troué.
      await pause(2000);
    }
  }

  console.log(`\n${total} personnalités retenues, ${ESSAI ? 0 : ecrits} écrites.`);
  if (ESSAI) console.log('Essai : aucune écriture. Relancer sans --essai pour importer.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
