import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, DollarSign, Users, TrendingUp, CheckCircle, Clock, AlertCircle, ChevronRight } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  getAllTransactions,
  getCelebritySummaries,
  getPayouts,
  updateTransactionStatus,
  createPayout,
  markPayoutAsPaid,
  formatCents,
  FanTransaction,
  CelebritySummary,
  CelebrityPayout,
} from '@/utils/transactionStorage';

type TabType = 'overview' | 'transactions' | 'celebrities' | 'payouts';
type TransactionFilter = 'all' | 'pending' | 'received_from_store' | 'paid_to_celebrity';

export default function AdminDashboardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();

  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [transactions, setTransactions] = useState<FanTransaction[]>([]);
  const [celebritySummaries, setCelebritySummaries] = useState<CelebritySummary[]>([]);
  const [payouts, setPayouts] = useState<CelebrityPayout[]>([]);
  const [txFilter, setTxFilter] = useState<TransactionFilter>('all');
  const [expandedCelebrity, setExpandedCelebrity] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [txs, summaries, payoutList] = await Promise.all([
        getAllTransactions(200),
        getCelebritySummaries(),
        getPayouts(),
      ]);
      setTransactions(txs);
      setCelebritySummaries(summaries);
      setPayouts(payoutList);
    } catch (error) {
      console.error('Error loading admin data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadData();
    }, [loadData])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const totalRevenue = transactions.reduce((sum, tx) => sum + tx.amount_cents, 0);
  const totalSigntouchFees = transactions.reduce((sum, tx) => sum + tx.signtouch_fee_cents, 0);
  const pendingPayouts = transactions
    .filter(tx => tx.status !== 'paid_to_celebrity' && tx.status !== 'refunded' && tx.status !== 'cancelled')
    .reduce((sum, tx) => sum + tx.celebrity_net_cents, 0);
  const totalPaidOut = transactions
    .filter(tx => tx.status === 'paid_to_celebrity')
    .reduce((sum, tx) => sum + tx.celebrity_net_cents, 0);

  const filteredTransactions = txFilter === 'all'
    ? transactions
    : transactions.filter(tx => tx.status === txFilter);

  const statusColor = (status: string) => {
    switch (status) {
      case 'pending': return '#f59e0b';
      case 'confirmed': return '#3b82f6';
      case 'received_from_store': return '#10b981';
      case 'paid_to_celebrity': return '#8b5cf6';
      case 'refunded': return '#ef4444';
      case 'cancelled': return '#6b7280';
      default: return '#6b7280';
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case 'pending': return t('txPending') || 'En attente';
      case 'confirmed': return t('txConfirmed') || 'Confirmé';
      case 'received_from_store': return t('txReceivedFromStore') || 'Reçu du store';
      case 'paid_to_celebrity': return t('txPaidToCelebrity') || 'Payé à la célébrité';
      case 'refunded': return t('txRefunded') || 'Remboursé';
      case 'cancelled': return t('txCancelled') || 'Annulé';
      default: return status;
    }
  };

  const payoutStatusLabel = (status: string) => {
    switch (status) {
      case 'pending': return t('payoutPending') || 'À verser';
      case 'processing': return t('payoutProcessing') || 'En cours';
      case 'paid': return t('payoutPaid') || 'Versé';
      case 'failed': return t('payoutFailed') || 'Échoué';
      default: return status;
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const renderOverview = () => (
    <View style={styles.overviewContainer}>
      <View style={styles.statsRow}>
        <View style={[styles.statCard, { borderLeftColor: '#10b981' }]}>
          <View style={styles.statIconContainer}>
            <DollarSign size={20} color="#10b981" />
          </View>
          <Text style={styles.statValue}>{formatCents(totalRevenue)}</Text>
          <Text style={styles.statLabel}>{t('adminTotalRevenue') || 'Revenu total brut'}</Text>
        </View>
        <View style={[styles.statCard, { borderLeftColor: '#8b5cf6' }]}>
          <View style={styles.statIconContainer}>
            <TrendingUp size={20} color="#8b5cf6" />
          </View>
          <Text style={styles.statValue}>{formatCents(totalSigntouchFees)}</Text>
          <Text style={styles.statLabel}>{t('adminSigntouchRevenue') || 'Commission SignTouch'}</Text>
        </View>
      </View>
      <View style={styles.statsRow}>
        <View style={[styles.statCard, { borderLeftColor: '#f59e0b' }]}>
          <View style={styles.statIconContainer}>
            <Clock size={20} color="#f59e0b" />
          </View>
          <Text style={styles.statValue}>{formatCents(pendingPayouts)}</Text>
          <Text style={styles.statLabel}>{t('adminPendingPayouts') || 'À verser aux célébrités'}</Text>
        </View>
        <View style={[styles.statCard, { borderLeftColor: '#3b82f6' }]}>
          <View style={styles.statIconContainer}>
            <CheckCircle size={20} color="#3b82f6" />
          </View>
          <Text style={styles.statValue}>{formatCents(totalPaidOut)}</Text>
          <Text style={styles.statLabel}>{t('adminTotalPaidOut') || 'Total versé'}</Text>
        </View>
      </View>
      <View style={styles.statsRow}>
        <View style={[styles.statCard, styles.statCardFull, { borderLeftColor: '#ec4899' }]}>
          <View style={styles.statIconContainer}>
            <Users size={20} color="#ec4899" />
          </View>
          <Text style={styles.statValue}>{transactions.length}</Text>
          <Text style={styles.statLabel}>{t('adminTotalTransactions') || 'Transactions totales'}</Text>
        </View>
      </View>

      {celebritySummaries.length > 0 && (
        <View style={styles.topCelebritiesSection}>
          <Text style={styles.sectionTitle}>{t('adminTopCelebrities') || 'Top Célébrités'}</Text>
          {celebritySummaries.slice(0, 5).map((celeb, index) => (
            <View key={celeb.celebrity_id} style={styles.topCelebrityRow}>
              <View style={styles.topCelebrityRank}>
                <Text style={styles.rankText}>#{index + 1}</Text>
              </View>
              <View style={styles.topCelebrityInfo}>
                <Text style={styles.topCelebrityName}>{celeb.celebrity_name}</Text>
                <Text style={styles.topCelebrityStats}>
                  {celeb.total_transactions} {t('adminCalls') || 'appels'} · {formatCents(celeb.total_gross_cents)}
                </Text>
              </View>
              <View style={styles.topCelebrityAmount}>
                <Text style={styles.topCelebrityPending}>{formatCents(celeb.pending_payout_cents)}</Text>
                <Text style={styles.topCelebrityPendingLabel}>{t('adminToPay') || 'à verser'}</Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );

  const renderTransactions = () => (
    <View style={styles.transactionsContainer}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
        {(['all', 'pending', 'received_from_store', 'paid_to_celebrity'] as TransactionFilter[]).map(filter => (
          <TouchableOpacity
            key={filter}
            style={[styles.filterChip, txFilter === filter && styles.filterChipActive]}
            onPress={() => setTxFilter(filter)}
          >
            <Text style={[styles.filterChipText, txFilter === filter && styles.filterChipTextActive]}>
              {filter === 'all' ? (t('adminAll') || 'Tous')
                : filter === 'pending' ? (t('txPending') || 'En attente')
                : filter === 'received_from_store' ? (t('txReceivedFromStore') || 'Reçu')
                : (t('txPaidToCelebrity') || 'Payé')}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {filteredTransactions.length === 0 ? (
        <View style={styles.emptyState}>
          <DollarSign size={40} color="#4b5563" />
          <Text style={styles.emptyText}>{t('adminNoTransactions') || 'Aucune transaction'}</Text>
        </View>
      ) : (
        filteredTransactions.map(tx => (
          <View key={tx.id} style={styles.transactionCard}>
            <View style={styles.txHeader}>
              <View style={styles.txFanInfo}>
                <Text style={styles.txFanName}>{tx.fan_name || 'Fan'}</Text>
                <Text style={styles.txDate}>{formatDate(tx.created_at)}</Text>
              </View>
              <View style={styles.txAmountContainer}>
                <Text style={styles.txAmount}>{formatCents(tx.amount_cents)}</Text>
                <View style={[styles.txStatusBadge, { backgroundColor: statusColor(tx.status) + '20' }]}>
                  <Text style={[styles.txStatusText, { color: statusColor(tx.status) }]}>
                    {statusLabel(tx.status)}
                  </Text>
                </View>
              </View>
            </View>
            <View style={styles.txDetails}>
              <Text style={styles.txCelebrity}>{t('adminCelebrity') || 'Célébrité'}: {tx.celebrity_name}</Text>
              <View style={styles.txFeeRow}>
                <Text style={styles.txFeeLabel}>Store: {formatCents(tx.store_fee_cents)}</Text>
                <Text style={styles.txFeeLabel}>SignTouch: {formatCents(tx.signtouch_fee_cents)}</Text>
                <Text style={styles.txFeeLabel}>Stripe: {formatCents(tx.stripe_fee_cents)}</Text>
              </View>
              <Text style={styles.txNetAmount}>
                {t('adminNetCelebrity') || 'Net célébrité'}: {formatCents(tx.celebrity_net_cents)}
              </Text>
            </View>
            {tx.status === 'pending' && (
              <TouchableOpacity
                style={styles.markReceivedButton}
                onPress={async () => {
                  await updateTransactionStatus(tx.id, 'received_from_store');
                  loadData();
                }}
              >
                <Text style={styles.markReceivedText}>{t('adminMarkReceived') || 'Marquer comme reçu du store'}</Text>
              </TouchableOpacity>
            )}
          </View>
        ))
      )}
    </View>
  );

  const renderCelebrities = () => (
    <View style={styles.celebritiesContainer}>
      {celebritySummaries.length === 0 ? (
        <View style={styles.emptyState}>
          <Users size={40} color="#4b5563" />
          <Text style={styles.emptyText}>{t('adminNoCelebrities') || 'Aucune célébrité'}</Text>
        </View>
      ) : (
        celebritySummaries.map(celeb => (
          <TouchableOpacity
            key={celeb.celebrity_id}
            style={styles.celebrityCard}
            onPress={() => setExpandedCelebrity(
              expandedCelebrity === celeb.celebrity_id ? null : celeb.celebrity_id
            )}
          >
            <View style={styles.celebHeader}>
              <View style={styles.celebInfo}>
                <Text style={styles.celebName}>{celeb.celebrity_name}</Text>
                <Text style={styles.celebStats}>
                  {celeb.total_transactions} {t('adminCalls') || 'appels'} · {t('adminLastCall') || 'Dernier appel'}: {celeb.last_transaction_at ? formatDate(celeb.last_transaction_at) : '-'}
                </Text>
              </View>
              <ChevronRight
                size={20}
                color="#9ca3af"
                style={{ transform: [{ rotate: expandedCelebrity === celeb.celebrity_id ? '90deg' : '0deg' }] }}
              />
            </View>
            {expandedCelebrity === celeb.celebrity_id && (
              <View style={styles.celebDetails}>
                <View style={styles.celebDetailRow}>
                  <Text style={styles.celebDetailLabel}>{t('adminTotalRevenue') || 'Revenu brut'}</Text>
                  <Text style={styles.celebDetailValue}>{formatCents(celeb.total_gross_cents)}</Text>
                </View>
                <View style={styles.celebDetailRow}>
                  <Text style={styles.celebDetailLabel}>{t('adminNetTotal') || 'Net total'}</Text>
                  <Text style={styles.celebDetailValue}>{formatCents(celeb.total_net_cents)}</Text>
                </View>
                <View style={styles.celebDetailRow}>
                  <Text style={styles.celebDetailLabel}>{t('adminPendingPayouts') || 'À verser'}</Text>
                  <Text style={[styles.celebDetailValue, { color: '#f59e0b' }]}>
                    {formatCents(celeb.pending_payout_cents)}
                  </Text>
                </View>
                {celeb.pending_payout_cents > 0 && (
                  <TouchableOpacity
                    style={styles.createPayoutButton}
                    onPress={async () => {
                      const now = new Date();
                      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                      await createPayout({
                        celebrityId: celeb.celebrity_id,
                        celebrityName: celeb.celebrity_name,
                        periodStart: thirtyDaysAgo.toISOString(),
                        periodEnd: now.toISOString(),
                      });
                      loadData();
                    }}
                  >
                    <Text style={styles.createPayoutText}>{t('adminCreatePayout') || 'Créer un versement'}</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </TouchableOpacity>
        ))
      )}
    </View>
  );

  const renderPayouts = () => (
    <View style={styles.payoutsContainer}>
      {payouts.length === 0 ? (
        <View style={styles.emptyState}>
          <CheckCircle size={40} color="#4b5563" />
          <Text style={styles.emptyText}>{t('adminNoPayouts') || 'Aucun versement'}</Text>
        </View>
      ) : (
        payouts.map(payout => (
          <View key={payout.id} style={styles.payoutCard}>
            <View style={styles.payoutHeader}>
              <View>
                <Text style={styles.payoutCelebrity}>{payout.celebrity_name}</Text>
                <Text style={styles.payoutPeriod}>
                  {new Date(payout.period_start).toLocaleDateString('fr-FR')} - {new Date(payout.period_end).toLocaleDateString('fr-FR')}
                </Text>
              </View>
              <View style={[styles.payoutStatusBadge, { backgroundColor: payout.status === 'paid' ? '#10b98120' : '#f59e0b20' }]}>
                <Text style={[styles.payoutStatusText, { color: payout.status === 'paid' ? '#10b981' : '#f59e0b' }]}>
                  {payoutStatusLabel(payout.status)}
                </Text>
              </View>
            </View>
            <View style={styles.payoutDetails}>
              <View style={styles.payoutDetailRow}>
                <Text style={styles.payoutLabel}>{t('adminGross') || 'Brut'}</Text>
                <Text style={styles.payoutValue}>{formatCents(payout.total_gross_cents)}</Text>
              </View>
              <View style={styles.payoutDetailRow}>
                <Text style={styles.payoutLabel}>{t('adminFees') || 'Frais'}</Text>
                <Text style={styles.payoutValue}>
                  -{formatCents(payout.total_store_fees_cents + payout.total_signtouch_fees_cents + payout.total_stripe_fees_cents)}
                </Text>
              </View>
              <View style={[styles.payoutDetailRow, styles.payoutNetRow]}>
                <Text style={styles.payoutNetLabel}>{t('adminNetToPay') || 'Net à verser'}</Text>
                <Text style={styles.payoutNetValue}>{formatCents(payout.total_net_cents)}</Text>
              </View>
              <Text style={styles.payoutTxCount}>
                {payout.transaction_count} transaction{payout.transaction_count > 1 ? 's' : ''}
              </Text>
            </View>
            {payout.status === 'pending' && (
              <TouchableOpacity
                style={styles.markPaidButton}
                onPress={async () => {
                  await markPayoutAsPaid(payout.id);
                  loadData();
                }}
              >
                <CheckCircle size={16} color="#fff" />
                <Text style={styles.markPaidText}>{t('adminMarkAsPaid') || 'Marquer comme versé'}</Text>
              </TouchableOpacity>
            )}
          </View>
        ))
      )}
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#8b5cf6" />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient colors={['#1a1a2e', '#16213e']} style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ArrowLeft size={22} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>{t('adminDashboard') || 'Tableau de bord'}</Text>
          <Text style={styles.headerSubtitle}>{t('adminPaymentTracking') || 'Suivi des paiements'}</Text>
        </View>
      </LinearGradient>

      <View style={styles.tabBar}>
        {(['overview', 'transactions', 'celebrities', 'payouts'] as TabType[]).map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab === 'overview' ? (t('adminOverview') || 'Vue d\'ensemble')
                : tab === 'transactions' ? (t('adminTransactions') || 'Transactions')
                : tab === 'celebrities' ? (t('adminCelebrities') || 'Célébrités')
                : (t('adminPayouts') || 'Versements')}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#8b5cf6" />}
      >
        {activeTab === 'overview' && renderOverview()}
        {activeTab === 'transactions' && renderTransactions()}
        {activeTab === 'celebrities' && renderCelebrities()}
        {activeTab === 'payouts' && renderPayouts()}
        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a1a',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitleContainer: {
    marginLeft: 12,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  headerSubtitle: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    marginTop: 2,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#111128',
    paddingHorizontal: 8,
    paddingTop: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: '#8b5cf6',
  },
  tabText: {
    color: '#6b7280',
    fontSize: 12,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#8b5cf6',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  overviewContainer: {},
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#111128',
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
  },
  statCardFull: {
    flex: 1,
  },
  statIconContainer: {
    marginBottom: 8,
  },
  statValue: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  statLabel: {
    color: '#9ca3af',
    fontSize: 11,
    marginTop: 4,
  },
  topCelebritiesSection: {
    marginTop: 8,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  topCelebrityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111128',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  topCelebrityRank: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1e1e3f',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rankText: {
    color: '#8b5cf6',
    fontSize: 12,
    fontWeight: '700',
  },
  topCelebrityInfo: {
    flex: 1,
    marginLeft: 12,
  },
  topCelebrityName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  topCelebrityStats: {
    color: '#9ca3af',
    fontSize: 11,
    marginTop: 2,
  },
  topCelebrityAmount: {
    alignItems: 'flex-end',
  },
  topCelebrityPending: {
    color: '#f59e0b',
    fontSize: 14,
    fontWeight: '700',
  },
  topCelebrityPendingLabel: {
    color: '#9ca3af',
    fontSize: 10,
  },
  transactionsContainer: {},
  filterScroll: {
    marginBottom: 12,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#1e1e3f',
    marginRight: 8,
  },
  filterChipActive: {
    backgroundColor: '#8b5cf6',
  },
  filterChipText: {
    color: '#9ca3af',
    fontSize: 12,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#fff',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    color: '#6b7280',
    fontSize: 14,
    marginTop: 12,
  },
  transactionCard: {
    backgroundColor: '#111128',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  txHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  txFanInfo: {},
  txFanName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  txDate: {
    color: '#6b7280',
    fontSize: 11,
    marginTop: 2,
  },
  txAmountContainer: {
    alignItems: 'flex-end',
  },
  txAmount: {
    color: '#10b981',
    fontSize: 16,
    fontWeight: '700',
  },
  txStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    marginTop: 4,
  },
  txStatusText: {
    fontSize: 10,
    fontWeight: '600',
  },
  txDetails: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  txCelebrity: {
    color: '#d1d5db',
    fontSize: 12,
  },
  txFeeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  txFeeLabel: {
    color: '#6b7280',
    fontSize: 11,
  },
  txNetAmount: {
    color: '#8b5cf6',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 6,
  },
  markReceivedButton: {
    marginTop: 10,
    backgroundColor: '#10b98120',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  markReceivedText: {
    color: '#10b981',
    fontSize: 12,
    fontWeight: '600',
  },
  celebritiesContainer: {},
  celebrityCard: {
    backgroundColor: '#111128',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  celebHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  celebInfo: {
    flex: 1,
  },
  celebName: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  celebStats: {
    color: '#9ca3af',
    fontSize: 11,
    marginTop: 2,
  },
  celebDetails: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  celebDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  celebDetailLabel: {
    color: '#9ca3af',
    fontSize: 13,
  },
  celebDetailValue: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  createPayoutButton: {
    marginTop: 10,
    backgroundColor: '#8b5cf620',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  createPayoutText: {
    color: '#8b5cf6',
    fontSize: 12,
    fontWeight: '600',
  },
  payoutsContainer: {},
  payoutCard: {
    backgroundColor: '#111128',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  payoutHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  payoutCelebrity: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  payoutPeriod: {
    color: '#9ca3af',
    fontSize: 11,
    marginTop: 2,
  },
  payoutStatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  payoutStatusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  payoutDetails: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  payoutDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  payoutLabel: {
    color: '#9ca3af',
    fontSize: 13,
  },
  payoutValue: {
    color: '#fff',
    fontSize: 13,
  },
  payoutNetRow: {
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  payoutNetLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  payoutNetValue: {
    color: '#8b5cf6',
    fontSize: 16,
    fontWeight: '700',
  },
  payoutTxCount: {
    color: '#6b7280',
    fontSize: 11,
    marginTop: 6,
  },
  markPaidButton: {
    marginTop: 10,
    backgroundColor: '#10b981',
    borderRadius: 8,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  markPaidText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
});
