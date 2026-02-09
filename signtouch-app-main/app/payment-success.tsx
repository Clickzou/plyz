import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { CheckCircle, AlertCircle } from 'lucide-react-native';
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
  }>();

  const [verified, setVerified] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    verifyAndRedirect();
  }, []);

  const verifyAndRedirect = async () => {
    try {
      let paymentVerified = false;

      if (!STRIPE_SERVER_URL || !params.checkout_session_id) {
        console.error('[PaymentSuccess] Missing server URL or checkout session ID');
        setError(true);
        return;
      }

      const response = await fetch(
        `${STRIPE_SERVER_URL}/api/verify-payment?checkout_session_id=${params.checkout_session_id}`
      );
      const data = await response.json();
      console.log('[PaymentSuccess] Verification:', data);
      paymentVerified = data.paid === true;

      if (paymentVerified) {
        setVerified(true);
        setTimeout(() => {
          router.replace({
            pathname: '/video-call',
            params: {
              roomUrl: '',
              sessionId: params.live_session_id || '',
              isHost: 'false',
              userName: '',
              durationPerFan: params.duration_minutes || '5',
              otherUserName: params.celebrity_name ? decodeURIComponent(params.celebrity_name) : '',
              priceCents: params.price_cents || '0',
              celebrityId: params.celebrity_id || '',
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
        <CheckCircle size={80} color="#10B981" />
        <Text style={styles.title}>{t('purchaseSuccess') || 'Paiement réussi !'}</Text>
        <Text style={styles.message}>
          {t('redirectingToCall') || 'Redirection vers votre appel vidéo...'}
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
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#10B981',
    marginTop: 24,
    textAlign: 'center',
  },
  errorTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#f59e0b',
    marginTop: 24,
    textAlign: 'center',
  },
  message: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 12,
    textAlign: 'center',
  },
});
