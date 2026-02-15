import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Image, ActivityIndicator, ScrollView, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Inbox, Video, PenTool, Clock, CheckCircle, XCircle, ChevronRight,
  Star, Users, DollarSign, Plus, FileText, Eye, TrendingUp,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { useCelebrityMode } from '@/contexts/CelebrityModeContext';
import BottomNav, { BOTTOM_NAV_HEIGHT } from '@/components/BottomNav';

const API_BASE = Platform.OS === 'web' ? '' : (process.env.EXPO_PUBLIC_STRIPE_SERVER_URL || '');

type TabType = 'bookings' | 'autographs';
type ModeType = 'fan' | 'celebrity';

interface Booking {
  id: string;
  status: string;
  duration_minutes: number;
  price_cents: number;
  currency: string;
  scheduled_at: string | null;
  created_at: string;
  celebrity_profiles?: {
    stage_name: string;
    wikidata_image_url: string | null;
    profiles?: { avatar_url: string | null; display_name: string | null };
  };
  profiles?: { display_name: string | null; avatar_url: string | null };
}

interface Autograph {
  id: string;
  status: string;
  message: string | null;
  price_cents: number;
  currency: string;
  delivery_url: string | null;
  created_at: string;
  celebrity_profiles?: {
    stage_name: string;
    wikidata_image_url: string | null;
    profiles?: { avatar_url: string | null; display_name: string | null };
  };
  profiles?: { display_name: string | null; avatar_url: string | null };
}

const STATUS_COLORS: Record<string, string> = {
  pending_payment: '#f59e0b',
  pending: '#f59e0b',
  paid: '#3b82f6',
  confirmed: '#10b981',
  completed: '#10b981',
  cancelled: '#ef4444',
  delivered: '#10b981',
  in_progress: '#3b82f6',
};

export default function MySpaceScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { user } = useAuth();
  const { isCelebrity } = useCelebrityMode();
  const [mode, setMode] = useState<ModeType>(isCelebrity ? 'celebrity' : 'fan');

  useEffect(() => {
    if (!isCelebrity && mode === 'celebrity') {
      setMode('fan');
    }
  }, [isCelebrity]);
  const [tab, setTab] = useState<TabType>('bookings');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [autographs, setAutographs] = useState<Autograph[]>([]);
  const [celBookings, setCelBookings] = useState<Booking[]>([]);
  const [celAutographs, setCelAutographs] = useState<Autograph[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!user?.id) return;
    try {
      setLoading(true);
      const fetches: Promise<Response>[] = [
        fetch(`${API_BASE}/api/my-bookings?user_id=${user.id}&role=fan`),
        fetch(`${API_BASE}/api/my-autographs?user_id=${user.id}&role=fan`),
      ];
      if (isCelebrity) {
        fetches.push(
          fetch(`${API_BASE}/api/my-bookings?user_id=${user.id}&role=celebrity`),
          fetch(`${API_BASE}/api/my-autographs?user_id=${user.id}&role=celebrity`),
        );
      }
      const responses = await Promise.all(fetches);
      const [bData, aData] = await Promise.all([responses[0].json(), responses[1].json()]);
      setBookings(bData.bookings || []);
      setAutographs(aData.autographs || []);
      if (isCelebrity && responses.length > 2) {
        const [cbData, caData] = await Promise.all([responses[2].json(), responses[3].json()]);
        setCelBookings(cbData.bookings || []);
        setCelAutographs(caData.autographs || []);
      }
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.id, isCelebrity]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const formatPrice = (cents: number, currency: string) => {
    const amount = (cents / 100).toFixed(2);
    const symbols: Record<string, string> = { eur: '€', usd: '$', gbp: '£' };
    return `${amount}${symbols[currency] || currency}`;
  };

  const getStatusLabel = (status: string): string => {
    const map: Record<string, string> = {
      pending_payment: t('bookingPending'),
      pending: t('bookingPending'),
      paid: t('bookingPaid'),
      confirmed: t('bookingConfirmed'),
      completed: t('bookingCompleted'),
      cancelled: t('bookingCancelled'),
      delivered: t('autographDelivered'),
      in_progress: t('bookingConfirmed'),
    };
    return map[status] || status;
  };

  const renderBooking = ({ item }: { item: Booking }) => {
    const celeb = item.celebrity_profiles;
    return (
      <TouchableOpacity
        style={styles.itemCard}
        onPress={() => celeb && router.push(`/celebrity-detail?id=${item.id}` as any)}
        activeOpacity={0.8}
      >
        <View style={styles.itemIcon}>
          <Video size={20} color="#10b981" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.itemTitle}>{celeb?.stage_name || 'Celebrity'}</Text>
          <Text style={styles.itemSub}>
            {item.duration_minutes}min · {formatPrice(item.price_cents, item.currency)}
          </Text>
          <Text style={styles.itemDate}>
            {new Date(item.created_at).toLocaleDateString()}
          </Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: `${STATUS_COLORS[item.status] || '#6b7280'}20` }]}>
          <Text style={[styles.statusText, { color: STATUS_COLORS[item.status] || '#6b7280' }]}>
            {getStatusLabel(item.status)}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderCelBooking = ({ item }: { item: Booking }) => {
    const fan = item.profiles;
    return (
      <View style={styles.itemCard}>
        <View style={styles.itemIcon}>
          <Video size={20} color="#10b981" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.itemTitle}>{fan?.display_name || (t('celDashFan' as any) || 'Fan')}</Text>
          <Text style={styles.itemSub}>
            {item.duration_minutes}min · {formatPrice(item.price_cents, item.currency)}
          </Text>
          <Text style={styles.itemDate}>
            {new Date(item.created_at).toLocaleDateString()}
          </Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: `${STATUS_COLORS[item.status] || '#6b7280'}20` }]}>
          <Text style={[styles.statusText, { color: STATUS_COLORS[item.status] || '#6b7280' }]}>
            {getStatusLabel(item.status)}
          </Text>
        </View>
      </View>
    );
  };

  const renderAutograph = ({ item }: { item: Autograph }) => {
    const celeb = item.celebrity_profiles;
    return (
      <TouchableOpacity
        style={styles.itemCard}
        onPress={() => celeb && router.push(`/celebrity-detail?id=${item.id}` as any)}
        activeOpacity={0.8}
      >
        <View style={[styles.itemIcon, { backgroundColor: 'rgba(245,158,11,0.15)' }]}>
          <PenTool size={20} color="#f59e0b" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.itemTitle}>{celeb?.stage_name || 'Celebrity'}</Text>
          {item.message && (
            <Text style={styles.itemSub} numberOfLines={1}>{item.message}</Text>
          )}
          <Text style={styles.itemDate}>
            {formatPrice(item.price_cents, item.currency)} · {new Date(item.created_at).toLocaleDateString()}
          </Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: `${STATUS_COLORS[item.status] || '#6b7280'}20` }]}>
          <Text style={[styles.statusText, { color: STATUS_COLORS[item.status] || '#6b7280' }]}>
            {getStatusLabel(item.status)}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderCelAutograph = ({ item }: { item: Autograph }) => {
    const fan = item.profiles;
    return (
      <View style={styles.itemCard}>
        <View style={[styles.itemIcon, { backgroundColor: 'rgba(245,158,11,0.15)' }]}>
          <PenTool size={20} color="#f59e0b" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.itemTitle}>{fan?.display_name || (t('celDashFan' as any) || 'Fan')}</Text>
          {item.message && (
            <Text style={styles.itemSub} numberOfLines={1}>{item.message}</Text>
          )}
          <Text style={styles.itemDate}>
            {formatPrice(item.price_cents, item.currency)} · {new Date(item.created_at).toLocaleDateString()}
          </Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: `${STATUS_COLORS[item.status] || '#6b7280'}20` }]}>
          <Text style={[styles.statusText, { color: STATUS_COLORS[item.status] || '#6b7280' }]}>
            {getStatusLabel(item.status)}
          </Text>
        </View>
      </View>
    );
  };

  const pendingBookings = celBookings.filter(b => ['pending', 'pending_payment', 'paid'].includes(b.status));
  const pendingAutographs = celAutographs.filter(a => ['pending', 'pending_payment', 'paid'].includes(a.status));
  const completedBookings = celBookings.filter(b => ['completed', 'confirmed'].includes(b.status));
  const completedAutographs = celAutographs.filter(a => ['completed', 'delivered'].includes(a.status));
  const totalEarningsCents = completedBookings.reduce((sum, b) => sum + b.price_cents, 0)
    + completedAutographs.reduce((sum, a) => sum + a.price_cents, 0);
  const mainCurrency = completedBookings[0]?.currency || completedAutographs[0]?.currency || 'eur';

  if (!user) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <LinearGradient colors={['#0a1628', '#0f2035', '#0a1628']} style={StyleSheet.absoluteFill} />
        <View style={styles.header}>
          <Text style={styles.title}>{t('mySpaceTitle')}</Text>
        </View>
        <View style={styles.center}>
          <View style={styles.signInCard}>
            <View style={styles.signInIconWrap}>
              <Inbox size={40} color="#10b981" />
            </View>
            <Text style={styles.signInTitle}>{t('mySpaceSignInTitle')}</Text>
            <Text style={styles.signInDesc}>{t('mySpaceSignInDesc')}</Text>
            <TouchableOpacity
              style={styles.signInButton}
              onPress={() => router.push('/account' as any)}
              activeOpacity={0.8}
            >
              <Text style={styles.signInButtonText}>{t('mySpaceSignInButton')}</Text>
              <ChevronRight size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
        <BottomNav />
      </View>
    );
  }

  const renderFanView = () => (
    <>
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'bookings' && styles.tabBtnActive]}
          onPress={() => setTab('bookings')}
        >
          <Video size={16} color={tab === 'bookings' ? '#fff' : '#6b7280'} />
          <Text style={[styles.tabText, tab === 'bookings' && styles.tabTextActive]}>
            {t('myBookings')}
          </Text>
          {bookings.length > 0 && (
            <View style={styles.countBadge}>
              <Text style={styles.countText}>{bookings.length}</Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'autographs' && styles.tabBtnActive]}
          onPress={() => setTab('autographs')}
        >
          <PenTool size={16} color={tab === 'autographs' ? '#fff' : '#6b7280'} />
          <Text style={[styles.tabText, tab === 'autographs' && styles.tabTextActive]}>
            {t('myAutographs')}
          </Text>
          {autographs.length > 0 && (
            <View style={styles.countBadge}>
              <Text style={styles.countText}>{autographs.length}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#10b981" />
        </View>
      ) : tab === 'bookings' ? (
        bookings.length === 0 ? (
          <View style={styles.center}>
            <Video size={48} color="#374151" />
            <Text style={styles.emptyText}>{t('noBookings')}</Text>
            <Text style={styles.emptyHint}>{t('noBookingsHint')}</Text>
          </View>
        ) : (
          <FlatList
            data={bookings}
            renderItem={renderBooking}
            keyExtractor={item => item.id}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: BOTTOM_NAV_HEIGHT + 20 }}
            ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          />
        )
      ) : (
        autographs.length === 0 ? (
          <View style={styles.center}>
            <PenTool size={48} color="#374151" />
            <Text style={styles.emptyText}>{t('noAutographs')}</Text>
            <Text style={styles.emptyHint}>{t('noAutographsHint')}</Text>
          </View>
        ) : (
          <FlatList
            data={autographs}
            renderItem={renderAutograph}
            keyExtractor={item => item.id}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: BOTTOM_NAV_HEIGHT + 20 }}
            ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          />
        )
      )}
    </>
  );

  const renderCelebrityView = () => (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: BOTTOM_NAV_HEIGHT + 20 }}
      showsVerticalScrollIndicator={false}
    >
      <TouchableOpacity
        style={styles.publishBtn}
        onPress={() => router.push('/create-post' as any)}
        activeOpacity={0.8}
      >
        <View style={styles.publishIconWrap}>
          <Plus size={22} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.publishTitle}>{t('celDashPublish' as any) || 'Publier un post'}</Text>
          <Text style={styles.publishSub}>{t('celDashPublishSub' as any) || 'Partagez avec vos fans'}</Text>
        </View>
        <ChevronRight size={20} color="#10b981" />
      </TouchableOpacity>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <View style={[styles.statIconWrap, { backgroundColor: 'rgba(16,185,129,0.15)' }]}>
            <Video size={18} color="#10b981" />
          </View>
          <Text style={styles.statValue}>{celBookings.length}</Text>
          <Text style={styles.statLabel}>{t('celDashTotalBookings' as any) || 'Réservations'}</Text>
        </View>
        <View style={styles.statCard}>
          <View style={[styles.statIconWrap, { backgroundColor: 'rgba(245,158,11,0.15)' }]}>
            <PenTool size={18} color="#f59e0b" />
          </View>
          <Text style={styles.statValue}>{celAutographs.length}</Text>
          <Text style={styles.statLabel}>{t('celDashTotalAutographs' as any) || 'Autographes'}</Text>
        </View>
        <View style={styles.statCard}>
          <View style={[styles.statIconWrap, { backgroundColor: 'rgba(59,130,246,0.15)' }]}>
            <TrendingUp size={18} color="#3b82f6" />
          </View>
          <Text style={styles.statValue}>{formatPrice(Math.round(totalEarningsCents * 0.85), mainCurrency)}</Text>
          <Text style={styles.statLabel}>{t('celDashEarnings' as any) || 'Revenus'}</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>
        {t('celDashPendingBookings' as any) || 'Réservations en attente'}
        {pendingBookings.length > 0 && (
          <Text style={styles.sectionCount}> ({pendingBookings.length})</Text>
        )}
      </Text>
      {loading ? (
        <ActivityIndicator size="small" color="#10b981" style={{ marginVertical: 20 }} />
      ) : pendingBookings.length === 0 ? (
        <View style={styles.emptySection}>
          <Video size={32} color="#374151" />
          <Text style={styles.emptySectionText}>{t('celDashNoPendingBookings' as any) || 'Aucune réservation en attente'}</Text>
        </View>
      ) : (
        pendingBookings.map(item => (
          <View key={item.id} style={{ marginBottom: 10 }}>
            {renderCelBooking({ item })}
          </View>
        ))
      )}

      <Text style={styles.sectionTitle}>
        {t('celDashPendingAutographs' as any) || 'Demandes d\'autographes'}
        {pendingAutographs.length > 0 && (
          <Text style={styles.sectionCount}> ({pendingAutographs.length})</Text>
        )}
      </Text>
      {loading ? (
        <ActivityIndicator size="small" color="#f59e0b" style={{ marginVertical: 20 }} />
      ) : pendingAutographs.length === 0 ? (
        <View style={styles.emptySection}>
          <PenTool size={32} color="#374151" />
          <Text style={styles.emptySectionText}>{t('celDashNoPendingAutographs' as any) || 'Aucune demande en attente'}</Text>
        </View>
      ) : (
        pendingAutographs.map(item => (
          <View key={item.id} style={{ marginBottom: 10 }}>
            {renderCelAutograph({ item })}
          </View>
        ))
      )}
    </ScrollView>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient colors={['#0a1628', '#0f2035', '#0a1628']} style={StyleSheet.absoluteFill} />
      <View style={styles.header}>
        <Text style={styles.title}>{t('mySpaceTitle')}</Text>
      </View>

      {isCelebrity && (
        <View style={styles.modeToggleRow}>
          <TouchableOpacity
            style={[styles.modeBtn, mode === 'fan' && styles.modeBtnActiveFan]}
            onPress={() => setMode('fan')}
            activeOpacity={0.8}
          >
            <Users size={15} color={mode === 'fan' ? '#fff' : '#6b7280'} />
            <Text style={[styles.modeBtnText, mode === 'fan' && styles.modeBtnTextActive]}>
              {t('celDashModeFan' as any) || 'Fan'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeBtn, mode === 'celebrity' && styles.modeBtnActiveCel]}
            onPress={() => setMode('celebrity')}
            activeOpacity={0.8}
          >
            <Star size={15} color={mode === 'celebrity' ? '#000' : '#6b7280'} fill={mode === 'celebrity' ? '#000' : 'transparent'} />
            <Text style={[styles.modeBtnText, mode === 'celebrity' && styles.modeBtnTextActiveCel]}>
              {t('celDashModeCelebrity' as any) || 'Célébrité'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {mode === 'celebrity' && isCelebrity ? renderCelebrityView() : renderFanView()}

      <BottomNav />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a1628' },
  header: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 5 },
  title: { color: '#fff', fontSize: 24, fontWeight: '700' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  emptyText: { color: '#9ca3af', fontSize: 16, marginTop: 12, fontWeight: '600' },
  emptyHint: { color: '#6b7280', fontSize: 13, marginTop: 4, textAlign: 'center' },

  modeToggleRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 4,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    padding: 4,
  },
  modeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 11,
  },
  modeBtnActiveFan: {
    backgroundColor: '#10b981',
  },
  modeBtnActiveCel: {
    backgroundColor: '#f59e0b',
  },
  modeBtnText: {
    color: '#6b7280',
    fontSize: 14,
    fontWeight: '600',
  },
  modeBtnTextActive: {
    color: '#fff',
  },
  modeBtnTextActiveCel: {
    color: '#000',
  },

  tabRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginTop: 12, marginBottom: 12 },
  tabBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.06)',
  },
  tabBtnActive: { backgroundColor: '#10b981' },
  tabText: { color: '#6b7280', fontSize: 13, fontWeight: '600' },
  tabTextActive: { color: '#fff' },
  countBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 6, paddingVertical: 1,
    borderRadius: 8, marginLeft: 2,
  },
  countText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  itemCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  itemIcon: {
    width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(16,185,129,0.15)',
    justifyContent: 'center', alignItems: 'center',
  },
  itemTitle: { color: '#fff', fontSize: 15, fontWeight: '600' },
  itemSub: { color: '#9ca3af', fontSize: 12, marginTop: 2 },
  itemDate: { color: '#6b7280', fontSize: 11, marginTop: 2 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 11, fontWeight: '600' },

  publishBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: 'rgba(16,185,129,0.1)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.25)',
    marginTop: 12,
    marginBottom: 16,
  },
  publishIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#10b981',
    justifyContent: 'center',
    alignItems: 'center',
  },
  publishTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  publishSub: {
    color: '#9ca3af',
    fontSize: 12,
    marginTop: 2,
  },

  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  statIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  statValue: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  statLabel: {
    color: '#6b7280',
    fontSize: 10,
    fontWeight: '500',
    marginTop: 2,
    textAlign: 'center',
  },

  sectionTitle: {
    color: '#9ca3af',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
    marginTop: 4,
  },
  sectionCount: {
    color: '#f59e0b',
    fontWeight: '700',
  },
  emptySection: {
    alignItems: 'center',
    paddingVertical: 24,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 14,
    marginBottom: 16,
  },
  emptySectionText: {
    color: '#6b7280',
    fontSize: 13,
    marginTop: 8,
  },

  signInCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    marginHorizontal: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  signInIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(16,185,129,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  signInTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  signInDesc: {
    color: '#9ca3af',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  signInButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#10b981',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 14,
    width: '100%',
  },
  signInButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
