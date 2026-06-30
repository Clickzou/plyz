import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput,
  Image, Platform, ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Search, Star, CheckCircle, ShieldCheck, ChevronRight, X, Heart, TrendingUp } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '@/contexts/LanguageContext';
import { useFollow } from '@/contexts/FollowContext';
import { useAuthPrompt } from '@/contexts/AuthPromptContext';
import BottomNav, { BOTTOM_NAV_HEIGHT } from '@/components/BottomNav';
import PlyzHeader from '@/components/PlyzHeader';
import AccountAvatarButton from '@/components/AccountAvatarButton';
import { DiscoverSkeleton } from '@/components/SkeletonLoader';
import { useAutoTranslate } from '@/utils/translation';

const API_BASE = Platform.OS === 'web' ? '' : (process.env.EXPO_PUBLIC_STRIPE_SERVER_URL || '');

interface Celebrity {
  user_id: string;
  stage_name: string;
  bio: string | null;
  avatar_url: string | null;
  display_name: string | null;
  stripe_verified: boolean;
  official_verified: boolean;
  occupations: string[];
  types: string[];
  popularity_score: number;
  pricing: {
    video_call_price_cents: number;
    autograph_price_cents: number;
    currency: string;
  } | null;
}

const DEMO_CELEBRITIES: Celebrity[] = [
  { user_id: 'mock-001', stage_name: 'Zinedine Zidane', bio: "Ballon d'Or 1998. Légende du Real Madrid et de l'Équipe de France.", avatar_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f3/Zinedine_Zidane_by_Tasnim_03.jpg/440px-Zinedine_Zidane_by_Tasnim_03.jpg', display_name: 'Zinedine Zidane', stripe_verified: true, official_verified: true, occupations: ['footballer'], types: ['sports'], popularity_score: 98, pricing: { video_call_price_cents: 15000, autograph_price_cents: 5000, currency: 'eur' } },
  { user_id: 'mock-003', stage_name: 'Kylian Mbappé', bio: 'Champion du Monde 2018. Attaquant du Real Madrid.', avatar_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/57/2019-07-17_SG_Dynamo_Dresden_vs._Paris_Saint-Germain_by_Sandro_Halank%E2%80%93129_%28cropped%29.jpg/440px-2019-07-17_SG_Dynamo_Dresden_vs._Paris_Saint-Germain_by_Sandro_Halank%E2%80%93129_%28cropped%29.jpg', display_name: 'Kylian Mbappé', stripe_verified: true, official_verified: true, occupations: ['footballer'], types: ['sports'], popularity_score: 97, pricing: { video_call_price_cents: 25000, autograph_price_cents: 10000, currency: 'eur' } },
  { user_id: 'mock-005', stage_name: 'Omar Sy', bio: 'Acteur français. "Intouchables" et "Lupin" sur Netflix.', avatar_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/54/Omar_Sy_Cannes_2022.jpg/440px-Omar_Sy_Cannes_2022.jpg', display_name: 'Omar Sy', stripe_verified: true, official_verified: true, occupations: ['actor'], types: ['entertainment'], popularity_score: 93, pricing: { video_call_price_cents: 22000, autograph_price_cents: 8000, currency: 'eur' } },
  { user_id: 'mock-002', stage_name: 'Marion Cotillard', bio: "Oscar de la meilleure actrice pour 'La Môme'.", avatar_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/68/Marion_Cotillard_2019.jpg/440px-Marion_Cotillard_2019.jpg', display_name: 'Marion Cotillard', stripe_verified: true, official_verified: true, occupations: ['actress'], types: ['entertainment'], popularity_score: 92, pricing: { video_call_price_cents: 20000, autograph_price_cents: 7500, currency: 'eur' } },
  { user_id: 'mock-004', stage_name: 'Aya Nakamura', bio: 'Artiste francophone la plus écoutée au monde.', avatar_url: null, display_name: 'Aya Nakamura', stripe_verified: true, official_verified: true, occupations: ['singer'], types: ['music'], popularity_score: 90, pricing: { video_call_price_cents: 18000, autograph_price_cents: 6000, currency: 'eur' } },
  { user_id: 'mock-006', stage_name: 'Teddy Riner', bio: 'Triple champion olympique de judo. 10 titres de champion du monde.', avatar_url: null, display_name: 'Teddy Riner', stripe_verified: true, official_verified: true, occupations: ['judoka'], types: ['sports'], popularity_score: 88, pricing: { video_call_price_cents: 12000, autograph_price_cents: 4000, currency: 'eur' } },
  { user_id: 'mock-007', stage_name: 'Léa Seydoux', bio: "James Bond Girl. Palme d'Or à Cannes.", avatar_url: null, display_name: 'Léa Seydoux', stripe_verified: false, official_verified: true, occupations: ['actress'], types: ['entertainment'], popularity_score: 85, pricing: { video_call_price_cents: 18000, autograph_price_cents: 6500, currency: 'eur' } },
  { user_id: 'mock-008', stage_name: 'DJ Snake', bio: '"Turn Down for What", "Lean On", "Taki Taki". Milliards de streams.', avatar_url: null, display_name: 'DJ Snake', stripe_verified: true, official_verified: false, occupations: ['DJ'], types: ['music'], popularity_score: 82, pricing: { video_call_price_cents: 15000, autograph_price_cents: 5000, currency: 'eur' } },
];

const SORT_OPTIONS = [
  { key: 'popular', label: 'sortPopularity' },
  { key: 'name_asc', label: 'sortNameAsc' },
  { key: 'name_desc', label: 'sortNameDesc' },
  { key: 'newest', label: 'sortNewest' },
] as const;

export default function DiscoverScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { isFollowing, toggleFollow, followedCelebrities } = useFollow();
  const { requireAuth } = useAuthPrompt();
  const [celebrities, setCelebrities] = useState<Celebrity[]>(DEMO_CELEBRITIES);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'all' | 'following'>('all');
  const [sort, setSort] = useState('popular');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [, setTotal] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  // Traduction automatique des bios dans la langue de l'utilisateur
  const translateBio = useAutoTranslate(celebrities.map(c => c.bio));

  const fetchCelebrities = useCallback(async (p = 1, reset = false) => {
    try {
      if (reset && celebrities.length === 0) setLoading(true);
      const params = new URLSearchParams({ page: String(p), limit: '20', sort });
      if (search.trim()) params.set('search', search.trim());

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(`${API_BASE}/api/celebrities?${params}`, { signal: controller.signal });
      clearTimeout(timeoutId);
      const data = await res.json();

      if (data.celebrities && data.celebrities.length > 0) {
        if (reset || p === 1) {
          setCelebrities(data.celebrities);
        } else {
          setCelebrities(prev => [...prev, ...data.celebrities]);
        }
        setTotalPages(data.total_pages || 1);
        setTotal(data.total || 0);
        setPage(p);
      } else {
        throw new Error('No data from API');
      }
    } catch (err) {
      console.warn('Using demo celebrities:', err);
      let demo = [...DEMO_CELEBRITIES];
      if (search.trim()) {
        const s = search.trim().toLowerCase();
        demo = demo.filter(c => c.stage_name.toLowerCase().includes(s));
      }
      switch (sort) {
        case 'name_asc': demo.sort((a, b) => a.stage_name.localeCompare(b.stage_name)); break;
        case 'name_desc': demo.sort((a, b) => b.stage_name.localeCompare(a.stage_name)); break;
        case 'newest': break;
        default: demo.sort((a, b) => b.popularity_score - a.popularity_score);
      }
      setCelebrities(demo);
      setTotalPages(1);
      setTotal(demo.length);
      setPage(1);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [search, sort]);

  useEffect(() => {
    fetchCelebrities(1, true);
  }, [sort]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchCelebrities(1, true);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const formatPrice = (cents: number, currency: string) => {
    const amount = (cents / 100).toFixed(2);
    const symbols: Record<string, string> = { eur: '€', usd: '$', gbp: '£' };
    return `${amount}${symbols[currency] || currency}`;
  };

  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());

  const handleImageError = (userId: string) => {
    setFailedImages(prev => new Set(prev).add(userId));
  };

  const renderCelebrity = ({ item }: { item: Celebrity }) => {
    const minPrice = item.pricing
      ? Math.min(
          ...[item.pricing.video_call_price_cents, item.pricing.autograph_price_cents]
            .filter(p => p > 0)
        )
      : 0;

    const showAvatar = item.avatar_url && !failedImages.has(item.user_id);

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => router.push(`/celebrity-detail?id=${item.user_id}`)}
        activeOpacity={0.8}
      >
        <View style={styles.cardImageContainer}>
          {showAvatar ? (
            <Image
              source={{ uri: item.avatar_url! }}
              style={styles.cardImage}
              onError={() => handleImageError(item.user_id)}
            />
          ) : (
            <LinearGradient colors={['#374151', '#1f2937']} style={styles.cardImage}>
              <Text style={styles.cardInitial}>
                {(item.stage_name || '?')[0].toUpperCase()}
              </Text>
            </LinearGradient>
          )}
          <View style={styles.badgeRow}>
            {item.official_verified && (
              <View style={[styles.badge, styles.officialBadge]}>
                <CheckCircle size={10} color="#fff" />
                <Text style={styles.badgeText}>{t('officialBadge')}</Text>
              </View>
            )}
            {item.stripe_verified && (
              <View style={[styles.badge, styles.stripeBadge]}>
                <ShieldCheck size={10} color="#fff" />
              </View>
            )}
          </View>
          <TouchableOpacity
            style={styles.followButton}
            onPress={(e) => {
              e.stopPropagation?.();
              requireAuth(
                () => toggleFollow({ user_id: item.user_id, stage_name: item.stage_name, avatar_url: item.avatar_url }),
                { reason: 'Crée un compte pour suivre cette célébrité' }
              );
            }}
            activeOpacity={0.7}
          >
            <Heart
              size={18}
              color={isFollowing(item.user_id) ? '#ef4444' : '#ffffff'}
              fill={isFollowing(item.user_id) ? '#ef4444' : 'transparent'}
              strokeWidth={2}
            />
          </TouchableOpacity>
        </View>
        <View style={styles.cardBody}>
          <Text style={styles.cardName} numberOfLines={1}>{item.stage_name}</Text>
          {item.bio && (
            <Text style={styles.cardBio} numberOfLines={2}>{translateBio(item.bio)}</Text>
          )}
          {minPrice > 0 && item.pricing && (
            <Text style={styles.cardPrice}>
              {t('fromPrice')} {formatPrice(minPrice, item.pricing.currency)}
            </Text>
          )}
          <View style={styles.cardActions}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => router.push(`/celebrity-detail?id=${item.user_id}`)}
            >
              <Text style={styles.actionText}>{t('viewProfile')}</Text>
              <ChevronRight size={14} color="#10b981" />
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const followedFiltered = React.useMemo(() => {
    const s = search.trim().toLowerCase();
    return followedCelebrities
      .filter(c => !s || (c.stage_name || '').toLowerCase().includes(s))
      .sort((a, b) => (a.stage_name || '').localeCompare(b.stage_name || ''));
  }, [followedCelebrities, search]);

  const renderFollowed = ({ item }: { item: { user_id: string; stage_name: string; avatar_url: string | null } }) => {
    const showAvatar = item.avatar_url && !failedImages.has(item.user_id);
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => router.push(`/celebrity-detail?id=${item.user_id}`)}
        activeOpacity={0.8}
      >
        <View style={styles.cardImageContainer}>
          {showAvatar ? (
            <Image
              source={{ uri: item.avatar_url! }}
              style={styles.cardImage}
              onError={() => handleImageError(item.user_id)}
            />
          ) : (
            <LinearGradient colors={['#374151', '#1f2937']} style={styles.cardImage}>
              <Text style={styles.cardInitial}>
                {(item.stage_name || '?')[0].toUpperCase()}
              </Text>
            </LinearGradient>
          )}
        </View>
        <View style={styles.cardBody}>
          <Text style={styles.cardName} numberOfLines={1}>{item.stage_name}</Text>
          <TouchableOpacity
            style={styles.followingButton}
            onPress={(e) => {
              e.stopPropagation?.();
              toggleFollow({ user_id: item.user_id, stage_name: item.stage_name, avatar_url: item.avatar_url });
            }}
            activeOpacity={0.7}
          >
            <Heart size={14} color="#ef4444" fill="#ef4444" strokeWidth={2} />
            <Text style={styles.followingButtonText}>Suivi ✓</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <PlyzHeader />
      <LinearGradient colors={['#0a1628', '#0f2035', '#0a1628']} style={StyleSheet.absoluteFill} />
      <View style={styles.header}>
        <Text style={styles.title}>{t('discoverTitle')}</Text>
        <Text style={styles.subtitle}>{t('discoverSubtitle')}</Text>
      </View>

      <View style={styles.viewModeRow}>
        <TouchableOpacity
          style={[styles.viewModePill, viewMode === 'all' && styles.viewModePillActive]}
          onPress={() => setViewMode('all')}
          activeOpacity={0.8}
        >
          <Text style={[styles.viewModeText, viewMode === 'all' && styles.viewModeTextActive]}>Tous</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.viewModePill, viewMode === 'following' && styles.viewModePillActive]}
          onPress={() => setViewMode('following')}
          activeOpacity={0.8}
        >
          <Text style={[styles.viewModeText, viewMode === 'following' && styles.viewModeTextActive]}>Suivis</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Search size={18} color="#9ca3af" />
          <TextInput
            style={styles.searchInput}
            placeholder={t('searchPlaceholder')}
            placeholderTextColor="#6b7280"
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <X size={18} color="#9ca3af" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {viewMode === 'all' && !search.trim() && (
        <View style={styles.trendingSection}>
          <View style={styles.trendingHeader}>
            <TrendingUp size={16} color="#f59e0b" />
            <Text style={styles.trendingTitle}>{t('trendingNow') || 'Popular now'}</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.trendingList}>
            {DEMO_CELEBRITIES.slice(0, 5).map(celeb => (
              <TouchableOpacity
                key={`trending-${celeb.user_id}`}
                style={styles.trendingChip}
                onPress={() => router.push(`/celebrity-detail?id=${celeb.user_id}`)}
                activeOpacity={0.7}
              >
                {celeb.avatar_url && !failedImages.has(celeb.user_id) ? (
                  <Image source={{ uri: celeb.avatar_url }} style={styles.trendingAvatar} onError={() => handleImageError(celeb.user_id)} />
                ) : (
                  <View style={[styles.trendingAvatar, { backgroundColor: '#374151', justifyContent: 'center', alignItems: 'center' }]}>
                    <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{celeb.stage_name[0]}</Text>
                  </View>
                )}
                <Text style={styles.trendingName} numberOfLines={1}>{celeb.stage_name.split(' ')[0]}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {viewMode === 'all' && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.sortRow} contentContainerStyle={styles.sortRowContent}>
          {SORT_OPTIONS.map(opt => (
            <TouchableOpacity
              key={opt.key}
              style={[styles.sortChip, sort === opt.key && styles.sortChipActive]}
              onPress={() => setSort(opt.key)}
            >
              <Text style={[styles.sortChipText, sort === opt.key && styles.sortChipTextActive]}>
                {t(opt.label as any)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {viewMode === 'following' ? (
        followedFiltered.length === 0 ? (
          <View style={styles.center}>
            <Heart size={48} color="#374151" />
            {search.trim() ? (
              <Text style={styles.emptyText}>Aucun résultat</Text>
            ) : (
              <>
                <Text style={styles.emptyText}>Tu ne suis aucune célébrité pour l'instant.</Text>
                <Text style={styles.emptyHint}>Découvre-les dans l'onglet Tous.</Text>
              </>
            )}
          </View>
        ) : (
          <FlatList
            data={followedFiltered}
            renderItem={renderFollowed}
            keyExtractor={item => item.user_id}
            numColumns={2}
            columnWrapperStyle={styles.row}
            contentContainerStyle={{ paddingBottom: BOTTOM_NAV_HEIGHT + 20, paddingHorizontal: 12 }}
          />
        )
      ) : loading && celebrities.length === 0 ? (
        <ScrollView style={{ flex: 1 }}>
          <DiscoverSkeleton />
        </ScrollView>
      ) : celebrities.length === 0 ? (
        <View style={styles.center}>
          <Star size={48} color="#374151" />
          <Text style={styles.emptyText}>{t('noCelebrities')}</Text>
          <Text style={styles.emptyHint}>{t('noCelebritiesHint')}</Text>
        </View>
      ) : (
        <FlatList
          data={celebrities}
          renderItem={renderCelebrity}
          keyExtractor={item => item.user_id}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={{ paddingBottom: BOTTOM_NAV_HEIGHT + 20, paddingHorizontal: 12 }}
          onRefresh={() => {
            setRefreshing(true);
            fetchCelebrities(1, true);
          }}
          refreshing={refreshing}
          onEndReached={() => {
            if (page < totalPages) fetchCelebrities(page + 1);
          }}
          onEndReachedThreshold={0.5}
        />
      )}

      <AccountAvatarButton />
      <BottomNav />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a1628' },
  header: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 5 },
  title: { color: '#fff', fontSize: 22, fontWeight: '700', textAlign: 'center' },
  subtitle: { color: '#9ca3af', fontSize: 14, marginTop: 2, textAlign: 'center' },
  viewModeRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingHorizontal: 16, marginTop: 12 },
  viewModePill: {
    paddingHorizontal: 18, paddingVertical: 9, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  viewModePillActive: { backgroundColor: '#10b981' },
  viewModeText: { color: '#9ca3af', fontSize: 13, fontWeight: '600' },
  viewModeTextActive: { color: '#fff' },
  followingButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    marginTop: 10, paddingVertical: 8, borderRadius: 10,
    backgroundColor: 'rgba(239,68,68,0.12)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.35)',
  },
  followingButtonText: { color: '#ef4444', fontSize: 12, fontWeight: '700' },
  searchRow: { paddingHorizontal: 16, marginTop: 12, marginBottom: 4 },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: Platform.OS === 'web' ? 10 : 0, height: 44,
  },
  searchInput: { flex: 1, color: '#fff', fontSize: 15, marginLeft: 10 },
  sortRow: { marginTop: 8, marginBottom: 6, maxHeight: 56 },
  sortRowContent: { paddingHorizontal: 16, gap: 8 },
  sortChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.06)', marginRight: 8,
  },
  sortChipActive: { backgroundColor: '#10b981' },
  sortChipText: { color: '#9ca3af', fontSize: 13, fontWeight: '500' },
  sortChipTextActive: { color: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: '#9ca3af', fontSize: 16, marginTop: 12, fontWeight: '600' },
  emptyHint: { color: '#6b7280', fontSize: 13, marginTop: 4 },
  row: { justifyContent: 'space-between', marginBottom: 12 },
  card: {
    width: '48%', backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  cardImageContainer: { position: 'relative', height: 160 },
  cardImage: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' },
  cardInitial: { color: '#fff', fontSize: 36, fontWeight: '700' },
  badgeRow: { position: 'absolute', top: 8, left: 8, flexDirection: 'row', gap: 4 },
  badge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 8, gap: 3 },
  officialBadge: { backgroundColor: 'rgba(16,185,129,0.85)' },
  stripeBadge: { backgroundColor: 'rgba(99,102,241,0.85)' },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '600' },
  cardBody: { padding: 12 },
  cardName: { color: '#fff', fontSize: 15, fontWeight: '700' },
  cardBio: { color: '#9ca3af', fontSize: 11, marginTop: 4, lineHeight: 16 },
  cardPrice: { color: '#10b981', fontSize: 12, fontWeight: '600', marginTop: 6 },
  cardActions: { marginTop: 8 },
  actionButton: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionText: { color: '#10b981', fontSize: 12, fontWeight: '600' },
  followButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  trendingSection: { paddingHorizontal: 16, marginTop: 10, marginBottom: 4 },
  trendingHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  trendingTitle: { color: '#f59e0b', fontSize: 13, fontWeight: '600' },
  trendingList: { gap: 12, paddingRight: 16 },
  trendingChip: {
    alignItems: 'center', gap: 6, width: 60,
  },
  trendingAvatar: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, borderColor: '#f59e0b' },
  trendingName: { color: '#fff', fontSize: 10, fontWeight: '600', textAlign: 'center' },
});
