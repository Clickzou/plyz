import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Platform,
  ActivityIndicator,
  Image,
  ScrollView,
  Modal,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withRepeat,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { showAlert } from '@/utils/alertHelper';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, QrCode, Search, Check, Download, Camera, Video, Users, Clock, Calendar, Bell, X, AlertTriangle } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
let Notifications: any = null;
try {
  Notifications = require('expo-notifications');
} catch (e) {
  console.log('expo-notifications not available');
}
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import AccountModal from '@/components/AccountModal';
import { getEventByCode, LiveEvent } from '@/utils/liveEventStorage';
import { getSessionByCode, getSessionById, LiveSession } from '@/utils/liveSessionStorage';
import { 
  joinQueue, 
  getQueuePosition, 
  getMyQueueEntry,
  updatePushToken,
  QueueEntry,
  QueueStats,
} from '@/utils/sessionQueueStorage';
import BottomNav, { BOTTOM_NAV_HEIGHT } from '@/components/BottomNav';
import { 
  joinEventSession, 
  getOrCreateDeviceId,
  EventSession,
  EventSigner,
  saveActiveFanEvent,
  getActiveFanEvent,
  clearActiveFanEvent,
  ActiveFanEvent,
} from '@/utils/eventSessionStorage';
import BarCodeScannerWrapper, { requestCameraPermissionAsync, isBarCodeScannerAvailable } from '@/components/BarCodeScannerWrapper';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SAVED_SIGNATURES_KEY = '@plyz_event_signatures';
const STRIPE_SERVER_URL = process.env.EXPO_PUBLIC_STRIPE_SERVER_URL || '';

const playNotificationChime = () => {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && (window.AudioContext || (window as any).webkitAudioContext)) {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx();
      const masterGain = ctx.createGain();
      masterGain.gain.value = 0.6;
      masterGain.connect(ctx.destination);
      const fanfare = [
        { freq: 523.25, start: 0, dur: 0.2, type: 'triangle' as OscillatorType },
        { freq: 659.25, start: 0.1, dur: 0.2, type: 'triangle' as OscillatorType },
        { freq: 783.99, start: 0.2, dur: 0.2, type: 'triangle' as OscillatorType },
        { freq: 1046.5, start: 0.35, dur: 0.4, type: 'sine' as OscillatorType },
        { freq: 783.99, start: 0.55, dur: 0.15, type: 'sine' as OscillatorType },
        { freq: 1046.5, start: 0.7, dur: 0.5, type: 'sine' as OscillatorType },
        { freq: 1318.5, start: 0.7, dur: 0.5, type: 'triangle' as OscillatorType },
      ];
      fanfare.forEach(({ freq, start, dur, type }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.4, ctx.currentTime + start);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + start + dur);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + dur + 0.05);
      });
    } catch (e) {}
  }
  if (Platform.OS !== 'web') {
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {}
  }
};

const CONFETTI_COLORS = ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#FF69B4', '#00CED1', '#FF8C00'];
const CONFETTI_COUNT = 50;

interface ConfettiPiece {
  id: number;
  x: number;
  color: string;
  size: number;
  rotation: number;
  shape: 'rect' | 'circle';
}

const ConfettiPieceView = ({ piece, active, index }: { piece: ConfettiPiece; active: boolean; index: number }) => {
  const translateY = useSharedValue(-20);
  const opacity = useSharedValue(0);
  const rotate = useSharedValue(0);
  const translateX = useSharedValue(0);

  const params = React.useMemo(() => ({
    delay: (index * 40) + ((index * 17) % 200),
    fallDistance: 400 + (index % 7) * 60,
    drift: ((index % 10) - 5) * 30,
    spinAmount: 360 + (index % 5) * 180,
  }), [index]);

  useEffect(() => {
    if (active) {
      const { delay, fallDistance, drift, spinAmount } = params;

      opacity.value = withDelay(delay, withSequence(
        withTiming(1, { duration: 100 }),
        withDelay(1800, withTiming(0, { duration: 600 }))
      ));
      translateY.value = withDelay(delay, withTiming(fallDistance, {
        duration: 2400,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      }));
      translateX.value = withDelay(delay, withTiming(drift, {
        duration: 2400,
        easing: Easing.out(Easing.ease),
      }));
      rotate.value = withDelay(delay, withTiming(spinAmount, {
        duration: 2500,
        easing: Easing.linear,
      }));
    }
  }, [active]);

  const style = useAnimatedStyle(() => ({
    position: 'absolute' as const,
    left: `${piece.x}%` as any,
    top: -20,
    width: piece.size,
    height: piece.shape === 'rect' ? piece.size * 0.6 : piece.size,
    borderRadius: piece.shape === 'circle' ? piece.size / 2 : 2,
    backgroundColor: piece.color,
    opacity: opacity.value,
    transform: [
      { translateY: translateY.value },
      { translateX: translateX.value },
      { rotate: `${rotate.value}deg` },
    ],
  }));

  return <Animated.View style={style} />;
};

const ConfettiExplosion = ({ active }: { active: boolean }) => {
  const pieces = React.useMemo<ConfettiPiece[]>(() => {
    return Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
      id: i,
      x: (i * 2) % 100,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      size: 6 + (i % 5) * 2,
      rotation: (i * 37) % 360,
      shape: i % 2 === 0 ? 'rect' as const : 'circle' as const,
    }));
  }, []);

  if (!active) return null;

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 999 }}>
      {pieces.map((piece, i) => (
        <ConfettiPieceView key={piece.id} piece={piece} active={active} index={i} />
      ))}
    </View>
  );
};

export default function JoinEventScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [pendingJoinQueue, setPendingJoinQueue] = useState(false);

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

  const [queueEntry, setQueueEntry] = useState<QueueEntry | null>(null);
  const [queueStats, setQueueStats] = useState<QueueStats | null>(null);
  const [fanName, setFanName] = useState('');
  const [hasJoinedQueue, setHasJoinedQueue] = useState(false);
  const [isJoiningQueue, setIsJoiningQueue] = useState(false);
  const [checkoutSessionId, setCheckoutSessionId] = useState<string>('');
  const [paymentAuthorized, setPaymentAuthorized] = useState(false);
  const [promoCode, setPromoCode] = useState('');
  const [promoValidating, setPromoValidating] = useState(false);
  const [promoResult, setPromoResult] = useState<{ valid: boolean; promo_id?: string; discount_percent?: number; reason?: string } | null>(null);
  const [promoApplied, setPromoApplied] = useState(false);
  const hasPlayedChime = useRef(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [eventPromoCode, setEventPromoCode] = useState('');
  const [eventPromoValidating, setEventPromoValidating] = useState(false);
  const [eventPromoResult, setEventPromoResult] = useState<{ valid: boolean; promo_id?: string; discount_percent?: number; reason?: string } | null>(null);
  const [eventPromoApplied, setEventPromoApplied] = useState(false);
  const [eventPaymentConfig, setEventPaymentConfig] = useState<{priceCents: number, celebrityStripeAccountId?: string, celebrityName?: string} | null>(null);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [eventPaid, setEventPaid] = useState(false);
  const [activeFanEvent, setActiveFanEvent] = useState<ActiveFanEvent | null>(null);
  const signatureClipWidth = useSharedValue(0);
  const signatureOpacity = useSharedValue(0);
  const buttonPulse = useSharedValue(1);

  useEffect(() => {
    if (queueEntry && (queueEntry.status === 'called' || queueEntry.status === 'in_call') && !hasPlayedChime.current) {
      hasPlayedChime.current = true;
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 3500);
      playNotificationChime();
      signatureOpacity.value = withTiming(1, { duration: 400 });
      signatureClipWidth.value = withDelay(200, withTiming(350, { duration: 2500, easing: Easing.out(Easing.ease) }));
      buttonPulse.value = withRepeat(
        withSequence(
          withTiming(1.05, { duration: 800, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.95, { duration: 800, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
    }
  }, [queueEntry]);

  const signatureContainerStyle = useAnimatedStyle(() => ({
    opacity: signatureOpacity.value,
  }));

  const signatureMaskStyle = useAnimatedStyle(() => ({
    width: signatureClipWidth.value,
    overflow: 'hidden' as const,
    alignItems: 'center' as const,
  }));

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: buttonPulse.value }],
  }));

  useEffect(() => {
    if (user && pendingJoinQueue) {
      setPendingJoinQueue(false);
      setShowAccountModal(false);
      handleJoinQueue();
    }
  }, [user, pendingJoinQueue]);

  useEffect(() => {
    const checkEventPaymentReturn = async () => {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const urlParams = new URLSearchParams(window.location.search);
        const paymentSuccess = urlParams.get('payment_success');
        const checkoutId = urlParams.get('checkout_session_id');
        const returnCode = urlParams.get('code');

        if (paymentSuccess === 'true' && checkoutId && returnCode) {
          try {
            const verifyRes = await fetch(`${STRIPE_SERVER_URL}/api/verify-event-payment?checkout_session_id=${checkoutId}`);
            const verifyData = await verifyRes.json();

            if (verifyData.paid && verifyData.eventSessionId) {
              await AsyncStorage.setItem(`@event_paid_${verifyData.eventSessionId}`, 'true');
              setEventPaid(true);
              setCode(returnCode);

              const pendingPromoId = await AsyncStorage.getItem('@event_pending_promo_id');
              if (pendingPromoId) {
                try {
                  await fetch(`${STRIPE_SERVER_URL}/api/use-event-promo-code`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ promo_id: pendingPromoId }),
                  });
                } catch (e) {
                  console.error('[EventPromoCode] Use after payment error:', e);
                }
                await AsyncStorage.removeItem('@event_pending_promo_id');
              }

              setTimeout(() => handleSearch(returnCode), 500);
            }
          } catch (e) {
            console.warn('Event payment verification failed:', e);
          }
          window.history.replaceState({}, '', window.location.pathname);
        }
      }

      if (Platform.OS !== 'web') {
        const pendingSessionId = await AsyncStorage.getItem('@event_pending_payment_session');
        if (pendingSessionId) {
          const localPaid = await AsyncStorage.getItem(`@event_paid_${pendingSessionId}`);
          if (localPaid === 'true') {
            setEventPaid(true);
            await AsyncStorage.removeItem('@event_pending_payment_session');
          } else {
            try {
              const viewerId = await getOrCreateDeviceId();
              const checkRes = await fetch(`${STRIPE_SERVER_URL}/api/check-event-access?event_session_id=${pendingSessionId}&fan_id=${viewerId}`);
              const checkData = await checkRes.json();
              if (checkData.paid) {
                await AsyncStorage.setItem(`@event_paid_${pendingSessionId}`, 'true');
                setEventPaid(true);
                await AsyncStorage.removeItem('@event_pending_payment_session');

                const pendingPromoId = await AsyncStorage.getItem('@event_pending_promo_id');
                if (pendingPromoId) {
                  try {
                    await fetch(`${STRIPE_SERVER_URL}/api/use-event-promo-code`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ promo_id: pendingPromoId }),
                    });
                  } catch (pe) {
                    console.error('[EventPromoCode] Use after mobile payment error:', pe);
                  }
                  await AsyncStorage.removeItem('@event_pending_promo_id');
                }
              }
            } catch (e) {
              console.warn('Mobile payment check failed:', e);
            }
          }
        }
      }
    };
    checkEventPaymentReturn();
  }, []);

  useEffect(() => {
    if (!params.code && !params.paymentAuthorized) {
      getActiveFanEvent().then(event => {
        if (event) setActiveFanEvent(event);
      });
    }
  }, []);

  useEffect(() => {
    if (params.code) {
      setCode(String(params.code));
      handleSearch(String(params.code));
    }
  }, [params.code]);

  useEffect(() => {
    if (params.paymentAuthorized === 'true' && params.checkoutSessionId && params.sessionId) {
      const csId = String(params.checkoutSessionId);
      setCheckoutSessionId(csId);
      setPaymentAuthorized(true);
      AsyncStorage.setItem('@plyz_pending_checkout', JSON.stringify({
        checkoutSessionId: csId,
        sessionId: String(params.sessionId),
        fanName: String(params.fanName || ''),
        timestamp: Date.now(),
      })).catch(() => {});
      if (params.fanName) {
        setFanName(String(params.fanName));
      }
      const loadSessionAndJoin = async () => {
        try {
          const session = await getSessionById(String(params.sessionId));
          if (session) {
            setFoundLiveSession(session);
          }
        } catch (e) {
          console.error('[JoinEvent] Error loading session after payment:', e);
          setTimeout(async () => {
            try {
              const retrySession = await getSessionById(String(params.sessionId));
              if (retrySession) setFoundLiveSession(retrySession);
            } catch (e2) {
              console.error('[JoinEvent] Retry failed:', e2);
            }
          }, 2000);
        }
      };
      loadSessionAndJoin();
    }
  }, [params.paymentAuthorized, params.checkoutSessionId]);

  useEffect(() => {
    const checkPendingCheckout = async () => {
      if (params.paymentAuthorized) return;
      try {
        const pending = await AsyncStorage.getItem('@plyz_pending_checkout');
        if (pending) {
          const data = JSON.parse(pending);
          const ageMs = Date.now() - (data.timestamp || 0);
          if (ageMs > 7 * 24 * 60 * 60 * 1000) {
            await AsyncStorage.removeItem('@plyz_pending_checkout');
            return;
          }
          if (data.checkoutSessionId && data.sessionId) {
            try {
              const response = await fetch(
                `${STRIPE_SERVER_URL}/api/verify-payment?checkout_session_id=${data.checkoutSessionId}`
              );
              const verifyData = await response.json();
              if (verifyData.authorized) {
                setCheckoutSessionId(data.checkoutSessionId);
                setPaymentAuthorized(true);
                if (data.fanName) setFanName(data.fanName);
                const session = await getSessionById(data.sessionId);
                if (session) setFoundLiveSession(session);
              } else {
                await AsyncStorage.removeItem('@plyz_pending_checkout');
              }
            } catch (e) {
              console.error('[JoinEvent] Error checking pending checkout:', e);
            }
          }
        }
      } catch (e) {}
    };
    checkPendingCheckout();
  }, []);

  useEffect(() => {
    if (paymentAuthorized && foundLiveSession && !hasJoinedQueue && fanName.trim() && user) {
      handleJoinQueue();
    }
  }, [paymentAuthorized, foundLiveSession, hasJoinedQueue, user]);

  useEffect(() => {
    let pollInterval: ReturnType<typeof setInterval> | null = null;

    const pollQueuePosition = async () => {
      if (foundLiveSession && hasJoinedQueue) {
        const stats = await getQueuePosition(foundLiveSession.id);
        if (stats) {
          setQueueStats(stats);
          
          const refreshedSession = await getSessionByCode(foundLiveSession.code);
          if (refreshedSession) {
            setFoundLiveSession(refreshedSession);

            if (refreshedSession.status === 'ended' && checkoutSessionId) {
              cancelPreAuthorization();
              return;
            }
            
            if (refreshedSession.room_url && refreshedSession.status === 'active') {
              const entry = await getMyQueueEntry(foundLiveSession.id);
              if (entry) {
                if ((entry.status === 'missed' || entry.status === 'left') && checkoutSessionId) {
                  cancelPreAuthorization();
                  return;
                }
                if (entry.status === 'called' || entry.status === 'in_call') {
                  setQueueEntry(entry);
                } else if (entry.status === 'waiting' && stats.currentPosition <= 1) {
                  setQueueEntry({ ...entry, status: 'called' as any });
                }
              }
            }
          }
        }
      }
    };

    if (foundLiveSession && hasJoinedQueue) {
      pollQueuePosition();
      pollInterval = setInterval(pollQueuePosition, 3000);
    }

    return () => {
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, [foundLiveSession, hasJoinedQueue]);

  const handleSearch = async (searchCode?: string) => {
    const codeToSearch = (searchCode || code).trim().toUpperCase();
    
    if (codeToSearch.length < 4) {
      showAlert(t('error') || 'Error', t('invalidCode') || 'Please enter a valid code');
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
        if (STRIPE_SERVER_URL) {
          try {
            const paymentRes = await fetch(`${STRIPE_SERVER_URL}/api/get-event-payment-config?event_session_id=${sessionResult.session.id}`);
            const paymentConfig = await paymentRes.json();
            setEventPaymentConfig(paymentConfig);
          } catch (e) {
            console.warn('Failed to fetch payment config:', e);
            setEventPaymentConfig({ priceCents: 0 });
          }
        } else {
          setEventPaymentConfig({ priceCents: 0 });
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

      showAlert(
        t('eventNotFound') || 'Event Not Found',
        t('eventNotFoundMessage') || 'This event does not exist or has expired'
      );
    } catch (error) {
      console.error('Error searching event:', error);
      showAlert(t('error') || 'Error', t('searchFailed') || 'Failed to search for event');
    } finally {
      setIsSearching(false);
    }
  };

  const requestCameraPermission = async () => {
    if (!isBarCodeScannerAvailable()) {
      showAlert(
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
      showAlert(
        t('permissionRequired') || 'Permission Required',
        t('cameraPermissionMessage') || 'Camera permission is required to scan QR codes'
      );
    }
  };

  const handleBarCodeScanned = ({ type, data }: { type: string; data: string }) => {
    setShowScanner(false);
    
    const codeMatch = data.match(/plyz:\/\/event\/([A-Z0-9]+)/i);
    if (codeMatch) {
      const scannedCode = codeMatch[1].toUpperCase();
      setCode(scannedCode);
      handleSearch(scannedCode);
    } else {
      showAlert(
        t('invalidQR') || 'Invalid QR',
        t('invalidQRMessage') || 'This QR code is not valid'
      );
    }
  };

  const handleSaveSignature = async () => {
    if (!user) {
      setShowAccountModal(true);
      return;
    }
    
    await performSaveSignature();
  };

  const performSaveSignature = async () => {
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
      showAlert(t('error') || 'Error', t('saveFailed') || 'Failed to save signature');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEventPayment = async () => {
    if (!foundSession || !eventPaymentConfig) return;
    setIsProcessingPayment(true);

    try {
      const viewerId = await getOrCreateDeviceId();
      const origin = Platform.OS === 'web' ? window.location.origin : 'https://plyz.app';

      if (Platform.OS !== 'web') {
        await AsyncStorage.setItem('@event_pending_payment_session', foundSession.id);
      }

      if (eventPromoResult?.valid && eventPromoResult.promo_id) {
        await AsyncStorage.setItem('@event_pending_promo_id', eventPromoResult.promo_id);
      } else {
        await AsyncStorage.removeItem('@event_pending_promo_id');
      }

      const response = await fetch(`${STRIPE_SERVER_URL}/api/create-event-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventSessionId: foundSession.id,
          fanId: viewerId,
          priceCents: eventPromoResult?.valid && eventPromoResult.discount_percent && eventPromoResult.discount_percent < 100
            ? Math.round(eventPaymentConfig.priceCents * (1 - eventPromoResult.discount_percent / 100))
            : eventPaymentConfig.priceCents,
          celebrityStripeAccountId: eventPaymentConfig.celebrityStripeAccountId,
          celebrityName: eventPaymentConfig.celebrityName,
          successUrl: `${origin}/join-event?code=${foundSession.join_code}&payment_success=true&checkout_session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${origin}/join-event?code=${foundSession.join_code}&payment_cancelled=true`,
        }),
      });

      const data = await response.json();

      if (data.url) {
        if (Platform.OS === 'web') {
          window.location.href = data.url;
        } else {
          const { Linking } = require('react-native');
          Linking.openURL(data.url);
        }
      } else {
        showAlert(t('error') || 'Error', t('paymentFailed') || 'Payment initialization failed');
      }
    } catch (error) {
      console.error('Payment error:', error);
      showAlert(t('error') || 'Error', t('paymentFailed') || 'Payment failed');
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const goToGallery = async () => {
    if (foundSession) {
      if (eventPromoApplied && eventPromoResult?.promo_id) {
        try {
          await fetch(`${STRIPE_SERVER_URL}/api/use-event-promo-code`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ promo_id: eventPromoResult.promo_id }),
          });
          const viewerId = await getOrCreateDeviceId();
          await fetch(`${STRIPE_SERVER_URL}/api/record-free-event-access`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ event_session_id: foundSession.id, fan_id: viewerId, promo_id: eventPromoResult.promo_id }),
          });
          await AsyncStorage.setItem(`@event_paid_${foundSession.id}`, 'true');
          setEventPaid(true);
        } catch (e) {
          console.error('[EventPromoCode] Use error:', e);
        }
      } else if (eventPaymentConfig && eventPaymentConfig.priceCents > 0 && !eventPaid) {
        try {
          const viewerId = await getOrCreateDeviceId();
          const checkRes = await fetch(`${STRIPE_SERVER_URL}/api/check-event-access?event_session_id=${foundSession.id}&fan_id=${viewerId}`);
          const checkData = await checkRes.json();
          if (checkData.paid) {
            await AsyncStorage.setItem(`@event_paid_${foundSession.id}`, 'true');
            setEventPaid(true);
          } else {
            await handleEventPayment();
            return;
          }
        } catch (e) {
          const storedPaid = await AsyncStorage.getItem(`@event_paid_${foundSession.id}`);
          if (storedPaid === 'true') {
            setEventPaid(true);
          } else {
            await handleEventPayment();
            return;
          }
        }
      }
      const signersJson = JSON.stringify(sessionSigners);
      await saveActiveFanEvent({
        sessionId: foundSession.id,
        sessionTitle: foundSession.title,
        joinCode: foundSession.join_code,
        endsAt: foundSession.ends_at,
        signers: signersJson,
        savedAt: Date.now(),
      });
      setActiveFanEvent(null);
      router.push({
        pathname: '/event-gallery',
        params: {
          sessionId: foundSession.id,
          sessionTitle: foundSession.title,
          joinCode: foundSession.join_code,
          endsAt: foundSession.ends_at,
          signers: signersJson,
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
    setHasJoinedQueue(false);
    setQueueEntry(null);
    setQueueStats(null);
    setFanName('');
    setEventPromoCode('');
    setEventPromoValidating(false);
    setEventPromoResult(null);
    setEventPromoApplied(false);
  };

  const cancelPreAuthorization = async () => {
    if (!checkoutSessionId) return;
    try {
      console.log('[JoinEvent] Canceling pre-authorization:', checkoutSessionId);
      const response = await fetch(`${STRIPE_SERVER_URL}/api/cancel-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkout_session_id: checkoutSessionId }),
      });
      const data = await response.json();
      if (data.canceled) {
        console.log('[JoinEvent] Pre-authorization canceled successfully');
        AsyncStorage.removeItem('@plyz_pending_checkout').catch(() => {});
        setCheckoutSessionId('');
        showAlert(
          t('paymentCanceled') || 'Paiement annulé',
          t('paymentCanceledMessage') || 'Le montant réservé a été libéré. Aucun montant n\'a été débité.'
        );
      }
    } catch (error) {
      console.error('[JoinEvent] Error canceling pre-authorization:', error);
    }
  };

  const handleValidatePromo = async () => {
    if (!promoCode.trim() || !foundLiveSession) return;
    setPromoValidating(true);
    setPromoResult(null);
    try {
      const response = await fetch(`${STRIPE_SERVER_URL}/api/validate-promo-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: promoCode.trim(), session_id: foundLiveSession.id }),
      });
      const data = await response.json();
      setPromoResult(data);
      if (data.valid && data.discount_percent === 100) {
        setPromoApplied(true);
      }
    } catch (error) {
      console.error('[PromoCode] Validation error:', error);
      setPromoResult({ valid: false });
    } finally {
      setPromoValidating(false);
    }
  };

  const handleValidateEventPromo = async () => {
    if (!eventPromoCode.trim() || !foundSession) return;
    setEventPromoValidating(true);
    setEventPromoResult(null);
    try {
      const response = await fetch(`${STRIPE_SERVER_URL}/api/validate-event-promo-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: eventPromoCode.trim(), event_session_id: foundSession.id }),
      });
      const data = await response.json();
      setEventPromoResult(data);
      if (data.valid && data.discount_percent > 0) {
        if (data.discount_percent === 100) {
          setEventPromoApplied(true);
        }
      }
    } catch (error) {
      console.error('[EventPromoCode] Validation error:', error);
      setEventPromoResult({ valid: false });
    } finally {
      setEventPromoValidating(false);
    }
  };

  const handleJoinQueue = async () => {
    if (!foundLiveSession || !fanName.trim()) {
      showAlert(t('error') || 'Error', t('enterYourName') || 'Please enter your name');
      return;
    }

    if (!user) {
      setPendingJoinQueue(true);
      setShowAccountModal(true);
      return;
    }

    if (foundLiveSession.price_cents > 0 && !paymentAuthorized && !promoApplied) {
      router.push({
        pathname: '/purchase-session',
        params: {
          sessionId: foundLiveSession.id,
          celebrityId: foundLiveSession.celebrity_id || '',
          celebrityName: foundLiveSession.celebrity_name || '',
          priceCents: String(foundLiveSession.price_cents),
          durationMinutes: String(foundLiveSession.duration_per_fan_minutes || 5),
          celebrityStripeAccountId: foundLiveSession.celebrity_stripe_account_id || '',
          fanName: fanName.trim(),
        }
      });
      return;
    }

    setIsJoiningQueue(true);

    try {
      let pushToken: string | null = null;
      
      if (Notifications && Platform.OS !== 'web') {
        const { status } = await Notifications.requestPermissionsAsync();
        if (status === 'granted') {
          const tokenData = await Notifications.getExpoPushTokenAsync();
          pushToken = tokenData.data;
        }
      }

      const entry = await joinQueue(foundLiveSession.id, fanName.trim(), pushToken);
      
      if (entry) {
        setQueueEntry(entry);
        setHasJoinedQueue(true);
        AsyncStorage.removeItem('@plyz_pending_checkout').catch(() => {});

        if (promoApplied && promoResult?.promo_id) {
          try {
            await fetch(`${STRIPE_SERVER_URL}/api/use-promo-code`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ promo_id: promoResult.promo_id }),
            });
          } catch (e) {
            console.error('[PromoCode] Error marking promo as used:', e);
          }
        }
        
        const stats = await getQueuePosition(foundLiveSession.id);
        if (stats) {
          setQueueStats(stats);
        }

        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      } else {
        showAlert(t('error') || 'Error', t('failedToJoinQueue') || 'Failed to join the queue');
      }
    } catch (error) {
      console.error('Error joining queue:', error);
      showAlert(t('error') || 'Error', t('failedToJoinQueue') || 'Failed to join the queue');
    } finally {
      setIsJoiningQueue(false);
    }
  };

  const handleSetNotification = async () => {
    if (!scheduledSession) return;
    
    if (!Notifications) {
      showAlert(
        t('notAvailable') || 'Not Available',
        t('notificationsNotSupported') || 'Notifications are not supported in this environment'
      );
      return;
    }

    try {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') {
        showAlert(
          t('permissionRequired') || 'Permission Required',
          t('notificationPermissionMessage') || 'Please enable notifications to receive reminders'
        );
        return;
      }

      const startTime = new Date(scheduledSession.starts_at).getTime();
      const notifyTime = startTime - 2 * 60 * 1000;
      const now = Date.now();

      if (notifyTime <= now) {
        showAlert(
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
      showAlert(t('error') || 'Error', t('notificationFailed') || 'Failed to set notification');
    }
  };

  const handleSetLiveSessionNotification = async () => {
    if (!foundLiveSession) return;

    if (Platform.OS === 'web') {
      setNotificationSet(true);
      showAlert(
        t('notificationScheduled') || 'Notification Scheduled',
        t('stayOnPageNotification') || 'Stay on this page. You will be automatically redirected when it is your turn.'
      );
      return;
    }
    
    if (!Notifications) {
      setNotificationSet(true);
      showAlert(
        t('notificationScheduled') || 'Notification Scheduled',
        t('stayOnPageNotification') || 'Stay on this page. You will be automatically redirected when it is your turn.'
      );
      return;
    }

    try {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') {
        setNotificationSet(true);
        showAlert(
          t('notificationScheduled') || 'Notification Scheduled',
          t('stayOnPageNotification') || 'Stay on this page. You will be automatically redirected when it is your turn.'
        );
        return;
      }

      const waitMinutes = foundLiveSession.duration_per_fan_minutes || 5;
      const notifyInMs = Math.max((waitMinutes - 2) * 60 * 1000, 30 * 1000);

      await Notifications.scheduleNotificationAsync({
        content: {
          title: `${foundLiveSession.celebrity_name} - Plyz`,
          body: t('yourTurnIn2Min') || 'Your turn is coming up in about 2 minutes! Open the app now.',
          data: { sessionCode: foundLiveSession.code, sessionId: foundLiveSession.id },
          sound: true,
          priority: Notifications.AndroidNotificationPriority?.MAX,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: Math.floor(notifyInMs / 1000),
        },
      });

      setNotificationSet(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      
      showAlert(
        t('notificationScheduled') || 'Notification Scheduled',
        t('notificationScheduledMessage') || `You will be notified approximately 2 minutes before your turn. You can now leave the app.`
      );
    } catch (error) {
      console.error('Error setting live session notification:', error);
      setNotificationSet(true);
      showAlert(
        t('notificationScheduled') || 'Notification Scheduled',
        t('stayOnPageNotification') || 'Stay on this page. You will be automatically redirected when it is your turn.'
      );
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
      <ConfettiExplosion active={showConfetti} />
      
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

            {queueEntry && (queueEntry.status === 'called' || queueEntry.status === 'in_call') && foundLiveSession.room_url ? (
              <View style={styles.readyToJoinContainer}>
                <Animated.View style={[styles.signatureRevealContainer, signatureContainerStyle]}>
                  <Animated.View style={signatureMaskStyle}>
                    <Image 
                      source={require('@/assets/images/signature.png')} 
                      style={styles.signatureImageWhite}
                      resizeMode="contain"
                    />
                  </Animated.View>
                </Animated.View>
                <View style={styles.readyBadge}>
                  <Check size={20} color="#10B981" />
                  <Text style={styles.readyBadgeText}>{t('itsYourTurn') || "It's your turn!"}</Text>
                </View>
                <Animated.View style={pulseStyle}>
                  <TouchableOpacity
                    style={styles.joinCallButton}
                    onPress={() => {
                      router.push({
                        pathname: '/video-call',
                        params: {
                          roomUrl: foundLiveSession.room_url || '',
                          sessionId: foundLiveSession.id,
                          isHost: 'false',
                          userName: fanName || 'Fan',
                          queueEntryId: queueEntry.id,
                          durationPerFan: String(foundLiveSession.duration_per_fan_minutes || 5),
                          otherUserName: foundLiveSession.celebrity_name || '',
                          priceCents: String(foundLiveSession.price_cents || 0),
                          celebrityId: foundLiveSession.celebrity_id || '',
                          checkoutSessionId: checkoutSessionId || '',
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
                      <Video size={22} color="#fff" />
                      <Text style={styles.joinCallButtonText}>{t('joinVideoCall') || 'Join Video Call'}</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </Animated.View>
                <Text style={styles.joinNowHint}>
                  {t('joinNowHint') || 'Join now before you miss your turn!'}
                </Text>
              </View>
            ) : !hasJoinedQueue ? (
              <View style={styles.joinQueueSection}>
                <Text style={styles.joinQueueTitle}>
                  {t('joinTheQueue') || 'Rejoindre la file d\'attente'}
                </Text>
                <Text style={styles.joinQueueSubtitle}>
                  {t('enterNameToJoin') || 'Entrez votre nom pour rejoindre la liste d\'attente'}
                </Text>

                {foundLiveSession.price_cents > 0 && (
                  <View style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', borderRadius: 12, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(16, 185, 129, 0.3)' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                      <View style={{ backgroundColor: '#10B981', borderRadius: 20, width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                        <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>€</Text>
                      </View>
                      <View>
                        <Text style={{ color: '#fff', fontSize: 20, fontWeight: '700' }}>
                          {promoApplied
                            ? (language === 'fr' ? 'GRATUIT' : 'FREE')
                            : `${(foundLiveSession.price_cents / 100).toFixed(2).replace('.', ',')}€`}
                        </Text>
                        <Text style={{ color: '#9ca3af', fontSize: 12 }}>
                          {language === 'fr' ? `Appel de ${foundLiveSession.duration_per_fan_minutes || 1} min` : `${foundLiveSession.duration_per_fan_minutes || 1} min call`}
                        </Text>
                      </View>
                      {promoApplied && (
                        <View style={{ marginLeft: 'auto', backgroundColor: '#10B981', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
                          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>-100%</Text>
                        </View>
                      )}
                    </View>
                    {!promoApplied && (
                      <>
                        <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginVertical: 8 }} />
                        <Text style={{ color: '#d1d5db', fontSize: 12, lineHeight: 18 }}>
                          {language === 'fr' 
                            ? '💳 Pré-autorisation : le montant est réservé sur votre carte mais ne sera débité qu\'après votre appel vidéo. Si l\'appel n\'a pas lieu, vous ne serez pas débité.'
                            : '💳 Pre-authorization: the amount is reserved on your card but will only be charged after your video call. If the call doesn\'t happen, you won\'t be charged.'}
                        </Text>
                      </>
                    )}
                  </View>
                )}

                {foundLiveSession.price_cents > 0 && !promoApplied && (
                  <View style={{ marginBottom: 16 }}>
                    <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: '600', marginBottom: 8 }}>
                      {t('promoCode') || 'Code promo'}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TextInput
                        style={[styles.nameInput, { flex: 1, marginBottom: 0 }]}
                        placeholder={t('enterPromoCode') || 'Entrer un code promo'}
                        placeholderTextColor="rgba(255,255,255,0.4)"
                        value={promoCode}
                        onChangeText={(text) => {
                          setPromoCode(text.toUpperCase());
                          setPromoResult(null);
                          setPromoApplied(false);
                        }}
                        autoCapitalize="characters"
                        maxLength={30}
                      />
                      <TouchableOpacity
                        style={{ backgroundColor: promoCode.trim() ? '#3b82f6' : 'rgba(255,255,255,0.1)', borderRadius: 12, paddingHorizontal: 16, justifyContent: 'center', alignItems: 'center', opacity: promoCode.trim() ? 1 : 0.5 }}
                        onPress={handleValidatePromo}
                        disabled={!promoCode.trim() || promoValidating}
                      >
                        {promoValidating ? (
                          <ActivityIndicator color="#fff" size="small" />
                        ) : (
                          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{t('apply') || 'Appliquer'}</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                    {promoResult && !promoResult.valid && (
                      <Text style={{ color: '#ef4444', fontSize: 12, marginTop: 6 }}>
                        {promoResult.reason === 'expired'
                          ? (t('promoExpired') || 'Code promo expiré')
                          : promoResult.reason === 'max_uses_reached'
                            ? (t('promoMaxUses') || 'Code promo déjà utilisé au maximum')
                            : (t('promoInvalid') || 'Code promo invalide')}
                      </Text>
                    )}
                  </View>
                )}

                {promoApplied && (
                  <View style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)', borderRadius: 12, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(16, 185, 129, 0.3)', flexDirection: 'row', alignItems: 'center' }}>
                    <Check size={18} color="#10B981" />
                    <Text style={{ color: '#10B981', fontSize: 14, fontWeight: '600', marginLeft: 8, flex: 1 }}>
                      {t('promoApplied') || 'Code promo appliqué — session gratuite !'}
                    </Text>
                  </View>
                )}
                
                <TextInput
                  style={styles.nameInput}
                  placeholder={t('yourName') || 'Votre nom'}
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  value={fanName}
                  onChangeText={setFanName}
                  maxLength={50}
                />

                <TouchableOpacity
                  style={[styles.joinQueueButton, isJoiningQueue && styles.joinQueueButtonDisabled]}
                  onPress={handleJoinQueue}
                  disabled={isJoiningQueue}
                >
                  <LinearGradient
                    colors={['#10B981', '#059669']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.joinQueueButtonGradient}
                  >
                    {isJoiningQueue ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <>
                        <Users size={22} color="#fff" />
                        <Text style={styles.joinQueueButtonText}>
                          {foundLiveSession.price_cents > 0
                            ? (language === 'fr' ? 'Rejoindre la file' : 'Join Queue')
                            : (t('joinQueue') || 'Rejoindre la file')}
                        </Text>
                      </>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.waitingSectionCompact}>
                <View style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', borderRadius: 12, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(59, 130, 246, 0.2)' }}>
                  <Text style={{ color: '#93c5fd', fontSize: 14, lineHeight: 20, textAlign: 'center' }}>
                    {t('fanQueueExplanation') || 'You are in the queue for a private video call with the celebrity. When it\'s your turn, the call will start automatically. Keep this page open!'}
                  </Text>
                </View>
                <View style={styles.infoRow}>
                  <View style={styles.infoCard}>
                    <View style={styles.infoIconCircle}>
                      <Text style={styles.infoIconText}>€</Text>
                    </View>
                    <Text style={styles.infoValuePrice}>
                      {foundLiveSession.price_cents > 0 
                        ? `${(foundLiveSession.price_cents / 100).toFixed(0)}€` 
                        : t('free') || 'Free'}
                    </Text>
                    <Text style={styles.infoLabel}>{t('sessionPrice') || 'Price'}</Text>
                  </View>
                  <View style={[styles.infoCard, styles.infoCardHighlight]}>
                    <View style={[styles.infoIconCircle, styles.infoIconCircleHighlight]}>
                      <Text style={[styles.infoIconText, { color: '#10B981' }]}>#</Text>
                    </View>
                    <Text style={styles.infoValuePosition}>{queueStats?.currentPosition || 1}</Text>
                    <Text style={styles.infoLabel}>{t('outOf') || 'sur'} {queueStats?.totalInQueue || 1}</Text>
                  </View>
                  <View style={styles.infoCard}>
                    <View style={[styles.infoIconCircle, styles.infoIconCircleWait]}>
                      <Text style={[styles.infoIconText, { color: '#f59e0b' }]}>⏱</Text>
                    </View>
                    <Text style={styles.infoValueWait}>~{Math.max(queueStats?.estimatedWaitMinutes || 1, 1)}</Text>
                    <Text style={styles.infoLabel}>min</Text>
                  </View>
                </View>

                <Text style={styles.waitingHintCompact}>
                  {t('stayOnPage') || 'Stay on this page - the call will start soon!'}
                </Text>

                <View style={styles.actionButtonsRow}>
                  <TouchableOpacity
                    style={styles.actionButtonCompact}
                    onPress={() => handleSearch(foundLiveSession.code)}
                  >
                    <Search size={16} color="#10B981" />
                  </TouchableOpacity>

                  {!notificationSet ? (
                    <TouchableOpacity
                      style={styles.notifyButtonCompact}
                      onPress={handleSetLiveSessionNotification}
                    >
                      <Bell size={16} color="#3b82f6" />
                      <Text style={styles.notifyButtonText}>{t('notifyMe') || 'Notify me'}</Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.notifiedBadge}>
                      <Check size={14} color="#10B981" />
                      <Text style={styles.notifiedText}>{t('notificationSet') || 'Notified'}</Text>
                    </View>
                  )}
                </View>
              </View>
            )}
            
          </View>
        ) : !foundEvent && !foundSession && !eventFull ? (
          <>
            {activeFanEvent && (
              <TouchableOpacity
                style={styles.rejoinBanner}
                onPress={async () => {
                  try {
                    const viewerId = await getOrCreateDeviceId();
                    const storedPaid = await AsyncStorage.getItem(`@event_paid_${activeFanEvent.sessionId}`);
                    if (storedPaid !== 'true' && STRIPE_SERVER_URL) {
                      const checkRes = await fetch(`${STRIPE_SERVER_URL}/api/check-event-access?event_session_id=${activeFanEvent.sessionId}&fan_id=${viewerId}`);
                      const checkData = await checkRes.json();
                      if (!checkData.paid) {
                        const payRes = await fetch(`${STRIPE_SERVER_URL}/api/get-event-payment-config?event_session_id=${activeFanEvent.sessionId}`);
                        const payConfig = await payRes.json();
                        if (payConfig.priceCents > 0) {
                          await clearActiveFanEvent();
                          setActiveFanEvent(null);
                          setCode(activeFanEvent.joinCode);
                          handleSearch(activeFanEvent.joinCode);
                          return;
                        }
                      }
                    }
                    router.push({
                      pathname: '/event-gallery',
                      params: {
                        sessionId: activeFanEvent.sessionId,
                        sessionTitle: activeFanEvent.sessionTitle,
                        joinCode: activeFanEvent.joinCode,
                        endsAt: activeFanEvent.endsAt,
                        signers: activeFanEvent.signers,
                      },
                    });
                  } catch {
                    router.push({
                      pathname: '/event-gallery',
                      params: {
                        sessionId: activeFanEvent.sessionId,
                        sessionTitle: activeFanEvent.sessionTitle,
                        joinCode: activeFanEvent.joinCode,
                        endsAt: activeFanEvent.endsAt,
                        signers: activeFanEvent.signers,
                      },
                    });
                  }
                }}
              >
                <View style={styles.rejoinBannerContent}>
                  <View style={styles.rejoinBannerLeft}>
                    <View style={styles.rejoinLiveDot} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rejoinBannerTitle}>{activeFanEvent.sessionTitle}</Text>
                      <Text style={styles.rejoinBannerSub}>{t('rejoinEventMessage') || 'Tap to rejoin the event'}</Text>
                    </View>
                  </View>
                  <ArrowLeft size={20} color="#fff" style={{ transform: [{ rotate: '180deg' }] }} />
                </View>
              </TouchableOpacity>
            )}

            <View style={styles.howItWorksSection}>
              <Text style={styles.howItWorksTitle}>{t('howItWorksTitle') || 'How does it work?'}</Text>
              <View style={styles.howItWorksSteps}>
                <View style={styles.howItWorksStep}>
                  <View style={styles.stepNumber}><Text style={styles.stepNumberText}>1</Text></View>
                  <Text style={styles.stepText}>{t('howItWorksEventStep1') || 'Enter the event code'}</Text>
                </View>
                <View style={styles.howItWorksStep}>
                  <View style={styles.stepNumber}><Text style={styles.stepNumberText}>2</Text></View>
                  <Text style={styles.stepText}>{t('howItWorksEventStep2') || 'Once the event starts, you will receive your dedications live'}</Text>
                </View>
                <View style={styles.howItWorksStep}>
                  <View style={styles.stepNumber}><Text style={styles.stepNumberText}>3</Text></View>
                  <Text style={styles.stepText}>{t('howItWorksEventStep3') || 'You can then edit the dedications to personalize them'}</Text>
                </View>
              </View>
            </View>

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
            <Text style={styles.foundTitle}>{foundSession.title}</Text>
            
            <View style={styles.eventDetailsCard}>
              <View style={styles.eventDetailRow}>
                <View style={styles.eventDetailIconCircle}>
                  <Users size={16} color="#10B981" />
                </View>
                <View style={styles.eventDetailContent}>
                  <Text style={styles.eventDetailLabel}>{t('celebrities') || 'Celebrities'}</Text>
                  <Text style={styles.eventDetailValue}>{sessionSigners.length} {t('celebrities') || 'celebrities'}</Text>
                </View>
              </View>

              <View style={styles.eventDetailDivider} />

              <View style={styles.eventDetailRow}>
                <View style={[styles.eventDetailIconCircle, { backgroundColor: 'rgba(245, 158, 11, 0.15)' }]}>
                  <Clock size={16} color="#f59e0b" />
                </View>
                <View style={styles.eventDetailContent}>
                  <Text style={styles.eventDetailLabel}>{t('eventDuration') || 'Duration'}</Text>
                  <Text style={styles.eventDetailValue}>
                    {t('until') || 'Until'} {new Date(foundSession.ends_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
              </View>

              <View style={styles.eventDetailDivider} />

              <View style={styles.eventDetailRow}>
                <View style={[styles.eventDetailIconCircle, { backgroundColor: 'rgba(99, 102, 241, 0.15)' }]}>
                  <Text style={{ color: '#818cf8', fontSize: 16, fontWeight: '700' }}>€</Text>
                </View>
                <View style={styles.eventDetailContent}>
                  <Text style={styles.eventDetailLabel}>{t('eventPrice') || 'Price'}</Text>
                  <Text style={styles.eventDetailValue}>
                    {(eventPaymentConfig?.priceCents || foundSession.price_cents || 0) > 0
                      ? `${((eventPaymentConfig?.priceCents || foundSession.price_cents || 0) / 100).toFixed(2).replace('.', ',')}€`
                      : (t('free') || 'Free')}
                  </Text>
                </View>
              </View>

              {foundSession.location && (
                <>
                  <View style={styles.eventDetailDivider} />
                  <View style={styles.eventDetailRow}>
                    <View style={[styles.eventDetailIconCircle, { backgroundColor: 'rgba(239, 68, 68, 0.15)' }]}>
                      <Text style={{ color: '#ef4444', fontSize: 14 }}>📍</Text>
                    </View>
                    <View style={styles.eventDetailContent}>
                      <Text style={styles.eventDetailLabel}>{t('eventLocation') || 'Location'}</Text>
                      <Text style={styles.eventDetailValue}>{foundSession.location}</Text>
                    </View>
                  </View>
                </>
              )}
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

            {eventPaymentConfig && eventPaymentConfig.priceCents > 0 && !eventPaid && !eventPromoApplied && (
              <View style={{ marginBottom: 12 }}>
                <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: '600', marginBottom: 8 }}>
                  {t('promoCode') || 'Code promo'}
                </Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TextInput
                    style={[styles.nameInput, { flex: 1, marginBottom: 0 }]}
                    placeholder={t('enterPromoCode') || 'Entrer un code promo'}
                    placeholderTextColor="rgba(255,255,255,0.4)"
                    value={eventPromoCode}
                    onChangeText={(text) => {
                      setEventPromoCode(text.toUpperCase());
                      setEventPromoResult(null);
                      setEventPromoApplied(false);
                    }}
                    autoCapitalize="characters"
                    maxLength={30}
                  />
                  <TouchableOpacity
                    style={{ backgroundColor: eventPromoCode.trim() ? '#6366f1' : 'rgba(255,255,255,0.1)', borderRadius: 12, paddingHorizontal: 16, justifyContent: 'center', alignItems: 'center', opacity: eventPromoCode.trim() ? 1 : 0.5 }}
                    onPress={handleValidateEventPromo}
                    disabled={!eventPromoCode.trim() || eventPromoValidating}
                  >
                    {eventPromoValidating ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{t('apply') || 'Appliquer'}</Text>
                    )}
                  </TouchableOpacity>
                </View>
                {eventPromoResult && !eventPromoResult.valid && (
                  <Text style={{ color: '#ef4444', fontSize: 12, marginTop: 6 }}>
                    {eventPromoResult.reason === 'expired'
                      ? (t('promoExpired') || 'Code promo expiré')
                      : eventPromoResult.reason === 'max_uses_reached'
                        ? (t('promoMaxUses') || 'Code promo déjà utilisé au maximum')
                        : (t('promoInvalid') || 'Code promo invalide')}
                  </Text>
                )}
                {eventPromoResult && eventPromoResult.valid && eventPromoResult.discount_percent && eventPromoResult.discount_percent < 100 && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
                    <Check size={14} color="#10B981" />
                    <Text style={{ color: '#10B981', fontSize: 12, marginLeft: 4, fontWeight: '600' }}>
                      -{eventPromoResult.discount_percent}% {t('promoDiscountApplied') || 'de réduction appliquée'}
                    </Text>
                  </View>
                )}
              </View>
            )}

            {eventPromoApplied && (
              <View style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)', borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(16, 185, 129, 0.3)', flexDirection: 'row', alignItems: 'center' }}>
                <Check size={18} color="#10B981" />
                <Text style={{ color: '#10B981', fontSize: 14, fontWeight: '600', marginLeft: 8, flex: 1 }}>
                  {t('promoApplied') || 'Code promo appliqué — accès gratuit !'}
                </Text>
              </View>
            )}

            {eventPaymentConfig && eventPaymentConfig.priceCents > 0 && !eventPaid && !eventPromoApplied && (
              <View style={{ backgroundColor: 'rgba(99, 102, 241, 0.1)', borderRadius: 8, padding: 10, marginBottom: 12 }}>
                <Text style={{ color: '#818cf8', fontSize: 13, textAlign: 'center' }}>
                  {t('eventRequiresPayment') || 'Cet événement est payant'}
                </Text>
              </View>
            )}

            {eventPaid && (
              <View style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', borderRadius: 8, padding: 10, marginBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <Check size={16} color="#10B981" />
                <Text style={{ color: '#10B981', fontSize: 13, fontWeight: '600' }}>
                  {t('paymentConfirmed') || 'Paiement confirmé'}
                </Text>
              </View>
            )}

            {eventPaymentConfig && eventPaymentConfig.priceCents > 0 && !eventPaid && !eventPromoApplied ? (
              <TouchableOpacity 
                style={[styles.joinButton, { backgroundColor: '#6366f1' }]} 
                onPress={goToGallery}
                disabled={isProcessingPayment}
              >
                {isProcessingPayment ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.joinButtonText}>
                    {t('payAndJoin') || 'Payer'} {(
                      eventPromoResult?.valid && eventPromoResult.discount_percent && eventPromoResult.discount_percent < 100
                        ? (Math.round(eventPaymentConfig.priceCents * (1 - eventPromoResult.discount_percent / 100)) / 100).toFixed(2).replace('.', ',')
                        : (eventPaymentConfig.priceCents / 100).toFixed(2).replace('.', ',')
                    )}€ {t('andJoin') || '& Rejoindre'}
                  </Text>
                )}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.joinButton} onPress={goToGallery}>
                <Text style={styles.joinButtonText}>{t('liveSessionJoin') || 'Join Event'}</Text>
              </TouchableOpacity>
            )}
            
            <TouchableOpacity style={styles.searchAnotherButton} onPress={handleSearchAnother}>
              <Text style={styles.searchAnotherText}>{t('searchAnother') || 'Search another event'}</Text>
            </TouchableOpacity>
          </View>
        ) : foundEvent ? (
          <View style={styles.resultContainer}>
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
        onClose={() => {
          setShowAccountModal(false);
          setPendingJoinQueue(false);
        }}
        onSkip={() => {
          setShowAccountModal(false);
          setPendingJoinQueue(false);
        }}
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
  rejoinBanner: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: '#ef4444',
  },
  rejoinBannerContent: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
  },
  rejoinBannerLeft: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    flex: 1,
    gap: 12,
  },
  rejoinLiveDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#ef4444',
  },
  rejoinBannerTitle: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: '#fff',
    marginBottom: 2,
  },
  rejoinBannerSub: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
  },
  howItWorksSection: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  howItWorksTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#10B981',
    marginBottom: 16,
    textAlign: 'center',
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
    backgroundColor: '#10B981',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepNumberText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  stepText: {
    flex: 1,
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
    lineHeight: 20,
  },
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
  eventDetailsCard: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    width: '100%',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  eventDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 4,
  },
  eventDetailIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventDetailContent: {
    flex: 1,
  },
  eventDetailLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 2,
  },
  eventDetailValue: {
    fontSize: 15,
    color: '#fff',
    fontWeight: '600',
  },
  eventDetailDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginVertical: 10,
  },
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
  signatureRevealContainer: {
    alignItems: 'center',
    marginBottom: 20,
    height: 80,
  },
  signatureImageWhite: {
    width: 320,
    height: 80,
    tintColor: '#fff',
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
    marginHorizontal: 20,
    borderRadius: 28,
    overflow: 'hidden',
    marginBottom: 16,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  joinCallButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 28,
    gap: 10,
  },
  joinCallButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.3,
  },
  waitingSection: {
    alignItems: 'center',
    width: '100%',
    paddingVertical: 8,
  },
  waitingSectionCompact: {
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 16,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    width: '100%',
    gap: 12,
    marginBottom: 16,
  },
  infoCard: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  infoCardHighlight: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderColor: 'rgba(16, 185, 129, 0.4)',
  },
  infoIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  infoIconCircleHighlight: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
  },
  infoIconCircleWait: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
  },
  infoIconText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  infoLabel: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.5)',
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  infoValuePrice: {
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
  },
  infoValuePosition: {
    fontSize: 28,
    fontWeight: '900',
    color: '#10B981',
  },
  infoValueWait: {
    fontSize: 22,
    fontWeight: '800',
    color: '#f59e0b',
  },
  infoSubtext: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.5)',
  },
  pulseContainer: {
    width: 56,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  pulseOuter: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
  },
  pulseInner: {
    width: 40,
    height: 40,
    borderRadius: 20,
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
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.6)',
    textAlign: 'center',
    marginBottom: 8,
    fontStyle: 'italic',
  },
  waitingHintCompact: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'center',
    marginBottom: 12,
    fontStyle: 'italic',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  actionButtonCompact: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  notifyButtonCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
  },
  notifyButtonText: {
    fontSize: 13,
    color: '#3b82f6',
    fontWeight: '600',
  },
  notifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  notifiedText: {
    fontSize: 12,
    color: '#10B981',
    fontWeight: '600',
  },
  behaviorWarningCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderRadius: 10,
    padding: 10,
    marginHorizontal: 16,
    marginBottom: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  behaviorWarningContent: {
    flex: 1,
  },
  behaviorWarningTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fbbf24',
    marginBottom: 4,
  },
  behaviorWarningText: {
    fontSize: 12,
    color: 'rgba(251, 191, 36, 0.9)',
    lineHeight: 18,
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
  notificationConfirmedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 10,
    marginTop: 12,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  notificationConfirmedText: {
    fontSize: 14,
    color: '#10B981',
    fontWeight: '600',
    textAlign: 'center',
    flex: 1,
  },
  joinNowHint: {
    fontSize: 12,
    color: '#10B981',
    textAlign: 'center',
    marginTop: 8,
    fontStyle: 'italic',
  },
  joinQueueSection: {
    alignItems: 'center',
    width: '100%',
    paddingVertical: 20,
  },
  joinQueueTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
    textAlign: 'center',
  },
  joinQueueSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    marginBottom: 20,
    textAlign: 'center',
  },
  nameInput: {
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    fontSize: 16,
    color: '#fff',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  joinQueueButton: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
  },
  joinQueueButtonDisabled: {
    opacity: 0.6,
  },
  joinQueueButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 10,
  },
  joinQueueButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  queuePositionCard: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 10,
    borderWidth: 2,
    borderColor: '#10B981',
    width: '100%',
  },
  queuePositionLabel: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.7)',
    marginBottom: 2,
  },
  queuePositionNumber: {
    fontSize: 36,
    fontWeight: '900',
    color: '#10B981',
    marginBottom: 2,
  },
  queuePositionTotal: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.6)',
  },
  currentFanCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    gap: 8,
    marginBottom: 16,
  },
  currentFanText: {
    fontSize: 13,
    color: '#10B981',
  },
});
