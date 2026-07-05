import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Dimensions,
  ActivityIndicator,
  Platform,
  ScrollView,
} from 'react-native';
import { showAlert } from '@/utils/alertHelper';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Download, RotateCcw, Check } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Rect } from 'react-native-svg';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  CollectorLiveItem,
  getAllCollectorLive,
  updateCollectorLive,
  downloadImageWeb,
} from '@/utils/collectorLiveStorage';
import ViewShot from 'react-native-view-shot';
import * as MediaLibrary from 'expo-media-library';

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
    console.error('[CollectorEdit] html2canvas error:', e);
    return null;
  }
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const PHOTO_WIDTH = SCREEN_WIDTH - 40;
const PHOTO_HEIGHT = PHOTO_WIDTH * (4 / 3);

const SIGNATURE_COLORS = [
  '#FFFFFF', '#000000', '#8b5cf6', '#ef4444', '#f59e0b',
  '#10b981', '#3b82f6', '#ec4899', '#f97316', '#06b6d4',
  '#a855f7', '#6366f1', '#14b8a6', '#d4c5a9', '#92400e',
];

export default function CollectorEditScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const viewShotRef = useRef<any>(null);
  const webCaptureRef = useRef<any>(null);

  const params = useLocalSearchParams<{ collectorId: string }>();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [item, setItem] = useState<CollectorLiveItem | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [signaturePaths, setSignaturePaths] = useState<string[]>([]);
  const [signatureColor, setSignatureColor] = useState('#FFFFFF');
  const [hasRawData, setHasRawData] = useState(false);

  const sigTranslateX = useSharedValue(0);
  const sigTranslateY = useSharedValue(PHOTO_HEIGHT * 0.55);
  const sigScale = useSharedValue(1);
  const sigRotation = useSharedValue(0);

  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(PHOTO_HEIGHT * 0.55);
  const savedScale = useSharedValue(1);
  const savedRotation = useSharedValue(0);

  useEffect(() => {
    const loadItem = async () => {
      if (!params.collectorId) {
        setLoading(false);
        return;
      }
      const items = await getAllCollectorLive();
      const found = items.find(i => i.id === params.collectorId);
      if (!found) {
        setLoading(false);
        return;
      }
      setItem(found);

      if (found.photoUri && found.signaturePaths && found.signaturePaths.length > 0) {
        setHasRawData(true);
        setPhotoUri(found.photoUri);
        setSignaturePaths(found.signaturePaths);
        setSignatureColor(found.signatureColor || '#FFFFFF');
        if (found.signatureX !== undefined) {
          sigTranslateX.value = found.signatureX;
          savedTranslateX.value = found.signatureX;
        }
        if (found.signatureY !== undefined) {
          sigTranslateY.value = found.signatureY;
          savedTranslateY.value = found.signatureY;
        }
        if (found.signatureScale !== undefined) {
          sigScale.value = found.signatureScale;
          savedScale.value = found.signatureScale;
        }
        if (found.signatureRotation !== undefined) {
          sigRotation.value = found.signatureRotation;
          savedRotation.value = found.signatureRotation;
        }
      } else {
        setHasRawData(false);
        setPhotoUri(found.imageUri || found.uri);
      }

      setLoading(false);
    };
    loadItem();
  }, [params.collectorId]);

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
        console.error('[CollectorEdit] ViewShot capture failed:', e);
      }
    }
    return null;
  };

  const handleSave = async () => {
    if (!item) return;
    try {
      setSaving(true);

      if (hasRawData) {
        const uri = await captureImage();
        if (!uri) {
          setSaving(false);
          showAlert(t('error') || 'Error', t('dedicationSaveError') || 'Save failed');
          return;
        }

        await updateCollectorLive(item.id, {
          uri: uri,
          imageUri: uri,
          photoUri: photoUri || undefined,
          signaturePaths: signaturePaths,
          signatureColor,
          signatureX: sigTranslateX.value,
          signatureY: sigTranslateY.value,
          signatureScale: sigScale.value,
          signatureRotation: sigRotation.value,
        });

        if (Platform.OS === 'web') {
          downloadImageWeb(uri, `dedication_${item.celebrityName}_${Date.now()}.png`);
        } else {
          // On ne prétend PAS avoir enregistré si la permission est refusée ou si
          // l'écriture échoue (sinon le fan croit avoir sa dédicace alors que non).
          const { status } = await MediaLibrary.requestPermissionsAsync();
          if (status !== 'granted') {
            setSaving(false);
            showAlert(t('error') || 'Erreur', t('mediaPermissionNeeded' as any) || "Autorise l'accès à tes photos pour enregistrer l'image.");
            return;
          }
          await MediaLibrary.saveToLibraryAsync(uri);
        }
      }

      showAlert(t('success') || 'Success', t('dedicationSaved') || 'Saved!');
      setSaving(false);
      router.back();
    } catch (error) {
      console.error('[CollectorEdit] Save error:', error);
      setSaving(false);
      showAlert(t('error') || 'Error', t('dedicationSaveError') || 'Save failed');
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <LinearGradient colors={['#1a1a2e', '#16213e']} style={StyleSheet.absoluteFill} />
        <ActivityIndicator size="large" color="#8b5cf6" />
      </View>
    );
  }

  if (!item) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <LinearGradient colors={['#1a1a2e', '#16213e']} style={StyleSheet.absoluteFill} />
        <Text style={{ color: '#fff', fontSize: 16 }}>{t('error') || 'Not found'}</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ArrowLeft size={20} color="#fff" />
          <Text style={{ color: '#fff', marginLeft: 8 }}>{t('back') || 'Back'}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!hasRawData) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <LinearGradient colors={['#1a1a2e', '#16213e', '#0f3460']} style={StyleSheet.absoluteFill} />

        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.headerBackBtn}>
            <ArrowLeft size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('editDedication') || 'Edit Dedication'}</Text>
          <View style={{ width: 36 }} />
        </View>

        <View style={styles.photoWrapper}>
          <Image source={{ uri: photoUri || item.imageUri || item.uri }} style={styles.fullPhoto} resizeMode="contain" />
        </View>

        <Text style={styles.noEditHint}>
          {t('dedicationNoEditHint') || 'This dedication was saved before editing was available. New dedications can be fully edited.'}
        </Text>

        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.actionButton} onPress={async () => {
            const imgUri = item.imageUri || item.uri;
            if (!imgUri) return;
            if (Platform.OS === 'web') {
              downloadImageWeb(imgUri, `dedication_${item.celebrityName}_${Date.now()}.png`);
            } else {
              // Avant : ne faisait RIEN sur mobile. Maintenant : enregistre en galerie.
              const { status } = await MediaLibrary.requestPermissionsAsync();
              if (status !== 'granted') {
                showAlert(t('error') || 'Erreur', t('mediaPermissionNeeded' as any) || "Autorise l'accès à tes photos pour enregistrer l'image.");
                return;
              }
              try {
                await MediaLibrary.saveToLibraryAsync(imgUri);
                showAlert(t('success') || 'Success', t('dedicationSaved') || 'Saved!');
              } catch {
                showAlert(t('error') || 'Erreur', t('dedicationSaveError') || 'Save failed');
              }
            }
          }}>
            <Download size={20} color="#fff" />
            <Text style={styles.actionButtonText}>{t('save') || 'Save'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient colors={['#1a1a2e', '#16213e', '#0f3460']} style={StyleSheet.absoluteFill} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBackBtn}>
          <ArrowLeft size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('editDedication') || 'Edit Dedication'}</Text>
        <TouchableOpacity style={styles.resetButton} onPress={handleResetPosition}>
          <RotateCcw size={18} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.photoWrapper}>
          <ViewShot ref={viewShotRef} options={{ format: 'png', quality: 1 }} style={styles.captureArea}>
            <View ref={webCaptureRef} collapsable={false} style={styles.captureArea}>
              {photoUri ? (
                <Image source={{ uri: photoUri }} style={styles.photo} resizeMode="cover" />
              ) : (
                <View style={[styles.photo, styles.photoPlaceholder]}>
                  <Text style={styles.placeholderText}>{t('noPhoto') || 'No photo'}</Text>
                </View>
              )}

              <View style={styles.liveBadge}>
                <View style={styles.liveBadgeDot} />
                <Text style={styles.liveBadgeText}>LIVE {item.celebrityName}</Text>
              </View>

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

              <View style={styles.watermark}>
                <Text style={styles.watermarkText}>Plyz</Text>
              </View>
            </View>
          </ViewShot>
        </View>

        <View style={styles.colorPickerSection}>
          <Text style={styles.colorPickerLabel}>{t('signatureColor') || 'Signature color'}</Text>
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

        <Text style={styles.gestureHint}>
          {t('dedicationGestureHint') || 'Use your fingers to move, resize, and rotate the signature'}
        </Text>

        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: 'rgba(255,255,255,0.15)' }]}
            onPress={() => router.back()}
          >
            <ArrowLeft size={20} color="#fff" />
            <Text style={styles.actionButtonText}>{t('cancel') || 'Cancel'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Check size={20} color="#fff" />
            )}
            <Text style={styles.actionButtonText}>{t('save') || 'Save'}</Text>
          </TouchableOpacity>
        </View>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerBackBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
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
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 12,
  },
  scrollContent: {
    paddingBottom: 40,
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
  fullPhoto: {
    width: PHOTO_WIDTH,
    height: PHOTO_HEIGHT,
    borderRadius: 16,
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
  noEditHint: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 30,
    marginTop: 16,
    lineHeight: 20,
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
  actionButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
