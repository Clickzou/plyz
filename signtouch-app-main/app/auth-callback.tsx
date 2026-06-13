import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/utils/supabase';
import * as Linking from 'expo-linking';

export default function AuthCallbackScreen() {
  const { user } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [, setVerifying] = useState(true);
  const [debugInfo, setDebugInfo] = useState<string>('');
  const params = useLocalSearchParams<{ token_hash?: string; type?: string; access_token?: string; refresh_token?: string }>();

  const parseTokensFromUrl = (url: string) => {
    let accessToken: string | undefined;
    let refreshToken: string | undefined;
    let tokenHash: string | undefined;
    let tokenType: string | undefined;

    if (url.includes('#')) {
      const fragment = url.split('#')[1];
      if (fragment) {
        const fragmentParams = new URLSearchParams(fragment);
        accessToken = fragmentParams.get('access_token') || undefined;
        refreshToken = fragmentParams.get('refresh_token') || undefined;
        tokenHash = fragmentParams.get('token_hash') || undefined;
        tokenType = fragmentParams.get('type') || undefined;
      }
    }
    
    if (url.includes('?')) {
      const queryString = url.split('?')[1]?.split('#')[0];
      if (queryString) {
        const queryParams = new URLSearchParams(queryString);
        accessToken = accessToken || queryParams.get('access_token') || undefined;
        refreshToken = refreshToken || queryParams.get('refresh_token') || undefined;
        tokenHash = tokenHash || queryParams.get('token_hash') || undefined;
        tokenType = tokenType || queryParams.get('type') || undefined;
      }
    }

    return { accessToken, refreshToken, tokenHash, tokenType };
  };

  const handleAuthWithTokens = async (accessToken: string, refreshToken: string) => {
    console.log('[AuthCallback] Setting session with tokens...');
    const { error: sessionError } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    
    if (sessionError) {
      console.log('[AuthCallback] Session error:', sessionError.message);
      setError(sessionError.message);
      setVerifying(false);
      return false;
    }
    
    console.log('[AuthCallback] Session set successfully!');
    router.replace('/');
    return true;
  };

  const handleAuthWithOtp = async (tokenHash: string, tokenType: string) => {
    console.log('[AuthCallback] Verifying OTP with token_hash...');
    const { error: verifyError } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: tokenType as any,
    });

    if (verifyError) {
      console.log('[AuthCallback] Verify error:', verifyError.message);
      setError(verifyError.message);
      setVerifying(false);
      return false;
    }

    console.log('[AuthCallback] OTP verified!');
    router.replace('/');
    return true;
  };

  const processUrl = async (url: string | null) => {
    console.log('[AuthCallback] Processing URL:', url);
    setDebugInfo(`URL: ${url?.substring(0, 80) || 'null'}...`);

    if (!url) {
      if (user) {
        console.log('[AuthCallback] User already logged in');
        router.replace('/');
        return;
      }
      
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        console.log('[AuthCallback] Existing session found');
        router.replace('/');
        return;
      }

      console.log('[AuthCallback] No URL and no session');
      setError('Lien invalide ou expiré');
      setVerifying(false);
      return;
    }

    const { accessToken, refreshToken, tokenHash, tokenType } = parseTokensFromUrl(url);
    
    console.log('[AuthCallback] Parsed - access_token:', !!accessToken, 'refresh_token:', !!refreshToken, 'token_hash:', tokenHash, 'type:', tokenType);

    if (accessToken && refreshToken) {
      await handleAuthWithTokens(accessToken, refreshToken);
      return;
    }

    if (tokenHash && tokenType) {
      await handleAuthWithOtp(tokenHash, tokenType);
      return;
    }

    if (user) {
      router.replace('/');
      return;
    }

    const { data } = await supabase.auth.getSession();
    if (data.session) {
      router.replace('/');
      return;
    }

    setError('Lien invalide ou expiré');
    setVerifying(false);
  };

  useEffect(() => {
    let mounted = true;

    const handleDeepLink = async () => {
      console.log('[AuthCallback] Starting...');
      console.log('[AuthCallback] Params from router:', JSON.stringify(params));
      
      if (params.access_token && params.refresh_token) {
        console.log('[AuthCallback] Tokens found in router params');
        await handleAuthWithTokens(params.access_token, params.refresh_token);
        return;
      }

      if (params.token_hash && params.type) {
        console.log('[AuthCallback] Token hash found in router params');
        await handleAuthWithOtp(params.token_hash, params.type);
        return;
      }

      const initialUrl = await Linking.getInitialURL();
      console.log('[AuthCallback] Initial URL:', initialUrl);

      if (initialUrl) {
        await processUrl(initialUrl);
      } else {
        const currentUrl = await Linking.getInitialURL();
        console.log('[AuthCallback] Current URL check:', currentUrl);
        
        if (user) {
          router.replace('/');
          return;
        }
        
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          router.replace('/');
          return;
        }
        
        setError('Lien invalide ou expiré');
        setVerifying(false);
      }
    };

    const subscription = Linking.addEventListener('url', (event) => {
      console.log('[AuthCallback] URL event received:', event.url);
      if (mounted) {
        processUrl(event.url);
      }
    });

    const timeout = setTimeout(handleDeepLink, 300);

    return () => {
      mounted = false;
      subscription.remove();
      clearTimeout(timeout);
    };
  }, []);

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>{error}</Text>
        {debugInfo ? <Text style={styles.debugText}>{debugInfo}</Text> : null}
        <TouchableOpacity
          style={styles.button}
          onPress={() => router.replace('/')}
        >
          <Text style={styles.buttonText}>Retour à l'accueil</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#10b981" />
      <Text style={styles.text}>Connexion en cours...</Text>
      {debugInfo ? <Text style={styles.debugText}>{debugInfo}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 20,
    padding: 20,
  },
  text: {
    color: '#fff',
    fontSize: 16,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
  },
  debugText: {
    color: '#666',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 10,
  },
  button: {
    backgroundColor: '#10b981',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
