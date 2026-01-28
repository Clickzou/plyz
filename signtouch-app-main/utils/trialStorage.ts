import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

const TRIAL_START_KEY = '@signtouch_trial_start';
const FIRST_PHOTO_SAVED_KEY = '@signtouch_first_photo_saved';
const DEVICE_ID_KEY = '@signtouch_device_id';
const TRIAL_DAYS = 7;

export interface TrialStatus {
  isActive: boolean;
  daysRemaining: number;
  isExpired: boolean;
  trialStartDate: string | null;
  hasFirstPhotoSaved: boolean;
}

const getDeviceId = async (): Promise<string> => {
  let deviceId = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = 'device_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
    await AsyncStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
};

const syncTrialFromServer = async (userId: string | null): Promise<string | null> => {
  try {
    const deviceId = await getDeviceId();
    
    let trialRecord = null;
    
    const { data: deviceTrial } = await supabase
      .from('device_trials')
      .select('trial_start_date')
      .eq('device_id', deviceId)
      .single();
    
    if (deviceTrial) {
      trialRecord = deviceTrial;
    } else if (userId) {
      const { data: userTrial } = await supabase
        .from('device_trials')
        .select('trial_start_date')
        .eq('user_id', userId)
        .single();
      trialRecord = userTrial;
    }
    
    if (trialRecord?.trial_start_date) {
      await AsyncStorage.setItem(TRIAL_START_KEY, trialRecord.trial_start_date);
      await AsyncStorage.setItem(FIRST_PHOTO_SAVED_KEY, 'true');
      return trialRecord.trial_start_date;
    }
    
    return null;
  } catch (error) {
    console.error('Error syncing trial from server:', error);
    return null;
  }
};

const saveTrialToServer = async (userId: string | null, trialStartDate: string): Promise<void> => {
  try {
    const deviceId = await getDeviceId();
    
    const { error } = await supabase
      .from('device_trials')
      .upsert({
        device_id: deviceId,
        user_id: userId || null,
        trial_start_date: trialStartDate,
        first_photo_saved_at: new Date().toISOString(),
      }, {
        onConflict: userId ? 'user_id' : 'device_id',
      });
    
    if (error) {
      console.error('Error saving trial to server:', error);
    }
  } catch (error) {
    console.error('Error saving trial to server:', error);
  }
};

export const startTrial = async (userId: string | null = null): Promise<void> => {
  const existing = await AsyncStorage.getItem(TRIAL_START_KEY);
  if (!existing) {
    const serverTrial = await syncTrialFromServer(userId);
    if (serverTrial) {
      return;
    }
    
    const trialStartDate = new Date().toISOString();
    await AsyncStorage.setItem(TRIAL_START_KEY, trialStartDate);
    await saveTrialToServer(userId, trialStartDate);
  }
};

export const getTrialStatus = async (userId: string | null = null): Promise<TrialStatus> => {
  try {
    let trialStart = await AsyncStorage.getItem(TRIAL_START_KEY);
    const firstPhotoSaved = await AsyncStorage.getItem(FIRST_PHOTO_SAVED_KEY);
    
    if (!trialStart && firstPhotoSaved === 'true') {
      const serverTrial = await syncTrialFromServer(userId);
      if (serverTrial) {
        trialStart = serverTrial;
      }
    }
    
    if (!trialStart) {
      return {
        isActive: false,
        daysRemaining: TRIAL_DAYS,
        isExpired: false,
        trialStartDate: null,
        hasFirstPhotoSaved: firstPhotoSaved === 'true',
      };
    }
    
    const startDate = new Date(trialStart);
    const now = new Date();
    const diffTime = now.getTime() - startDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const daysRemaining = Math.max(0, TRIAL_DAYS - diffDays);
    
    return {
      isActive: daysRemaining > 0,
      daysRemaining,
      isExpired: daysRemaining <= 0,
      trialStartDate: trialStart,
      hasFirstPhotoSaved: firstPhotoSaved === 'true',
    };
  } catch (error) {
    console.error('Error getting trial status:', error);
    return {
      isActive: false,
      daysRemaining: TRIAL_DAYS,
      isExpired: false,
      trialStartDate: null,
      hasFirstPhotoSaved: false,
    };
  }
};

export const markFirstPhotoSaved = async (userId: string | null = null): Promise<void> => {
  console.log('[Trial] markFirstPhotoSaved called with userId:', userId);
  const existing = await AsyncStorage.getItem(FIRST_PHOTO_SAVED_KEY);
  console.log('[Trial] Existing value:', existing);
  if (!existing) {
    await AsyncStorage.setItem(FIRST_PHOTO_SAVED_KEY, 'true');
    console.log('[Trial] Set FIRST_PHOTO_SAVED_KEY to true');
    await startTrial(userId);
    console.log('[Trial] Trial started');
  }
};

export const hasFirstPhotoBeenSaved = async (): Promise<boolean> => {
  const value = await AsyncStorage.getItem(FIRST_PHOTO_SAVED_KEY);
  return value === 'true';
};

export const linkTrialToUser = async (userId: string): Promise<void> => {
  try {
    const deviceId = await getDeviceId();
    const trialStart = await AsyncStorage.getItem(TRIAL_START_KEY);
    
    if (trialStart) {
      await supabase
        .from('device_trials')
        .upsert({
          device_id: deviceId,
          user_id: userId,
          trial_start_date: trialStart,
        }, {
          onConflict: 'user_id',
        });
    }
  } catch (error) {
    console.error('Error linking trial to user:', error);
  }
};

export const clearTrialData = async (): Promise<void> => {
  await AsyncStorage.multiRemove([TRIAL_START_KEY, FIRST_PHOTO_SAVED_KEY]);
};
