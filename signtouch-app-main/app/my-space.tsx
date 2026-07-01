import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, ScrollView, Platform, Share,
 TextInput } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Inbox, Video, PenTool, Clock, ChevronRight, User,
  Star, Plus, Eye, TrendingUp, Sparkles, Radio,
  QrCode, Trash2, Copy, Share2, X, Check, Edit3, Play, Calendar, Settings, Globe, Save, Images,
 Shield } from 'lucide-react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import PlyzHeader from '@/components/PlyzHeader';
import { showAlert, showConfirm } from '@/utils/alertHelper';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { useCelebrityMode } from '@/contexts/CelebrityModeContext';
import BottomNav, { BOTTOM_NAV_HEIGHT } from '@/components/BottomNav';
import AccountAvatarButton from '@/components/AccountAvatarButton';
import StripeConnectModal from '@/components/StripeConnectModal';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getStripeAccountId } from '@/utils/userProfile';
import { authedFetch } from '@/utils/authedFetch';

import { getMyScheduledEvents, EventSession, deleteEventSession, getEventTotalViews, getActiveViewerCount, getSignedDedicationCount } from '@/utils/eventSessionStorage';
import { getServedFansCountBySessions } from '@/utils/sessionQueueStorage';
import QRCodeSvg from 'react-native-qrcode-svg';

const API_BASE = Platform.OS === 'web' ? '' : (process.env.EXPO_PUBLIC_STRIPE_SERVER_URL || '');

type ModeType = 'fan' | 'celebrity';
type CelTabType = 'dashboard' | 'events' | 'settings';
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
  const { t } = useLanguage();
  const { user } = useAuth();
  const { isCelebrity } = useCelebrityMode();
  const [mode, setMode] = useState<ModeType>(isCelebrity ? 'celebrity' : 'fan');

  useEffect(() => {
    if (!isCelebrity && mode === 'celebrity') {
      setMode('fan');
    }
  }, [isCelebrity]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [, setAutographs] = useState<Autograph[]>([]);
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
  // Nombre de fans REELLEMENT servis (session_queue completed + payment_captured) par session video,
  // utilise pour le « total reel » des sessions video TERMINEES. Cle = live_session_id.
  const [servedFansBySession, setServedFansBySession] = useState<Record<string, number>>({});
  const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(new Set());
  const [isDeletingSelected, setIsDeletingSelected] = useState(false);

  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [videoCallPriceEur, setVideoCallPriceEur] = useState('');
  const [videoCallDuration, setVideoCallDuration] = useState('15');
  const [, setVideoCallUnit] = useState<'session' | 'minute'>('session');
  const [autographPriceEur, setAutographPriceEur] = useState('');
  const [dedicationPriceEur, setDedicationPriceEur] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [settingsCurrency, setSettingsCurrency] = useState('eur');

  const [showStripeConnect, setShowStripeConnect] = useState(false);
  const [stripeConnected, setStripeConnected] = useState(false);

  const scrollViewRef = useRef<ScrollView>(null);
  const bookingsSectionY = useRef(0);
  const autographsSectionY = useRef(0);
  const scrollToBookingsRef = useRef<(() => void) | null>(null);
  const scrollToAutographsRef = useRef<(() => void) | null>(null);

  scrollToBookingsRef.current = () => {
    scrollViewRef.current?.scrollTo({ y: bookingsSectionY.current, animated: true });
  };
  scrollToAutographsRef.current = () => {
    scrollViewRef.current?.scrollTo({ y: autographsSectionY.current, animated: true });
  };

  const fetchSettings = useCallback(async () => {
    if (!user?.id) return;
    setSettingsLoading(true);
    try {
      const res = await authedFetch(`${API_BASE}/api/my-celebrity-pricing?user_id=${user.id}`);
      const data = await res.json();
      if (data.pricing) {
        setVideoCallPriceEur(String((data.pricing.video_call_price_cents || 0) / 100));
        setVideoCallDuration(String(data.pricing.video_call_duration_minutes || 15));
        setVideoCallUnit('minute');
        setAutographPriceEur(String((data.pricing.autograph_price_cents || 0) / 100));
        setDedicationPriceEur(String((data.pricing.live_dedication_price_cents || 0) / 100));
        setSettingsCurrency(data.pricing.currency || 'eur');
      }
      if (data.website !== undefined) {
        setWebsiteUrl(data.website || '');
      }
    } catch (err) {
      console.error('Fetch settings error:', err);
    } finally {
      setSettingsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (celTab === 'settings' && isCelebrity) {
      fetchSettings();
    }
  }, [celTab, isCelebrity, fetchSettings]);

  const parsePrice = (val: string): number => {
    const n = parseFloat(val);
    return isNaN(n) || n < 0 ? 0 : Math.round(n * 100);
  };

  const parseDuration = (val: string): number => {
    const n = parseInt(val, 10);
    return isNaN(n) || n < 1 ? 15 : n;
  };

  const saveSettings = async () => {
    if (!user?.id) return;
    setSettingsSaving(true);
    try {
      const pricingRes = await authedFetch(`${API_BASE}/api/upsert-celebrity-pricing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          video_call_price_cents: parsePrice(videoCallPriceEur),
          video_call_unit: 'minute',
          video_call_duration_minutes: parseDuration(videoCallDuration),
          autograph_price_cents: parsePrice(autographPriceEur),
          live_dedication_price_cents: parsePrice(dedicationPriceEur),
          currency: settingsCurrency,
        }),
      });
      const pricingData = await pricingRes.json();
      if (pricingData.error) throw new Error(pricingData.error);

      const profileRes = await authedFetch(`${API_BASE}/api/update-celebrity-profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          website: websiteUrl.trim(),
        }),
      });
      const profileData = await profileRes.json();
      if (profileData.error) throw new Error(profileData.message || profileData.error);

      showAlert(t('settingsSaved' as any) || 'Paramètres enregistrés !', '');
    } catch (err: any) {
      console.error('Save settings error:', err);
      showAlert('Error', err.message || 'Failed to save');
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleUpdateBookingStatus = async (bookingId: string, status: string) => {
    try {
      await authedFetch(`${API_BASE}/api/update-booking-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_id: bookingId, status }),
      });
      fetchData();
    } catch (err) {
      console.error('Update booking status error:', err);
    }
  };

  const handleUpdateAutographStatus = async (autographId: string, status: string) => {
    try {
      await authedFetch(`${API_BASE}/api/update-autograph-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autograph_id: autographId, status }),
      });
      fetchData();
    } catch (err) {
      console.error('Update autograph status error:', err);
    }
  };

  const fetchData = useCallback(async () => {
    if (!user?.id) return;
    try {
      setLoading(true);
      const fetches: Promise<Response>[] = [
        authedFetch(`${API_BASE}/api/my-bookings?user_id=${user.id}&role=fan`),
        authedFetch(`${API_BASE}/api/my-autographs?user_id=${user.id}&role=fan`),
      ];
      if (isCelebrity) {
        fetches.push(
          authedFetch(`${API_BASE}/api/my-bookings?user_id=${user.id}&role=celebrity`),
          authedFetch(`${API_BASE}/api/my-autographs?user_id=${user.id}&role=celebrity`),
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
        const byStatus = (statusOrder[a.status as keyof typeof statusOrder] || 2) - (statusOrder[b.status as keyof typeof statusOrder] || 2);
        if (byStatus !== 0) return byStatus;
        // À statut égal, les événements les plus RÉCENTS en premier (sinon le dernier créé se
        // retrouvait tout en bas de la liste des "passés", invisible).
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
      setMyEvents(sortedEvents);

      // Pour les sessions VIDEO TERMINEES uniquement, on recupere le nombre de fans
      // reellement servis (1 requete groupee) pour afficher un « total reel ».
      const now = Date.now();
      const endedVideoSessionIds = sortedEvents
        .filter((e) => {
          if (e.event_type !== 'live_video' || !e.live_session_id) return false;
          const ended = e.status === 'ended' || (e.ends_at ? new Date(e.ends_at).getTime() < now : false);
          return ended;
        })
        .map((e) => e.live_session_id as string);
      if (endedVideoSessionIds.length > 0) {
        const counts = await getServedFansCountBySessions(endedVideoSessionIds);
        setServedFansBySession(counts);
      } else {
        setServedFansBySession({});
      }
    } catch (error) {
      console.error('Error loading events:', error);
    } finally {
      setEventLoading(false);
    }
  }, []);

  const checkStripeStatus = useCallback(async () => {
    try {
      if (user?.id) {
        const acctId = await getStripeAccountId(user.id);
        if (acctId) { setStripeConnected(true); return; }
      }
      const local = await AsyncStorage.getItem('stripe_connect_account_id');
      setStripeConnected(!!local);
    } catch { setStripeConnected(false); }
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      loadMyEvents();
      if (isCelebrity) checkStripeStatus();
    }, [loadMyEvents, isCelebrity, checkStripeStatus])
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
        message: `Rejoignez mon événement Plyz "${selectedEvent.title}" avec le code: ${selectedEvent.join_code}`,
      });
    } catch (e) {
      console.error('Share failed:', e);
    }
  };

  const performDeleteEvent = async (event: EventSession) => {
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
  };

  const handleDeleteEvent = async (event: EventSession) => {
    // Événement DÉDICACE PAYANT sans aucune dédicace publiée : terminer maintenant
    // (= supprimer) déclenche le remboursement intégral des fans et la célébrité
    // n'est PAS payée. On l'avertit avec un message spécifique avant de confirmer.
    const isDedication = event.event_type !== 'live_video';
    const isPaid = !!event.price_cents && event.price_cents > 0;
    if (isDedication && isPaid) {
      const signedCount = await getSignedDedicationCount(event.id).catch(() => -1);
      if (signedCount === 0) {
        showConfirm(
          t('deleteEvent') || 'Supprimer l\'événement',
          t('endEventNoDedicationConfirm') ||
            'Tu n\'as publié aucune dédicace. Si tu termines maintenant, tu ne seras PAS payée et les fans seront intégralement remboursés. Confirmer ?',
          [
            { text: t('cancel') || 'Annuler', style: 'cancel' },
            {
              text: t('delete') || 'Supprimer',
              style: 'destructive',
              onPress: () => performDeleteEvent(event),
            },
          ]
        );
        return;
      }
    }

    const confirmMessage = t('deleteEventConfirm') || `Êtes-vous sûr de vouloir supprimer "${event.title}" ?`;
    showConfirm(
      t('deleteEvent') || 'Supprimer l\'événement',
      confirmMessage,
      [
        { text: t('cancel') || 'Annuler', style: 'cancel' },
        {
          text: t('delete') || 'Supprimer',
          style: 'destructive',
          onPress: () => performDeleteEvent(event),
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
    const isPaid = item.status === 'paid';
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
          {isPaid && (
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.acceptBtn]}
                onPress={() => handleUpdateBookingStatus(item.id, 'confirmed')}
                activeOpacity={0.7}
              >
                <Check size={14} color="#fff" />
                <Text style={styles.actionBtnText}>{t('accept' as any) || 'Accepter'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.declineBtn]}
                onPress={() => showConfirm(
                  t('declineBookingTitle' as any) || 'Refuser cette réservation ?',
                  t('declineBookingMsg' as any) || 'Le paiement sera annulé et le fan sera remboursé.',
                  [
                    { text: t('cancel') || 'Annuler', style: 'cancel' },
                    { text: t('decline' as any) || 'Refuser', style: 'destructive', onPress: () => handleUpdateBookingStatus(item.id, 'cancelled') },
                  ]
                )}
                activeOpacity={0.7}
              >
                <X size={14} color="#ef4444" />
                <Text style={[styles.actionBtnText, { color: '#ef4444' }]}>{t('decline' as any) || 'Refuser'}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
        <View style={[styles.statusBadge, { backgroundColor: `${STATUS_COLORS[item.status] || '#6b7280'}20` }]}>
          <Text style={[styles.statusText, { color: STATUS_COLORS[item.status] || '#6b7280' }]}>
            {getStatusLabel(item.status)}
          </Text>
        </View>
      </View>
    );
  };

  const renderCelAutograph = ({ item }: { item: Autograph }) => {
    const fan = item.profiles;
    const isPaid = item.status === 'paid';
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
          {isPaid && (
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.acceptBtn]}
                onPress={() => handleUpdateAutographStatus(item.id, 'in_progress')}
                activeOpacity={0.7}
              >
                <Check size={14} color="#fff" />
                <Text style={styles.actionBtnText}>{t('accept' as any) || 'Accepter'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.declineBtn]}
                onPress={() => showConfirm(
                  t('declineAutographTitle' as any) || 'Refuser cette demande ?',
                  t('declineAutographMsg' as any) || 'Le paiement sera annulé et le fan sera remboursé.',
                  [
                    { text: t('cancel') || 'Annuler', style: 'cancel' },
                    { text: t('decline' as any) || 'Refuser', style: 'destructive', onPress: () => handleUpdateAutographStatus(item.id, 'cancelled') },
                  ]
                )}
                activeOpacity={0.7}
              >
                <X size={14} color="#ef4444" />
                <Text style={[styles.actionBtnText, { color: '#ef4444' }]}>{t('decline' as any) || 'Refuser'}</Text>
              </TouchableOpacity>
            </View>
          )}
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
        <PlyzHeader />
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
          <View style={styles.orSeparatorRow}>
            <View style={styles.orSeparatorLine} />
            <Text style={styles.orSeparatorText}>{t('orSeparator') || 'OU'}</Text>
            <View style={styles.orSeparatorLine} />
          </View>
          <TouchableOpacity
            style={styles.guestGalleryBtn}
            onPress={() => router.push('/gallery' as any)}
            activeOpacity={0.8}
          >
            <View style={[styles.fanJoinIcon, { backgroundColor: 'rgba(59,130,246,0.15)' }]}>
              <Images size={20} color="#3b82f6" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.fanJoinTitle}>{t('continueWithoutAccount') || 'Continuer sans compte'}</Text>
              <Text style={styles.fanJoinSub}>{t('continueWithoutAccountDesc') || 'Accédez à vos créations sauvegardées localement sur votre téléphone.'}</Text>
            </View>
            <ChevronRight size={18} color="#6b7280" />
          </TouchableOpacity>
        </View>
        <AccountAvatarButton />
        <BottomNav />
      </View>
    );
  }

  const renderFanView = () => (
    <>
      <View style={styles.fanIntroBox}>
        <Text style={styles.fanIntroText}>
          {t('fanIntroText' as any) || 'Bienvenue dans votre espace fan ! Rejoignez des sessions live vidéo avec vos célébrités préférées, participez à des événements dédicaces et retrouvez ici toutes vos réservations.'}
        </Text>
      </View>
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
            <Text style={styles.fanJoinTitle}>{t('fanJoinLive' as any) || 'Rejoindre Session Live Vidéo'}</Text>
            <Text style={styles.fanJoinSub}>{t('fanJoinLiveSub' as any) || 'Entrez un code pour rejoindre un appel vidéo en direct avec votre célébrité préférée'}</Text>
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
            <Text style={styles.fanJoinTitle}>{t('fanJoinDedication' as any) || 'Rejoindre Session Live Dédicace'}</Text>
            <Text style={styles.fanJoinSub}>{t('fanJoinDedicationSub' as any) || 'Scannez un QR code ou entrez un code pour recevoir une dédicace personnalisée de votre célébrité'}</Text>
          </View>
          <ChevronRight size={18} color="#6b7280" />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.fanJoinBtn}
          onPress={() => router.push('/gallery' as any)}
          activeOpacity={0.8}
        >
          <View style={[styles.fanJoinIcon, { backgroundColor: 'rgba(59,130,246,0.15)' }]}>
            <Images size={20} color="#3b82f6" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.fanJoinTitle}>{t('myGallery') || 'Mes créations'}</Text>
            <Text style={styles.fanJoinSub}>{t('myGalleryDesc') || 'Retrouvez toutes vos photos signées et dédicaces sauvegardées.'}</Text>
          </View>
          <ChevronRight size={18} color="#6b7280" />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.fanJoinBtn}
          onPress={() => router.push('/account' as any)}
          activeOpacity={0.8}
        >
          <View style={[styles.fanJoinIcon, { backgroundColor: 'rgba(16,185,129,0.15)' }]}>
            <User size={20} color="#10b981" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.fanJoinTitle}>{t('accountTitle') || 'Mon Compte'}</Text>
            <Text style={styles.fanJoinSub}>{t('accountSubtitle' as any) || 'Langue, connexion, paramètres et préférences'}</Text>
          </View>
          <ChevronRight size={18} color="#6b7280" />
        </TouchableOpacity>
      </View>

      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabItem, styles.tabItemActive]}
          activeOpacity={0.7}
        >
          <Video size={15} color="#10b981" />
          <Text style={[styles.tabLabel, styles.tabLabelActive]}>
            {t('myBookings')}
          </Text>
          {bookings.length > 0 && (
            <View style={[styles.tabCountBadge, styles.tabCountBadgeActive]}>
              <Text style={[styles.tabCountText, styles.tabCountTextActive]}>{bookings.length}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#10b981" />
        </View>
      ) : (
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
      )}
    </>
  );

  const renderCelebrityView = () => (
    <ScrollView
      ref={scrollViewRef}
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: BOTTOM_NAV_HEIGHT + 20 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.celIntroBox}>
        <Text style={styles.celIntroText}>
          {t('celIntroText' as any) || 'Le mode Célébrité vous permet de créer des sessions live vidéo et des événements dédicaces pour interagir avec vos fans. Connectez votre compte Stripe pour certifier votre identité et être rémunéré directement.'}
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.celVerifyBtn, stripeConnected && styles.celVerifyBtnConnected]}
        onPress={() => {
          if (!stripeConnected) setShowStripeConnect(true);
        }}
        activeOpacity={stripeConnected ? 1 : 0.8}
      >
        <Shield size={20} color={stripeConnected ? '#10b981' : '#f59e0b'} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={[styles.celVerifyTitle, stripeConnected && { color: '#10b981' }]}>
            {stripeConnected
              ? (t('celStripeConnected' as any) || 'Compte certifié ✓')
              : (t('celStripeVerify' as any) || 'Certifier mon compte célébrité')}
          </Text>
          <Text style={styles.celVerifySub}>
            {stripeConnected
              ? (t('celStripeConnectedSub' as any) || 'Stripe Connect actif — vous êtes vérifié et pouvez être rémunéré')
              : (t('celStripeVerifySub' as any) || 'Connectez Stripe pour être vérifié et recevoir vos paiements')}
          </Text>
        </View>
        {!stripeConnected && <ChevronRight size={18} color="#f59e0b" />}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.celVerifyBtn}
        onPress={() => router.push('/tax-info' as any)}
        activeOpacity={0.8}
      >
        <Shield size={20} color="#38bdf8" />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.celVerifyTitle}>{t('taxInfoMenuItem' as any) || 'Informations fiscales'}</Text>
          <Text style={styles.celVerifySub}>{t('taxInfoMenuSub' as any) || 'Requis pour recevoir tes revenus (DAC7)'}</Text>
        </View>
        <ChevronRight size={18} color="#38bdf8" />
      </TouchableOpacity>

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

      <View style={styles.celCreateRow}>
        <TouchableOpacity
          style={styles.celCreateBtn}
          onPress={() => router.push('/create-live-session' as any)}
          activeOpacity={0.8}
        >
          <View style={[styles.celCreateIcon, { backgroundColor: 'rgba(239,68,68,0.15)' }]}>
            <Radio size={20} color="#ef4444" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.celCreateTitle}>{t('celDashCreateLive' as any) || 'Session Live Vidéo'}</Text>
            <Text style={styles.celCreateSub}>{t('celDashCreateLiveSub' as any) || 'Appel vidéo en direct avec vos fans'}</Text>
          </View>
          <ChevronRight size={18} color="#6b7280" />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.celCreateBtn}
          onPress={() => router.push('/create-event' as any)}
          activeOpacity={0.8}
        >
          <View style={[styles.celCreateIcon, { backgroundColor: 'rgba(168,85,247,0.15)' }]}>
            <Sparkles size={20} color="#a855f7" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.celCreateTitle}>{t('celDashCreateDedication' as any) || 'Session Live Dédicace'}</Text>
            <Text style={styles.celCreateSub}>{t('celDashCreateDedicationSub' as any) || 'Signez des autographes pour vos fans'}</Text>
          </View>
          <ChevronRight size={18} color="#6b7280" />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.celCreateBtn}
          onPress={() => router.push('/account' as any)}
          activeOpacity={0.8}
        >
          <View style={[styles.celCreateIcon, { backgroundColor: 'rgba(16,185,129,0.15)' }]}>
            <User size={20} color="#10b981" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.celCreateTitle}>{t('accountTitle') || 'Mon Compte'}</Text>
            <Text style={styles.celCreateSub}>{t('accountSubtitle' as any) || 'Langue, connexion, paramètres et préférences'}</Text>
          </View>
          <ChevronRight size={18} color="#6b7280" />
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
        <TouchableOpacity
          style={[styles.celSubTabItem, celTab === 'settings' && styles.celSubTabItemActive]}
          onPress={() => setCelTab('settings')}
          activeOpacity={0.7}
        >
          <Settings size={16} color={celTab === 'settings' ? '#10b981' : '#6b7280'} />
          <Text style={[styles.celSubTabLabel, celTab === 'settings' && styles.celSubTabLabelActive]}>
            {t('celDashSettings' as any) || 'Tarifs'}
          </Text>
        </TouchableOpacity>
      </View>

      {celTab === 'dashboard' ? (
        <>
          <View style={styles.statsRow}>
            <TouchableOpacity
              style={styles.statCard}
              onPress={() => { setCelTab('dashboard'); scrollToBookingsRef.current?.(); }}
              activeOpacity={0.7}
            >
              <View style={[styles.statIconWrap, { backgroundColor: 'rgba(16,185,129,0.15)' }]}>
                <Video size={18} color="#10b981" />
              </View>
              <Text style={styles.statValue}>{celBookings.length}</Text>
              <Text style={styles.statLabel}>{t('celDashTotalBookings' as any) || 'Réservations'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.statCard}
              onPress={() => { setCelTab('dashboard'); scrollToAutographsRef.current?.(); }}
              activeOpacity={0.7}
            >
              <View style={[styles.statIconWrap, { backgroundColor: 'rgba(245,158,11,0.15)' }]}>
                <PenTool size={18} color="#f59e0b" />
              </View>
              <Text style={styles.statValue}>{celAutographs.length}</Text>
              <Text style={styles.statLabel}>{t('celDashTotalAutographs' as any) || 'Autographes'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.statCard}
              onPress={() => router.push('/my-earnings' as any)}
              activeOpacity={0.7}
            >
              <View style={[styles.statIconWrap, { backgroundColor: 'rgba(59,130,246,0.15)' }]}>
                <TrendingUp size={18} color="#3b82f6" />
              </View>
              <Text style={styles.statValue}>{formatPrice(Math.round(totalEarningsCents * 0.85), mainCurrency)}</Text>
              <Text style={styles.statLabel}>{t('celDashEarnings' as any) || 'Revenus'}</Text>
            </TouchableOpacity>
          </View>

          <View onLayout={(e) => { bookingsSectionY.current = e.nativeEvent.layout.y; }}>
          <Text style={styles.sectionTitle}>
            {t('celDashPendingBookings' as any) || 'Réservations en attente'}
            {pendingBookings.length > 0 && (
              <Text style={styles.sectionCount}> ({pendingBookings.length})</Text>
            )}
          </Text>
          </View>
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

          <View onLayout={(e) => { autographsSectionY.current = e.nativeEvent.layout.y; }}>
          <Text style={styles.sectionTitle}>
            {t('celDashPendingAutographs' as any) || 'Demandes d\'autographes'}
            {pendingAutographs.length > 0 && (
              <Text style={styles.sectionCount}> ({pendingAutographs.length})</Text>
            )}
          </Text>
          </View>
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
      ) : celTab === 'settings' ? (
        <>
          {settingsLoading ? (
            <View style={{ alignItems: 'center', paddingVertical: 40 }}>
              <ActivityIndicator size="large" color="#10b981" />
            </View>
          ) : (
            <>
              <Text style={styles.settingsSectionTitle}>
                <Video size={16} color="#10b981" /> {t('settingsVideoCall' as any) || 'Appel vidéo'}
              </Text>
              <View style={styles.settingsCard}>
                <View style={styles.settingsField}>
                  <Text style={styles.settingsLabel}>{t('settingsVideoPrice' as any) || 'Prix (€)'}</Text>
                  <TextInput
                    style={styles.settingsInput}
                    value={videoCallPriceEur}
                    onChangeText={setVideoCallPriceEur}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor="#4b5563"
                  />
                </View>
                <View style={styles.settingsField}>
                  <Text style={styles.settingsLabel}>{t('settingsDuration' as any) || 'Durée (min)'}</Text>
                  <TextInput
                    style={styles.settingsInput}
                    value={videoCallDuration}
                    onChangeText={setVideoCallDuration}
                    keyboardType="number-pad"
                    placeholder="15"
                    placeholderTextColor="#4b5563"
                  />
                </View>
              </View>

              <Text style={styles.settingsSectionTitle}>
                <Sparkles size={16} color="#a855f7" /> {t('settingsDedication' as any) || 'Session Live Dédicace'}
              </Text>
              <View style={styles.settingsCard}>
                <View style={styles.settingsField}>
                  <Text style={styles.settingsLabel}>{t('settingsDedicationPrice' as any) || 'Prix (€)'}</Text>
                  <TextInput
                    style={styles.settingsInput}
                    value={dedicationPriceEur}
                    onChangeText={setDedicationPriceEur}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor="#4b5563"
                  />
                </View>
              </View>

              <Text style={styles.settingsSectionTitle}>
                <PenTool size={16} color="#f59e0b" /> {t('settingsAutograph' as any) || 'Autographe'}
              </Text>
              <View style={styles.settingsCard}>
                <View style={styles.settingsField}>
                  <Text style={styles.settingsLabel}>{t('settingsAutographPrice' as any) || 'Prix (€)'}</Text>
                  <TextInput
                    style={styles.settingsInput}
                    value={autographPriceEur}
                    onChangeText={setAutographPriceEur}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor="#4b5563"
                  />
                </View>
              </View>

              <Text style={styles.settingsSectionTitle}>
                <Globe size={16} color="#3b82f6" /> {t('settingsWebsite' as any) || 'Site web'}
              </Text>
              <View style={styles.settingsCard}>
                <View style={styles.settingsField}>
                  <Text style={styles.settingsLabel}>URL</Text>
                  <TextInput
                    style={styles.settingsInput}
                    value={websiteUrl}
                    onChangeText={setWebsiteUrl}
                    keyboardType="url"
                    autoCapitalize="none"
                    placeholder="https://..."
                    placeholderTextColor="#4b5563"
                  />
                </View>
              </View>

              <TouchableOpacity
                style={[styles.settingsSaveBtn, settingsSaving && { opacity: 0.6 }]}
                onPress={saveSettings}
                disabled={settingsSaving}
                activeOpacity={0.8}
              >
                {settingsSaving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Save size={18} color="#fff" />
                    <Text style={styles.settingsSaveBtnText}>{t('settingsSave' as any) || 'Enregistrer'}</Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          )}
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
                  // Session video TERMINEE : on affiche le total REEL (fans reellement servis x prix x 85%)
                  // et la duree REELLE. Session active/programmee : on garde l'estimation (max_fans).
                  const realFans = (isLiveVideo && eventEnded && event.live_session_id)
                    ? (servedFansBySession[event.live_session_id] || 0)
                    : null;
                  const durationPerFan = event.duration_per_fan_minutes || 5;
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
                              {realFans !== null
                                ? `${((realFans * (event.price_cents || 0) * 0.85) / 100).toFixed(0)}€`
                                : (event.price_cents && event.max_fans ? `${((event.price_cents * event.max_fans) / 100).toFixed(0)}€` : '-')}
                            </Text>
                            <Text style={styles.evtEventDetailLabel}>
                              {realFans !== null ? (t('realTotal') || 'total réel') : (t('estimatedTotal') || 'total estimé')}
                            </Text>
                          </View>
                          <View style={styles.evtEventDetailDivider} />
                          <View style={styles.evtEventDetailItem}>
                            <Text style={styles.evtEventDetailValue}>{durationPerFan} min</Text>
                            <Text style={styles.evtEventDetailLabel}>{t('perFan') || 'par fan'}</Text>
                          </View>
                          <View style={styles.evtEventDetailDivider} />
                          <View style={styles.evtEventDetailItem}>
                            <Text style={styles.evtEventDetailValue}>
                              {realFans !== null
                                ? `${realFans * durationPerFan} min`
                                : `${durationPerFan * (event.max_fans || 60)} min`}
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
        <PlyzHeader />
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
                value={`plyz://join/${selectedEvent.join_code}`}
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

      <AccountAvatarButton />
      <BottomNav />

      <StripeConnectModal
        visible={showStripeConnect}
        onClose={() => setShowStripeConnect(false)}
        onConnected={() => {
          setStripeConnected(true);
          setShowStripeConnect(false);
        }}
        celebrityName={''}
        userId={user?.id}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fanIntroBox: {
    backgroundColor: 'rgba(59,130,246,0.08)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.2)',
    padding: 14,
    marginBottom: 12,
    marginTop: 4,
    marginHorizontal: 16,
  },
  fanIntroText: {
    color: '#93c5fd',
    fontSize: 13,
    lineHeight: 20,
  },
  celIntroBox: {
    backgroundColor: 'rgba(99,102,241,0.08)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.2)',
    padding: 14,
    marginBottom: 12,
    marginTop: 4,
  },
  celIntroText: {
    color: '#c7d2fe',
    fontSize: 13,
    lineHeight: 20,
  },
  celVerifyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245,158,11,0.08)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.25)',
    padding: 14,
    marginBottom: 14,
  },
  celVerifyBtnConnected: {
    backgroundColor: 'rgba(16,185,129,0.08)',
    borderColor: 'rgba(16,185,129,0.25)',
  },
  celVerifyTitle: {
    color: '#f59e0b',
    fontSize: 14,
    fontWeight: '700',
  },
  celVerifySub: {
    color: '#9ca3af',
    fontSize: 12,
    marginTop: 2,
    lineHeight: 17,
  },
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

  celCreateRow: {
    gap: 10,
    marginBottom: 16,
  },
  celCreateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  celCreateIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  celCreateTitle: {
    color: '#e5e7eb',
    fontSize: 14,
    fontWeight: '600',
  },
  celCreateSub: {
    color: '#6b7280',
    fontSize: 11,
    marginTop: 2,
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
  guestGalleryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    marginHorizontal: 20,
  },
  orSeparatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 16,
    marginHorizontal: 20,
    gap: 12,
  },
  orSeparatorLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  orSeparatorText: {
    color: '#6b7280',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
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
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  acceptBtn: {
    backgroundColor: '#10b981',
  },
  declineBtn: {
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
  },
  actionBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  settingsSectionTitle: {
    color: '#e5e7eb',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 20,
    marginBottom: 10,
  },
  settingsCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 16,
    gap: 16,
  },
  settingsField: {
    gap: 6,
  },
  settingsLabel: {
    color: '#9ca3af',
    fontSize: 13,
    fontWeight: '600',
  },
  settingsInput: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    color: '#fff',
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  settingsUnitRow: {
    flexDirection: 'row',
    gap: 8,
  },
  settingsUnitBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
  },
  settingsUnitBtnActive: {
    backgroundColor: 'rgba(16,185,129,0.15)',
    borderColor: '#10b981',
  },
  settingsUnitText: {
    color: '#6b7280',
    fontSize: 14,
    fontWeight: '600',
  },
  settingsUnitTextActive: {
    color: '#10b981',
  },
  settingsSaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#10b981',
    borderRadius: 14,
    paddingVertical: 16,
    marginTop: 24,
    marginBottom: 20,
  },
  settingsSaveBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
