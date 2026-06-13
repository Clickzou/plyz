import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const CELEBRITY_MODE_KEY = '@plyz_celebrity_mode';
const PROFILE_PHOTO_KEY = '@plyz_profile_photo';

interface CelebrityModeContextType {
  isCelebrity: boolean;
  toggleCelebrityMode: () => Promise<void>;
  loading: boolean;
  profilePhoto: string | null;
  setProfilePhoto: (uri: string | null) => Promise<void>;
}

const CelebrityModeContext = createContext<CelebrityModeContextType>({
  isCelebrity: false,
  toggleCelebrityMode: async () => {},
  loading: true,
  profilePhoto: null,
  setProfilePhoto: async () => {},
});

export function CelebrityModeProvider({ children }: { children: React.ReactNode }) {
  const [isCelebrity, setIsCelebrity] = useState(false);
  const [loading, setLoading] = useState(true);
  const [profilePhoto, setProfilePhotoState] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [stored, photo] = await Promise.all([
          AsyncStorage.getItem(CELEBRITY_MODE_KEY),
          AsyncStorage.getItem(PROFILE_PHOTO_KEY),
        ]);
        if (stored === 'true') setIsCelebrity(true);
        if (photo) setProfilePhotoState(photo);
      } catch (e) {
        console.error('[CelebrityMode] Error loading:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const toggleCelebrityMode = async () => {
    const newValue = !isCelebrity;
    setIsCelebrity(newValue);
    try {
      await AsyncStorage.setItem(CELEBRITY_MODE_KEY, String(newValue));
    } catch (e) {
      console.error('[CelebrityMode] Error saving:', e);
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
    <CelebrityModeContext.Provider value={{ isCelebrity, toggleCelebrityMode, loading, profilePhoto, setProfilePhoto }}>
      {children}
    </CelebrityModeContext.Provider>
  );
}

export const useCelebrityMode = () => useContext(CelebrityModeContext);
