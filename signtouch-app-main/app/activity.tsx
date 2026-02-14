import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Image, ActivityIndicator, Platform
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Newspaper, CheckCircle, Calendar, MessageSquare, Camera } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '@/contexts/LanguageContext';
import BottomNav, { BOTTOM_NAV_HEIGHT } from '@/components/BottomNav';

const API_BASE = Platform.OS === 'web' ? '' : (process.env.EXPO_PUBLIC_STRIPE_SERVER_URL || '');

const DEMO_FEED: FeedPost[] = [
  { id: 'post-001', kind: 'post', title: 'Nouveau chapitre', body: "Très heureux d'annoncer une nouvelle aventure. Restez connectés !", media_url: null, event_date: null, created_at: '2025-12-10T14:30:00Z', celebrity: { user_id: 'mock-005', stage_name: 'Omar Sy', avatar_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/54/Omar_Sy_Cannes_2022.jpg/440px-Omar_Sy_Cannes_2022.jpg', official_verified: true, stripe_verified: true } },
  { id: 'post-002', kind: 'event', title: 'Session Live Exclusive', body: 'Rejoignez-moi pour une session live exclusive. On parlera football et souvenirs.', media_url: null, event_date: '2026-02-20T18:00:00Z', created_at: '2025-12-08T10:00:00Z', celebrity: { user_id: 'mock-001', stage_name: 'Zinedine Zidane', avatar_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f3/Zinedine_Zidane_by_Tasnim_03.jpg/440px-Zinedine_Zidane_by_Tasnim_03.jpg', official_verified: true, stripe_verified: true } },
  { id: 'post-003', kind: 'post', title: null, body: 'Merci à tous les fans pour votre énergie incroyable au concert de Paris !', media_url: null, event_date: null, created_at: '2025-12-05T20:00:00Z', celebrity: { user_id: 'mock-004', stage_name: 'Aya Nakamura', avatar_url: null, official_verified: true, stripe_verified: true } },
  { id: 'post-004', kind: 'event', title: 'Dédicace en Live', body: 'Réservez votre créneau pour une dédicace personnalisée en vidéo. Places limitées !', media_url: null, event_date: '2026-03-01T15:00:00Z', created_at: '2025-12-03T09:00:00Z', celebrity: { user_id: 'mock-002', stage_name: 'Marion Cotillard', avatar_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/68/Marion_Cotillard_2019.jpg/440px-Marion_Cotillard_2019.jpg', official_verified: true, stripe_verified: true } },
  { id: 'post-005', kind: 'post', title: 'Allez Madrid !', body: 'Quel match incroyable hier soir ! On ne lâche rien.', media_url: null, event_date: null, created_at: '2025-11-28T22:00:00Z', celebrity: { user_id: 'mock-003', stage_name: 'Kylian Mbappé', avatar_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/57/2019-07-17_SG_Dynamo_Dresden_vs._Paris_Saint-Germain_by_Sandro_Halank%E2%80%93129_%28cropped%29.jpg/440px-2019-07-17_SG_Dynamo_Dresden_vs._Paris_Saint-Germain_by_Sandro_Halank%E2%80%93129_%28cropped%29.jpg', official_verified: true, stripe_verified: true } },
  { id: 'post-006', kind: 'post', title: 'Retour au dojo', body: "La préparation pour les championnats a commencé. Le judo c'est ma vie.", media_url: null, event_date: null, created_at: '2025-11-25T08:00:00Z', celebrity: { user_id: 'mock-006', stage_name: 'Teddy Riner', avatar_url: null, official_verified: true, stripe_verified: true } },
];

interface FeedPost {
  id: string;
  kind: 'post' | 'event';
  title: string | null;
  body: string | null;
  media_url: string | null;
  event_date: string | null;
  created_at: string;
  celebrity: {
    user_id: string;
    stage_name: string;
    avatar_url: string | null;
    official_verified: boolean;
    stripe_verified: boolean;
  };
}

const FILTERS = [
  { key: 'all', label: 'filterAll' },
  { key: 'post', label: 'filterPosts' },
  { key: 'event', label: 'filterEvents' },
] as const;

export default function ActivityScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const [posts, setPosts] = useState<FeedPost[]>(DEMO_FEED);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [refreshing, setRefreshing] = useState(false);

  const fetchFeed = useCallback(async (p = 1, reset = false) => {
    try {
      if (reset && posts.length === 0) setLoading(true);
      const params = new URLSearchParams({ page: String(p), limit: '20' });
      if (filter !== 'all') params.set('kind', filter);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(`${API_BASE}/api/feed?${params}`, { signal: controller.signal });
      clearTimeout(timeoutId);
      const data = await res.json();

      if (data.posts && data.posts.length > 0) {
        if (reset || p === 1) {
          setPosts(data.posts);
        } else {
          setPosts(prev => [...prev, ...data.posts]);
        }
        setPage(p);
      } else {
        throw new Error('No data');
      }
    } catch (err) {
      console.warn('Using demo feed:', err);
      let demo = [...DEMO_FEED];
      if (filter !== 'all') {
        demo = demo.filter(p => p.kind === filter);
      }
      setPosts(demo);
      setPage(1);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchFeed(1, true);
  }, [filter]);

  const renderPost = ({ item }: { item: FeedPost }) => (
    <View style={styles.postCard}>
      <TouchableOpacity
        style={styles.postHeader}
        onPress={() => router.push(`/celebrity-detail?id=${item.celebrity.user_id}`)}
      >
        {item.celebrity.avatar_url ? (
          <Image source={{ uri: item.celebrity.avatar_url }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarInitial}>
              {(item.celebrity.stage_name || '?')[0].toUpperCase()}
            </Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <View style={styles.nameRow}>
            <Text style={styles.stageName}>{item.celebrity.stage_name}</Text>
            {item.celebrity.official_verified && (
              <CheckCircle size={14} color="#10b981" />
            )}
          </View>
          <Text style={styles.postTime}>
            {new Date(item.created_at).toLocaleDateString()}
          </Text>
        </View>
        {item.kind === 'event' && (
          <View style={styles.eventBadge}>
            <Calendar size={12} color="#fff" />
            <Text style={styles.eventBadgeText}>Event</Text>
          </View>
        )}
      </TouchableOpacity>

      {item.title && <Text style={styles.postTitle}>{item.title}</Text>}
      {item.body && <Text style={styles.postBody}>{item.body}</Text>}
      {item.media_url && (
        <Image source={{ uri: item.media_url }} style={styles.postImage} />
      )}
      {item.kind === 'event' && item.event_date && (
        <View style={styles.eventDateRow}>
          <Calendar size={14} color="#f59e0b" />
          <Text style={styles.eventDateText}>
            {t('eventOn')} {new Date(item.event_date).toLocaleDateString()}
          </Text>
        </View>
      )}
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient colors={['#0a1628', '#0f2035', '#0a1628']} style={StyleSheet.absoluteFill} />
      <View style={styles.header}>
        <Text style={styles.title}>{t('activityTitle')}</Text>
        <Text style={styles.subtitle}>{t('activitySubtitle')}</Text>
      </View>

      <View style={styles.filterRow}>
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[styles.filterText, filter === f.key && styles.filterTextActive]}>
              {t(f.label as any)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#10b981" />
        </View>
      ) : posts.length === 0 ? (
        <View style={styles.center}>
          <Newspaper size={48} color="#374151" />
          <Text style={styles.emptyText}>{t('noActivity')}</Text>
          <Text style={styles.emptyHint}>{t('noActivityHint')}</Text>
        </View>
      ) : (
        <FlatList
          data={posts}
          renderItem={renderPost}
          keyExtractor={item => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: BOTTOM_NAV_HEIGHT + 20 }}
          onRefresh={() => {
            setRefreshing(true);
            fetchFeed(1, true);
          }}
          refreshing={refreshing}
          onEndReached={() => fetchFeed(page + 1)}
          onEndReachedThreshold={0.5}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        />
      )}

      <TouchableOpacity
        style={styles.fab}
        activeOpacity={0.85}
        onPress={() => {
          if (Platform.OS !== 'web') {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }
          router.push('/camera');
        }}
      >
        <Camera size={28} color="#fff" strokeWidth={2.5} />
      </TouchableOpacity>

      <BottomNav />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a1628' },
  header: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 5 },
  title: { color: '#fff', fontSize: 24, fontWeight: '700' },
  subtitle: { color: '#9ca3af', fontSize: 14, marginTop: 2 },
  filterRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginTop: 12, marginBottom: 8 },
  filterChip: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  filterChipActive: { backgroundColor: '#10b981' },
  filterText: { color: '#9ca3af', fontSize: 13, fontWeight: '500' },
  filterTextActive: { color: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: '#9ca3af', fontSize: 16, marginTop: 12, fontWeight: '600' },
  emptyHint: { color: '#6b7280', fontSize: 13, marginTop: 4 },
  postCard: {
    backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  postHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  avatarPlaceholder: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#374151',
    justifyContent: 'center', alignItems: 'center',
  },
  avatarInitial: { color: '#fff', fontSize: 16, fontWeight: '700' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stageName: { color: '#fff', fontSize: 15, fontWeight: '600' },
  postTime: { color: '#6b7280', fontSize: 12, marginTop: 1 },
  eventBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(245,158,11,0.2)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
  },
  eventBadgeText: { color: '#f59e0b', fontSize: 11, fontWeight: '600' },
  postTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },
  postBody: { color: '#d1d5db', fontSize: 14, lineHeight: 22, marginTop: 6 },
  postImage: { width: '100%', height: 200, borderRadius: 12, marginTop: 10 },
  eventDateRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  eventDateText: { color: '#f59e0b', fontSize: 13, fontWeight: '500' },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: BOTTOM_NAV_HEIGHT + 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#10b981',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 100,
  },
});
