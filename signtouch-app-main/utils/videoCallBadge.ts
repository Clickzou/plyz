import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { authedFetch } from '@/utils/authedFetch';

const API_BASE = process.env.EXPO_PUBLIC_STRIPE_SERVER_URL || '';

// Compteur partagé des appels vidéo privés encore ouverts, affiché en pastille
// sur l'onglet Événements. Il vit ici plutôt que dans chaque écran : la barre de
// navigation est présente partout, et sans état commun chaque page referait la
// même requête.
//
// La COULEUR dit qui doit agir, pas seulement où en est le dossier :
//   rouge  → rien n'a bougé (le fan attend une réponse, la star doit répondre)
//   vert   → c'est validé, la suite appartient à quelqu'un
// Et `aAgir` déclenche la pulsation quand c'est à CET utilisateur de jouer.

export type BadgeAppelsVideo = {
  total: number;
  couleur: '#ef4444' | '#10b981';
  aAgir: boolean;
};

const VIDE: BadgeAppelsVideo = { total: 0, couleur: '#ef4444', aAgir: false };

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

    // À traiter : la star a une demande sur les bras, ou le fan un créneau
    // accepté qu'il n'a pas encore réglé. Dans les deux cas, un délai court.
    const aAgir = ouverts.some((r: any) =>
      (r.role === 'celebrity' && r.status === 'pending') ||
      (r.role === 'fan' && r.status === 'accepted')
    );
    const valide = ouverts.some((r: any) => r.status === 'accepted' || r.status === 'paid');

    cache = {
      total: ouverts.length,
      couleur: valide ? '#10b981' : '#ef4444',
      aAgir,
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
