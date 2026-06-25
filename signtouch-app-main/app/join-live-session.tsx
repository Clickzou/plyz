import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Image,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { showAlert } from '@/utils/alertHelper';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowLeft,
  Camera,
  Send,
  Clock,
  Check,
  QrCode,
  Users,
  Tag,
  Calendar,
  Video,
} from 'lucide-react-native';
import BarCodeScannerWrapper, { requestCameraPermissionAsync, isBarCodeScannerAvailable } from '@/components/BarCodeScannerWrapper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { RealtimeChannel } from '@supabase/supabase-js';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  LiveSession,
  QueueEntry,
  getSessionByCode,
  joinSessionQueue,
  uploadFanPhoto,
  subscribeToSession,
  subscribeToQueueEntry,
} from '@/utils/liveSessionStorage';
import { saveActiveFanEvent } from '@/utils/eventSessionStorage';

export default function JoinLiveSessionScreen() {
  const router = useRouter();
  const { code: paramCode } = useLocalSearchParams<{ code?: string }>();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();

  const [code, setCode] = useState(paramCode || '');
  const [session, setSession] = useState<LiveSession | null>(null);
  const [step, setStep] = useState<'code' | 'scheduled' | 'upload' | 'queue' | 'signing'>('code');
  const [isReserving, setIsReserving] = useState(false);
  const [reservationDone, setReservationDone] = useState(false);
  const [fanName, setFanName] = useState('');
  const [message, setMessage] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [queueEntry, setQueueEntry] = useState<QueueEntry | null>(null);
  const [queuePosition, setQueuePosition] = useState(0);
  const [showScanner, setShowScanner] = useState(false);
  const [, setHasPermission] = useState<boolean | null>(null);

  const fanId = useMemo(() => `fan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, []);
  const sessionChannelRef = useRef<RealtimeChannel | null>(null);
  const queueChannelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    return () => {
      if (sessionChannelRef.current) {
        sessionChannelRef.current.unsubscribe();
      }
      if (queueChannelRef.current) {
        queueChannelRef.current.unsubscribe();
      }
    };
  }, []);

  useEffect(() => {
    if (paramCode) {
      handleJoinWithCode(paramCode);
    }
  }, [paramCode]);

  const handleJoinWithCode = async (inputCode: string) => {
    if (inputCode.length !== 6) {
      showAlert(t('error'), t('liveSessionInvalidCode'));
      return;
    }

    setIsLoading(true);
    try {
      const s = await getSessionByCode(inputCode.toUpperCase());
      if (!s) {
        showAlert(t('error'), t('liveSessionNotFound'));
        setIsLoading(false);
        return;
      }

      if (s.status === 'ended') {
        showAlert(t('error'), t('liveSessionHasEnded'));
        setIsLoading(false);
        return;
      }

      if (s.slots_used >= s.max_slots) {
        showAlert(t('error'), t('liveSessionFull'));
        setIsLoading(false);
        return;
      }

      setSession(s);

      const isScheduled =
        s.status === 'scheduled' ||
        (!!s.scheduled_at && new Date(s.scheduled_at) > new Date());

      if (isScheduled) {
        setStep('scheduled');
      } else {
        setStep('upload');
      }

      sessionChannelRef.current = subscribeToSession(s.id, (updated) => {
        setSession(updated);
        if (updated.status === 'ended') {
          showAlert(t('info'), t('liveSessionHasEnded'));
        }
      });
    } catch (error) {
      console.error('Error joining session:', error);
      showAlert(t('error'), t('liveSessionJoinError'));
    } finally {
      setIsLoading(false);
    }
  };

  const requestCameraPermission = async () => {
    if (Platform.OS === 'web' || !isBarCodeScannerAvailable()) {
      showAlert(
        'Info', 
        'Le scan QR n\'est pas disponible sur le navigateur web. Entrez le code manuellement ci-dessus.'
      );
      return;
    }

    const granted = await requestCameraPermissionAsync();
    setHasPermission(granted);
    if (granted) {
      setShowScanner(true);
    } else {
      showAlert(t('permissionDenied') || 'Permission Denied', t('cameraPermissionNeeded') || 'Camera permission is needed to scan QR codes.');
    }
  };

  const handleBarCodeScanned = ({ type, data }: { type: string; data: string }) => {
    setShowScanner(false);
    let scannedCode = data;
    if (data.includes('code=')) {
      const match = data.match(/code=([A-Z0-9]+)/i);
      if (match) {
        scannedCode = match[1].toUpperCase();
      }
    } else if (data.length === 6 && /^[A-Z0-9]+$/i.test(data)) {
      scannedCode = data.toUpperCase();
    }
    
    if (scannedCode && scannedCode.length >= 4 && scannedCode.length <= 6) {
      setCode(scannedCode);
      handleJoinWithCode(scannedCode);
    } else {
      showAlert(t('error') || 'Error', t('invalidQRCode') || 'Invalid QR code');
    }
  };

  const handlePickPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
    }
  };

  const handleTakePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      showAlert(t('error'), t('cameraPermissionDenied'));
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: false,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
    }
  };

  const handleJoinQueue = async () => {
    if (!session) return;

    setIsLoading(true);
    try {
      let photoUrl: string | null = null;
      if (photoUri) {
        photoUrl = await uploadFanPhoto(session.id, fanId, photoUri);
      }

      const entry = await joinSessionQueue(
        session.id,
        fanId,
        fanName.trim() || '',
        photoUrl,
        message.trim() || ''
      );

      if (!entry) {
        showAlert(t('error'), t('liveSessionJoinError'));
        setIsLoading(false);
        return;
      }

      setQueueEntry(entry);
      setQueuePosition(entry.position);
      setStep('queue');

      queueChannelRef.current = subscribeToQueueEntry(entry.id, (updated) => {
        setQueueEntry(updated);
        if (updated.status === 'current' || updated.status === 'signing') {
          setStep('signing');
        } else if (updated.status === 'completed') {
          router.replace({
            pathname: '/live-signature-result',
            params: { entryId: updated.id },
          });
        }
      });
    } catch (error) {
      console.error('Error joining queue:', error);
      showAlert(t('error'), t('liveSessionJoinError'));
    } finally {
      setIsLoading(false);
    }
  };

  const formatScheduledDate = (iso?: string | null): string => {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleString('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  };

  const formatPrice = (cents?: number | null, currency?: string | null): string => {
    if (!cents || cents <= 0) return t('free') || 'Gratuit';
    const value = (cents / 100).toFixed(2).replace('.', ',');
    const symbol = (currency || 'eur').toLowerCase() === 'usd' ? '$' : '€';
    return `${value} ${symbol}`;
  };

  const formatPerFanDuration = (minutes?: number | null): string => {
    if (!minutes || minutes <= 0) return '';
    if (minutes < 1) {
      const seconds = Math.round(minutes * 60);
      return `${seconds} sec`;
    }
    return `${Math.round(minutes)} min`;
  };

  const handleReserve = async () => {
    if (!session) return;
    setIsReserving(true);
    try {
      let endsAt = session.ends_at;
      if (!endsAt) {
        const base = session.scheduled_at ? new Date(session.scheduled_at) : new Date();
        endsAt = new Date(base.getTime() + (session.duration_minutes || 30) * 60 * 1000).toISOString();
      }

      await saveActiveFanEvent({
        sessionId: session.id,
        sessionTitle: session.celebrity_name,
        joinCode: session.code,
        endsAt,
        signers: '[]',
        savedAt: Date.now(),
        starts_at: session.scheduled_at || undefined,
        event_type: 'live_video',
      });

      setReservationDone(true);
      showAlert(t('success') || 'OK', t('eventReservedMessage'));
    } catch (error) {
      console.error('Error reserving event:', error);
      showAlert(t('error'), t('reservationFailed'));
    } finally {
      setIsReserving(false);
    }
  };

  const renderScheduledStep = () => {
    const spotsLeft =
      session && session.max_slots > 0
        ? Math.max(0, session.max_slots - (session.slots_used || 0))
        : 0;
    const perFanDuration = formatPerFanDuration(session?.duration_per_fan_minutes);

    return (
      <ScrollView
        style={styles.stepContainer}
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Cover photo / fallback */}
        {session?.cover_photo_url ? (
          <Image
            source={{ uri: session.cover_photo_url }}
            style={styles.coverPhoto}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.coverFallback}>
            <Video size={64} color="#fff" />
          </View>
        )}

        {/* Celebrity name + badge */}
        <Text style={[styles.title, { marginTop: 20 }]}>{session?.celebrity_name}</Text>

        <View style={styles.liveBadge}>
          <Video size={14} color="#fff" />
          <Text style={styles.liveBadgeText}>
            {t('eventTypeLiveVideo' as any) || 'Live vidéo'}
          </Text>
        </View>

        {/* Info cards */}
        <View style={styles.infoCardsContainer}>
          <View style={styles.infoCard}>
            <View style={styles.infoIconCircle}>
              <Calendar size={20} color="#818cf8" />
            </View>
            <View style={styles.infoTextContainer}>
              <Text style={styles.infoLabel}>{t('sessionDateTime') || 'Date et heure'}</Text>
              <Text style={styles.infoValue}>{formatScheduledDate(session?.scheduled_at)}</Text>
            </View>
          </View>

          <View style={styles.infoCard}>
            <View style={styles.infoIconCircle}>
              <Tag size={20} color="#818cf8" />
            </View>
            <View style={styles.infoTextContainer}>
              <Text style={styles.infoLabel}>{t('pricePerFan') || 'Tarif par fan'}</Text>
              <Text style={styles.infoValue}>
                {formatPrice(session?.price_cents, session?.currency)}
              </Text>
            </View>
          </View>

          {!!perFanDuration && (
            <View style={styles.infoCard}>
              <View style={styles.infoIconCircle}>
                <Clock size={20} color="#818cf8" />
              </View>
              <View style={styles.infoTextContainer}>
                <Text style={styles.infoLabel}>
                  {t('liveSessionDurationPerFan') || 'Durée par fan'}
                </Text>
                <Text style={styles.infoValue}>{perFanDuration}</Text>
              </View>
            </View>
          )}

          {!!session?.max_slots && (
            <View style={styles.infoCard}>
              <View style={styles.infoIconCircle}>
                <Users size={20} color="#818cf8" />
              </View>
              <View style={styles.infoTextContainer}>
                <Text style={styles.infoLabel}>{t('slots') || 'Places'}</Text>
                <Text style={styles.infoValue}>
                  {spotsLeft} / {session.max_slots}
                  {'  '}
                  <Text style={styles.infoValueMuted}>
                    {t('spotsRemaining') || 'places restantes'}
                  </Text>
                </Text>
              </View>
            </View>
          )}
        </View>

        {reservationDone ? (
          <View style={{ alignItems: 'center' }}>
            <View style={[styles.signingIconContainer, { marginTop: 12 }]}>
              <Check size={60} color="#4ade80" />
            </View>
            <Text style={styles.subtitle}>{t('eventReservedMessage')}</Text>
            <TouchableOpacity style={styles.primaryButton} onPress={() => router.back()}>
              <Text style={styles.primaryButtonText}>{t('back') || 'Retour'}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.primaryButton, { marginTop: 24 }, isReserving && styles.buttonDisabled]}
            onPress={handleReserve}
            disabled={isReserving}
          >
            {isReserving ? (
              <ActivityIndicator color="#6366f1" />
            ) : (
              <Text style={styles.primaryButtonText}>{t('reserveEvent')}</Text>
            )}
          </TouchableOpacity>
        )}
      </ScrollView>
    );
  };

  const renderCodeStep = () => (
    <ScrollView style={styles.stepContainer} contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
      <View style={styles.howItWorksSection}>
        <Text style={styles.howItWorksTitle}>{t('howItWorksTitle') || 'How does it work?'}</Text>
        <View style={styles.howItWorksSteps}>
          <View style={styles.howItWorksStep}>
            <View style={styles.stepNumber}><Text style={styles.stepNumberText}>1</Text></View>
            <Text style={styles.stepText}>{t('howItWorksStep1') || 'Enter the code shared by the celebrity'}</Text>
          </View>
          <View style={styles.howItWorksStep}>
            <View style={styles.stepNumber}><Text style={styles.stepNumberText}>2</Text></View>
            <Text style={styles.stepText}>{t('howItWorksStep2') || 'Join the queue and wait for your turn'}</Text>
          </View>
          <View style={styles.howItWorksStep}>
            <View style={styles.stepNumber}><Text style={styles.stepNumberText}>3</Text></View>
            <Text style={styles.stepText}>{t('howItWorksStep3') || 'Video call with the celebrity when called'}</Text>
          </View>
          <View style={styles.howItWorksStep}>
            <View style={styles.stepNumber}><Text style={styles.stepNumberText}>4</Text></View>
            <Text style={styles.stepText}>{t('howItWorksStep4') || 'Rate each other after the call'}</Text>
          </View>
        </View>
      </View>

      <Text style={styles.inputLabel}>{t('liveSessionJoinSubtitle')}</Text>

      <TextInput
        style={styles.codeInput}
        placeholder="ABC123"
        placeholderTextColor="rgba(255,255,255,0.4)"
        value={code}
        onChangeText={(text) => setCode(text.toUpperCase())}
        maxLength={6}
        autoCapitalize="characters"
      />

      <TouchableOpacity
        style={[styles.searchButton, isLoading && styles.buttonDisabled]}
        onPress={() => handleJoinWithCode(code)}
        disabled={isLoading || code.length !== 6}
      >
        {isLoading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Text style={styles.searchButtonText}>{t('search') || 'Rechercher'}</Text>
          </>
        )}
      </TouchableOpacity>

      <View style={styles.orDivider}>
        <View style={styles.dividerLine} />
        <Text style={styles.orText}>{t('or') || 'ou'}</Text>
        <View style={styles.dividerLine} />
      </View>

      <TouchableOpacity style={styles.scanButton} onPress={requestCameraPermission}>
        <QrCode size={28} color="#818cf8" />
        <Text style={styles.scanButtonText}>{t('scan') || 'Scanner'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  const renderUploadStep = () => (
    <View style={[styles.stepContainer, { justifyContent: 'center' }]}>
      <Text style={styles.title}>{session?.celebrity_name}</Text>
      <Text style={styles.subtitle}>{t('liveSessionUploadHint')}</Text>

      <TouchableOpacity
        style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
        onPress={handleJoinQueue}
        disabled={isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color="#6366f1" />
        ) : (
          <>
            <Send size={20} color="#6366f1" />
            <Text style={styles.primaryButtonText}>{t('liveSessionJoinQueue')}</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );

  const renderQueueStep = () => (
    <View style={styles.stepContainer}>
      <View style={styles.queueIconContainer}>
        <Clock size={60} color="#fff" />
      </View>

      <Text style={styles.title}>{t('liveSessionInQueue')}</Text>
      <Text style={styles.queuePosition}>#{queueEntry?.position || queuePosition}</Text>
      <Text style={styles.subtitle}>{t('liveSessionWaitingHint')}</Text>

      <View style={styles.waitingAnimation}>
        <ActivityIndicator size="large" color="#fff" />
      </View>

      <Text style={styles.waitingNote}>{t('liveSessionDontLeave')}</Text>
    </View>
  );

  const renderSigningStep = () => (
    <View style={styles.stepContainer}>
      <View style={styles.signingIconContainer}>
        <Check size={60} color="#4ade80" />
      </View>

      <Text style={styles.title}>{t('liveSessionYourTurn')}</Text>
      <Text style={styles.subtitle}>{t('liveSessionSigningNow')}</Text>

      <View style={styles.waitingAnimation}>
        <ActivityIndicator size="large" color="#4ade80" />
      </View>

      <Text style={styles.waitingNote}>{t('liveSessionWatchSignature')}</Text>
    </View>
  );

  if (showScanner) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <LinearGradient colors={['#6366f1', '#4f46e5']} style={StyleSheet.absoluteFill} />
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => setShowScanner(false)}>
            <ArrowLeft size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('scanQRCode') || 'Scanner QR Code'}</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.scannerContainer}>
          <BarCodeScannerWrapper
            onBarCodeScanned={handleBarCodeScanned}
            style={StyleSheet.absoluteFillObject}
          />
          <Text style={styles.scannerHint}>{t('scanQRHint') || 'Pointez vers le QR code'}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient colors={['#0f172a', '#1e293b']} style={StyleSheet.absoluteFill} />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ArrowLeft size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('liveSessionJoinSession') || 'Session Live Vidéo'}</Text>
        <View style={{ width: 40 }} />
      </View>

      {step === 'code' && renderCodeStep()}
      {step === 'scheduled' && renderScheduledStep()}
      {step === 'upload' && renderUploadStep()}
      {step === 'queue' && renderQueueStep()}
      {step === 'signing' && renderSigningStep()}
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
    backgroundColor: 'rgba(0,0,0,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  stepContainer: {
    flex: 1,
    padding: 20,
  },
  howItWorksSection: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
  },
  howItWorksTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#818cf8',
    textAlign: 'center',
    marginBottom: 16,
  },
  howItWorksSteps: {
    gap: 12,
  },
  howItWorksStep: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#6366f1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  stepText: {
    color: '#fff',
    fontSize: 14,
    flex: 1,
  },
  inputLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },
  searchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#6366f1',
    borderRadius: 30,
    paddingVertical: 16,
    marginTop: 8,
  },
  searchButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#fff',
    borderRadius: 30,
    paddingVertical: 16,
    marginTop: 8,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#6366f1',
  },
  scrollContent: {
    paddingBottom: 40,
  },
  iconContainer: {
    alignItems: 'center',
    marginTop: 40,
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    marginBottom: 32,
  },
  codeInput: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 18,
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    letterSpacing: 8,
    marginBottom: 16,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  photoSection: {
    marginBottom: 24,
  },
  photoButtons: {
    flexDirection: 'row',
    gap: 16,
  },
  photoButton: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    gap: 12,
  },
  photoButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6366f1',
    textAlign: 'center',
  },
  galleryIcon: {
    width: 32,
    height: 32,
  },
  photoPreview: {
    width: '100%',
    height: 200,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  changePhotoText: {
    textAlign: 'center',
    color: '#fff',
    marginTop: 8,
    fontSize: 14,
  },
  nameInput: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#fff',
    marginBottom: 12,
  },
  messageInput: {
    height: 80,
    textAlignVertical: 'top',
  },
  queueIconContainer: {
    alignItems: 'center',
    marginTop: 60,
    marginBottom: 24,
  },
  coverPhoto: {
    width: '100%',
    height: 200,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.2)',
    marginTop: 8,
  },
  coverFallback: {
    width: '100%',
    height: 200,
    borderRadius: 20,
    backgroundColor: '#6366f1',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 6,
    backgroundColor: '#6366f1',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 24,
  },
  liveBadgeText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  infoCardsContainer: {
    gap: 12,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: 16,
  },
  infoIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoTextContainer: {
    flex: 1,
  },
  infoLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    marginBottom: 2,
  },
  infoValue: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  infoValueMuted: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    fontWeight: '400',
  },
  queuePosition: {
    fontSize: 72,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 16,
  },
  waitingAnimation: {
    marginTop: 40,
    alignItems: 'center',
  },
  waitingNote: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    marginTop: 24,
  },
  signingIconContainer: {
    alignItems: 'center',
    marginTop: 60,
    marginBottom: 24,
    backgroundColor: 'rgba(74, 222, 128, 0.2)',
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignSelf: 'center',
  },
  orDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
    width: '100%',
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  orText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    marginHorizontal: 16,
  },
  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(99, 102, 241, 0.12)',
    borderWidth: 1,
    borderColor: '#818cf8',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 30,
    gap: 10,
  },
  scanButtonText: {
    color: '#818cf8',
    fontSize: 16,
    fontWeight: '600',
  },
  scannerContainer: {
    flex: 1,
    position: 'relative',
  },
  scannerHint: {
    position: 'absolute',
    bottom: 100,
    left: 0,
    right: 0,
    textAlign: 'center',
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingVertical: 12,
    marginHorizontal: 40,
    borderRadius: 8,
  },
});
