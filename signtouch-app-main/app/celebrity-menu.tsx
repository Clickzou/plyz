import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
  Share,
} from 'react-native';
import { showAlert, showConfirm } from '@/utils/alertHelper';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, QrCode, Video, Star, Clock, Play, Calendar, Trash2, Copy, Share2, X, Check, Edit3, Plus, Eye, PenSquare, Ticket, LogIn, Users, PenTool } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { useLanguage } from '@/contexts/LanguageContext';
import { useCelebrityMode } from '@/contexts/CelebrityModeContext';
import BottomNav from '@/components/BottomNav';
import { getMyScheduledEvents, EventSession, deleteEventSession, getEventTotalViews, getActiveViewerCount, getActiveFanEvent, ActiveFanEvent } from '@/utils/eventSessionStorage';
import QRCodeSvg from 'react-native-qrcode-svg';

type TabType = 'create' | 'events';
type FilterType = 'all' | 'live' | 'ended' | 'scheduled';

// Mapping vue (depuis fan-choice) → filtre interne.
const VIEW_TO_FILTER: Record<string, FilterType> = {
  upcoming: 'scheduled',
  ongoing: 'live',
  past: 'ended',
};

export default function CelebrityMenuScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { isCelebrity } = useCelebrityMode();
  // Params optionnels passés par l'écran « Événements » (fan-choice).
  const params = useLocalSearchParams<{ view?: string; kind?: string }>();
  const viewParam = Array.isArray(params.view) ? params.view[0] : params.view;
  const kindParam = Array.isArray(params.kind) ? params.kind[0] : params.kind;
  const hasCategoryParam = viewParam === 'upcoming' || viewParam === 'ongoing' || viewParam === 'past';
  const [myEvents, setMyEvents] = useState<EventSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>(
    hasCategoryParam ? 'events' : (isCelebrity ? 'create' : 'events'),
  );
  const [selectedEvent, setSelectedEvent] = useState<EventSession | null>(null);
  const [showQrModal, setShowQrModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [eventViews, setEventViews] = useState<Record<string, number>>({});
  const [eventFilter, setEventFilter] = useState<FilterType>(
    hasCategoryParam ? VIEW_TO_FILTER[viewParam as string] : 'live',
  );
  const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(new Set());
  const [isDeletingSelected, setIsDeletingSelected] = useState(false);
  const [activeFanEvent, setActiveFanEvent] = useState<ActiveFanEvent | null>(null);

  const loadActiveFanEvent = useCallback(async () => {
    try {
      const fanEvent = await getActiveFanEvent();
      setActiveFanEvent(fanEvent);
    } catch (e) {
      console.warn('[loadActiveFanEvent] Error:', e);
      setActiveFanEvent(null);
    }
  }, []);

  const handleResumeFanEvent = () => {
    if (!activeFanEvent) return;
    router.push({
      pathname: '/event-gallery',
      params: {
        sessionId: activeFanEvent.sessionId,
        sessionTitle: activeFanEvent.sessionTitle,
        joinCode: activeFanEvent.joinCode,
        endsAt: activeFanEvent.endsAt,
        signers: activeFanEvent.signers,
        startsAt: activeFanEvent.starts_at || '',
      },
    });
  };

  const getFanSignerCount = (event: ActiveFanEvent): number => {
    try {
      const parsed = JSON.parse(event.signers);
      return Array.isArray(parsed) ? parsed.length : 0;
    } catch {
      return 0;
    }
  };

  const loadMyEvents = useCallback(async () => {
    try {
      setLoading(true);
      console.log('[loadMyEvents] Fetching events...');
      const events = await getMyScheduledEvents();
      console.log('[loadMyEvents] Got', events.length, 'events:', events.map(e => e.id));
      const sortedEvents = events.sort((a, b) => {
        const statusOrder = { live: 0, scheduled: 1, ended: 2 };
        return (statusOrder[a.status as keyof typeof statusOrder] || 2) - (statusOrder[b.status as keyof typeof statusOrder] || 2);
      });
      setMyEvents(sortedEvents);
    } catch (error) {
      console.error('Error loading events:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadMyEvents();
      loadActiveFanEvent();
    }, [loadMyEvents, loadActiveFanEvent])
  );

  // Un fan ne doit jamais rester sur l'onglet "Création événement"
  useEffect(() => {
    if (!isCelebrity && activeTab === 'create') {
      setActiveTab('events');
    }
  }, [isCelebrity, activeTab]);

  const isEventLiveCheck = (event: EventSession) => {
    if (event.status === 'ended') return false;
    if (event.ends_at && new Date(event.ends_at) < new Date()) return false;
    return event.status === 'live';
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

  const getStatusLabel = (status: string, event?: EventSession) => {
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
    return event.status === 'live';
  };
  
  const getEventStatus = (event: EventSession) => {
    if (isEventEnded(event)) return 'ended';
    if (event.status === 'live') return 'live';
    return 'scheduled';
  };

  // Filtre type : si un param kind est passé, ne garde que événements OU vidéos.
  const kindMatches = (event: EventSession) => {
    if (kindParam === 'video') return event.event_type === 'live_video';
    if (kindParam === 'event') return event.event_type !== 'live_video';
    return true;
  };
  // Liste de base restreinte au type demandé (sinon tous les événements).
  const scopedEvents = myEvents.filter(kindMatches);
  // Liste qui pilote l'affichage (vide / liste / filtres).
  const baseEvents = kindParam ? scopedEvents : myEvents;

  const endedEvents = scopedEvents.filter(e => getEventStatus(e) === 'ended');
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

  // Catégorise l'événement rejoint par le fan pour le confronter aux params courants.
  // kind : 'video' si session live vidéo, sinon 'event' (dédicace).
  const getFanEventKind = (event: ActiveFanEvent): 'video' | 'event' =>
    event.event_type === 'live_video' ? 'video' : 'event';
  // view : même logique temporelle que getEventStatus, exprimée en upcoming/ongoing/past.
  const getFanEventView = (event: ActiveFanEvent): 'upcoming' | 'ongoing' | 'past' => {
    const now = new Date();
    // starts_at n'est pas (encore) typé sur ActiveFanEvent mais peut exister au runtime.
    const startsAt = (event as { starts_at?: string }).starts_at;
    if (startsAt && new Date(startsAt) > now) return 'upcoming';
    if (event.endsAt && new Date(event.endsAt) < now) return 'past';
    return 'ongoing';
  };
  // La carte ne s'affiche que si elle correspond aux params (ou s'il n'y a pas de param).
  const fanEventMatchesParams = (event: ActiveFanEvent): boolean => {
    const kindOk = !kindParam || kindParam === getFanEventKind(event);
    const viewOk = !hasCategoryParam || viewParam === getFanEventView(event);
    return kindOk && viewOk;
  };
  const showFanEventCard = !!activeFanEvent && fanEventMatchesParams(activeFanEvent);

  const filteredEvents = scopedEvents.filter((event) => {
    if (eventFilter === 'all') return true;
    const status = getEventStatus(event);
    return status === eventFilter;
  });

  const getFilterCount = (filter: FilterType) => {
    if (filter === 'all') return scopedEvents.length;
    return scopedEvents.filter((e) => getEventStatus(e) === filter).length;
  };

  // Titre du header : libellé de catégorie si on arrive depuis fan-choice,
  // sinon comportement existant (« Célébrité » ou « Mes événements »).
  const getCategoryTitle = (): string => {
    if (!hasCategoryParam) return isCelebrity ? t('celebrity') : 'Mes événements';
    const isVideo = kindParam === 'video';
    if (viewParam === 'upcoming') return isVideo ? t('videoSessionsUpcoming' as any) : t('eventsUpcoming' as any);
    if (viewParam === 'ongoing') return isVideo ? t('videoSessionsOngoing' as any) : t('eventsOngoing' as any);
    return isVideo ? t('videoSessionsPast' as any) : t('eventsPast' as any);
  };

  // Badge « pill » indiquant le type d'événement : Live vidéo (violet) ou Dédicace (vert).
  const renderEventTypeBadge = (eventType?: string) => {
    const isVideo = eventType === 'live_video';
    return (
      <View style={[styles.typePill, isVideo ? styles.typePillVideo : styles.typePillDedicace]}>
        {isVideo ? (
          <Video size={12} color="#8b5cf6" />
        ) : (
          <PenTool size={12} color="#188661" />
        )}
        <Text style={[styles.typePillText, isVideo ? styles.typePillTextVideo : styles.typePillTextDedicace]}>
          {isVideo
            ? (t('eventTypeLiveVideo' as any) || 'Live vidéo')
            : (t('eventTypeDedicace' as any) || 'Dédicace')}
        </Text>
      </View>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={['#188661', '#188661']}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <ArrowLeft size={24} color="#188661" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{getCategoryTitle()}</Text>
        <View style={{ width: 40 }} />
      </View>

      {isCelebrity && (
        <View style={styles.tabsContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'create' && styles.tabActive]}
            onPress={() => setActiveTab('create')}
          >
            <Text style={[styles.tabText, activeTab === 'create' && styles.tabTextActive]}>
              Création événement
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'events' && styles.tabActive]}
            onPress={() => setActiveTab('events')}
          >
            <Text style={[styles.tabText, activeTab === 'events' && styles.tabTextActive]}>
              Mes événements
            </Text>
            {scopedEvents.length > 0 && (
              <View style={styles.tabBadge}>
                <Text style={styles.tabBadgeText}>{scopedEvents.length}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      )}

      <ScrollView 
        style={styles.content} 
        contentContainerStyle={[styles.contentContainer, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]}
        showsVerticalScrollIndicator={false}
      >
        {(!isCelebrity || activeTab === 'events') ? (
          <>
            {showFanEventCard && activeFanEvent && (
              <View style={styles.fanEventCard}>
                <View style={styles.fanEventBadgeRow}>
                  <Ticket size={14} color="#f59e0b" />
                  <Text style={styles.fanEventBadgeText}>{t('joinedEvent' as any) || 'Tu participes à'}</Text>
                  {renderEventTypeBadge(activeFanEvent.event_type)}
                </View>
                <Text style={styles.fanEventTitle}>{activeFanEvent.sessionTitle}</Text>
                <View style={styles.fanEventInfoRow}>
                  <View style={styles.eventCode}>
                    <Text style={styles.eventCodeLabel}>{t('code') || 'Code'}:</Text>
                    <Text style={styles.eventCodeValue}>{activeFanEvent.joinCode}</Text>
                  </View>
                  <View style={styles.fanEventSigners}>
                    <Users size={14} color="#6b7280" />
                    <Text style={styles.fanEventSignersText}>{getFanSignerCount(activeFanEvent)}</Text>
                  </View>
                </View>
                <TouchableOpacity style={styles.fanEventResumeBtn} onPress={handleResumeFanEvent}>
                  <LogIn size={18} color="#fff" />
                  <Text style={styles.fanEventResumeText}>{t('resume' as any) || 'Reprendre'}</Text>
                </TouchableOpacity>
              </View>
            )}
            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#fff" />
              </View>
            ) : baseEvents.length === 0 && !showFanEventCard ? (
              <View style={styles.emptyContainer}>
                <QrCode size={64} color="rgba(255,255,255,0.3)" />
                <Text style={styles.emptyTitle}>
                  {isCelebrity ? (t('noEvents') || 'Aucun événement') : 'Aucun événement en cours'}
                </Text>
                <Text style={styles.emptySubtitle}>
                  {isCelebrity
                    ? (t('noEventsHint') || 'Créez votre premier événement pour partager votre signature avec vos fans')
                    : 'Rejoins un événement avec un code QR pour le retrouver ici.'}
                </Text>
                {isCelebrity && (
                  <TouchableOpacity
                    style={styles.createBtn}
                    onPress={() => setActiveTab('create')}
                  >
                    <Plus size={20} color="#188661" />
                    <Text style={styles.createBtnText}>{t('createEvent') || 'Créer un événement'}</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : baseEvents.length === 0 ? (
              null
            ) : (
              <>
                <View style={styles.filterRow}>
                  <TouchableOpacity
                    style={[styles.filterBtn, eventFilter === 'live' && styles.filterBtnActive]}
                    onPress={() => setEventFilter('live')}
                  >
                    <Text style={[styles.filterBtnText, eventFilter === 'live' && styles.filterBtnTextActive]}>
                      {t('inProgress') || 'En cours'} ({getFilterCount('live')})
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.filterBtn, eventFilter === 'scheduled' && styles.filterBtnActive]}
                    onPress={() => setEventFilter('scheduled')}
                  >
                    <Text style={[styles.filterBtnText, eventFilter === 'scheduled' && styles.filterBtnTextActive]}>
                      {t('upcoming') || 'À venir'} ({getFilterCount('scheduled')})
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.filterBtn, eventFilter === 'ended' && styles.filterBtnActive]}
                    onPress={() => setEventFilter('ended')}
                  >
                    <Text style={[styles.filterBtnText, eventFilter === 'ended' && styles.filterBtnTextActive]}>
                      {t('past') || 'Passés'} ({getFilterCount('ended')})
                    </Text>
                  </TouchableOpacity>
                </View>
                {eventFilter === 'ended' && endedEvents.length > 0 && (
                  <View style={styles.bulkActionsRow}>
                    <TouchableOpacity style={styles.selectAllBtn} onPress={toggleSelectAll}>
                      {allEndedSelected ? (
                        <Check size={16} color="#10B981" />
                      ) : (
                        <View style={styles.uncheckedBox} />
                      )}
                      <Text style={styles.selectAllText}>
                        {allEndedSelected
                          ? (t('deselectAll') || 'Tout désélectionner')
                          : (t('selectAll') || 'Tout sélectionner')}
                      </Text>
                    </TouchableOpacity>
                    {selectedEventIds.size > 0 && (
                      <TouchableOpacity
                        style={styles.deleteSelectedBtn}
                        onPress={handleDeleteSelected}
                        disabled={isDeletingSelected}
                      >
                        {isDeletingSelected ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <>
                            <Trash2 size={14} color="#fff" />
                            <Text style={styles.deleteSelectedText}>
                              {t('delete') || 'Supprimer'} ({selectedEventIds.size})
                            </Text>
                          </>
                        )}
                      </TouchableOpacity>
                    )}
                  </View>
                )}
                <View style={styles.eventsList}>
                {filteredEvents.map((event) => {
                  const isLiveVideo = event.event_type === 'live_video';
                  const eventEnded = isEventEnded(event);
                  const eventLive = isEventLive(event);
                  const currentStatus = getEventStatus(event);
                  return (
                    <TouchableOpacity
                      key={event.id}
                      style={[styles.eventCard, eventFilter === 'ended' && selectedEventIds.has(event.id) && styles.eventCardSelected]}
                      activeOpacity={0.7}
                      onPress={() => {
                        if (eventFilter === 'ended') {
                          setSelectedEventIds(prev => {
                            const next = new Set(prev);
                            if (next.has(event.id)) next.delete(event.id);
                            else next.add(event.id);
                            return next;
                          });
                        } else {
                          // Rouvre le bon dashboard (live vidéo ou dédicace) avec les bons params.
                          handleContinueEvent(event);
                        }
                      }}
                    >
                      <View style={styles.eventHeader}>
                        {eventFilter === 'ended' && (
                          <View style={styles.eventCheckbox}>
                            {selectedEventIds.has(event.id) ? (
                              <Check size={14} color="#fff" />
                            ) : (
                              <View style={styles.uncheckedBox} />
                            )}
                          </View>
                        )}
                        <View style={styles.eventTypeBadges}>
                          <View style={[
                            styles.eventTypeBadge,
                            isLiveVideo ? styles.badgeLiveVideo : styles.badgeQr,
                            eventEnded && styles.badgeEnded
                          ]}>
                            {isLiveVideo ? (
                              <Video size={12} color="#fff" />
                            ) : (
                              <QrCode size={12} color="#fff" />
                            )}
                            <Text style={styles.eventTypeText}>
                              {isLiveVideo ? 'LIVE' : 'QR'}
                            </Text>
                          </View>
                          <View style={[
                            styles.eventStatusBadge,
                            eventLive ? styles.badgeLive : 
                            eventEnded ? styles.badgeEndedStatus : styles.badgeScheduled
                          ]}>
                            {eventLive ? (
                              <Play size={10} color="#fff" fill="#fff" />
                            ) : eventEnded ? (
                              <Clock size={10} color="#fff" />
                            ) : (
                              <Calendar size={10} color="#fff" />
                            )}
                            <Text style={styles.eventStatusText}>{getStatusLabel(currentStatus, event)}</Text>
                          </View>
                        </View>
                        <TouchableOpacity
                          style={styles.deleteBtn}
                          onPress={() => handleDeleteEvent(event)}
                        >
                          <Trash2 size={18} color="#ef4444" />
                        </TouchableOpacity>
                      </View>
                      
                      <Text style={styles.eventTitle}>{event.title}</Text>

                      <View style={styles.typePillRow}>
                        {renderEventTypeBadge(event.event_type)}
                      </View>

                      <View style={styles.eventTime}>
                        <Clock size={14} color="#6b7280" />
                        <Text style={styles.eventTimeText}>
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
                        <View style={styles.eventDetailsRow}>
                          <View style={styles.eventDetailItem}>
                            <Text style={styles.eventDetailValue}>
                              {event.price_cents ? `${(event.price_cents / 100).toFixed(0)}€` : t('free') || 'Gratuit'}
                            </Text>
                            <Text style={styles.eventDetailLabel}>{t('perFan') || 'par fan'}</Text>
                          </View>
                          <View style={styles.eventDetailDivider} />
                          <View style={styles.eventDetailItem}>
                            <Text style={styles.eventDetailValue}>
                              {event.price_cents && event.max_fans ? `${((event.price_cents * event.max_fans) / 100).toFixed(0)}€` : '-'}
                            </Text>
                            <Text style={styles.eventDetailLabel}>{t('estimatedTotal') || 'total estimé'}</Text>
                          </View>
                          <View style={styles.eventDetailDivider} />
                          <View style={styles.eventDetailItem}>
                            <Text style={styles.eventDetailValue}>{event.duration_per_fan_minutes || 5} min</Text>
                            <Text style={styles.eventDetailLabel}>{t('perFan') || 'par fan'}</Text>
                          </View>
                          <View style={styles.eventDetailDivider} />
                          <View style={styles.eventDetailItem}>
                            <Text style={styles.eventDetailValue}>
                              {((event.duration_per_fan_minutes || 5) * (event.max_fans || 60))} min
                            </Text>
                            <Text style={styles.eventDetailLabel}>{t('totalDuration') || 'durée totale'}</Text>
                          </View>
                        </View>
                      )}

                      <View style={styles.eventCode}>
                        <Text style={styles.eventCodeLabel}>{t('code') || 'Code'}:</Text>
                        <Text style={styles.eventCodeValue}>{event.join_code}</Text>
                      </View>

                      {!eventEnded && (
                        <View style={styles.eventViewsRow}>
                          <Eye size={16} color={eventLive ? '#10b981' : '#6b7280'} />
                          <Text style={[styles.eventViewsText, eventLive && styles.eventViewsTextLive]}>
                            {eventViews[event.id] || 0} {eventLive ? (t('activeViewers') || 'spectateurs actifs') : (t('waitingViewers') || 'en attente')}
                          </Text>
                        </View>
                      )}

                      {!eventEnded && (
                        <View style={styles.eventActions}>
                          <TouchableOpacity
                            style={styles.actionBtn}
                            onPress={() => handleShowQr(event)}
                          >
                            <QrCode size={18} color="#374151" />
                            <Text style={styles.actionBtnText}>QR Code</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.actionBtn, styles.actionBtnPrimary]}
                            onPress={() => handleContinueEvent(event)}
                          >
                            {isLiveVideo ? (
                              <Video size={18} color="#fff" />
                            ) : (
                              <Edit3 size={18} color="#fff" />
                            )}
                            <Text style={[styles.actionBtnText, styles.actionBtnTextPrimary]}>
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
        ) : (
          <>
            <Text style={styles.title}>{t('celebrityMenuTitle')}</Text>
            <Text style={styles.subtitle}>{t('celebrityMenuSubtitle')}</Text>

            <TouchableOpacity
              style={styles.newPostCard}
              onPress={() => router.push('/create-post')}
              activeOpacity={0.8}
            >
              <View style={styles.newPostIcon}>
                <PenSquare size={24} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.newPostTitle}>{t('newPost' as any)}</Text>
                <Text style={styles.newPostDesc}>{t('newPostDesc' as any)}</Text>
              </View>
              <Play size={16} color="rgba(255,255,255,0.4)" />
            </TouchableOpacity>

            <View style={styles.optionsContainer}>
              <TouchableOpacity
                style={styles.optionCard}
                onPress={() => router.push('/create-event')}
              >
                <View style={styles.optionIcon}>
                  <QrCode size={32} color="#10B981" />
                </View>
                <Text style={styles.optionTitle}>{t('celebrityEventSimple')}</Text>
                <Text style={styles.optionDescription}>{t('celebrityEventSimpleDesc')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.optionCard}
                onPress={() => router.push('/create-live-session')}
              >
                <View style={[styles.optionIcon, styles.liveIcon]}>
                  <Video size={32} color="#ef4444" />
                </View>
                <View style={styles.liveBadge}>
                  <Text style={styles.liveBadgeText}>LIVE</Text>
                </View>
                <Text style={styles.optionTitle}>{t('celebrityLiveSession')}</Text>
                <Text style={styles.optionDescription}>{t('celebrityLiveSessionDesc')}</Text>
              </TouchableOpacity>

            </View>

            <TouchableOpacity
              style={styles.earningsCard}
              onPress={() => router.push('/my-earnings')}
            >
              <View style={styles.earningsCardIcon}>
                <Star size={24} color="#4ade80" />
              </View>
              <View style={styles.earningsCardContent}>
                <Text style={styles.earningsCardTitle}>{t('viewMyEarnings') || 'Mes revenus & historique'}</Text>
                <Text style={styles.earningsCardSubtitle}>{t('earningsSubtitle') || 'Suivi des lives, revenus et versements'}</Text>
              </View>
              <Play size={16} color="rgba(255,255,255,0.4)" />
            </TouchableOpacity>

            <Text style={styles.disclaimer}>{t('celebrityMenuDisclaimer')}</Text>
          </>
        )}
      </ScrollView>

      {showQrModal && selectedEvent && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <TouchableOpacity style={styles.modalClose} onPress={() => setShowQrModal(false)}>
              <X size={24} color="#fff" />
            </TouchableOpacity>
            
            <Text style={styles.modalTitle}>{t('shareEvent') || 'Partager l\'événement'}</Text>
            <Text style={styles.modalSubtitle}>{selectedEvent.title}</Text>
            
            <View style={styles.qrContainer}>
              <QRCodeSvg
                value={`plyz://join/${selectedEvent.join_code}`}
                size={200}
                backgroundColor="#ffffff"
                color="#1a1a2e"
              />
            </View>
            
            <Text style={styles.joinCodeDisplay}>{selectedEvent.join_code}</Text>
            
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalBtn} onPress={handleCopyCode}>
                {copied ? <Check size={20} color="#10B981" /> : <Copy size={20} color="#fff" />}
                <Text style={styles.modalBtnText}>{copied ? (t('copied') || 'Copié!') : (t('copy') || 'Copier')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalBtn} onPress={handleShareCode}>
                <Share2 size={20} color="#fff" />
                <Text style={styles.modalBtnText}>{t('share') || 'Partager'}</Text>
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
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  tabsContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 12,
    padding: 4,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  tabActive: {
    backgroundColor: '#fff',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  tabTextActive: {
    color: '#188661',
  },
  tabBadge: {
    backgroundColor: '#ef4444',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    minWidth: 20,
    alignItems: 'center',
  },
  tabBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
  },
  createBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#188661',
  },
  eventsList: {
    gap: 12,
  },
  fanEventCard: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderWidth: 2,
    borderColor: '#f59e0b',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  fanEventBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  fanEventBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#f59e0b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  fanEventTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 12,
  },
  fanEventInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  fanEventSigners: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
  },
  fanEventSignersText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
  },
  fanEventResumeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#f59e0b',
    paddingVertical: 13,
    borderRadius: 12,
  },
  fanEventResumeText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  filterBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  filterBtnActive: {
    backgroundColor: '#fff',
  },
  filterBtnText: {
    fontSize: 13,
    color: '#fff',
    fontWeight: '500',
  },
  filterBtnTextActive: {
    color: '#188661',
  },
  eventCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 5,
  },
  eventCardSelected: {
    borderWidth: 2,
    borderColor: '#10B981',
  },
  eventCardEnded: {
    backgroundColor: '#f3f4f6',
    opacity: 0.8,
  },
  bulkActionsRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  selectAllBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
  },
  selectAllText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600' as const,
  },
  uncheckedBox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  eventCheckbox: {
    marginRight: 8,
  },
  deleteSelectedBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    backgroundColor: '#ef4444',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  deleteSelectedText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600' as const,
  },
  eventHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  eventTypeBadges: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  eventTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    gap: 5,
  },
  badgeQr: {
    backgroundColor: '#10B981',
  },
  badgeLiveVideo: {
    backgroundColor: '#8b5cf6',
  },
  eventTypeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },
  eventStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    gap: 5,
  },
  badgeLive: {
    backgroundColor: '#ef4444',
  },
  badgeScheduled: {
    backgroundColor: '#f59e0b',
  },
  badgeEnded: {
    backgroundColor: '#6b7280',
  },
  badgeEndedStatus: {
    backgroundColor: '#9ca3af',
  },
  eventStatusText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },
  deleteBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(239,68,68,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  eventTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 8,
  },
  eventTitleEnded: {
    color: '#9ca3af',
  },
  typePillRow: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  typePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  typePillVideo: {
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
  },
  typePillDedicace: {
    backgroundColor: 'rgba(24, 134, 97, 0.15)',
  },
  typePillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  typePillTextVideo: {
    color: '#8b5cf6',
  },
  typePillTextDedicace: {
    color: '#188661',
  },
  eventTime: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  eventTimeText: {
    fontSize: 13,
    color: '#6b7280',
  },
  eventTimeTextEnded: {
    color: '#9ca3af',
  },
  eventDetailsRow: {
    flexDirection: 'row',
    backgroundColor: '#f0fdf4',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  eventDetailItem: {
    flex: 1,
    alignItems: 'center',
  },
  eventDetailValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#188661',
  },
  eventDetailLabel: {
    fontSize: 10,
    color: '#6b7280',
    marginTop: 2,
  },
  eventDetailDivider: {
    width: 1,
    height: 28,
    backgroundColor: '#d1d5db',
  },
  eventCode: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    marginBottom: 14,
  },
  eventCodeLabel: {
    fontSize: 13,
    color: '#6b7280',
  },
  eventCodeLabelEnded: {
    color: '#9ca3af',
  },
  eventCodeValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#188661',
    letterSpacing: 2,
  },
  eventCodeValueEnded: {
    color: '#9ca3af',
  },
  eventViewsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 14,
  },
  eventViewsText: {
    fontSize: 13,
    color: '#6b7280',
  },
  eventViewsTextLive: {
    color: '#10b981',
    fontWeight: '600',
  },
  eventActions: {
    flexDirection: 'row',
    gap: 10,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#f3f4f6',
    paddingVertical: 12,
    borderRadius: 10,
  },
  actionBtnPrimary: {
    backgroundColor: '#188661',
  },
  actionBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  actionBtnTextPrimary: {
    color: '#fff',
  },
  iconContainer: {
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    marginBottom: 20,
    paddingHorizontal: 8,
  },
  optionsContainer: {
    gap: 12,
  },
  optionCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 5,
  },
  optionIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  liveIcon: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  liveBadge: {
    position: 'absolute',
    top: 16,
    right: 16,
    backgroundColor: '#ef4444',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  liveBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 6,
  },
  optionDescription: {
    fontSize: 13,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 18,
  },
  disclaimer: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    textAlign: 'center',
    lineHeight: 16,
    marginTop: 16,
    paddingHorizontal: 20,
  },
  modalOverlay: {
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
  modalContent: {
    backgroundColor: '#1a1a2e',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    width: '90%',
    maxWidth: 340,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  modalClose: {
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
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
    marginTop: 16,
  },
  modalSubtitle: {
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
  joinCodeDisplay: {
    fontSize: 28,
    fontWeight: '800',
    color: '#10B981',
    letterSpacing: 4,
    marginBottom: 20,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  modalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  modalBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  earningsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(74, 222, 128, 0.08)',
    borderRadius: 16,
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.5)',
    gap: 12,
  },
  earningsCardIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(74, 222, 128, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  earningsCardContent: {
    flex: 1,
  },
  earningsCardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 2,
  },
  earningsCardSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
  },
  newPostCard: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    gap: 12,
  },
  newPostIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#10b981',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  newPostTitle: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: '#fff',
    marginBottom: 2,
  },
  newPostDesc: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
  },
});
