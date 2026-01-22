import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import * as Localization from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { translations, Language, TranslationKeys, getLanguageFromLocale } from '@/locales';

interface LanguageContextType {
  language: Language;
  setLanguage: (language: Language) => Promise<void>;
  t: (key: TranslationKeys, params?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const LANGUAGE_STORAGE_KEY = '@app_language';

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>('en');
  const [isLoading, setIsLoading] = useState(true);

  // Initialize language from storage or device locale
  useEffect(() => {
    const initLanguage = async () => {
      try {
        // Try to get saved language preference
        const savedLanguage = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);

        if (savedLanguage && savedLanguage in translations) {
          setLanguageState(savedLanguage as Language);
        } else {
          // Use device locale
          const locales = Localization.getLocales();
          const deviceLocale = locales[0]?.languageCode || 'en';
          const detectedLanguage = getLanguageFromLocale(deviceLocale);
          setLanguageState(detectedLanguage);
        }
      } catch (error) {
        console.error('Error loading language:', error);
        setLanguageState('en');
      } finally {
        setIsLoading(false);
      }
    };

    initLanguage();
  }, []);

  const setLanguage = async (newLanguage: Language) => {
    try {
      await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, newLanguage);
      setLanguageState(newLanguage);
    } catch (error) {
      console.error('Error saving language:', error);
    }
  };

  const t = (key: TranslationKeys, params?: Record<string, string | number>): string => {
    const translation = translations[language];
    let value = translation[key];

    // Handle nested keys (e.g., 'freePlanFeatures.feature1')
    if (key.includes('.')) {
      const keys = key.split('.');
      let obj: any = translation;
      for (const k of keys) {
        obj = obj?.[k];
        if (obj === undefined) break;
      }
      value = obj;
    }

    // Fallback to English if translation not found
    if (value === undefined && language !== 'en') {
      const englishTranslation = translations.en;
      if (key.includes('.')) {
        const keys = key.split('.');
        let obj: any = englishTranslation;
        for (const k of keys) {
          obj = obj?.[k];
          if (obj === undefined) break;
        }
        value = obj;
      } else {
        value = englishTranslation[key];
      }
    }

    // If still not found, return the key itself
    if (value === undefined) {
      return key;
    }

    // Replace parameters in translation (e.g., {{count}})
    if (params && typeof value === 'string') {
      return value.replace(/\{\{(\w+)\}\}/g, (match, paramKey) => {
        return params[paramKey]?.toString() || match;
      });
    }

    return String(value);
  };

  if (isLoading) {
    return null; // or a loading screen
  }

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useTranslation() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useTranslation must be used within a LanguageProvider');
  }
  return context;
}

// Alias for backwards compatibility
export const useLanguage = useTranslation;
