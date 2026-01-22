import { Platform } from 'react-native';

type PurchasesOfferings = any;
type CustomerInfo = any;

let Purchases: any = null;

if (Platform.OS !== 'web') {
  try {
    Purchases = require('react-native-purchases').default;
  } catch (error) {
    console.warn('RevenueCat not installed. Install with: npm install react-native-purchases');
  }
}

const REVENUECAT_IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY || '';
const REVENUECAT_ANDROID_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY || '';

export const initRevenueCat = async () => {
  if (Platform.OS === 'web' || !Purchases) {
    console.log('RevenueCat not available on web or not installed');
    return;
  }

  try {
    const apiKey = Platform.OS === 'ios' ? REVENUECAT_IOS_KEY : REVENUECAT_ANDROID_KEY;

    if (!apiKey) {
      console.error('RevenueCat API key not found. Please add EXPO_PUBLIC_REVENUECAT_IOS_KEY and EXPO_PUBLIC_REVENUECAT_ANDROID_KEY to your .env file');
      return;
    }

    await Purchases.configure({ apiKey });

    if (__DEV__) {
      await Purchases.setLogLevel(Purchases.LOG_LEVEL.DEBUG);
    }

    console.log('RevenueCat initialized successfully');
  } catch (error) {
    console.error('Error initializing RevenueCat:', error);
  }
};

export const getOfferings = async (): Promise<PurchasesOfferings | null> => {
  if (Platform.OS === 'web' || !Purchases) {
    console.log('RevenueCat not available on web or not installed');
    return null;
  }

  try {
    const offerings = await Purchases.getOfferings();
    return offerings;
  } catch (error) {
    console.error('Error getting offerings:', error);
    return null;
  }
};

export const purchasePackage = async (packageToPurchase: any): Promise<CustomerInfo> => {
  if (Platform.OS === 'web' || !Purchases) {
    throw new Error('RevenueCat not available on web or not installed');
  }

  try {
    const { customerInfo } = await Purchases.purchasePackage(packageToPurchase);
    return customerInfo;
  } catch (error: any) {
    if (!error.userCancelled) {
      console.error('Error purchasing package:', error);
    }
    throw error;
  }
};

export const restorePurchases = async (): Promise<CustomerInfo> => {
  if (Platform.OS === 'web' || !Purchases) {
    throw new Error('RevenueCat not available on web or not installed');
  }

  try {
    const customerInfo = await Purchases.restorePurchases();
    return customerInfo;
  } catch (error) {
    console.error('Error restoring purchases:', error);
    throw error;
  }
};

export const getCustomerInfo = async (): Promise<CustomerInfo | null> => {
  if (Platform.OS === 'web' || !Purchases) {
    console.log('RevenueCat not available on web or not installed');
    return null;
  }

  try {
    const customerInfo = await Purchases.getCustomerInfo();
    return customerInfo;
  } catch (error) {
    console.error('Error getting customer info:', error);
    return null;
  }
};

export const checkSubscriptionStatus = async (): Promise<boolean> => {
  if (Platform.OS === 'web' || !Purchases) {
    return false;
  }

  try {
    const customerInfo = await Purchases.getCustomerInfo();

    if (customerInfo.entitlements.active['premium']) {
      return true;
    }

    return false;
  } catch (error) {
    console.error('Error checking subscription:', error);
    return false;
  }
};

export const setUserId = async (userId: string) => {
  if (Platform.OS === 'web' || !Purchases) {
    return;
  }

  try {
    await Purchases.logIn(userId);
    console.log('RevenueCat user ID set:', userId);
  } catch (error) {
    console.error('Error setting user ID:', error);
  }
};

export const logout = async () => {
  if (Platform.OS === 'web' || !Purchases) {
    return;
  }

  try {
    await Purchases.logOut();
    console.log('RevenueCat user logged out');
  } catch (error) {
    console.error('Error logging out:', error);
  }
};
