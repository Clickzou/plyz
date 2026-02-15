import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Image, ActivityIndicator, ScrollView, Platform, Share,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Inbox, Video, PenTool, Clock, CheckCircle, XCircle, ChevronRight,
  Star, Users, DollarSign, Plus, FileText, Eye, TrendingUp, Sparkles, Radio,
  QrCode, Trash2, Copy, Share2, X, Check, Edit3, Play, Calendar,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { showAlert, showConfirm } from '@/utils/alertHelper';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { useCelebrityMode } from '@/contexts/CelebrityModeContext';
import BottomNav, { BOTTOM_NAV_HEIGHT } from '@/components/BottomNav';
import { getMyScheduledEvents, EventSession, deleteEventSession, getEventTotalViews, getActiveViewerCount } from '@/utils/eventSessionStorage';
const QRCodeSvg = require('react-native-qrcode-svg').default;

const API_BASE = Platform.OS === 'web' ? '' : (process.env.EXPO_PUBLIC_STRIPE_SERVER_URL || '');

type TabType = 'bookings' | 'autographs';
type ModeType = 'fan' | 'celebrity';
type CelTabType = 'dashboard' | 'events';
type FilterType = 'all' | 'live' | 'ended' | 'scheduled';

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
  const { t, language } = useLanguage();
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

  const [celTab, setCelTab] = useState<CelTabType>('dashboard');
  const [myEvents, setMyEvents] = useState<EventSession[]>([]);
  const [eventLoading, setEventLoading] = useState(true);
  const [eventFilter, setEventFilter] = useState<FilterType>('live');
  const [selectedEvent, setSelectedEvent] = useState<EventSession | null>(null);
  const [showQrModal, setShowQrModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [eventViews, setEventViews] = useState<Record<string, number>>({});
  const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(new Set());
  const [isDeletingSelected, setIsDeletingSelected] = useState(false);

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

  const loadMyEvents = useCallback(async () => {
    try {
      setEventLoading(true);
      const events = await getMyScheduledEvents();
      const sortedEvents = events.sort((a, b) => {
        const statusOrder = { live: 0, scheduled: 1, ended: 2 };
        return (statusOrder[a.status as keyof typeof statusOrder] || 2) - (statusOrder[b.status as keyof typeof statusOrder] || 2);
      });
      setMyEvents(sortedEvents);
    } catch (error) {
      console.error('Error loading events:', error);
    } finally {
      setEventLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadMyEvents();
    }, [loadMyEvents])
  );

  const isEventLiveCheck = (event: EventSession) => {
    if (event.status === 'ended') return false;
    if (event.ends_at && new Date(event.ends_at) < new Date()) return false;
    return event.status === 'live' || (event.status as string) === 'active';
  };

  const loadEventViews = useCallback(async () => {
    const views: Record<string, number> = {};
    for (const event of myEvents) {
      if (isEventLiveCheck(event)) {
        views[event.id] = await getActiveViewerCount(event.id);
      } else {
        views[event.id] = await getEventTotalViews(event.id);
      }
    }
    setEventViews(views);
  }, [myEvents]);

  useEffect(() => {
    if (myEvents.length > 0) {
      loadEventViews();
      const hasLiveEvents = myEvents.some(e => isEventLiveCheck(e));
      if (hasLiveEvents) {
        const interval = setInterval(loadEventViews, 15000);
        return () => clearInterval(interval);
      }
    }
  }, [myEvents, loadEventViews]);

  const handleContinueEvent = (event: EventSession) => {
    if (event.event_type === 'live_video' && event.live_session_id) {
      router.push({
        pathname: '/live-session-dashboard',
        params: { sessionId: event.live_session_id },
      });
      return;
    }
    router.push(`/event-publish?sessionId=${event.id}&sessionTitle=${encodeURIComponent(event.title)}&joinCode=${event.join_code}&eventType=${event.event_type || 'qr'}&startsAt=${encodeURIComponent(event.starts_at)}&endsAt=${encodeURIComponent(event.ends_at)}&location=${encodeURIComponent(event.location || '')}&priceCents=${event.price_cents || 0}`);
  };

  const handleShowQr = (event: EventSession) => {
    setSelectedEvent(event);
    setShowQrModal(true);
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const handleCopyCode = async () => {
    if (!selectedEvent) return;
    try {
      await Clipboard.setStringAsync(selectedEvent.join_code);
      setCopied(true);
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('Copy failed:', e);
    }
  };

  const handleShareCode = async () => {
    if (!selectedEvent) return;
    try {
      await Share.share({
        message: `Rejoignez mon événement SignTouch "${selectedEvent.title}" avec le code: ${selectedEvent.join_code}`,
      });
    } catch (e) {
      console.error('Share failed:', e);
    }
  };

  const handleDeleteEvent = async (event: EventSession) => {
    const confirmMessage = t('deleteEventConfirm') || `Êtes-vous sûr de vouloir supprimer "${event.title}" ?`;
    showConfirm(
      t('deleteEvent') || 'Supprimer l\'événement',
      confirmMessage,
      [
        { text: t('cancel') || 'Annuler', style: 'cancel' },
        {
          text: t('delete') || 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteEventSession(event.id);
              if (Platform.OS !== 'web') {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              }
              loadMyEvents();
            } catch (error) {
              console.error('Delete failed:', error);
              showAlert(t('error') || 'Erreur', t('deleteFailed') || 'Échec de la suppression');
            }
          },
        },
      ]
    );
  };

  const getEventStatusLabel = (status: string, event?: EventSession) => {
    switch (status) {
      case 'live':
      case 'active':
        return 'EN COURS';
      case 'scheduled':
        if (event && event.starts_at) {
          const scheduledTime = new Date(event.starts_at);
          if (scheduledTime <= new Date()) {
            return 'PRÊT';
          }
        }
        return 'À VENIR';
      case 'ended':
        return 'TERMINÉ';
      default:
        return status.toUpperCase();
    }
  };

  const isEventEnded = (event: EventSession) => {
    if (event.status === 'ended') return true;
    if (event.ends_at && new Date(event.ends_at) < new Date()) return true;
    return false;
  };

  const isEventLive = (event: EventSession) => {
    if (isEventEnded(event)) return false;
    return event.status === 'live' || (event.status as string) === 'active';
  };

  const getEventStatus = (event: EventSession) => {
    if (isEventEnded(event)) return 'ended';
    if (event.status === 'live' || (event.status as string) === 'active') return 'live';
    return 'scheduled';
  };

  const filteredEvents = myEvents.filter((event) => {
    if (eventFilter === 'all') return true;
    const status = getEventStatus(event);
    return status === eventFilter;
  });

  const getFilterCount = (filter: FilterType) => {
    if (filter === 'all') return myEvents.length;
    return myEvents.filter((e) => getEventStatus(e) === filter).length;
  };

  const endedEvents = myEvents.filter(e => getEventStatus(e) === 'ended');
  const allEndedSelected = endedEvents.length > 0 && endedEvents.every(e => selectedEventIds.has(e.id));

  const toggleSelectAll = () => {
    if (allEndedSelected) {
      setSelectedEventIds(new Set());
    } else {
      setSelectedEventIds(new Set(endedEvents.map(e => e.id)));
    }
  };

  const handleDeleteSelected = () => {
    if (selectedEventIds.size === 0) return;
    const count = selectedEventIds.size;
    showConfirm(
      t('deleteEvent') || 'Supprimer',
      `${t('deleteSelectedConfirm') || 'Supprimer'} ${count} ${t('events') || 'événement(s)'} ?`,
      [
        { text: t('cancel') || 'Annuler', style: 'cancel' },
        {
          text: t('delete') || 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            setIsDeletingSelected(true);
            try {
              await Promise.all(
                Array.from(selectedEventIds).map(id => deleteEventSession(id))
              );
              if (Platform.OS !== 'web') {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              }
              setSelectedEventIds(new Set());
              loadMyEvents();
            } catch (error) {
              console.error('Bulk delete failed:', error);
              showAlert(t('error') || 'Erreur', t('deleteFailed') || 'Échec de la suppression');
            } finally {
              setIsDeletingSelected(false);
            }
          },
        },
      ]
    );
  };

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
  const activeEventsCount = myEvents.filter(e => getEventStatus(e) !== 'ended').length;

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
      <View style={styles.fanJoinRow}>
        <TouchableOpacity
          style={styles.fanJoinBtn}
          onPress={() => router.push('/join-live-session' as any)}
          activeOpacity={0.8}
        >
          <View style={[styles.fanJoinIcon, { backgroundColor: 'rgba(239,68,68,0.15)' }]}>
            <Video size={20} color="#ef4444" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.fanJoinTitle}>{t('fanJoinLive' as any) || 'Rejoindre un Live'}</Text>
            <Text style={styles.fanJoinSub}>{t('fanJoinLiveSub' as any) || 'Session vidéo avec une célébrité'}</Text>
          </View>
          <ChevronRight size={18} color="#6b7280" />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.fanJoinBtn}
          onPress={() => router.push('/join-event' as any)}
          activeOpacity={0.8}
        >
          <View style={[styles.fanJoinIcon, { backgroundColor: 'rgba(168,85,247,0.15)' }]}>
            <Sparkles size={20} color="#a855f7" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.fanJoinTitle}>{t('fanJoinDedication' as any) || 'Rejoindre une Dédicace'}</Text>
            <Text style={styles.fanJoinSub}>{t('fanJoinDedicationSub' as any) || 'Événement dédicace en direct'}</Text>
          </View>
          <ChevronRight size={18} color="#6b7280" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.fanPublishBtn}
          onPress={() => {
            if (isCelebrity) {
              router.push('/create-post' as any);
            } else {
              showAlert(
                t('fanPublishTitle' as any) || 'Publier un post',
                t('fanPublishExplain' as any) || 'Pour publier des posts et partager du contenu avec vos fans, vous devez d\'abord activer le mode Célébrité depuis les réglages de votre compte.'
              );
            }
          }}
          activeOpacity={0.8}
        >
          <View style={[styles.fanJoinIcon, { backgroundColor: 'rgba(16,185,129,0.15)' }]}>
            <FileText size={20} color="#10b981" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.fanJoinTitle}>{t('fanPublishTitle' as any) || 'Publier un post'}</Text>
            <Text style={styles.fanJoinSub}>
              {isCelebrity
                ? (t('fanPublishSubReady' as any) || 'Partagez du contenu avec vos fans')
                : (t('fanPublishSubLocked' as any) || 'Activez le mode Célébrité pour publier')
              }
            </Text>
          </View>
          {isCelebrity ? (
            <ChevronRight size={18} color="#10b981" />
          ) : (
            <View style={styles.fanPublishLockBadge}>
              <Star size={12} color="#f59e0b" fill="#f59e0b" />
            </View>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabItem, tab === 'bookings' && styles.tabItemActive]}
          onPress={() => setTab('bookings')}
          activeOpacity={0.7}
        >
          <Video size={15} color={tab === 'bookings' ? '#10b981' : '#6b7280'} />
          <Text style={[styles.tabLabel, tab === 'bookings' && styles.tabLabelActive]}>
            {t('myBookings')}
          </Text>
          {bookings.length > 0 && (
            <View style={[styles.tabCountBadge, tab === 'bookings' && styles.tabCountBadgeActive]}>
              <Text style={[styles.tabCountText, tab === 'bookings' && styles.tabCountTextActive]}>{bookings.length}</Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabItem, tab === 'autographs' && styles.tabItemActive]}
          onPress={() => setTab('autographs')}
          activeOpacity={0.7}
        >
          <PenTool size={15} color={tab === 'autographs' ? '#f59e0b' : '#6b7280'} />
          <Text style={[styles.tabLabel, tab === 'autographs' && styles.tabLabelActive]}>
            {t('myAutographs')}
          </Text>
          {autographs.length > 0 && (
            <View style={[styles.tabCountBadge, tab === 'autographs' && styles.tabCountBadgeAutograph]}>
              <Text style={[styles.tabCountText, tab === 'autographs' && styles.tabCountTextActive]}>{autographs.length}</Text>
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

      <View style={styles.eventActionsRow}>
        <TouchableOpacity
          style={styles.eventActionBtn}
          onPress={() => router.push('/create-live-session' as any)}
          activeOpacity={0.8}
        >
          <View style={[styles.eventActionIcon, { backgroundColor: 'rgba(239,68,68,0.15)' }]}>
            <Radio size={20} color="#ef4444" />
          </View>
          <Text style={styles.eventActionText}>{t('celDashCreateLive' as any) || 'Session Live'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.eventActionBtn}
          onPress={() => router.push('/create-event' as any)}
          activeOpacity={0.8}
        >
          <View style={[styles.eventActionIcon, { backgroundColor: 'rgba(168,85,247,0.15)' }]}>
            <Sparkles size={20} color="#a855f7" />
          </View>
          <Text style={styles.eventActionText}>{t('celDashCreateDedication' as any) || 'Dédicace Live'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.celSubTabBar}>
        <TouchableOpacity
          style={[styles.celSubTabItem, celTab === 'dashboard' && styles.celSubTabItemActive]}
          onPress={() => setCelTab('dashboard')}
          activeOpacity={0.7}
        >
          <Text style={[styles.celSubTabLabel, celTab === 'dashboard' && styles.celSubTabLabelActive]}>
            {t('celDashDashboard' as any) || 'Tableau de bord'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.celSubTabItem, celTab === 'events' && styles.celSubTabItemActive]}
          onPress={() => setCelTab('events')}
          activeOpacity={0.7}
        >
          <Text style={[styles.celSubTabLabel, celTab === 'events' && styles.celSubTabLabelActive]}>
            {t('celDashMyEvents' as any) || 'Mes événements'}
          </Text>
          {activeEventsCount > 0 && (
            <View style={styles.celSubTabBadge}>
              <Text style={styles.celSubTabBadgeText}>{activeEventsCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {celTab === 'dashboard' ? (
        <>
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

          <TouchableOpacity
            style={styles.earningsLink}
            onPress={() => router.push('/my-earnings' as any)}
            activeOpacity={0.8}
          >
            <View style={styles.earningsLinkIcon}>
              <Star size={22} color="#4ade80" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.earningsLinkTitle}>{t('viewMyEarnings') || 'Mes revenus & historique'}</Text>
              <Text style={styles.earningsLinkSub}>{t('earningsSubtitle') || 'Suivi des lives, revenus et versements'}</Text>
            </View>
            <ChevronRight size={18} color="rgba(255,255,255,0.4)" />
          </TouchableOpacity>
        </>
      ) : (
        <>
          {eventLoading ? (
            <View style={styles.evtLoadingContainer}>
              <ActivityIndicator size="large" color="#10b981" />
            </View>
          ) : myEvents.length === 0 ? (
            <View style={styles.evtEmptyContainer}>
              <QrCode size={56} color="rgba(255,255,255,0.2)" />
              <Text style={styles.evtEmptyTitle}>{t('noEvents') || 'Aucun événement'}</Text>
              <Text style={styles.evtEmptySubtitle}>{t('noEventsHint') || 'Créez votre premier événement pour partager votre signature avec vos fans'}</Text>
            </View>
          ) : (
            <>
              <View style={styles.evtFilterRow}>
                <TouchableOpacity
                  style={[styles.evtFilterBtn, eventFilter === 'live' && styles.evtFilterBtnActive]}
                  onPress={() => setEventFilter('live')}
                >
                  <Text style={[styles.evtFilterBtnText, eventFilter === 'live' && styles.evtFilterBtnTextActive]}>
                    {t('inProgress') || 'En cours'} ({getFilterCount('live')})
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.evtFilterBtn, eventFilter === 'scheduled' && styles.evtFilterBtnActive]}
                  onPress={() => setEventFilter('scheduled')}
                >
                  <Text style={[styles.evtFilterBtnText, eventFilter === 'scheduled' && styles.evtFilterBtnTextActive]}>
                    {t('upcoming') || 'À venir'} ({getFilterCount('scheduled')})
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.evtFilterBtn, eventFilter === 'ended' && styles.evtFilterBtnActive]}
                  onPress={() => setEventFilter('ended')}
                >
                  <Text style={[styles.evtFilterBtnText, eventFilter === 'ended' && styles.evtFilterBtnTextActive]}>
                    {t('past') || 'Passés'} ({getFilterCount('ended')})
                  </Text>
                </TouchableOpacity>
              </View>

              {eventFilter === 'ended' && endedEvents.length > 0 && (
                <View style={styles.evtBulkActionsRow}>
                  <TouchableOpacity style={styles.evtSelectAllBtn} onPress={toggleSelectAll}>
                    {allEndedSelected ? (
                      <Check size={16} color="#10B981" />
                    ) : (
                      <View style={styles.evtUncheckedBox} />
                    )}
                    <Text style={styles.evtSelectAllText}>
                      {allEndedSelected
                        ? (t('deselectAll') || 'Tout désélectionner')
                        : (t('selectAll') || 'Tout sélectionner')}
                    </Text>
                  </TouchableOpacity>
                  {selectedEventIds.size > 0 && (
                    <TouchableOpacity
                      style={styles.evtDeleteSelectedBtn}
                      onPress={handleDeleteSelected}
                      disabled={isDeletingSelected}
                    >
                      {isDeletingSelected ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <>
                          <Trash2 size={14} color="#fff" />
                          <Text style={styles.evtDeleteSelectedText}>
                            {t('delete') || 'Supprimer'} ({selectedEventIds.size})
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              )}

              <View style={styles.evtEventsList}>
                {filteredEvents.map((event) => {
                  const isLiveVideo = event.event_type === 'live_video';
                  const eventEnded = isEventEnded(event);
                  const eventLive = isEventLive(event);
                  const currentStatus = getEventStatus(event);
                  return (
                    <TouchableOpacity
                      key={event.id}
                      style={[styles.evtEventCard, eventFilter === 'ended' && selectedEventIds.has(event.id) && styles.evtEventCardSelected]}
                      activeOpacity={eventFilter === 'ended' ? 0.7 : 1}
                      onPress={() => {
                        if (eventFilter === 'ended') {
                          setSelectedEventIds(prev => {
                            const next = new Set(prev);
                            if (next.has(event.id)) next.delete(event.id);
                            else next.add(event.id);
                            return next;
                          });
                        }
                      }}
                    >
                      <View style={styles.evtEventHeader}>
                        {eventFilter === 'ended' && (
                          <View style={styles.evtEventCheckbox}>
                            {selectedEventIds.has(event.id) ? (
                              <Check size={14} color="#fff" />
                            ) : (
                              <View style={styles.evtUncheckedBox} />
                            )}
                          </View>
                        )}
                        <View style={styles.evtEventTypeBadges}>
                          <View style={[
                            styles.evtEventTypeBadge,
                            isLiveVideo ? styles.evtBadgeLiveVideo : styles.evtBadgeQr,
                            eventEnded && styles.evtBadgeEnded
                          ]}>
                            {isLiveVideo ? (
                              <Video size={12} color="#fff" />
                            ) : (
                              <QrCode size={12} color="#fff" />
                            )}
                            <Text style={styles.evtEventTypeText}>
                              {isLiveVideo ? 'LIVE' : 'QR'}
                            </Text>
                          </View>
                          <View style={[
                            styles.evtEventStatusBadge,
                            eventLive ? styles.evtBadgeLive :
                            eventEnded ? styles.evtBadgeEndedStatus : styles.evtBadgeScheduled
                          ]}>
                            {eventLive ? (
                              <Play size={10} color="#fff" fill="#fff" />
                            ) : eventEnded ? (
                              <Clock size={10} color="#fff" />
                            ) : (
                              <Calendar size={10} color="#fff" />
                            )}
                            <Text style={styles.evtEventStatusText}>{getEventStatusLabel(currentStatus, event)}</Text>
                          </View>
                        </View>
                        <TouchableOpacity
                          style={styles.evtDeleteBtn}
                          onPress={() => handleDeleteEvent(event)}
                        >
                          <Trash2 size={18} color="#ef4444" />
                        </TouchableOpacity>
                      </View>

                      <Text style={styles.evtEventTitle}>{event.title}</Text>

                      <View style={styles.evtEventTime}>
                        <Clock size={14} color="#6b7280" />
                        <Text style={styles.evtEventTimeText}>
                          {eventEnded
                            ? `Terminé le ${new Date(event.ends_at).toLocaleDateString()}`
                            : eventLive
                            ? `Jusqu'au ${new Date(event.ends_at).toLocaleDateString()} à ${new Date(event.ends_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                            : event.scheduled_at
                            ? `${new Date(event.scheduled_at).toLocaleDateString()} à ${new Date(event.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                            : `${new Date(event.starts_at).toLocaleDateString()} à ${new Date(event.starts_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                          }
                        </Text>
                      </View>

                      {isLiveVideo && (
                        <View style={styles.evtEventDetailsRow}>
                          <View style={styles.evtEventDetailItem}>
                            <Text style={styles.evtEventDetailValue}>
                              {event.price_cents ? `${(event.price_cents / 100).toFixed(0)}€` : t('free') || 'Gratuit'}
                            </Text>
                            <Text style={styles.evtEventDetailLabel}>{t('perFan') || 'par fan'}</Text>
                          </View>
                          <View style={styles.evtEventDetailDivider} />
                          <View style={styles.evtEventDetailItem}>
                            <Text style={styles.evtEventDetailValue}>
                              {event.price_cents && event.max_fans ? `${((event.price_cents * event.max_fans) / 100).toFixed(0)}€` : '-'}
                            </Text>
                            <Text style={styles.evtEventDetailLabel}>{t('estimatedTotal') || 'total estimé'}</Text>
                          </View>
                          <View style={styles.evtEventDetailDivider} />
                          <View style={styles.evtEventDetailItem}>
                            <Text style={styles.evtEventDetailValue}>{event.duration_per_fan_minutes || 5} min</Text>
                            <Text style={styles.evtEventDetailLabel}>{t('perFan') || 'par fan'}</Text>
                          </View>
                          <View style={styles.evtEventDetailDivider} />
                          <View style={styles.evtEventDetailItem}>
                            <Text style={styles.evtEventDetailValue}>
                              {((event.duration_per_fan_minutes || 5) * (event.max_fans || 60))} min
                            </Text>
                            <Text style={styles.evtEventDetailLabel}>{t('totalDuration') || 'durée totale'}</Text>
                          </View>
                        </View>
                      )}

                      <View style={styles.evtEventCode}>
                        <Text style={styles.evtEventCodeLabel}>{t('code') || 'Code'}:</Text>
                        <Text style={styles.evtEventCodeValue}>{event.join_code}</Text>
                      </View>

                      {!eventEnded && (
                        <View style={styles.evtEventViewsRow}>
                          <Eye size={16} color={eventLive ? '#10b981' : '#6b7280'} />
                          <Text style={[styles.evtEventViewsText, eventLive && styles.evtEventViewsTextLive]}>
                            {eventViews[event.id] || 0} {eventLive ? (t('activeViewers') || 'spectateurs actifs') : (t('waitingViewers') || 'en attente')}
                          </Text>
                        </View>
                      )}

                      {!eventEnded && (
                        <View style={styles.evtEventActions}>
                          <TouchableOpacity
                            style={styles.evtActionBtn}
                            onPress={() => handleShowQr(event)}
                          >
                            <QrCode size={18} color="#e5e7eb" />
                            <Text style={styles.evtActionBtnText}>QR Code</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.evtActionBtn, styles.evtActionBtnPrimary]}
                            onPress={() => handleContinueEvent(event)}
                          >
                            {isLiveVideo ? (
                              <Video size={18} color="#fff" />
                            ) : (
                              <Edit3 size={18} color="#fff" />
                            )}
                            <Text style={[styles.evtActionBtnText, styles.evtActionBtnTextPrimary]}>
                              {isLiveVideo ? 'Live' : 'Éditer'}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}
        </>
      )}
    </ScrollView>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient colors={['#0a1628', '#0f2035', '#0a1628']} style={StyleSheet.absoluteFill} />
      <View style={styles.header}>
        <Text style={styles.title}>{t('mySpaceTitle')}</Text>
        {isCelebrity && (
          <View style={styles.modeChipRow}>
            <TouchableOpacity
              style={[styles.modeChip, mode === 'fan' && styles.modeChipActiveFan]}
              onPress={() => setMode('fan')}
              activeOpacity={0.8}
            >
              <Text style={[styles.modeChipText, mode === 'fan' && styles.modeChipTextActive]}>
                Fan
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeChip, mode === 'celebrity' && styles.modeChipActiveCel]}
              onPress={() => setMode('celebrity')}
              activeOpacity={0.8}
            >
              <Star size={12} color={mode === 'celebrity' ? '#000' : '#6b7280'} fill={mode === 'celebrity' ? '#000' : 'transparent'} />
              <Text style={[styles.modeChipText, mode === 'celebrity' && styles.modeChipTextActiveCel]}>
                {t('celDashModeCelebrity' as any) || 'Célébrité'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {mode === 'celebrity' && isCelebrity ? renderCelebrityView() : renderFanView()}

      {showQrModal && selectedEvent && (
        <View style={styles.qrModalOverlay}>
          <View style={styles.qrModalContent}>
            <TouchableOpacity style={styles.qrModalClose} onPress={() => setShowQrModal(false)}>
              <X size={24} color="#fff" />
            </TouchableOpacity>

            <Text style={styles.qrModalTitle}>{t('shareEvent') || 'Partager l\'événement'}</Text>
            <Text style={styles.qrModalSubtitle}>{selectedEvent.title}</Text>

            <View style={styles.qrContainer}>
              <QRCodeSvg
                value={`signtouch://join/${selectedEvent.join_code}`}
                size={200}
                backgroundColor="#ffffff"
                color="#1a1a2e"
              />
            </View>

            <Text style={styles.qrJoinCodeDisplay}>{selectedEvent.join_code}</Text>

            <View style={styles.qrModalActions}>
              <TouchableOpacity style={styles.qrModalBtn} onPress={handleCopyCode}>
                {copied ? <Check size={20} color="#10B981" /> : <Copy size={20} color="#fff" />}
                <Text style={styles.qrModalBtnText}>{copied ? (t('copied') || 'Copié!') : (t('copy') || 'Copier')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.qrModalBtn} onPress={handleShareCode}>
                <Share2 size={20} color="#fff" />
                <Text style={styles.qrModalBtnText}>{t('share') || 'Partager'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      <BottomNav />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a1628' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  title: { color: '#fff', fontSize: 22, fontWeight: '700' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  emptyText: { color: '#9ca3af', fontSize: 16, marginTop: 12, fontWeight: '600' },
  emptyHint: { color: '#6b7280', fontSize: 13, marginTop: 4, textAlign: 'center' },

  modeChipRow: {
    flexDirection: 'row',
    gap: 6,
  },
  modeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  modeChipActiveFan: {
    backgroundColor: '#10b981',
    borderColor: '#10b981',
  },
  modeChipActiveCel: {
    backgroundColor: '#f59e0b',
    borderColor: '#f59e0b',
  },
  modeChipText: {
    color: '#6b7280',
    fontSize: 13,
    fontWeight: '600',
  },
  modeChipTextActive: {
    color: '#fff',
  },
  modeChipTextActiveCel: {
    color: '#000',
  },

  tabBar: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginTop: 6,
    marginBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  tabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabItemActive: {
    borderBottomColor: '#10b981',
  },
  tabLabel: { color: '#6b7280', fontSize: 13, fontWeight: '600' },
  tabLabelActive: { color: '#e5e7eb' },
  tabCountBadge: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 10,
    marginLeft: 2,
  },
  tabCountBadgeActive: {
    backgroundColor: 'rgba(16,185,129,0.2)',
  },
  tabCountBadgeAutograph: {
    backgroundColor: 'rgba(245,158,11,0.2)',
  },
  tabCountText: { color: '#6b7280', fontSize: 11, fontWeight: '700' },
  tabCountTextActive: { color: '#e5e7eb' },
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

  eventActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  eventActionBtn: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 14,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  eventActionIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  eventActionText: {
    color: '#d1d5db',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  fanJoinRow: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 10,
  },
  fanJoinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  fanJoinIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fanJoinTitle: {
    color: '#e5e7eb',
    fontSize: 14,
    fontWeight: '600',
  },
  fanJoinSub: {
    color: '#6b7280',
    fontSize: 11,
    marginTop: 2,
  },
  fanPublishBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(16,185,129,0.06)',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.15)',
  },
  fanPublishLockBadge: {
    backgroundColor: 'rgba(245,158,11,0.15)',
    borderRadius: 10,
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
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
    marginBottom: 12,
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

  celSubTabBar: {
    flexDirection: 'row',
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  celSubTabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  celSubTabItemActive: {
    borderBottomColor: '#10b981',
  },
  celSubTabLabel: {
    color: '#6b7280',
    fontSize: 13,
    fontWeight: '600',
  },
  celSubTabLabelActive: {
    color: '#e5e7eb',
  },
  celSubTabBadge: {
    backgroundColor: '#ef4444',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
    minWidth: 20,
    alignItems: 'center',
  },
  celSubTabBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
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

  earningsLink: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(74, 222, 128, 0.08)',
    borderRadius: 16,
    padding: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    gap: 12,
  },
  earningsLinkIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(74, 222, 128, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  earningsLinkTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 2,
  },
  earningsLinkSub: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
  },

  evtLoadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  evtEmptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  evtEmptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginTop: 16,
    marginBottom: 8,
  },
  evtEmptySubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    lineHeight: 20,
  },
  evtFilterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  evtFilterBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  evtFilterBtnActive: {
    backgroundColor: 'rgba(16,185,129,0.2)',
    borderColor: '#10b981',
  },
  evtFilterBtnText: {
    fontSize: 13,
    color: '#9ca3af',
    fontWeight: '500',
  },
  evtFilterBtnTextActive: {
    color: '#e5e7eb',
  },
  evtBulkActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  evtSelectAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  evtSelectAllText: {
    color: '#e5e7eb',
    fontSize: 14,
    fontWeight: '600',
  },
  evtUncheckedBox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  evtEventCheckbox: {
    marginRight: 8,
  },
  evtDeleteSelectedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ef4444',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  evtDeleteSelectedText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  evtEventsList: {
    gap: 12,
  },
  evtEventCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  evtEventCardSelected: {
    borderWidth: 2,
    borderColor: '#10B981',
  },
  evtEventHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  evtEventTypeBadges: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    flex: 1,
  },
  evtEventTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    gap: 5,
  },
  evtBadgeQr: {
    backgroundColor: '#10B981',
  },
  evtBadgeLiveVideo: {
    backgroundColor: '#8b5cf6',
  },
  evtEventTypeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },
  evtEventStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    gap: 5,
  },
  evtBadgeLive: {
    backgroundColor: '#ef4444',
  },
  evtBadgeScheduled: {
    backgroundColor: '#f59e0b',
  },
  evtBadgeEnded: {
    backgroundColor: '#6b7280',
  },
  evtBadgeEndedStatus: {
    backgroundColor: '#9ca3af',
  },
  evtEventStatusText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },
  evtDeleteBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(239,68,68,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  evtEventTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  evtEventTime: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  evtEventTimeText: {
    fontSize: 13,
    color: '#9ca3af',
  },
  evtEventDetailsRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(16,185,129,0.08)',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  evtEventDetailItem: {
    flex: 1,
    alignItems: 'center',
  },
  evtEventDetailValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#10b981',
  },
  evtEventDetailLabel: {
    fontSize: 10,
    color: '#6b7280',
    marginTop: 2,
  },
  evtEventDetailDivider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  evtEventCode: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    marginBottom: 14,
  },
  evtEventCodeLabel: {
    fontSize: 13,
    color: '#9ca3af',
  },
  evtEventCodeValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#10b981',
    letterSpacing: 2,
  },
  evtEventViewsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 14,
  },
  evtEventViewsText: {
    fontSize: 13,
    color: '#6b7280',
  },
  evtEventViewsTextLive: {
    color: '#10b981',
    fontWeight: '600',
  },
  evtEventActions: {
    flexDirection: 'row',
    gap: 10,
  },
  evtActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingVertical: 12,
    borderRadius: 10,
  },
  evtActionBtnPrimary: {
    backgroundColor: '#10b981',
  },
  evtActionBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#e5e7eb',
  },
  evtActionBtnTextPrimary: {
    color: '#fff',
  },

  qrModalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  qrModalContent: {
    backgroundColor: '#1a1a2e',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    width: '90%',
    maxWidth: 340,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  qrModalClose: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  qrModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
    marginTop: 16,
  },
  qrModalSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 20,
  },
  qrContainer: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  qrJoinCodeDisplay: {
    fontSize: 28,
    fontWeight: '800',
    color: '#10B981',
    letterSpacing: 4,
    marginBottom: 20,
  },
  qrModalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  qrModalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  qrModalBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
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
