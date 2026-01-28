import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/utils/supabase';

export default function AuthCallbackScreen() {
  const { user } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(true);
  const params = useLocalSearchParams<{ token_hash?: string; type?: string }>();

  useEffect(() => {
    let processed = false;

    const handleDeepLink = async () => {
      if (processed) return;
      processed = true;

      try {
        const { token_hash, type } = params;

        if (token_hash && type === 'magiclink') {
          // Vérifier le token avec Supabase
          const { error } = await supabase.auth.verifyOtp({
            token_hash,
            type: 'magiclink',
          });

          if (error) {
            setError(error.message);
            setVerifying(false);
            return;
          }

          // Attendre un court instant pour que la session soit établie
          setTimeout(async () => {
            // Rediriger vers l'écran d'abonnement pour choisir un plan
            router.replace('/subscription');
          }, 1000);
        } else if (user) {
          // Pas de token mais utilisateur connecté - aller à l'abonnement
          router.replace('/subscription');
        } else {
          setError('Lien invalide ou expiré');
          setVerifying(false);
        }
      } catch (err) {
        setError('Erreur lors de la connexion');
        setVerifying(false);
      }
    };

    handleDeepLink();
  }, [user, params]);

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
