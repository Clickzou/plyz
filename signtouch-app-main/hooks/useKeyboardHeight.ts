import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/**
 * Hauteur du clavier à l'écran, en pixels — 0 quand il est fermé.
 *
 * Pourquoi ce hook plutôt que `KeyboardAvoidingView` : sur Android, une
 * `<Modal>` React Native s'ouvre dans SA PROPRE fenêtre, qui n'hérite pas du
 * redimensionnement automatique de l'écran principal. Le clavier se pose alors
 * par-dessus la fenêtre : on ne voit plus ni ce qu'on écrit, ni le bouton
 * d'envoi. `KeyboardAvoidingView` n'y peut rien — son `behavior` vaut
 * `undefined` sur Android, c'est-à-dire « ne fais rien ».
 *
 * Avec la hauteur réelle du clavier, chaque écran décide lui-même : décaler la
 * feuille, réduire sa hauteur, ou ajouter une marge sous le champ.
 */
export function useKeyboardHeight() {
  const [hauteur, setHauteur] = useState(0);

  useEffect(() => {
    // iOS annonce le clavier AVANT de l'afficher (`Will`), ce qui laisse le
    // temps d'accompagner l'animation. Android ne connaît que `Did`.
    const evtAffiche = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const evtCache = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const abonneAffiche = Keyboard.addListener(evtAffiche, e => {
      setHauteur(e.endCoordinates?.height ?? 0);
    });
    const abonneCache = Keyboard.addListener(evtCache, () => setHauteur(0));

    return () => {
      abonneAffiche.remove();
      abonneCache.remove();
    };
  }, []);

  return hauteur;
}
