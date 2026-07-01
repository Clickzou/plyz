import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Platform, Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, FileText, Download } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { showAlert } from '@/utils/alertHelper';

const API_BASE = Platform.OS === 'web' ? '' : (process.env.EXPO_PUBLIC_STRIPE_SERVER_URL || '');

interface Invoice {
  id: string;
  invoice_number: string;
  prestation_label: string;
  prestation_date: string;
  amount_cents: number;
  currency: string;
  role: 'buyer' | 'seller';
  created_at: string;
}

export default function DocumentsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, language } = useLanguage();
  const { session } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const authHeaders = (): Record<string, string> => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (session?.access_token) h['Authorization'] = `Bearer ${session.access_token}`;
    return h;
  };

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/invoices`, { headers: authHeaders() });
        const data = await res.json();
        setInvoices(data?.invoices || []);
      } catch (e) {
        console.warn('[Documents] load error', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const formatMoney = (cents: number, currency: string) => {
    const sym: Record<string, string> = { eur: '€', usd: '$', gbp: '£' };
    return `${(cents / 100).toFixed(2)} ${sym[currency] || currency}`;
  };
  const formatDate = (d: string) => {
    try { return new Date(d).toLocaleDateString(language, { day: '2-digit', month: 'short', year: 'numeric' }); }
    catch { return d; }
  };

  const handleDownload = async (inv: Invoice) => {
    try {
      setDownloadingId(inv.id);
      const res = await fetch(`${API_BASE}/api/invoice/${inv.id}/download`, { headers: authHeaders() });
      const data = await res.json();
      if (data?.url) {
        await Linking.openURL(data.url);
      } else {
        throw new Error('no url');
      }
    } catch (e) {
      showAlert(t('error') || 'Erreur', t('docsError') || 'Impossible d\'ouvrir le document.');
    } finally {
      setDownloadingId(null);
    }
  };

  const revenueTotal = invoices
    .filter((i) => i.role === 'seller')
    .reduce((sum, i) => sum + (i.amount_cents || 0), 0);
  const hasSeller = invoices.some((i) => i.role === 'seller');

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0a1628', '#0f2035', '#0a1628']} style={StyleSheet.absoluteFill} />
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <ArrowLeft size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('docsTitle') || 'Mes documents'}</Text>
        <View style={{ width: 38 }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#10b981" /></View>
      ) : (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]} showsVerticalScrollIndicator={false}>
          <Text style={styles.subtitle}>{t('docsSubtitle') || 'Retrouve ici les factures de tes prestations.'}</Text>

          {hasSeller && (
            <View style={styles.revenueBox}>
              <Text style={styles.revenueLabel}>{t('docsRevenueTotal') || 'Total de tes revenus facturés'}</Text>
              <Text style={styles.revenueValue}>{formatMoney(revenueTotal, invoices[0]?.currency || 'eur')}</Text>
            </View>
          )}

          {invoices.length === 0 ? (
            <View style={styles.emptyBox}>
              <FileText size={48} color="#334155" />
              <Text style={styles.emptyText}>{t('docsEmpty') || 'Aucune facture pour le moment.'}</Text>
            </View>
          ) : (
            invoices.map((inv) => (
              <View key={inv.id} style={styles.card}>
                <View style={styles.cardIcon}><FileText size={20} color="#10b981" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle} numberOfLines={1}>{inv.prestation_label}</Text>
                  <Text style={styles.cardSub}>
                    {inv.invoice_number} · {formatDate(inv.prestation_date || inv.created_at)}
                  </Text>
                  <View style={styles.cardMetaRow}>
                    <Text style={styles.cardAmount}>{formatMoney(inv.amount_cents, inv.currency)}</Text>
                    <View style={[styles.badge, inv.role === 'seller' ? styles.badgeSeller : styles.badgeBuyer]}>
                      <Text style={styles.badgeText}>
                        {inv.role === 'seller' ? (t('docsSeller') || 'Revenu') : (t('docsBuyer') || 'Payé')}
                      </Text>
                    </View>
                  </View>
                </View>
                <TouchableOpacity style={styles.dlBtn} onPress={() => handleDownload(inv)} disabled={downloadingId === inv.id}>
                  {downloadingId === inv.id ? <ActivityIndicator size="small" color="#38bdf8" /> : <Download size={20} color="#38bdf8" />}
                </TouchableOpacity>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a1628' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12 },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { paddingHorizontal: 16, paddingTop: 8 },
  subtitle: { color: 'rgba(255,255,255,0.7)', fontSize: 13.5, lineHeight: 20, marginBottom: 18 },
  revenueBox: { backgroundColor: 'rgba(16,185,129,0.12)', borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)', borderRadius: 12, padding: 16, marginBottom: 18 },
  revenueLabel: { color: '#a7f3d0', fontSize: 12.5, marginBottom: 4 },
  revenueValue: { color: '#10b981', fontSize: 24, fontWeight: '800' },
  emptyBox: { alignItems: 'center', paddingVertical: 60, gap: 14 },
  emptyText: { color: '#64748b', fontSize: 15 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', borderRadius: 12, padding: 14, marginBottom: 10 },
  cardIcon: { width: 40, height: 40, borderRadius: 10, backgroundColor: 'rgba(16,185,129,0.12)', justifyContent: 'center', alignItems: 'center' },
  cardTitle: { color: '#fff', fontSize: 15, fontWeight: '600' },
  cardSub: { color: '#94a3b8', fontSize: 12, marginTop: 2 },
  cardMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  cardAmount: { color: '#e2e8f0', fontSize: 14, fontWeight: '700' },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  badgeSeller: { backgroundColor: 'rgba(16,185,129,0.2)' },
  badgeBuyer: { backgroundColor: 'rgba(56,189,248,0.2)' },
  badgeText: { color: '#cbd5e1', fontSize: 11, fontWeight: '600' },
  dlBtn: { width: 40, height: 40, borderRadius: 10, backgroundColor: 'rgba(56,189,248,0.12)', justifyContent: 'center', alignItems: 'center' },
});
