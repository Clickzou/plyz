import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const CELEBRITY_MODE_KEY = '@signtouch_celebrity_mode';

interface CelebrityModeContextType {
  isCelebrity: boolean;
  toggleCelebrityMode: () => Promise<void>;
  loading: boolean;
}

const CelebrityModeContext = createContext<CelebrityModeContextType>({
  isCelebrity: false,
  toggleCelebrityMode: async () => {},
  loading: true,
});

export function CelebrityModeProvider({ children }: { children: React.ReactNode }) {
  const [isCelebrity, setIsCelebrity] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(CELEBRITY_MODE_KEY);
        if (stored === 'true') setIsCelebrity(true);
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

  return (
    <CelebrityModeContext.Provider value={{ isCelebrity, toggleCelebrityMode, loading }}>
      {children}
    </CelebrityModeContext.Provider>
  );
}

export const useCelebrityMode = () => useContext(CelebrityModeContext);
