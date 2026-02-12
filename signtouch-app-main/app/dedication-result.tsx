import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Share,
  Dimensions,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { showAlert } from '@/utils/alertHelper';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Download,
  Share2,
  Home,
  RotateCcw,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { getDedicationAssets } from '@/utils/liveSessionStorage';
import { saveCollectorLive, downloadImageWeb } from '@/utils/collectorLiveStorage';
import ViewShot from 'react-native-view-shot';

const captureWebView = async (element: HTMLElement): Promise<string | null> => {
  if (Platform.OS !== 'web') return null;
  try {
    const html2canvas = (await import('html2canvas')).default;
    const canvas = await html2canvas(element, {
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#000000',
      scale: 2,
    });
    return canvas.toDataURL('image/png');
  } catch (e) {
    console.error('[Dedication] html2canvas error:', e);
    return null;
  }
};

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const PHOTO_WIDTH = SCREEN_WIDTH - 40;
const PHOTO_HEIGHT = PHOTO_WIDTH * (4 / 3);

const SIGNATURE_COLORS = [
  '#FFFFFF', '#000000', '#8b5cf6', '#ef4444', '#f59e0b',
  '#10b981', '#3b82f6', '#ec4899', '#f97316', '#06b6d4',
];

export default function DedicationResultScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const viewShotRef = useRef<any>(null);
  const webCaptureRef = useRef<any>(null);

  const params = useLocalSearchParams<{
    sessionId: string;
    fanName: string;
    celebrityName: string;
    queueEntryId: string;
  }>();

  const [loading, setLoading] = useState(true);
  const [noAssets, setNoAssets] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [signaturePaths, setSignaturePaths] = useState<string[]>([]);
  const [celebrityName, setCelebrityName] = useState('');
  const [signatureColor, setSignatureColor] = useState('#FFFFFF');
  const [isSaving, setIsSaving] = useState(false);

  const sigTranslateX = useSharedValue(0);
  const sigTranslateY = useSharedValue(PHOTO_HEIGHT * 0.55);
  const sigScale = useSharedValue(1);
  const sigRotation = useSharedValue(0);

  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(PHOTO_HEIGHT * 0.55);
  const savedScale = useSharedValue(1);
  const savedRotation = useSharedValue(0);

  useEffect(() => {
    let cancelled = false;
    const loadAssets = async (attempt: number = 1) => {
      if (!params.sessionId) {
        setLoading(false);
        return;
      }

      console.log(`[DedicationResult] Loading assets, attempt ${attempt}, queueEntryId:`, params.queueEntryId);
      const assets = await getDedicationAssets(params.sessionId, params.queueEntryId);
      if (cancelled) return;

      if (assets && assets.photoUrl) {
        console.log('[DedicationResult] Assets loaded successfully, signature:', !!assets.signatureSvg);
        setPhotoUrl(assets.photoUrl);
        setCelebrityName(assets.celebrityName || params.celebrityName || '');
        if (assets.signatureSvg) {
          setSignaturePaths(assets.signatureSvg.split('|||'));
        }
        setLoading(false);
      } else if (attempt < 5) {
        console.log(`[DedicationResult] No assets yet, retrying in ${attempt * 2}s...`);
        setTimeout(() => {
          if (!cancelled) loadAssets(attempt + 1);
        }, attempt * 2000);
      } else {
        console.log('[DedicationResult] No assets after 5 attempts');
        setNoAssets(true);
        setCelebrityName(params.celebrityName || '');
        setLoading(false);
      }
    };
    loadAssets();
    return () => { cancelled = true; };
  }, [params.sessionId]);

  const panGesture = Gesture.Pan()
    .onStart(() => {
      savedTranslateX.value = sigTranslateX.value;
      savedTranslateY.value = sigTranslateY.value;
    })
    .onUpdate((e) => {
      sigTranslateX.value = savedTranslateX.value + e.translationX;
      sigTranslateY.value = savedTranslateY.value + e.translationY;
    });

  const pinchGesture = Gesture.Pinch()
    .onStart(() => {
      savedScale.value = sigScale.value;
    })
    .onUpdate((e) => {
      sigScale.value = Math.max(0.3, Math.min(3, savedScale.value * e.scale));
    });

  const rotationGesture = Gesture.Rotation()
    .onStart(() => {
      savedRotation.value = sigRotation.value;
    })
    .onUpdate((e) => {
      sigRotation.value = savedRotation.value + e.rotation;
    });

  const composedGesture = Gesture.Simultaneous(panGesture, pinchGesture, rotationGesture);

  const signatureAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: sigTranslateX.value },
      { translateY: sigTranslateY.value },
      { scale: sigScale.value },
      { rotate: `${sigRotation.value}rad` },
    ],
  }));

  const handleResetPosition = () => {
    sigTranslateX.value = withSpring(0);
    sigTranslateY.value = withSpring(PHOTO_HEIGHT * 0.55);
    sigScale.value = withSpring(1);
    sigRotation.value = withSpring(0);
  };

  const formatDate = () => {
    const now = new Date();
    const day = now.getDate();
    const monthNames: Record<string, string[]> = {
      fr: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
      en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
      es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
      de: ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'],
      it: ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'],
      pt: ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'],
    };
    const months = monthNames[language] || monthNames['en'];
    const month = months[now.getMonth()];
    const year = now.getFullYear();

    if (language === 'fr') return `Le ${day} ${month} ${year}`;
    if (language === 'es') return `${day} de ${month} de ${year}`;
    if (language === 'de') return `${day}. ${month} ${year}`;
    return `${month} ${day}, ${year}`;
  };

  const getDedicationFor = () => {
    const name = params.fanName || 'Fan';
    if (language === 'fr') return `Pour ${name}`;
    if (language === 'es') return `Para ${name}`;
    if (language === 'de') return `Für ${name}`;
    if (language === 'it') return `Per ${name}`;
    if (language === 'pt') return `Para ${name}`;
    if (language === 'ru') return `Для ${name}`;
    if (language === 'ja') return `${name}へ`;
    if (language === 'zh') return `致 ${name}`;
    if (language === 'ar') return `إلى ${name}`;
    return `For ${name}`;
  };

  const captureImage = async (): Promise<string | null> => {
    if (Platform.OS === 'web' && webCaptureRef.current) {
      let el: HTMLElement | null = null;
      const ref = webCaptureRef.current;
      if (ref instanceof HTMLElement) {
        el = ref;
      } else if (ref && typeof ref === 'object') {
        const node = (ref as any)._nativeTag || (ref as any).getInnerViewNode?.() || (ref as any);
        if (node instanceof HTMLElement) {
          el = node;
        } else {
          try {
            const { findDOMNode } = await import('react-dom');
            el = findDOMNode(ref) as HTMLElement;
          } catch (e) {}
        }
      }
      if (el) {
        const dataUrl = await captureWebView(el);
        if (dataUrl) return dataUrl;
      }
    }
    if (viewShotRef.current?.capture) {
      try {
        return await viewShotRef.current.capture();
      } catch (e) {
        console.error('[Dedication] ViewShot capture failed:', e);
      }
    }
    return null;
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);

      const uri = await captureImage();
      if (!uri) {
        showAlert(t('error'), t('dedicationSaveError'));
        setIsSaving(false);
        return;
      }

      await saveCollectorLive(
        uri,
        celebrityName || 'Celebrity',
        (params.fanName as string) || 'Fan',
        params.sessionId as string || undefined,
      );

      if (Platform.OS === 'web') {
        downloadImageWeb(uri, `dedication_${celebrityName}_${Date.now()}.png`);
      }

      showAlert(t('success'), t('dedicationSaved'));
      setIsSaving(false);
    } catch (error) {
      console.error('Error saving dedication:', error);
      setIsSaving(false);
      showAlert(t('error'), t('dedicationSaveError'));
    }
  };

  const handleShare = async () => {
    try {
      const uri = await captureImage();

      if (Platform.OS === 'web') {
        if (uri && typeof navigator !== 'undefined' && navigator.share) {
          try {
            const response = await fetch(uri);
            const blob = await response.blob();
            const file = new File([blob], `dedication_${celebrityName}.png`, { type: 'image/png' });
            await navigator.share({
              title: `${getDedicationFor()} - ${celebrityName}`,
              text: `${getDedicationFor()} - ${celebrityName} #SignTouch`,
              files: [file],
            });
            return;
          } catch (shareErr) {
            console.log('[Dedication] Web Share API failed, fallback to download');
          }
        }
        if (uri) {
          downloadImageWeb(uri, `dedication_${celebrityName}_${Date.now()}.png`);
        }
      } else {
        if (uri) {
          await Share.share({
            url: uri,
            message: `${getDedicationFor()} - ${celebrityName} #SignTouch`,
          });
        } else {
          await Share.share({
            message: `${getDedicationFor()} - ${celebrityName} #SignTouch`,
          });
        }
      }
    } catch (error) {
      console.error('Error sharing dedication:', error);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <LinearGradient colors={['#1a1a2e', '#16213e']} style={StyleSheet.absoluteFill} />
        <ActivityIndicator size="large" color="#8b5cf6" />
        <Text style={styles.loadingText}>{t('dedicationLoading') || 'Preparing your dedication...'}</Text>
      </View>
    );
  }

  if (noAssets || (!photoUrl && signaturePaths.length === 0)) {
    return (
      <View style={[styles.container, styles.centerContent, { paddingTop: insets.top }]}>
        <LinearGradient colors={['#1a1a2e', '#16213e', '#0f3460']} style={StyleSheet.absoluteFill} />
        <Text style={{ color: '#fff', fontSize: 22, fontWeight: '700', marginBottom: 8 }}>{t('dedicationTitle')}</Text>
        <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 15, textAlign: 'center', paddingHorizontal: 40, marginBottom: 24 }}>
          {t('dedicationSaveError')}
        </Text>
        <TouchableOpacity style={styles.actionButton} onPress={() => router.replace('/')}>
          <Home size={22} color="#fff" />
          <Text style={styles.actionButtonText}>{t('home')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient colors={['#1a1a2e', '#16213e', '#0f3460']} style={StyleSheet.absoluteFill} />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('dedicationTitle')}</Text>
        <TouchableOpacity style={styles.resetButton} onPress={handleResetPosition}>
          <RotateCcw size={18} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={styles.photoWrapper}>
        <View ref={webCaptureRef} collapsable={false} style={styles.captureArea}>
          {photoUrl ? (
            <Image source={{ uri: photoUrl }} style={styles.photo} resizeMode="cover" />
          ) : (
            <View style={[styles.photo, styles.photoPlaceholder]}>
              <Text style={styles.placeholderText}>{t('noPhoto')}</Text>
            </View>
          )}

          <View style={styles.textOverlay}>
            <Text style={styles.dedicationForText}>{getDedicationFor()}</Text>
            <Text style={styles.dedicationDateText}>{formatDate()}</Text>
          </View>

          <View style={styles.liveBadge}>
            <View style={styles.liveBadgeDot} />
            <Text style={styles.liveBadgeText}>LIVE {celebrityName}</Text>
          </View>

          <GestureDetector gesture={composedGesture}>
            <Animated.View style={[styles.signatureContainer, signatureAnimatedStyle]}>
              <Svg width={PHOTO_WIDTH * 0.6} height={PHOTO_WIDTH * 0.3} viewBox={`0 0 ${SCREEN_WIDTH - 100} ${(SCREEN_WIDTH - 100) * 0.5}`}>
                {signaturePaths.map((p, i) => (
                  <Path
                    key={i}
                    d={p}
                    stroke={signatureColor}
                    strokeWidth={3}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ))}
              </Svg>
            </Animated.View>
          </GestureDetector>

          <View style={styles.watermark}>
            <Text style={styles.watermarkText}>SignTouch</Text>
          </View>
        </View>
      </View>

      <View style={styles.colorPickerSection}>
        <Text style={styles.colorPickerLabel}>{t('signatureColor')}</Text>
        <View style={styles.colorPicker}>
          {SIGNATURE_COLORS.map((color) => (
            <TouchableOpacity
              key={color}
              style={[
                styles.colorDot,
                { backgroundColor: color },
                signatureColor === color && styles.colorDotSelected,
              ]}
              onPress={() => setSignatureColor(color)}
            />
          ))}
        </View>
      </View>

      <Text style={styles.gestureHint}>{t('dedicationGestureHint')}</Text>

      <View style={styles.actionsRow}>
        <TouchableOpacity style={styles.actionButton} onPress={handleSave} disabled={isSaving}>
          {isSaving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Download size={22} color="#fff" />
          )}
          <Text style={styles.actionButtonText}>{t('save')}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.actionButton, styles.shareButton]} onPress={handleShare}>
          <Share2 size={22} color="#fff" />
          <Text style={styles.actionButtonText}>{t('share')}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.actionButton, styles.homeButton]} onPress={async () => {
          try {
            const uri = await captureImage();
            if (uri) {
              await saveCollectorLive(
                uri,
                celebrityName || 'Celebrity',
                (params.fanName as string) || 'Fan',
                params.sessionId as string || undefined,
              );
            }
          } catch (e) {
            console.error('[Dedication] Auto-save before home failed:', e);
          }
          router.replace('/');
        }}>
          <Home size={22} color="#fff" />
          <Text style={styles.actionButtonText}>{t('home')}</Text>
        </TouchableOpacity>
      </View>
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
    fontSize: 16,
    marginTop: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  resetButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoWrapper: {
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  captureArea: {
    width: PHOTO_WIDTH,
    height: PHOTO_HEIGHT,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  photo: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  photoPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#2a2a4a',
  },
  placeholderText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 16,
  },
  textOverlay: {
    position: 'absolute',
    top: 20,
    left: 20,
    right: 20,
  },
  dedicationForText: {
    fontSize: 32,
    fontFamily: 'CedarvilleCursive',
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 6,
  },
  dedicationDateText: {
    fontSize: 14,
    fontFamily: 'CedarvilleCursive',
    color: 'rgba(255,255,255,0.85)',
    marginTop: 4,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 4,
  },
  liveBadge: {
    position: 'absolute',
    top: 20,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(139, 92, 246, 0.85)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    gap: 5,
  },
  liveBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#4ade80',
  },
  liveBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  signatureContainer: {
    position: 'absolute',
    alignSelf: 'center',
  },
  watermark: {
    position: 'absolute',
    bottom: 10,
    right: 12,
  },
  watermarkText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    fontWeight: '600',
    fontStyle: 'italic',
  },
  colorPickerSection: {
    paddingHorizontal: 20,
    marginTop: 16,
  },
  colorPickerLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    marginBottom: 8,
  },
  colorPicker: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  colorDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  colorDotSelected: {
    borderColor: '#fff',
    borderWidth: 3,
  },
  gestureHint: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 10,
    paddingHorizontal: 40,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 20,
    marginTop: 16,
    paddingBottom: 20,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#8b5cf6',
    paddingVertical: 14,
    borderRadius: 14,
  },
  shareButton: {
    backgroundColor: '#10B981',
  },
  homeButton: {
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
