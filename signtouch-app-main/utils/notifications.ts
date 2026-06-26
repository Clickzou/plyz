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
