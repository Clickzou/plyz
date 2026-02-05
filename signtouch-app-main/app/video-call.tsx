import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, PhoneOff, Clock } from 'lucide-react-native';
import { useLanguage } from '../contexts/LanguageContext';

export default function VideoCallScreen() {
  const router = useRouter();
  const { t } = useLanguage();
  const webViewRef = useRef<WebView>(null);
  const params = useLocalSearchParams<{
    roomUrl: string;
    token: string;
    isHost: string;
    sessionId: string;
    userName: string;
    durationPerFan: string;
  }>();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fanTimeRemaining, setFanTimeRemaining] = useState<string>('--:--');
  const callStartTime = useRef<number>(Date.now());

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
    }, 1000);

    return () => clearInterval(interval);
  }, [params.durationPerFan]);

  const isHost = params.isHost === 'true';
  const userName = params.userName || (isHost ? 'Host' : 'Guest');

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
    
    return `${baseUrl}?${urlParams.toString()}`;
  };

  const handleWebViewMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.action === 'left-meeting') {
        router.back();
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

  const leaveCall = () => {
    router.back();
  };

  const dailyUrl = getDailyPrebuiltUrl();

  if (!dailyUrl) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{t('videoCallError')}</Text>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>{t('goBack')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const injectedJavaScript = `
    (function() {
      window.addEventListener('message', function(event) {
        if (event.data && event.data.action) {
          window.ReactNativeWebView.postMessage(JSON.stringify(event.data));
        }
      });
      
      const observer = new MutationObserver(function(mutations) {
        const leaveBtn = document.querySelector('[data-testid="leave-meeting"]');
        if (leaveBtn) {
          leaveBtn.addEventListener('click', function() {
            window.ReactNativeWebView.postMessage(JSON.stringify({action: 'left-meeting'}));
          });
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    })();
    true;
  `;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerButton} onPress={() => router.back()}>
          <ArrowLeft size={24} color="#fff" />
        </TouchableOpacity>
        
        {isHost && params.durationPerFan ? (
          <View style={styles.timerContainer}>
            <Clock size={18} color="#fff" />
            <Text style={styles.timerText}>{fanTimeRemaining}</Text>
          </View>
        ) : (
          <Text style={styles.headerTitle}>
            {isHost ? t('host') : t('startVideoCall')}
          </Text>
        )}
        
        <TouchableOpacity style={styles.endCallHeaderButton} onPress={leaveCall}>
          <PhoneOff size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#10B981" />
          <Text style={styles.loadingText}>{t('connectingToCall')}</Text>
        </View>
      )}

      {error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>{t('goBack')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <WebView
          ref={webViewRef}
          source={{ uri: dailyUrl }}
          style={styles.webview}
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
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f0f',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#1f1f1f',
  },
  headerButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  timerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10B981',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 8,
  },
  timerText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  endCallHeaderButton: {
    width: 40,
    height: 40,
    backgroundColor: '#dc2626',
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  webview: {
    flex: 1,
    backgroundColor: '#0f0f0f',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0f0f0f',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    gap: 16,
  },
  loadingText: {
    color: '#fff',
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 16,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  errorSubtext: {
    color: '#9ca3af',
    fontSize: 14,
    textAlign: 'center',
  },
  backButton: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#374151',
    borderRadius: 8,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
