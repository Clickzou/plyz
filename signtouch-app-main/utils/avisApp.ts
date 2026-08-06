import { Platform, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// DEMANDE D'AVIS — réservée aux utilisateurs ACTIFS.
//
// Demander un avis à quelqu'un qui vient d'ouvrir l'app, c'est récolter des
// « 1 étoile, je ne sais pas à quoi ça sert ». On ne demande donc qu'après des
// prestations réellement MENÉES À TERME : une dédicace reçue, un appel vidéo
// achevé, un événement terminé. Côté fan comme côté personnalité.
//
// Le compteur est local à l'appareil : il n'a pas besoin d'être exact ni
// partagé, seulement de refléter un usage réel sur CE téléphone.

const CLE_PRESTATIONS = '@plyz_prestations_reussies';
const CLE_DERNIERE_DEMANDE = '@plyz_avis_demande_le';
const CLE_AVIS_DONNE = '@plyz_avis_donne';

// Nombre de prestations abouties avant la première demande. Deux plutôt qu'une :
// la première peut être un essai, la seconde marque un usage installé.
const SEUIL_PRESTATIONS = 2;
// Un refus se respecte : on ne repose pas la question avant deux mois.
const DELAI_NOUVELLE_DEMANDE_MS = 60 * 24 * 60 * 60 * 1000;

/** À appeler quand une prestation s'achève vraiment (des deux côtés). */
export async function marquerPrestationReussie(): Promise<void> {
  try {
    const n = Number((await AsyncStorage.getItem(CLE_PRESTATIONS)) || '0');
    await AsyncStorage.setItem(CLE_PRESTATIONS, String(n + 1));
  } catch {
    /* pas bloquant : au pire l'avis sera demandé plus tard */
  }
}

/** Faut-il proposer de laisser un avis maintenant ? */
export async function peutDemanderAvis(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    if ((await AsyncStorage.getItem(CLE_AVIS_DONNE)) === '1') return false;

    const n = Number((await AsyncStorage.getItem(CLE_PRESTATIONS)) || '0');
    if (n < SEUIL_PRESTATIONS) return false;

    const dernier = await AsyncStorage.getItem(CLE_DERNIERE_DEMANDE);
    if (dernier && Date.now() - Number(dernier) < DELAI_NOUVELLE_DEMANDE_MS) return false;

    return true;
  } catch {
    return false;
  }
}

export async function noterDemandeFaite(): Promise<void> {
  try { await AsyncStorage.setItem(CLE_DERNIERE_DEMANDE, String(Date.now())); } catch {}
}

export async function noterAvisDonne(): Promise<void> {
  try { await AsyncStorage.setItem(CLE_AVIS_DONNE, '1'); } catch {}
}

// Fiche de l'app sur chaque magasin. L'identifiant Apple est celui de la fiche
// App Store Connect ; le nom de paquet Android, celui de app.json.
const LIEN_STORE = Platform.select({
  ios: 'https://apps.apple.com/app/id6788523821?action=write-review',
  android: 'https://play.google.com/store/apps/details?id=com.plyz.app',
  default: 'https://plyz.io',
}) as string;

/**
 * Ouvre la fenêtre d'avis. On passe D'ABORD par l'API native du système
 * (`expo-store-review`) : Apple l'impose — la note se donne sans quitter
 * l'app — et Google la recommande. Le lien vers la fiche du magasin ne sert
 * que de repli, quand cette fenêtre n'est pas disponible (magasin absent,
 * quota annuel Apple déjà atteint, build de développement).
 */
export async function ouvrirAvis(): Promise<void> {
  await noterDemandeFaite();
  try {
    // Chargement paresseux : le module est natif et absent sur le web.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const StoreReview = require('expo-store-review');
    if (StoreReview?.isAvailableAsync && (await StoreReview.isAvailableAsync())) {
      await StoreReview.requestReview();
      await noterAvisDonne();
      return;
    }
  } catch {
    /* on bascule sur la fiche du magasin */
  }
  try {
    await Linking.openURL(LIEN_STORE);
    await noterAvisDonne();
  } catch {
    /* rien de plus à tenter */
  }
}
