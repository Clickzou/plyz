import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

const storage = Platform.OS === 'web' ? {
  getItem: async (key: string) => {
    if (typeof window !== 'undefined') {
      return window.localStorage.getItem(key);
    }
    return null;
  },
  setItem: async (key: string, value: string) => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(key, value);
    }
  },
  removeItem: async (key: string) => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(key);
    }
  },
} : {
  getItem: (key: string) => AsyncStorage.getItem(key),
  setItem: (key: string, value: string) => AsyncStorage.setItem(key, value),
  removeItem: (key: string) => AsyncStorage.removeItem(key),
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Supabase (GoTrueClient) logge "Invalid Refresh Token: Already Used" via console.error quand le
// refresh token stocké est périmé / déjà consommé (fréquent après une RÉINSTALLATION de l'app, ou
// si deux instances rafraîchissent en parallèle). C'est BÉNIN : le client se déconnecte tout seul
// et l'utilisateur n'a qu'à se reconnecter. On filtre uniquement CE message pour ne pas afficher le
// bandeau rouge "Console Error" de LogBox, qui inquiète inutilement pendant les tests. Toutes les
// autres erreurs continuent de remonter normalement.
const _origConsoleError = console.error.bind(console);
console.error = (...args: any[]) => {
  try {
    const msg = args
      .map((a) => (typeof a === 'string' ? a : a?.message || ''))
      .join(' ');
    if (/Invalid Refresh Token|Refresh Token (Not Found|Already Used)/i.test(msg)) {
      console.warn('[Auth] Jeton de session expiré (bénin) — reconnexion nécessaire.');
      return;
    }
  } catch {}
  _origConsoleError(...args);
};
