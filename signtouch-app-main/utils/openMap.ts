import { Linking, Platform } from 'react-native';

/**
 * Ouvre le lieu d'un événement dans l'application de cartes de l'appareil.
 *
 * Une dédicace se passe EN PERSONNE : le fan doit être sur place (moins d'1 km)
 * pour la recevoir. Afficher le nom du lieu ne suffit pas — « 18, L'Escala » ne
 * dit pas comment s'y rendre. On privilégie les coordonnées GPS quand elles
 * existent (le nom relevé automatiquement est parfois approximatif), sinon on
 * cherche le nom du lieu.
 */
export const openEventLocation = async (
  location?: string | null,
  latitude?: number | null,
  longitude?: number | null,
): Promise<void> => {
  const label = location || 'Plyz';
  const hasCoords = typeof latitude === 'number' && typeof longitude === 'number';

  if (!hasCoords && !location) return;

  const webUrl = hasCoords
    ? `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location!)}`;

  if (Platform.OS === 'web' || !hasCoords) {
    try { await Linking.openURL(webUrl); } catch {}
    return;
  }

  // Application native de cartes (Plans sur iOS, Google Maps sur Android).
  const nativeUrl = Platform.OS === 'ios'
    ? `maps://?ll=${latitude},${longitude}&q=${encodeURIComponent(label)}`
    : `geo:${latitude},${longitude}?q=${latitude},${longitude}(${encodeURIComponent(label)})`;

  try {
    const supported = await Linking.canOpenURL(nativeUrl);
    // Sans repli, un appareil sans app de cartes n'ouvrait RIEN, sans un mot.
    await Linking.openURL(supported ? nativeUrl : webUrl);
  } catch {
    try { await Linking.openURL(webUrl); } catch {}
  }
};
