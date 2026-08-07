/**
 * Détecte les liens et numéros de téléphone dans un texte écrit par un
 * utilisateur.
 *
 * Pourquoi c'est interdit sous les publications d'une personnalité :
 *
 *  · L'arnaque type consiste à répondre sous le post d'une star, en se faisant
 *    passer pour elle ou pour son équipe, avec un numéro WhatsApp ou un lien
 *    « pour gagner une dédicace ». Les fans qui suivent y laissent leur argent,
 *    et la star porte la faute aux yeux de son public.
 *  · Un lien sortant échappe à toute modération : la page peut changer de
 *    contenu APRÈS avoir été postée.
 *  · Publier le numéro de quelqu'un est un moyen de harcèlement, y compris
 *    celui de la personnalité elle-même.
 *
 * Les tentatives de contournement les plus courantes sont couvertes :
 * « exemple point com », « exemple (dot) com », « zero six douze… » non — un
 * filtre n'attrapera jamais tout, et ce n'est pas son rôle. Il ferme la porte
 * du milieu ; le signalement reste là pour le reste.
 */

/** Adresses en clair, sous leurs formes habituelles et déguisées. */
const MOTIFS_LIEN: RegExp[] = [
  // http://, https://, ftp://
  /\b(?:https?|ftp):\/\//i,
  // www.quelquechose
  /\bwww\s*[.\[(]/i,
  // domaine.extension — la liste couvre les extensions réellement utilisées
  // pour ce genre de renvoi. Un `\.[a-z]{2,}` général rejetterait « Merci.
  // Super » ou « c'est top.merci ».
  /\b[a-z0-9][a-z0-9-]{1,}\s*\.\s*(?:com|fr|net|org|io|co|me|tv|app|shop|xyz|info|biz|ru|de|es|it|uk|be|ch|ca|us|link|page|site|online|store|club|live|gg|ly|to|cc|top|vip|fun|bio|link)\b/i,
  // exemple point com · exemple (dot) com · exemple [.] com
  /\b[a-z0-9-]{2,}\s*(?:\(|\[)?\s*(?:point|dot|punto|punkt)\s*(?:\)|\])?\s*(?:com|fr|net|org|io|co|me|tv|app)\b/i,
  /[a-z0-9-]{2,}\s*[\[(]\s*\.\s*[\])]\s*[a-z]{2,}/i,
];

/**
 * Numéro de téléphone : au moins huit chiffres dans une même suite, où seuls
 * espaces, points, tirets, barres obliques, parenthèses et « + » séparent.
 *
 * Le seuil de huit laisse passer ce qui n'est pas un numéro — une année, un
 * prix, un score, une heure, « 100 000 abonnés ».
 */
const MOTIF_TELEPHONE = /(?:\+?\d[\s.\-/()]{0,2}){8,}/g;

/**
 * Une suite de chiffres qui n'est RIEN D'AUTRE qu'une date.
 *
 * Sans cette exception, « Rendez-vous le 07/08/2026 » comptait huit chiffres
 * et partait au refus — or annoncer une date sous l'annonce d'un événement est
 * exactement ce qu'on attend d'un commentaire.
 *
 * La date est reconnue sur la suite ENTIÈRE, jamais retirée au milieu du
 * texte : découper d'abord laissait passer « 06.12.34.56.78 », dont les trois
 * premiers groupes ressemblent à une date.
 */
const MOTIF_DATE_SEULE = /^\s*\d{1,2}\s*[./-]\s*\d{1,2}\s*[./-]\s*\d{2,4}\s*$/;

export type TypeCoordonnee = 'lien' | 'telephone';

/**
 * Renvoie ce qui a été détecté, ou `null` si le texte est propre.
 * Le premier trouvé suffit : on ne dresse pas la liste des reproches.
 */
export function detecterCoordonnees(texte: string): TypeCoordonnee | null {
  const valeur = String(texte || '');
  if (!valeur.trim()) return null;

  if (MOTIFS_LIEN.some((motif) => motif.test(valeur))) return 'lien';

  // Les chiffres sont comptés à part : le motif accepte des séparateurs, donc
  // « 1 2 3 4 5 6 7 8 » compte autant qu'un numéro écrit d'un trait — et c'est
  // volontaire, c'est exactement ainsi qu'on déguise un numéro.
  for (const suite of valeur.match(MOTIF_TELEPHONE) || []) {
    if (MOTIF_DATE_SEULE.test(suite)) continue;
    if ((suite.match(/\d/g) || []).length >= 8) return 'telephone';
  }

  return null;
}
