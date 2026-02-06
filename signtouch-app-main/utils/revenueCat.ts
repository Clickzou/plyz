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

export interface PurchaseResult {
  success: boolean;
  transactionId?: string;
  productId?: string;
  purchaseToken?: string;
  error?: string;
  cancelled?: boolean;
}

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

export const isAvailable = () => isRevenueCatAvailable;
