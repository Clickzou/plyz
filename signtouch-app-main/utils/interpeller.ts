import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Interpeller une personnalité chez elle.
 * ---------------------------------------------------------------------------
 *
 * Réclamer quelqu'un ne servait qu'à envoyer un lien Plyz à ses proches : la
 * personne concernée n'apprenait jamais que trois cents fans l'attendaient.
 * Ce fichier construit le geste manquant — écrire à la star, là où elle est.
 *
 * ⚠️ LE PIÈGE, DÉCOUVERT EN TESTANT : ouvrir `facebook.com/<page>` ne sert à
 * RIEN. Meta a fermé le mur des pages aux visiteurs il y a des années — on ne
 * peut qu'y lire. Il faut viser l'endroit où l'on peut écrire, jamais la page
 * d'accueil :
 *
 *   · X         → `intent/tweet` : le message est PRÉ-REMPLI avec la mention.
 *                 Un clic, c'est publié, et tous ses fans le voient.
 *   · Facebook  → `m.me/<page>` : la conversation Messenger s'ouvre.
 *   · Instagram → `ig.me/m/<compte>` : le message privé s'ouvre.
 *   · YouTube, TikTok, site → aucun moyen d'écrire par lien. On ouvre la
 *                 page et le message est copié : le fan le colle en
 *                 commentaire sous la dernière publication.
 *
 * X passe en tête parce qu'il est le seul à être PUBLIC et à n'exiger aucun
 * copier-coller — mais il suppose que le fan y ait un compte, ce qui est loin
 * d'être acquis. D'où la liste plutôt qu'une ouverture directe : le fan voit
 * en un coup d'œil ce qui lui est possible.
 */

export interface ReseauxStar {
  facebook?: string;
  instagram?: string;
  youtube?: string;
  x?: string;
  tiktok?: string;
  site?: string;
}

export type CleReseau = keyof ReseauxStar | 'recherche';

export interface Destination {
  cle: CleReseau;
  /** Ce que le fan lit sur le bouton. */
  titre: string;
  /** Ce qui l'attend derrière — dit avant, jamais découvert après. */
  detail: string;
  url: string;
  /** Le message part-il déjà écrit ? Sinon on le copie dans le presse-papier. */
  prerempli: boolean;
  /** Visible par les autres fans, ou seulement par la star. */
  public: boolean;
}

/** Le dernier segment d'une adresse : « https://x.com/OmarSy » → « OmarSy ». */
function identifiant(url?: string): string | null {
  if (!url) return null;
  const m = String(url).replace(/\/+$/, '').match(/\/([^/?#]+)(?:[?#].*)?$/);
  return m ? decodeURIComponent(m[1]).replace(/^@/, '') : null;
}

/** L'adresse publique de la fiche, celle qu'on met dans le message. */
export function lienReclamation(nom: string): string {
  return `https://plyz.io/reclame/${encodeURIComponent(nom)}`;
}

/**
 * Le message que le fan adresse à la personnalité.
 *
 * Il est fourni écrit, et volontairement chaleureux. Laisser chacun rédiger,
 * c'est prendre le risque qu'une invitation collective tourne au harcèlement —
 * et ce n'est pas parce qu'on n'a pas écrit le message qu'on n'en serait pas
 * responsable. Même principe que les vagues côté serveur.
 */
export function messageInterpellation(nom: string, fans: number, mention?: string | null): string {
  const debut = mention ? `@${mention} ` : `${nom}, `;
  const nombre = fans > 1
    ? `nous sommes déjà ${fans} à te réclamer sur Plyz !`
    : `je te réclame sur Plyz !`;
  return `${debut}${nombre} Viens nous faire des dédicaces et des appels vidéo 🙏 ${lienReclamation(nom)}`;
}

/**
 * Là où ce fan peut réellement écrire à cette personnalité, dans l'ordre.
 *
 * Une liste vide n'arrive jamais : faute de compte connu, on renvoie vers une
 * recherche à son nom. Un bouton qui ne fait rien vaut moins qu'un bouton qui
 * fait quelque chose d'imparfait.
 */
export function destinations(nom: string, fans: number, reseaux?: ReseauxStar | null): Destination[] {
  const r = reseaux || {};
  const liste: Destination[] = [];

  const pseudoX = identifiant(r.x);
  if (pseudoX) {
    liste.push({
      cle: 'x',
      titre: 'Publier sur X',
      detail: 'Ton message est déjà écrit. Tous ses fans le verront.',
      url: 'https://x.com/intent/tweet?text='
        + encodeURIComponent(messageInterpellation(nom, fans, pseudoX)),
      prerempli: true,
      public: true,
    });
  }

  const pageFb = identifiant(r.facebook);
  if (pageFb) {
    liste.push({
      cle: 'facebook',
      titre: 'Écrire sur Messenger',
      detail: 'Sa conversation Facebook s’ouvre, ton message est copié.',
      url: `https://m.me/${pageFb}`,
      prerempli: false,
      public: false,
    });
  }

  const compteIg = identifiant(r.instagram);
  if (compteIg) {
    liste.push({
      cle: 'instagram',
      titre: 'Message Instagram',
      detail: 'Sa messagerie s’ouvre, ton message est copié.',
      url: `https://ig.me/m/${compteIg}`,
      prerempli: false,
      public: false,
    });
  }

  if (r.youtube) {
    liste.push({
      cle: 'youtube',
      titre: 'Sa chaîne YouTube',
      detail: 'Colle ton message en commentaire de sa dernière vidéo.',
      url: r.youtube,
      prerempli: false,
      public: true,
    });
  }

  if (r.tiktok) {
    liste.push({
      cle: 'tiktok',
      titre: 'Son compte TikTok',
      detail: 'Colle ton message en commentaire de sa dernière vidéo.',
      url: r.tiktok,
      prerempli: false,
      public: true,
    });
  }

  if (r.site) {
    liste.push({
      cle: 'site',
      titre: 'Son site officiel',
      detail: 'Cherche sa page de contact et colle ton message.',
      url: r.site,
      prerempli: false,
      public: false,
    });
  }

  if (!liste.length) {
    // Aucun compte connu : plutôt qu'une impasse, on ouvre une recherche à son
    // nom. Le fan trouvera souvent en trois secondes ce que Wikidata ignore.
    liste.push({
      cle: 'recherche',
      titre: 'Trouver ses réseaux',
      detail: 'Nous ne connaissons pas encore ses comptes. Ton message est copié.',
      url: 'https://duckduckgo.com/?q=' + encodeURIComponent(`${nom} instagram facebook officiel`),
      prerempli: false,
      public: false,
    });
  }

  return liste;
}

/**
 * Le réseau que ce fan a utilisé la dernière fois.
 *
 * Un fan qui n'a pas de compte X ne veut pas revoir « Publier sur X » en tête
 * à chaque réclamation. On se souvient de son choix et on le remonte — sans
 * jamais retirer les autres : il peut changer d'avis, ou la star suivante peut
 * ne pas être là où était la précédente.
 */
const CLE_MEMOIRE = 'plyz.interpeller.reseau';

export async function reseauPrefere(): Promise<CleReseau | null> {
  try {
    return (await AsyncStorage.getItem(CLE_MEMOIRE)) as CleReseau | null;
  } catch {
    return null;
  }
}

export async function memoriserReseau(cle: CleReseau): Promise<void> {
  try {
    if (cle !== 'recherche') await AsyncStorage.setItem(CLE_MEMOIRE, cle);
  } catch { /* la mémoire du réseau n'est pas vitale */ }
}

export function trierParPreference(liste: Destination[], prefere: CleReseau | null): Destination[] {
  if (!prefere) return liste;
  const favori = liste.filter((d) => d.cle === prefere);
  return favori.length ? [...favori, ...liste.filter((d) => d.cle !== prefere)] : liste;
}
