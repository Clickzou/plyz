import AsyncStorage from '@react-native-async-storage/async-storage';

const TRIAL_START_KEY = '@signtouch_trial_start';
const FIRST_PHOTO_SAVED_KEY = '@signtouch_first_photo_saved';
const TRIAL_DAYS = 7;

export interface TrialStatus {
  isActive: boolean;
  daysRemaining: number;
  isExpired: boolean;
  trialStartDate: string | null;
  hasFirstPhotoSaved: boolean;
}

export const startTrial = async (): Promise<void> => {
  const existing = await AsyncStorage.getItem(TRIAL_START_KEY);
  if (!existing) {
    await AsyncStorage.setItem(TRIAL_START_KEY, new Date().toISOString());
  }
};

export const getTrialStatus = async (): Promise<TrialStatus> => {
  try {
    const trialStart = await AsyncStorage.getItem(TRIAL_START_KEY);
    const firstPhotoSaved = await AsyncStorage.getItem(FIRST_PHOTO_SAVED_KEY);
    
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

export const markFirstPhotoSaved = async (): Promise<void> => {
  const existing = await AsyncStorage.getItem(FIRST_PHOTO_SAVED_KEY);
  if (!existing) {
    await AsyncStorage.setItem(FIRST_PHOTO_SAVED_KEY, 'true');
    await startTrial();
  }
};

export const hasFirstPhotoBeenSaved = async (): Promise<boolean> => {
  const value = await AsyncStorage.getItem(FIRST_PHOTO_SAVED_KEY);
  return value === 'true';
};

export const clearTrialData = async (): Promise<void> => {
  await AsyncStorage.multiRemove([TRIAL_START_KEY, FIRST_PHOTO_SAVED_KEY]);
};
