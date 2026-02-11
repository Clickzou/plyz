import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, PhoneOff, Clock, Video, Users } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useLanguage } from '../contexts/LanguageContext';
import RatingModal from '@/components/RatingModal';
import { submitRating, getOrCreateDeviceId } from '@/utils/ratingsStorage';
import { sendDedicationNotification, callNextFan } from '@/utils/sessionQueueStorage';
import { recordTransaction } from '@/utils/transactionStorage';
import { showAlert, showConfirm } from '@/utils/alertHelper';

const STRIPE_SERVER_URL = process.env.EXPO_PUBLIC_STRIPE_SERVER_URL || '';

let WebView: any = null;
if (Platform.OS !== 'web') {
  WebView = require('react-native-webview').WebView;
}

let ScreenOrientation: any = null;
if (Platform.OS !== 'web') {
  try {
    ScreenOrientation = require('expo-screen-orientation');
  } catch (e) {}
}

const DAILY_SUPPORTED_LANGS: Record<string, string> = {
  en: 'en',
  fr: 'fr',
  es: 'es',
  de: 'de',
  it: 'it',
  pt: 'pt',
  ja: 'ja',
  nl: 'nl',
};

export default function VideoCallScreen() {
  const router = useRouter();
  const { t, language } = useLanguage();
  const webViewRef = useRef<any>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const params = useLocalSearchParams<{
    roomUrl: string;
    token: string;
    isHost: string;
    sessionId: string;
    userName: string;
    durationPerFan: string;
    fansRemaining: string;
    queueEntryId: string;
    otherUserId: string;
    otherUserName: string;
    priceCents: string;
    celebrityId: string;
    checkoutSessionId: string;
  }>();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fanTimeRemaining, setFanTimeRemaining] = useState<string>('--:--');
  const [timeProgress, setTimeProgress] = useState(1);
  const [timeWarning, setTimeWarning] = useState(false);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [hasLeftCall, setHasLeftCall] = useState(false);
  const [paymentCaptured, setPaymentCaptured] = useState(false);
  const callStartTime = useRef<number>(0);
  const autoEndTriggered = useRef(false);
  const [otherParticipantJoined, setOtherParticipantJoined] = useState(false);
  const [waitingForNextFan, setWaitingForNextFan] = useState(false);
  const [currentFanName, setCurrentFanName] = useState(params.otherUserName || 'Fan');
  const [fansRemainingCount, setFansRemainingCount] = useState(parseInt(params.fansRemaining || '0', 10));

  useEffect(() => {
    if (ScreenOrientation) {
      ScreenOrientation.lockAsync(
        ScreenOrientation.OrientationLock.PORTRAIT_UP
      ).catch(() => {});
      return () => {
        ScreenOrientation.unlockAsync().catch(() => {});
      };
    }
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') {
      const timer = setTimeout(() => {
        setIsLoading(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    const durationMinutes = parseInt(params.durationPerFan || '5', 10);
    if (!durationMinutes || !otherParticipantJoined) return;

    if (callStartTime.current === 0) {
      callStartTime.current = Date.now();
    }

    const durationMs = durationMinutes * 60 * 1000;

    const interval = setInterval(() => {
      const endTime = callStartTime.current + durationMs;
      const now = Date.now();
      const diff = Math.max(0, endTime - now);

      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      setFanTimeRemaining(`${minutes}:${seconds.toString().padStart(2, '0')}`);
      setTimeProgress(diff / durationMs);
      setTimeWarning(diff < 60000 && diff > 0);

      if (diff <= 0 && !autoEndTriggered.current) {
        autoEndTriggered.current = true;
        handleCallEnded();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [params.durationPerFan, otherParticipantJoined]);

  const isHost = params.isHost === 'true';
  const userName = params.userName || (isHost ? 'Host' : 'Guest');
  const dailyLang = DAILY_SUPPORTED_LANGS[language] || 'en';

  const getDailyPrebuiltUrl = () => {
    const baseUrl = params.roomUrl;
    if (!baseUrl) return null;
    
    const urlParams = new URLSearchParams();
    if (params.token) {
      urlParams.append('t', params.token);
    }
    urlParams.append('userName', userName);
    urlParams.append('showLeaveButton', 'false');
    urlParams.append('showFullscreenButton', 'false');
    urlParams.append('showParticipantsBar', 'false');
    urlParams.append('activeSpeakerMode', 'false');
    urlParams.append('lang', dailyLang);
    urlParams.append('controlBarPosition', 'hidden');
    
    return `${baseUrl}?${urlParams.toString()}`;
  };

  const handleWebViewMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.action === 'left-meeting') {
        handleCallEnded();
      } else if (data.action === 'participant-joined') {
        setOtherParticipantJoined(true);
      }
    } catch (e) {
    }
  };

  const handleWebViewError = () => {
    setError(t('videoCallError'));
    setIsLoading(false);
  };

  const handleLoadEnd = () => {
    setIsLoading(false);
  };

  const handleCallEnded = () => {
    if (!hasLeftCall) {
      setHasLeftCall(true);
      setShowRatingModal(true);
    }
  };

  const leaveCall = () => {
    handleCallEnded();
  };

  const handleSubmitRating = async (rating: number) => {
    try {
      const myDeviceId = await getOrCreateDeviceId();
      const otherUserId = params.otherUserId || (isHost ? 'fan_unknown' : params.sessionId || 'celebrity_unknown');
      
      await submitRating(
        params.sessionId || '',
        params.queueEntryId || null,
        myDeviceId,
        isHost ? 'celebrity' : 'fan',
        otherUserId,
        isHost ? 'fan' : 'celebrity',
        rating
      );
    } catch (error) {
      console.error('Error submitting rating:', error);
    }
  };

  const capturePaymentAfterCall = async () => {
    if (!params.checkoutSessionId || paymentCaptured) return;

    setPaymentCaptured(true);

    try {
      console.log('[VideoCall] Capturing payment for checkout session:', params.checkoutSessionId);
      const response = await fetch(`${STRIPE_SERVER_URL}/api/capture-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkout_session_id: params.checkoutSessionId }),
      });
      const data = await response.json();

      if (data.captured) {
        const amountEuros = data.amount ? (data.amount / 100).toFixed(2) : (parseInt(params.priceCents || '0', 10) / 100).toFixed(2);
        console.log('[VideoCall] Payment captured successfully:', amountEuros, '€');
        showConfirm(
          t('paymentConfirmed'),
          t('paymentCapturedMessage').replace('{amount}', amountEuros),
          [{ text: 'OK', style: 'default', onPress: () => router.replace('/') }]
        );
      } else {
        console.error('[VideoCall] Payment capture failed:', data);
        setPaymentCaptured(false);
      }
    } catch (error) {
      console.error('[VideoCall] Error capturing payment:', error);
      setPaymentCaptured(false);
    }
  };

  const handleCallNextFan = async () => {
    if (!params.sessionId) {
      router.back();
      return;
    }

    setWaitingForNextFan(true);
    setOtherParticipantJoined(false);
    callStartTime.current = 0;
    autoEndTriggered.current = false;
    setHasLeftCall(false);
    setFanTimeRemaining(`${params.durationPerFan || '5'}:00`);
    setTimeProgress(1);
    setTimeWarning(false);

    try {
      const nextFan = await callNextFan(params.sessionId);
      if (nextFan) {
        setCurrentFanName(nextFan.fan_name || 'Fan');
        setFansRemainingCount(prev => Math.max(0, prev - 1));
      } else {
        setWaitingForNextFan(false);
        showConfirm(
          t('noMoreFansTitle'),
          t('noMoreFansMessage'),
          [{ text: 'OK', style: 'default', onPress: () => router.back() }]
        );
      }
    } catch (error) {
      console.error('[VideoCall] Error calling next fan:', error);
      setWaitingForNextFan(false);
      router.back();
    }
  };

  useEffect(() => {
    if (waitingForNextFan && otherParticipantJoined) {
      setWaitingForNextFan(false);
    }
  }, [waitingForNextFan, otherParticipantJoined]);

  useEffect(() => {
    if (!waitingForNextFan) return;
    const timeout = setTimeout(() => {
      if (waitingForNextFan) {
        setWaitingForNextFan(false);
        showConfirm(
          t('noMoreFansTitle'),
          t('noMoreFansMessage'),
          [{ text: 'OK', style: 'default', onPress: () => router.back() }]
        );
      }
    }, 120000);
    return () => clearTimeout(timeout);
  }, [waitingForNextFan]);

  const handleRatingModalClose = async () => {
    setShowRatingModal(false);
    if (!isHost && params.sessionId) {
      const priceCents = parseInt(params.priceCents || '0', 10);
      if (priceCents > 0) {
        if (params.checkoutSessionId) {
          await capturePaymentAfterCall();
        }

        const fanDeviceId = await getOrCreateDeviceId();
        const storePlatform = Platform.OS === 'ios' ? 'apple' : 'google';
        recordTransaction({
          sessionId: params.sessionId,
          fanId: fanDeviceId,
          fanName: params.userName || undefined,
          celebrityId: params.celebrityId || params.otherUserId || '',
          celebrityName: params.otherUserName || 'Celebrity',
          grossAmountCents: priceCents,
          currency: 'EUR',
          platform: storePlatform,
        }).catch((err) => console.error('Error recording transaction:', err));
      }

      sendDedicationNotification(
        params.sessionId,
        params.queueEntryId || null,
        params.otherUserName || 'Celebrity'
      ).catch(() => {});

      router.replace({
        pathname: '/dedication-result',
        params: {
          sessionId: params.sessionId,
          fanName: params.userName || '',
          celebrityName: params.otherUserName || '',
        },
      });
    } else if (isHost) {
      await handleCallNextFan();
    } else {
      router.back();
    }
  };

  const dailyUrl = getDailyPrebuiltUrl();

  if (!dailyUrl) {
    return (
      <View style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.errorContainer}>
          <View style={styles.errorIconCircle}>
            <Video size={40} color="#ef4444" />
          </View>
          <Text style={styles.errorTitle}>{t('videoCallError')}</Text>
          <Text style={styles.errorSubtext}>{t('videoCallConnectionFailed')}</Text>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>{t('goBack')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const injectedJavaScript = `
    (function() {
      var style = document.createElement('style');
      style.textContent = [
        '* { box-sizing: border-box; }',
        'html, body { margin: 0; padding: 0; width: 100vw; height: 100vh; overflow: hidden; background: #000; }',
        'video { object-fit: cover !important; }',
        '[class*="tile"], [class*="Tile"] { border-radius: 0 !important; }',
        '[class*="grid"], [class*="Grid"], [class*="call-container"], [class*="videogrid"] { gap: 0 !important; padding: 0 !important; margin: 0 !important; }',
        '[class*="topbar"], [class*="Topbar"], [class*="top-bar"], [class*="TopBar"], [class*="header-actions"], [class*="HeaderActions"] { display: none !important; }',
        '[class*="leave"], [class*="Leave"] { display: none !important; }',
        '[class*="tray"], [class*="Tray"], [class*="controls-bar"], [class*="ControlsBar"], [class*="control-bar"], [class*="toolbar"], [class*="Toolbar"], [class*="bottom-bar"], [class*="BottomBar"] { display: none !important; }',
      ].join(' ');
      document.head.appendChild(style);

      window.addEventListener('message', function(event) {
        if (event.data && event.data.action) {
          window.ReactNativeWebView.postMessage(JSON.stringify(event.data));
        }
      });

      var participantCheckInterval = setInterval(function() {
        var videos = document.querySelectorAll('video');
        if (videos.length >= 2) {
          clearInterval(participantCheckInterval);
          window.ReactNativeWebView.postMessage(JSON.stringify({action: 'participant-joined'}));
        }
      }, 1000);
      
      var observer = new MutationObserver(function(mutations) {
        var leaveBtn = document.querySelector('[data-testid="leave-meeting"]');
        if (leaveBtn) {
          leaveBtn.addEventListener('click', function() {
            window.ReactNativeWebView.postMessage(JSON.stringify({action: 'left-meeting'}));
          });
        }
        var videos = document.querySelectorAll('video');
        videos.forEach(function(v) {
          v.setAttribute('playsinline', '');
          v.style.objectFit = 'cover';
        });
      });
      observer.observe(document.body, { childList: true, subtree: true });
    })();
    true;
  `;

  const renderVideoContent = () => {
    if (error) {
      return (
        <View style={styles.errorContainer}>
          <View style={styles.errorIconCircle}>
            <Video size={40} color="#ef4444" />
          </View>
          <Text style={styles.errorTitle}>{error}</Text>
          <Text style={styles.errorSubtext}>{t('videoCallConnectionFailed')}</Text>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>{t('goBack')}</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (Platform.OS === 'web') {
      return (
        <View style={styles.videoArea}>
          <div
            ref={(el: any) => {
              if (el && !el._dailyInitialized) {
                el._dailyInitialized = true;
                const script = document.createElement('script');
                script.src = 'https://unpkg.com/@daily-co/daily-js';
                script.onload = () => {
                  try {
                    const callFrame = (window as any).DailyIframe.createFrame(el, {
                      showLeaveButton: false,
                      showFullscreenButton: false,
                      showLocalVideo: true,
                      showParticipantsBar: false,
                      customTrayButtons: {},
                      iframeStyle: {
                        width: '100%',
                        height: '100%',
                        border: '0',
                        borderRadius: '0',
                      },
                    });
                    const joinUrl = params.roomUrl || '';
                    const joinOptions: any = { url: joinUrl, userName };
                    if (params.token) {
                      joinOptions.token = params.token;
                    }
                    callFrame.setTheme({
                      colors: {
                        accent: '#8b5cf6',
                        accentText: '#FFFFFF',
                        background: '#000000',
                        backgroundAccent: '#1a1a2e',
                        baseText: '#FFFFFF',
                        border: '#2e2e4a',
                        mainAreaBg: '#000000',
                        mainAreaBgAccent: '#1a1a2e',
                        mainAreaText: '#FFFFFF',
                        supportiveText: '#aaaaaa',
                      },
                    });
                    callFrame.join({ ...joinOptions, startVideoOff: false, startAudioOff: false }).then(() => {
                      setIsLoading(false);
                      try {
                        const iframe = el.querySelector('iframe');
                        if (iframe && iframe.contentDocument) {
                          const hideStyle = iframe.contentDocument.createElement('style');
                          hideStyle.textContent = '[class*="tray"], [class*="Tray"], [class*="controls-bar"], [class*="ControlsBar"], [class*="toolbar"], [class*="Toolbar"], [class*="bottom-bar"], [class*="BottomBar"] { display: none !important; }';
                          iframe.contentDocument.head.appendChild(hideStyle);
                        }
                      } catch(cssErr) {}
                    }).catch(() => {
                      setError(t('videoCallError'));
                      setIsLoading(false);
                    });
                    callFrame.on('left-meeting', () => {
                      handleCallEnded();
                    });
                    callFrame.on('participant-joined', () => {
                      setOtherParticipantJoined(true);
                    });
                    callFrame.on('participant-left', () => {
                      const participants = callFrame.participants();
                      const remoteCount = Object.keys(participants).filter((k: string) => k !== 'local').length;
                      if (remoteCount === 0) {
                        handleCallEnded();
                      }
                    });
                    (el as any)._dailyCallFrame = callFrame;
                  } catch (e) {
                    setError(t('videoCallError'));
                    setIsLoading(false);
                  }
                };
                script.onerror = () => {
                  setError(t('videoCallError'));
                  setIsLoading(false);
                };
                document.head.appendChild(script);
              }
            }}
            style={{
              position: 'absolute' as any,
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              backgroundColor: '#000',
            }}
          />
        </View>
      );
    }

    if (WebView) {
      return (
        <WebView
          ref={webViewRef}
          source={{ uri: dailyUrl }}
          style={styles.videoArea}
          onLoadEnd={handleLoadEnd}
          onError={handleWebViewError}
          onMessage={handleWebViewMessage}
          injectedJavaScript={injectedJavaScript}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          mediaPlaybackRequiresUserAction={false}
          allowsInlineMediaPlayback={true}
          mediaCapturePermissionGrantType="grant"
          startInLoadingState={false}
          originWhitelist={['*']}
          allowsFullscreenVideo={true}
          userAgent={Platform.select({
            ios: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
            android: 'Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.91 Mobile Safari/537.36',
            default: undefined,
          })}
        />
      );
    }

    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorTitle}>{t('videoCallError')}</Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      
      {renderVideoContent()}

      <View style={styles.headerOverlay}>
        <TouchableOpacity style={styles.headerBackButton} onPress={() => router.back()}>
          <ArrowLeft size={20} color="#fff" />
        </TouchableOpacity>
        
        <View style={styles.headerCenter}>
          {isHost && fansRemainingCount > 0 ? (
            <View style={styles.fansRemainingBadge}>
              <Users size={12} color="#a78bfa" />
              <Text style={styles.fansRemainingText}>
                {fansRemainingCount}
              </Text>
            </View>
          ) : null}

          {params.durationPerFan ? (
            <View style={[styles.timerContainer, timeWarning && styles.timerWarning, !otherParticipantJoined && { opacity: 0.5 }]}>
              <Clock size={isHost ? 14 : 12} color="#fff" />
              <Text style={[styles.timerText, !isHost && styles.timerTextFan]}>
                {otherParticipantJoined ? fanTimeRemaining : `${params.durationPerFan}:00`}
              </Text>
            </View>
          ) : (
            <View style={styles.liveIndicator}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          )}
        </View>
        
        <TouchableOpacity style={styles.endCallButton} onPress={leaveCall}>
          <PhoneOff size={16} color="#fff" />
          <Text style={styles.endCallText}>{t('endCall')}</Text>
        </TouchableOpacity>
      </View>

      {isLoading && (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color="#10B981" />
            <Text style={styles.loadingTitle}>{t('connectingToCall')}</Text>
            <Text style={styles.loadingSubtext}>{t('videoCallPreparing')}</Text>
          </View>
        </View>
      )}

      {waitingForNextFan && (
        <View style={styles.waitingOverlay}>
          <View style={styles.waitingCard}>
            <ActivityIndicator size="large" color="#8b5cf6" />
            <Text style={styles.waitingTitle}>{t('waitingNextFan')}</Text>
            <Text style={styles.waitingSubtext}>
              {fansRemainingCount > 0
                ? t('waitingNextFanHint').replace('{count}', String(fansRemainingCount))
                : t('waitingNextFanConnect')}
            </Text>
            <TouchableOpacity
              style={styles.waitingEndButton}
              onPress={() => {
                setWaitingForNextFan(false);
                router.back();
              }}
            >
              <Text style={styles.waitingEndButtonText}>{t('endSession')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <RatingModal
        visible={showRatingModal}
        onClose={handleRatingModalClose}
        onSubmit={handleSubmitRating}
        userName={currentFanName || (isHost ? 'Fan' : params.userName || 'Celebrity')}
        isCelebrity={isHost}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  headerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: Platform.OS === 'web' ? 8 : 48,
    paddingBottom: 8,
    zIndex: 10,
  },
  headerBackButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#dc2626',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    gap: 6,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#fff',
  },
  liveText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  headerCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  fansRemainingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(167, 139, 250, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    gap: 5,
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.3)',
  },
  fansRemainingText: {
    color: '#a78bfa',
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  timerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10B981',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    gap: 5,
  },
  timerWarning: {
    backgroundColor: '#dc2626',
  },
  timerText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  timerTextFan: {
    fontSize: 13,
  },
  endCallButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#dc2626',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    gap: 5,
  },
  endCallText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  videoArea: {
    flex: 1,
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15, 15, 40, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20,
  },
  loadingCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    gap: 16,
    marginHorizontal: 40,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  loadingTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  loadingSubtext: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    textAlign: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 16,
  },
  errorIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  errorTitle: {
    color: '#ef4444',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  errorSubtext: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  backButton: {
    marginTop: 8,
    paddingHorizontal: 28,
    paddingVertical: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  waitingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 50,
  },
  waitingCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    gap: 16,
    width: '85%',
    maxWidth: 360,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.3)',
  },
  waitingTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  waitingSubtext: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  waitingEndButton: {
    marginTop: 8,
    paddingHorizontal: 28,
    paddingVertical: 12,
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.4)',
  },
  waitingEndButtonText: {
    color: '#ef4444',
    fontSize: 15,
    fontWeight: '600',
  },
});
