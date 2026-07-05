import { Platform } from 'react-native';

// expo-notifications est chargé en lazy (require) pour rester compatible web,
// où le module n'existe pas. Même pattern que dans join-event.tsx.
let Notifications: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Notifications = require('expo-notifications');
} catch {
  Notifications = null;
}

// ID du canal Android utilisé pour TOUTES les push (file d'attente, "c'est ton
// tour", dédicace...). Doit être identique au `channelId` envoyé dans le payload
// push (voir sessionQueueStorage.sendQueueNotification).
export const DEFAULT_CHANNEL_ID = 'default';

let channelsReady = false;
let handlerSet = false;

/**
 * Configure le handler de notifications (comportement quand une push arrive
 * APP OUVERTE) : on veut son + alerte + badge. App FERMÉE, c'est Android/iOS qui
 * gère via le canal + le payload, pas ce handler.
 */
export function configureNotificationHandler(): void {
  if (handlerSet || !Notifications?.setNotificationHandler) return;
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });
    handlerSet = true;
  } catch {
    // pas bloquant
  }
}

/**
 * Crée le canal de notification Android avec son + vibration + importance HAUTE.
 * INDISPENSABLE pour que la push fasse du bruit et vibre MÊME APP FERMÉE sur
 * Android 8+ (le son/vibration sont une propriété du canal, pas du payload).
 * No-op sur iOS/web. Idempotent.
 */
export async function ensureNotificationChannels(): Promise<void> {
  if (channelsReady) return;
  if (Platform.OS !== 'android') {
    channelsReady = true;
    return;
  }
  if (!Notifications?.setNotificationChannelAsync) return;
  try {
    await Notifications.setNotificationChannelAsync(DEFAULT_CHANNEL_ID, {
      name: 'Notifications Plyz',
      importance: Notifications.AndroidImportance?.HIGH ?? 4,
      vibrationPattern: [0, 250, 250, 250],
      sound: 'default',
      enableVibrate: true,
      lockscreenVisibility:
        Notifications.AndroidNotificationVisibility?.PUBLIC ?? 1,
      bypassDnd: false,
    });
    channelsReady = true;
  } catch {
    // pas bloquant
  }
}

/**
 * Initialisation globale des notifications : à appeler une fois au démarrage de
 * l'app (handler + canal Android). Idempotent et safe sur web.
 */
export async function initNotifications(): Promise<void> {
  configureNotificationHandler();
  await ensureNotificationChannels();
}

const PUSH_API_BASE = process.env.EXPO_PUBLIC_STRIPE_SERVER_URL || '';

/** Récupère le token push Expo du fan (best-effort, mobile uniquement). null sur web/refus. */
export async function getExpoPushToken(): Promise<string | null> {
  try {
    if (Platform.OS === 'web' || !Notifications) return null;
    const perm = await Notifications.getPermissionsAsync();
    let status = perm?.status;
    if (status !== 'granted') {
      const r = await Notifications.requestPermissionsAsync();
      status = r?.status;
    }
    if (status !== 'granted') return null;
    const d = await Notifications.getExpoPushTokenAsync();
    return d?.data || null;
  } catch {
    return null;
  }
}

/**
 * Enregistre le token push Expo de l'utilisateur connecté côté serveur
 * (table user_push_tokens) pour qu'il puisse recevoir les notifications même
 * app fermée (compte validé, rappels d'événement...). Best-effort, safe sur web.
 */
export async function registerPushTokenWithServer(accessToken: string | null | undefined): Promise<void> {
  if (Platform.OS === 'web' || !Notifications || !accessToken) return;
  try {
    const perm = await Notifications.getPermissionsAsync();
    let status = perm?.status;
    if (status !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      status = req?.status;
    }
    if (status !== 'granted') return;
    const tokenData = await Notifications.getExpoPushTokenAsync();
    const token = tokenData?.data;
    if (!token) return;
    await fetch(`${PUSH_API_BASE}/api/register-push-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ token, platform: Platform.OS }),
    });
  } catch {
    // best-effort, ne bloque jamais l'app
  }
}
