import { supabase } from './supabase';
import { authedFetch } from './authedFetch';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SERVER_URL = process.env.EXPO_PUBLIC_STRIPE_SERVER_URL || '';

const DEVICE_ID_KEY = '@plyz_device_id';

export interface UserProfile {
  id: string;
  device_id: string;
  user_type: 'fan' | 'celebrity';
  display_name: string;
  average_rating: number;
  total_ratings: number;
  is_banned: boolean;
  ban_reason: string | null;
  created_at: string;
}

export interface SessionRating {
  id: string;
  session_id: string;
  queue_entry_id: string | null;
  rater_id: string;
  rater_type: 'fan' | 'celebrity';
  rated_id: string;
  rated_type: 'fan' | 'celebrity';
  rating: number;
  created_at: string;
}

export const getOrCreateDeviceId = async (): Promise<string> => {
  try {
    let deviceId = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (!deviceId) {
      deviceId = `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await AsyncStorage.setItem(DEVICE_ID_KEY, deviceId);
    }
    return deviceId;
  } catch {
    return `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
};

export const getOrCreateUserProfile = async (
  displayName: string,
  userType: 'fan' | 'celebrity'
): Promise<UserProfile | null> => {
  try {
    const deviceId = await getOrCreateDeviceId();

    const { data: existing } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('device_id', deviceId)
      .single();

    if (existing) {
      if (existing.display_name !== displayName || existing.user_type !== userType) {
        const { data: updated } = await supabase
          .from('user_profiles')
          .update({ display_name: displayName, user_type: userType, updated_at: new Date().toISOString() })
          .eq('device_id', deviceId)
          .select()
          .single();
        return updated as UserProfile;
      }
      return existing as UserProfile;
    }

    const { data, error } = await supabase
      .from('user_profiles')
      .insert({
        device_id: deviceId,
        display_name: displayName,
        user_type: userType,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating user profile:', error);
      return null;
    }

    return data as UserProfile;
  } catch (error) {
    console.error('Error in getOrCreateUserProfile:', error);
    return null;
  }
};

export const submitRating = async (
  sessionId: string,
  queueEntryId: string | null,
  raterId: string,
  raterType: 'fan' | 'celebrity',
  ratedId: string,
  ratedType: 'fan' | 'celebrity',
  rating: number,
  comment?: string
): Promise<boolean> => {
  try {
    // 🔒 SÉCURITÉ : l'insertion de la note ET le recalcul moyenne / ban se font
    // désormais 100% côté SERVEUR (service role). Le client n'écrit JAMAIS
    // average_rating / total_ratings / is_banned / ban_reason : sinon un
    // utilisateur pourrait se débannir, bannir un concurrent ou truquer sa note.
    if (!SERVER_URL) {
      console.error('[Rating] Server URL not configured (EXPO_PUBLIC_STRIPE_SERVER_URL)');
      return false;
    }

    const response = await authedFetch(`${SERVER_URL}/api/submit-rating`, {
      method: 'POST',
      body: JSON.stringify({
        session_id: sessionId,
        queue_entry_id: queueEntryId,
        rater_id: raterId,
        rater_type: raterType,
        rated_id: ratedId,
        rated_type: ratedType,
        rating,
        comment: comment || null,
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      console.error('Error submitting rating:', response.status, text);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in submitRating:', error);
    return false;
  }
};

export const getUserProfile = async (deviceId: string): Promise<UserProfile | null> => {
  try {
    const { data } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('device_id', deviceId)
      .single();

    return data as UserProfile | null;
  } catch (error) {
    console.error('Error getting user profile:', error);
    return null;
  }
};

export const isUserBanned = async (deviceId: string): Promise<boolean> => {
  try {
    const profile = await getUserProfile(deviceId);
    return profile?.is_banned || false;
  } catch {
    return false;
  }
};

export const getUserRatings = async (deviceId: string): Promise<SessionRating[]> => {
  try {
    const { data } = await supabase
      .from('session_ratings')
      .select('*')
      .eq('rated_id', deviceId)
      .order('created_at', { ascending: false });

    return (data || []) as SessionRating[];
  } catch (error) {
    console.error('Error getting user ratings:', error);
    return [];
  }
};
