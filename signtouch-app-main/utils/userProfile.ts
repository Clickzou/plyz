import { supabase } from './supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Le profil célébrité est stocké dans la table `celebrity_profiles`
// (la table `user_profiles` sert au système de notes/modération, schéma différent).
// Mapping conservé pour ne pas changer les écrans appelants :
//   celebrity_name      <-> stage_name
//   stripe_connect_account_id <-> stripe_account_id

export interface UserProfile {
  user_id: string;
  celebrity_name: string | null;
  bio: string | null;
  stripe_connect_account_id: string | null;
  created_at?: string;
  updated_at?: string;
}

const mapRow = (row: any): UserProfile => ({
  user_id: row.user_id,
  celebrity_name: row.stage_name ?? null,
  bio: row.bio ?? null,
  stripe_connect_account_id: row.stripe_account_id ?? null,
  created_at: row.created_at,
  updated_at: row.updated_at,
});

export const getUserProfile = async (userId: string): Promise<UserProfile | null> => {
  try {
    const { data, error } = await supabase
      .from('celebrity_profiles')
      .select('user_id, stage_name, bio, stripe_account_id, created_at, updated_at')
      .eq('user_id', userId)
      .single();

    if (error) {
      // PGRST116 = aucune ligne (profil inexistant ou non listé via RLS) : cas normal, pas une erreur
      if (error.code === 'PGRST116') {
        return null;
      }
      console.error('[UserProfile] Error fetching profile:', error);
      return null;
    }

    return mapRow(data);
  } catch (error) {
    console.error('[UserProfile] Exception fetching profile:', error);
    return null;
  }
};

export const upsertUserProfile = async (
  userId: string,
  updates: { celebrity_name?: string; bio?: string; stripe_connect_account_id?: string }
): Promise<boolean> => {
  try {
    const payload: Record<string, any> = { updated_at: new Date().toISOString() };
    if (updates.celebrity_name !== undefined) payload.stage_name = updates.celebrity_name;
    if (updates.bio !== undefined) payload.bio = updates.bio;
    if (updates.stripe_connect_account_id !== undefined) payload.stripe_account_id = updates.stripe_connect_account_id;

    let error;
    if (payload.stage_name !== undefined) {
      // stage_name est fourni : on peut créer la ligne au besoin (stage_name est NOT NULL)
      ({ error } = await supabase
        .from('celebrity_profiles')
        .upsert({ user_id: userId, ...payload }, { onConflict: 'user_id' }));
    } else {
      // pas de stage_name : mise à jour de la ligne existante uniquement
      // (évite de violer la contrainte NOT NULL sur stage_name)
      ({ error } = await supabase
        .from('celebrity_profiles')
        .update(payload)
        .eq('user_id', userId));
    }

    if (error) {
      console.error('[UserProfile] Error upserting profile:', error);
      return false;
    }

    if (updates.stripe_connect_account_id) {
      await AsyncStorage.setItem('stripe_connect_account_id', updates.stripe_connect_account_id);
    }

    return true;
  } catch (error) {
    console.error('[UserProfile] Exception upserting profile:', error);
    return false;
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

// Efface le compte Stripe mémorisé (local + base). À utiliser quand le compte
// stocké n'existe plus sur la plateforme Stripe actuelle (ex: changement de
// compte plateforme) → l'utilisateur repart sur une création propre.
export const clearStripeAccountId = async (userId?: string): Promise<void> => {
  try {
    await AsyncStorage.removeItem('stripe_connect_account_id');
    if (userId) {
      await upsertUserProfile(userId, { stripe_connect_account_id: null as any });
    }
  } catch (error) {
    console.error('[UserProfile] Error clearing Stripe account:', error);
  }
};

export const saveStripeAccountId = async (userId: string, stripeAccountId: string): Promise<boolean> => {
  try {
    await AsyncStorage.setItem('stripe_connect_account_id', stripeAccountId);
    return await upsertUserProfile(userId, { stripe_connect_account_id: stripeAccountId });
  } catch (error) {
    console.error('[UserProfile] Error saving Stripe account:', error);
    return false;
  }
};
