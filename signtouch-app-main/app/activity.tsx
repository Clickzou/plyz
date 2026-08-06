import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getDateLocale } from '@/utils/dateLocale';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Image, Platform, Modal, TextInput, KeyboardAvoidingView,
  Animated as RNAnimated, Dimensions, Share, ActivityIndicator
} from 'react-native';
import { showAlert, showConfirm } from '@/utils/alertHelper';
import { supabase } from '@/utils/supabase';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Newspaper, CheckCircle, Calendar, MapPin, Heart, MessageCircle, Send, Share2, Flag, Play } from 'lucide-react-native';
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
import { useAutoTranslate } from '@/utils/translation';
import ReportContentModal from '@/components/ReportContentModal';
import VisionneuseMedia, { MediaVisionnable } from '@/components/VisionneuseMedia';
import { estUneVideo } from '@/utils/media';
import { openEventLocation } from '@/utils/openMap';

const API_BASE = process.env.EXPO_PUBLIC_STRIPE_SERVER_URL || '';
const LIKES_KEY = '@plyz_post_likes';
const LOCAL_POSTS_KEY = '@plyz_local_posts';


interface FeedPost {
  id: string;
  kind: 'post' | 'event';
  title: string | null;
  body: string | null;
  media_url: string | null;
  event_date: string | null;
  // Lieu de l'événement : indispensable pour une dédicace, qui se reçoit EN
  // PERSONNE (le fan doit être à moins d'1 km le jour J).
  location?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  created_at: string;
  like_count?: number;
  /** Tenu par un déclencheur en base : le même chiffre pour tout le monde. */
  comment_count?: number;
  celebrity: {
    user_id: string;
    stage_name: string;
    avatar_url: string | null;
    official_verified: boolean;
    stripe_verified: boolean;
  };
}

// Commentaire tel que servi par la vue `post_comments_public` : le message ET
// son auteur (nom public + photo), pour ne pas avoir à recharger un profil par
// ligne affichée.
interface Comment {
  id: string;
  post_id: string;
  parent_id: string | null;
  author_id: string;
  body: string;
  created_at: string;
  author_name: string;
  author_avatar: string | null;
  /** Vrai quand c'est la personnalité qui a publié le post : badge « Auteur ». */
  is_post_author: boolean;
}

const FILTERS = [
  { key: 'all', label: 'filterAll' },
  { key: 'post', label: 'filterPosts' },
  { key: 'event', label: 'filterEvents' },
] as const;

const BANNER_DISMISSED_KEY = '@plyz_celebrity_banner_dismissed';

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
  // Démarrage à vide : le fil s'ouvrait sur des célébrités fictives affichées
  // AVANT même la réponse du serveur — elles apparaissaient donc à chaque
  // ouverture, à tout le monde, badges « Officiel » et « Stripe vérifié » compris.
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [refreshing, setRefreshing] = useState(false);
  // Distingue « rien à afficher » de « le chargement a échoué » : sans ça, une
  // panne réseau se présentait comme un fil vide, message trompeur à l'appui.
  const [loadFailed, setLoadFailed] = useState(false);
  // Empêche de redemander indéfiniment une page suivante qui n'existe pas.
  const [hasMore, setHasMore] = useState(true);
  // Publication visee par un signalement, ou null si la fenetre est fermee.
  const [reportTarget, setReportTarget] = useState<FeedPost | null>(null);
  const [, setBannerDismissed] = useState(true);
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const [allComments, setAllComments] = useState<Record<string, Comment[]>>({});
  const [commentModalPostId, setCommentModalPostId] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsFailed, setCommentsFailed] = useState(false);
  const [sendingComment, setSendingComment] = useState(false);
  // Commentaire auquel on répond (fil à un seul niveau).
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  // Commentaire visé par un signalement.
  const [reportedComment, setReportedComment] = useState<Comment | null>(null);
  // Media affiche en plein ecran (photo ou video), null = ferme.
  const [mediaPleinEcran, setMediaPleinEcran] = useState<MediaVisionnable | null>(null);

  // Traduction automatique des posts (titre + texte) dans la langue de l'utilisateur
  const tr = useAutoTranslate([...posts.flatMap(p => [p.title, p.body]), 'Suivi ✓', 'Suivre', 'Event']);
  // Libellés des commentaires : pas encore dans les 15 locales, traduits à la
  // volée comme le reste des textes récents de l'app.
  const trUI = useAutoTranslate([
    'Auteur',
    'Réponse à',
    'Signaler',
    'Supprimer ce commentaire ?',
    'Il ne sera plus visible par personne.',
    "Ton commentaire n'a pas pu être publié. Vérifie ta connexion et réessaie.",
    "Le commentaire n'a pas pu être supprimé.",
    'Impossible de charger les commentaires.',
    'Connecte-toi pour commenter',
    'Connecte-toi pour signaler ce contenu',
  ]);
  const slideAnim = useRef(new RNAnimated.Value(Dimensions.get('window').height)).current;

  useEffect(() => {
    AsyncStorage.getItem(BANNER_DISMISSED_KEY).then(val => {
      setBannerDismissed(val === 'true');
    });
    loadLikes();
    // Les commentaires sont chargés à l'ouverture de la publication concernée,
    // pas au démarrage : inutile de télécharger les fils de tout le monde.
  }, []);

  const loadLikes = async () => {
    try {
      const stored = await AsyncStorage.getItem(LIKES_KEY);
      if (stored) setLikedPosts(new Set(JSON.parse(stored)));
    } catch {}
  };

  // Charge les commentaires D'UNE publication depuis la base. Ils étaient
  // auparavant lus dans la mémoire du téléphone : chacun ne voyait que les
  // siens, et la personnalité ne recevait jamais rien.
  const loadComments = async (postId: string) => {
    setCommentsLoading(true);
    try {
      const { data, error } = await supabase
        .from('post_comments_public')
        .select('*')
        .eq('post_id', postId)
        .order('created_at', { ascending: true })
        .limit(200);
      if (error) throw error;
      setAllComments(prev => ({ ...prev, [postId]: (data || []) as Comment[] }));
      setCommentsFailed(false);
    } catch (e) {
      console.warn('[Comments] chargement impossible', e);
      setCommentsFailed(true);
    } finally {
      setCommentsLoading(false);
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
    // Aimer n'expose l'utilisateur à personne : pas de pseudo ni de photo exigés.
    requireAuth(() => toggleLike(postId), { reason: 'Crée un compte pour aimer ce post', requireBillingIdentity: false, requirePublicProfile: false });
  };

  // Publications deja comptees pendant cette session : sans ce garde-fou, un
  // aller-retour dans le fil gonflerait le compteur et le chiffre montre a la
  // personnalite ne voudrait plus rien dire.
  const vuesSignalees = useRef<Set<string>>(new Set());

  const signalerVues = useCallback(({ viewableItems }: any) => {
    for (const v of viewableItems || []) {
      const id = v?.item?.id;
      if (!id || vuesSignalees.current.has(id)) continue;
      vuesSignalees.current.add(id);
      fetch(`${API_BASE}/api/post-viewed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: id }),
      }).catch(() => { /* un compteur ne doit jamais gêner l'utilisateur */ });
    }
  }, []);

  // Une publication compte comme VUE quand la moitie de sa carte est restee a
  // l'ecran une seconde entiere : un defilement rapide ne compte pas.
  const configVisibilite = useRef({ itemVisiblePercentThreshold: 50, minimumViewTime: 1000 }).current;

  const openComments = (postId: string) => {
    setCommentModalPostId(postId);
    setCommentText('');
    setReplyTo(null);
    loadComments(postId);
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
      setReplyTo(null);
    });
  };

  // Touche le champ sans compte : on le demande tout de suite, avant la frappe.
  const demanderCompteCommentaire = () => {
    requireAuth(() => {}, {
      reason: trUI('Connecte-toi pour commenter'),
      requireBillingIdentity: false,
    });
  };

  const addComment = () => {
    const texte = commentText.trim();
    const postId = commentModalPostId;
    if (!texte || !postId || sendingComment) return;
    requireAuth(() => envoyerCommentaire(postId, texte), {
      reason: trUI('Connecte-toi pour commenter'),
      requireBillingIdentity: false,
    });
  };

  const envoyerCommentaire = async (postId: string, texte: string) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setSendingComment(true);
    try {
      const { error } = await supabase.from('post_comments').insert({
        post_id: postId,
        author_id: user?.id,
        parent_id: replyTo?.id || null,
        body: texte,
      });
      if (error) throw error;
      setCommentText('');
      setReplyTo(null);
      await loadComments(postId);
      // Le compteur du fil vient du serveur : on l'ajuste sur place plutôt que
      // de recharger toute la liste sous les doigts de l'utilisateur.
      setPosts(prev => prev.map(p =>
        p.id === postId ? { ...p, comment_count: (p.comment_count || 0) + 1 } : p
      ));
    } catch (e: any) {
      console.error('[Comments] envoi impossible', e);
      // Un envoi qui échoue en silence, c'est un message que l'on croit envoyé.
      showAlert(
        t('error') || 'Erreur',
        trUI("Ton commentaire n'a pas pu être publié. Vérifie ta connexion et réessaie."),
      );
    } finally {
      setSendingComment(false);
    }
  };

  // Retrait d'un commentaire : par son auteur, ou par la personnalité chez qui
  // il a été écrit (elle doit pouvoir modérer sa propre publication).
  const supprimerCommentaire = (c: Comment) => {
    if (!commentModalPostId) return;
    showConfirm(
      trUI('Supprimer ce commentaire ?'),
      trUI('Il ne sera plus visible par personne.'),
      [
        { text: t('cancel') || 'Annuler', style: 'cancel' },
        {
          text: t('delete' as any) || 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            const postId = commentModalPostId;
            try {
              const { error } = await supabase
                .from('post_comments')
                .update({ deleted_at: new Date().toISOString(), deleted_by: user?.id })
                .eq('id', c.id);
              if (error) throw error;
              await loadComments(postId);
              setPosts(prev => prev.map(p =>
                p.id === postId ? { ...p, comment_count: Math.max(0, (p.comment_count || 1) - 1) } : p
              ));
            } catch (e) {
              console.error('[Comments] suppression impossible', e);
              showAlert(
                t('error') || 'Erreur',
                trUI("Le commentaire n'a pas pu être supprimé."),
              );
            }
          },
        },
      ],
    );
  };

  const sharePost = async (item: FeedPost) => {
    try {
      // Lien vers la page web du post : au partage (WhatsApp, Insta, X...), il
      // affiche une belle carte (photo + texte) qui incite à découvrir Plyz.
      const link = `https://plyz.io/post/${item.id}`;
      const intro = item.title
        ? `${item.celebrity.stage_name} — ${item.title}`
        : `${item.celebrity.stage_name} sur Plyz`;
      const message = `${intro}\n\n${item.body || ''}\n\n👉 ${link}`;
      await Share.share({ message, url: link });
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
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const res = await fetch(`${API_BASE}/api/feed?${params}`, { signal: controller.signal });
      clearTimeout(timeoutId);
      const data = await res.json();

      setLoadFailed(false);
      const feedPosts: FeedPost[] = Array.isArray(data.posts) ? data.posts : [];

      // Une page vide n'est PAS une erreur. Traitée comme telle, elle faisait
      // vider la liste par le catch : avec une seule publication, `onEndReached`
      // se déclenche aussitôt (la liste est plus courte que l'écran), demande la
      // page 2, reçoit zéro post — et le fil se vidait 0,2 s après s'être affiché.
      // Les 6 publications fictives remplissaient l'écran et masquaient ce défaut.
      setHasMore(feedPosts.length >= 20);
      if (feedPosts.length === 0) {
        if (p > 1) return; // fin de liste : il n'y a simplement plus rien à charger
        const seuls = await loadLocalPosts();
        setPosts(filter === 'all' ? seuls : seuls.filter(lp => lp.kind === filter));
        setPage(1);
        return;
      }

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
      // Plus de repli sur des célébrités fictives : une seconde de réseau
      // instable suffisait à afficher des personnes inventées, portant les
      // badges « Officiel » et « Stripe vérifié », à un vrai utilisateur — ou à
      // un examinateur de store. Un fil vide est moins grave qu'un fil qui ment.
      console.warn('[Fil] chargement impossible :', err);
      setLoadFailed(true);
      const localPosts = await loadLocalPosts();
      const filteredLocal = filter === 'all' ? localPosts : localPosts.filter(lp => lp.kind === filter);
      setPosts(filteredLocal);
      setPage(1);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchFeed(1, true);
  }, [filter]);

  // Le compteur vient de la base (colonne `comment_count`, tenue par un
  // déclencheur). Il comptait auparavant les commentaires du seul appareil :
  // chacun voyait un chiffre différent, et le plus souvent zéro.
  const getCommentCount = (item: FeedPost) => {
    const charges = allComments[item.id];
    return charges ? charges.length : (item.comment_count || 0);
  };

  const renderPost = ({ item }: { item: FeedPost }) => {
    const commentCount = getCommentCount(item);
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
                          { reason: 'Crée un compte pour suivre cette célébrité', requireBillingIdentity: false }
                        );
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.followChipText, followed && styles.followChipTextActive]}>
                        {followed ? tr('Suivi ✓') : tr('Suivre')}
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
                  <Text style={styles.eventBadgeText}>{tr('Event')}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </TouchableOpacity>

        {item.title && <Text style={styles.postTitle}>{tr(item.title)}</Text>}
        {item.body && <Text style={styles.postBody}>{tr(item.body)}</Text>}
        {/* La photo s'agrandit au toucher. Elle n'était visible qu'à la largeur
            d'une carte, sans aucun moyen de la voir en grand — une dédicace est
            pourtant faite pour être regardée. */}
        {item.media_url && (
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => setMediaPleinEcran({
              uri: item.media_url as string,
              estVideo: estUneVideo(item.media_url),
              titre: item.title ? tr(item.title) : undefined,
            })}
          >
            {estUneVideo(item.media_url) ? (
              <View style={styles.postVideoWrap}>
                <Image source={{ uri: item.media_url }} style={styles.postImage} />
                <View style={styles.postVideoPlay}>
                  <Play size={26} color="#ffffff" fill="#ffffff" />
                </View>
              </View>
            ) : (
              <Image source={{ uri: item.media_url }} style={styles.postImage} />
            )}
          </TouchableOpacity>
        )}
        {item.kind === 'event' && item.event_date && (
          <TouchableOpacity
            style={styles.eventDateRow}
            onPress={() => router.push('/fan-choice')}
            activeOpacity={0.7}
          >
            <Calendar size={14} color="#f59e0b" />
            <Text style={styles.eventDateText}>
              {/* Date ET heure : un fan qui lit « le 15 août » sans horaire ne
                  peut pas savoir s'il doit être là le matin ou le soir. */}
              {t('eventOn')} {new Date(item.event_date).toLocaleDateString(getDateLocale(), {
                weekday: 'short', day: 'numeric', month: 'long',
              })}
              {' — '}
              {new Date(item.event_date).toLocaleTimeString(getDateLocale(), {
                hour: '2-digit', minute: '2-digit',
              })}
            </Text>
          </TouchableOpacity>
        )}
        {item.kind === 'event' && (!!item.location || (item.latitude != null && item.longitude != null)) && (
          <TouchableOpacity
            style={styles.eventLocationRow}
            onPress={() => openEventLocation(item.location, item.latitude, item.longitude)}
            activeOpacity={0.7}
          >
            <MapPin size={14} color="#f59e0b" />
            <Text style={styles.eventLocationText} numberOfLines={2}>
              {item.location || (t('viewOnMap' as any) || 'Voir le lieu sur la carte')}
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
            {/* Le nombre, jamais le mot « Commenter » : la ligne d'actions se lit
                d'un coup d'œil quand tous les compteurs ont le même format. */}
            <Text style={[styles.actionCount, commentCount > 0 && { color: '#3b82f6' }]}>
              {formatCount(commentCount)}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionGroup}
            onPress={() => requireAuth(() => sharePost(item), { reason: 'Crée un compte pour partager', requireBillingIdentity: false, requirePublicProfile: false })}
            activeOpacity={0.7}
          >
            <View style={styles.actionBtn}>
              <Share2 size={20} color="#6b7280" />
            </View>
            <Text style={styles.actionCount}>{t('share' as any) || 'Share'}</Text>
          </TouchableOpacity>

          {/* Signalement directement dans le fil. Il n'existait que sur l'écran
              de détail : un contenu choquant doit pouvoir être signalé là où on
              le voit, sans avoir à l'ouvrir d'abord. C'est aussi ce qu'attendent
              les règles Google Play sur le contenu généré par les utilisateurs. */}
          <TouchableOpacity
            style={styles.actionGroup}
            /* Un signalement anonyme n'est pas exploitable : impossible de
               revenir vers celui qui alerte, ni de repérer un compte qui
               signale tout ce qu'il croise. Le compte est donc exigé avant
               d'ouvrir le formulaire. */
            onPress={() => requireAuth(() => setReportTarget(item), {
              reason: trUI('Connecte-toi pour signaler ce contenu'),
              requireBillingIdentity: false,
              requirePublicProfile: false,
            })}
            activeOpacity={0.7}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <View style={styles.actionBtn}>
              <Flag size={19} color="#ef4444" />
            </View>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const modalPost = commentModalPostId ? posts.find(p => p.id === commentModalPostId) : null;
  const modalComments = commentModalPostId ? (allComments[commentModalPostId] || []) : [];
  // Les commentaires sont ecrits par des fans du monde entier : chacun doit
  // pouvoir les lire dans sa langue, sinon un fil de commentaires devient
  // illisible des que l'app depasse un pays.
  const trComments = useAutoTranslate(modalComments.map(c => c.body));

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
          {/* Un échec de chargement n'est PAS une absence de contenu. Afficher
              « Suivez des célébrités » quand le serveur n'a pas répondu fait
              croire que le fil est vide — et laisse l'utilisateur sans recours. */}
          <Text style={styles.emptyText}>
            {loadFailed ? (t('feedLoadFailed' as any) || 'Impossible de charger le fil') : t('noActivity')}
          </Text>
          <Text style={styles.emptyHint}>
            {loadFailed
              ? (t('feedLoadFailedHint' as any) || 'Vérifie ta connexion et réessaie.')
              : t('noActivityHint')}
          </Text>
          {loadFailed && (
            <TouchableOpacity style={styles.retryBtn} onPress={() => fetchFeed(1, true)} activeOpacity={0.8}>
              <Text style={styles.retryBtnText}>{t('retry' as any) || 'Réessayer'}</Text>
            </TouchableOpacity>
          )}
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
          onViewableItemsChanged={signalerVues}
          viewabilityConfig={configVisibilite}
          onEndReached={() => { if (hasMore && !loading) fetchFeed(page + 1); }}
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

            {commentsLoading && modalComments.length === 0 ? (
              <View style={styles.noCommentsWrap}>
                <ActivityIndicator color="#10b981" />
              </View>
            ) : commentsFailed && modalComments.length === 0 ? (
              <View style={styles.noCommentsWrap}>
                <MessageCircle size={32} color="#374151" />
                <Text style={styles.noCommentsText}>
                  {trUI('Impossible de charger les commentaires.')}
                </Text>
                <TouchableOpacity
                  onPress={() => commentModalPostId && loadComments(commentModalPostId)}
                  style={styles.retryBtn}
                  activeOpacity={0.8}
                >
                  <Text style={styles.retryBtnText}>{t('retry' as any) || 'Réessayer'}</Text>
                </TouchableOpacity>
              </View>
            ) : modalComments.length === 0 ? (
              <View style={styles.noCommentsWrap}>
                <MessageCircle size={32} color="#374151" />
                <Text style={styles.noCommentsText}>{t('noComments' as any)}</Text>
              </View>
            ) : (
              <FlatList
                data={modalComments}
                keyExtractor={c => c.id}
                style={styles.commentList}
                renderItem={({ item: c }) => {
                  const estMien = !!user?.id && c.author_id === user.id;
                  // La personnalité modère chez elle : elle peut retirer ce qui
                  // est écrit sous SA publication.
                  const peutSupprimer = estMien
                    || (!!user?.id && modalPost?.celebrity?.user_id === user.id);
                  return (
                    <View style={[styles.commentItem, !!c.parent_id && styles.commentReply]}>
                      {c.author_avatar ? (
                        <Image source={{ uri: c.author_avatar }} style={styles.commentAvatarImg} />
                      ) : (
                        <View style={styles.commentAvatar}>
                          <Text style={styles.commentAvatarText}>
                            {(c.author_name || '?')[0].toUpperCase()}
                          </Text>
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <View style={styles.commentHeader}>
                          <Text style={styles.commentAuthor}>{c.author_name}</Text>
                          {c.is_post_author && (
                            <View style={styles.commentAuthorBadge}>
                              <Text style={styles.commentAuthorBadgeText}>
                                {trUI('Auteur')}
                              </Text>
                            </View>
                          )}
                          <Text style={styles.commentTime}>{formatTimeAgo(c.created_at)}</Text>
                        </View>
                        <Text style={styles.commentText}>{trComments(c.body)}</Text>
                        <View style={styles.commentActions}>
                          {/* Répondre : c'est ce qui manquait le plus — une
                              personnalité ne pouvait pas s'adresser à ses fans. */}
                          <TouchableOpacity onPress={() => setReplyTo(c)} hitSlop={6}>
                            <Text style={styles.commentActionText}>
                              {t('reply' as any) || 'Répondre'}
                            </Text>
                          </TouchableOpacity>
                          {peutSupprimer && (
                            <TouchableOpacity onPress={() => supprimerCommentaire(c)} hitSlop={6}>
                              <Text style={[styles.commentActionText, { color: '#ef4444' }]}>
                                {t('delete' as any) || 'Supprimer'}
                              </Text>
                            </TouchableOpacity>
                          )}
                          {!estMien && (
                            <TouchableOpacity
                              onPress={() => requireAuth(() => setReportedComment(c), {
                                reason: trUI('Connecte-toi pour signaler ce contenu'),
                                requireBillingIdentity: false,
                                requirePublicProfile: false,
                              })}
                              hitSlop={6}
                            >
                              <Text style={styles.commentActionText}>
                                {trUI('Signaler')}
                              </Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                    </View>
                  );
                }}
                ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
              />
            )}

            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              keyboardVerticalOffset={100}
            >
              {/* À qui l'on répond, avec de quoi se dédire : sans ce rappel, on
                  croit écrire un nouveau commentaire. */}
              {replyTo && (
                <View style={styles.replyBanner}>
                  <Text style={styles.replyBannerText} numberOfLines={1}>
                    {(trUI('Réponse à'))} {replyTo.author_name}
                  </Text>
                  <TouchableOpacity onPress={() => setReplyTo(null)} hitSlop={8}>
                    <Text style={styles.replyBannerCancel}>✕</Text>
                  </TouchableOpacity>
                </View>
              )}
              {/* Sans compte, le champ n'accepte pas la frappe : il ouvre la
                  création de compte. Laisser écrire un message entier pour ne
                  le réclamer qu'à l'envoi, c'est faire perdre le texte et la
                  bonne volonté de celui qui l'a écrit. */}
              <View style={styles.commentInputRow}>
                <TextInput
                  style={styles.commentInput}
                  placeholder={replyTo
                    ? `${trUI('Réponse à')} ${replyTo.author_name}…`
                    : t('addComment' as any)}
                  placeholderTextColor="#6b7280"
                  value={commentText}
                  onChangeText={setCommentText}
                  multiline
                  maxLength={500}
                  editable={!!user}
                  onPressIn={!user ? demanderCompteCommentaire : undefined}
                />
                <TouchableOpacity
                  style={[styles.sendBtn, (!commentText.trim() || sendingComment) && styles.sendBtnDisabled]}
                  onPress={addComment}
                  disabled={!commentText.trim() || sendingComment}
                  activeOpacity={0.7}
                >
                  {sendingComment
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Send size={18} color={commentText.trim() ? '#fff' : '#6b7280'} />}
                </TouchableOpacity>
              </View>
            </KeyboardAvoidingView>
          </RNAnimated.View>
        </View>
      </Modal>

      <AccountAvatarButton />
      <ReportContentModal
        visible={!!reportTarget}
        onClose={() => setReportTarget(null)}
        targetType={reportTarget?.kind === 'event' ? 'event' : 'post'}
        targetId={reportTarget?.id || null}
        targetLabel={reportTarget?.title || reportTarget?.celebrity?.stage_name || null}
        reportedUserId={reportTarget?.celebrity?.user_id || null}
      />
      {/* Signalement d'un commentaire : exigé pour tout contenu écrit par les
          utilisateurs (règles Google Play, DSA). */}
      <ReportContentModal
        visible={!!reportedComment}
        onClose={() => setReportedComment(null)}
        targetType="comment"
        targetId={reportedComment?.id || null}
        targetLabel={reportedComment?.body?.slice(0, 60) || null}
        reportedUserId={reportedComment?.author_id || null}
      />

      {/* Photo comme vidéo : le média s'ouvre en grand, fond noir, au toucher. */}
      <VisionneuseMedia media={mediaPleinEcran} onClose={() => setMediaPleinEcran(null)} />

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
  retryBtn: {
    marginTop: 18,
    paddingHorizontal: 22,
    paddingVertical: 11,
    borderRadius: 22,
    backgroundColor: 'rgba(16,185,129,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.4)',
  },
  retryBtnText: { color: '#10b981', fontSize: 14, fontWeight: '700' },
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
  postVideoWrap: { position: 'relative' },
  postVideoPlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, marginTop: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  eventDateRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  eventDateText: { color: '#f59e0b', fontSize: 13, fontWeight: '500' },
  eventLocationRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  eventLocationText: { color: '#f59e0b', fontSize: 13, fontWeight: '500', flex: 1, textDecorationLine: 'underline' },

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
  // Une réponse est décalée : on voit tout de suite à quoi elle se rattache.
  commentReply: {
    marginLeft: 28,
    paddingLeft: 10,
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(59,130,246,0.35)',
  },
  commentAvatarImg: { width: 32, height: 32, borderRadius: 16 },
  commentAuthorBadge: {
    backgroundColor: 'rgba(16,185,129,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.45)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 999,
  },
  commentAuthorBadgeText: { color: '#10b981', fontSize: 10, fontWeight: '800' },
  commentActions: { flexDirection: 'row', gap: 16, marginTop: 6 },
  commentActionText: { color: '#6b7280', fontSize: 12, fontWeight: '600' },
  replyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: 'rgba(59,130,246,0.12)',
    borderRadius: 10,
    marginHorizontal: 16,
    marginBottom: 6,
  },
  replyBannerText: { color: '#93c5fd', fontSize: 12, fontWeight: '600', flex: 1 },
  replyBannerCancel: { color: '#93c5fd', fontSize: 14, fontWeight: '700' },
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
