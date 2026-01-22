import React, { createContext, useState, useEffect, useContext } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/utils/supabase';
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';

const POST_AUTH_REDIRECT_KEY = '@post_auth_redirect';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  sendMagicLink: (email: string, language?: string) => Promise<{ error: Error | null }>;
  setPostAuthRedirect: (path: string) => Promise<void>;
  getPostAuthRedirect: () => Promise<string | null>;
  clearPostAuthRedirect: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      (async () => {
        setSession(session);
        setUser(session?.user ?? null);
      })();
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) {
        return { error };
      }

      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return { error };
      }

      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const sendMagicLink = async (email: string, language: string = 'en') => {
    try {
      const redirectTo = Linking.createURL('auth-callback');

      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: redirectTo,
        },
      });

      if (error) {
        return { error };
      }

      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const setPostAuthRedirect = async (path: string) => {
    try {
      await AsyncStorage.setItem(POST_AUTH_REDIRECT_KEY, path);
    } catch (error) {
      console.error('Error saving post-auth redirect:', error);
    }
  };

  const getPostAuthRedirect = async (): Promise<string | null> => {
    try {
      return await AsyncStorage.getItem(POST_AUTH_REDIRECT_KEY);
    } catch (error) {
      console.error('Error getting post-auth redirect:', error);
      return null;
    }
  };

  const clearPostAuthRedirect = async () => {
    try {
      await AsyncStorage.removeItem(POST_AUTH_REDIRECT_KEY);
    } catch (error) {
      console.error('Error clearing post-auth redirect:', error);
    }
  };

  return (
    <AuthContext.Provider value={{
      session,
      user,
      loading,
      signUp,
      signIn,
      signOut,
      sendMagicLink,
      setPostAuthRedirect,
      getPostAuthRedirect,
      clearPostAuthRedirect
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
