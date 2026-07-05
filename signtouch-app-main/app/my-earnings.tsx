import React, { useState, useEffect, useCallback } from 'react';
import { getDateLocale } from '@/utils/dateLocale';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Platform,
  Linking,
  Modal,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowLeft,
  TrendingUp,
  Users,
  Clock,
  Calendar,
  Video,
  DollarSign,
  CreditCard,
  FileText,
  Download,
  X,
  Eye,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { getOrCreateDeviceId } from '@/utils/ratingsStorage';
import { authedFetch } from '@/utils/authedFetch';
import { showAlert } from '@/utils/alertHelper';
import BottomNav from '@/components/BottomNav';

const STRIPE_SERVER_URL = process.env.EXPO_PUBLIC_STRIPE_SERVER_URL || '';

interface SessionStat {
  id: string;
  code: string;
  celebrity_name: string;
  status: string;
  price_cents: number;
  currency: string;
  max_slots: number;
  total_fans: number;
  completed_fans: number;
  duration_minutes: number;
  duration_per_fan_minutes: number;
  session_earnings_cents: number;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
}

interface EarningsData {
  celebrity_id: string;
  total_earnings_cents: number;
  total_fans: number;
  total_sessions: number;
  estimated_payout_date: string;
  sessions: SessionStat[];
  // Ajoutés serveur : total incluant les dédicaces (événements), pas seulement la vidéo.
  dedication_total_cents?: number;
  grand_total_cents?: number;
  video_month_cents?: number;
  dedication_month_cents?: number;
}

interface Invoice {
  id: string;
  invoice_number: string;
  prestation_label: string;
  prestation_date: string;
  amount_cents: number;
  commission_cents?: number;
  currency: string;
  role: 'buyer' | 'seller';
  created_at: string;
}

type PeriodKey = 'month' | '3months' | '6months' | 'year' | 'all';
const PERIOD_DAYS: Record<PeriodKey, number | null> = {
  month: 30, '3months': 90, '6months': 180, year: 365, all: null,
};

export default function MyEarningsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<EarningsData | null>(null);

  // Onglet Revenus / Factures (les factures étaient dans un écran séparé « Mes documents »).
  const [tab, setTab] = useState<'revenus' | 'factures'>('revenus');
  const [invSub, setInvSub] = useState<'fans' | 'plyz'>('fans');
  const [period, setPeriod] = useState<PeriodKey>('all');
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invLoading, setInvLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  // Aperçu de facture (WebView) avant téléchargement.
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewLabel, setPreviewLabel] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);

  const fetchEarnings = useCallback(async () => {
    if (!STRIPE_SERVER_URL) {
      setLoading(false);
      return;
    }
    try {
      const celebrityId = user?.id || await getOrCreateDeviceId();
      const response = await authedFetch(
        `${STRIPE_SERVER_URL}/api/celebrity-earnings?celebrity_id=${celebrityId}`
      );
      const result = await response.json();
      setData(result);
    } catch (e) {
      console.warn('[MyEarnings] Error fetching:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchEarnings();
  }, [fetchEarnings]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchEarnings();
    fetchInvoices();
  };

  const fetchInvoices = useCallback(async () => {
    if (!STRIPE_SERVER_URL) { setInvLoading(false); return; }
    try {
      const res = await authedFetch(`${STRIPE_SERVER_URL}/api/invoices`);
      const d = await res.json();
      setInvoices(d?.invoices || []);
    } catch (e) {
      console.warn('[MyEarnings] invoices error', e);
    } finally {
      setInvLoading(false);
    }
  }, []);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);

  const formatMoney = (cents: number, currency: string) => {
    const sym: Record<string, string> = { eur: '€', usd: '$', gbp: '£' };
    return `${(cents / 100).toFixed(2)} ${sym[currency] || currency}`;
  };

  // type='commission' → facture de commission Plyz ; sinon facture de prestation.
  const typeParam = () => (invSub === 'plyz' ? '?type=commission' : '');

  const handleDownloadInvoice = async (inv: Invoice) => {
    try {
      setDownloadingId(inv.id);
      const res = await authedFetch(`${STRIPE_SERVER_URL}/api/invoice/${inv.id}/download${typeParam()}`);
      const d = await res.json();
      if (d?.url) await Linking.openURL(d.url); else throw new Error('no url');
    } catch (e) {
      showAlert(t('error') || 'Erreur', t('docsError') || 'Impossible d\'ouvrir le document.');
    } finally {
      setDownloadingId(null);
    }
  };

  // Télécharge TOUTES les factures de la période en un seul document.
  const downloadAll = async () => {
    try {
      setDownloadingAll(true);
      const type = invSub === 'plyz' ? '&type=commission' : '';
      const res = await authedFetch(`${STRIPE_SERVER_URL}/api/invoices/export?period=${period}${type}`);
      const d = await res.json();
      if (!d?.html || !d?.count) {
        showAlert(t('docsEmptyTitle' as any) || 'Aucune facture', t('docsEmptyPeriod' as any) || 'Aucune facture sur cette période.');
        return;
      }
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined') {
          const w = window.open('', '_blank');
          if (w) { w.document.write(d.html); w.document.close(); }
        }
      } else {
        setPreviewLabel(t('docsExportTitle' as any) || 'Toutes mes factures');
        setPreviewUrl(null);
        setPreviewHtml(d.html);
      }
    } catch (e) {
      showAlert(t('error') || 'Erreur', t('docsError') || 'Impossible d\'ouvrir le document.');
    } finally {
      setDownloadingAll(false);
    }
  };

  // Aperçu (visualiser la facture avant de la télécharger).
  const viewInvoice = async (inv: Invoice) => {
    try {
      setPreviewLoading(true);
      setPreviewLabel(inv.invoice_number);
      const res = await authedFetch(`${STRIPE_SERVER_URL}/api/invoice/${inv.id}/download${typeParam()}`);
      const d = await res.json();
      if (!d?.url && !d?.html) throw new Error('no data');
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined') window.open(d.url, '_blank');
      } else {
        setPreviewUrl(d.url || null);
        setPreviewHtml(d.html || null);
      }
    } catch (e) {
      showAlert(t('error') || 'Erreur', t('docsError') || 'Impossible d\'ouvrir le document.');
    } finally {
      setPreviewLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString(getDateLocale(), {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString(getDateLocale(), {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes}min`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h${m}min` : `${h}h`;
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'active': return t('liveSessionActive') || 'En cours';
      case 'ended': return t('liveSessionEnded') || 'Terminé';
      case 'waiting': return t('liveSessionWaiting') || 'En attente';
      case 'paused': return t('liveSessionPaused') || 'En pause';
      default: return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return '#4ade80';
      case 'ended': return 'rgba(255,255,255,0.4)';
      case 'waiting': return '#f59e0b';
      case 'paused': return '#f59e0b';
      default: return '#fff';
    }
  };

  const paidSessions = (data?.sessions || []).filter(s => s.price_cents > 0);

  // Factures affichées : uniquement les ventes de la personnalité (role seller),
  // filtrées par la période choisie. L'onglet Plyz montre les MÊMES factures mais
  // sous l'angle « commission » (montant = commission_cents).
  const periodDays = PERIOD_DAYS[period];
  const visibleInvoices = invoices
    .filter((i) => i.role === 'seller')
    .filter((i) => {
      if (!periodDays) return true;
      return Date.now() - new Date(i.created_at).getTime() <= periodDays * 86400000;
    });

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient colors={['#1a1a2e', '#16213e', '#0f3460']} style={StyleSheet.absoluteFill} />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ArrowLeft size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('myEarnings') || 'Mes revenus'}</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Onglets Revenus / Factures */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'revenus' && styles.tabBtnActive]}
          onPress={() => setTab('revenus')}
          activeOpacity={0.8}
        >
          <TrendingUp size={16} color={tab === 'revenus' ? '#4ade80' : 'rgba(255,255,255,0.5)'} />
          <Text style={[styles.tabTxt, tab === 'revenus' && styles.tabTxtActive]}>{t('myEarningsTab' as any) || 'Revenus'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'factures' && styles.tabBtnActive]}
          onPress={() => setTab('factures')}
          activeOpacity={0.8}
        >
          <FileText size={16} color={tab === 'factures' ? '#4ade80' : 'rgba(255,255,255,0.5)'} />
          <Text style={[styles.tabTxt, tab === 'factures' && styles.tabTxtActive]}>{t('invoicesTab' as any) || 'Factures'}</Text>
        </TouchableOpacity>
      </View>

      {tab === 'factures' ? (
        invLoading ? (
          <View style={styles.loadingContainer}><ActivityIndicator size="large" color="#fff" /></View>
        ) : (
          <ScrollView
            style={styles.content}
            contentContainerStyle={styles.contentContainer}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
          >
            {/* Sous-onglets : Factures fans / Factures Plyz */}
            <View style={styles.subTabBar}>
              <TouchableOpacity
                style={[styles.subTabBtn, invSub === 'fans' && styles.subTabBtnActive]}
                onPress={() => setInvSub('fans')}
                activeOpacity={0.8}
              >
                <Text style={[styles.subTabTxt, invSub === 'fans' && styles.subTabTxtActive]}>
                  {t('invFansTab' as any) || 'Factures fans'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.subTabBtn, invSub === 'plyz' && styles.subTabBtnActive]}
                onPress={() => setInvSub('plyz')}
                activeOpacity={0.8}
              >
                <Text style={[styles.subTabTxt, invSub === 'plyz' && styles.subTabTxtActive]}>
                  {t('invPlyzTab' as any) || 'Factures Plyz'}
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.subTabHint}>
              {invSub === 'fans'
                ? (t('invFansHint' as any) || 'Factures des prestations que tu as vendues à tes fans.')
                : (t('invPlyzHint' as any) || 'Factures de commission de Plyz (mise en relation, 15 %).')}
            </Text>

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

            {/* Tout télécharger */}
            {visibleInvoices.length > 0 && (
              <TouchableOpacity style={styles.downloadAllBtn} onPress={downloadAll} disabled={downloadingAll} activeOpacity={0.85}>
                {downloadingAll ? <ActivityIndicator size="small" color="#fff" /> : <Download size={18} color="#fff" />}
                <Text style={styles.downloadAllTxt}>{t('invDownloadAll' as any) || 'Tout télécharger'}</Text>
              </TouchableOpacity>
            )}

            {visibleInvoices.length === 0 ? (
              <View style={styles.emptyState}>
                <FileText size={48} color="rgba(255,255,255,0.3)" />
                <Text style={styles.emptyText}>{t('docsEmpty' as any) || 'Aucune facture pour le moment.'}</Text>
              </View>
            ) : (
              visibleInvoices.map((inv) => {
                const isPlyz = invSub === 'plyz';
                const shownCents = isPlyz ? (inv.commission_cents || 0) : inv.amount_cents;
                return (
                <View key={inv.id} style={styles.invCard}>
                  <View style={styles.invIcon}><FileText size={20} color={isPlyz ? '#f59e0b' : '#10b981'} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.invTitle} numberOfLines={1}>{inv.prestation_label}</Text>
                    <Text style={styles.invSub}>{inv.invoice_number}{isPlyz ? ' · commission' : ''}</Text>
                    <View style={styles.invMetaRow}>
                      <Text style={styles.invAmount}>{formatMoney(shownCents, inv.currency)}</Text>
                      <View style={[styles.invBadge, isPlyz ? styles.invBadgeBuyer : styles.invBadgeSeller]}>
                        <Text style={styles.invBadgeText}>{isPlyz ? (t('invPlyzBadge' as any) || 'Commission') : (t('docsSeller' as any) || 'Revenu')}</Text>
                      </View>
                    </View>
                  </View>
                  <View style={styles.invActions}>
                    <TouchableOpacity style={styles.invViewBtn} onPress={() => viewInvoice(inv)} disabled={previewLoading}>
                      {previewLoading && previewLabel === inv.invoice_number ? <ActivityIndicator size="small" color="#10b981" /> : <Eye size={20} color="#10b981" />}
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.invDlBtn} onPress={() => handleDownloadInvoice(inv)} disabled={downloadingId === inv.id}>
                      {downloadingId === inv.id ? <ActivityIndicator size="small" color="#38bdf8" /> : <Download size={20} color="#38bdf8" />}
                    </TouchableOpacity>
                  </View>
                </View>
              );})
            )}
            <View style={{ height: 100 }} />
          </ScrollView>
        )
      ) : loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#fff" />
        </View>
      ) : (
        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />
          }
        >
          <View style={styles.totalCard}>
            <View style={styles.totalIconCircle}>
              <TrendingUp size={28} color="#4ade80" />
            </View>
            <Text style={styles.totalLabel}>{t('totalEarnings') || 'Revenus totaux'}</Text>
            <Text style={styles.totalAmount}>
              {(((data?.grand_total_cents ?? data?.total_earnings_cents) || 0) / 100).toFixed(2)}€
            </Text>
            <View style={styles.totalStatsRow}>
              <View style={styles.totalStatItem}>
                <Video size={16} color="rgba(255,255,255,0.6)" />
                <Text style={styles.totalStatText}>
                  {data?.total_sessions || 0} {t('sessions') || 'sessions'}
                </Text>
              </View>
              <View style={styles.totalStatItem}>
                <Users size={16} color="rgba(255,255,255,0.6)" />
                <Text style={styles.totalStatText}>
                  {data?.total_fans || 0} fans
                </Text>
              </View>
            </View>
            {/* Détail Vidéo / Dédicaces (le total additionne les deux). */}
            {(data?.dedication_total_cents || 0) > 0 && (
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownText}>
                  {t('earningsVideoPart' as any) || 'Vidéo'} {((data?.total_earnings_cents || 0) / 100).toFixed(2)}€
                  {'   ·   '}
                  {t('earningsDedicPart' as any) || 'Dédicaces'} {((data?.dedication_total_cents || 0) / 100).toFixed(2)}€
                </Text>
              </View>
            )}
          </View>

          {data?.estimated_payout_date && (data?.total_earnings_cents || 0) > 0 && (
            <View style={styles.payoutCard}>
              <View style={styles.payoutHeader}>
                <CreditCard size={20} color="#60a5fa" />
                <Text style={styles.payoutTitle}>{t('nextPayout') || 'Prochain versement'}</Text>
              </View>
              <Text style={styles.payoutDate}>
                {t('estimatedDate') || 'Date estimée'}: {formatDate(data.estimated_payout_date)}
              </Text>
              <Text style={styles.payoutInfo}>
                {t('payoutInfo') || 'Les versements sont effectués automatiquement sur votre compte bancaire via Stripe.'}
              </Text>
            </View>
          )}

          <Text style={styles.sectionTitle}>{t('sessionHistory') || 'Historique des sessions'}</Text>

          {paidSessions.length === 0 ? (
            <View style={styles.emptyState}>
              <Video size={48} color="rgba(255,255,255,0.3)" />
              <Text style={styles.emptyText}>
                {t('noSessions') || 'Aucune session payante pour le moment'}
              </Text>
            </View>
          ) : (
            paidSessions.map((session) => {
              const celebrityPerFan = (session.price_cents - Math.round(session.price_cents * 0.15)) / 100;
              return (
                <View key={session.id} style={styles.sessionCard}>
                  <View style={styles.sessionTitleRow}>
                    <View style={styles.sessionTitleContainer}>
                      <Video size={16} color="#fff" />
                      <Text style={styles.sessionTitle} numberOfLines={1}>
                        {session.code}
                      </Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: `${getStatusColor(session.status)}20`, borderColor: getStatusColor(session.status) }]}>
                      <Text style={[styles.statusText, { color: getStatusColor(session.status) }]}>
                        {getStatusLabel(session.status)}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.sessionHeader}>
                    <View style={styles.sessionDateContainer}>
                      <Calendar size={14} color="rgba(255,255,255,0.5)" />
                      <Text style={styles.sessionDate}>
                        {formatDate(session.started_at || session.created_at)}
                        {(session.started_at || session.created_at) && ` à ${formatTime(session.started_at || session.created_at)}`}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.sessionStatsGrid}>
                    <View style={styles.sessionStatItem}>
                      <Users size={18} color="#60a5fa" />
                      <Text style={styles.sessionStatValue}>{session.completed_fans}/{session.total_fans}</Text>
                      <Text style={styles.sessionStatLabel}>{t('completedFans') || 'fans servis'}</Text>
                    </View>
                    <View style={styles.sessionStatItem}>
                      <DollarSign size={18} color="#4ade80" />
                      <Text style={styles.sessionStatValue}>{(session.price_cents / 100).toFixed(2)}€</Text>
                      <Text style={styles.sessionStatLabel}>{t('pricePerFan') || 'prix/fan'}</Text>
                    </View>
                    <View style={styles.sessionStatItem}>
                      <Clock size={18} color="#f59e0b" />
                      <Text style={styles.sessionStatValue}>{formatDuration(session.duration_minutes)}</Text>
                      <Text style={styles.sessionStatLabel}>{t('duration') || 'durée'}</Text>
                    </View>
                  </View>

                  <View style={styles.sessionEarningsRow}>
                    <View>
                      <Text style={styles.sessionEarningsLabel}>{t('sessionEarnings') || 'Revenus nets'}</Text>
                      <Text style={styles.sessionEarningsDetail}>
                        {session.completed_fans} × {celebrityPerFan.toFixed(2)}€
                      </Text>
                    </View>
                    <Text style={styles.sessionEarningsAmount}>
                      {(session.session_earnings_cents / 100).toFixed(2)}€
                    </Text>
                  </View>

                  {session.status === 'ended' && session.session_earnings_cents > 0 && (
                    <View style={styles.payoutEstimate}>
                      <CreditCard size={14} color="rgba(255,255,255,0.4)" />
                      <Text style={styles.payoutEstimateText}>
                        {t('payoutEstimate') || 'Versement prévu sous 7 jours ouvrés'}
                      </Text>
                    </View>
                  )}
                </View>
              );
            })
          )}

          <View style={{ height: 100 }} />
        </ScrollView>
      )}

      <BottomNav />

      {/* Aperçu de la facture (WebView) avant téléchargement */}
      <Modal
        visible={!!previewHtml}
        animationType="slide"
        onRequestClose={() => { setPreviewHtml(null); setPreviewUrl(null); }}
      >
        <View style={styles.previewContainer}>
          <View style={[styles.previewHeader, { paddingTop: insets.top + 10 }]}>
            <TouchableOpacity style={styles.previewIconBtn} onPress={() => { setPreviewHtml(null); setPreviewUrl(null); }}>
              <X size={22} color="#0f172a" />
            </TouchableOpacity>
            <Text style={styles.previewTitle} numberOfLines={1}>{previewLabel}</Text>
            <TouchableOpacity
              style={styles.previewIconBtn}
              onPress={() => { if (previewUrl) Linking.openURL(previewUrl); }}
            >
              <Download size={20} color="#2563eb" />
            </TouchableOpacity>
          </View>
          {previewHtml && (
            <WebView
              originWhitelist={['*']}
              source={{ html: previewHtml }}
              style={{ flex: 1, backgroundColor: '#fff' }}
              startInLoadingState
              renderLoading={() => (
                <View style={styles.previewLoading}><ActivityIndicator size="large" color="#10b981" /></View>
              )}
            />
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  totalCard: {
    backgroundColor: 'rgba(74, 222, 128, 0.1)',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(74, 222, 128, 0.3)',
    marginBottom: 16,
  },
  totalIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(74, 222, 128, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  totalLabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 4,
  },
  totalAmount: {
    fontSize: 42,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 16,
  },
  totalStatsRow: {
    flexDirection: 'row',
    gap: 24,
  },
  totalStatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  totalStatText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
  },
  payoutCard: {
    backgroundColor: 'rgba(96, 165, 250, 0.1)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(96, 165, 250, 0.3)',
  },
  payoutHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  payoutTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#60a5fa',
  },
  payoutDate: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '600',
    marginBottom: 4,
  },
  payoutInfo: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    lineHeight: 18,
  },
  feeBreakdownCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  feeTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 12,
  },
  feeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  feeRowLast: {
    borderBottomWidth: 0,
  },
  feeLabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
  },
  feeValue: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 12,
    textAlign: 'center',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
  },
  sessionCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  sessionTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sessionTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    marginRight: 8,
  },
  sessionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    flexShrink: 1,
  },
  sessionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sessionDateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sessionDate: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  sessionStatsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  sessionStatItem: {
    alignItems: 'center',
    gap: 4,
  },
  sessionStatValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  sessionStatLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
  },
  sessionEarningsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(74, 222, 128, 0.08)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(74, 222, 128, 0.2)',
  },
  sessionEarningsLabel: {
    fontSize: 13,
    color: '#4ade80',
    fontWeight: '600',
  },
  sessionEarningsDetail: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 2,
  },
  sessionEarningsAmount: {
    fontSize: 22,
    fontWeight: '800',
    color: '#4ade80',
  },
  payoutEstimate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  payoutEstimateText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    fontStyle: 'italic',
  },

  // --- Onglets Revenus / Factures ---
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 9,
  },
  tabBtnActive: { backgroundColor: 'rgba(74,222,128,0.15)' },
  tabTxt: { color: 'rgba(255,255,255,0.5)', fontSize: 14, fontWeight: '600' },
  tabTxtActive: { color: '#4ade80' },

  // --- Sous-onglets factures fans / Plyz ---
  subTabBar: {
    flexDirection: 'row',
    marginBottom: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 10,
    padding: 3,
    gap: 3,
  },
  subTabBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 8,
  },
  subTabBtnActive: { backgroundColor: 'rgba(56,189,248,0.18)' },
  subTabTxt: { color: 'rgba(255,255,255,0.55)', fontSize: 13, fontWeight: '700' },
  subTabTxtActive: { color: '#38bdf8' },
  subTabHint: { color: 'rgba(255,255,255,0.45)', fontSize: 12, lineHeight: 17, marginBottom: 12 },

  // --- Filtre période ---
  periodRow: { marginBottom: 12 },
  periodRowContent: { gap: 8, paddingRight: 8 },
  periodChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  periodChipActive: { backgroundColor: 'rgba(74,222,128,0.18)', borderColor: 'rgba(74,222,128,0.5)' },
  periodChipTxt: { color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: '600' },
  periodChipTxtActive: { color: '#4ade80' },
  downloadAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#38bdf8',
    borderRadius: 12,
    paddingVertical: 12,
    marginBottom: 16,
  },
  downloadAllTxt: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // --- Cartes factures ---
  invCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12, padding: 14, marginBottom: 10,
  },
  invIcon: { width: 40, height: 40, borderRadius: 10, backgroundColor: 'rgba(16,185,129,0.12)', justifyContent: 'center', alignItems: 'center' },
  invTitle: { color: '#fff', fontSize: 15, fontWeight: '600' },
  invSub: { color: '#94a3b8', fontSize: 12, marginTop: 2 },
  invMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  invAmount: { color: '#e2e8f0', fontSize: 14, fontWeight: '700' },
  invBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  invBadgeSeller: { backgroundColor: 'rgba(16,185,129,0.2)' },
  invBadgeBuyer: { backgroundColor: 'rgba(56,189,248,0.2)' },
  invBadgeText: { color: '#cbd5e1', fontSize: 11, fontWeight: '600' },
  invDlBtn: { width: 40, height: 40, borderRadius: 10, backgroundColor: 'rgba(56,189,248,0.12)', justifyContent: 'center', alignItems: 'center' },
  invActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  invViewBtn: { width: 40, height: 40, borderRadius: 10, backgroundColor: 'rgba(16,185,129,0.12)', justifyContent: 'center', alignItems: 'center' },

  // --- Aperçu facture (WebView) ---
  previewContainer: { flex: 1, backgroundColor: '#fff' },
  previewHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingBottom: 12, backgroundColor: '#f1f5f9',
    borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
  },
  previewIconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#e2e8f0', justifyContent: 'center', alignItems: 'center' },
  previewTitle: { flex: 1, textAlign: 'center', color: '#0f172a', fontSize: 15, fontWeight: '700', marginHorizontal: 8 },
  previewLoading: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  breakdownRow: { marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)', alignItems: 'center' },
  breakdownText: { color: 'rgba(255,255,255,0.65)', fontSize: 13, fontWeight: '600' },
});
