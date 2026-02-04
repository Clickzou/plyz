import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  Image,
  Dimensions,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
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
} from '@/utils/liveSessionStorage';
import QRCode from 'react-native-qrcode-svg';
import * as Clipboard from 'expo-clipboard';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CANVAS_SIZE = SCREEN_WIDTH - 80;

export default function LiveSessionDashboardScreen() {
  const router = useRouter();
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();

  const [session, setSession] = useState<LiveSession | null>(null);
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [currentFan, setCurrentFan] = useState<QueueEntry | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<string>('--:--');
  const [showQR, setShowQR] = useState(true);
  const [copied, setCopied] = useState(false);

  const [paths, setPaths] = useState<string[]>([]);
  const [currentPath, setCurrentPath] = useState<string>('');
  const pathRef = useRef<string>('');

  useEffect(() => {
    if (!sessionId) return;

    const loadSession = async () => {
      if (sessionId.startsWith('local_session_')) {
        const now = new Date();
        const expiresAt = new Date(now.getTime() + 30 * 60 * 1000);
        const localSession: LiveSession = {
          id: sessionId,
          code: 'LOCAL',
          celebrity_id: 'local_celebrity',
          celebrity_name: 'Session Locale',
          duration_minutes: 30,
          max_slots: 10,
          price_cents: 0,
          status: 'active',
          current_fan_id: null,
          created_at: now.toISOString(),
          expires_at: expiresAt.toISOString(),
        };
        setSession(localSession);
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

  const handleStart = async () => {
    if (!sessionId) return;
    await startSession(sessionId);
    setShowQR(false);
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
    Alert.alert(t('liveSessionEndConfirmTitle'), t('liveSessionEndConfirmMessage'), [
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

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
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
                <Text style={styles.waitingTitle}>
                  {waitingCount > 0
                    ? t('liveSessionFansWaiting', { count: waitingCount })
                    : t('liveSessionNoFansYet')}
                </Text>
                {waitingCount > 0 && (
                  <TouchableOpacity style={styles.callNextButton} onPress={handleNextFan}>
                    <Users size={24} color="#4ade80" />
                    <Text style={styles.callNextButtonText}>{t('liveSessionCallNext')}</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={styles.showQRButton}
                  onPress={() => setShowQR(true)}
                >
                  <QrCode size={20} color="#fff" />
                  <Text style={styles.showQRButtonText}>{t('liveSessionShowQR')}</Text>
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
});
