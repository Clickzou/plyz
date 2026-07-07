import React, { useState, useEffect, useCallback } from 'react';
import { getDateLocale } from '@/utils/dateLocale';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Image, ActivityIndicator, Alert, TextInput, Linking, Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowLeft, CheckCircle, ShieldCheck, Globe, ExternalLink,
  Video, PenTool, Flag, Calendar, MessageSquare, Heart,
  MapPin, Clock, CreditCard, Users,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { useFollow } from '@/contexts/FollowContext';
import { useAuthPrompt } from '@/contexts/AuthPromptContext';
import { CelebrityDetailSkeleton } from '@/components/SkeletonLoader';
import { useAutoTranslate } from '@/utils/translation';
import { authedFetch } from '@/utils/authedFetch';

const API_BASE = process.env.EXPO_PUBLIC_STRIPE_SERVER_URL || '';

interface CelebrityDetail {
  user_id: string;
  stage_name: string;
  bio: string | null;
  website: string | null;
  avatar_url: string | null;
  display_name: string | null;
  stripe_verified: boolean;
  official_verified: boolean;
  stripe_account_id: string | null;
  wikidata_image_url: string | null;
  wikipedia_url: string | null;
  wikidata_occupations: string[];
  popularity_score: number;
  completed_sessions: number;
  pricing: {
    video_call_price_cents: number;
    video_call_unit: string;
    video_call_duration_minutes: number;
    autograph_price_cents: number;
    live_dedication_price_cents: number;
    currency: string;
  } | null;
  posts: any[];
}

interface LiveEvent {
  id: string;
  celebrity_id: string;
  celebrity_name: string;
  code: string;
  status: string;
  price_cents: number;
  duration_minutes: number;
  max_slots: number;
  location?: string;
  scheduled_at: string | null;
  created_at: string;
}

export default function CelebrityDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { user } = useAuth();
  const { isFollowing, toggleFollow } = useFollow();
  const { requireAuth } = useAuthPrompt();
  const [celebrity, setCelebrity] = useState<CelebrityDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const bookingLoading = false;
  const autographLoading = false;
  const [showReport, setShowReport] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [activeTab, setActiveTab] = useState<'about' | 'posts'>('about');
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);

  // Traduction automatique de la bio + des posts dans la langue de l'utilisateur
  const tr = useAutoTranslate([
    celebrity?.bio,
    ...(celebrity?.posts || []).flatMap(p => [p.title, p.body]),
  ]);

  // Traduction des libellés de statut d'événement affichés en dur
  const trStatus = useAutoTranslate(['En cours', 'En attente', 'Programmé']);

  useEffect(() => {
    if (id) fetchCelebrity();
  }, [id]);

  useEffect(() => {
    if (id && activeTab === 'about') fetchEvents();
  }, [id, activeTab]);

  const DEMO_CELEBS: Record<string, CelebrityDetail> = {
    'mock-001': { user_id: 'mock-001', stage_name: 'Zinedine Zidane', bio: "Ancien footballeur international et entraîneur. Ballon d'Or 1998. Légende du Real Madrid et de l'Équipe de France.", website: 'https://en.wikipedia.org/wiki/Zinedine_Zidane', avatar_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f3/Zinedine_Zidane_by_Tasnim_03.jpg/440px-Zinedine_Zidane_by_Tasnim_03.jpg', display_name: 'Zinedine Zidane', stripe_verified: true, official_verified: true, stripe_account_id: 'acct_mock', wikidata_image_url: null, wikipedia_url: 'https://fr.wikipedia.org/wiki/Zinedine_Zidane', wikidata_occupations: ['footballer', 'manager'], popularity_score: 98, completed_sessions: 42, pricing: { video_call_price_cents: 15000, video_call_unit: 'session', video_call_duration_minutes: 10, autograph_price_cents: 5000, live_dedication_price_cents: 0, currency: 'eur' }, posts: [{ id: 'p1', kind: 'event', title: 'Session Live Exclusive', body: 'Rejoignez-moi pour une session live ce week-end.', media_url: null, event_date: '2026-02-20T18:00:00Z', price_cents: 15000, location: 'Paris, France', created_at: '2025-12-08T10:00:00Z' }] },
    'mock-002': { user_id: 'mock-002', stage_name: 'Marion Cotillard', bio: "Actrice française, lauréate de l'Oscar de la meilleure actrice.", website: null, avatar_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/68/Marion_Cotillard_2019.jpg/440px-Marion_Cotillard_2019.jpg', display_name: 'Marion Cotillard', stripe_verified: true, official_verified: true, stripe_account_id: 'acct_mock', wikidata_image_url: null, wikipedia_url: 'https://fr.wikipedia.org/wiki/Marion_Cotillard', wikidata_occupations: ['actress'], popularity_score: 92, completed_sessions: 28, pricing: { video_call_price_cents: 20000, video_call_unit: 'session', video_call_duration_minutes: 10, autograph_price_cents: 7500, live_dedication_price_cents: 0, currency: 'eur' }, posts: [{ id: 'p2', kind: 'event', title: 'Dédicace en Live', body: 'Réservez votre créneau pour une dédicace personnalisée en vidéo.', media_url: null, event_date: '2026-03-01T15:00:00Z', price_cents: 20000, location: 'Cannes, France', created_at: '2025-12-03T09:00:00Z' }] },
    'mock-003': { user_id: 'mock-003', stage_name: 'Kylian Mbappé', bio: 'Footballeur international français. Champion du Monde 2018.', website: 'https://www.kmbappe.com', avatar_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/57/2019-07-17_SG_Dynamo_Dresden_vs._Paris_Saint-Germain_by_Sandro_Halank%E2%80%93129_%28cropped%29.jpg/440px-2019-07-17_SG_Dynamo_Dresden_vs._Paris_Saint-Germain_by_Sandro_Halank%E2%80%93129_%28cropped%29.jpg', display_name: 'Kylian Mbappé', stripe_verified: true, official_verified: true, stripe_account_id: 'acct_mock', wikidata_image_url: null, wikipedia_url: 'https://fr.wikipedia.org/wiki/Kylian_Mbapp%C3%A9', wikidata_occupations: ['footballer'], popularity_score: 97, completed_sessions: 35, pricing: { video_call_price_cents: 25000, video_call_unit: 'session', video_call_duration_minutes: 5, autograph_price_cents: 10000, live_dedication_price_cents: 0, currency: 'eur' }, posts: [] },
    'mock-005': { user_id: 'mock-005', stage_name: 'Omar Sy', bio: 'Acteur et humoriste français. "Intouchables" et "Lupin".', website: null, avatar_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/54/Omar_Sy_Cannes_2022.jpg/440px-Omar_Sy_Cannes_2022.jpg', display_name: 'Omar Sy', stripe_verified: true, official_verified: true, stripe_account_id: 'acct_mock', wikidata_image_url: null, wikipedia_url: 'https://fr.wikipedia.org/wiki/Omar_Sy', wikidata_occupations: ['actor'], popularity_score: 93, completed_sessions: 31, pricing: { video_call_price_cents: 22000, video_call_unit: 'session', video_call_duration_minutes: 10, autograph_price_cents: 8000, live_dedication_price_cents: 0, currency: 'eur' }, posts: [{ id: 'p3', kind: 'post', title: 'Nouveau chapitre', body: 'Très heureux d\'annoncer une nouvelle aventure !', media_url: null, event_date: null, price_cents: 0, location: null, created_at: '2025-12-10T14:30:00Z' }] },
  };

  const fetchCelebrity = async () => {
    try {
      setLoading(true);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${API_BASE}/api/celebrity/${id}`, { signal: controller.signal });
      clearTimeout(timeoutId);
      const data = await res.json();
      if (data.celebrity) {
        setCelebrity(data.celebrity);
      } else {
        throw new Error('No data');
      }
    } catch (err) {
      console.warn('Using demo celebrity:', err);
      const demo = DEMO_CELEBS[id as string];
      if (demo) setCelebrity(demo);
    } finally {
      setLoading(false);
    }
  };

  const fetchEvents = useCallback(async () => {
    if (!id) return;
    setEventsLoading(true);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${API_BASE}/api/celebrity-events?celebrity_id=${id}`, { signal: controller.signal });
      clearTimeout(timeoutId);
      const data = await res.json();
      setEvents(data.events || []);
    } catch (err) {
      console.warn('Events fetch fallback:', err);
      setEvents([]);
    } finally {
      setEventsLoading(false);
    }
  }, [id]);

  const formatPrice = (cents: number, currency?: string) => {
    const amount = (cents / 100).toFixed(2);
    const cur = currency || 'eur';
    const symbols: Record<string, string> = { eur: '€', usd: '$', gbp: '£' };
    return `${amount}${symbols[cur] || cur}`;
  };

  const formatEventDate = (dateStr: string | null) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString(getDateLocale(), { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  };

  const formatEventTime = (dateStr: string | null) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleTimeString(getDateLocale(), { hour: '2-digit', minute: '2-digit' });
  };

  const showAlert = (msg: string) => {
    if (Platform.OS === 'web') {
      window.alert(msg);
    } else {
      Alert.alert('', msg);
    }
  };

  const handleBookCall = () => {
    if (!celebrity) return;
    // Déconnecté → on PROPOSE la connexion (au lieu d'une impasse) via requireAuth.
    requireAuth(() => {
      if (!celebrity.stripe_account_id) {
        showAlert(t('celebrityNoPayments') || 'This celebrity has not set up payments yet');
        return;
      }
      const p = celebrity.pricing;
      if (!p) return;
      router.push({
        pathname: '/book-video-call',
        params: {
          celebrityId: celebrity.user_id,
          celebrityName: celebrity.stage_name,
          priceCents: String(p.video_call_price_cents),
          currency: p.currency,
          durationMinutes: String(p.video_call_duration_minutes),
          unit: p.video_call_unit,
        },
      } as any);
    });
  };

  const handleAutograph = () => {
    if (!celebrity) return;
    requireAuth(() => {
      if (!celebrity.stripe_account_id) {
        showAlert(t('celebrityNoPayments') || 'This celebrity has not set up payments yet');
        return;
      }
      const p = celebrity.pricing;
      if (!p) return;
      router.push({
        pathname: '/request-autograph',
        params: {
          celebrityId: celebrity.user_id,
          celebrityName: celebrity.stage_name,
          priceCents: String(p.autograph_price_cents),
          currency: p.currency,
        },
      } as any);
    });
  };

  const handleRegisterEvent = (event: LiveEvent) => {
    // On route vers le flux de participation ÉPROUVÉ (join-live-session auto-charge
    // via le code, gère le paiement + la file d'attente + la reprise). L'ancien
    // push vers /purchase-session envoyait des params incomplets (ni celebrityId ni
    // flow) → le fan payait puis atterrissait sur le mauvais écran, hors file.
    if (!event.code) {
      showAlert(t('liveSessionNotFound') || 'Événement introuvable.');
      return;
    }
    router.push({ pathname: '/join-live-session', params: { code: event.code } } as any);
  };

  const handleRegisterPostEvent = (post: any) => {
    // Un post « événement » possède un code de session → on rejoint via le flux
    // éprouvé ; sinon on ouvre le détail du post (plus de fausse « Inscription
    // confirmée » qui n'enregistrait rien).
    if (post?.code) {
      router.push({ pathname: '/join-live-session', params: { code: post.code } } as any);
    } else {
      openPostDetail(post);
    }
  };

  const openPostDetail = (post: any) => {
    router.push({
      pathname: '/post-detail',
      params: {
        post: JSON.stringify(post),
        celebrityName: celebrity?.display_name || celebrity?.stage_name || '',
        celebrityAvatar: celebrity?.avatar_url || '',
      },
    } as any);
  };

  const handleReport = async () => {
    if (!reportReason.trim()) return;
    try {
      await authedFetch(`${API_BASE}/api/report`, {
        method: 'POST',
        body: JSON.stringify({
          celebrity_id: celebrity?.user_id,
          reason: reportReason.trim(),
        }),
      });
      setShowReport(false);
      setReportReason('');
      Alert.alert('', t('reportSubmitted'));
    } catch (err) {
      console.error('Report error:', err);
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'active': return { text: t('eventActive' as any) || 'En cours', color: '#10b981' };
      case 'waiting': return { text: t('eventWaiting' as any) || 'En attente', color: '#f59e0b' };
      case 'scheduled': return { text: t('eventScheduled' as any) || 'Programmé', color: '#6366f1' };
      default: return { text: status, color: '#6b7280' };
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <LinearGradient colors={['#0a1628', '#0f2035', '#0a1628']} style={StyleSheet.absoluteFill} />
        <CelebrityDetailSkeleton />
      </View>
    );
  }

  if (!celebrity) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <LinearGradient colors={['#0a1628', '#0f2035', '#0a1628']} style={StyleSheet.absoluteFill} />
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ArrowLeft size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.center}>
          <Text style={styles.emptyText}>Celebrity not found</Text>
        </View>
      </View>
    );
  }

  const p = celebrity.pricing;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient colors={['#0a1628', '#0f2035', '#0a1628']} style={StyleSheet.absoluteFill} />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.heroSection}>
          {celebrity.avatar_url ? (
            <Image source={{ uri: celebrity.avatar_url }} style={styles.heroImage} />
          ) : (
            <LinearGradient colors={['#374151', '#1f2937']} style={styles.heroImage}>
              <Text style={styles.heroInitial}>{(celebrity.stage_name || '?')[0].toUpperCase()}</Text>
            </LinearGradient>
          )}
          <LinearGradient colors={['transparent', 'rgba(10,22,40,0.95)']} style={styles.heroOverlay} />
          <TouchableOpacity style={[styles.backButton, { top: 8 }]} onPress={() => router.back()}>
            <ArrowLeft size={24} color="#fff" />
          </TouchableOpacity>
          {celebrity && (
            <TouchableOpacity
              style={styles.followHeroButton}
              onPress={() => requireAuth(
                () => toggleFollow({ user_id: celebrity.user_id, stage_name: celebrity.stage_name, avatar_url: celebrity.avatar_url }),
                { reason: 'Crée un compte pour suivre cette célébrité', requireBillingIdentity: false }
              )}
              activeOpacity={0.7}
            >
              <Heart
                size={20}
                color={isFollowing(celebrity.user_id) ? '#ef4444' : '#ffffff'}
                fill={isFollowing(celebrity.user_id) ? '#ef4444' : 'transparent'}
                strokeWidth={2}
              />
              <Text style={[styles.followHeroText, isFollowing(celebrity.user_id) && { color: '#ef4444' }]}>
                {isFollowing(celebrity.user_id) ? t('following') || 'Following' : t('follow') || 'Follow'}
              </Text>
            </TouchableOpacity>
          )}
          <View style={styles.heroInfo}>
            <Text style={styles.heroName}>{celebrity.stage_name}</Text>
            <View style={styles.badgeRow}>
              {celebrity.official_verified && (
                <View style={[styles.badge, styles.officialBadge]}>
                  <CheckCircle size={12} color="#fff" />
                  <Text style={styles.badgeText}>{t('officialBadge')}</Text>
                </View>
              )}
              {celebrity.stripe_verified && (
                <View style={[styles.badge, styles.stripeBadge]}>
                  <ShieldCheck size={12} color="#fff" />
                  <Text style={styles.badgeText}>{t('stripeBadge')}</Text>
                </View>
              )}
            </View>
            {celebrity.completed_sessions > 0 && (
              <Text style={styles.sessionsCount}>
                {t('completedSessions', { count: celebrity.completed_sessions })}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.actionRow}>
          {p && p.video_call_price_cents > 0 && celebrity.stripe_account_id && (
            <TouchableOpacity
              style={[styles.mainAction, styles.videoAction]}
              onPress={handleBookCall}
              disabled={bookingLoading}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={['#10b981', '#059669']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.mainActionGradient}
              >
                {bookingLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <View style={styles.mainActionIconCircle}>
                      <Video size={20} color="#fff" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.mainActionText}>{t('bookCall')}</Text>
                      <Text style={styles.mainActionPrice}>
                        {formatPrice(p.video_call_price_cents, p.currency)}/{p.video_call_duration_minutes}min
                      </Text>
                    </View>
                    <View style={styles.mainActionArrow}>
                      <Text style={styles.mainActionArrowText}>→</Text>
                    </View>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          )}
          {p && p.autograph_price_cents > 0 && celebrity.stripe_account_id && (
            <TouchableOpacity
              style={[styles.mainAction, styles.autographAction]}
              onPress={handleAutograph}
              disabled={autographLoading}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={['#f59e0b', '#d97706']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.mainActionGradient}
              >
                {autographLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <View style={[styles.mainActionIconCircle, { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
                      <PenTool size={20} color="#fff" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.mainActionText}>{t('requestAutograph')}</Text>
                      <Text style={styles.mainActionPrice}>
                        {formatPrice(p.autograph_price_cents, p.currency)}
                      </Text>
                    </View>
                    <View style={styles.mainActionArrow}>
                      <Text style={styles.mainActionArrowText}>→</Text>
                    </View>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.tabs}>
          {(['about', 'posts'] as const).map(tab => (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, activeTab === tab && styles.tabActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                {t(`${tab}Section` as any)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {activeTab === 'about' && (
          <View style={styles.section}>
            {celebrity.bio && <Text style={styles.bioText}>{tr(celebrity.bio)}</Text>}
            {celebrity.website && (
              <TouchableOpacity style={styles.linkRow} onPress={() => Linking.openURL(celebrity.website!)}>
                <Globe size={16} color="#10b981" />
                <Text style={styles.linkText}>{t('visitWebsite')}</Text>
                <ExternalLink size={14} color="#10b981" />
              </TouchableOpacity>
            )}

            <Text style={styles.sectionSubTitle}>
              <Calendar size={16} color="#10b981" /> {t('upcomingEvents' as any) || 'Événements en cours ou programmés'}
            </Text>

            {eventsLoading ? (
              <ActivityIndicator size="small" color="#10b981" style={{ marginTop: 16 }} />
            ) : events.length === 0 ? (
              <View style={styles.emptyBlock}>
                <Calendar size={28} color="#374151" />
                <Text style={styles.emptyText}>{t('noEvents' as any) || 'Aucun événement pour le moment'}</Text>
              </View>
            ) : (
              events.map(event => {
                const statusInfo = getStatusLabel(event.status);
                return (
                  <View key={event.id} style={styles.eventCard}>
                    <View style={styles.eventHeader}>
                      <View style={[styles.eventStatusBadge, { backgroundColor: statusInfo.color + '22', borderColor: statusInfo.color }]}>
                        <View style={[styles.eventStatusDot, { backgroundColor: statusInfo.color }]} />
                        <Text style={[styles.eventStatusText, { color: statusInfo.color }]}>{trStatus(statusInfo.text)}</Text>
                      </View>
                      {event.price_cents > 0 && (
                        <Text style={styles.eventPrice}>{formatPrice(event.price_cents)}</Text>
                      )}
                    </View>
                    <Text style={styles.eventTitle}>
                      {event.celebrity_name || celebrity.stage_name} — {t('liveSession' as any) || 'Session Live'}
                    </Text>
                    <View style={styles.eventMeta}>
                      {event.scheduled_at && (
                        <View style={styles.eventMetaRow}>
                          <Calendar size={14} color="#9ca3af" />
                          <Text style={styles.eventMetaText}>{formatEventDate(event.scheduled_at)}</Text>
                          <Clock size={14} color="#9ca3af" />
                          <Text style={styles.eventMetaText}>{formatEventTime(event.scheduled_at)}</Text>
                        </View>
                      )}
                      {event.location && (
                        <View style={styles.eventMetaRow}>
                          <MapPin size={14} color="#9ca3af" />
                          <Text style={styles.eventMetaText}>{event.location}</Text>
                        </View>
                      )}
                      <View style={styles.eventMetaRow}>
                        <Clock size={14} color="#9ca3af" />
                        <Text style={styles.eventMetaText}>{event.duration_minutes} min</Text>
                        <Users size={14} color="#9ca3af" />
                        <Text style={styles.eventMetaText}>{event.max_slots} {t('slots' as any) || 'places'}</Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      style={styles.registerBtn}
                      onPress={() => handleRegisterEvent(event)}
                      activeOpacity={0.8}
                    >
                      <CreditCard size={16} color="#fff" />
                      <Text style={styles.registerBtnText}>
                        {event.price_cents > 0
                          ? (t('registerAndPay' as any) || "S'inscrire & Pré-payer")
                          : (t('registerEvent' as any) || "S'inscrire")}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })
            )}

            <TouchableOpacity style={styles.reportRow} onPress={() => setShowReport(!showReport)}>
              <Flag size={14} color="#ef4444" />
              <Text style={styles.reportText}>{t('reportCelebrity')}</Text>
            </TouchableOpacity>
            {showReport && (
              <View style={styles.reportForm}>
                <TextInput
                  style={styles.reportInput}
                  placeholder={t('reportReason')}
                  placeholderTextColor="#6b7280"
                  value={reportReason}
                  onChangeText={setReportReason}
                  multiline
                />
                <TouchableOpacity style={styles.reportSubmit} onPress={handleReport}>
                  <Text style={styles.reportSubmitText}>Submit</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {activeTab === 'posts' && (
          <View style={styles.section}>
            {celebrity.posts.length === 0 ? (
              <View style={styles.emptyBlock}>
                <MessageSquare size={32} color="#374151" />
                <Text style={styles.emptyText}>{t('noPosts')}</Text>
              </View>
            ) : (
              celebrity.posts.map(post => (
                <View key={post.id} style={styles.postCard}>
                  <TouchableOpacity activeOpacity={0.7} onPress={() => openPostDetail(post)}>
                  {post.kind === 'event' && (
                    <View style={styles.postEventBadge}>
                      <Calendar size={12} color="#6366f1" />
                      <Text style={styles.postEventBadgeText}>{t('eventLabel' as any) || 'Événement'}</Text>
                    </View>
                  )}
                  {post.title && <Text style={styles.postTitle}>{tr(post.title)}</Text>}
                  {post.body && <Text style={styles.postBody}>{tr(post.body)}</Text>}
                  {post.media_url && (
                    <Image source={{ uri: post.media_url }} style={styles.postImage} />
                  )}
                  </TouchableOpacity>

                  {post.kind === 'event' && (
                    <View style={styles.postEventDetails}>
                      {post.event_date && (
                        <View style={styles.postEventDetailRow}>
                          <Calendar size={14} color="#9ca3af" />
                          <Text style={styles.postEventDetailText}>
                            {formatEventDate(post.event_date)} — {formatEventTime(post.event_date)}
                          </Text>
                        </View>
                      )}
                      {post.location && (
                        <View style={styles.postEventDetailRow}>
                          <MapPin size={14} color="#9ca3af" />
                          <Text style={styles.postEventDetailText}>{post.location}</Text>
                        </View>
                      )}
                      {post.price_cents > 0 && (
                        <View style={styles.postEventDetailRow}>
                          <CreditCard size={14} color="#10b981" />
                          <Text style={[styles.postEventDetailText, { color: '#10b981', fontWeight: '700' }]}>
                            {formatPrice(post.price_cents)}
                          </Text>
                        </View>
                      )}
                      <TouchableOpacity
                        style={styles.postRegisterBtn}
                        onPress={() => handleRegisterPostEvent(post)}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.postRegisterBtnText}>
                          {post.price_cents > 0
                            ? (t('registerAndPay' as any) || "S'inscrire & Pré-payer")
                            : (t('registerEvent' as any) || "S'inscrire")}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  <Text style={styles.postDate}>
                    {new Date(post.created_at).toLocaleDateString()}
                  </Text>
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a1628' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  backButton: { position: 'absolute', left: 16, top: 16, zIndex: 10, padding: 8, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.4)' },
  followHeroButton: {
    position: 'absolute', right: 16, top: 8, zIndex: 10,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  followHeroText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  heroSection: { height: 300, position: 'relative' },
  heroImage: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' },
  heroInitial: { color: '#fff', fontSize: 60, fontWeight: '700' },
  heroOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 150 },
  heroInfo: { position: 'absolute', bottom: 16, left: 16, right: 16 },
  heroName: { color: '#fff', fontSize: 28, fontWeight: '700' },
  badgeRow: { flexDirection: 'row', gap: 6, marginTop: 6 },
  badge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, gap: 4 },
  officialBadge: { backgroundColor: 'rgba(16,185,129,0.85)' },
  stripeBadge: { backgroundColor: 'rgba(99,102,241,0.85)' },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  sessionsCount: { color: '#9ca3af', fontSize: 13, marginTop: 4 },
  actionRow: { flexDirection: 'column', paddingHorizontal: 16, gap: 12, marginTop: 18 },
  mainAction: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  mainActionGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 14,
    gap: 12,
  },
  mainActionIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainActionArrow: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainActionArrowText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  videoAction: {},
  autographAction: {},
  mainActionText: { color: '#fff', fontSize: 15, fontWeight: '800', letterSpacing: 0.3 },
  mainActionPrice: { color: 'rgba(255,255,255,0.9)', fontSize: 13, marginTop: 2, fontWeight: '600' },
  tabs: { flexDirection: 'row', marginTop: 20, marginHorizontal: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)' },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: '#10b981' },
  tabText: { color: '#6b7280', fontSize: 14, fontWeight: '500' },
  tabTextActive: { color: '#10b981' },
  section: { paddingHorizontal: 16, marginTop: 16 },
  bioText: { color: '#d1d5db', fontSize: 14, lineHeight: 22 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16, paddingVertical: 10 },
  linkText: { color: '#10b981', fontSize: 14, fontWeight: '500', flex: 1 },
  sectionSubTitle: {
    color: '#e5e7eb', fontSize: 16, fontWeight: '700', marginTop: 24, marginBottom: 12,
  },
  emptyBlock: { alignItems: 'center', paddingVertical: 24 },
  reportRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 24, paddingVertical: 8 },
  reportText: { color: '#ef4444', fontSize: 13 },
  reportForm: { marginTop: 8, gap: 8 },
  reportInput: { backgroundColor: 'rgba(255,255,255,0.06)', color: '#fff', borderRadius: 10, padding: 12, fontSize: 14, minHeight: 80, textAlignVertical: 'top' },
  reportSubmit: { backgroundColor: '#ef4444', padding: 10, borderRadius: 10, alignItems: 'center' },
  reportSubmitText: { color: '#fff', fontWeight: '600' },

  eventCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  eventHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  eventStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
  },
  eventStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  eventStatusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  eventPrice: {
    color: '#10b981',
    fontSize: 20,
    fontWeight: '800',
  },
  eventTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 10,
  },
  eventMeta: {
    gap: 6,
    marginBottom: 14,
  },
  eventMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  eventMetaText: {
    color: '#9ca3af',
    fontSize: 13,
    marginRight: 10,
  },
  registerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#10b981',
    borderRadius: 12,
    paddingVertical: 12,
  },
  registerBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },


  postCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  postEventBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(99,102,241,0.12)',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    marginBottom: 8,
  },
  postEventBadgeText: {
    color: '#6366f1',
    fontSize: 12,
    fontWeight: '600',
  },
  postTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  postBody: { color: '#d1d5db', fontSize: 14, marginTop: 6, lineHeight: 20 },
  postImage: { width: '100%', height: 200, borderRadius: 10, marginTop: 10 },
  postEventDetails: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    gap: 8,
  },
  postEventDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  postEventDetailText: {
    color: '#9ca3af',
    fontSize: 13,
  },
  postRegisterBtn: {
    backgroundColor: '#6366f1',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 6,
  },
  postRegisterBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  postDate: { color: '#6b7280', fontSize: 12, marginTop: 8 },
  emptyText: { color: '#6b7280', fontSize: 14, marginTop: 10 },
});
