import { useSyncExternalStore } from 'react';

/**
 * Vrai tant que la vidéo de bienvenue occupe l'écran.
 *
 * Sur Android, le lecteur vidéo natif dessine sa surface AU-DESSUS de la
 * hiérarchie des vues : ni `zIndex` ni `elevation` ne la font passer derrière.
 * Une vidéo du mur qui se met à jouer sous le splash apparaît donc par-dessus
 * la vidéo d'accueil, au milieu de l'écran. On ne monte simplement aucun
 * lecteur du fil tant que le splash est là — au passage, plus rien ne consomme
 * batterie ni données pendant l'accueil.
 */
let splashVisible = true;
const listeners = new Set<() => void>();

export function setSplashVisible(visible: boolean) {
  if (splashVisible === visible) return;
  splashVisible = visible;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return splashVisible;
}

export function useSplashVisible() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
