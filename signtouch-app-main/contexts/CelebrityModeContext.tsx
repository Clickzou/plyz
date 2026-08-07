import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/utils/supabase';

// ⚠️ Le mode célébrité est désormais KEYÉ PAR UTILISATEUR (préfixe + user.id) et
// hydraté depuis le serveur. Avant, une seule clé globale à l'appareil → changer
// de compte héritait du mode de l'autre, et une célébrité vérifiée sur un nouveau
// téléphone était traitée comme fan.
const CELEBRITY_MODE_PREFIX = '@plyz_celebrity_mode_';
const PROFILE_PHOTO_KEY = '@plyz_profile_photo';
// Renoncement explicite : « je me suis trompé, je veux redevenir un fan ».
// Retirer le drapeau local ne suffisait pas — au redémarrage suivant, la simple
// présence d'une ligne `celebrity_profiles` remettait le mode célébrité, et le
// retour en arrière ne tenait pas une seule session.
const CELEBRITY_OPTOUT_PREFIX = '@plyz_celebrity_optout_';

interface CelebrityModeContextType {
  isCelebrity: boolean;
  toggleCelebrityMode: () => Promise<void>;
  enableCelebrityMode: () => Promise<void>;
  /** Repasse en fan durablement. Sans effet si le compte est déjà validé. */
  revenirEnModeFan: () => Promise<void>;
  loading: boolean;
  profilePhoto: string | null;
  setProfilePhoto: (uri: string | null) => Promise<void>;
}

const CelebrityModeContext = createContext<CelebrityModeContextType>({
  isCelebrity: false,
  toggleCelebrityMode: async () => {},
  enableCelebrityMode: async () => {},
  revenirEnModeFan: async () => {},
  loading: true,
  profilePhoto: null,
  setProfilePhoto: async () => {},
});

export function CelebrityModeProvider({ children }: { children: React.ReactNode }) {
  const [isCelebrity, setIsCelebrity] = useState(false);
  const [loading, setLoading] = useState(true);
  const [profilePhoto, setProfilePhotoState] = useState<string | null>(null);
  const currentUserRef = useRef<string | null>(null);

  // Détermine si l'utilisateur est en mode célébrité : flag local (par utilisateur)
  // OU signal serveur (vérifié / profil célébrité existant). Déconnecté → false.
  const hydrateForUser = async (userId: string | null) => {
    if (!userId) {
      setIsCelebrity(false);
      return;
    }
    try {
      let celeb = (await AsyncStorage.getItem(CELEBRITY_MODE_PREFIX + userId)) === 'true';
      // Une célébrité VALIDÉE reste une célébrité : c'est un état vérifié par
      // Plyz, pas une préférence d'affichage. Le renoncement ne s'applique donc
      // qu'aux comptes encore en attente — ceux qui se sont trompés.
      let estValidee = false;
      try {
        const { data: verified } = await supabase.rpc('is_user_verified', { uid: userId });
        if (verified === true) estValidee = true;
      } catch {}
      if (estValidee) celeb = true;

      const aRenonce =
        !estValidee &&
        (await AsyncStorage.getItem(CELEBRITY_OPTOUT_PREFIX + userId)) === 'true';
      if (aRenonce) celeb = false;

      if (!celeb && !aRenonce) {
        try {
          const { data: cp } = await supabase
            .from('celebrity_profiles')
            .select('user_id')
            .eq('user_id', userId)
            .maybeSingle();
          if (cp) celeb = true;
        } catch {}
      }
      setIsCelebrity(celeb);
      if (celeb) await AsyncStorage.setItem(CELEBRITY_MODE_PREFIX + userId, 'true');
    } catch (e) {
      console.error('[CelebrityMode] hydrate error:', e);
    }
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const photo = await AsyncStorage.getItem(PROFILE_PHOTO_KEY);
        if (mounted && photo) setProfilePhotoState(photo);
        const { data } = await supabase.auth.getUser();
        currentUserRef.current = data.user?.id || null;
        await hydrateForUser(currentUserRef.current);
      } catch (e) {
        console.error('[CelebrityMode] Error loading:', e);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    // Réagit aux connexions/déconnexions (reset sur sign-out, hydrate sur sign-in).
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const uid = session?.user?.id || null;
      if (uid !== currentUserRef.current) {
        currentUserRef.current = uid;
        hydrateForUser(uid);
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const persistFlag = async (value: boolean) => {
    const uid = currentUserRef.current;
    if (!uid) return;
    try {
      if (value) await AsyncStorage.setItem(CELEBRITY_MODE_PREFIX + uid, 'true');
      else await AsyncStorage.removeItem(CELEBRITY_MODE_PREFIX + uid);
    } catch (e) {
      console.error('[CelebrityMode] Error saving:', e);
    }
  };

  const toggleCelebrityMode = async () => {
    const newValue = !isCelebrity;
    setIsCelebrity(newValue);
    await persistFlag(newValue);
  };

  // Force le passage en mode célébrité. Idempotent.
  const enableCelebrityMode = async () => {
    const uid = currentUserRef.current;
    // Lever un éventuel renoncement : on repasse célébrité en connaissance de
    // cause, l'ancien « je me suis trompé » n'a plus lieu d'être.
    if (uid) {
      try { await AsyncStorage.removeItem(CELEBRITY_OPTOUT_PREFIX + uid); } catch {}
    }
    if (isCelebrity) return;
    setIsCelebrity(true);
    await persistFlag(true);
  };

  // Retour en mode fan. On se trompe de bouton, on essaie par curiosité — et
  // jusqu'ici plus rien ne ramenait en arrière : le compte restait célébrité,
  // avec un onboarding en attente qu'on n'avait jamais voulu.
  const revenirEnModeFan = async () => {
    const uid = currentUserRef.current;
    if (!uid) return;
    setIsCelebrity(false);
    await persistFlag(false);
    try {
      await AsyncStorage.setItem(CELEBRITY_OPTOUT_PREFIX + uid, 'true');
    } catch (e) {
      console.error('[CelebrityMode] optout save error:', e);
    }
  };

  const setProfilePhoto = async (uri: string | null) => {
    setProfilePhotoState(uri);
    try {
      if (uri) {
        await AsyncStorage.setItem(PROFILE_PHOTO_KEY, uri);
      } else {
        await AsyncStorage.removeItem(PROFILE_PHOTO_KEY);
      }
    } catch (e) {
      console.error('[CelebrityMode] Error saving profile photo:', e);
    }
  };

  return (
    <CelebrityModeContext.Provider value={{ isCelebrity, toggleCelebrityMode, enableCelebrityMode, revenirEnModeFan, loading, profilePhoto, setProfilePhoto }}>
      {children}
    </CelebrityModeContext.Provider>
  );
}

export const useCelebrityMode = () => useContext(CelebrityModeContext);
