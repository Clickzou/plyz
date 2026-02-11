import { supabase } from './supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface UserProfile {
  id: string;
  user_id: string;
  celebrity_name: string | null;
  stripe_connect_account_id: string | null;
  created_at: string;
  updated_at: string;
}

export const getUserProfile = async (userId: string): Promise<UserProfile | null> => {
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      console.error('[UserProfile] Error fetching profile:', error);
      return null;
    }

    return data as UserProfile;
  } catch (error) {
    console.error('[UserProfile] Exception fetching profile:', error);
    return null;
  }
};

export const upsertUserProfile = async (
  userId: string,
  updates: { celebrity_name?: string; stripe_connect_account_id?: string }
): Promise<UserProfile | null> => {
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .upsert(
        {
          user_id: userId,
          ...updates,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      )
      .select()
      .single();

    if (error) {
      console.error('[UserProfile] Error upserting profile:', error);
      return null;
    }

    if (updates.stripe_connect_account_id) {
      await AsyncStorage.setItem('stripe_connect_account_id', updates.stripe_connect_account_id);
    }

    return data as UserProfile;
  } catch (error) {
    console.error('[UserProfile] Exception upserting profile:', error);
    return null;
  }
};

export const getStripeAccountId = async (userId: string): Promise<string | null> => {
  try {
    const profile = await getUserProfile(userId);
    if (profile?.stripe_connect_account_id) {
      await AsyncStorage.setItem('stripe_connect_account_id', profile.stripe_connect_account_id);
      return profile.stripe_connect_account_id;
    }

    const localId = await AsyncStorage.getItem('stripe_connect_account_id');
    if (localId && userId) {
      await upsertUserProfile(userId, { stripe_connect_account_id: localId });
      return localId;
    }

    return null;
  } catch (error) {
    console.error('[UserProfile] Error getting Stripe account:', error);
    return AsyncStorage.getItem('stripe_connect_account_id');
  }
};

export const saveStripeAccountId = async (userId: string, stripeAccountId: string): Promise<boolean> => {
  try {
    await AsyncStorage.setItem('stripe_connect_account_id', stripeAccountId);

    const result = await upsertUserProfile(userId, {
      stripe_connect_account_id: stripeAccountId,
    });

    return result !== null;
  } catch (error) {
    console.error('[UserProfile] Error saving Stripe account:', error);
    return false;
  }
};
