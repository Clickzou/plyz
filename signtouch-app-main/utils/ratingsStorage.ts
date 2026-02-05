import { supabase } from './supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DEVICE_ID_KEY = '@signtouch_device_id';

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
  } catch (error) {
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
  rating: number
): Promise<boolean> => {
  try {
    const { data: existingRating } = await supabase
      .from('session_ratings')
      .select('id')
      .eq('session_id', sessionId)
      .eq('rater_id', raterId)
      .eq('rated_id', ratedId)
      .single();

    if (existingRating) {
      console.log('Rating already exists for this session');
      return true;
    }

    const { error } = await supabase
      .from('session_ratings')
      .insert({
        session_id: sessionId,
        queue_entry_id: queueEntryId,
        rater_id: raterId,
        rater_type: raterType,
        rated_id: ratedId,
        rated_type: ratedType,
        rating,
      });

    if (error) {
      console.error('Error submitting rating:', error);
      return false;
    }

    await updateUserAverageRating(ratedId);

    return true;
  } catch (error) {
    console.error('Error in submitRating:', error);
    return false;
  }
};

export const updateUserAverageRating = async (userId: string): Promise<void> => {
  try {
    const { data: ratings } = await supabase
      .from('session_ratings')
      .select('rating')
      .eq('rated_id', userId);

    if (!ratings || ratings.length === 0) return;

    const totalRatings = ratings.length;
    const sumRatings = ratings.reduce((sum, r) => sum + r.rating, 0);
    const averageRating = sumRatings / totalRatings;

    const shouldBan = averageRating < 3 && totalRatings >= 3;

    await supabase
      .from('user_profiles')
      .update({
        average_rating: Math.round(averageRating * 100) / 100,
        total_ratings: totalRatings,
        is_banned: shouldBan,
        ban_reason: shouldBan ? 'Note moyenne inférieure à 3 étoiles' : null,
        updated_at: new Date().toISOString(),
      })
      .eq('device_id', userId);
  } catch (error) {
    console.error('Error updating average rating:', error);
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
  } catch (error) {
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
