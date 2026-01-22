import AsyncStorage from '@react-native-async-storage/async-storage';

const ACCOUNT_PROMPT_SNOOZE_KEY = '@account_prompt_snooze_until';

const SEVEN_DAYS_IN_MS = 7 * 24 * 60 * 60 * 1000;

export async function setAccountPromptSnooze(): Promise<void> {
  try {
    const snoozeUntil = Date.now() + SEVEN_DAYS_IN_MS;
    await AsyncStorage.setItem(ACCOUNT_PROMPT_SNOOZE_KEY, snoozeUntil.toString());
    console.log('[PostPurchaseAccount] Snooze set until:', new Date(snoozeUntil).toISOString());
  } catch (error) {
    console.error('[PostPurchaseAccount] Error setting snooze:', error);
  }
}

export async function getAccountPromptSnoozeUntil(): Promise<number | null> {
  try {
    const value = await AsyncStorage.getItem(ACCOUNT_PROMPT_SNOOZE_KEY);
    if (value === null) {
      return null;
    }
    return parseInt(value, 10);
  } catch (error) {
    console.error('[PostPurchaseAccount] Error getting snooze:', error);
    return null;
  }
}

export async function clearAccountPromptSnooze(): Promise<void> {
  try {
    await AsyncStorage.removeItem(ACCOUNT_PROMPT_SNOOZE_KEY);
    console.log('[PostPurchaseAccount] Snooze cleared');
  } catch (error) {
    console.error('[PostPurchaseAccount] Error clearing snooze:', error);
  }
}

export async function isAccountPromptSnoozed(): Promise<boolean> {
  try {
    const snoozeUntil = await getAccountPromptSnoozeUntil();
    if (snoozeUntil === null) {
      return false;
    }

    const now = Date.now();
    const isSnoozed = now < snoozeUntil;

    if (!isSnoozed) {
      await clearAccountPromptSnooze();
    }

    return isSnoozed;
  } catch (error) {
    console.error('[PostPurchaseAccount] Error checking snooze:', error);
    return false;
  }
}
