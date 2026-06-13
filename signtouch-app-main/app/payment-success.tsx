import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { AlertCircle, Shield } from 'lucide-react-native';
import { useLanguage } from '@/contexts/LanguageContext';

const STRIPE_SERVER_URL = process.env.EXPO_PUBLIC_STRIPE_SERVER_URL || '';

export default function PaymentSuccessScreen() {
  const router = useRouter();
  const { t } = useLanguage();
  const params = useLocalSearchParams<{
    checkout_session_id: string;
    live_session_id: string;
    celebrity_id: string;
    celebrity_name: string;
    duration_minutes: string;
    price_cents: string;
    fan_name: string;
    celebrity_stripe_account_id: string;
  }>();

  const [, setVerified] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    verifyAndRedirect();
  }, []);

  const verifyAndRedirect = async () => {
    try {
      if (!params.checkout_session_id) {
        console.error('[PaymentSuccess] Missing checkout session ID');
        setError(true);
        return;
      }

      const response = await fetch(
        `${STRIPE_SERVER_URL}/api/verify-payment?checkout_session_id=${params.checkout_session_id}`
      );
      const data = await response.json();
      console.log('[PaymentSuccess] Verification:', data);

      const isAuthorized = data.authorized === true || data.paid === true;

      if (isAuthorized) {
        setVerified(true);
        setTimeout(() => {
          router.replace({
            pathname: '/join-event',
            params: {
              checkoutSessionId: params.checkout_session_id,
              sessionId: params.live_session_id || '',
              celebrityId: params.celebrity_id || '',
              celebrityName: params.celebrity_name ? decodeURIComponent(params.celebrity_name) : '',
              durationMinutes: params.duration_minutes || '5',
              priceCents: params.price_cents || '0',
              fanName: params.fan_name ? decodeURIComponent(params.fan_name) : '',
              celebrityStripeAccountId: params.celebrity_stripe_account_id || '',
              paymentAuthorized: 'true',
            },
          });
        }, 2000);
      } else {
        setError(true);
      }
    } catch (err) {
      console.error('[PaymentSuccess] Error:', err);
      setError(true);
    }
  };

  if (error) {
    return (
      <View style={styles.container}>
        <LinearGradient colors={['#0a1628', '#0f2030', '#0a1628']} style={StyleSheet.absoluteFill} />
        <View style={styles.content}>
          <AlertCircle size={80} color="#f59e0b" />
          <Text style={styles.errorTitle}>{t('error') || 'Erreur'}</Text>
          <Text style={styles.message}>
            {t('paymentVerificationFailed') || 'La vérification du paiement a échoué. Contactez le support.'}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0a1628', '#0f2030', '#0a1628']} style={StyleSheet.absoluteFill} />
      <View style={styles.content}>
        <Shield size={80} color="#10B981" />
        <Text style={styles.title}>{t('authorizationSuccess') || 'Pré-autorisation réussie !'}</Text>
        <Text style={styles.message}>
          {t('joiningQueueNow') || 'Vous allez rejoindre la file d\'attente...'}
        </Text>
        <ActivityIndicator size="large" color="#10B981" style={{ marginTop: 24 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a1628',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#10B981',
    marginTop: 24,
    textAlign: 'center',
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#f59e0b',
    marginTop: 24,
  },
  message: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 22,
  },
});
