import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { getOrCreateDeviceId } from './ratingsStorage';

const KEY = '@plyz_age_certified';

// L'utilisateur a-t-il déjà certifié sa majorité (sur cet appareil) ?
export const isAgeCertified = async (): Promise<boolean> => {
  try {
    return (await AsyncStorage.getItem(KEY)) === 'true';
  } catch {
    return false;
  }
};

// Enregistre la certification : localement (pour ne plus redemander) + en base (preuve).
export const certifyAge = async (userId: string | null, email: string | null): Promise<void> => {
  try {
    await AsyncStorage.setItem(KEY, 'true');
  } catch {
    /* non bloquant */
  }
  try {
    const deviceId = await getOrCreateDeviceId();
    await supabase.from('age_certifications').insert({
      user_id: userId,
      device_id: deviceId,
      email,
    });
  } catch (e) {
    console.error('[ageCertification] insert error:', e);
  }
};
