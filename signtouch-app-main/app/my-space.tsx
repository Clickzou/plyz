import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Image, ActivityIndicator, ScrollView, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Inbox, Video, PenTool, Clock, CheckCircle, XCircle, ChevronRight } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import BottomNav, { BOTTOM_NAV_HEIGHT } from '@/components/BottomNav';

const API_BASE = Platform.OS === 'web' ? '' : (process.env.EXPO_PUBLIC_STRIPE_SERVER_URL || '');

type TabType = 'bookings' | 'autographs';

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
}

const STATUS_COLORS: Record<string, string> = {
  pending_payment: '#f59e0b',
  paid: '#3b82f6',
  confirmed: '#10b981',
  completed: '#10b981',
  cancelled: '#ef4444',
  delivered: '#10b981',
};

export default function MySpaceScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { user } = useAuth();
  const [tab, setTab] = useState<TabType>('bookings');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [autographs, setAutographs] = useState<Autograph[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!user?.id) return;
    try {
      setLoading(true);
      const [bRes, aRes] = await Promise.all([
        fetch(`${API_BASE}/api/my-bookings?user_id=${user.id}&role=fan`),
        fetch(`${API_BASE}/api/my-autographs?user_id=${user.id}&role=fan`),
      ]);
      const bData = await bRes.json();
      const aData = await aRes.json();
      setBookings(bData.bookings || []);
      setAutographs(aData.autographs || []);
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

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
      paid: t('bookingPaid'),
      confirmed: t('bookingConfirmed'),
      completed: t('bookingCompleted'),
      cancelled: t('bookingCancelled'),
      delivered: t('autographDelivered'),
    };
    return map[status] || status;
  };

  const renderBooking = ({ item }: { item: Booking }) => {
    const celeb = item.celebrity_profiles;
    const avatarUrl = celeb?.profiles?.avatar_url || celeb?.wikidata_image_url;
    return (
      <TouchableOpacity
        style={styles.itemCard}
        onPress={() => celeb && router.push(`/celebrity-detail?id=${item.id}`)}
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

  const renderAutograph = ({ item }: { item: Autograph }) => {
    const celeb = item.celebrity_profiles;
    return (
      <TouchableOpacity
        style={styles.itemCard}
        onPress={() => celeb && router.push(`/celebrity-detail?id=${item.id}`)}
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

  if (!user) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <LinearGradient colors={['#0a1628', '#0f2035', '#0a1628']} style={StyleSheet.absoluteFill} />
        <View style={styles.center}>
          <Inbox size={48} color="#374151" />
          <Text style={styles.emptyText}>Please sign in to view your bookings</Text>
        </View>
        <BottomNav />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient colors={['#0a1628', '#0f2035', '#0a1628']} style={StyleSheet.absoluteFill} />
      <View style={styles.header}>
        <Text style={styles.title}>{t('mySpaceTitle')}</Text>
      </View>

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
});
