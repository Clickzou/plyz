import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  Platform,
  ActivityIndicator,
  Image,
  ScrollView,
  Modal,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, QrCode, Search, Check, Download, Camera, Users, Clock, Calendar, Bell, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
let Notifications: any = null;
try {
  Notifications = require('expo-notifications');
} catch (e) {
  console.log('expo-notifications not available');
}
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import AccountModal from '@/components/AccountModal';
import { getEventByCode, LiveEvent } from '@/utils/liveEventStorage';
import { getSessionByCode, LiveSession } from '@/utils/liveSessionStorage';
import BottomNav, { BOTTOM_NAV_HEIGHT } from '@/components/BottomNav';
import { 
  joinEventSession, 
  getOrCreateDeviceId,
  EventSession,
  EventSigner,
} from '@/utils/eventSessionStorage';
import BarCodeScannerWrapper, { requestCameraPermissionAsync, isBarCodeScannerAvailable } from '@/components/BarCodeScannerWrapper';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SAVED_SIGNATURES_KEY = '@signtouch_event_signatures';

export default function JoinEventScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { user, setPostAuthRedirect } = useAuth();
  const { status } = useSubscription();
  const [showAccountModal, setShowAccountModal] = useState(false);

  const [code, setCode] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [foundEvent, setFoundEvent] = useState<LiveEvent | null>(null);
  const [foundSession, setFoundSession] = useState<EventSession | null>(null);
  const [foundLiveSession, setFoundLiveSession] = useState<LiveSession | null>(null);
  const [sessionSigners, setSessionSigners] = useState<EventSigner[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [eventFull, setEventFull] = useState(false);
  const [eventExpired, setEventExpired] = useState(false);
  const [eventScheduled, setEventScheduled] = useState(false);
  const [scheduledSession, setScheduledSession] = useState<EventSession | null>(null);
  const [notificationSet, setNotificationSet] = useState(false);

  const [showScanner, setShowScanner] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);

  useEffect(() => {
    if (params.code) {
      setCode(String(params.code));
      handleSearch(String(params.code));
    }
  }, [params.code]);

  const handleSearch = async (searchCode?: string) => {
    const codeToSearch = (searchCode || code).trim().toUpperCase();
    
    if (codeToSearch.length < 4) {
      Alert.alert(t('error') || 'Error', t('invalidCode') || 'Please enter a valid code');
      return;
    }

    setIsSearching(true);
    setEventFull(false);
    setEventExpired(false);
    setEventScheduled(false);
    setScheduledSession(null);
    setFoundEvent(null);
    setFoundSession(null);
    setFoundLiveSession(null);
    
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    try {
      // First try to find in live_sessions (new video call sessions)
      const liveSession = await getSessionByCode(codeToSearch);
      if (liveSession) {
        console.log('Found live session:', liveSession);
        setFoundLiveSession(liveSession);
        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        setIsSearching(false);
        return;
      }

      // Then try event_sessions
      const viewerId = await getOrCreateDeviceId();
      const sessionResult = await joinEventSession(codeToSearch, viewerId);
      
      if (sessionResult.allowed && sessionResult.session) {
        setFoundSession(sessionResult.session);
        setSessionSigners(sessionResult.signers || []);
        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        return;
      }
      
      if (sessionResult.reason === 'full') {
        setEventFull(true);
        return;
      }
      
      if (sessionResult.reason === 'expired') {
        setEventExpired(true);
        return;
      }

      if (sessionResult.reason === 'scheduled' && sessionResult.session) {
        setEventScheduled(true);
        setScheduledSession(sessionResult.session);
        return;
      }

      Alert.alert(
        t('eventNotFound') || 'Event Not Found',
        t('eventNotFoundMessage') || 'This event does not exist or has expired'
      );
    } catch (error) {
      console.error('Error searching event:', error);
      Alert.alert(t('error') || 'Error', t('searchFailed') || 'Failed to search for event');
    } finally {
      setIsSearching(false);
    }
  };

  const requestCameraPermission = async () => {
    if (!isBarCodeScannerAvailable()) {
      Alert.alert(
        t('notAvailable') || 'Not Available',
        t('scannerNotOnWeb') || 'QR scanner is not available on web. Please enter the code manually.'
      );
      return;
    }
    
    const granted = await requestCameraPermissionAsync();
    setHasPermission(granted);
    if (granted) {
      setShowScanner(true);
    } else {
      Alert.alert(
        t('permissionRequired') || 'Permission Required',
        t('cameraPermissionMessage') || 'Camera permission is required to scan QR codes'
      );
    }
  };

  const handleBarCodeScanned = ({ type, data }: { type: string; data: string }) => {
    setShowScanner(false);
    
    const codeMatch = data.match(/signtouch:\/\/event\/([A-Z0-9]+)/i);
    if (codeMatch) {
      const scannedCode = codeMatch[1].toUpperCase();
      setCode(scannedCode);
      handleSearch(scannedCode);
    } else {
      Alert.alert(
        t('invalidQR') || 'Invalid QR',
        t('invalidQRMessage') || 'This QR code is not valid'
      );
    }
  };

  const handleSaveSignature = async () => {
    // Vérifier si l'utilisateur est connecté et abonné
    if (!user) {
      setShowAccountModal(true);
      return;
    }
    
    if (status !== 'paid') {
      await setPostAuthRedirect('/join-event');
      router.push('/subscription');
      return;
    }
    
    if (!foundEvent?.signature_url) return;
    
    setIsSaving(true);
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    try {
      const existingData = await AsyncStorage.getItem(SAVED_SIGNATURES_KEY);
      const signatures = existingData ? JSON.parse(existingData) : [];
      
      const newSignature = {
        id: `sig_${Date.now()}`,
        eventName: foundEvent.name,
        signatureUrl: foundEvent.signature_url,
        savedAt: new Date().toISOString(),
      };
      
      signatures.unshift(newSignature);
      await AsyncStorage.setItem(SAVED_SIGNATURES_KEY, JSON.stringify(signatures.slice(0, 50)));
      
      setSaved(true);
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error) {
      console.error('Error saving signature:', error);
      Alert.alert(t('error') || 'Error', t('saveFailed') || 'Failed to save signature');
    } finally {
      setIsSaving(false);
    }
  };

  const goToGallery = () => {
    if (foundSession) {
      router.push({
        pathname: '/event-gallery',
        params: {
          sessionId: foundSession.id,
          sessionTitle: foundSession.title,
          joinCode: foundSession.join_code,
          endsAt: foundSession.ends_at,
          signers: JSON.stringify(sessionSigners),
        }
      });
    }
  };

  const handleSearchAnother = () => {
    setFoundEvent(null);
    setFoundSession(null);
    setFoundLiveSession(null);
    setCode('');
    setSaved(false);
    setEventFull(false);
    setEventExpired(false);
    setEventScheduled(false);
    setScheduledSession(null);
    setNotificationSet(false);
  };

  const handleSetNotification = async () => {
    if (!scheduledSession) return;
    
    if (!Notifications) {
      Alert.alert(
        t('notAvailable') || 'Not Available',
        t('notificationsNotSupported') || 'Notifications are not supported in this environment'
      );
      return;
    }

    try {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          t('permissionRequired') || 'Permission Required',
          t('notificationPermissionMessage') || 'Please enable notifications to receive reminders'
        );
        return;
      }

      const startTime = new Date(scheduledSession.starts_at).getTime();
      const notifyTime = startTime - 2 * 60 * 1000;
      const now = Date.now();

      if (notifyTime <= now) {
        Alert.alert(
          t('eventStartingSoon') || 'Event Starting Soon',
          t('eventStartsSoon') || 'The event starts in less than 2 minutes!'
        );
        return;
      }

      await Notifications.scheduleNotificationAsync({
        content: {
          title: scheduledSession.title,
          body: t('eventStartsIn2Min') || 'The event starts in 2 minutes! Join now.',
          data: { joinCode: scheduledSession.join_code },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(notifyTime),
        },
      });

      setNotificationSet(true);
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error) {
      console.error('Error setting notification:', error);
      Alert.alert(t('error') || 'Error', t('notificationFailed') || 'Failed to set notification');
    }
  };

  if (showScanner) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <LinearGradient colors={['#1a1a2e', '#16213e', '#0f3460']} style={StyleSheet.absoluteFill} />
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => setShowScanner(false)}>
            <ArrowLeft size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('scan') || 'Scan'}</Text>
          <View style={{ width: 44 }} />
        </View>
        <View style={styles.scannerContainer}>
          <BarCodeScannerWrapper
            onBarCodeScanned={handleBarCodeScanned}
            style={StyleSheet.absoluteFillObject}
          />
          <View style={styles.scannerOverlay}>
            <View style={styles.scannerFrame} />
            <Text style={styles.scannerHint}>{t('scanQRHint') || 'Point at the QR code'}</Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient colors={['#1a1a2e', '#16213e', '#0f3460']} style={StyleSheet.absoluteFill} />
      
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton} 
          onPress={() => {
            if (foundLiveSession) {
              setFoundLiveSession(null);
              setCode('');
            } else {
              router.back();
            }
          }}
        >
          <ArrowLeft size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('liveEvents') || 'Live Events'}</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView 
        style={styles.content}
        contentContainerStyle={[
          styles.contentContainer, 
          { paddingBottom: BOTTOM_NAV_HEIGHT + 20 },
          foundLiveSession && styles.contentContainerCompact
        ]}
        showsVerticalScrollIndicator={false}
      >
        {foundLiveSession ? (
          <View style={styles.liveSessionContainer}>
            <View style={styles.liveSessionHeader}>
              <View style={styles.liveBadge}>
                <View style={styles.liveIndicator} />
                <Text style={styles.liveBadgeText}>LIVE</Text>
              </View>
            </View>
            
            <View style={styles.celebritySection}>
              <View style={styles.celebrityAvatarContainer}>
                {foundLiveSession.cover_photo_url ? (
                  <Image 
                    source={{ uri: foundLiveSession.cover_photo_url }} 
                    style={styles.celebrityCoverPhoto} 
                  />
                ) : (
                  <LinearGradient
                    colors={['#10B981', '#059669', '#047857']}
                    style={styles.celebrityAvatarGradient}
                  >
                    <Text style={styles.celebrityInitial}>
                      {foundLiveSession.celebrity_name.charAt(0).toUpperCase()}
                    </Text>
                  </LinearGradient>
                )}
              </View>
              <Text style={styles.celebrityNameLarge}>{foundLiveSession.celebrity_name}</Text>
              <Text style={styles.sessionFoundText}>
                {t('liveSessionFound') || 'Live session found!'}
              </Text>
            </View>

            <View style={styles.priceContainer}>
              <Text style={styles.priceLabelText}>{t('sessionPrice') || 'Session price'}</Text>
              <Text style={styles.priceValueText}>
                {foundLiveSession.price_cents > 0 
                  ? `${(foundLiveSession.price_cents / 100).toFixed(2)} €` 
                  : t('free') || 'Free'}
              </Text>
            </View>

            {foundLiveSession.room_url ? (
              <View style={styles.readyToJoinContainer}>
                <View style={styles.readyBadge}>
                  <Check size={20} color="#10B981" />
                  <Text style={styles.readyBadgeText}>{t('callReady') || 'Call is ready!'}</Text>
                </View>
                <TouchableOpacity
                  style={styles.joinCallButton}
                  onPress={() => {
                    router.push({
                      pathname: '/video-call',
                      params: {
                        roomUrl: foundLiveSession.room_url || '',
                        sessionId: foundLiveSession.id,
                        isHost: 'false',
                        userName: 'Fan',
                      }
                    });
                  }}
                >
                  <LinearGradient
                    colors={['#10B981', '#059669']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.joinCallButtonGradient}
                  >
                    <Camera size={24} color="#fff" />
                    <Text style={styles.joinCallButtonText}>{t('joinVideoCall') || 'Join Video Call'}</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.waitingSection}>
                <View style={styles.pulseContainer}>
                  <View style={styles.pulseOuter} />
                  <View style={styles.pulseInner}>
                    <Clock size={32} color="#fff" />
                  </View>
                </View>
                <Text style={styles.waitingTitle}>
                  {t('getReady') || 'Get ready!'}
                </Text>
                <Text style={styles.waitingSubtitle}>
                  {t('waitingForCelebrityToConnect') || `Please wait, ${foundLiveSession.celebrity_name} is connecting...`}
                </Text>
                <Text style={styles.waitingHint}>
                  {t('stayOnPage') || 'Stay on this page - the call will start soon!'}
                </Text>
                
                <View style={styles.waitTimeCard}>
                  <Clock size={18} color="#f59e0b" />
                  <Text style={styles.waitTimeText}>
                    {t('estimatedWait') || 'Estimated wait'}: ~{foundLiveSession.duration_per_fan_minutes || 5} min
                  </Text>
                </View>
                
                <TouchableOpacity
                  style={styles.refreshButtonLarge}
                  onPress={() => handleSearch(foundLiveSession.code)}
                >
                  <Search size={20} color="#10B981" />
                  <Text style={styles.refreshButtonLargeText}>{t('checkAgain') || 'Check again'}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.leaveNotifyButton}
                  onPress={handleSetNotification}
                >
                  <Bell size={18} color="#3b82f6" />
                  <Text style={styles.leaveNotifyText}>
                    {t('leaveAndNotify') || 'Leave app & get notified 2 min before'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
            
          </View>
        ) : !foundEvent && !foundSession && !eventFull ? (
          <>
            <View style={styles.inputSection}>
              <Text style={styles.inputLabel}>{t('enterEventCode') || 'Enter the event code'}</Text>
              <TextInput
                style={styles.codeInputFull}
                placeholder="ABC123"
                placeholderTextColor="rgba(255,255,255,0.3)"
                value={code}
                onChangeText={(text) => setCode(text.toUpperCase())}
                autoCapitalize="characters"
                maxLength={6}
              />
              <TouchableOpacity
                style={[styles.searchButtonFull, isSearching && styles.searchButtonDisabled]}
                onPress={() => handleSearch()}
                disabled={isSearching}
              >
                {isSearching ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Search size={22} color="#fff" />
                    <Text style={styles.searchButtonText}>{t('search') || 'Search'}</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            <View style={styles.orDivider}>
              <View style={styles.dividerLine} />
              <Text style={styles.orText}>{t('or') || 'or'}</Text>
              <View style={styles.dividerLine} />
            </View>

            <TouchableOpacity style={styles.scanButton} onPress={requestCameraPermission}>
              <QrCode size={28} color="#10B981" />
              <Text style={styles.scanButtonText}>{t('scan') || 'Scan QR Code'}</Text>
            </TouchableOpacity>
          </>
        ) : eventFull ? (
          <View style={styles.resultContainer}>
            <View style={styles.fullIcon}>
              <Users size={40} color="#ef4444" />
            </View>
            <Text style={styles.fullTitle}>{t('eventFull') || 'Event Full'}</Text>
            <Text style={styles.fullMessage}>
              {t('eventFullMessage') || 'This event has reached its viewer limit. Please try again later.'}
            </Text>
            <TouchableOpacity style={styles.retryButton} onPress={() => handleSearch()}>
              <Text style={styles.retryButtonText}>{t('retry') || 'Retry'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.searchAnotherButton} onPress={handleSearchAnother}>
              <Text style={styles.searchAnotherText}>{t('searchAnother') || 'Search another event'}</Text>
            </TouchableOpacity>
          </View>
        ) : eventExpired ? (
          <View style={styles.resultContainer}>
            <View style={styles.fullIcon}>
              <Clock size={40} color="#f59e0b" />
            </View>
            <Text style={styles.expiredTitle}>{t('eventExpired') || 'Event Expired'}</Text>
            <Text style={styles.fullMessage}>
              {t('eventExpiredMessage') || 'This event has ended. Check with the organizer for future events.'}
            </Text>
            <TouchableOpacity style={styles.searchAnotherButton} onPress={handleSearchAnother}>
              <Text style={styles.searchAnotherText}>{t('searchAnother') || 'Search another event'}</Text>
            </TouchableOpacity>
          </View>
        ) : eventScheduled && scheduledSession ? (
          <View style={styles.resultContainer}>
            <View style={styles.scheduledIcon}>
              <Calendar size={40} color="#3b82f6" />
            </View>
            <Text style={styles.scheduledTitle}>{scheduledSession.title}</Text>
            <Text style={styles.scheduledMessage}>
              {t('eventScheduledMessage') || 'This event has not started yet.'}
            </Text>
            <View style={styles.scheduledDateCard}>
              <Calendar size={20} color="#3b82f6" />
              <View style={styles.scheduledDateInfo}>
                <Text style={styles.scheduledDateLabel}>{t('startsAt') || 'Starts at'}</Text>
                <Text style={styles.scheduledDateValue}>
                  {new Date(scheduledSession.starts_at).toLocaleDateString()} {t('at') || 'at'} {new Date(scheduledSession.starts_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
            </View>
            {!notificationSet ? (
              <TouchableOpacity style={styles.notifyButton} onPress={handleSetNotification}>
                <Bell size={20} color="#fff" />
                <Text style={styles.notifyButtonText}>{t('notifyMe') || 'Notify me 2 min before'}</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.notificationSetCard}>
                <Check size={20} color="#10B981" />
                <Text style={styles.notificationSetText}>{t('notificationSet') || 'Notification scheduled!'}</Text>
              </View>
            )}
            <TouchableOpacity style={styles.searchAnotherButton} onPress={handleSearchAnother}>
              <Text style={styles.searchAnotherText}>{t('searchAnother') || 'Search another event'}</Text>
            </TouchableOpacity>
          </View>
        ) : foundSession ? (
          <View style={styles.resultContainer}>
            <View style={styles.successIcon}>
              <Check size={40} color="#10B981" />
            </View>
            <Text style={styles.foundTitle}>{foundSession.title}</Text>
            
            <View style={styles.sessionInfo}>
              <View style={styles.sessionInfoItem}>
                <Users size={18} color="#10B981" />
                <Text style={styles.sessionInfoText}>{sessionSigners.length} {t('celebrities') || 'celebrities'}</Text>
              </View>
              <View style={styles.sessionInfoItem}>
                <Clock size={18} color="#f59e0b" />
                <Text style={styles.sessionInfoText}>
                  {t('until') || 'Until'} {new Date(foundSession.ends_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
            </View>

            {sessionSigners.length > 0 && (
              <View style={styles.signersPreview}>
                {sessionSigners.slice(0, 3).map((signer) => (
                  <View key={signer.id} style={styles.signerChip}>
                    <Text style={styles.signerChipText}>{signer.display_name}</Text>
                  </View>
                ))}
                {sessionSigners.length > 3 && (
                  <View style={styles.signerChip}>
                    <Text style={styles.signerChipText}>+{sessionSigners.length - 3}</Text>
                  </View>
                )}
              </View>
            )}

            <TouchableOpacity style={styles.joinButton} onPress={goToGallery}>
              <Text style={styles.joinButtonText}>{t('liveSessionJoin') || 'Join Event'}</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.searchAnotherButton} onPress={handleSearchAnother}>
              <Text style={styles.searchAnotherText}>{t('searchAnother') || 'Search another event'}</Text>
            </TouchableOpacity>
          </View>
        ) : foundEvent ? (
          <View style={styles.resultContainer}>
            <View style={styles.successIcon}>
              <Check size={40} color="#10B981" />
            </View>
            <Text style={styles.foundTitle}>{t('signatureFound') || 'Signature Found!'}</Text>
            <Text style={styles.eventName}>{foundEvent.name}</Text>

            {foundEvent.signature_url && (
              <View style={styles.signaturePreview}>
                <Image source={{ uri: foundEvent.signature_url }} style={styles.signatureImage} resizeMode="contain" />
              </View>
            )}

            <View style={styles.actionButtons}>
              <TouchableOpacity
                style={[styles.saveButton, saved && styles.savedButton]}
                onPress={handleSaveSignature}
                disabled={isSaving || saved}
              >
                {isSaving ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : saved ? (
                  <>
                    <Check size={20} color="#fff" />
                    <Text style={styles.saveButtonText}>{t('done') || 'Saved'}</Text>
                  </>
                ) : (
                  <>
                    <Download size={20} color="#fff" />
                    <Text style={styles.saveButtonText}>{t('saveSignature') || 'Save'}</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.searchAnotherButton} onPress={handleSearchAnother}>
              <Text style={styles.searchAnotherText}>{t('searchAnother') || 'Search another event'}</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </ScrollView>

      <AccountModal
        visible={showAccountModal}
        onClose={() => setShowAccountModal(false)}
        onSkip={() => setShowAccountModal(false)}
        returnPath="/join-event"
      />
      
      <BottomNav />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  contentContainerCompact: {
    paddingTop: 0,
    paddingHorizontal: 12,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: '600', color: '#fff' },
  content: { flex: 1 },
  contentContainer: { padding: 20 },
  inputSection: { marginBottom: 24 },
  inputLabel: { fontSize: 16, color: 'rgba(255,255,255,0.8)', marginBottom: 12, textAlign: 'center' },
  inputRow: { flexDirection: 'row', gap: 12 },
  codeInput: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 16,
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    letterSpacing: 4,
  },
  searchButton: {
    width: 60,
    height: 60,
    borderRadius: 16,
    backgroundColor: '#10B981',
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchButtonDisabled: { opacity: 0.7 },
  codeInputFull: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 16,
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    letterSpacing: 4,
    marginBottom: 16,
  },
  searchButtonFull: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#10B981',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  searchButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  orDivider: { flexDirection: 'row', alignItems: 'center', marginVertical: 24 },
  dividerLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.2)' },
  orText: { marginHorizontal: 16, color: 'rgba(255,255,255,0.5)', fontSize: 14 },
  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: 'rgba(16,185,129,0.2)',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.3)',
  },
  scanButtonText: { fontSize: 16, color: '#10B981', fontWeight: '600' },
  scannerContainer: { flex: 1 },
  scannerOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center' },
  scannerFrame: { width: 250, height: 250, borderWidth: 2, borderColor: '#10B981', borderRadius: 20 },
  scannerHint: { marginTop: 20, color: '#fff', fontSize: 16 },
  resultContainer: { alignItems: 'center', paddingTop: 40 },
  successIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(16,185,129,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  fullIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(239,68,68,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  foundTitle: { fontSize: 24, fontWeight: '700', color: '#fff', marginBottom: 8 },
  fullTitle: { fontSize: 24, fontWeight: '700', color: '#ef4444', marginBottom: 12 },
  expiredTitle: { fontSize: 24, fontWeight: '700', color: '#f59e0b', marginBottom: 12 },
  scheduledIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(59,130,246,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  scheduledTitle: { fontSize: 24, fontWeight: '700', color: '#3b82f6', marginBottom: 12 },
  scheduledMessage: { fontSize: 16, color: 'rgba(255,255,255,0.7)', textAlign: 'center', marginBottom: 20 },
  scheduledDateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(59,130,246,0.15)',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 12,
    marginBottom: 20,
    gap: 12,
  },
  scheduledDateInfo: {
    flex: 1,
  },
  scheduledDateLabel: { fontSize: 13, color: 'rgba(255,255,255,0.6)' },
  scheduledDateValue: { fontSize: 18, fontWeight: '700', color: '#3b82f6' },
  notifyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#3b82f6',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    marginBottom: 16,
  },
  notifyButtonText: { fontSize: 16, fontWeight: '600', color: '#fff' },
  notificationSetCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(16,185,129,0.15)',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    marginBottom: 16,
  },
  notificationSetText: { fontSize: 16, fontWeight: '600', color: '#10B981' },
  fullMessage: { fontSize: 16, color: 'rgba(255,255,255,0.7)', textAlign: 'center', marginBottom: 24, paddingHorizontal: 20 },
  eventName: { fontSize: 18, color: 'rgba(255,255,255,0.7)', marginBottom: 24 },
  sessionInfo: { flexDirection: 'row', gap: 20, marginBottom: 16 },
  sessionInfoItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sessionInfoText: { fontSize: 14, color: 'rgba(255,255,255,0.7)' },
  signersPreview: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24, justifyContent: 'center' },
  signerChip: {
    backgroundColor: 'rgba(16,185,129,0.2)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
  },
  signerChipText: { fontSize: 14, color: '#10B981', fontWeight: '500' },
  signaturePreview: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    width: '100%',
    aspectRatio: 2,
  },
  signatureImage: { width: '100%', height: '100%' },
  actionButtons: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#10B981',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 16,
  },
  savedButton: { backgroundColor: '#059669' },
  saveButtonText: { fontSize: 16, color: '#fff', fontWeight: '600' },
  joinButton: {
    backgroundColor: '#10B981',
    paddingHorizontal: 48,
    paddingVertical: 16,
    borderRadius: 16,
    marginBottom: 16,
  },
  joinButtonText: { fontSize: 18, color: '#fff', fontWeight: '600' },
  retryButton: {
    backgroundColor: '#10B981',
    paddingHorizontal: 48,
    paddingVertical: 16,
    borderRadius: 16,
    marginBottom: 16,
  },
  retryButtonText: { fontSize: 16, color: '#fff', fontWeight: '600' },
  searchAnotherButton: { paddingVertical: 12 },
  searchAnotherText: { fontSize: 14, color: 'rgba(255,255,255,0.6)' },
  waitingContainer: {
    alignItems: 'center',
    marginVertical: 20,
  },
  waitingText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 16,
  },
  refreshButton: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#10B981',
  },
  refreshButtonText: {
    fontSize: 14,
    color: '#10B981',
    fontWeight: '600',
  },
  liveSessionContainer: {
    alignItems: 'center',
    paddingTop: 8,
    paddingHorizontal: 16,
  },
  liveSessionHeader: {
    alignItems: 'center',
    marginBottom: 16,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 8,
  },
  liveIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#ef4444',
  },
  liveBadgeText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ef4444',
    letterSpacing: 1,
  },
  celebritySection: {
    alignItems: 'center',
    marginBottom: 16,
  },
  celebrityAvatarContainer: {
    marginBottom: 12,
  },
  celebrityAvatarGradient: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#10B981',
  },
  celebrityCoverPhoto: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    borderColor: '#10B981',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  celebrityInitial: {
    fontSize: 48,
    fontWeight: '700',
    color: '#fff',
  },
  celebrityNameLarge: {
    fontSize: 32,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 8,
    textShadowColor: 'rgba(16, 185, 129, 0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
  },
  sessionFoundText: {
    fontSize: 16,
    color: '#10B981',
    fontWeight: '600',
  },
  priceContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 32,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  priceLabelText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    marginBottom: 4,
  },
  priceValueText: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
  },
  readyToJoinContainer: {
    alignItems: 'center',
    width: '100%',
  },
  readyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    gap: 8,
    marginBottom: 20,
  },
  readyBadgeText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#10B981',
  },
  joinCallButton: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
  },
  joinCallButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    paddingHorizontal: 32,
    gap: 12,
  },
  joinCallButtonText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  waitingSection: {
    alignItems: 'center',
    width: '100%',
    paddingVertical: 8,
  },
  pulseContainer: {
    width: 80,
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  pulseOuter: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
  },
  pulseInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(16, 185, 129, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  waitingTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 8,
  },
  waitingSubtitle: {
    fontSize: 14,
    color: '#fff',
    textAlign: 'center',
    marginBottom: 4,
    paddingHorizontal: 16,
  },
  waitingHint: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.6)',
    textAlign: 'center',
    marginBottom: 12,
    fontStyle: 'italic',
  },
  refreshButtonLarge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#10B981',
    gap: 10,
  },
  refreshButtonLargeText: {
    fontSize: 16,
    color: '#10B981',
    fontWeight: '700',
  },
  searchAnotherButtonAlt: {
    paddingVertical: 16,
    marginTop: 16,
  },
  searchAnotherTextAlt: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.5)',
  },
  waitTimeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 10,
    marginBottom: 20,
  },
  waitTimeText: {
    fontSize: 14,
    color: '#f59e0b',
    fontWeight: '600',
  },
  leaveNotifyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 10,
    marginTop: 12,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
  },
  leaveNotifyText: {
    fontSize: 14,
    color: '#3b82f6',
    fontWeight: '600',
    textAlign: 'center',
  },
});
