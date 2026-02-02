import React, { createContext, useState, useEffect, useContext } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/utils/supabase';
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

const POST_AUTH_REDIRECT_KEY = '@post_auth_redirect';

const getAuthRedirectUrl = () => {
  const isDev = __DEV__ || Constants.appOwnership === 'expo';
  if (isDev) {
    return 'exp+signtouch://auth-callback';
  }
  return 'signtouch://auth-callback';
};

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  sendOtpCode: (email: string) => Promise<{ error: Error | null }>;
  verifyOtpCode: (email: string, token: string) => Promise<{ error: Error | null }>;
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

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      (async () => {
        setSession(session);
        setUser(session?.user ?? null);
      })();
    });

    return () => subscription.unsubscribe();
  }, []);

  // ✅ SIGN UP (Confirm sign-up) + redirection vers l’app
  const signUp = async (email: string, password: string) => {
    try {
      // Deep link vers l’écran/callback de l’app
      const redirectTo = getAuthRedirectUrl();
      console.log('[Auth] Redirect URL:', redirectTo);

      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          // IMPORTANT : force Supabase à mettre CE redirect dans le mail de confirmation
          emailRedirectTo: redirectTo,
        },
      });

      if (error) return { error };
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

      if (error) return { error };
      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const sendOtpCode = async (email: string) => {
    try {
      console.log('[Auth] Sending OTP code to:', email);
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true,
        },
      });

      if (error) {
        console.log('[Auth] OTP send error:', error.message);
        return { error };
      }
      console.log('[Auth] OTP code sent successfully');
      return { error: null };
    } catch (error) {
      console.log('[Auth] OTP send exception:', error);
      return { error: error as Error };
    }
  };

  const verifyOtpCode = async (email: string, token: string) => {
    try {
      console.log('[Auth] Verifying OTP code for:', email);
      const { error } = await supabase.auth.verifyOtp({
        email,
        token,
        type: 'email',
      });

      if (error) {
        console.log('[Auth] OTP verify error:', error.message);
        return { error };
      }
      console.log('[Auth] OTP verified successfully');
      return { error: null };
    } catch (error) {
      console.log('[Auth] OTP verify exception:', error);
      return { error: error as Error };
    }
  };

  const sendMagicLink = async (email: string, language: string = 'en') => {
    try {
      const redirectTo = getAuthRedirectUrl();
      console.log('[Auth] Redirect URL:', redirectTo);

      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: redirectTo,
        },
      });

      if (error) return { error };
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
    <AuthContext.Provider
      value={{
        session,
        user,
        loading,
        signUp,
        signIn,
        signOut,
        sendOtpCode,
        verifyOtpCode,
        sendMagicLink,
        setPostAuthRedirect,
        getPostAuthRedirect,
        clearPostAuthRedirect,
      }}
    >
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
