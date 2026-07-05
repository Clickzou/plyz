import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Platform, Linking, Modal,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, FileText, Download, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { showAlert } from '@/utils/alertHelper';

// On utilise toujours l'URL serveur complète (y compris sur web) : il n'y a pas
// de version web publique servie par le serveur, donc same-origin ('') ne marche
// pas en dev. Le serveur autorise le CORS.
const API_BASE = process.env.EXPO_PUBLIC_STRIPE_SERVER_URL || '';

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

type PeriodKey = 'month' | '3months' | '6months' | 'year' | 'all';
const PERIOD_DAYS: Record<PeriodKey, number | null> = {
  month: 30, '3months': 90, '6months': 180, year: 365, all: null,
};

export default function DocumentsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, language } = useLanguage();
  const { session } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [period, setPeriod] = useState<PeriodKey>('all');
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);

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

  const downloadAll = async () => {
    try {
      setDownloadingAll(true);
      const res = await fetch(`${API_BASE}/api/invoices/export?period=${period}`, { headers: authHeaders() });
      const data = await res.json();
      if (!data?.html || !data?.count) {
        showAlert(t('docsEmptyTitle' as any) || 'Aucune facture', t('docsEmptyPeriod' as any) || 'Aucune facture sur cette période.');
        return;
      }
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined') {
          const w = window.open('', '_blank');
          if (w) { w.document.write(data.html); w.document.close(); }
        }
      } else {
        setPreviewHtml(data.html);
      }
    } catch (e) {
      showAlert(t('error') || 'Erreur', t('docsError') || 'Impossible d\'ouvrir le document.');
    } finally {
      setDownloadingAll(false);
    }
  };

  const periodDays = PERIOD_DAYS[period];
  const visibleInvoices = invoices.filter((i) => {
    if (!periodDays) return true;
    return Date.now() - new Date(i.created_at).getTime() <= periodDays * 86400000;
  });

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

          {/* Filtre par période */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.periodRow} contentContainerStyle={styles.periodRowContent}>
            {(['month', '3months', '6months', 'year', 'all'] as PeriodKey[]).map((p) => (
              <TouchableOpacity
                key={p}
                style={[styles.periodChip, period === p && styles.periodChipActive]}
                onPress={() => setPeriod(p)}
                activeOpacity={0.8}
              >
                <Text style={[styles.periodChipTxt, period === p && styles.periodChipTxtActive]}>
                  {t(('period_' + p) as any) || ({ month: '1 mois', '3months': '3 mois', '6months': '6 mois', year: '1 an', all: 'Tout' } as Record<PeriodKey, string>)[p]}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {visibleInvoices.length > 0 && (
            <TouchableOpacity style={styles.downloadAllBtn} onPress={downloadAll} disabled={downloadingAll} activeOpacity={0.85}>
              {downloadingAll ? <ActivityIndicator size="small" color="#fff" /> : <Download size={18} color="#fff" />}
              <Text style={styles.downloadAllTxt}>{t('invDownloadAll' as any) || 'Tout télécharger'}</Text>
            </TouchableOpacity>
          )}

          {visibleInvoices.length === 0 ? (
            <View style={styles.emptyBox}>
              <FileText size={48} color="#334155" />
              <Text style={styles.emptyText}>{t('docsEmpty') || 'Aucune facture pour le moment.'}</Text>
            </View>
          ) : (
            visibleInvoices.map((inv) => (
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

      {/* Aperçu « Toutes mes factures » (mobile) */}
      <Modal visible={!!previewHtml} animationType="slide" onRequestClose={() => setPreviewHtml(null)}>
        <View style={{ flex: 1, backgroundColor: '#fff' }}>
          <View style={[styles.previewHeader, { paddingTop: insets.top + 8 }]}>
            <Text style={styles.previewTitle} numberOfLines={1}>{t('docsExportTitle' as any) || 'Toutes mes factures'}</Text>
            <TouchableOpacity onPress={() => setPreviewHtml(null)} style={styles.previewClose}>
              <X size={22} color="#0f172a" />
            </TouchableOpacity>
          </View>
          {previewHtml ? (
            <WebView originWhitelist={['*']} source={{ html: previewHtml }} style={{ flex: 1 }} />
          ) : null}
        </View>
      </Modal>
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
  periodRow: { marginBottom: 12 },
  periodRowContent: { gap: 8, paddingRight: 8 },
  periodChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  periodChipActive: { backgroundColor: 'rgba(16,185,129,0.18)', borderColor: 'rgba(16,185,129,0.5)' },
  periodChipTxt: { color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: '600' },
  periodChipTxtActive: { color: '#10b981' },
  downloadAllBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#38bdf8', borderRadius: 12, paddingVertical: 12, marginBottom: 16 },
  downloadAllTxt: { color: '#fff', fontSize: 15, fontWeight: '700' },
  previewHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  previewTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a', flex: 1 },
  previewClose: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center' },
});
