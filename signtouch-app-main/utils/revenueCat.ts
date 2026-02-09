import { Platform } from 'react-native';

let Purchases: any = null;
let isRevenueCatAvailable = false;

export const initRevenueCat = async () => {
  if (Platform.OS === 'web') {
    console.log('[RevenueCat] Not available on web');
    return;
  }

  try {
    const module = require('react-native-purchases');
    Purchases = module.default || module;

    const apiKey = Platform.OS === 'ios'
      ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY
      : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;

    if (!apiKey) {
      console.warn('[RevenueCat] No API key configured for', Platform.OS);
      return;
    }

    await Purchases.configure({ apiKey });
    isRevenueCatAvailable = true;
    console.log('[RevenueCat] Initialized successfully');
  } catch (error) {
    console.warn('[RevenueCat] Not available (requires native build):', error);
    isRevenueCatAvailable = false;
  }
};

export const setRevenueCatUserId = async (userId: string) => {
  if (!isRevenueCatAvailable || !Purchases) return;
  try {
    await Purchases.logIn(userId);
    console.log('[RevenueCat] User identified:', userId);
  } catch (error) {
    console.error('[RevenueCat] Error setting user:', error);
  }
};

export interface SessionProduct {
  identifier: string;
  title: string;
  description: string;
  priceString: string;
  price: number;
  currencyCode: string;
  rcPackage: any;
}

export interface SubscriptionOffering {
  identifier: string;
  title: string;
  description: string;
  priceString: string;
  price: number;
  currencyCode: string;
  packageType: string;
  rcPackage: any;
}

export const getAvailableProducts = async (): Promise<SessionProduct[]> => {
  if (!isRevenueCatAvailable || !Purchases) {
    console.warn('[RevenueCat] Not available, returning empty products');
    return [];
  }

  try {
    const offerings = await Purchases.getOfferings();
    if (!offerings.current || !offerings.current.availablePackages) {
      console.log('[RevenueCat] No offerings available');
      return [];
    }

    return offerings.current.availablePackages.map((pkg: any) => ({
      identifier: pkg.product.identifier,
      title: pkg.product.title,
      description: pkg.product.description,
      priceString: pkg.product.priceString,
      price: pkg.product.price,
      currencyCode: pkg.product.currencyCode || 'EUR',
      rcPackage: pkg,
    }));
  } catch (error) {
    console.error('[RevenueCat] Error fetching products:', error);
    return [];
  }
};

export const getSubscriptionOfferings = async (): Promise<SubscriptionOffering[]> => {
  if (!isRevenueCatAvailable || !Purchases) {
    console.warn('[RevenueCat] Not available, returning empty offerings');
    return [];
  }

  try {
    const offerings = await Purchases.getOfferings();
    if (!offerings.current || !offerings.current.availablePackages) {
      console.log('[RevenueCat] No subscription offerings available');
      return [];
    }

    return offerings.current.availablePackages.map((pkg: any) => ({
      identifier: pkg.product.identifier,
      title: pkg.product.title,
      description: pkg.product.description,
      priceString: pkg.product.priceString,
      price: pkg.product.price,
      currencyCode: pkg.product.currencyCode || 'EUR',
      packageType: pkg.packageType || 'UNKNOWN',
      rcPackage: pkg,
    }));
  } catch (error) {
    console.error('[RevenueCat] Error fetching subscription offerings:', error);
    return [];
  }
};

export interface PurchaseResult {
  success: boolean;
  transactionId?: string;
  productId?: string;
  purchaseToken?: string;
  error?: string;
  cancelled?: boolean;
}

export const purchaseSubscription = async (rcPackage: any): Promise<PurchaseResult> => {
  if (!isRevenueCatAvailable || !Purchases) {
    return { success: false, error: 'RevenueCat not available. Native build required.' };
  }

  try {
    const purchaseResult = await Purchases.purchasePackage(rcPackage);

    const customerInfo = purchaseResult.customerInfo || purchaseResult;
    const isPremium = customerInfo.entitlements?.active?.['premium'];

    if (!isPremium) {
      return { success: false, error: 'Purchase completed but premium entitlement not found' };
    }

    const transaction = purchaseResult.transaction || purchaseResult.productTransaction;
    const result: PurchaseResult = {
      success: true,
      productId: transaction?.productIdentifier || transaction?.productId,
      transactionId: transaction?.transactionIdentifier || transaction?.orderId,
    };

    if (Platform.OS === 'android' && transaction) {
      result.purchaseToken = transaction.purchaseToken;
    }

    console.log('[RevenueCat] Subscription purchase successful:', result);
    return result;
  } catch (error: any) {
    if (error.userCancelled) {
      return { success: false, cancelled: true, error: 'Purchase cancelled' };
    }

    const errorMessage = error.message || error.readableErrorCode || 'Unknown purchase error';
    console.error('[RevenueCat] Subscription purchase error:', errorMessage);
    return { success: false, error: errorMessage };
  }
};

export const purchaseSession = async (rcPackage: any): Promise<PurchaseResult> => {
  if (!isRevenueCatAvailable || !Purchases) {
    return { success: false, error: 'RevenueCat not available. Native build required.' };
  }

  try {
    const purchaseResult = await Purchases.purchasePackage(rcPackage);

    const transaction = purchaseResult.transaction || purchaseResult.productTransaction;
    if (!transaction) {
      return { success: false, error: 'No transaction returned' };
    }

    const result: PurchaseResult = {
      success: true,
      productId: transaction.productIdentifier || transaction.productId,
      transactionId: transaction.transactionIdentifier || transaction.orderId,
    };

    if (Platform.OS === 'android') {
      result.purchaseToken = transaction.purchaseToken;
    }

    console.log('[RevenueCat] Purchase successful:', result);
    return result;
  } catch (error: any) {
    if (error.userCancelled) {
      return { success: false, cancelled: true, error: 'Purchase cancelled' };
    }

    const errorMessage = error.message || error.readableErrorCode || 'Unknown purchase error';
    console.error('[RevenueCat] Purchase error:', errorMessage);
    return { success: false, error: errorMessage };
  }
};

export interface RestoreResult {
  success: boolean;
  isPremium: boolean;
  error?: string;
}

export const restorePurchases = async (): Promise<RestoreResult> => {
  if (!isRevenueCatAvailable || !Purchases) {
    return { success: false, isPremium: false, error: 'RevenueCat not available. Native build required.' };
  }

  try {
    const customerInfo = await Purchases.restorePurchases();
    const isPremium = !!customerInfo.entitlements?.active?.['premium'];

    console.log('[RevenueCat] Restore completed, isPremium:', isPremium);
    return { success: true, isPremium };
  } catch (error: any) {
    const errorMessage = error.message || 'Failed to restore purchases';
    console.error('[RevenueCat] Restore error:', errorMessage);
    return { success: false, isPremium: false, error: errorMessage };
  }
};

export const checkSubscriptionStatus = async (): Promise<{ isPremium: boolean }> => {
  if (!isRevenueCatAvailable || !Purchases) {
    return { isPremium: false };
  }

  try {
    const customerInfo = await Purchases.getCustomerInfo();
    const isPremium = !!customerInfo.entitlements?.active?.['premium'];
    return { isPremium };
  } catch (error) {
    console.error('[RevenueCat] Error checking subscription:', error);
    return { isPremium: false };
  }
};

export const isAvailable = () => isRevenueCatAvailable;
