import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
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
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { getOrCreateDeviceId } from '@/utils/ratingsStorage';
import { authedFetch } from '@/utils/authedFetch';
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
}

export default function MyEarningsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<EarningsData | null>(null);

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
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('fr-FR', {
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

      {loading ? (
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
              {((data?.total_earnings_cents || 0) / 100).toFixed(2)}€
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
                  <View style={styles.sessionHeader}>
                    <View style={styles.sessionDateContainer}>
                      <Calendar size={14} color="rgba(255,255,255,0.5)" />
                      <Text style={styles.sessionDate}>
                        {formatDate(session.created_at)}
                        {session.started_at && ` · ${formatTime(session.started_at)}`}
                      </Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: `${getStatusColor(session.status)}20`, borderColor: getStatusColor(session.status) }]}>
                      <Text style={[styles.statusText, { color: getStatusColor(session.status) }]}>
                        {getStatusLabel(session.status)}
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
});
