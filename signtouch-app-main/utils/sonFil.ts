import { useSyncExternalStore } from 'react';

/**
 * Son des vidéos du fil : un réglage unique, valable pour toutes les cartes.
 *
 * Comme sur Instagram : couper ou remettre le son sur une vidéo vaut pour les
 * suivantes. Régler chaque vidéo l'une après l'autre pendant qu'on fait défiler
 * est une corvée — et le fan qui vient d'entendre la première s'attend à
 * entendre la deuxième.
 *
 * Volontairement NON persisté : au lancement suivant, le fil repart en
 * sourdine. Une app qui se met à parler toute seule à l'ouverture, dans un
 * train ou une salle d'attente, se fait fermer.
 */
let sonActif = false;
const listeners = new Set<() => void>();

export function getSonFil() {
  return sonActif;
}

export function setSonFil(actif: boolean) {
  if (sonActif === actif) return;
  sonActif = actif;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useSonFil() {
  return useSyncExternalStore(subscribe, getSonFil, getSonFil);
}
