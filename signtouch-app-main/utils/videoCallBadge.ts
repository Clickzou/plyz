import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { authedFetch } from '@/utils/authedFetch';

const API_BASE = process.env.EXPO_PUBLIC_STRIPE_SERVER_URL || '';

// Compteur partagé des appels vidéo privés encore ouverts, affiché en pastille
// sur l'onglet Événements. Il vit ici plutôt que dans chaque écran : la barre de
// navigation est présente partout, et sans état commun chaque page referait la
// même requête.
//
// La COULEUR est réservée au sens, du plus grave au plus banal :
//   rouge  → refusé, annulé ou expiré (une mauvaise nouvelle à ne pas manquer)
//   vert   → validé : un créneau existe
//   orange → en attente, rien n'a encore bougé
// Le rouge ne sert donc PAS à l'attente : gardé pour l'échec, il conserve sa
// force d'alerte. Et `aAgir` déclenche la pulsation quand c'est à CET
// utilisateur de jouer.

export type BadgeAppelsVideo = {
  total: number;
  couleur: '#ef4444' | '#10b981' | '#f59e0b';
  aAgir: boolean;
};

const VIDE: BadgeAppelsVideo = { total: 0, couleur: '#f59e0b', aAgir: false };

// Une demande close reste signalée 48 h : assez pour que l'intéressé
// l'apprenne, pas au point que la pastille reste rouge indéfiniment.
const DELAI_MAUVAISE_NOUVELLE_MS = 48 * 60 * 60 * 1000;

// Un seul appel réseau alimente tous les abonnés (la barre est montée sur
// chaque écran ; sans ça, changer de page relancerait autant de requêtes).
let cache: BadgeAppelsVideo = VIDE;
let abonnes: Array<(b: BadgeAppelsVideo) => void> = [];
let dernierAppel = 0;

async function rafraichir(force = false) {
  if (!API_BASE) return;
  // 30 s de garde : un aller-retour entre deux onglets ne doit pas marteler
  // le serveur, mais une action de l'utilisateur (force) passe toujours.
  if (!force && Date.now() - dernierAppel < 30_000) return;
  dernierAppel = Date.now();
  try {
    const res = await authedFetch(`${API_BASE}/api/video-call-requests`);
    if (!res.ok) return; // non connecté (401) : on garde la valeur précédente
    const { requests } = await res.json();
    if (!Array.isArray(requests)) return;

    const ouverts = requests.filter((r: any) =>
      ['pending', 'accepted', 'paid'].includes(r.status)
    );

    // Les mauvaises nouvelles récentes comptent aussi : un refus ou une
    // annulation qui ne s'affiche nulle part laisse le fan attendre un appel
    // qui n'aura jamais lieu.
    const maintenant = Date.now();
    const closesRecentes = requests.filter((r: any) => {
      if (!['refused', 'cancelled', 'expired'].includes(r.status)) return false;
      const ref = r.updated_at || r.created_at;
      if (!ref) return false;
      return maintenant - new Date(ref).getTime() < DELAI_MAUVAISE_NOUVELLE_MS;
    });

    // À traiter : la star a une demande sur les bras, ou le fan un créneau
    // accepté qu'il n'a pas encore réglé. Dans les deux cas, un délai court.
    const aTraiter = ouverts.filter((r: any) =>
      (r.role === 'celebrity' && r.status === 'pending') ||
      (r.role === 'fan' && r.status === 'accepted')
    );
    const valide = ouverts.some((r: any) => r.status === 'accepted' || r.status === 'paid');

    // Priorité : une mauvaise nouvelle prime sur tout le reste, sinon on montre
    // le meilleur état atteint (validé), et à défaut la simple attente.
    const couleur: BadgeAppelsVideo['couleur'] =
      closesRecentes.length > 0 ? '#ef4444' : valide ? '#10b981' : '#f59e0b';

    // Le NOMBRE ne compte que ce qui demande une action. Il additionnait tout —
    // demandes ouvertes ET annulations récentes — et affichait « 4 » quand une
    // seule chose attendait vraiment : un compteur auquel on ne se fie plus est
    // un compteur qu'on cesse de regarder. Les annulations restent visibles
    // dans l'écran des appels vidéo, et gardent la pastille en rouge.
    cache = {
      total: aTraiter.length,
      couleur,
      aAgir: aTraiter.length > 0,
    };
    abonnes.forEach((f) => f(cache));
  } catch {
    /* réseau indisponible : la pastille garde sa dernière valeur connue plutôt
       que de disparaître, ce qui laisserait croire qu'il n'y a plus rien. */
  }
}

export function rafraichirBadgeAppelsVideo() {
  return rafraichir(true);
}

export function useBadgeAppelsVideo(): BadgeAppelsVideo {
  const [badge, setBadge] = useState<BadgeAppelsVideo>(cache);

  useEffect(() => {
    abonnes.push(setBadge);
    rafraichir();

    // Au retour d'arrière-plan : la célébrité a pu répondre pendant ce temps.
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') rafraichir();
    });

    return () => {
      abonnes = abonnes.filter((f) => f !== setBadge);
      sub.remove();
    };
  }, []);

  return badge;
}
