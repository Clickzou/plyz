import { supabase } from './supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PROMO_PREMIUM_KEY = '@signtouch_promo_premium';
const DEVICE_ID_KEY = '@signtouch_device_id';

interface PromoPremiumStatus {
  isActive: boolean;
  expiresAt: string | null;
  code: string | null;
}

const getDeviceId = async (): Promise<string> => {
  let deviceId = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = 'device_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
    await AsyncStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
};

export const validatePromoCode = async (code: string): Promise<{ success: boolean; message: string; expiresAt?: string }> => {
  try {
    const upperCode = code.toUpperCase().trim();
    
    const { data: promoCode, error } = await supabase
      .from('promo_codes')
      .select('*')
      .eq('code', upperCode)
      .eq('is_active', true)
      .single();

    if (error || !promoCode) {
      return { success: false, message: 'Code invalide ou expiré' };
    }

    const now = new Date();
    const expiresAt = new Date(promoCode.expires_at);
    
    if (expiresAt < now) {
      return { success: false, message: 'Ce code a expiré' };
    }

    if (promoCode.current_uses >= promoCode.max_uses) {
      return { success: false, message: 'Ce code a atteint son nombre maximum d\'utilisations' };
    }

    const deviceId = await getDeviceId();
    
    const { data: existingUse } = await supabase
      .from('promo_code_uses')
      .select('*')
      .eq('promo_code_id', promoCode.id)
      .eq('device_id', deviceId)
      .single();

    if (existingUse) {
      return { success: false, message: 'Vous avez déjà utilisé ce code' };
    }

    const premiumExpiresAt = new Date();
    premiumExpiresAt.setDate(premiumExpiresAt.getDate() + promoCode.duration_days);

    const { error: useError } = await supabase
      .from('promo_code_uses')
      .insert({
        promo_code_id: promoCode.id,
        device_id: deviceId,
        premium_expires_at: premiumExpiresAt.toISOString(),
      });

    if (useError) {
      console.error('Error recording promo use:', useError);
      return { success: false, message: 'Erreur lors de l\'activation du code' };
    }

    const { error: updateError } = await supabase
      .from('promo_codes')
      .update({ current_uses: promoCode.current_uses + 1 })
      .eq('id', promoCode.id);

    if (updateError) {
      console.error('Error updating promo uses:', updateError);
    }

    await AsyncStorage.setItem(PROMO_PREMIUM_KEY, JSON.stringify({
      isActive: true,
      expiresAt: premiumExpiresAt.toISOString(),
      code: upperCode,
    }));

    return { 
      success: true, 
      message: `Premium activé jusqu'au ${premiumExpiresAt.toLocaleDateString()}`,
      expiresAt: premiumExpiresAt.toISOString()
    };
  } catch (error) {
    console.error('Error validating promo code:', error);
    return { success: false, message: 'Erreur de connexion' };
  }
};

export const getPromoPremiumStatus = async (): Promise<PromoPremiumStatus> => {
  try {
    const stored = await AsyncStorage.getItem(PROMO_PREMIUM_KEY);
    if (!stored) {
      return { isActive: false, expiresAt: null, code: null };
    }

    const status: PromoPremiumStatus = JSON.parse(stored);
    
    if (status.expiresAt) {
      const expiresAt = new Date(status.expiresAt);
      if (expiresAt < new Date()) {
        await AsyncStorage.removeItem(PROMO_PREMIUM_KEY);
        return { isActive: false, expiresAt: null, code: null };
      }
    }

    return status;
  } catch (error) {
    console.error('Error getting promo status:', error);
    return { isActive: false, expiresAt: null, code: null };
  }
};

export const clearPromoPremium = async (): Promise<void> => {
  await AsyncStorage.removeItem(PROMO_PREMIUM_KEY);
};
