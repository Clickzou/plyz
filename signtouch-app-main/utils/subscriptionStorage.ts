import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

export type SubscriptionStatus = 'free' | 'paid';

const SUBSCRIPTION_STATUS_KEY = 'subscription_status';
const LAST_SUBSCRIPTION_OFFER_KEY = 'last_subscription_offer';

export async function getSubscriptionStatus(): Promise<SubscriptionStatus> {
  try {
    if (Platform.OS === 'web') {
      const stored = localStorage.getItem(SUBSCRIPTION_STATUS_KEY);
      return (stored as SubscriptionStatus) || 'free';
    } else {
      const stored = await AsyncStorage.getItem(SUBSCRIPTION_STATUS_KEY);
      return (stored as SubscriptionStatus) || 'free';
    }
  } catch (error) {
    console.error('Error getting subscription status:', error);
    return 'free';
  }
}

export async function setSubscriptionStatus(status: SubscriptionStatus): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      localStorage.setItem(SUBSCRIPTION_STATUS_KEY, status);
    } else {
      await AsyncStorage.setItem(SUBSCRIPTION_STATUS_KEY, status);
    }
  } catch (error) {
    console.error('Error setting subscription status:', error);
  }
}

export async function getLastSubscriptionOfferDate(): Promise<number | null> {
  try {
    if (Platform.OS === 'web') {
      const stored = localStorage.getItem(LAST_SUBSCRIPTION_OFFER_KEY);
      return stored ? parseInt(stored, 10) : null;
    } else {
      const stored = await AsyncStorage.getItem(LAST_SUBSCRIPTION_OFFER_KEY);
      return stored ? parseInt(stored, 10) : null;
    }
  } catch (error) {
    console.error('Error getting last subscription offer date:', error);
    return null;
  }
}

export async function setLastSubscriptionOfferDate(timestamp: number): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      localStorage.setItem(LAST_SUBSCRIPTION_OFFER_KEY, timestamp.toString());
    } else {
      await AsyncStorage.setItem(LAST_SUBSCRIPTION_OFFER_KEY, timestamp.toString());
    }
  } catch (error) {
    console.error('Error setting last subscription offer date:', error);
  }
}

export async function resetSubscriptionData(): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      localStorage.removeItem(SUBSCRIPTION_STATUS_KEY);
      localStorage.removeItem(LAST_SUBSCRIPTION_OFFER_KEY);
    } else {
      await AsyncStorage.removeItem(SUBSCRIPTION_STATUS_KEY);
      await AsyncStorage.removeItem(LAST_SUBSCRIPTION_OFFER_KEY);
    }
    console.log('[Subscription] Storage reset - status and last offer date cleared');
  } catch (error) {
    console.error('Error resetting subscription data:', error);
  }
}
