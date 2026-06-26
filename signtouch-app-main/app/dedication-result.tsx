import React, { useState, useEffect, useRef, useCallback } from 'react';
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
import Svg, { Path, Rect } from 'react-native-svg';
import ViewShot from 'react-native-view-shot';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { useLanguage } from '@/contexts/LanguageContext';
import { getDedicationAssets } from '@/utils/liveSessionStorage';
import { saveCollectorLive, downloadImageWeb } from '@/utils/collectorLiveStorage';

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

const { width: SCREEN_WIDTH } = Dimensions.get('window');
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

  // Cle anti-doublon : une seule entree galerie par file/session de ce fan.
  const dedupKey =
    (params.queueEntryId as string) ||
    (params.sessionId as string) ||
    undefined;
  const autoSavedRef = useRef(false);

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
        setPhotoUrl(assets.photoUrl);
        setCelebrityName(assets.celebrityName || params.celebrityName || '');
        if (assets.signatureSvg) {
          setSignaturePaths(assets.signatureSvg.split('|||'));
          console.log('[DedicationResult] Assets loaded with signature');
          setLoading(false);
        } else if (attempt < 8) {
          console.log(`[DedicationResult] Photo found but no signature yet, retrying in ${attempt * 2}s...`);
          setLoading(false);
          setTimeout(() => {
            if (!cancelled) loadAssets(attempt + 1);
          }, attempt * 2000);
        } else {
          console.log('[DedicationResult] Photo loaded, no signature after retries');
          setLoading(false);
        }
      } else if (attempt < 8) {
        console.log(`[DedicationResult] No assets yet, retrying in ${attempt * 2}s...`);
        setTimeout(() => {
          if (!cancelled) loadAssets(attempt + 1);
        }, attempt * 2000);
      } else {
        console.log('[DedicationResult] No assets after retries');
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

  const webTouchState = useRef<{
    startX: number; startY: number;
    baseTX: number; baseTY: number;
    baseScale: number; baseDist: number;
    baseRotation: number; baseAngle: number;
    fingers: number;
  } | null>(null);

  const getTouchDist = (t: TouchList) => {
    const dx = t[1].clientX - t[0].clientX;
    const dy = t[1].clientY - t[0].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };
  const getTouchAngle = (t: TouchList) => {
    return Math.atan2(t[1].clientY - t[0].clientY, t[1].clientX - t[0].clientX);
  };

  const attachWebTouch = useCallback((node: any) => {
    if (Platform.OS !== 'web' || !node) return;
    let domEl: HTMLElement | null = null;
    if (node instanceof HTMLElement) {
      domEl = node;
    } else {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const findDOMNode = require('react-dom').findDOMNode;
        domEl = findDOMNode(node) as HTMLElement;
      } catch {}
    }
    if (!domEl) return;

    const onTouchStart = (ev: TouchEvent) => {
      ev.preventDefault();
      ev.stopPropagation();
      const t = ev.touches[0];
      webTouchState.current = {
        startX: t.clientX, startY: t.clientY,
        baseTX: sigTranslateX.value, baseTY: sigTranslateY.value,
        baseScale: sigScale.value, baseDist: 0,
        baseRotation: sigRotation.value, baseAngle: 0,
        fingers: ev.touches.length,
      };
      if (ev.touches.length >= 2) {
        webTouchState.current.baseDist = getTouchDist(ev.touches);
        webTouchState.current.baseAngle = getTouchAngle(ev.touches);
      }
    };
    const onTouchMove = (ev: TouchEvent) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (!webTouchState.current) return;
      const st = webTouchState.current;
      if (ev.touches.length >= 2 && st.fingers < 2) {
        st.baseDist = getTouchDist(ev.touches);
        st.baseAngle = getTouchAngle(ev.touches);
        st.baseScale = sigScale.value;
        st.baseRotation = sigRotation.value;
        st.fingers = ev.touches.length;
      }
      const t = ev.touches[0];
      sigTranslateX.value = st.baseTX + (t.clientX - st.startX);
      sigTranslateY.value = st.baseTY + (t.clientY - st.startY);
      if (ev.touches.length >= 2) {
        const dist = getTouchDist(ev.touches);
        sigScale.value = Math.max(0.3, Math.min(3, st.baseScale * (dist / st.baseDist)));
        const angle = getTouchAngle(ev.touches);
        sigRotation.value = st.baseRotation + (angle - st.baseAngle);
      }
    };
    const onTouchEnd = (ev: TouchEvent) => {
      ev.preventDefault();
      if (ev.touches.length === 0) {
        webTouchState.current = null;
      }
    };
    const onMouseDown = (ev: MouseEvent) => {
      ev.preventDefault();
      webTouchState.current = {
        startX: ev.clientX, startY: ev.clientY,
        baseTX: sigTranslateX.value, baseTY: sigTranslateY.value,
        baseScale: sigScale.value, baseDist: 0,
        baseRotation: sigRotation.value, baseAngle: 0,
        fingers: 1,
      };
      const onMouseMove = (me: MouseEvent) => {
        if (!webTouchState.current) return;
        sigTranslateX.value = webTouchState.current.baseTX + (me.clientX - webTouchState.current.startX);
        sigTranslateY.value = webTouchState.current.baseTY + (me.clientY - webTouchState.current.startY);
      };
      const onMouseUp = () => {
        webTouchState.current = null;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    };

    domEl.addEventListener('touchstart', onTouchStart, { passive: false });
    domEl.addEventListener('touchmove', onTouchMove, { passive: false });
    domEl.addEventListener('touchend', onTouchEnd, { passive: false });
    domEl.addEventListener('touchcancel', onTouchEnd, { passive: false });
    domEl.addEventListener('mousedown', onMouseDown);
    domEl.style.touchAction = 'none';
    domEl.style.userSelect = 'none';
    (domEl.style as any).webkitUserSelect = 'none';
    domEl.style.cursor = 'grab';
  }, []);

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
            const { findDOMNode } = (await import('react-dom')) as any;
            el = findDOMNode(ref) as HTMLElement;
          } catch {}
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

  // Enregistre la dedicace dans la galerie interne de l'app (Collector).
  // Anti-doublon via dedupKey : reappeler ne cree pas de seconde entree, ca met a jour.
  const saveToCollector = async (uri: string) => {
    await saveCollectorLive(
      uri,
      celebrityName || 'Celebrity',
      (params.fanName as string) || 'Fan',
      params.sessionId as string || undefined,
      undefined,
      {
        photoUri: photoUrl || undefined,
        signaturePaths: signaturePaths.length > 0 ? signaturePaths : undefined,
        signatureColor: signatureColor,
        signatureX: sigTranslateX.value,
        signatureY: sigTranslateY.value,
        signatureScale: sigScale.value,
        signatureRotation: sigRotation.value,
      },
      dedupKey,
    );
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);

      const uri = await captureImage();

      // Si la capture composee echoue, on sauve quand meme la photo brute pour
      // que la dedicace apparaisse dans la galerie (entree mise a jour via dedupKey).
      if (!uri) {
        console.warn('[Dedication] Manual save: capture empty, falling back to raw photo');
        if (photoUrl) {
          autoSavedRef.current = true;
          await saveToCollector(photoUrl);
          showAlert(t('success'), t('dedicationSaved'));
        } else {
          showAlert(t('error'), t('dedicationSaveError'));
        }
        setIsSaving(false);
        return;
      }

      autoSavedRef.current = true;
      await saveToCollector(uri);

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
              text: `${getDedicationFor()} - ${celebrityName} #Plyz`,
              files: [file],
            });
            return;
          } catch {
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
            message: `${getDedicationFor()} - ${celebrityName} #Plyz`,
          });
        } else {
          await Share.share({
            message: `${getDedicationFor()} - ${celebrityName} #Plyz`,
          });
        }
      }
    } catch (error) {
      console.error('Error sharing dedication:', error);
    }
  };

  // Sauvegarde AUTOMATIQUE dans la galerie interne (Collector) des que la
  // dedicace est affichee, pour que le fan la retrouve sans cliquer "Enregistrer".
  // Robuste : on retente la capture composee plusieurs fois ; si elle echoue
  // toujours, on sauve QUAND MEME une entree avec la photo brute (photoUrl) pour
  // que la dedicace APPARAISSE dans la galerie. dedupKey garantit l'unicite :
  // un retry/clic "Enregistrer" met a jour la meme entree au lieu de creer un doublon.
  useEffect(() => {
    if (loading || noAssets || !photoUrl || autoSavedRef.current) return;
    autoSavedRef.current = true;
    let cancelled = false;

    const runAutoSave = async () => {
      const MAX_ATTEMPTS = 3;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        if (cancelled) return;
        try {
          const uri = await captureImage();
          if (uri) {
            await saveToCollector(uri);
            console.log(`[DedicationResult] Auto-saved composed image (attempt ${attempt})`);
            return;
          }
          console.warn(`[DedicationResult] captureImage returned empty (attempt ${attempt}/${MAX_ATTEMPTS})`);
        } catch (e) {
          console.error(`[DedicationResult] Auto-save capture failed (attempt ${attempt}/${MAX_ATTEMPTS}):`, e);
        }
        // attendre avant de retenter (capture/ViewShot pas encore pret)
        await new Promise((r) => setTimeout(r, 800 * attempt));
      }

      // Dernier recours : la capture composee a echoue -> on sauve l'entree avec
      // la PHOTO BRUTE pour que la dedicace soit visible dans la galerie malgre tout.
      if (cancelled) return;
      if (photoUrl) {
        try {
          await saveToCollector(photoUrl);
          console.warn('[DedicationResult] Composed capture failed after retries — saved raw photo as fallback');
        } catch (e) {
          console.error('[DedicationResult] Fallback raw-photo save failed:', e);
          autoSavedRef.current = false;
        }
      } else {
        autoSavedRef.current = false;
      }
    };

    const timer = setTimeout(runAutoSave, 1500);
    return () => { cancelled = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, noAssets, photoUrl, signaturePaths.length]);

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
        <ViewShot ref={viewShotRef} options={{ format: 'png', quality: 1 }} style={styles.captureArea}>
        <View ref={(node) => { webCaptureRef.current = node; if (Platform.OS === 'web') attachWebTouch(node); }} collapsable={false} style={styles.captureArea}>
          {photoUrl ? (
            <Image source={{ uri: photoUrl }} style={styles.photo} resizeMode="cover" />
          ) : (
            <View style={[styles.photo, styles.photoPlaceholder]}>
              <Text style={styles.placeholderText}>{t('noPhoto')}</Text>
            </View>
          )}

          <View style={[styles.textOverlay, Platform.OS === 'web' && { pointerEvents: 'none' } as any]}>
            <Text style={styles.dedicationForText}>{getDedicationFor()}</Text>
            <Text style={styles.dedicationDateText}>{formatDate()}</Text>
          </View>

          <View style={[styles.liveBadge, Platform.OS === 'web' && { pointerEvents: 'none' } as any]}>
            <View style={styles.liveBadgeDot} />
            <Text style={styles.liveBadgeText}>LIVE {celebrityName}</Text>
          </View>

          {Platform.OS === 'web' ? (
            <Animated.View
              style={[styles.signatureContainer, { width: PHOTO_WIDTH * 0.7, height: PHOTO_WIDTH * 0.35, pointerEvents: 'none' } as any, signatureAnimatedStyle]}
            >
              <Svg width="100%" height="100%" viewBox={`0 0 ${SCREEN_WIDTH - 100} ${(SCREEN_WIDTH - 100) * 0.5}`}>
                <Rect x="0" y="0" width={SCREEN_WIDTH - 100} height={(SCREEN_WIDTH - 100) * 0.5} fill="transparent" />
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
          ) : (
            <GestureDetector gesture={composedGesture}>
              <Animated.View style={[styles.signatureContainer, { width: PHOTO_WIDTH * 0.7, height: PHOTO_WIDTH * 0.35 }, signatureAnimatedStyle]}>
                <Svg width="100%" height="100%" viewBox={`0 0 ${SCREEN_WIDTH - 100} ${(SCREEN_WIDTH - 100) * 0.5}`}>
                  <Rect x="0" y="0" width={SCREEN_WIDTH - 100} height={(SCREEN_WIDTH - 100) * 0.5} fill="transparent" />
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
          )}

          <View style={[styles.watermark, Platform.OS === 'web' && { pointerEvents: 'none' } as any]}>
            <Text style={styles.watermarkText}>Plyz</Text>
          </View>
        </View>
        </ViewShot>
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
              autoSavedRef.current = true;
              await saveToCollector(uri);
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
    fontSize: 40,
    fontFamily: 'Great Vibes',
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 6,
  },
  dedicationDateText: {
    fontSize: 20,
    fontFamily: 'Great Vibes',
    color: 'rgba(255,255,255,0.9)',
    marginTop: 2,
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
    left: (PHOTO_WIDTH - PHOTO_WIDTH * 0.7) / 2,
    top: 0,
    zIndex: 10,
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
