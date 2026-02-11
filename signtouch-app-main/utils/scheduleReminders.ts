import { Platform } from 'react-native';

let Notifications: any = null;
try {
  Notifications = require('expo-notifications');
} catch {}

export interface ReminderOptions {
  eventName: string;
  scheduledAt: string;
  eventCode?: string;
  eventId?: string;
  type: 'live_session' | 'event';
}

export async function scheduleCelebrityReminders(options: ReminderOptions): Promise<boolean> {
  if (!Notifications || Platform.OS === 'web') {
    return false;
  }

  try {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') {
      return false;
    }

    const startTime = new Date(options.scheduledAt).getTime();
    const now = Date.now();

    const oneHourBefore = startTime - 60 * 60 * 1000;
    if (oneHourBefore > now) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: `${options.eventName} - SignTouch`,
          body: options.type === 'live_session'
            ? 'Votre session live commence dans 1 heure ! Préparez-vous.'
            : 'Votre événement commence dans 1 heure ! Préparez-vous.',
          data: { code: options.eventCode, id: options.eventId, type: options.type },
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(oneHourBefore),
        },
      });
    }

    const twoMinBefore = startTime - 2 * 60 * 1000;
    if (twoMinBefore > now) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: `${options.eventName} - SignTouch`,
          body: options.type === 'live_session'
            ? 'Votre session live commence dans 2 minutes ! Ouvrez l\'app maintenant.'
            : 'Votre événement commence dans 2 minutes ! Ouvrez l\'app maintenant.',
          data: { code: options.eventCode, id: options.eventId, type: options.type },
          sound: true,
          priority: Notifications.AndroidNotificationPriority?.MAX,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(twoMinBefore),
        },
      });
    }

    return true;
  } catch (error) {
    console.error('[scheduleReminders] Error:', error);
    return false;
  }
}
