import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Platform, Linking,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, PenTool, CreditCard, ChevronRight, Shield } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { useAuthPrompt } from '@/contexts/AuthPromptContext';
import { showAlert } from '@/utils/alertHelper';

const API_BASE = process.env.EXPO_PUBLIC_STRIPE_SERVER_URL || '';

export default function RequestAutographScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { user, session } = useAuth();
  const { requireAuth } = useAuthPrompt();
  const params = useLocalSearchParams<{
    celebrityId: string;
    celebrityName: string;
    priceCents: string;
    currency: string;
  }>();

  const priceCents = parseInt(params.priceCents || '0', 10);
  const currency = params.currency || 'eur';
  const celebrityName = params.celebrityName || '';

  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const plyzFee = Math.round(priceCents * 0.15);
  const stripeFee = Math.round(priceCents * 0.029) + 30;
  const celebrityReceives = priceCents - plyzFee - stripeFee;

  const formatPrice = (cents: number) => {
    const amount = (cents / 100).toFixed(2);
    const symbols: Record<string, string> = { eur: '€', usd: '$', gbp: '£' };
    return `${amount}${symbols[currency] || currency}`;
  };

  const handlePay = async () => {
    if (!user) { requireAuth(() => handlePay()); return; }
    try {
      setLoading(true);
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }
      const res = await fetch(`${API_BASE}/api/autograph`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          fan_id: user.id,
          celebrity_id: params.celebrityId,
          message: message.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        showAlert(t('error') || 'Error', data.message || data.error || (t('autographError') || 'Failed to create autograph request'));
        return;
      }
      if (data.checkout_url) {
        if (Platform.OS === 'web') {
          window.location.href = data.checkout_url;
        } else {
          Linking.openURL(data.checkout_url);
        }
      } else {
        showAlert(t('error') || 'Error', t('autographError') || 'Failed to create autograph request');
      }
    } catch (err) {
      console.error('Autograph error:', err);
      showAlert(t('error') || 'Error', t('autographError') || 'Failed to create autograph request');
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
        <Text style={styles.headerTitle}>{t('requestAutographTitle') || 'Request Dedication'}</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.celebrityCard}>
          <View style={styles.iconWrap}>
            <PenTool size={28} color="#f59e0b" />
          </View>
          <Text style={styles.celebrityName}>{celebrityName}</Text>
          <Text style={styles.price}>{formatPrice(priceCents)}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t('autographMessage') || 'Your message (optional)'}</Text>
          <TextInput
            style={styles.messageInput}
            placeholder={t('autographMessagePlaceholder') || 'Write a message to the celebrity...'}
            placeholderTextColor="#6b7280"
            value={message}
            onChangeText={setMessage}
            multiline
            maxLength={500}
          />
          <Text style={styles.charCount}>{message.length}/500</Text>
        </View>

        <View style={styles.hintCard}>
          <PenTool size={18} color="#f59e0b" />
          <View style={{ flex: 1 }}>
            <Text style={styles.hintTitle}>{t('autographHowItWorks') || 'How it works'}</Text>
            <Text style={styles.hintText}>
              {t('autographHowItWorksDesc') || 'After payment, the celebrity will receive your request and create a personalized autograph for you. You will be notified when it is ready.'}
            </Text>
          </View>
        </View>

        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>{t('bookingTotal') || 'Summary'}</Text>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>{t('requestAutographTitle') || 'Autograph'}</Text>
            <Text style={styles.summaryValue}>{formatPrice(priceCents)}</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabelSmall}>{t('platformFee') || 'Platform fee (15%)'}</Text>
            <Text style={styles.summaryValueSmall}>-{formatPrice(plyzFee)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabelSmall}>{t('marketplaceStripeFee') || 'Stripe fee'}</Text>
            <Text style={styles.summaryValueSmall}>-{formatPrice(stripeFee)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabelSmall}>{t('celebrityReceives') || 'Celebrity receives'}</Text>
            <Text style={[styles.summaryValueSmall, { color: '#f59e0b' }]}>{formatPrice(celebrityReceives)}</Text>
          </View>
        </View>

        <View style={styles.securityNote}>
          <Shield size={16} color="#6b7280" />
          <Text style={styles.securityText}>
            {t('autographSecurityNote') || 'Secure payment via Stripe. You will receive your autograph once the celebrity completes it.'}
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
                {t('proceedToPayment') || 'Pre-payment'} - {formatPrice(priceCents)}
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
  iconWrap: {
    width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(245,158,11,0.15)',
    justifyContent: 'center', alignItems: 'center', marginBottom: 12,
  },
  celebrityName: { color: '#fff', fontSize: 22, fontWeight: '700', marginBottom: 4 },
  price: { color: '#f59e0b', fontSize: 18, fontWeight: '700' },
  section: { marginBottom: 20 },
  sectionLabel: { color: '#9ca3af', fontSize: 13, fontWeight: '600', textTransform: 'uppercase', marginBottom: 10 },
  messageInput: {
    backgroundColor: 'rgba(255,255,255,0.06)', color: '#fff', borderRadius: 14,
    padding: 14, fontSize: 15, minHeight: 100, textAlignVertical: 'top',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  charCount: { color: '#6b7280', fontSize: 12, textAlign: 'right', marginTop: 4 },
  hintCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: 'rgba(245,158,11,0.08)', borderRadius: 14, padding: 16, marginBottom: 20,
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.15)',
  },
  hintTitle: { color: '#f59e0b', fontSize: 14, fontWeight: '700', marginBottom: 4 },
  hintText: { color: '#d1d5db', fontSize: 13, lineHeight: 18 },
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
    backgroundColor: '#f59e0b', paddingVertical: 16, borderRadius: 14,
  },
  payBtnDisabled: { opacity: 0.6 },
  payBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
