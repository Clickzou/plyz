import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/utils/supabase';
import * as Linking from 'expo-linking';

export default function AuthCallbackScreen() {
  const { user } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(true);
  const [debugInfo, setDebugInfo] = useState<string>('');
  const params = useLocalSearchParams<{ token_hash?: string; type?: string; access_token?: string; refresh_token?: string }>();

  useEffect(() => {
    let processed = false;

    const handleAuth = async () => {
      if (processed) return;
      processed = true;

      try {
        console.log('[AuthCallback] Starting...');
        console.log('[AuthCallback] Params:', JSON.stringify(params));
        
        const initialUrl = await Linking.getInitialURL();
        console.log('[AuthCallback] Initial URL:', initialUrl);
        setDebugInfo(`URL: ${initialUrl?.substring(0, 100)}...`);

        let accessToken: string | undefined;
        let refreshToken: string | undefined;
        let tokenHash: string | undefined = params.token_hash;
        let tokenType: string | undefined = params.type;

        if (initialUrl) {
          if (initialUrl.includes('#')) {
            const fragment = initialUrl.split('#')[1];
            if (fragment) {
              const fragmentParams = new URLSearchParams(fragment);
              accessToken = fragmentParams.get('access_token') || undefined;
              refreshToken = fragmentParams.get('refresh_token') || undefined;
              tokenHash = tokenHash || fragmentParams.get('token_hash') || undefined;
              tokenType = tokenType || fragmentParams.get('type') || undefined;
              console.log('[AuthCallback] Fragment tokens found:', !!accessToken, !!refreshToken);
            }
          }
          
          if (initialUrl.includes('?')) {
            const queryString = initialUrl.split('?')[1]?.split('#')[0];
            if (queryString) {
              const queryParams = new URLSearchParams(queryString);
              accessToken = accessToken || queryParams.get('access_token') || undefined;
              refreshToken = refreshToken || queryParams.get('refresh_token') || undefined;
              tokenHash = tokenHash || queryParams.get('token_hash') || undefined;
              tokenType = tokenType || queryParams.get('type') || undefined;
            }
          }
        }

        accessToken = accessToken || params.access_token;
        refreshToken = refreshToken || params.refresh_token;

        console.log('[AuthCallback] Has access_token:', !!accessToken);
        console.log('[AuthCallback] Has refresh_token:', !!refreshToken);
        console.log('[AuthCallback] Token hash:', tokenHash);
        console.log('[AuthCallback] Token type:', tokenType);

        if (accessToken && refreshToken) {
          console.log('[AuthCallback] Setting session with tokens...');
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          
          if (sessionError) {
            console.log('[AuthCallback] Session error:', sessionError.message);
            setError(sessionError.message);
            setVerifying(false);
            return;
          }
          
          console.log('[AuthCallback] Session set successfully!');
          router.replace('/subscription');
          return;
        }

        if (tokenHash && tokenType) {
          console.log('[AuthCallback] Verifying OTP with token_hash...');
          const { error: verifyError } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: tokenType as any,
          });

          if (verifyError) {
            console.log('[AuthCallback] Verify error:', verifyError.message);
            setError(verifyError.message);
            setVerifying(false);
            return;
          }

          console.log('[AuthCallback] OTP verified!');
          router.replace('/subscription');
          return;
        }

        if (user) {
          console.log('[AuthCallback] User already logged in');
          router.replace('/subscription');
          return;
        }

        const { data } = await supabase.auth.getSession();
        if (data.session) {
          console.log('[AuthCallback] Existing session found');
          router.replace('/subscription');
          return;
        }

        console.log('[AuthCallback] No valid tokens or session found');
        setError('Lien invalide ou expiré');
        setVerifying(false);
      } catch (err) {
        console.log('[AuthCallback] Error:', err);
        setError('Erreur lors de la connexion');
        setVerifying(false);
      }
    };

    const timeout = setTimeout(handleAuth, 300);
    return () => clearTimeout(timeout);
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
