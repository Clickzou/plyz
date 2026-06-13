import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const FOLLOWS_KEY = '@plyz_followed_celebrities';
const INTERACTIONS_KEY = '@plyz_fan_interactions';

export type FanTier = 'newcomer' | 'bronze' | 'silver' | 'gold' | 'diamond';

interface FollowedCelebrity {
  user_id: string;
  stage_name: string;
  avatar_url: string | null;
  followed_at: string;
}

interface FanInteractions {
  totalFollows: number;
  totalBookings: number;
  totalAutographs: number;
  totalLiveSessions: number;
}

interface FollowContextType {
  followedIds: Set<string>;
  followedCelebrities: FollowedCelebrity[];
  isFollowing: (userId: string) => boolean;
  toggleFollow: (celebrity: { user_id: string; stage_name: string; avatar_url: string | null }) => void;
  followCount: number;
  fanTier: FanTier;
  interactions: FanInteractions;
  addInteraction: (type: 'booking' | 'autograph' | 'live') => void;
}

const FollowContext = createContext<FollowContextType>({
  followedIds: new Set(),
  followedCelebrities: [],
  isFollowing: () => false,
  toggleFollow: () => {},
  followCount: 0,
  fanTier: 'newcomer',
  interactions: { totalFollows: 0, totalBookings: 0, totalAutographs: 0, totalLiveSessions: 0 },
  addInteraction: () => {},
});

export function useFollow() {
  return useContext(FollowContext);
}

function computeFanTier(interactions: FanInteractions): FanTier {
  const total = interactions.totalFollows + interactions.totalBookings * 3 + interactions.totalAutographs * 2 + interactions.totalLiveSessions * 5;
  if (total >= 50) return 'diamond';
  if (total >= 25) return 'gold';
  if (total >= 10) return 'silver';
  if (total >= 3) return 'bronze';
  return 'newcomer';
}

export const FAN_TIER_CONFIG: Record<FanTier, { label: string; color: string; bgColor: string; icon: string; minPoints: number }> = {
  newcomer: { label: 'Newcomer', color: '#9ca3af', bgColor: 'rgba(156,163,175,0.15)', icon: '🌱', minPoints: 0 },
  bronze: { label: 'Bronze', color: '#cd7f32', bgColor: 'rgba(205,127,50,0.15)', icon: '🥉', minPoints: 3 },
  silver: { label: 'Silver', color: '#c0c0c0', bgColor: 'rgba(192,192,192,0.15)', icon: '🥈', minPoints: 10 },
  gold: { label: 'Gold', color: '#ffd700', bgColor: 'rgba(255,215,0,0.15)', icon: '🥇', minPoints: 25 },
  diamond: { label: 'Diamond', color: '#b9f2ff', bgColor: 'rgba(185,242,255,0.15)', icon: '💎', minPoints: 50 },
};

export function FollowProvider({ children }: { children: React.ReactNode }) {
  const [followedCelebrities, setFollowedCelebrities] = useState<FollowedCelebrity[]>([]);
  const [interactions, setInteractions] = useState<FanInteractions>({
    totalFollows: 0, totalBookings: 0, totalAutographs: 0, totalLiveSessions: 0,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [followsStr, interStr] = await Promise.all([
        AsyncStorage.getItem(FOLLOWS_KEY),
        AsyncStorage.getItem(INTERACTIONS_KEY),
      ]);
      if (followsStr) setFollowedCelebrities(JSON.parse(followsStr));
      if (interStr) setInteractions(JSON.parse(interStr));
    } catch (err) {
      console.warn('Failed to load follow data:', err);
    }
  };

  const saveFollows = async (celebs: FollowedCelebrity[]) => {
    try {
      await AsyncStorage.setItem(FOLLOWS_KEY, JSON.stringify(celebs));
    } catch (err) {
      console.warn('Failed to save follows:', err);
    }
  };

  const saveInteractions = async (inter: FanInteractions) => {
    try {
      await AsyncStorage.setItem(INTERACTIONS_KEY, JSON.stringify(inter));
    } catch (err) {
      console.warn('Failed to save interactions:', err);
    }
  };

  const followedIds = new Set(followedCelebrities.map(c => c.user_id));

  const isFollowing = useCallback((userId: string) => followedIds.has(userId), [followedIds]);

  const toggleFollow = useCallback((celebrity: { user_id: string; stage_name: string; avatar_url: string | null }) => {
    setFollowedCelebrities(prev => {
      const exists = prev.find(c => c.user_id === celebrity.user_id);
      let next: FollowedCelebrity[];
      if (exists) {
        next = prev.filter(c => c.user_id !== celebrity.user_id);
      } else {
        next = [...prev, { ...celebrity, followed_at: new Date().toISOString() }];
      }
      saveFollows(next);

      setInteractions(prevI => {
        const newI = { ...prevI, totalFollows: next.length };
        saveInteractions(newI);
        return newI;
      });

      return next;
    });
  }, []);

  const addInteraction = useCallback((type: 'booking' | 'autograph' | 'live') => {
    setInteractions(prev => {
      const next = { ...prev };
      if (type === 'booking') next.totalBookings += 1;
      else if (type === 'autograph') next.totalAutographs += 1;
      else if (type === 'live') next.totalLiveSessions += 1;
      saveInteractions(next);
      return next;
    });
  }, []);

  const fanTier = computeFanTier(interactions);

  return (
    <FollowContext.Provider value={{
      followedIds,
      followedCelebrities,
      isFollowing,
      toggleFollow,
      followCount: followedCelebrities.length,
      fanTier,
      interactions,
      addInteraction,
    }}>
      {children}
    </FollowContext.Provider>
  );
}
