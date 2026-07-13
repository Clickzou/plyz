// Géofence pour les événements de dédicace EN PERSONNE (concert, salon, stade…).
//
// Contexte conformité : une dédicace payante livrée à distance serait du « contenu
// numérique » (Apple exigerait l'In-App Purchase). En la réservant aux fans
// PHYSIQUEMENT présents sur le lieu, l'événement devient un service du monde réel
// (guideline Apple 3.1.3), qui doit au contraire utiliser un paiement externe (Stripe).
// La géolocalisation prouve et impose cette présence physique.
import { Platform } from 'react-native';

export interface Coords {
  latitude: number;
  longitude: number;
}

export type GeofenceReason =
  | 'permission_denied'
  | 'unavailable'
  | 'too_far'
  | 'no_event_location';

export interface GeofenceResult {
  ok: boolean;
  reason?: GeofenceReason;
  /** Distance mesurée entre le fan et l'événement, en mètres. */
  distanceM?: number;
}

// Rayon (m) au-delà duquel on considère l'événement comme « démo / test reviewer »
// et où le géofence est bypassé (Apple ne peut pas tester sur place).
export const GEOFENCE_BYPASS_THRESHOLD_M = 100000; // 100 km

/** Distance en mètres entre deux points GPS (formule de Haversine). */
export function distanceMeters(a: Coords, b: Coords): number {
  const R = 6371000; // rayon terrestre moyen en mètres
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Position GPS actuelle de l'appareil. Renvoie `coords: null` + une raison si
 * indisponible ou refusée. Utilise navigator.geolocation sur le web et
 * expo-location sur mobile (import dynamique pour ne pas alourdir le bundle web).
 */
export async function getCurrentCoords(): Promise<{
  coords: Coords | null;
  reason?: GeofenceReason;
}> {
  try {
    if (Platform.OS === 'web') {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        return { coords: null, reason: 'unavailable' };
      }
      return await new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (pos) =>
            resolve({
              coords: {
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
              },
            }),
          () => resolve({ coords: null, reason: 'permission_denied' }),
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
        );
      });
    }

    const Location = await import('expo-location');
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      return { coords: null, reason: 'permission_denied' };
    }
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return {
      coords: {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      },
    };
  } catch (e) {
    console.warn('[geofence] getCurrentCoords error:', e);
    return { coords: null, reason: 'unavailable' };
  }
}

/**
 * Vérifie que le fan est physiquement dans le rayon autorisé autour de
 * l'événement. Un rayon >= GEOFENCE_BYPASS_THRESHOLD_M désigne un événement
 * démo (accès reviewer) et passe toujours.
 */
export async function verifyWithinEvent(
  eventCoords: Coords | null | undefined,
  radiusM: number
): Promise<GeofenceResult> {
  if (
    !eventCoords ||
    eventCoords.latitude == null ||
    eventCoords.longitude == null ||
    Number.isNaN(eventCoords.latitude) ||
    Number.isNaN(eventCoords.longitude)
  ) {
    return { ok: false, reason: 'no_event_location' };
  }

  const { coords, reason } = await getCurrentCoords();
  if (!coords) return { ok: false, reason: reason || 'unavailable' };

  const distanceM = distanceMeters(coords, eventCoords);

  // Événement démo / reviewer : rayon volontairement énorme → toujours autorisé.
  if (radiusM >= GEOFENCE_BYPASS_THRESHOLD_M) {
    return { ok: true, distanceM };
  }

  return {
    ok: distanceM <= radiusM,
    reason: distanceM <= radiusM ? undefined : 'too_far',
    distanceM,
  };
}
