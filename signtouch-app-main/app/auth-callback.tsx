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
  const params = useLocalSearchParams<{ token_hash?: string; type?: string }>();

  useEffect(() => {
    let processed = false;

    const parseUrlParams = (url: string) => {
      const parsedUrl = Linking.parse(url);
      let tokenHash = parsedUrl.queryParams?.token_hash as string | undefined;
      let tokenType = parsedUrl.queryParams?.type as string | undefined;
      
      if (!tokenHash && url.includes('#')) {
        const fragment = url.split('#')[1];
        if (fragment) {
          const fragmentParams = new URLSearchParams(fragment);
          tokenHash = fragmentParams.get('token_hash') || undefined;
          tokenType = fragmentParams.get('type') || undefined;
          
          if (!tokenHash && fragmentParams.get('access_token')) {
            return { hasSession: true };
          }
        }
      }
      
      return { token_hash: tokenHash, type: tokenType };
    };

    const handleAuth = async (tokenHash: string, tokenType: string) => {
      try {
        console.log('[AuthCallback] Verifying OTP:', tokenType);
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

        console.log('[AuthCallback] Success, redirecting...');
        setTimeout(() => {
          router.replace('/subscription');
        }, 1000);
      } catch (err) {
        console.log('[AuthCallback] Error:', err);
        setError('Erreur lors de la connexion');
        setVerifying(false);
      }
    };

    const handleDeepLink = async () => {
      if (processed) return;
      processed = true;

      try {
        console.log('[AuthCallback] Starting, params:', params);
        let tokenHash = params.token_hash;
        let tokenType = params.type;

        if (!tokenHash || !tokenType) {
          const initialUrl = await Linking.getInitialURL();
          console.log('[AuthCallback] Initial URL:', initialUrl);
          if (initialUrl) {
            const urlParams = parseUrlParams(initialUrl);
            if ('hasSession' in urlParams && urlParams.hasSession) {
              const { data } = await supabase.auth.getSession();
              if (data.session) {
                router.replace('/subscription');
                return;
              }
            }
            tokenHash = urlParams.token_hash;
            tokenType = urlParams.type;
          }
        }

        console.log('[AuthCallback] Token hash:', tokenHash, 'Type:', tokenType);

        if (tokenHash && (tokenType === 'magiclink' || tokenType === 'email' || tokenType === 'signup')) {
          await handleAuth(tokenHash, tokenType);
        } else if (user) {
          router.replace('/subscription');
        } else {
          const { data } = await supabase.auth.getSession();
          if (data.session) {
            router.replace('/subscription');
          } else {
            console.log('[AuthCallback] No valid token found');
            setError('Lien invalide ou expiré');
            setVerifying(false);
          }
        }
      } catch (err) {
        console.log('[AuthCallback] Error:', err);
        setError('Erreur lors de la connexion');
        setVerifying(false);
      }
    };

    const timeout = setTimeout(() => {
      handleDeepLink();
    }, 500);

    return () => clearTimeout(timeout);
  }, [user, params]);

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>{error}</Text>
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
