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
import { ArrowLeft, PhoneOff, Clock, Video } from 'lucide-react-native';
import { useLanguage } from '../contexts/LanguageContext';
import RatingModal from '@/components/RatingModal';
import { submitRating, getOrCreateDeviceId } from '@/utils/ratingsStorage';

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
    queueEntryId: string;
    otherUserId: string;
    otherUserName: string;
  }>();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fanTimeRemaining, setFanTimeRemaining] = useState<string>('--:--');
  const [timeWarning, setTimeWarning] = useState(false);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [hasLeftCall, setHasLeftCall] = useState(false);
  const callStartTime = useRef<number>(Date.now());

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
    if (!durationMinutes) return;

    const interval = setInterval(() => {
      const durationMs = durationMinutes * 60 * 1000;
      const endTime = callStartTime.current + durationMs;
      const now = Date.now();
      const diff = Math.max(0, endTime - now);

      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      setFanTimeRemaining(`${minutes}:${seconds.toString().padStart(2, '0')}`);
      setTimeWarning(diff < 60000 && diff > 0);
    }, 1000);

    return () => clearInterval(interval);
  }, [params.durationPerFan]);

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
    urlParams.append('showLeaveButton', 'true');
    urlParams.append('showFullscreenButton', 'true');
    urlParams.append('lang', dailyLang);
    
    return `${baseUrl}?${urlParams.toString()}`;
  };

  const handleWebViewMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.action === 'left-meeting') {
        handleCallEnded();
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

  const handleRatingModalClose = () => {
    setShowRatingModal(false);
    router.back();
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
      style.textContent = '* { box-sizing: border-box; } html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: #000; } video { object-fit: cover !important; width: 100% !important; height: 100% !important; }';
      document.head.appendChild(style);

      window.addEventListener('message', function(event) {
        if (event.data && event.data.action) {
          window.ReactNativeWebView.postMessage(JSON.stringify(event.data));
        }
      });
      
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
          <iframe
            ref={iframeRef as any}
            src={dailyUrl}
            allow="camera; microphone; autoplay; display-capture; fullscreen"
            allowFullScreen
            style={{
              position: 'absolute' as any,
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              border: 'none',
              backgroundColor: '#000',
            }}
            onLoad={() => setIsLoading(false)}
            onError={() => {
              setError(t('videoCallError'));
              setIsLoading(false);
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
      
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBackButton} onPress={() => router.back()}>
          <ArrowLeft size={20} color="#fff" />
        </TouchableOpacity>
        
        {isHost && params.durationPerFan ? (
          <View style={[styles.timerContainer, timeWarning && styles.timerWarning]}>
            <Clock size={14} color="#fff" />
            <Text style={styles.timerText}>{fanTimeRemaining}</Text>
          </View>
        ) : (
          <View style={styles.liveIndicator}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        )}
        
        <TouchableOpacity style={styles.endCallButton} onPress={leaveCall}>
          <PhoneOff size={16} color="#fff" />
          <Text style={styles.endCallText}>{t('endCall')}</Text>
        </TouchableOpacity>
      </View>

      {renderVideoContent()}

      {isLoading && (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color="#10B981" />
            <Text style={styles.loadingTitle}>{t('connectingToCall')}</Text>
            <Text style={styles.loadingSubtext}>{t('videoCallPreparing')}</Text>
          </View>
        </View>
      )}

      <RatingModal
        visible={showRatingModal}
        onClose={handleRatingModalClose}
        onSubmit={handleSubmitRating}
        userName={params.otherUserName || (isHost ? 'Fan' : params.userName || 'Celebrity')}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#000',
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
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
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
});
