import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import * as Linking from 'expo-linking';
import { supabase } from '@/utils/supabase';

export default function AuthCallbackScreen() {
  const { user, getPostAuthRedirect, clearPostAuthRedirect } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const currentUrl = Linking.useURL();

  useEffect(() => {
    let processed = false;

    const handleDeepLink = async () => {
      if (processed) return;
      processed = true;

      try {
        // Récupérer l'URL initiale (si l'app était fermée)
        const initialUrl = await Linking.getInitialURL();

        // Utiliser l'URL actuelle ou l'URL initiale
        const url = currentUrl || initialUrl;

        if (url) {
          const parsed = Linking.parse(url);
          const { token_hash, type } = parsed.queryParams as { token_hash?: string; type?: string };

          if (token_hash && type === 'magiclink') {
            // Vérifier le token avec Supabase
            const { error } = await supabase.auth.verifyOtp({
              token_hash,
              type: 'magiclink',
            });

            if (error) {
              setError(error.message);
              return;
            }

            // Attendre un court instant pour que la session soit établie
            setTimeout(async () => {
              const redirectPath = await getPostAuthRedirect();
              await clearPostAuthRedirect();

              if (redirectPath) {
                router.replace(redirectPath as any);
              } else {
                router.replace('/account');
              }
            }, 1000);
          } else {
            // Pas de token dans l'URL, vérifier si l'utilisateur est déjà connecté
            if (user) {
              const redirectPath = await getPostAuthRedirect();
              await clearPostAuthRedirect();

              if (redirectPath) {
                router.replace(redirectPath as any);
              } else {
                router.replace('/account');
              }
            } else {
              setError('Lien invalide ou expiré');
            }
          }
        } else {
          // Pas d'URL, vérifier si l'utilisateur est déjà connecté
          if (user) {
            const redirectPath = await getPostAuthRedirect();
            await clearPostAuthRedirect();

            if (redirectPath) {
              router.replace(redirectPath as any);
            } else {
              router.replace('/account');
            }
          } else {
            setError('Aucun lien de connexion détecté');
          }
        }
      } catch (error) {
        setError('Erreur lors de la connexion');
      }
    };

    handleDeepLink();
  }, [user, currentUrl, getPostAuthRedirect, clearPostAuthRedirect]);

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity
          style={styles.button}
          onPress={() => router.replace('/account')}
        >
          <Text style={styles.buttonText}>Retour au compte</Text>
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
