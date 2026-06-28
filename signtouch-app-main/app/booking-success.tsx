import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { CheckCircle, ArrowRight, Video, XCircle, RefreshCw } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '@/contexts/LanguageContext';
import { authedFetch } from '@/utils/authedFetch';

const API_BASE = Platform.OS === 'web' ? '' : (process.env.EXPO_PUBLIC_STRIPE_SERVER_URL || '');

export default function BookingSuccessScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { booking_id, session_id } = useLocalSearchParams<{ booking_id: string; session_id: string }>();
  const [verifying, setVerifying] = useState(true);
  const [verified, setVerified] = useState(false);

  const verify = async () => {
    setVerifying(true);
    setVerified(false);
    try {
      if (!session_id) {
        setVerified(false);
        return;
      }
      const res = await fetch(`${API_BASE}/api/verify-payment?session_id=${session_id}`);
      const data = await res.json();
      if (data.status === 'complete' || data.status === 'paid' || data.authorized) {
        setVerified(true);
        if (booking_id) {
          await authedFetch(`${API_BASE}/api/update-booking-status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ booking_id, status: 'paid' }),
          });
        }
      }
    } catch (err) {
      console.error('Verify error:', err);
    } finally {
      setVerifying(false);
    }
  };

  useEffect(() => {
    verify();
  }, [booking_id, session_id]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient colors={['#0a1628', '#0f2035', '#0a1628']} style={StyleSheet.absoluteFill} />

      <View style={styles.center}>
        {verifying ? (
          <>
            <ActivityIndicator size="large" color="#10b981" />
            <Text style={styles.verifyingText}>{t('verifyingPayment') || 'Verifying payment...'}</Text>
          </>
        ) : verified ? (
          <>
            <View style={styles.successCircle}>
              <CheckCircle size={64} color="#10b981" />
            </View>
            <Text style={styles.title}>{t('bookingSuccess') || 'Booking confirmed!'}</Text>
            <Text style={styles.subtitle}>
              {t('bookingSuccessHint') || 'You will be notified when the celebrity accepts'}
            </Text>

            <View style={styles.infoCard}>
              <Video size={20} color="#10b981" />
              <Text style={styles.infoText}>
                {t('bookingSuccessInfo') || 'The celebrity will review your booking request. Once accepted, you will receive instructions to join the video call.'}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.goBtn}
              onPress={() => router.replace('/my-space' as any)}
              activeOpacity={0.8}
            >
              <Text style={styles.goBtnText}>{t('goToMySpace') || 'Go to My Space'}</Text>
              <ArrowRight size={18} color="#fff" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.discoverBtn}
              onPress={() => router.replace('/discover' as any)}
              activeOpacity={0.8}
            >
              <Text style={styles.discoverBtnText}>{t('backToDiscover') || 'Back to Discover'}</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View style={[styles.successCircle, { backgroundColor: 'rgba(239,68,68,0.12)' }]}>
              <XCircle size={64} color="#ef4444" />
            </View>
            <Text style={styles.title}>{t('paymentFailed') || 'Payment not verified'}</Text>
            <Text style={styles.subtitle}>
              {t('paymentFailedHint') || 'We could not verify your payment. Please try again or contact support.'}
            </Text>

            <TouchableOpacity
              style={[styles.goBtn, { backgroundColor: '#3b82f6' }]}
              onPress={verify}
              activeOpacity={0.8}
            >
              <RefreshCw size={18} color="#fff" />
              <Text style={styles.goBtnText}>{t('retry') || 'Try again'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.discoverBtn}
              onPress={() => router.replace('/my-space' as any)}
              activeOpacity={0.8}
            >
              <Text style={styles.discoverBtnText}>{t('goToMySpace') || 'Go to My Space'}</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a1628' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  verifyingText: { color: '#9ca3af', fontSize: 16, marginTop: 16 },
  successCircle: {
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: 'rgba(16,185,129,0.12)', justifyContent: 'center', alignItems: 'center',
    marginBottom: 24,
  },
  title: { color: '#fff', fontSize: 26, fontWeight: '700', textAlign: 'center', marginBottom: 8 },
  subtitle: { color: '#9ca3af', fontSize: 15, textAlign: 'center', marginBottom: 32, lineHeight: 22 },
  infoCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: 'rgba(16,185,129,0.08)', borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: 'rgba(16,185,129,0.15)', marginBottom: 32, width: '100%',
  },
  infoText: { color: '#d1d5db', fontSize: 14, flex: 1, lineHeight: 20 },
  goBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#10b981', paddingVertical: 16, paddingHorizontal: 32,
    borderRadius: 14, width: '100%', justifyContent: 'center', marginBottom: 12,
  },
  goBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  discoverBtn: {
    paddingVertical: 12, paddingHorizontal: 24,
  },
  discoverBtnText: { color: '#6b7280', fontSize: 14 },
});
