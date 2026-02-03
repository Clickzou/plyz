import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
  Share,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, QrCode, Video, Star, Clock, Play, Calendar, Trash2, Copy, Share2, X, Check, Edit3, Plus } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { useLanguage } from '@/contexts/LanguageContext';
import { getMyScheduledEvents, EventSession, deleteEventSession } from '@/utils/eventSessionStorage';
const QRCodeSvg = require('react-native-qrcode-svg').default;

type TabType = 'create' | 'events';

export default function CelebrityMenuScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const [myEvents, setMyEvents] = useState<EventSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('create');
  const [selectedEvent, setSelectedEvent] = useState<EventSession | null>(null);
  const [showQrModal, setShowQrModal] = useState(false);
  const [copied, setCopied] = useState(false);

  const loadMyEvents = useCallback(async () => {
    try {
      setLoading(true);
      const events = await getMyScheduledEvents();
      const activeOrScheduled = events.filter(e => 
        e.status === 'scheduled' || e.status === 'live'
      );
      setMyEvents(activeOrScheduled);
    } catch (error) {
      console.error('Error loading events:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadMyEvents();
    }, [loadMyEvents])
  );

  const handleContinueEvent = (event: EventSession) => {
    router.push(`/event-publish?sessionId=${event.id}&sessionTitle=${encodeURIComponent(event.title)}&joinCode=${event.join_code}`);
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

  const handleDeleteEvent = (event: EventSession) => {
    Alert.alert(
      t('deleteEvent') || 'Supprimer l\'événement',
      t('deleteEventConfirm') || `Êtes-vous sûr de vouloir supprimer "${event.title}" ?`,
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
              Alert.alert(t('error') || 'Erreur', t('deleteFailed') || 'Échec de la suppression');
            }
          },
        },
      ]
    );
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'live':
      case 'active':
        return 'EN COURS';
      case 'scheduled':
        return 'PLANIFIÉ';
      default:
        return status.toUpperCase();
    }
  };

  const isLiveOrActive = (status: string) => status === 'live' || status === 'active';

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
        <Text style={styles.headerTitle}>{t('celebrity')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.tabsContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'create' && styles.tabActive]}
          onPress={() => setActiveTab('create')}
        >
          <Plus size={16} color={activeTab === 'create' ? '#188661' : '#fff'} />
          <Text style={[styles.tabText, activeTab === 'create' && styles.tabTextActive]}>
            Créer
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'events' && styles.tabActive]}
          onPress={() => setActiveTab('events')}
        >
          <Text style={[styles.tabText, activeTab === 'events' && styles.tabTextActive]}>
            Mes événements
          </Text>
          {myEvents.length > 0 && (
            <View style={styles.tabBadge}>
              <Text style={styles.tabBadgeText}>{myEvents.length}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView 
        style={styles.content} 
        contentContainerStyle={[styles.contentContainer, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]}
        showsVerticalScrollIndicator={false}
      >
        {activeTab === 'events' ? (
          <>
            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#fff" />
              </View>
            ) : myEvents.length === 0 ? (
              <View style={styles.emptyContainer}>
                <QrCode size={64} color="rgba(255,255,255,0.3)" />
                <Text style={styles.emptyTitle}>{t('noEvents') || 'Aucun événement'}</Text>
                <Text style={styles.emptySubtitle}>{t('noEventsHint') || 'Créez votre premier événement pour partager votre signature avec vos fans'}</Text>
                <TouchableOpacity
                  style={styles.createBtn}
                  onPress={() => setActiveTab('create')}
                >
                  <Plus size={20} color="#188661" />
                  <Text style={styles.createBtnText}>{t('createEvent') || 'Créer un événement'}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.eventsList}>
                {myEvents.map((event) => {
                  const isLiveVideo = event.event_type === 'live_video';
                  return (
                    <View key={event.id} style={styles.eventCard}>
                      <View style={styles.eventHeader}>
                        <View style={styles.eventTypeBadges}>
                          <View style={[
                            styles.eventTypeBadge,
                            isLiveVideo ? styles.badgeLiveVideo : styles.badgeQr
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
                            isLiveOrActive(event.status) ? styles.badgeLive : styles.badgeScheduled
                          ]}>
                            {isLiveOrActive(event.status) ? (
                              <Play size={10} color="#fff" fill="#fff" />
                            ) : (
                              <Calendar size={10} color="#fff" />
                            )}
                            <Text style={styles.eventStatusText}>{getStatusLabel(event.status)}</Text>
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
                      
                      <View style={styles.eventTime}>
                        <Clock size={14} color="rgba(255,255,255,0.6)" />
                        <Text style={styles.eventTimeText}>
                          {isLiveOrActive(event.status)
                            ? `Jusqu'à ${new Date(event.ends_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                            : `${new Date(event.starts_at).toLocaleDateString()} à ${new Date(event.starts_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                          }
                        </Text>
                      </View>

                      <View style={styles.eventCode}>
                        <Text style={styles.eventCodeLabel}>{t('code') || 'Code'}:</Text>
                        <Text style={styles.eventCodeValue}>{event.join_code}</Text>
                      </View>

                      <View style={styles.eventActions}>
                        <TouchableOpacity
                          style={styles.actionBtn}
                          onPress={() => handleShowQr(event)}
                        >
                          <QrCode size={18} color="#fff" />
                          <Text style={styles.actionBtnText}>{t('showQrCode') || 'QR Code'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.actionBtn, styles.actionBtnPrimary]}
                          onPress={() => handleContinueEvent(event)}
                        >
                          {isLiveVideo ? (
                            <Video size={18} color="#188661" />
                          ) : (
                            <Edit3 size={18} color="#188661" />
                          )}
                          <Text style={[styles.actionBtnText, styles.actionBtnTextPrimary]}>
                            {isLiveVideo ? 'Live' : (t('publish') || 'Publier')}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </>
        ) : (
          <>
            <View style={styles.iconContainer}>
              <Star size={48} color="#fff" fill="#fff" />
            </View>

            <Text style={styles.title}>{t('celebrityMenuTitle')}</Text>
            <Text style={styles.subtitle}>{t('celebrityMenuSubtitle')}</Text>

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
                value={`signtouch://join/${selectedEvent.join_code}`}
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
  eventCard: {
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
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
  eventStatusText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },
  deleteBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(239,68,68,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  eventTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  eventTime: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  eventTimeText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
  },
  eventCode: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 14,
  },
  eventCodeLabel: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
  },
  eventCodeValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#10B981',
    letterSpacing: 2,
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
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingVertical: 12,
    borderRadius: 10,
  },
  actionBtnPrimary: {
    backgroundColor: '#fff',
  },
  actionBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  actionBtnTextPrimary: {
    color: '#188661',
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
});
