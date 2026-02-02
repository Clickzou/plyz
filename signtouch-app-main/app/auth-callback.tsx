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
    let retryCount = 0;
    const maxRetries = 5;

    const checkSession = async (): Promise<boolean> => {
      const { data } = await supabase.auth.getSession();
      return !!data.session;
    };

    const handleDeepLink = async () => {
      if (processed) return;
      processed = true;

      console.log('[AuthCallback] Starting...');

      // Attendre un peu que Supabase synchronise la session
      const checkWithRetry = async () => {
        for (let i = 0; i < maxRetries; i++) {
          console.log('[AuthCallback] Checking session, attempt:', i + 1);
          
          if (user) {
            console.log('[AuthCallback] User found from context, redirecting...');
            router.replace('/subscription');
            return true;
          }

          const hasSession = await checkSession();
          if (hasSession) {
            console.log('[AuthCallback] Session found, redirecting...');
            router.replace('/subscription');
            return true;
          }

          // Attendre avant de réessayer
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        return false;
      };

      const success = await checkWithRetry();
      
      if (!success) {
        console.log('[AuthCallback] No session found after retries');
        setError('Lien invalide ou expiré');
        setVerifying(false);
      }
    };

    const timeout = setTimeout(() => {
      handleDeepLink();
    }, 500);

    return () => clearTimeout(timeout);
  }, [user]);

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
