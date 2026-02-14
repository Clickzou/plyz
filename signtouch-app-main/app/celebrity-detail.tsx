import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Image, ActivityIndicator, Alert, TextInput, Linking, Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowLeft, CheckCircle, ShieldCheck, Globe, ExternalLink,
  Video, PenTool, Flag, Calendar, MessageSquare,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';

const API_BASE = Platform.OS === 'web' ? '' : (process.env.EXPO_PUBLIC_STRIPE_SERVER_URL || '');

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

export default function CelebrityDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { user } = useAuth();
  const [celebrity, setCelebrity] = useState<CelebrityDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [autographLoading, setAutographLoading] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [activeTab, setActiveTab] = useState<'about' | 'pricing' | 'posts'>('about');

  useEffect(() => {
    if (id) fetchCelebrity();
  }, [id]);

  const DEMO_CELEBS: Record<string, CelebrityDetail> = {
    'mock-001': { user_id: 'mock-001', stage_name: 'Zinedine Zidane', bio: "Ancien footballeur international et entraîneur. Ballon d'Or 1998. Légende du Real Madrid et de l'Équipe de France.", website: 'https://en.wikipedia.org/wiki/Zinedine_Zidane', avatar_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f3/Zinedine_Zidane_by_Tasnim_03.jpg/440px-Zinedine_Zidane_by_Tasnim_03.jpg', display_name: 'Zinedine Zidane', stripe_verified: true, official_verified: true, stripe_account_id: 'acct_mock', wikidata_image_url: null, wikipedia_url: 'https://fr.wikipedia.org/wiki/Zinedine_Zidane', wikidata_occupations: ['footballer', 'manager'], popularity_score: 98, completed_sessions: 42, pricing: { video_call_price_cents: 15000, video_call_unit: 'session', video_call_duration_minutes: 10, autograph_price_cents: 5000, live_dedication_price_cents: 8000, currency: 'eur' }, posts: [{ id: 'p1', title: 'Session Live Exclusive', body: 'Rejoignez-moi pour une session live ce week-end.', media_url: null, created_at: '2025-12-08T10:00:00Z' }] },
    'mock-002': { user_id: 'mock-002', stage_name: 'Marion Cotillard', bio: "Actrice française, lauréate de l'Oscar de la meilleure actrice.", website: null, avatar_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/68/Marion_Cotillard_2019.jpg/440px-Marion_Cotillard_2019.jpg', display_name: 'Marion Cotillard', stripe_verified: true, official_verified: true, stripe_account_id: 'acct_mock', wikidata_image_url: null, wikipedia_url: 'https://fr.wikipedia.org/wiki/Marion_Cotillard', wikidata_occupations: ['actress'], popularity_score: 92, completed_sessions: 28, pricing: { video_call_price_cents: 20000, video_call_unit: 'session', video_call_duration_minutes: 10, autograph_price_cents: 7500, live_dedication_price_cents: 10000, currency: 'eur' }, posts: [] },
    'mock-003': { user_id: 'mock-003', stage_name: 'Kylian Mbappé', bio: 'Footballeur international français. Champion du Monde 2018.', website: 'https://www.kmbappe.com', avatar_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/57/2019-07-17_SG_Dynamo_Dresden_vs._Paris_Saint-Germain_by_Sandro_Halank%E2%80%93129_%28cropped%29.jpg/440px-2019-07-17_SG_Dynamo_Dresden_vs._Paris_Saint-Germain_by_Sandro_Halank%E2%80%93129_%28cropped%29.jpg', display_name: 'Kylian Mbappé', stripe_verified: true, official_verified: true, stripe_account_id: 'acct_mock', wikidata_image_url: null, wikipedia_url: 'https://fr.wikipedia.org/wiki/Kylian_Mbapp%C3%A9', wikidata_occupations: ['footballer'], popularity_score: 97, completed_sessions: 35, pricing: { video_call_price_cents: 25000, video_call_unit: 'session', video_call_duration_minutes: 5, autograph_price_cents: 10000, live_dedication_price_cents: 15000, currency: 'eur' }, posts: [] },
    'mock-005': { user_id: 'mock-005', stage_name: 'Omar Sy', bio: 'Acteur et humoriste français. "Intouchables" et "Lupin".', website: null, avatar_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/54/Omar_Sy_Cannes_2022.jpg/440px-Omar_Sy_Cannes_2022.jpg', display_name: 'Omar Sy', stripe_verified: true, official_verified: true, stripe_account_id: 'acct_mock', wikidata_image_url: null, wikipedia_url: 'https://fr.wikipedia.org/wiki/Omar_Sy', wikidata_occupations: ['actor'], popularity_score: 93, completed_sessions: 31, pricing: { video_call_price_cents: 22000, video_call_unit: 'session', video_call_duration_minutes: 10, autograph_price_cents: 8000, live_dedication_price_cents: 12000, currency: 'eur' }, posts: [{ id: 'p2', title: 'Nouveau chapitre', body: 'Très heureux d\'annoncer une nouvelle aventure !', media_url: null, created_at: '2025-12-10T14:30:00Z' }] },
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

  const formatPrice = (cents: number, currency: string) => {
    const amount = (cents / 100).toFixed(2);
    const symbols: Record<string, string> = { eur: '€', usd: '$', gbp: '£' };
    return `${amount}${symbols[currency] || currency}`;
  };

  const handleBookCall = async () => {
    if (!user) {
      Alert.alert('', 'Please sign in first');
      return;
    }
    if (!celebrity?.stripe_account_id) {
      Alert.alert('', 'This celebrity has not set up payments yet');
      return;
    }
    try {
      setBookingLoading(true);
      const res = await fetch(`${API_BASE}/api/book-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fan_id: user.id,
          celebrity_id: celebrity.user_id,
        }),
      });
      const data = await res.json();
      if (data.checkout_url) {
        if (Platform.OS === 'web') {
          window.open(data.checkout_url, '_blank');
        } else {
          Linking.openURL(data.checkout_url);
        }
      }
    } catch (err) {
      console.error('Booking error:', err);
      Alert.alert('Error', 'Failed to create booking');
    } finally {
      setBookingLoading(false);
    }
  };

  const handleAutograph = async () => {
    if (!user) {
      Alert.alert('', 'Please sign in first');
      return;
    }
    if (!celebrity?.stripe_account_id) {
      Alert.alert('', 'This celebrity has not set up payments yet');
      return;
    }
    try {
      setAutographLoading(true);
      const res = await fetch(`${API_BASE}/api/autograph`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fan_id: user.id,
          celebrity_id: celebrity.user_id,
          message: '',
        }),
      });
      const data = await res.json();
      if (data.checkout_url) {
        if (Platform.OS === 'web') {
          window.open(data.checkout_url, '_blank');
        } else {
          Linking.openURL(data.checkout_url);
        }
      }
    } catch (err) {
      console.error('Autograph error:', err);
      Alert.alert('Error', 'Failed to create autograph request');
    } finally {
      setAutographLoading(false);
    }
  };

  const handleReport = async () => {
    if (!reportReason.trim()) return;
    try {
      await fetch(`${API_BASE}/api/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reporter_id: user?.id || null,
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

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <LinearGradient colors={['#0a1628', '#0f2035', '#0a1628']} style={StyleSheet.absoluteFill} />
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#10b981" />
        </View>
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
            >
              {bookingLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Video size={18} color="#fff" />
                  <View>
                    <Text style={styles.mainActionText}>{t('bookCall')}</Text>
                    <Text style={styles.mainActionPrice}>
                      {formatPrice(p.video_call_price_cents, p.currency)}
                      {p.video_call_unit === 'minute' ? t('perMinute') : t('perSession')}
                    </Text>
                  </View>
                </>
              )}
            </TouchableOpacity>
          )}
          {p && p.autograph_price_cents > 0 && celebrity.stripe_account_id && (
            <TouchableOpacity
              style={[styles.mainAction, styles.autographAction]}
              onPress={handleAutograph}
              disabled={autographLoading}
            >
              {autographLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <PenTool size={18} color="#fff" />
                  <View>
                    <Text style={styles.mainActionText}>{t('requestAutograph')}</Text>
                    <Text style={styles.mainActionPrice}>
                      {formatPrice(p.autograph_price_cents, p.currency)}
                    </Text>
                  </View>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.tabs}>
          {(['about', 'pricing', 'posts'] as const).map(tab => (
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
            {celebrity.bio && <Text style={styles.bioText}>{celebrity.bio}</Text>}
            {celebrity.website && (
              <TouchableOpacity style={styles.linkRow} onPress={() => Linking.openURL(celebrity.website!)}>
                <Globe size={16} color="#10b981" />
                <Text style={styles.linkText}>{t('visitWebsite')}</Text>
                <ExternalLink size={14} color="#10b981" />
              </TouchableOpacity>
            )}
            {celebrity.wikipedia_url && (
              <TouchableOpacity style={styles.linkRow} onPress={() => Linking.openURL(celebrity.wikipedia_url!)}>
                <Globe size={16} color="#6366f1" />
                <Text style={[styles.linkText, { color: '#6366f1' }]}>{t('viewOnWikipedia')}</Text>
                <ExternalLink size={14} color="#6366f1" />
              </TouchableOpacity>
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

        {activeTab === 'pricing' && p && (
          <View style={styles.section}>
            {p.video_call_price_cents > 0 && (
              <View style={styles.priceCard}>
                <Video size={20} color="#10b981" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.priceLabel}>{t('videoCallPrice')}</Text>
                  <Text style={styles.priceSubLabel}>
                    {t('sessionDuration', { minutes: p.video_call_duration_minutes })}
                  </Text>
                </View>
                <Text style={styles.priceValue}>
                  {formatPrice(p.video_call_price_cents, p.currency)}
                  {p.video_call_unit === 'minute' ? t('perMinute') : ''}
                </Text>
              </View>
            )}
            {p.autograph_price_cents > 0 && (
              <View style={styles.priceCard}>
                <PenTool size={20} color="#f59e0b" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.priceLabel}>{t('autographPrice')}</Text>
                </View>
                <Text style={styles.priceValue}>
                  {formatPrice(p.autograph_price_cents, p.currency)}
                </Text>
              </View>
            )}
            {p.live_dedication_price_cents > 0 && (
              <View style={styles.priceCard}>
                <Calendar size={20} color="#6366f1" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.priceLabel}>{t('dedicationPrice')}</Text>
                </View>
                <Text style={styles.priceValue}>
                  {formatPrice(p.live_dedication_price_cents, p.currency)}
                </Text>
              </View>
            )}
          </View>
        )}

        {activeTab === 'posts' && (
          <View style={styles.section}>
            {celebrity.posts.length === 0 ? (
              <View style={styles.center}>
                <MessageSquare size={32} color="#374151" />
                <Text style={styles.emptyText}>{t('noPosts')}</Text>
              </View>
            ) : (
              celebrity.posts.map(post => (
                <View key={post.id} style={styles.postCard}>
                  {post.title && <Text style={styles.postTitle}>{post.title}</Text>}
                  {post.body && <Text style={styles.postBody}>{post.body}</Text>}
                  {post.media_url && (
                    <Image source={{ uri: post.media_url }} style={styles.postImage} />
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
  actionRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 10, marginTop: 16 },
  mainAction: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 14 },
  videoAction: { backgroundColor: '#10b981' },
  autographAction: { backgroundColor: '#f59e0b' },
  mainActionText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  mainActionPrice: { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 1 },
  tabs: { flexDirection: 'row', marginTop: 20, marginHorizontal: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)' },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: '#10b981' },
  tabText: { color: '#6b7280', fontSize: 14, fontWeight: '500' },
  tabTextActive: { color: '#10b981' },
  section: { paddingHorizontal: 16, marginTop: 16 },
  bioText: { color: '#d1d5db', fontSize: 14, lineHeight: 22 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16, paddingVertical: 10 },
  linkText: { color: '#10b981', fontSize: 14, fontWeight: '500', flex: 1 },
  reportRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 24, paddingVertical: 8 },
  reportText: { color: '#ef4444', fontSize: 13 },
  reportForm: { marginTop: 8, gap: 8 },
  reportInput: { backgroundColor: 'rgba(255,255,255,0.06)', color: '#fff', borderRadius: 10, padding: 12, fontSize: 14, minHeight: 80, textAlignVertical: 'top' },
  reportSubmit: { backgroundColor: '#ef4444', padding: 10, borderRadius: 10, alignItems: 'center' },
  reportSubmitText: { color: '#fff', fontWeight: '600' },
  priceCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 14, padding: 16, marginBottom: 10 },
  priceLabel: { color: '#fff', fontSize: 15, fontWeight: '600' },
  priceSubLabel: { color: '#9ca3af', fontSize: 12, marginTop: 2 },
  priceValue: { color: '#10b981', fontSize: 18, fontWeight: '700' },
  postCard: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 14, padding: 16, marginBottom: 10 },
  postTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  postBody: { color: '#d1d5db', fontSize: 14, marginTop: 6, lineHeight: 20 },
  postImage: { width: '100%', height: 200, borderRadius: 10, marginTop: 10 },
  postDate: { color: '#6b7280', fontSize: 12, marginTop: 8 },
  emptyText: { color: '#6b7280', fontSize: 14, marginTop: 10 },
});
