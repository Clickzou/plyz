import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Image, Platform, Modal, TextInput, KeyboardAvoidingView,
  Animated as RNAnimated, Dimensions, Share
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Newspaper, CheckCircle, Calendar, Heart, MessageCircle, Send, Share2 } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { useAuthPrompt } from '@/contexts/AuthPromptContext';
import { useFollow } from '@/contexts/FollowContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import BottomNav, { BOTTOM_NAV_HEIGHT } from '@/components/BottomNav';
import PlyzHeader from '@/components/PlyzHeader';
import AccountAvatarButton from '@/components/AccountAvatarButton';
import { FeedSkeleton } from '@/components/SkeletonLoader';

const API_BASE = Platform.OS === 'web' ? '' : (process.env.EXPO_PUBLIC_STRIPE_SERVER_URL || '');
const LIKES_KEY = '@plyz_post_likes';
const COMMENTS_KEY = '@plyz_post_comments';
const LOCAL_POSTS_KEY = '@plyz_local_posts';

const DEMO_FEED: FeedPost[] = [
  { id: 'post-001', kind: 'post', title: 'Nouveau chapitre', body: "Très heureux d'annoncer une nouvelle aventure. Restez connectés ! Merci pour votre soutien incroyable.", media_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/54/Omar_Sy_Cannes_2022.jpg/440px-Omar_Sy_Cannes_2022.jpg', event_date: null, created_at: '2025-12-10T14:30:00Z', like_count: 12453, celebrity: { user_id: 'mock-005', stage_name: 'Omar Sy', avatar_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/54/Omar_Sy_Cannes_2022.jpg/440px-Omar_Sy_Cannes_2022.jpg', official_verified: true, stripe_verified: true } },
  { id: 'post-002', kind: 'event', title: 'Session Live Exclusive', body: 'Rejoignez-moi pour une session live exclusive ce week-end. On parlera football, souvenirs et avenir.', media_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f3/Zinedine_Zidane_by_Tasnim_03.jpg/440px-Zinedine_Zidane_by_Tasnim_03.jpg', event_date: '2026-02-20T18:00:00Z', created_at: '2025-12-08T10:00:00Z', like_count: 34210, celebrity: { user_id: 'mock-001', stage_name: 'Zinedine Zidane', avatar_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f3/Zinedine_Zidane_by_Tasnim_03.jpg/440px-Zinedine_Zidane_by_Tasnim_03.jpg', official_verified: true, stripe_verified: true } },
  { id: 'post-003', kind: 'post', title: null, body: 'Merci à tous les fans pour votre énergie incroyable au concert de Paris ! Vous êtes les meilleurs. On se retrouve bientôt sur scène.', media_url: null, event_date: null, created_at: '2025-12-05T20:00:00Z', like_count: 8920, celebrity: { user_id: 'mock-004', stage_name: 'Aya Nakamura', avatar_url: null, official_verified: true, stripe_verified: true } },
  { id: 'post-004', kind: 'event', title: 'Dédicace en Live', body: 'Réservez votre créneau pour une dédicace personnalisée en vidéo. Places limitées !', media_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/68/Marion_Cotillard_2019.jpg/440px-Marion_Cotillard_2019.jpg', event_date: '2026-03-01T15:00:00Z', created_at: '2025-12-03T09:00:00Z', like_count: 5632, celebrity: { user_id: 'mock-002', stage_name: 'Marion Cotillard', avatar_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/68/Marion_Cotillard_2019.jpg/440px-Marion_Cotillard_2019.jpg', official_verified: true, stripe_verified: true } },
  { id: 'post-005', kind: 'post', title: 'Allez Madrid !', body: 'Quel match incroyable hier soir ! On ne lâche rien. Merci aux supporters, vous êtes incroyables !', media_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/57/2019-07-17_SG_Dynamo_Dresden_vs._Paris_Saint-Germain_by_Sandro_Halank%E2%80%93129_%28cropped%29.jpg/440px-2019-07-17_SG_Dynamo_Dresden_vs._Paris_Saint-Germain_by_Sandro_Halank%E2%80%93129_%28cropped%29.jpg', event_date: null, created_at: '2025-11-28T22:00:00Z', like_count: 45780, celebrity: { user_id: 'mock-003', stage_name: 'Kylian Mbappé', avatar_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/57/2019-07-17_SG_Dynamo_Dresden_vs._Paris_Saint-Germain_by_Sandro_Halank%E2%80%93129_%28cropped%29.jpg/440px-2019-07-17_SG_Dynamo_Dresden_vs._Paris_Saint-Germain_by_Sandro_Halank%E2%80%93129_%28cropped%29.jpg', official_verified: true, stripe_verified: true } },
  { id: 'post-006', kind: 'post', title: 'Retour au dojo', body: "La préparation pour les championnats a commencé. Le judo c'est ma vie. On vise l'or !", media_url: null, event_date: null, created_at: '2025-11-25T08:00:00Z', like_count: 7340, celebrity: { user_id: 'mock-006', stage_name: 'Teddy Riner', avatar_url: null, official_verified: true, stripe_verified: true } },
];

interface FeedPost {
  id: string;
  kind: 'post' | 'event';
  title: string | null;
  body: string | null;
  media_url: string | null;
  event_date: string | null;
  created_at: string;
  like_count?: number;
  celebrity: {
    user_id: string;
    stage_name: string;
    avatar_url: string | null;
    official_verified: boolean;
    stripe_verified: boolean;
  };
}

interface Comment {
  id: string;
  postId: string;
  text: string;
  author: string;
  createdAt: string;
}

const FILTERS = [
  { key: 'all', label: 'filterAll' },
  { key: 'post', label: 'filterPosts' },
  { key: 'event', label: 'filterEvents' },
] as const;

const BANNER_DISMISSED_KEY = '@plyz_celebrity_banner_dismissed';

const INITIAL_COMMENTS: Record<string, Comment[]> = {
  'post-001': [
    { id: 'ic-001', postId: 'post-001', text: 'Trop hâte de voir ça ! 🔥', author: 'Lucas M.', createdAt: '2025-12-10T15:10:00Z' },
    { id: 'ic-002', postId: 'post-001', text: 'Omar tu es le meilleur, on te soutient !', author: 'Sophie R.', createdAt: '2025-12-10T16:22:00Z' },
    { id: 'ic-003', postId: 'post-001', text: 'Légende 🙌', author: 'Karim B.', createdAt: '2025-12-10T18:05:00Z' },
  ],
  'post-002': [
    { id: 'ic-004', postId: 'post-002', text: 'Zizou en live !! Je réserve direct 🤩', author: 'Mehdi A.', createdAt: '2025-12-08T11:30:00Z' },
    { id: 'ic-005', postId: 'post-002', text: 'La classe, vivement le 20 !', author: 'Julie P.', createdAt: '2025-12-08T12:15:00Z' },
    { id: 'ic-006', postId: 'post-002', text: 'Tu nous manques sur le terrain Zizou ❤️', author: 'Antoine D.', createdAt: '2025-12-08T14:00:00Z' },
    { id: 'ic-007', postId: 'post-002', text: 'Le GOAT tout simplement', author: 'Fatima Z.', createdAt: '2025-12-08T15:45:00Z' },
    { id: 'ic-008', postId: 'post-002', text: 'Je vais demander un autographe !', author: 'Thomas L.', createdAt: '2025-12-08T17:20:00Z' },
  ],
  'post-003': [
    { id: 'ic-009', postId: 'post-003', text: 'Le concert était incroyable !! 💃', author: 'Amina K.', createdAt: '2025-12-05T21:00:00Z' },
    { id: 'ic-010', postId: 'post-003', text: 'Djadja en live, frissons garantis', author: 'Emma V.', createdAt: '2025-12-05T22:30:00Z' },
  ],
  'post-005': [
    { id: 'ic-011', postId: 'post-005', text: 'ALLEZ KYLIAN 🇫🇷⚽', author: 'Maxime G.', createdAt: '2025-11-28T22:30:00Z' },
    { id: 'ic-012', postId: 'post-005', text: 'Quel but hier soir, chapeau !', author: 'Nicolas F.', createdAt: '2025-11-28T23:00:00Z' },
    { id: 'ic-013', postId: 'post-005', text: 'Tu fais rêver tout un pays 💪', author: 'Léa C.', createdAt: '2025-11-29T08:00:00Z' },
    { id: 'ic-014', postId: 'post-005', text: 'Hala Madrid y nada más !', author: 'Carlos R.', createdAt: '2025-11-29T09:15:00Z' },
    { id: 'ic-015', postId: 'post-005', text: 'J\'ai réservé une dédicace, trop content', author: 'Yanis M.', createdAt: '2025-11-29T10:45:00Z' },
    { id: 'ic-016', postId: 'post-005', text: 'Le meilleur joueur du monde 🌍', author: 'Sarah B.', createdAt: '2025-11-29T12:00:00Z' },
    { id: 'ic-017', postId: 'post-005', text: 'On est derrière toi Kylian !', author: 'Pierre H.', createdAt: '2025-11-29T14:30:00Z' },
  ],
  'post-006': [
    { id: 'ic-018', postId: 'post-006', text: 'Champion olympique 3 fois, respect total 🥋', author: 'David W.', createdAt: '2025-11-25T10:00:00Z' },
    { id: 'ic-019', postId: 'post-006', text: 'Le dojo te va si bien Teddy !', author: 'Marine L.', createdAt: '2025-11-25T12:30:00Z' },
  ],
};

function formatCount(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return n.toString();
}

function formatTimeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'now';
  if (diffMin < 60) return `${diffMin}m`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString();
}

function LikeButton({ postId, likedPosts, onToggle }: { postId: string; likedPosts: Set<string>; onToggle: (id: string) => void }) {
  const scale = useRef(new RNAnimated.Value(1)).current;
  const isLiked = likedPosts.has(postId);

  const handlePress = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    RNAnimated.sequence([
      RNAnimated.timing(scale, { toValue: 1.3, duration: 100, useNativeDriver: true }),
      RNAnimated.timing(scale, { toValue: 1, duration: 100, useNativeDriver: true }),
    ]).start();
    onToggle(postId);
  };

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.7} style={styles.actionBtn}>
      <RNAnimated.View style={{ transform: [{ scale }] }}>
        <Heart
          size={20}
          color={isLiked ? '#ef4444' : '#6b7280'}
          fill={isLiked ? '#ef4444' : 'none'}
        />
      </RNAnimated.View>
    </TouchableOpacity>
  );
}

export default function ActivityScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { user } = useAuth();
  const { requireAuth } = useAuthPrompt();
  const { isFollowing, toggleFollow } = useFollow();
  const [posts, setPosts] = useState<FeedPost[]>(DEMO_FEED);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [refreshing, setRefreshing] = useState(false);
  const [, setBannerDismissed] = useState(true);
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const [allComments, setAllComments] = useState<Record<string, Comment[]>>({});
  const [commentModalPostId, setCommentModalPostId] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');
  const slideAnim = useRef(new RNAnimated.Value(Dimensions.get('window').height)).current;

  useEffect(() => {
    AsyncStorage.getItem(BANNER_DISMISSED_KEY).then(val => {
      setBannerDismissed(val === 'true');
    });
    loadLikes();
    loadComments();
  }, []);

  const loadLikes = async () => {
    try {
      const stored = await AsyncStorage.getItem(LIKES_KEY);
      if (stored) setLikedPosts(new Set(JSON.parse(stored)));
    } catch {}
  };

  const loadComments = async () => {
    try {
      const stored = await AsyncStorage.getItem(COMMENTS_KEY);
      const userComments = stored ? JSON.parse(stored) : {};
      const merged: Record<string, Comment[]> = { ...INITIAL_COMMENTS };
      for (const postId of Object.keys(userComments)) {
        const userList = userComments[postId] || [];
        const initialList = INITIAL_COMMENTS[postId] || [];
        const initialIds = new Set(initialList.map((c: Comment) => c.id));
        const newUserComments = userList.filter((c: Comment) => !initialIds.has(c.id));
        merged[postId] = [...(merged[postId] || []), ...newUserComments];
      }
      setAllComments(merged);
    } catch {
      setAllComments({ ...INITIAL_COMMENTS });
    }
  };

  const toggleLike = async (postId: string) => {
    setLikedPosts(prev => {
      const next = new Set(prev);
      if (next.has(postId)) {
        next.delete(postId);
      } else {
        next.add(postId);
      }
      AsyncStorage.setItem(LIKES_KEY, JSON.stringify([...next]));
      return next;
    });
  };

  const handleLike = (postId: string) => {
    requireAuth(() => toggleLike(postId), { reason: 'Crée un compte pour aimer ce post' });
  };

  const openComments = (postId: string) => {
    setCommentModalPostId(postId);
    setCommentText('');
    RNAnimated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
  };

  const closeComments = () => {
    RNAnimated.timing(slideAnim, {
      toValue: Dimensions.get('window').height,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      setCommentModalPostId(null);
      setCommentText('');
    });
  };

  const addComment = async () => {
    if (!commentText.trim() || !commentModalPostId) return;
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    const newComment: Comment = {
      id: `comment-${Date.now()}`,
      postId: commentModalPostId,
      text: commentText.trim(),
      author: 'You',
      createdAt: new Date().toISOString(),
    };
    const updated = {
      ...allComments,
      [commentModalPostId]: [...(allComments[commentModalPostId] || []), newComment],
    };
    setAllComments(updated);
    setCommentText('');
    await AsyncStorage.setItem(COMMENTS_KEY, JSON.stringify(updated));
  };

  const sharePost = async (item: FeedPost) => {
    try {
      const message = item.title
        ? `${item.celebrity.stage_name} - ${item.title}\n\n${item.body || ''}\n\nVia Plyz`
        : `${item.celebrity.stage_name}\n\n${item.body || ''}\n\nVia Plyz`;
      await Share.share({ message });
    } catch {}
  };

  const loadLocalPosts = async (): Promise<FeedPost[]> => {
    try {
      const stored = await AsyncStorage.getItem(LOCAL_POSTS_KEY);
      if (stored) return JSON.parse(stored);
    } catch {}
    return [];
  };

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

      let feedPosts = data.posts && data.posts.length > 0 ? data.posts : null;
      if (!feedPosts) throw new Error('No data');

      const localPosts = await loadLocalPosts();
      const filteredLocal = filter === 'all' ? localPosts : localPosts.filter(lp => lp.kind === filter);

      if (reset || p === 1) {
        const seenIds = new Set<string>();
        const merged = [...filteredLocal, ...feedPosts]
          .filter((it: FeedPost) => (seenIds.has(it.id) ? false : (seenIds.add(it.id), true)))
          .sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
        setPosts(merged);
      } else {
        setPosts(prev => {
          const existingIds = new Set(prev.map(p => p.id));
          const newPosts = feedPosts.filter((fp: FeedPost) => !existingIds.has(fp.id));
          return [...prev, ...newPosts];
        });
      }
      setPage(p);
    } catch (err) {
      console.warn('Using demo feed:', err);
      let demo = [...DEMO_FEED];
      if (filter !== 'all') {
        demo = demo.filter(p => p.kind === filter);
      }
      const localPosts = await loadLocalPosts();
      const filteredLocal = filter === 'all' ? localPosts : localPosts.filter(lp => lp.kind === filter);
      const seenIds = new Set<string>();
      const merged = [...filteredLocal, ...demo]
        .filter((it: FeedPost) => (seenIds.has(it.id) ? false : (seenIds.add(it.id), true)))
        .sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      setPosts(merged);
      setPage(1);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchFeed(1, true);
  }, [filter]);

  const getCommentCount = (postId: string) => (allComments[postId] || []).length;

  const renderPost = ({ item }: { item: FeedPost }) => {
    const commentCount = getCommentCount(item.id);
    const isLiked = likedPosts.has(item.id);

    return (
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
            {/* Boutons Suivre + Event sur une ligne dédiée sous la date
                (évite de serrer le nom quand il est long). */}
            <View style={styles.headerActionsRow}>
              {user?.id !== item.celebrity.user_id && (
                (() => {
                  const followed = isFollowing(item.celebrity.user_id);
                  return (
                    <TouchableOpacity
                      style={[styles.followChip, followed && styles.followChipActive]}
                      onPress={(e) => {
                        e.stopPropagation?.();
                        requireAuth(
                          () => toggleFollow({
                            user_id: item.celebrity.user_id,
                            stage_name: item.celebrity.stage_name,
                            avatar_url: item.celebrity.avatar_url,
                          }),
                          { reason: 'Crée un compte pour suivre cette célébrité' }
                        );
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.followChipText, followed && styles.followChipTextActive]}>
                        {followed ? 'Suivi ✓' : 'Suivre'}
                      </Text>
                    </TouchableOpacity>
                  );
                })()
              )}
              {item.kind === 'event' && (
                <TouchableOpacity
                  style={styles.eventBadge}
                  onPress={() => router.push('/fan-choice')}
                  activeOpacity={0.7}
                >
                  <Calendar size={12} color="#fff" />
                  <Text style={styles.eventBadgeText}>Event</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </TouchableOpacity>

        {item.title && <Text style={styles.postTitle}>{item.title}</Text>}
        {item.body && <Text style={styles.postBody}>{item.body}</Text>}
        {item.media_url && (
          <Image source={{ uri: item.media_url }} style={styles.postImage} />
        )}
        {item.kind === 'event' && item.event_date && (
          <TouchableOpacity
            style={styles.eventDateRow}
            onPress={() => router.push('/fan-choice')}
            activeOpacity={0.7}
          >
            <Calendar size={14} color="#f59e0b" />
            <Text style={styles.eventDateText}>
              {t('eventOn')} {new Date(item.event_date).toLocaleDateString()}
            </Text>
          </TouchableOpacity>
        )}

        <View style={styles.actionsRow}>
          <View style={styles.actionGroup}>
            <LikeButton postId={item.id} likedPosts={likedPosts} onToggle={handleLike} />
            <Text style={[styles.actionCount, isLiked && { color: '#ef4444' }]}>
              {formatCount((item.like_count || 0) + (isLiked ? 1 : 0))}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.actionGroup}
            onPress={() => openComments(item.id)}
            activeOpacity={0.7}
          >
            <View style={styles.actionBtn}>
              <MessageCircle size={20} color={commentCount > 0 ? '#3b82f6' : '#6b7280'} />
            </View>
            <Text style={[styles.actionCount, commentCount > 0 && { color: '#3b82f6' }]}>
              {commentCount > 0 ? formatCount(commentCount) : t('comment' as any)}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionGroup}
            onPress={() => requireAuth(() => sharePost(item), { reason: 'Crée un compte pour partager' })}
            activeOpacity={0.7}
          >
            <View style={styles.actionBtn}>
              <Share2 size={20} color="#6b7280" />
            </View>
            <Text style={styles.actionCount}>{t('share' as any) || 'Share'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const modalPost = commentModalPostId ? posts.find(p => p.id === commentModalPostId) : null;
  const modalComments = commentModalPostId ? (allComments[commentModalPostId] || []) : [];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <PlyzHeader />
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

      {loading && posts.length === 0 ? (
        <FeedSkeleton />
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
          ListHeaderComponent={null}
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

      <Modal
        visible={commentModalPostId !== null}
        transparent
        animationType="none"
        onRequestClose={closeComments}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalBackdrop} onPress={closeComments} activeOpacity={1} />
          <RNAnimated.View
            style={[
              styles.commentSheet,
              { transform: [{ translateY: slideAnim }], paddingBottom: insets.bottom + 8 },
            ]}
          >
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>{t('comments' as any)}</Text>

            {modalPost && (
              <View style={styles.sheetPostPreview}>
                <Text style={styles.sheetPostAuthor}>{modalPost.celebrity.stage_name}</Text>
                {modalPost.title && <Text style={styles.sheetPostText} numberOfLines={1}>{modalPost.title}</Text>}
                {modalPost.body && <Text style={styles.sheetPostBody} numberOfLines={2}>{modalPost.body}</Text>}
              </View>
            )}

            <View style={styles.commentDivider} />

            {modalComments.length === 0 ? (
              <View style={styles.noCommentsWrap}>
                <MessageCircle size={32} color="#374151" />
                <Text style={styles.noCommentsText}>{t('noComments' as any)}</Text>
              </View>
            ) : (
              <FlatList
                data={modalComments}
                keyExtractor={c => c.id}
                style={styles.commentList}
                renderItem={({ item: c }) => (
                  <View style={styles.commentItem}>
                    <View style={styles.commentAvatar}>
                      <Text style={styles.commentAvatarText}>
                        {c.author[0].toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={styles.commentHeader}>
                        <Text style={styles.commentAuthor}>{c.author}</Text>
                        <Text style={styles.commentTime}>{formatTimeAgo(c.createdAt)}</Text>
                      </View>
                      <Text style={styles.commentText}>{c.text}</Text>
                    </View>
                  </View>
                )}
                ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
              />
            )}

            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              keyboardVerticalOffset={100}
            >
              <View style={styles.commentInputRow}>
                <TextInput
                  style={styles.commentInput}
                  placeholder={t('addComment' as any)}
                  placeholderTextColor="#6b7280"
                  value={commentText}
                  onChangeText={setCommentText}
                  multiline
                  maxLength={500}
                />
                <TouchableOpacity
                  style={[styles.sendBtn, !commentText.trim() && styles.sendBtnDisabled]}
                  onPress={addComment}
                  disabled={!commentText.trim()}
                  activeOpacity={0.7}
                >
                  <Send size={18} color={commentText.trim() ? '#fff' : '#6b7280'} />
                </TouchableOpacity>
              </View>
            </KeyboardAvoidingView>
          </RNAnimated.View>
        </View>
      </Modal>

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
  filterRow: { flexDirection: 'row', justifyContent: 'center', paddingHorizontal: 16, gap: 8, marginTop: 12, marginBottom: 8 },
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
  postHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 12 },
  headerActionsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  avatarPlaceholder: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#374151',
    justifyContent: 'center', alignItems: 'center',
  },
  avatarInitial: { color: '#fff', fontSize: 16, fontWeight: '700' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stageName: { color: '#fff', fontSize: 15, fontWeight: '600' },
  postTime: { color: '#6b7280', fontSize: 12, marginTop: 1 },
  followChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#10b981',
    backgroundColor: 'transparent',
  },
  followChipActive: {
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  followChipText: {
    color: '#10b981',
    fontSize: 12,
    fontWeight: '700',
  },
  followChipTextActive: {
    color: '#9ca3af',
  },
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

  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  actionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionBtn: {
    padding: 4,
  },
  actionCount: {
    color: '#6b7280',
    fontSize: 13,
    fontWeight: '500',
  },

  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  commentSheet: {
    backgroundColor: '#111827',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '75%',
    minHeight: 320,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#374151',
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  sheetPostPreview: {
    paddingBottom: 12,
  },
  sheetPostAuthor: {
    color: '#10b981',
    fontSize: 13,
    fontWeight: '600',
  },
  sheetPostText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 2,
  },
  sheetPostBody: {
    color: '#9ca3af',
    fontSize: 13,
    marginTop: 2,
  },
  commentDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginBottom: 12,
  },
  noCommentsWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
  },
  noCommentsText: {
    color: '#6b7280',
    fontSize: 14,
    marginTop: 8,
  },
  commentList: {
    flex: 1,
    marginBottom: 12,
  },
  commentItem: {
    flexDirection: 'row',
    gap: 10,
  },
  commentAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1f2937',
    justifyContent: 'center',
    alignItems: 'center',
  },
  commentAvatarText: {
    color: '#9ca3af',
    fontSize: 13,
    fontWeight: '700',
  },
  commentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  commentAuthor: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  commentTime: {
    color: '#6b7280',
    fontSize: 11,
  },
  commentText: {
    color: '#d1d5db',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 2,
  },
  commentInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  commentInput: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: '#fff',
    fontSize: 14,
    maxHeight: 80,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#10b981',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: 'rgba(255,255,255,0.06)',
  },

  celebrityBanner: {
    backgroundColor: 'rgba(245,158,11,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.25)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    position: 'relative' as const,
  },
  bannerClose: {
    position: 'absolute' as const,
    top: 10,
    right: 10,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    zIndex: 2,
  },
  bannerContent: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    marginBottom: 14,
    paddingRight: 24,
  },
  bannerIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(245,158,11,0.15)',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  bannerTitle: {
    color: '#f59e0b',
    fontSize: 16,
    fontWeight: '700' as const,
    marginBottom: 3,
  },
  bannerDesc: {
    color: '#d1d5db',
    fontSize: 13,
    lineHeight: 18,
  },
  bannerButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 8,
    backgroundColor: '#f59e0b',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  bannerButtonText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '700' as const,
  },
});
