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
} from 'react-native';
import { showAlert, showConfirm } from '@/utils/alertHelper';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
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
  Pen,
  Trash,
  ChevronRight,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  LiveSession,
  QueueEntry,
  getSessionById,
  startSession,
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
  notifyCelebrityFanJoined,
  notifyCelebrityQueueFull,
  QueueEntry as SessionQueueEntry,
} from '@/utils/sessionQueueStorage';

let Notifications: any = null;
try {
  if (Platform.OS !== 'web') {
    Notifications = require('expo-notifications');
  }
} catch (e) {}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CANVAS_SIZE = SCREEN_WIDTH - 80;

export default function LiveSessionDashboardScreen() {
  const router = useRouter();
  const { sessionId, sessionData } = useLocalSearchParams<{ sessionId: string; sessionData?: string }>();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();

  const [session, setSession] = useState<LiveSession | null>(null);
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [currentFan, setCurrentFan] = useState<QueueEntry | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<string>('--:--');
  const [fanTimeRemaining, setFanTimeRemaining] = useState<string>('--:--');
  const [showQR, setShowQR] = useState(true);
  const [copied, setCopied] = useState(false);
  const [isCreatingVideoRoom, setIsCreatingVideoRoom] = useState(false);
  const [isInVideoCall, setIsInVideoCall] = useState(false);

  const [dedicationPhotoUri, setDedicationPhotoUri] = useState<string | null>(null);
  const [dedicationStep, setDedicationStep] = useState<'photo' | 'signature' | 'done'>('photo');
  const [dedicationPaths, setDedicationPaths] = useState<string[]>([]);
  const [dedicationCurrentPath, setDedicationCurrentPath] = useState<string>('');
  const dedicationPathRef = useRef<string>('');
  const [isUploadingDedication, setIsUploadingDedication] = useState(false);
  const [isDrawingDedication, setIsDrawingDedication] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const [paths, setPaths] = useState<string[]>([]);
  const [currentPath, setCurrentPath] = useState<string>('');
  const pathRef = useRef<string>('');
  
  const [sessionQueue, setSessionQueue] = useState<SessionQueueEntry[]>([]);
  const [calledFan, setCalledFan] = useState<SessionQueueEntry | null>(null);
  const [fanCallTimeout, setFanCallTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);
  const FAN_RESPONSE_TIMEOUT_MS = 30000;
  const hasPlayedQueueFullChime = useRef(false);
  const hasPlayedFirstFanChime = useRef(false);
  const [queueFull, setQueueFull] = useState(false);
  const [firstFanJoined, setFirstFanJoined] = useState(false);

  useEffect(() => {
    if (!sessionId) return;

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
      const current = updatedQueue.find(
        (e) => e.status === 'current' || e.status === 'signing'
      );
      setCurrentFan(current || null);
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
    if (!session?.ends_at || session.status !== 'active') return;

    const interval = setInterval(() => {
      const now = new Date().getTime();
      const end = new Date(session.ends_at!).getTime();
      const diff = Math.max(0, end - now);

      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      setTimeRemaining(`${minutes}:${seconds.toString().padStart(2, '0')}`);

      if (diff <= 0) {
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

      const waitingInQueue = fullQueue.filter((e) => e.status === 'waiting' || e.status === 'called' || e.status === 'in_call').length;

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
          } catch (e) {}
        }
        if (Platform.OS !== 'web') {
          try {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch (e) {}
        }
        const fanName = fullQueue.find((e) => e.status === 'waiting' || e.status === 'called' || e.status === 'in_call')?.fan_name || '';
        showAlert(
          t('firstFanJoinedTitle') || 'Premier fan connecté !',
          (t('firstFanJoinedMessage') || '{name} a rejoint la file d\'attente !').replace('{name}', fanName)
        );
        setTimeout(() => setFirstFanJoined(false), 4000);
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
            } catch (e) {}
          }
          if (Platform.OS !== 'web') {
            try {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch (e) {}
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
  }, [sessionId]);

  useEffect(() => {
    return () => {
      if (fanCallTimeout) {
        clearTimeout(fanCallTimeout);
      }
    };
  }, [fanCallTimeout]);

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
          `${session.celebrity_name} - SignTouch`,
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
              `${session.celebrity_name} - SignTouch`,
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

  const handleStart = async () => {
    if (!sessionId) return;
    console.log('[Dashboard] Starting session:', sessionId);
    const result = await startSession(sessionId);
    console.log('[Dashboard] Start session result:', result);
    if (result) {
      setShowQR(false);
      const updatedSession = await getSessionById(sessionId);
      if (updatedSession) {
        setSession(updatedSession);
        console.log('[Dashboard] Session updated:', updatedSession.status);
      }
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
          await endSession(sessionId);
          router.replace('/');
        },
      },
    ]);
  };

  const handleNextFan = async () => {
    if (!sessionId) return;

    if (currentFan && paths.length > 0) {
      const fullSvg = `<svg viewBox="0 0 ${CANVAS_SIZE} ${CANVAS_SIZE}">${paths.map((p) => `<path d="${p}" stroke="#000" stroke-width="3" fill="none"/>`).join('')}</svg>`;
      await completeSignature(currentFan.id, fullSvg, null);
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

  const handleTakeDedicationPhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        showAlert(t('error'), t('cameraPermissionDenied'));
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: 'images' as any,
        quality: 0.8,
        allowsEditing: true,
        aspect: [3, 4],
      });

      if (!result.canceled && result.assets[0]) {
        const uri = result.assets[0].uri;
        setDedicationPhotoUri(uri);
        setIsUploadingDedication(true);

        if (sessionId) {
          const uploadedUrl = await uploadDedicationPhoto(sessionId, uri);
          if (uploadedUrl) {
            await AsyncStorage.setItem(`dedication_photo_${sessionId}`, uploadedUrl);
          } else {
            await AsyncStorage.setItem(`dedication_photo_${sessionId}`, uri);
          }
        }
        setIsUploadingDedication(false);
        setDedicationStep('signature');
      }
    } catch (error) {
      console.error('Error taking dedication photo:', error);
      setIsUploadingDedication(false);
    }
  };

  const handlePickDedicationPhoto = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images' as any,
        quality: 0.8,
        allowsEditing: true,
        aspect: [3, 4],
      });

      if (!result.canceled && result.assets[0]) {
        const uri = result.assets[0].uri;
        setDedicationPhotoUri(uri);
        setIsUploadingDedication(true);

        if (sessionId) {
          const uploadedUrl = await uploadDedicationPhoto(sessionId, uri);
          if (uploadedUrl) {
            await AsyncStorage.setItem(`dedication_photo_${sessionId}`, uploadedUrl);
          } else {
            await AsyncStorage.setItem(`dedication_photo_${sessionId}`, uri);
          }
        }
        setIsUploadingDedication(false);
        setDedicationStep('signature');
      }
    } catch (error) {
      console.error('Error picking dedication photo:', error);
      setIsUploadingDedication(false);
    }
  };

  const dedicationPanGesture = Gesture.Pan()
    .minDistance(0)
    .onStart((e) => {
      setIsDrawingDedication(true);
      dedicationPathRef.current = `M${e.x.toFixed(1)},${e.y.toFixed(1)}`;
      setDedicationCurrentPath(dedicationPathRef.current);
    })
    .onUpdate((e) => {
      dedicationPathRef.current += ` L${e.x.toFixed(1)},${e.y.toFixed(1)}`;
      setDedicationCurrentPath(dedicationPathRef.current);
    })
    .onEnd(() => {
      if (dedicationPathRef.current) {
        setDedicationPaths((prev) => [...prev, dedicationPathRef.current]);
      }
      dedicationPathRef.current = '';
      setDedicationCurrentPath('');
      setIsDrawingDedication(false);
    })
    .onFinalize(() => {
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
    await updateDedicationSignature(sessionId, svgData);
    setIsUploadingDedication(false);
    setDedicationStep('done');
  };

  const handleResetDedication = async () => {
    setDedicationPhotoUri(null);
    setDedicationPaths([]);
    setDedicationCurrentPath('');
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

  const DEDICATION_CANVAS_SIZE = SCREEN_WIDTH - 100;

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

        if (nextFan.push_token) {
          await sendQueueNotification(
            nextFan.push_token,
            `${session.celebrity_name} - SignTouch`,
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
      if (pathRef.current) {
        setPaths((prev) => [...prev, pathRef.current]);
        if (currentFan) {
          const allPaths = [...paths, pathRef.current];
          const fullSvg = allPaths.join('|||');
          updateSignatureSvg(currentFan.id, fullSvg);
        }
      }
      pathRef.current = '';
      setCurrentPath('');
    });

  const waitingCount = queue.filter((e) => e.status === 'waiting').length;

  if (!session) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <Text style={styles.loadingText}>{t('loading')}...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient colors={['#1a1a2e', '#16213e', '#0f3460']} style={StyleSheet.absoluteFill} />

      <View style={styles.header}>
        <View style={styles.headerInfo}>
          <Text style={styles.sessionName}>{session.celebrity_name}</Text>
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
          </View>
        </View>

        <View style={styles.headerActions}>
          {session.status === 'waiting' && (
            <TouchableOpacity style={styles.actionButton} onPress={handleStart}>
              <Play size={24} color="#fff" fill="#fff" />
            </TouchableOpacity>
          )}
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

      <ScrollView ref={scrollRef} style={styles.content} contentContainerStyle={styles.contentContainer} scrollEnabled={!isDrawingDedication}>
        {showQR && session.status === 'waiting' && (
          <View style={styles.qrSection}>
            <Text style={styles.qrTitle}>{t('liveSessionShareCode')}</Text>
            <View style={styles.qrContainer}>
              <QRCode value={`signtouch://live/${session.code}`} size={180} />
            </View>
            <TouchableOpacity style={styles.codeContainer} onPress={copyCode}>
              <Text style={styles.codeText}>{session.code}</Text>
              {copied ? (
                <Check size={20} color="#4ade80" />
              ) : (
                <Copy size={20} color="#fff" />
              )}
            </TouchableOpacity>
            <Text style={styles.qrHint}>{t('liveSessionShareHint')}</Text>

            <View style={styles.dedicationSetupSection}>
              <Text style={styles.dedicationSetupTitle}>{t('dedicationSetupTitle')}</Text>
              <Text style={styles.dedicationSetupHint}>{t('dedicationSetupHint')}</Text>

              {dedicationStep === 'photo' && (
                <View style={styles.dedicationPhotoStep}>
                  <View style={styles.dedicationStepBadge}>
                    <Text style={styles.dedicationStepBadgeText}>1/2</Text>
                  </View>
                  <Text style={styles.dedicationStepLabel}>{t('dedicationTakePhoto')}</Text>
                  <View style={styles.dedicationPhotoButtons}>
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
                  </View>
                </View>
              )}

              {dedicationStep === 'signature' && (
                <View style={styles.dedicationSignatureStep}>
                  <View style={styles.dedicationStepBadge}>
                    <Text style={styles.dedicationStepBadgeText}>2/2</Text>
                  </View>
                  {dedicationPhotoUri && (
                    <Image source={{ uri: dedicationPhotoUri }} style={styles.dedicationPhotoPreview} resizeMode="cover" />
                  )}
                  <Text style={styles.dedicationStepLabel}>{t('dedicationDrawSignature')}</Text>
                  {Platform.OS === 'web' ? (
                    <View
                      style={[styles.canvas, { width: DEDICATION_CANVAS_SIZE, height: DEDICATION_CANVAS_SIZE * 0.5, touchAction: 'none' } as any]}
                      onPointerDown={(e: any) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const x = e.clientX - rect.left;
                        const y = e.clientY - rect.top;
                        dedicationPathRef.current = `M${x.toFixed(1)},${y.toFixed(1)}`;
                        setDedicationCurrentPath(dedicationPathRef.current);
                        setIsDrawingDedication(true);
                      }}
                      onPointerMove={(e: any) => {
                        if (!isDrawingDedication) return;
                        const rect = e.currentTarget.getBoundingClientRect();
                        const x = e.clientX - rect.left;
                        const y = e.clientY - rect.top;
                        dedicationPathRef.current += ` L${x.toFixed(1)},${y.toFixed(1)}`;
                        setDedicationCurrentPath(dedicationPathRef.current);
                      }}
                      onPointerUp={() => {
                        if (dedicationPathRef.current) {
                          setDedicationPaths((prev) => [...prev, dedicationPathRef.current]);
                        }
                        dedicationPathRef.current = '';
                        setDedicationCurrentPath('');
                        setIsDrawingDedication(false);
                      }}
                      onPointerLeave={() => {
                        if (isDrawingDedication && dedicationPathRef.current) {
                          setDedicationPaths((prev) => [...prev, dedicationPathRef.current]);
                        }
                        dedicationPathRef.current = '';
                        setDedicationCurrentPath('');
                        setIsDrawingDedication(false);
                      }}
                    >
                      <Svg width={DEDICATION_CANVAS_SIZE} height={DEDICATION_CANVAS_SIZE * 0.5}>
                        {dedicationPaths.map((p, i) => (
                          <Path key={i} d={p} stroke="#000" strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                        ))}
                        {dedicationCurrentPath && (
                          <Path d={dedicationCurrentPath} stroke="#000" strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                        )}
                      </Svg>
                    </View>
                  ) : (
                    <GestureDetector gesture={dedicationPanGesture}>
                      <View style={[styles.canvas, { width: DEDICATION_CANVAS_SIZE, height: DEDICATION_CANVAS_SIZE * 0.5 }]}>
                        <Svg width={DEDICATION_CANVAS_SIZE} height={DEDICATION_CANVAS_SIZE * 0.5}>
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
                  {dedicationPhotoUri && (
                    <Image source={{ uri: dedicationPhotoUri }} style={styles.dedicationPhotoPreviewSmall} resizeMode="cover" />
                  )}
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
                <Video size={24} color="#fff" />
              )}
              <Text style={styles.startVideoCallButtonText}>
                {isCreatingVideoRoom ? t('connectingToCall') : t('startVideoCall')}
              </Text>
            </TouchableOpacity>
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
                    {sessionQueue.length > 0 && (
                      <TouchableOpacity style={styles.callNextButton} onPress={handleCallNextFromQueue}>
                        <Users size={24} color="#4ade80" />
                        <Text style={styles.callNextButtonText}>{t('callNextFan') || 'Call next fan'}</Text>
                      </TouchableOpacity>
                    )}
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
                  <QRCode value={`signtouch://live/${session.code}`} size={120} />
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
  headerInfo: {
    flex: 1,
  },
  sessionName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
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
    marginBottom: 24,
  },
  qrTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 16,
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
    opacity: 0.7,
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
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 12,
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
    gap: 10,
    backgroundColor: '#8b5cf6',
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 14,
    minHeight: 52,
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
  dedicationPhotoPreviewSmall: {
    width: 80,
    height: 107,
    borderRadius: 8,
    marginBottom: 12,
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
});
