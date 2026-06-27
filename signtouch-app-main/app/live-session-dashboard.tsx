import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Dimensions,
  ActivityIndicator,
  Platform,
  Animated,
  Share,
} from 'react-native';
import { showAlert, showConfirm } from '@/utils/alertHelper';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import { useAudioPlayer } from 'expo-audio';
import {
  Play,
  Pause,
  SkipForward,
  StopCircle,
  Users,
  Clock,
  QrCode,
  Copy,
  Check,
  Video,
  AlertTriangle,
  Camera,
  Image as ImageIcon,
  Trash,
  TrendingUp,
  Calendar,
  ArrowLeft,
  Send,
  Bell,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  LiveSession,
  QueueEntry,
  getSessionById,
  pauseSession,
  resumeSession,
  endSession,
  callNextFan,
  startSigning,
  completeSignature,
  skipFan,
  subscribeToSession,
  subscribeToQueue,
  broadcastSignatureStroke,
  updateSignatureSvg,
  updateSessionRoomUrl,
  startFanCall,
  updateCelebrityPushToken,
  uploadDedicationPhoto,
  updateDedicationSignature,
} from '@/utils/liveSessionStorage';
import { completeAllActiveFans } from '@/utils/sessionQueueStorage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import QRCode from 'react-native-qrcode-svg';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { createSessionVideoRoom, createMeetingToken } from '@/utils/dailyService';
import { 
  callNextFan as callNextQueueFan, 
  markFanAsMissed, 
  getFullQueue, 
  notifyUpcomingFans,
  sendQueueNotification,
  notifyCelebrityQueueFull,
  QueueEntry as SessionQueueEntry,
} from '@/utils/sessionQueueStorage';

let Notifications: any = null;
try {
  if (Platform.OS !== 'web') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Notifications = require('expo-notifications');
  }
} catch {}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CANVAS_SIZE = SCREEN_WIDTH - 80;

export default function LiveSessionDashboardScreen() {
  const router = useRouter();
  const { sessionId, sessionData } = useLocalSearchParams<{ sessionId: string; sessionData?: string }>();
  const insets = useSafeAreaInsets();
  // Garde l'écran ALLUMÉ tant que la célébrité est sur son dashboard de session live : sinon
  // l'écran se met en veille, l'app se suspend, et elle ne voit plus en direct les fans qui
  // rejoignent (ni le son in-app). La notification push reste le filet si l'app passe en arrière-plan.
  useKeepAwake();
  const { t, language } = useLanguage();

  const [session, setSession] = useState<LiveSession | null>(null);
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [currentFan, setCurrentFan] = useState<QueueEntry | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<string>('--:--');
  const [, setFanTimeRemaining] = useState<string>('--:--');
  const [showQR, setShowQR] = useState(true);
  const [copied, setCopied] = useState(false);
  const [isCreatingVideoRoom, setIsCreatingVideoRoom] = useState(false);
  const [isInVideoCall, setIsInVideoCall] = useState(false);
  // Son joué quand un fan rejoint la file (uniquement si la célébrité patiente sur le dashboard).
  const fanJoinedPlayer = useAudioPlayer(require('@/assets/sounds/fan-joined.wav'));
  // Ref synchronisée avec isInVideoCall : showFanJoinedToast est un useCallback (closure),
  // sans ref il lirait une valeur de state périmée.
  const isInVideoCallRef = useRef(false);
  useEffect(() => {
    isInVideoCallRef.current = isInVideoCall;
  }, [isInVideoCall]);

  const [dedicationPhotoUri, setDedicationPhotoUri] = useState<string | null>(null);
  const [dedicationStep, setDedicationStep] = useState<'photo' | 'signature' | 'done'>('photo');
  const [dedicationPaths, setDedicationPaths] = useState<string[]>([]);
  const [dedicationCurrentPath, setDedicationCurrentPath] = useState<string>('');
  const dedicationPathRef = useRef<string>('');
  const [isUploadingDedication, setIsUploadingDedication] = useState(false);
  const [, setIsDrawingDedication] = useState(false);
  const isDrawingDedicationRef = useRef(false);
  const scrollRef = useRef<ScrollView>(null);
  const dedicationCanvasRef = useRef<any>(null);
  const dedicationCanvasCtxRef = useRef<any>(null);

  const [paths, setPaths] = useState<string[]>([]);
  const [currentPath, setCurrentPath] = useState<string>('');
  const pathRef = useRef<string>('');
  
  const [sessionQueue, setSessionQueue] = useState<SessionQueueEntry[]>([]);
  // Incrémenté à chaque RETOUR de focus sur le dashboard (ex : sortie de la visio). Sert de
  // dépendance au useEffect de polling de la file : sans ça, le polling ne se relance pas au
  // retour (deps = [sessionId] inchangé) et la file resterait PÉRIMÉE (fan completed affiché
  // « Appelé », compteur faux, bannière « un fan vous attend » à tort).
  const [focusTick, setFocusTick] = useState(0);
  const [calledFan, setCalledFan] = useState<SessionQueueEntry | null>(null);
  const [fanCallTimeout, setFanCallTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);
  const FAN_RESPONSE_TIMEOUT_MS = 30000;
  
  const [sessionEarningsCents, setSessionEarningsCents] = useState(0);
  const [completedCallsCount, setCompletedCallsCount] = useState(0);
  const [earningsAnimating, setEarningsAnimating] = useState(false);
  const STRIPE_SERVER_URL = process.env.EXPO_PUBLIC_STRIPE_SERVER_URL || '';
  const hasPlayedQueueFullChime = useRef(false);
  const hasPlayedFirstFanChime = useRef(false);
  // Vrai au TOUT PREMIER chargement de la file. Sert à NE PAS rejouer le son « fan rejoint » si
  // des fans sont déjà présents quand le dashboard (RE)monte — ex : au retour depuis la visio, le
  // dashboard est recréé et le son sonnerait à tort « à la fin » de l'appel.
  const isInitialQueueLoad = useRef(true);
  const [, setQueueFull] = useState(false);
  const [, setFirstFanJoined] = useState(false);
  const [scheduledCountdown, setScheduledCountdown] = useState<string>('');

  // Toast in-app non bloquant « un fan a rejoint la file » (remplace l'alerte système).
  const [fanToastText, setFanToastText] = useState<string | null>(null);
  const fanToastAnim = useRef(new Animated.Value(0)).current;
  const fanToastHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // IDs des fans déjà vus dans la file (pour ne notifier que les nouveaux arrivants).
  const seenFanIdsRef = useRef<Set<string>>(new Set());

  // Animation "pulse" de la bannière persistante "un fan vous attend".
  const waitingBannerPulse = useRef(new Animated.Value(1)).current;

  const showFanJoinedToast = useCallback((text: string) => {
    // Son + vibration UNIQUEMENT si la célébrité patiente sur le dashboard,
    // JAMAIS pendant un appel vidéo (le dashboard reste monté en arrière-plan).
    if (!isInVideoCallRef.current) {
      try {
        fanJoinedPlayer.seekTo(0);
        fanJoinedPlayer.play();
      } catch {}
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {}
    }
    setFanToastText(text);
    if (fanToastHideTimer.current) clearTimeout(fanToastHideTimer.current);
    Animated.timing(fanToastAnim, {
      toValue: 1,
      duration: 350,
      useNativeDriver: true,
    }).start();
    fanToastHideTimer.current = setTimeout(() => {
      Animated.timing(fanToastAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => setFanToastText(null));
    }, 3500);
  }, [fanToastAnim, fanJoinedPlayer]);

  useEffect(() => {
    return () => {
      if (fanToastHideTimer.current) clearTimeout(fanToastHideTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!sessionId) {
      console.log('[Dashboard] No sessionId found, redirecting to home');
      router.replace('/');
      return;
    }

    const loadSession = async () => {
      if (sessionId.startsWith('local_session_')) {
        if (sessionData) {
          try {
            const parsed = JSON.parse(sessionData as string) as LiveSession;
            console.log('[Dashboard] Local session loaded from route params:', parsed.code);
            setSession(parsed);
            return;
          } catch (e) {
            console.error('[Dashboard] Failed to parse session data:', e);
          }
        }
        console.log('[Dashboard] Local session without data, redirecting to create page');
        router.replace('/create-live-session');
        return;
      }
      const s = await getSessionById(sessionId);
      setSession(s);
    };
    loadSession();

    const sessionChannel = subscribeToSession(sessionId, (updatedSession) => {
      setSession(updatedSession);
    });

    const queueChannel = subscribeToQueue(sessionId, (updatedQueue) => {
      setQueue(updatedQueue);
      // Plyz est 100% VIDEO : la dedicace se fait PENDANT l'appel video (video-call ->
      // dedication-result), pas via un canevas "dessiner sur la photo du fan" dans le dashboard.
      // L'ancien rendu dedicace (statuts 'current'/'signing', heritage SignTouch) ne doit JAMAIS
      // s'afficher ici, sinon la celebrite voit un bouton vert "Suivant" (handleNextFan) qui marque
      // le fan 'completed' et l'envoie sur l'ecran signature au lieu de lancer la visio (la file se
      // vide aussi). On neutralise donc currentFan -> seul le rendu video (appeler le fan suivant,
      // demarrer l'appel) reste affiche.
      setCurrentFan(null);
    });

    return () => {
      sessionChannel.unsubscribe();
      queueChannel.unsubscribe();
    };
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    const loadDedicationFromLocal = async () => {
      try {
        const photoUrl = await AsyncStorage.getItem(`dedication_photo_${sessionId}`);
        const signatureSvg = await AsyncStorage.getItem(`dedication_signature_${sessionId}`);
        if (photoUrl && signatureSvg) {
          setDedicationPhotoUri(photoUrl);
          setDedicationPaths(signatureSvg.split('|||'));
          setDedicationStep('done');
        } else if (photoUrl) {
          setDedicationPhotoUri(photoUrl);
          setDedicationStep('signature');
        }
      } catch (e) {
        console.error('Error loading dedication from local storage:', e);
      }
    };
    loadDedicationFromLocal();
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    const registerPushToken = async () => {
      if (Notifications && Platform.OS !== 'web') {
        try {
          const { status } = await Notifications.requestPermissionsAsync();
          if (status === 'granted') {
            const tokenData = await Notifications.getExpoPushTokenAsync();
            if (tokenData?.data) {
              await updateCelebrityPushToken(sessionId, tokenData.data);
            }
          }
        } catch (e) {
          console.log('Could not register celebrity push token:', e);
        }
      }
    };
    registerPushToken();
  }, [sessionId]);

  useEffect(() => {
    if (!session?.scheduled_at || session.status !== 'scheduled') return;
    
    const updateCountdown = () => {
      const now = new Date().getTime();
      const target = new Date(session.scheduled_at!).getTime();
      const diff = target - now;
      
      if (diff <= 0) {
        setScheduledCountdown('00:00:00');
        return;
      }
      
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      
      if (days > 0) {
        setScheduledCountdown(`${days}j ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`);
      } else {
        setScheduledCountdown(`${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`);
      }
    };
    
    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [session?.scheduled_at, session?.status]);

  useEffect(() => {
    if (!session?.ends_at || session.status !== 'active') return;

    const interval = setInterval(() => {
      const now = new Date().getTime();
      const end = new Date(session.ends_at!).getTime();
      const diff = Math.max(0, end - now);

      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      setTimeRemaining(`${minutes}:${seconds.toString().padStart(2, '0')}`);

      if (diff <= 0) {
        // Fin automatique (durée totale atteinte) : on clôture aussi tous les fans actifs
        // pour ne laisser aucune entrée résiduelle en 'called'/'waiting'/'in_call'.
        completeAllActiveFans(sessionId!).catch(() => {});
        endSession(sessionId!);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [session?.ends_at, session?.status, sessionId]);

  useEffect(() => {
    if (!session?.fan_call_started_at || !session?.duration_per_fan_minutes || !isInVideoCall) {
      setFanTimeRemaining('--:--');
      return;
    }

    const interval = setInterval(() => {
      const startTime = new Date(session.fan_call_started_at!).getTime();
      const durationMs = session.duration_per_fan_minutes * 60 * 1000;
      const endTime = startTime + durationMs;
      const now = new Date().getTime();
      const diff = Math.max(0, endTime - now);

      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      setFanTimeRemaining(`${minutes}:${seconds.toString().padStart(2, '0')}`);

      if (diff <= 0) {
        setFanTimeRemaining('0:00');
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [session?.fan_call_started_at, session?.duration_per_fan_minutes, isInVideoCall]);

  useEffect(() => {
    if (!sessionId) return;

    const loadSessionQueue = async () => {
      const fullQueue = await getFullQueue(sessionId);
      setSessionQueue(fullQueue);

      if (calledFanIdRef.current) {
        const stillInQueue = fullQueue.some((e) => e.id === calledFanIdRef.current);
        if (!stillInQueue) {
          calledFanIdRef.current = null;
          setCalledFan(null);
        }
      }

      const waitingInQueue = fullQueue.filter((e) => e.status === 'waiting' || e.status === 'called' || e.status === 'in_call').length;

      // Au (RE)MONTAGE du dashboard (ex : retour depuis la visio), des fans peuvent DÉJÀ être dans
      // la file. On les marque « déjà vus » et on considère le 1er fan comme déjà annoncé, pour NE
      // PAS rejouer le son « fan rejoint » à tort (bug : son qui sonnait à la fin de l'appel).
      if (isInitialQueueLoad.current) {
        isInitialQueueLoad.current = false;
        if (waitingInQueue >= 1) {
          hasPlayedFirstFanChime.current = true;
          fullQueue
            .filter((e) => e.status === 'waiting' || e.status === 'called' || e.status === 'in_call')
            .forEach((e) => seenFanIdsRef.current.add(e.id));
        }
      }

      if (waitingInQueue >= 1 && !hasPlayedFirstFanChime.current) {
        hasPlayedFirstFanChime.current = true;
        setFirstFanJoined(true);
        if (Platform.OS === 'web' && typeof window !== 'undefined' && window.AudioContext) {
          try {
            const ctx = new AudioContext();
            const notes = [
              { freq: 440, start: 0, dur: 0.15 },
              { freq: 554.37, start: 0.15, dur: 0.15 },
              { freq: 659.25, start: 0.3, dur: 0.2 },
            ];
            notes.forEach(({ freq, start, dur }) => {
              const osc = ctx.createOscillator();
              const gain = ctx.createGain();
              osc.type = 'sine';
              osc.frequency.value = freq;
              gain.gain.setValueAtTime(0.3, ctx.currentTime + start);
              gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + start + dur);
              osc.connect(gain);
              gain.connect(ctx.destination);
              osc.start(ctx.currentTime + start);
              osc.stop(ctx.currentTime + start + dur + 0.05);
            });
          } catch {}
        }
        const fanName = fullQueue.find((e) => e.status === 'waiting' || e.status === 'called' || e.status === 'in_call')?.fan_name?.trim()
          || (t('liveSessionAnonymousFan' as any) || 'Un fan');
        const toastTemplate = t('fanJoinedQueueFirstToast' as any) || '🎉 Premier fan connecté : {name} !';
        showFanJoinedToast(toastTemplate.replace('{name}', fanName));
        setTimeout(() => setFirstFanJoined(false), 4000);
        // Mémorise les fans déjà présents pour ne « toaster » que les NOUVEAUX ensuite.
        seenFanIdsRef.current = new Set(
          fullQueue
            .filter((e) => e.status === 'waiting' || e.status === 'called' || e.status === 'in_call')
            .map((e) => e.id)
        );
      } else if (hasPlayedFirstFanChime.current) {
        // Fans suivants : petit toast non bloquant « {name} a rejoint la file ! ».
        const activeFans = fullQueue.filter(
          (e) => e.status === 'waiting' || e.status === 'called' || e.status === 'in_call'
        );
        for (const fan of activeFans) {
          if (!seenFanIdsRef.current.has(fan.id)) {
            seenFanIdsRef.current.add(fan.id);
            const name = fan.fan_name?.trim() || (t('liveSessionAnonymousFan' as any) || 'Un fan');
            const tpl = t('fanJoinedQueueToast' as any) || '{name} a rejoint la file !';
            showFanJoinedToast(tpl.replace('{name}', name));
            if (Platform.OS !== 'web') {
              try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
            }
          }
        }
      }

      if (session && !hasPlayedQueueFullChime.current) {
        if (waitingInQueue >= session.max_slots) {
          hasPlayedQueueFullChime.current = true;
          setQueueFull(true);
          if (Platform.OS === 'web' && typeof window !== 'undefined' && window.AudioContext) {
            try {
              const ctx = new AudioContext();
              const notes = [
                { freq: 523.25, start: 0, dur: 0.12 },
                { freq: 659.25, start: 0.12, dur: 0.12 },
                { freq: 783.99, start: 0.24, dur: 0.12 },
                { freq: 1046.5, start: 0.36, dur: 0.25 },
                { freq: 1318.5, start: 0.55, dur: 0.3 },
              ];
              notes.forEach(({ freq, start, dur }) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.value = freq;
                gain.gain.setValueAtTime(0.35, ctx.currentTime + start);
                gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + start + dur);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(ctx.currentTime + start);
                osc.stop(ctx.currentTime + start + dur + 0.05);
              });
            } catch {}
          }
          if (Platform.OS !== 'web') {
            try {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch {}
          }
          showAlert(
            t('queueFullTitle') || 'File d\'attente complète !',
            t('queueFullMessage') || 'Tous les fans ont rejoint. Vous pouvez lancer le live !'
          );
          notifyCelebrityQueueFull(sessionId).catch(() => {});
        }
      }
    };

    loadSessionQueue();
    const queuePollInterval = setInterval(loadSessionQueue, 5000);

    return () => {
      clearInterval(queuePollInterval);
    };
    // focusTick : relance ce polling à CHAQUE retour de focus (sortie de la visio), pour
    // re-fetch immédiatement la file et la rafraîchir (sinon état périmé).
  }, [sessionId, focusTick]);

  // RETOUR de focus sur le dashboard (ex : sortie de l'écran /video-call). À ce moment, l'état
  // local est PÉRIMÉ : isInVideoCall est resté true, calledFan pointe encore le fan déjà terminé
  // (désormais 'completed' en base), et le polling de la file ne s'était pas relancé. Résultat
  // sinon : fan « Appelé » fantôme dans la file, compteur « 1/60 » faux, bannière « un fan vous
  // attend » à tort. On nettoie ces états et on force un re-fetch immédiat de la file (via
  // getFullQueue, qui ne renvoie QUE waiting/called/in_call -> le fan completed disparaît).
  // skipFirstFocusRef : ignore le TOUT PREMIER focus (montage initial), déjà couvert par les
  // effets de chargement, pour ne pas double-fetch ni perturber les chimes du 1er chargement.
  const skipFirstFocusRef = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (skipFirstFocusRef.current) {
        skipFirstFocusRef.current = false;
        return;
      }
      if (!sessionId) return;

      // L'appel vidéo est terminé : on n'est plus dedans.
      setIsInVideoCall(false);

      // Re-fetch immédiat de la file (ne pas attendre le prochain tick de polling).
      (async () => {
        const fullQueue = await getFullQueue(sessionId);
        setSessionQueue(fullQueue);
        // Si le fan « appelé » n'est plus dans la file active (il est passé 'completed'),
        // on purge l'état local calledFan pour que la bannière/compteur reflètent le réel.
        if (calledFanIdRef.current) {
          const stillActive = fullQueue.some((e) => e.id === calledFanIdRef.current);
          if (!stillActive) {
            calledFanIdRef.current = null;
            setCalledFan(null);
          }
        }
      })();

      // Relance le polling périodique de la file (deps focusTick du useEffect de polling).
      setFocusTick((n) => n + 1);
    }, [sessionId])
  );

  useEffect(() => {
    return () => {
      if (fanCallTimeout) {
        clearTimeout(fanCallTimeout);
      }
    };
  }, [fanCallTimeout]);

  const prevEarningsRef = useRef(0);

  const fetchSessionEarnings = useCallback(async () => {
    if (!sessionId || !session?.price_cents || session.price_cents <= 0 || !STRIPE_SERVER_URL) return;
    try {
      const response = await fetch(`${STRIPE_SERVER_URL}/api/session-earnings?session_id=${sessionId}`);
      const data = await response.json();
      if (data.total_captured_cents !== undefined) {
        setSessionEarningsCents(data.total_captured_cents);
        setCompletedCallsCount(data.captured_count);
        if (data.captured_count > prevEarningsRef.current) {
          setEarningsAnimating(true);
          setTimeout(() => setEarningsAnimating(false), 2000);
        }
        prevEarningsRef.current = data.captured_count;
      }
    } catch (e) {
      console.warn('[Dashboard] Error fetching earnings:', e);
    }
  }, [sessionId, session?.price_cents, STRIPE_SERVER_URL]);

  useEffect(() => {
    if (!sessionId || !session?.price_cents || session.price_cents <= 0) return;
    fetchSessionEarnings();
    const earningsInterval = setInterval(fetchSessionEarnings, 5000);
    return () => clearInterval(earningsInterval);
  }, [sessionId, session?.price_cents]);

  const calledFanIdRef = useRef<string | null>(null);

  const handleCallNextFromQueue = async () => {
    if (!sessionId || !session) return;

    if (calledFanIdRef.current) {
      await markFanAsMissed(calledFanIdRef.current);
      calledFanIdRef.current = null;
      setCalledFan(null);
    }

    if (fanCallTimeout) {
      clearTimeout(fanCallTimeout);
      setFanCallTimeout(null);
    }

    const nextFan = await callNextQueueFan(sessionId);
    
    if (nextFan) {
      setCalledFan(nextFan);
      calledFanIdRef.current = nextFan.id;

      if (nextFan.push_token) {
        await sendQueueNotification(
          nextFan.push_token,
          `${session.celebrity_name} - Plyz`,
          "C'est votre tour ! Rejoignez l'appel maintenant.",
          { sessionId, action: 'your_turn' }
        );
      }

      await notifyUpcomingFans(
        sessionId, 
        session.celebrity_name, 
        session.duration_per_fan_minutes || 5
      );

      const calledFanId = nextFan.id;
      const calledFanPushToken = nextFan.push_token;
      
      const timeout = setTimeout(async () => {
        if (calledFanIdRef.current === calledFanId) {
          await markFanAsMissed(calledFanId);
          
          if (calledFanPushToken) {
            await sendQueueNotification(
              calledFanPushToken,
              `${session.celebrity_name} - Plyz`,
              "Vous avez manqué votre tour. Vous êtes maintenant à la fin de la file d'attente.",
              { sessionId, action: 'missed_turn' }
            );
          }
          
          calledFanIdRef.current = null;
          setCalledFan(null);
          
          const updatedQueue = await getFullQueue(sessionId);
          setSessionQueue(updatedQueue);
          
          if (updatedQueue.length > 0) {
            handleCallNextFromQueue();
          }
        }
      }, FAN_RESPONSE_TIMEOUT_MS);

      setFanCallTimeout(timeout);

      const fullQueue = await getFullQueue(sessionId);
      setSessionQueue(fullQueue);
    } else {
      showAlert(
        t('queueEmpty') || 'Queue Empty', 
        t('noFansWaiting') || 'No fans are waiting in the queue.'
      );
    }
  };

  const handlePause = async () => {
    if (!sessionId) return;
    await pauseSession(sessionId);
  };

  const handleResume = async () => {
    if (!sessionId) return;
    await resumeSession(sessionId);
  };

  const handleEnd = async () => {
    showConfirm(t('liveSessionEndConfirmTitle'), t('liveSessionEndConfirmMessage'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('liveSessionEnd'),
        style: 'destructive',
        onPress: async () => {
          if (!sessionId) return;
          // Clôture TOUS les fans encore actifs AVANT de terminer la session, pour qu'aucune
          // entrée ne reste 'called'/'waiting'/'in_call' (sinon : compteur > 0, bannière
          // « un fan vous attend » persistante). Idempotent, ne casse pas le flux d'appel.
          await completeAllActiveFans(sessionId);
          await endSession(sessionId);
          router.replace('/');
        },
      },
    ]);
  };

  const handleNextFan = async () => {
    if (!sessionId) return;

    if (currentFan) {
      if (paths.length > 0) {
        const fullSvg = `<svg viewBox="0 0 ${CANVAS_SIZE} ${CANVAS_SIZE}">${paths.map((p) => `<path d="${p}" stroke="#000" stroke-width="3" fill="none"/>`).join('')}</svg>`;
        await completeSignature(currentFan.id, fullSvg, null);
      } else if (dedicationPaths.length > 0) {
        const dedicationSvg = dedicationPaths.join('|||');
        await updateSignatureSvg(currentFan.id, dedicationSvg);
      }
    }

    setPaths([]);
    setCurrentPath('');
    const nextFan = await callNextFan(sessionId);
    if (nextFan) {
      setCurrentFan(nextFan);
      await startSigning(nextFan.id);
    } else {
      setCurrentFan(null);
    }
  };

  const handleSkipFan = async () => {
    if (!currentFan) return;
    await skipFan(currentFan.id);
    setPaths([]);
    setCurrentPath('');
    await handleNextFan();
  };

  const copyCode = async () => {
    if (session?.code) {
      await Clipboard.setStringAsync(session.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Formate la durée par fan (« X sec » / « X min ») pour le placeholder {duration}.
  const formatPerFanDuration = (minutes: number): string => {
    if (!minutes || minutes < 1) {
      return `${Math.round((minutes || 0) * 60)} sec`;
    }
    if (minutes < 60) {
      return `${Math.round(minutes)} min`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return mins === 0 ? `${hours}h` : `${hours}h${mins.toString().padStart(2, '0')}`;
  };

  // « Publier dans le fil Actu » : pré-remplit le composeur de post comme sur l'écran
  // « Session programmée ! » de create-live-session.tsx.
  const handlePublishSessionToFeed = () => {
    if (!session) return;
    const when = session.scheduled_at ? new Date(session.scheduled_at) : new Date();
    router.push({
      pathname: '/create-post',
      params: {
        prefillKind: 'event',
        prefillTitle: language === 'fr' ? 'Session Live Vidéo' : 'Live Video Session',
        prefillBody: `${language === 'fr' ? '🎥 Rejoignez-moi pour une session live vidéo exclusive, en tête-à-tête face à face ! Un moment privé et unique, rien que pour vous, en direct sur Plyz 💜' : '🎥 Join me for an exclusive one-on-one live video session, face to face! A private, unique moment just for you, live on Plyz 💜'}\n\n${language === 'fr' ? 'Code' : 'Code'}: ${session.code}`,
        prefillDate: when.toISOString(),
      },
    });
  };

  // « Partager » (réseaux sociaux) : Share.share avec fallback presse-papier sur web,
  // même logique que handleShareEvent de create-live-session.tsx.
  const handleShareSession = async () => {
    if (!session) return;

    let when = '';
    try {
      const scheduledDate = session.scheduled_at ? new Date(session.scheduled_at) : new Date();
      if (!isNaN(scheduledDate.getTime())) {
        when = scheduledDate.toLocaleString(language === 'fr' ? 'fr-FR' : 'en-US', {
          weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
        });
      }
    } catch {}

    const duration = formatPerFanDuration(session.duration_per_fan_minutes || 0);

    const message = (t('shareEventMessage') || 'Rejoins ma session live sur Plyz ! Code : {code}')
      .replace('{code}', session.code)
      .replace('{date}', when)
      .replace('{duration}', duration);

    try {
      await Share.share({ message });
    } catch (error) {
      try {
        await Clipboard.setStringAsync(message);
        showAlert(
          t('success') || 'OK',
          language === 'fr' ? 'Texte copié dans le presse-papier !' : 'Text copied to clipboard!'
        );
      } catch {
        console.error('Share/clipboard failed:', error);
      }
    }
  };

  const processDedicationPhoto = async (uri: string) => {
    setDedicationPhotoUri(uri);
    setIsUploadingDedication(true);
    try {
      if (sessionId) {
        const uploadedUrl = await uploadDedicationPhoto(sessionId, uri, session?.celebrity_name || '');
        if (uploadedUrl) {
          await AsyncStorage.setItem(`dedication_photo_${sessionId}`, uploadedUrl);
        } else {
          await AsyncStorage.setItem(`dedication_photo_${sessionId}`, uri);
        }
      }
    } catch (e) {
      console.error('[Dedication] Upload error:', e);
    }
    setIsUploadingDedication(false);
    setDedicationStep('signature');
  };

  const handleWebFileChange = async (e: any) => {
    const file = e.target?.files?.[0];
    if (file) {
      const uri = URL.createObjectURL(file);
      await processDedicationPhoto(uri);
    }
    if (e.target) e.target.value = '';
  };

  const handleTakeDedicationPhoto = async () => {
    console.log('[Dedicace] Selfie: clic reçu, platform=', Platform.OS);
    if (Platform.OS === 'web') return;
    try {
      console.log('[Dedicace] Selfie: demande permission caméra...');
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      console.log('[Dedicace] Selfie: permission =', status);
      if (status !== 'granted') {
        showAlert(t('error'), t('cameraPermissionDenied'));
        return;
      }

      console.log('[Dedicace] Selfie: ouverture caméra...');
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        allowsEditing: true,
        aspect: [3, 4],
      });
      console.log('[Dedicace] Selfie: résultat caméra, canceled=', result.canceled);

      if (!result.canceled && result.assets[0]) {
        await processDedicationPhoto(result.assets[0].uri);
      }
    } catch (error) {
      console.error('[Dedicace] Selfie: ERREUR', error);
      setIsUploadingDedication(false);
    }
  };

  const handlePickDedicationPhoto = async () => {
    if (Platform.OS === 'web') return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images' as any,
        quality: 0.8,
        allowsEditing: true,
        aspect: [3, 4],
      });

      if (!result.canceled && result.assets[0]) {
        await processDedicationPhoto(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error picking dedication photo:', error);
      setIsUploadingDedication(false);
    }
  };

  const dedicationPanGesture = Gesture.Pan()
    .runOnJS(true)
    .minDistance(0)
    .onStart((e) => {
      isDrawingDedicationRef.current = true;
      setIsDrawingDedication(true);
      dedicationPathRef.current = `M${e.x.toFixed(1)},${e.y.toFixed(1)}`;
      setDedicationCurrentPath(dedicationPathRef.current);
    })
    .onUpdate((e) => {
      dedicationPathRef.current += ` L${e.x.toFixed(1)},${e.y.toFixed(1)}`;
      setDedicationCurrentPath(dedicationPathRef.current);
    })
    .onEnd(() => {
      const finishedPath = dedicationPathRef.current;
      if (finishedPath) {
        setDedicationPaths((prev) => [...prev, finishedPath]);
      }
      dedicationPathRef.current = '';
      setDedicationCurrentPath('');
      isDrawingDedicationRef.current = false;
      setIsDrawingDedication(false);
    })
    .onFinalize(() => {
      isDrawingDedicationRef.current = false;
      setIsDrawingDedication(false);
    });

  const handleSaveDedicationSignature = async () => {
    if (dedicationPaths.length === 0 || !sessionId) return;
    setIsUploadingDedication(true);
    const svgData = dedicationPaths.join('|||');
    try {
      await AsyncStorage.setItem(`dedication_signature_${sessionId}`, svgData);
    } catch (e) {
      console.error('Error saving dedication signature locally:', e);
    }
    await updateDedicationSignature(sessionId, svgData, session?.celebrity_name || '');
    setIsUploadingDedication(false);
    setDedicationStep('done');
  };

  const handleResetDedication = async () => {
    setDedicationPhotoUri(null);
    setDedicationPaths([]);
    setDedicationCurrentPath('');
    if (dedicationCanvasRef.current && dedicationCanvasCtxRef.current) {
      dedicationCanvasCtxRef.current.clearRect(0, 0, dedicationCanvasRef.current.width, dedicationCanvasRef.current.height);
    }
    setDedicationStep('photo');
    if (sessionId) {
      try {
        await AsyncStorage.removeItem(`dedication_photo_${sessionId}`);
        await AsyncStorage.removeItem(`dedication_signature_${sessionId}`);
      } catch (e) {
        console.error('Error clearing dedication locally:', e);
      }
    }
  };

  const DEDICATION_CANVAS_SIZE = Math.min(SCREEN_WIDTH - 100, 260);

  const dedicationCanvasContainerRef = useRef<View>(null);

  useEffect(() => {
    if (Platform.OS !== 'web' || dedicationStep !== 'signature') return;
    const timer = setTimeout(() => {
      const containerNode = dedicationCanvasContainerRef.current as any;
      if (!containerNode) return;
      const domNode = containerNode._nativeTag || containerNode;
      let parent: HTMLElement | null = null;
      if (typeof domNode === 'number') {
        return;
      }
      if (domNode instanceof HTMLElement) {
        parent = domNode;
      } else if (containerNode._viewConfig) {
        return;
      }
      if (!parent) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { findDOMNode } = require('react-dom');
          parent = findDOMNode(containerNode) as HTMLElement;
        } catch {
          return;
        }
      }
      if (!parent) return;
      parent.innerHTML = '';
      const canvas = document.createElement('canvas');
      const rect = parent.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.touchAction = 'none';
      canvas.style.display = 'block';
      parent.appendChild(canvas);

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      dedicationCanvasRef.current = canvas;
      dedicationCanvasCtxRef.current = ctx;
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      let drawing = false;
      const getPos = (e: PointerEvent) => {
        const r = canvas.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
      };
      canvas.addEventListener('pointerdown', (e: PointerEvent) => {
        e.preventDefault();
        canvas.setPointerCapture(e.pointerId);
        drawing = true;
        const { x, y } = getPos(e);
        dedicationPathRef.current = `M${x.toFixed(1)},${y.toFixed(1)}`;
        ctx.beginPath();
        ctx.moveTo(x, y);
      });
      canvas.addEventListener('pointermove', (e: PointerEvent) => {
        if (!drawing) return;
        e.preventDefault();
        const { x, y } = getPos(e);
        dedicationPathRef.current += ` L${x.toFixed(1)},${y.toFixed(1)}`;
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, y);
      });
      canvas.addEventListener('pointerup', (e: PointerEvent) => {
        if (!drawing) return;
        drawing = false;
        if (dedicationPathRef.current) {
          setDedicationPaths(prev => [...prev, dedicationPathRef.current]);
        }
        dedicationPathRef.current = '';
      });
      canvas.addEventListener('pointerleave', (e: PointerEvent) => {
        if (!drawing) return;
        drawing = false;
        if (dedicationPathRef.current) {
          setDedicationPaths(prev => [...prev, dedicationPathRef.current]);
        }
        dedicationPathRef.current = '';
      });
    }, 200);
    return () => clearTimeout(timer);
  }, [dedicationStep]);

  const handleStartVideoCall = async () => {
    if (!session) return;
    
    setIsCreatingVideoRoom(true);
    try {
      const roomResult = await createSessionVideoRoom(session.id, session.celebrity_name);
      
      if (!roomResult) {
        showAlert(t('error'), t('videoCallError'));
        setIsCreatingVideoRoom(false);
        return;
      }

      await updateSessionRoomUrl(session.id, roomResult.roomUrl);
      
      await startFanCall(session.id);
      setIsInVideoCall(true);

      const nextFan = await callNextQueueFan(session.id);
      if (nextFan) {
        setCalledFan(nextFan);
        calledFanIdRef.current = nextFan.id;

        // Propage la signature de la dedicace a l'entree du fan appele. Le flux video
        // (callNextQueueFan) ne la propage pas, contrairement au flux dedicace pur
        // -> sans ca la signature n'apparait pas sur la dedicace recue par le fan.
        try {
          const sig = await AsyncStorage.getItem(`dedication_signature_${session.id}`);
          if (sig) await updateSignatureSvg(nextFan.id, sig);
        } catch (e) {
          console.warn('[VideoCall] signature propagation failed:', e);
        }

        if (nextFan.push_token) {
          await sendQueueNotification(
            nextFan.push_token,
            `${session.celebrity_name} - Plyz`,
            "C'est votre tour ! Rejoignez l'appel maintenant.",
            { sessionId: session.id, action: 'your_turn' }
          );
        }
      }

      const token = await createMeetingToken({
        roomName: roomResult.roomName,
        userName: session.celebrity_name,
        userId: session.celebrity_id,
        isOwner: true,
        expiryMinutes: 180,
      });

      const waitingCount = sessionQueue.filter((e) => e.status === 'waiting').length;

      router.push({
        pathname: '/video-call',
        params: {
          roomUrl: roomResult.roomUrl,
          token: token || '',
          isHost: 'true',
          sessionId: session.id,
          userName: session.celebrity_name,
          durationPerFan: String(session.duration_per_fan_minutes || 5),
          fansRemaining: String(waitingCount),
          otherUserName: nextFan?.fan_name || 'Fan',
          otherUserId: nextFan?.fan_id || '',
          queueEntryId: nextFan?.id || '',
          celebrityId: session.celebrity_id || '',
          priceCents: String(session.price_cents || 0),
        }
      });
    } catch (error) {
      console.error('Error starting video call:', error);
      showAlert(t('error'), t('videoCallError'));
    } finally {
      setIsCreatingVideoRoom(false);
    }
  };

  const panGesture = Gesture.Pan()
    .runOnJS(true)
    .onStart((e) => {
      pathRef.current = `M${e.x.toFixed(1)},${e.y.toFixed(1)}`;
      setCurrentPath(pathRef.current);
    })
    .onUpdate((e) => {
      pathRef.current += ` L${e.x.toFixed(1)},${e.y.toFixed(1)}`;
      setCurrentPath(pathRef.current);

      if (currentFan) {
        broadcastSignatureStroke(sessionId!, currentFan.id, pathRef.current);
      }
    })
    .onEnd(() => {
      const finishedPath = pathRef.current;
      if (finishedPath) {
        setPaths((prev) => [...prev, finishedPath]);
        if (currentFan) {
          const allPaths = [...paths, finishedPath];
          const fullSvg = allPaths.join('|||');
          updateSignatureSvg(currentFan.id, fullSvg);
        }
      }
      pathRef.current = '';
      setCurrentPath('');
    });

  const realtimeCount = queue.filter((e) => e.status === 'waiting' || e.status === 'current' || e.status === 'signing').length;
  const pollingCount = sessionQueue.filter((e) => e.status === 'waiting' || (e.status as string) === 'called' || (e.status as string) === 'in_call').length;
  const waitingCount = Math.max(realtimeCount, pollingCount);

  // Bannière persistante "un fan vous attend" : nb de fans en attente d'être appelés.
  const fansWaitingForBanner = sessionQueue.filter(
    (e) => e.status === 'waiting' || (e.status as string) === 'called'
  ).length;
  // Conditions d'affichage : session active/en pause, au moins 1 fan en attente, la célébrité
  // n'est PAS déjà dans l'appel vidéo, et aucun fan n'est déjà en cours d'appel (calledFan null).
  const showWaitingBanner =
    (session?.status === 'active' || session?.status === 'paused') &&
    fansWaitingForBanner >= 1 &&
    !isInVideoCall &&
    !calledFan;

  // Pulse léger tant que la bannière est visible.
  useEffect(() => {
    if (!showWaitingBanner) {
      waitingBannerPulse.stopAnimation();
      waitingBannerPulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(waitingBannerPulse, { toValue: 1.04, duration: 700, useNativeDriver: true }),
        Animated.timing(waitingBannerPulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [showWaitingBanner, waitingBannerPulse]);

  const handleLaunchSession = async () => {
    if (!session) return;
    try {
      const response = await fetch(`${STRIPE_SERVER_URL}/api/launch-scheduled-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: session.id }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        console.error('Launch failed:', result);
        return;
      }
      if (result.session) {
        setSession(result.session);
      } else {
        const refreshed = await getSessionById(session.id);
        if (refreshed) setSession(refreshed);
      }
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error) {
      console.error('Error launching session:', error);
    }
  };

  if (!session) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <Text style={styles.loadingText}>{t('loading')}...</Text>
      </View>
    );
  }

  if (session.status === 'scheduled') {
    const scheduledDate = session.scheduled_at ? new Date(session.scheduled_at) : null;
    const locale = language === 'fr' ? 'fr-FR' : 'en-US';
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <LinearGradient colors={['#1a1a2e', '#16213e', '#0f3460']} style={StyleSheet.absoluteFill} />
        <ScrollView contentContainerStyle={{ padding: 20, alignItems: 'center' }}>
          <TouchableOpacity
            style={{ alignSelf: 'flex-start', padding: 8, marginBottom: 8 }}
            onPress={() => router.back()}
          >
            <ArrowLeft size={24} color="#fff" />
          </TouchableOpacity>

          <View style={{ backgroundColor: 'rgba(59, 130, 246, 0.15)', borderRadius: 50, width: 70, height: 70, alignItems: 'center', justifyContent: 'center', marginTop: 10, marginBottom: 16 }}>
            <Calendar size={34} color="#3b82f6" />
          </View>

          <Text style={{ fontSize: 22, fontWeight: '700', color: '#fff', textAlign: 'center', marginBottom: 4 }}>
            {session.celebrity_name}
          </Text>

          {scheduledDate && (
            <Text style={{ fontSize: 14, color: '#9ca3af', textAlign: 'center', marginBottom: 20 }}>
              {scheduledDate.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              {' '}
              {language === 'fr' ? 'à' : 'at'} {scheduledDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
          )}

          {scheduledDate && scheduledDate > new Date() && (
            <View style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16, padding: 20, alignItems: 'center', marginBottom: 24, width: '100%' }}>
              <Text style={{ fontSize: 13, color: '#9ca3af', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 2 }}>
                {language === 'fr' ? 'Commence dans' : 'Starts in'}
              </Text>
              <Text style={{ fontSize: 42, fontWeight: '800', color: '#fff', fontVariant: ['tabular-nums'] }}>
                {scheduledCountdown || '--:--:--'}
              </Text>
            </View>
          )}

          <Text style={{ fontSize: 16, fontWeight: '600', color: '#fff', marginBottom: 12 }}>
            {language === 'fr' ? 'Partagez Ce Code Avec Vos Fans' : 'Share This Code With Your Fans'}
          </Text>

          <View style={{ backgroundColor: '#fff', padding: 16, borderRadius: 12, marginBottom: 16 }}>
            <QRCode value={`plyz://live/${session.code}`} size={160} />
          </View>

          <TouchableOpacity 
            style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 24 }}
            onPress={copyCode}
          >
            <Text style={{ fontSize: 26, fontWeight: '800', color: '#10B981', letterSpacing: 6, marginRight: 10 }}>
              {session.code}
            </Text>
            {copied ? <Check size={20} color="#10B981" /> : <Copy size={20} color="#fff" />}
          </TouchableOpacity>

          <Text style={{ fontSize: 13, color: '#6b7280', marginBottom: 20 }}>
            {language === 'fr' ? 'Les fans peuvent rejoindre avec ce code' : 'Fans can join with this code'}
          </Text>

          <TouchableOpacity
            style={{ backgroundColor: '#10B981', paddingVertical: 16, paddingHorizontal: 32, borderRadius: 14, width: '100%', alignItems: 'center', marginBottom: 16, flexDirection: 'row', justifyContent: 'center' }}
            onPress={handleLaunchSession}
          >
            <Play size={20} color="#fff" fill="#fff" style={{ marginRight: 8 }} />
            <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700' }}>
              {language === 'fr' ? 'Lancer la session maintenant' : 'Launch session now'}
            </Text>
          </TouchableOpacity>

          <Text style={{ fontSize: 12, color: '#6b7280', textAlign: 'center', marginBottom: 24 }}>
            {language === 'fr' 
              ? 'Vous pouvez lancer la session avant l\'heure prévue si vous êtes prêt'
              : 'You can launch the session before the scheduled time if you\'re ready'}
          </Text>

          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient colors={['#1a1a2e', '#16213e', '#0f3460']} style={StyleSheet.absoluteFill} />

      {fanToastText && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.fanToast,
            { top: insets.top + 8 },
            {
              opacity: fanToastAnim,
              transform: [
                {
                  translateY: fanToastAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-30, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <View style={styles.fanToastIcon}>
            <Users size={18} color="#fff" />
          </View>
          <Text style={styles.fanToastText} numberOfLines={2}>{fanToastText}</Text>
        </Animated.View>
      )}

      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backHeaderButton}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/fan-choice' as any))}
        >
          <ArrowLeft size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.sessionName}>{session.celebrity_name}</Text>
          <View style={styles.typeBadge}>
            <Video size={12} color="#fff" />
            <Text style={styles.typeBadgeText}>{t('eventTypeLiveVideo' as any) || 'Live vidéo'}</Text>
          </View>
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Clock size={16} color="#fff" />
              <Text style={styles.statText}>{timeRemaining}</Text>
            </View>
            <View style={styles.stat}>
              <Users size={16} color="#fff" />
              <Text style={styles.statText}>
                {waitingCount}/{session.max_slots}
              </Text>
            </View>
            {session.price_cents > 0 && (
              <View style={[styles.stat, styles.earningsStat, earningsAnimating && styles.earningsStatAnimating]}>
                <TrendingUp size={16} color="#fff" />
                <Text style={[styles.statText, styles.earningsText, earningsAnimating && styles.earningsTextAnimating]}>
                  {(sessionEarningsCents / 100).toFixed(2)}€
                </Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.headerActions}>
          {session.status === 'active' && (
            <TouchableOpacity style={styles.actionButton} onPress={handlePause}>
              <Pause size={24} color="#fff" />
            </TouchableOpacity>
          )}
          {session.status === 'paused' && (
            <TouchableOpacity style={styles.actionButton} onPress={handleResume}>
              <Play size={24} color="#fff" fill="#fff" />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.actionButton, styles.endButton]}
            onPress={handleEnd}
          >
            <StopCircle size={24} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {showWaitingBanner && (
        <Animated.View style={[styles.fanWaitingBannerFixed, { transform: [{ scale: waitingBannerPulse }] }]}>
          <TouchableOpacity
            activeOpacity={0.85}
            style={styles.fanWaitingBanner}
            onPress={handleStartVideoCall}
            disabled={isCreatingVideoRoom}
          >
            <View style={styles.fanWaitingBannerIcon}>
              <Bell size={26} color="#fff" />
            </View>
            <View style={styles.fanWaitingBannerContent}>
              <Text style={styles.fanWaitingBannerTitle}>
                {fansWaitingForBanner > 1
                  ? (t('fanWaitingBannerTitlePlural' as any) || '🔔 {count} fans vous attendent !').replace('{count}', String(fansWaitingForBanner))
                  : (t('fanWaitingBannerTitle' as any) || '🔔 Un fan vous attend !')}
              </Text>
              <Text style={styles.fanWaitingBannerSubtitle}>
                {t('fanWaitingBannerSubtitle' as any) || 'Cliquez sur « Accéder à votre appel vidéo » en bas pour démarrer.'}
              </Text>
            </View>
            {isCreatingVideoRoom ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Video size={22} color="#fff" />
            )}
          </TouchableOpacity>
        </Animated.View>
      )}

      <ScrollView ref={scrollRef} style={styles.content} contentContainerStyle={[styles.contentContainer, { paddingBottom: insets.bottom + 40 }]} scrollEnabled={dedicationStep !== 'signature'}>
        {showQR && session.status === 'waiting' && dedicationStep !== 'signature' && (
          <View style={styles.qrSection}>
            <Text style={styles.qrTitle}>{t('liveSessionShareCode')}</Text>
            <View style={[styles.qrContainer, { padding: 12 }]}>
              <QRCode value={`plyz://live/${session.code}`} size={120} />
            </View>
            <TouchableOpacity style={[styles.codeContainer, { marginTop: 8, paddingVertical: 8, paddingHorizontal: 14 }]} onPress={copyCode}>
              <Text style={[styles.codeText, { fontSize: 18 }]}>{session.code}</Text>
              {copied ? (
                <Check size={16} color="#4ade80" />
              ) : (
                <Copy size={16} color="#fff" />
              )}
            </TouchableOpacity>
            <Text style={[styles.qrHint, { marginTop: 6, fontSize: 12 }]}>{t('liveSessionShareHint')}</Text>

            <View style={styles.shareButtonsRow}>
              <TouchableOpacity style={styles.publishFeedButton} onPress={handlePublishSessionToFeed}>
                <Send size={18} color="#fff" />
                <Text style={styles.publishFeedButtonText}>
                  {language === 'fr' ? 'Publier dans le fil Actu' : 'Publish to Feed'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.shareSessionButton} onPress={handleShareSession}>
                <Send size={18} color="#6366f1" />
                <Text style={styles.shareSessionButtonText}>{t('share') || 'Partager'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {session.status === 'waiting' && (
          <View>
            <View style={[styles.dedicationSetupSection, { marginTop: 12, padding: 14 }, dedicationStep !== 'done' && { borderWidth: 2, borderColor: '#ef4444' }]}>
              <Text style={[styles.dedicationSetupTitle, { fontSize: 15, marginBottom: 4 }]}>{t('dedicationSetupTitle')}</Text>
              <Text style={[styles.dedicationSetupHint, { fontSize: 11, marginBottom: 10 }]}>{t('dedicationSetupHint')}</Text>

              {dedicationStep === 'photo' && (
                <View style={styles.dedicationPhotoStep}>
                  <View style={styles.dedicationStepBadge}>
                    <Text style={styles.dedicationStepBadgeText}>1/2</Text>
                  </View>
                  <Text style={styles.dedicationStepLabel}>{t('dedicationTakePhoto')}</Text>
                  <View style={styles.dedicationPhotoButtons}>
                    {Platform.OS === 'web' ? (
                      <>
                        <View style={[styles.dedicationPhotoButton, { position: 'relative', overflow: 'hidden' }]}>
                          {isUploadingDedication ? (
                            <ActivityIndicator size="small" color="#fff" />
                          ) : (
                            <Camera size={20} color="#fff" />
                          )}
                          <Text style={styles.dedicationPhotoButtonText}>{t('takeSelfie')}</Text>
                          <input
                            type="file"
                            accept="image/*"
                            capture="user"
                            onChange={handleWebFileChange}
                            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', zIndex: 10 } as any}
                          />
                        </View>
                        <View style={[styles.dedicationPhotoButton, styles.dedicationPhotoButtonAlt, { position: 'relative', overflow: 'hidden' }]}>
                          <ImageIcon size={20} color="#fff" />
                          <Text style={styles.dedicationPhotoButtonTextAlt}>{t('choosePhoto')}</Text>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleWebFileChange}
                            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', zIndex: 10 } as any}
                          />
                        </View>
                      </>
                    ) : (
                      <>
                        <TouchableOpacity
                          style={styles.dedicationPhotoButton}
                          onPress={handleTakeDedicationPhoto}
                          disabled={isUploadingDedication}
                        >
                          {isUploadingDedication ? (
                            <ActivityIndicator size="small" color="#fff" />
                          ) : (
                            <Camera size={20} color="#fff" />
                          )}
                          <Text style={styles.dedicationPhotoButtonText}>{t('takeSelfie')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.dedicationPhotoButton, styles.dedicationPhotoButtonAlt]}
                          onPress={handlePickDedicationPhoto}
                          disabled={isUploadingDedication}
                        >
                          <ImageIcon size={20} color="#fff" />
                          <Text style={styles.dedicationPhotoButtonTextAlt}>{t('choosePhoto')}</Text>
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                </View>
              )}

              {dedicationStep === 'signature' && (
                <View style={styles.dedicationSignatureStep}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 10 }}>
                    <View style={styles.dedicationStepBadge}>
                      <Text style={styles.dedicationStepBadgeText}>2/2</Text>
                    </View>
                    {dedicationPhotoUri && (
                      <Image source={{ uri: dedicationPhotoUri }} style={{ width: 40, height: 50, borderRadius: 8 }} resizeMode="cover" />
                    )}
                    <Text style={[styles.dedicationStepLabel, { marginBottom: 0, fontSize: 13 }]}>{t('dedicationDrawSignature')}</Text>
                  </View>
                  {Platform.OS === 'web' ? (
                    <View
                      ref={dedicationCanvasContainerRef}
                      style={[styles.canvas, { width: '100%', height: DEDICATION_CANVAS_SIZE * 0.6 }]}
                    />
                  ) : (
                    <GestureDetector gesture={dedicationPanGesture}>
                      <View style={[styles.canvas, { width: '100%', height: DEDICATION_CANVAS_SIZE * 0.6 }]}>
                        <Svg width="100%" height={DEDICATION_CANVAS_SIZE * 0.6}>
                          {dedicationPaths.map((p, i) => (
                            <Path key={i} d={p} stroke="#000" strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                          ))}
                          {dedicationCurrentPath && (
                            <Path d={dedicationCurrentPath} stroke="#000" strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                          )}
                        </Svg>
                      </View>
                    </GestureDetector>
                  )}
                  <View style={styles.dedicationSignatureActions}>
                    <TouchableOpacity
                      style={styles.dedicationClearButton}
                      onPress={() => { setDedicationPaths([]); setDedicationCurrentPath(''); }}
                    >
                      <Trash size={16} color="#fff" />
                      <Text style={styles.dedicationClearButtonText}>{t('clear')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.dedicationSaveButton, dedicationPaths.length === 0 && { opacity: 0.5 }]}
                      onPress={handleSaveDedicationSignature}
                      disabled={dedicationPaths.length === 0 || isUploadingDedication}
                    >
                      {isUploadingDedication ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Check size={18} color="#fff" />
                      )}
                      <Text style={styles.dedicationSaveButtonText}>{t('validate')}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {dedicationStep === 'done' && (
                <View style={styles.dedicationDoneStep}>
                  <View style={styles.dedicationDoneCheck}>
                    <Check size={24} color="#4ade80" />
                  </View>
                  <Text style={styles.dedicationDoneText}>{t('dedicationReady')}</Text>
                  <View style={styles.dedicationDonePreviewRow}>
                    {dedicationPhotoUri && (
                      <Image source={{ uri: dedicationPhotoUri }} style={styles.dedicationPhotoPreviewSmall} resizeMode="cover" />
                    )}
                    {dedicationPaths.length > 0 && (() => {
                      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                      dedicationPaths.forEach(p => {
                        const nums = p.match(/[\d.]+/g);
                        if (nums) {
                          for (let i = 0; i < nums.length; i += 2) {
                            const x = parseFloat(nums[i]);
                            const y = parseFloat(nums[i + 1]);
                            if (!isNaN(x) && !isNaN(y)) {
                              minX = Math.min(minX, x); maxX = Math.max(maxX, x);
                              minY = Math.min(minY, y); maxY = Math.max(maxY, y);
                            }
                          }
                        }
                      });
                      const pad = 10;
                      minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
                      const vw = maxX - minX + pad * 2;
                      const vh = maxY - minY + pad * 2;
                      return (
                        <View style={styles.dedicationSignaturePreview}>
                          <Svg width={120} height={60} viewBox={`${minX} ${minY} ${vw} ${vh}`} preserveAspectRatio="xMidYMid meet">
                            {dedicationPaths.map((p, i) => (
                              <Path key={i} d={p} stroke="#1a1a2e" strokeWidth={Math.max(2, vw / 40)} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                            ))}
                          </Svg>
                        </View>
                      );
                    })()}
                  </View>
                  <TouchableOpacity style={styles.dedicationResetButton} onPress={handleResetDedication}>
                    <Text style={styles.dedicationResetText}>{t('dedicationReset')}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
            
            <TouchableOpacity
              style={[styles.startVideoCallButton, (isCreatingVideoRoom || dedicationStep !== 'done') && styles.videoCallButtonDisabled]}
              onPress={handleStartVideoCall}
              disabled={isCreatingVideoRoom || dedicationStep !== 'done'}
            >
              {isCreatingVideoRoom ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Video size={24} color={dedicationStep !== 'done' ? '#9ca3af' : '#fff'} />
              )}
              <Text style={[styles.startVideoCallButtonText, dedicationStep !== 'done' && styles.videoCallButtonTextDisabled]}>
                {isCreatingVideoRoom ? t('connectingToCall') : t('startVideoCall')}
              </Text>
            </TouchableOpacity>
            {dedicationStep !== 'done' && (
              <Text style={styles.dedicationRequiredHint}>{t('dedicationRequiredHint' as any)}</Text>
            )}
          </View>
        )}

        {(session.status === 'active' || session.status === 'paused') && (
          <>
            {currentFan ? (
              <View style={styles.signingSection}>
                <View style={styles.fanInfo}>
                  <Text style={styles.fanName}>{currentFan.fan_name || t('liveSessionAnonymousFan')}</Text>
                  {currentFan.message && (
                    <Text style={styles.fanMessage}>"{currentFan.message}"</Text>
                  )}
                </View>

                {currentFan.photo_url && (
                  <View style={styles.photoContainer}>
                    <Image
                      source={{ uri: currentFan.photo_url }}
                      style={styles.fanPhoto}
                      resizeMode="contain"
                    />
                  </View>
                )}

                <View style={styles.canvasContainer}>
                  <Text style={styles.canvasLabel}>{t('liveSessionSignHere')}</Text>
                  <GestureDetector gesture={panGesture}>
                    <View style={styles.canvas}>
                      <Svg width={CANVAS_SIZE} height={CANVAS_SIZE}>
                        {paths.map((p, i) => (
                          <Path
                            key={i}
                            d={p}
                            stroke="#000"
                            strokeWidth={3}
                            fill="none"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        ))}
                        {currentPath && (
                          <Path
                            d={currentPath}
                            stroke="#000"
                            strokeWidth={3}
                            fill="none"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        )}
                      </Svg>
                    </View>
                  </GestureDetector>
                </View>

                <View style={styles.signingActions}>
                  <TouchableOpacity style={styles.skipButton} onPress={handleSkipFan}>
                    <SkipForward size={20} color="#fff" />
                    <Text style={styles.skipButtonText}>{t('liveSessionSkip')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.nextButton} onPress={handleNextFan}>
                    <Check size={20} color="#4ade80" />
                    <Text style={styles.nextButtonText}>{t('liveSessionSendNext')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={styles.waitingSection}>
                {calledFan ? (
                  <View style={styles.calledFanCard}>
                    <View style={styles.calledFanPulse} />
                    <Text style={styles.calledFanLabel}>{t('waitingForFan') || 'Waiting for fan to join...'}</Text>
                    <Text style={styles.calledFanName}>{calledFan.fan_name}</Text>
                    <Text style={styles.calledFanTimer}>30s</Text>
                    <TouchableOpacity 
                      style={styles.skipCalledFanButton}
                      onPress={handleCallNextFromQueue}
                    >
                      <SkipForward size={18} color="#fff" />
                      <Text style={styles.skipCalledFanText}>{t('skipAndCallNext') || 'Skip & call next'}</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <>
                    <Text style={styles.waitingTitle}>
                      {sessionQueue.length > 0
                        ? t('fansInQueue', { count: sessionQueue.length }) || `${sessionQueue.length} fans in queue`
                        : t('liveSessionNoFansYet')}
                    </Text>
                    {/* Bouton "Appeler le fan suivant" SUPPRIME : redondant avec "Demarrer l'appel
                        video" (handleStartVideoCall) qui, lui, cree la salle Daily + appelle le 1er
                        fan de la file + entre dans la visio. Un seul bouton d'action = plus coherent. */}
                  </>
                )}

                <View style={styles.behaviorWarningCard}>
                  <AlertTriangle size={20} color="#f59e0b" />
                  <View style={styles.behaviorWarningContent}>
                    <Text style={styles.behaviorWarningTitle}>
                      {t('behaviorWarningTitle') || 'Behavior Guidelines'}
                    </Text>
                    <Text style={styles.behaviorWarningText}>
                      {t('behaviorWarningCelebrity') || 'Rate fans after each call. Fans with low ratings may be banned. Report any inappropriate behavior.'}
                    </Text>
                  </View>
                </View>

                {sessionQueue.length > 0 && (
                  <View style={styles.queueListSection}>
                    <Text style={styles.queueListTitle}>{t('waitingQueue') || 'Waiting Queue'}</Text>
                    {sessionQueue.slice(0, 5).map((fan, index) => (
                      <View key={fan.id} style={styles.queueListItem}>
                        <Text style={styles.queuePosition}>#{index + 1}</Text>
                        <Text style={styles.queueFanName}>{fan.fan_name}</Text>
                        <View style={[
                          styles.queueStatusBadge, 
                          fan.status === 'called' && styles.queueStatusCalled
                        ]}>
                          <Text style={styles.queueStatusText}>
                            {fan.status === 'called' ? (t('called') || 'Called') : (t('waiting') || 'Waiting')}
                          </Text>
                        </View>
                      </View>
                    ))}
                    {sessionQueue.length > 5 && (
                      <Text style={styles.queueMoreText}>
                        +{sessionQueue.length - 5} {t('more') || 'more'}
                      </Text>
                    )}
                  </View>
                )}

                <TouchableOpacity
                  style={styles.showQRButton}
                  onPress={() => setShowQR(true)}
                >
                  <QrCode size={20} color="#fff" />
                  <Text style={styles.showQRButtonText}>{t('liveSessionShowQR')}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.videoCallButton, isCreatingVideoRoom && styles.videoCallButtonDisabled]}
                  onPress={handleStartVideoCall}
                  disabled={isCreatingVideoRoom}
                >
                  {isCreatingVideoRoom ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Video size={20} color="#fff" />
                  )}
                  <Text style={styles.videoCallButtonText}>
                    {isCreatingVideoRoom ? t('connectingToCall') : t('startVideoCall')}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {showQR && (
              <View style={styles.qrSection}>
                <View style={styles.qrContainer}>
                  <QRCode value={`plyz://live/${session.code}`} size={120} />
                </View>
                <TouchableOpacity style={styles.codeContainer} onPress={copyCode}>
                  <Text style={styles.codeText}>{session.code}</Text>
                  {copied ? (
                    <Check size={20} color="#4ade80" />
                  ) : (
                    <Copy size={20} color="#fff" />
                  )}
                </TouchableOpacity>
              </View>
            )}
          </>
        )}

        {session.status === 'ended' && (
          <View style={styles.endedSection}>
            <Text style={styles.endedTitle}>{t('liveSessionEnded')}</Text>
            <Text style={styles.endedStats}>
              {t('liveSessionTotalSigned', { count: session.slots_used })}
            </Text>
            {session.price_cents > 0 && (
              <View style={styles.earningsSummaryCard}>
                <View style={styles.earningsSummaryHeader}>
                  <TrendingUp size={24} color="#4ade80" />
                  <Text style={styles.earningsSummaryTitle}>{t('sessionRevenue') || 'Revenus de la session'}</Text>
                </View>
                <Text style={styles.earningsSummaryAmount}>
                  {(sessionEarningsCents / 100).toFixed(2)}€
                </Text>
                <Text style={styles.earningsSummaryDetail}>
                  {completedCallsCount} {t('completedCalls') || 'appels terminés'} × {((session.price_cents - Math.round(session.price_cents * 0.15)) / 100).toFixed(2)}€
                </Text>
                <Text style={styles.earningsSummaryPayout}>
                  {t('estimatedPayout') || 'Versement estimé sous 7 jours ouvrés'}
                </Text>
              </View>
            )}
            <TouchableOpacity
              style={styles.backHomeButton}
              onPress={() => router.replace('/')}
            >
              <Text style={styles.backHomeButtonText}>{t('backToHome')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  fanToast: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 1000,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(99, 102, 241, 0.92)',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  fanToastIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fanToastText: {
    flex: 1,
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#fff',
    fontSize: 18,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.2)',
  },
  backHeaderButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  headerInfo: {
    flex: 1,
  },
  sessionName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    backgroundColor: 'rgba(139, 92, 246, 0.9)',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    marginTop: 4,
  },
  typeBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 4,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 10,
  },
  actionButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  endButton: {
    backgroundColor: '#ef4444',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
  },
  qrSection: {
    alignItems: 'center',
    marginBottom: 12,
  },
  qrTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  qrContainer: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 16,
  },
  codeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(0,0,0,0.3)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
    marginTop: 16,
  },
  codeText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 4,
  },
  qrHint: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 12,
    textAlign: 'center',
  },
  shareButtonsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    width: '100%',
  },
  publishFeedButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#6366f1',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  publishFeedButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  shareSessionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(99,102,241,0.12)',
    borderWidth: 1,
    borderColor: '#6366f1',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  shareSessionButtonText: {
    color: '#6366f1',
    fontSize: 13,
    fontWeight: '700',
  },
  signingSection: {
    flex: 1,
  },
  fanInfo: {
    marginBottom: 16,
  },
  fanName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
  },
  fanMessage: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    marginTop: 8,
    fontStyle: 'italic',
  },
  photoContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  fanPhoto: {
    width: SCREEN_WIDTH - 80,
    height: 200,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  canvasContainer: {
    alignItems: 'center',
  },
  canvasLabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 8,
  },
  canvas: {
    width: CANVAS_SIZE,
    height: CANVAS_SIZE,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 16,
    overflow: 'hidden',
  },
  signingActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  skipButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.3)',
    paddingVertical: 14,
    borderRadius: 25,
  },
  skipButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  nextButton: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#fff',
    paddingVertical: 14,
    borderRadius: 25,
  },
  nextButtonText: {
    color: '#4ade80',
    fontSize: 16,
    fontWeight: '700',
  },
  waitingSection: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  fanWaitingBannerFixed: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  fanWaitingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: 'rgba(16, 185, 129, 0.18)',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: '#10B981',
    width: '100%',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  fanWaitingBannerIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fanWaitingBannerContent: {
    flex: 1,
  },
  fanWaitingBannerTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 3,
  },
  fanWaitingBannerSubtitle: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    fontWeight: '500',
  },
  behaviorWarningCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 20,
    marginBottom: 20,
    marginTop: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
    width: '100%',
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
  waitingTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 24,
  },
  callNextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 30,
  },
  callNextButtonText: {
    color: '#4ade80',
    fontSize: 18,
    fontWeight: '700',
  },
  showQRButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  showQRButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  videoCallButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#3b82f6',
    borderRadius: 25,
  },
  videoCallButtonDisabled: {
    backgroundColor: '#374151',
    opacity: 0.6,
    shadowOpacity: 0,
    elevation: 0,
  },
  videoCallButtonTextDisabled: {
    color: '#9ca3af',
  },
  dedicationRequiredHint: {
    color: '#9ca3af',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 10,
    fontWeight: '500',
  },
  videoCallButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  startVideoCallButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: '#10B981',
    paddingVertical: 18,
    paddingHorizontal: 32,
    borderRadius: 16,
    marginTop: 24,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  startVideoCallButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  endedSection: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  endedTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 12,
  },
  endedStats: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 32,
  },
  backHomeButton: {
    backgroundColor: '#fff',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 25,
  },
  backHomeButtonText: {
    color: '#4ade80',
    fontSize: 16,
    fontWeight: '700',
  },
  calledFanCard: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 2,
    borderColor: '#f59e0b',
    width: '100%',
  },
  calledFanPulse: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 16,
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
  },
  calledFanLabel: {
    fontSize: 14,
    color: '#f59e0b',
    marginBottom: 8,
  },
  calledFanName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  calledFanTimer: {
    fontSize: 32,
    fontWeight: '900',
    color: '#f59e0b',
    marginBottom: 16,
  },
  skipCalledFanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  skipCalledFanText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  queueListSection: {
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    padding: 16,
    marginTop: 20,
    marginBottom: 20,
  },
  queueListTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 12,
  },
  queueListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  queuePosition: {
    fontSize: 16,
    fontWeight: '700',
    color: '#4ade80',
    width: 40,
  },
  queueFanName: {
    fontSize: 14,
    color: '#fff',
    flex: 1,
  },
  queueStatusBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  queueStatusCalled: {
    backgroundColor: 'rgba(245, 158, 11, 0.3)',
  },
  queueStatusText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '500',
  },
  queueMoreText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
    textAlign: 'center',
    marginTop: 10,
  },
  dedicationSetupSection: {
    marginTop: 24,
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.3)',
    width: '100%',
  },
  dedicationSetupTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 6,
  },
  dedicationSetupHint: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 18,
  },
  dedicationPhotoStep: {
    alignItems: 'center',
  },
  dedicationStepBadge: {
    backgroundColor: '#8b5cf6',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
    marginBottom: 8,
  },
  dedicationStepBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  dedicationStepLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
    textAlign: 'center',
  },
  dedicationPhotoButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  dedicationPhotoButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#8b5cf6',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 12,
    minHeight: 44,
  },
  dedicationPhotoButtonAlt: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  dedicationPhotoButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  dedicationPhotoButtonTextAlt: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  dedicationSignatureStep: {
    alignItems: 'center',
  },
  dedicationPhotoPreview: {
    width: 120,
    height: 160,
    borderRadius: 12,
    marginBottom: 16,
  },
  dedicationSignatureActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
    width: '100%',
  },
  dedicationClearButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingVertical: 12,
    borderRadius: 12,
  },
  dedicationClearButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  dedicationSaveButton: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#10B981',
    paddingVertical: 12,
    borderRadius: 12,
  },
  dedicationSaveButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  dedicationDoneStep: {
    alignItems: 'center',
  },
  dedicationDoneCheck: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(74, 222, 128, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  dedicationDoneText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#4ade80',
    marginBottom: 12,
  },
  dedicationDonePreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 12,
  },
  dedicationPhotoPreviewSmall: {
    width: 80,
    height: 107,
    borderRadius: 8,
  },
  dedicationSignaturePreview: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.3)',
  },
  dedicationResetButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  dedicationResetText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    textDecorationLine: 'underline',
  },
  earningsStat: {
    backgroundColor: '#22c55e',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    borderWidth: 0,
  },
  earningsStatAnimating: {
    backgroundColor: '#16a34a',
  },
  earningsText: {
    color: '#fff',
    fontWeight: '700',
  },
  earningsTextAnimating: {
    color: '#fff',
  },
  earningsSummaryCard: {
    backgroundColor: 'rgba(74, 222, 128, 0.1)',
    borderRadius: 16,
    padding: 20,
    marginTop: 20,
    borderWidth: 1,
    borderColor: 'rgba(74, 222, 128, 0.3)',
    alignItems: 'center' as const,
  },
  earningsSummaryHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    marginBottom: 12,
  },
  earningsSummaryTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#4ade80',
  },
  earningsSummaryAmount: {
    fontSize: 36,
    fontWeight: '800' as const,
    color: '#fff',
    marginBottom: 4,
  },
  earningsSummaryDetail: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    marginBottom: 8,
  },
  earningsSummaryPayout: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    fontStyle: 'italic' as const,
  },
});
