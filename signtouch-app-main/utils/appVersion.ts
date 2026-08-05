import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Version réellement embarquée dans la build en cours d'exécution.
 *
 * expo-constants expose le manifeste figé au moment de la compilation : ces
 * valeurs suivent donc `app.json` build après build. C'est indispensable car le
 * nom de version ne change pas à chaque publication (les versionCode Android 11
 * et 15 s'appellent tous les deux « 1.0.0 ») : seul le numéro de build permet de
 * distinguer deux livraisons.
 */
const config = Constants.expoConfig;

/** Nom de version public, ex. « 1.0.1 ». */
export const APP_VERSION = config?.version ?? '?';

/** Numéro de build interne : versionCode sur Android, buildNumber sur iOS. Null sur le web. */
export const APP_BUILD: string | null = (() => {
  const raw = Platform.select<string | number | undefined>({
    ios: config?.ios?.buildNumber,
    android: config?.android?.versionCode,
    default: undefined,
  });
  return raw == null ? null : String(raw);
})();

/** Ex. « 1.0.1 (16) », ou « 1.0.1 » sur le web où la notion de build n'existe pas. */
export const APP_VERSION_FULL = APP_BUILD ? `${APP_VERSION} (${APP_BUILD})` : APP_VERSION;
