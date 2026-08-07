import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/utils/supabase';

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
      const locaux: FollowedCelebrity[] = followsStr ? JSON.parse(followsStr) : [];
      if (followsStr) setFollowedCelebrities(locaux);
      if (interStr) setInteractions(JSON.parse(interStr));
      // Le local sert de cache d'affichage immédiat ; la base est la référence.
      synchroniserAvecLaBase(locaux);
    } catch (err) {
      console.warn('Failed to load follow data:', err);
    }
  };

  /**
   * Aligne le téléphone et la base.
   *
   * Les abonnements n'ont longtemps existé QUE sur l'appareil : personne
   * d'autre ne savait qui suivait qui. Ceux déjà pris sont donc remontés en
   * base à la première occasion — sans quoi un fan fidèle depuis des mois se
   * retrouverait avec zéro abonnement, et ne recevrait aucune notification.
   */
  const synchroniserAvecLaBase = async (locaux: FollowedCelebrity[]) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: enBase, error } = await supabase
        .from('abonnements')
        .select('celebrity_id')
        .eq('fan_id', user.id);
      if (error) return; // Table pas encore créée : on reste sur le local.

      const idsEnBase = new Set((enBase || []).map(a => a.celebrity_id));

      const aRemonter = locaux
        .filter(c => c.user_id && !idsEnBase.has(c.user_id))
        .map(c => ({ fan_id: user.id, celebrity_id: c.user_id }));
      if (aRemonter.length) {
        await supabase.from('abonnements').upsert(aRemonter, {
          onConflict: 'fan_id,celebrity_id', ignoreDuplicates: true,
        });
        aRemonter.forEach(a => idsEnBase.add(a.celebrity_id));
      }

      // Abonnement pris sur un AUTRE téléphone : il manque ici. On ne connaît
      // que son identifiant, le nom et la photo se rempliront à l'affichage.
      const manquants = Array.from(idsEnBase).filter(
        id => !locaux.some(c => c.user_id === id),
      );
      if (manquants.length) {
        const complet = [
          ...locaux,
          ...manquants.map(id => ({
            user_id: id, stage_name: '', avatar_url: null,
            followed_at: new Date().toISOString(),
          })),
        ];
        setFollowedCelebrities(complet);
        saveFollows(complet);
      }
    } catch (e) {
      // Hors ligne : le local suffit pour afficher, la reprise se fera plus tard.
      console.warn('[Abonnements] synchronisation impossible :', e);
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

  // Mémoïsé sur followedCelebrities : sinon le Set (et donc isFollowing) change
  // d'identité à chaque render → re-renders inutiles dans toutes les lignes de liste.
  const followedIds = useMemo(() => new Set(followedCelebrities.map(c => c.user_id)), [followedCelebrities]);

  const isFollowing = useCallback((userId: string) => followedIds.has(userId), [followedIds]);

  /** Écrit l'abonnement en base. Silencieux : suivre ne doit jamais bloquer. */
  const enregistrerEnBase = async (celebrityId: string, suivre: boolean) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !celebrityId) return;
      if (suivre) {
        await supabase.from('abonnements').upsert(
          { fan_id: user.id, celebrity_id: celebrityId },
          { onConflict: 'fan_id,celebrity_id', ignoreDuplicates: true },
        );
      } else {
        await supabase.from('abonnements')
          .delete()
          .eq('fan_id', user.id)
          .eq('celebrity_id', celebrityId);
      }
    } catch (e) {
      console.warn('[Abonnements] écriture impossible :', e);
    }
  };

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
      // Et en base, pour que la personnalité puisse etre notifiee de ses
      // publications. L'affichage n'attend pas le reseau : le bouton reagit
      // tout de suite, la base suit.
      enregistrerEnBase(celebrity.user_id, !exists);

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
