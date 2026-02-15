import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Platform, Linking,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Video, Clock, CreditCard, ChevronRight, Shield } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { showAlert } from '@/utils/alertHelper';

const API_BASE = Platform.OS === 'web' ? '' : (process.env.EXPO_PUBLIC_STRIPE_SERVER_URL || '');

export default function BookVideoCallScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { user } = useAuth();
  const params = useLocalSearchParams<{
    celebrityId: string;
    celebrityName: string;
    priceCents: string;
    currency: string;
    durationMinutes: string;
    unit: string;
  }>();

  const priceCents = parseInt(params.priceCents || '0', 10);
  const defaultDuration = parseInt(params.durationMinutes || '15', 10);
  const currency = params.currency || 'eur';
  const unit = params.unit || 'session';
  const celebrityName = params.celebrityName || '';

  const [duration, setDuration] = useState(defaultDuration);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const durations = unit === 'minute'
    ? [5, 10, 15, 20, 30]
    : [defaultDuration];

  const totalCents = unit === 'minute' ? priceCents * duration : priceCents;
  const signTouchFee = Math.round(totalCents * 0.15);
  const stripeFee = Math.round(totalCents * 0.029) + 30;
  const celebrityReceives = totalCents - signTouchFee - stripeFee;

  const formatPrice = (cents: number) => {
    const amount = (cents / 100).toFixed(2);
    const symbols: Record<string, string> = { eur: '€', usd: '$', gbp: '£' };
    return `${amount}${symbols[currency] || currency}`;
  };

  const handlePay = async () => {
    if (!user) {
      showAlert(t('info') || 'Info', t('mySpaceSignInTitle') || 'Please sign in first');
      return;
    }
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/api/book-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fan_id: user.id,
          celebrity_id: params.celebrityId,
          duration_minutes: duration,
          message: message.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.error) {
        showAlert(t('error') || 'Error', data.error);
        return;
      }
      if (data.checkout_url) {
        if (Platform.OS === 'web') {
          window.location.href = data.checkout_url;
        } else {
          Linking.openURL(data.checkout_url);
        }
      }
    } catch (err) {
      console.error('Booking error:', err);
      showAlert(t('error') || 'Error', t('bookingError') || 'Failed to create booking');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient colors={['#0a1628', '#0f2035', '#0a1628']} style={StyleSheet.absoluteFill} />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <ArrowLeft size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('bookVideoCall') || 'Book Video Call'}</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.celebrityCard}>
          <View style={styles.videoIconWrap}>
            <Video size={28} color="#10b981" />
          </View>
          <Text style={styles.celebrityName}>{celebrityName}</Text>
          <Text style={styles.pricePerUnit}>
            {formatPrice(priceCents)}{unit === 'minute' ? (t('perMinute') || '/min') : (t('perSession') || '/session')}
          </Text>
        </View>

        {unit === 'minute' && durations.length > 1 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>{t('bookingDuration') || 'Duration'}</Text>
            <View style={styles.durationRow}>
              {durations.map(d => (
                <TouchableOpacity
                  key={d}
                  style={[styles.durationChip, duration === d && styles.durationChipActive]}
                  onPress={() => setDuration(d)}
                  activeOpacity={0.7}
                >
                  <Clock size={14} color={duration === d ? '#fff' : '#9ca3af'} />
                  <Text style={[styles.durationText, duration === d && styles.durationTextActive]}>
                    {d} min
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t('autographMessage') || 'Your message (optional)'}</Text>
          <TextInput
            style={styles.messageInput}
            placeholder={t('bookingMessagePlaceholder') || 'Say something to the celebrity...'}
            placeholderTextColor="#6b7280"
            value={message}
            onChangeText={setMessage}
            multiline
            maxLength={300}
          />
          <Text style={styles.charCount}>{message.length}/300</Text>
        </View>

        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>{t('bookingTotal') || 'Summary'}</Text>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>
              {t('videoCallPrice') || 'Video Call'} ({duration}min)
            </Text>
            <Text style={styles.summaryValue}>{formatPrice(totalCents)}</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabelSmall}>{t('platformFee') || 'Platform fee (15%)'}</Text>
            <Text style={styles.summaryValueSmall}>-{formatPrice(signTouchFee)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabelSmall}>{t('marketplaceStripeFee') || 'Stripe fee'}</Text>
            <Text style={styles.summaryValueSmall}>-{formatPrice(stripeFee)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabelSmall}>{t('celebrityReceives') || 'Celebrity receives'}</Text>
            <Text style={[styles.summaryValueSmall, { color: '#10b981' }]}>{formatPrice(celebrityReceives)}</Text>
          </View>
        </View>

        <View style={styles.securityNote}>
          <Shield size={16} color="#6b7280" />
          <Text style={styles.securityText}>
            {t('bookingSecurityNote') || 'Payment is pre-authorized only. You will only be charged after the call takes place.'}
          </Text>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <TouchableOpacity
          style={[styles.payBtn, loading && styles.payBtnDisabled]}
          onPress={handlePay}
          disabled={loading}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <CreditCard size={20} color="#fff" />
              <Text style={styles.payBtnText}>
                {t('proceedToPayment') || 'Proceed to Payment'} · {formatPrice(totalCents)}
              </Text>
              <ChevronRight size={18} color="#fff" />
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a1628' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  backBtn: { padding: 8, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.08)' },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  content: { paddingHorizontal: 16, paddingBottom: 120 },
  celebrityCard: {
    alignItems: 'center', paddingVertical: 24,
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 16, marginBottom: 20,
  },
  videoIconWrap: {
    width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(16,185,129,0.15)',
    justifyContent: 'center', alignItems: 'center', marginBottom: 12,
  },
  celebrityName: { color: '#fff', fontSize: 22, fontWeight: '700', marginBottom: 4 },
  pricePerUnit: { color: '#10b981', fontSize: 16, fontWeight: '600' },
  section: { marginBottom: 20 },
  sectionLabel: { color: '#9ca3af', fontSize: 13, fontWeight: '600', textTransform: 'uppercase', marginBottom: 10 },
  durationRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  durationChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  durationChipActive: { backgroundColor: '#10b981', borderColor: '#10b981' },
  durationText: { color: '#9ca3af', fontSize: 14, fontWeight: '600' },
  durationTextActive: { color: '#fff' },
  messageInput: {
    backgroundColor: 'rgba(255,255,255,0.06)', color: '#fff', borderRadius: 14,
    padding: 14, fontSize: 15, minHeight: 80, textAlignVertical: 'top',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  charCount: { color: '#6b7280', fontSize: 12, textAlign: 'right', marginTop: 4 },
  summaryCard: {
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 16, padding: 18, marginBottom: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  summaryTitle: { color: '#fff', fontSize: 16, fontWeight: '700', marginBottom: 14 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  summaryLabel: { color: '#d1d5db', fontSize: 15 },
  summaryValue: { color: '#fff', fontSize: 17, fontWeight: '700' },
  summaryLabelSmall: { color: '#6b7280', fontSize: 13 },
  summaryValueSmall: { color: '#9ca3af', fontSize: 13 },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginVertical: 10 },
  securityNote: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 14,
  },
  securityText: { color: '#6b7280', fontSize: 13, flex: 1, lineHeight: 18 },
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 16, paddingTop: 12,
    backgroundColor: 'rgba(10,22,40,0.95)', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)',
  },
  payBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: '#10b981', paddingVertical: 16, borderRadius: 14,
  },
  payBtnDisabled: { opacity: 0.6 },
  payBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
