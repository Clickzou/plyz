import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Dimensions,
  Platform,
  ActivityIndicator,
  PanResponder,
} from 'react-native';
import { showAlert } from '@/utils/alertHelper';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  Download,
  Share2,
  RotateCcw,
  RotateCw,
  ZoomIn,
  ZoomOut,
  Palette,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { saveMemory } from '@/utils/storageService';
import { downloadImageWeb } from '@/utils/collectorLiveStorage';
import ViewShot from 'react-native-view-shot';
import { SvgUri, SvgXml } from 'react-native-svg';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const PREVIEW_WIDTH = SCREEN_WIDTH - 32;
const PREVIEW_HEIGHT = PREVIEW_WIDTH * (4 / 3);

const SIGNATURE_COLORS = [
  '#FFFFFF', '#000000', '#8b5cf6', '#ef4444', '#f59e0b',
  '#10b981', '#3b82f6', '#ec4899', '#f97316', '#06b6d4',
];

const getColorFilter = (hexColor: string): string => {
  const colorFilters: Record<string, string> = {
    '#FFFFFF': 'brightness(0) invert(1)',
    '#000000': 'brightness(0)',
    '#10B981': 'brightness(0) invert(48%) sepia(79%) saturate(450%) hue-rotate(118deg)',
    '#3B82F6': 'brightness(0) invert(45%) sepia(98%) saturate(1500%) hue-rotate(199deg)',
    '#8B5CF6': 'brightness(0) invert(40%) sepia(90%) saturate(1500%) hue-rotate(245deg)',
    '#EC4899': 'brightness(0) invert(45%) sepia(95%) saturate(2000%) hue-rotate(310deg)',
    '#F59E0B': 'brightness(0) invert(65%) sepia(90%) saturate(1500%) hue-rotate(15deg)',
    '#EF4444': 'brightness(0) invert(35%) sepia(95%) saturate(2000%) hue-rotate(340deg)',
    '#6B7280': 'brightness(0) invert(50%) sepia(10%) saturate(300%) hue-rotate(180deg)',
    '#FFD700': 'brightness(0) invert(80%) sepia(90%) saturate(1000%) hue-rotate(10deg)',
    '#10b981': 'brightness(0) invert(48%) sepia(79%) saturate(450%) hue-rotate(118deg)',
    '#3b82f6': 'brightness(0) invert(45%) sepia(98%) saturate(1500%) hue-rotate(199deg)',
    '#8b5cf6': 'brightness(0) invert(40%) sepia(90%) saturate(1500%) hue-rotate(245deg)',
    '#ec4899': 'brightness(0) invert(45%) sepia(95%) saturate(2000%) hue-rotate(310deg)',
    '#f59e0b': 'brightness(0) invert(65%) sepia(90%) saturate(1500%) hue-rotate(15deg)',
    '#ef4444': 'brightness(0) invert(35%) sepia(95%) saturate(2000%) hue-rotate(340deg)',
    '#f97316': 'brightness(0) invert(55%) sepia(80%) saturate(1500%) hue-rotate(10deg)',
    '#06b6d4': 'brightness(0) invert(55%) sepia(70%) saturate(1200%) hue-rotate(160deg)',
  };
  return colorFilters[hexColor] || colorFilters[hexColor.toUpperCase()] || 'brightness(0) invert(1)';
};

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
    console.error('[EventPhotoEditor] html2canvas error:', e);
    return null;
  }
};

export default function EventPhotoEditorScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { user } = useAuth();
  const viewShotRef = useRef<any>(null);
  const webCaptureRef = useRef<any>(null);

  const params = useLocalSearchParams<{
    photoUrl: string;
    signatureUrl: string;
    positionX: string;
    positionY: string;
    scale: string;
    rotation: string;
    color: string;
    containerWidth: string;
    containerHeight: string;
    signerName: string;
  }>();

  const origContainerW = parseFloat(params.containerWidth || '300');
  const origContainerH = parseFloat(params.containerHeight || '400');
  const scaleFactorX = PREVIEW_WIDTH / origContainerW;
  const scaleFactorY = PREVIEW_HEIGHT / origContainerH;
  const uniformScaleFactor = Math.min(scaleFactorX, scaleFactorY);

  const [signaturePosition, setSignaturePosition] = useState({
    x: parseFloat(params.positionX || '0') * scaleFactorX,
    y: parseFloat(params.positionY || '0') * scaleFactorY,
  });
  const [signatureScale, setSignatureScale] = useState(parseFloat(params.scale || '1') * uniformScaleFactor);
  const [signatureRotation, setSignatureRotation] = useState(parseFloat(params.rotation || '0'));
  const [signatureColor, setSignatureColor] = useState(params.color || '#FFFFFF');
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [coloredSvgXml, setColoredSvgXml] = useState<string | null>(null);
  const [containerLayout, setContainerLayout] = useState({ width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT });

  const signatureUrl = params.signatureUrl || '';
  const photoUrl = params.photoUrl || '';
  const signerName = params.signerName || '';

  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (!signatureUrl) {
      setColoredSvgXml(null);
      return;
    }
    const fetchAndColorSvg = async () => {
      try {
        const response = await fetch(signatureUrl);
        let svgText = await response.text();
        svgText = svgText.replace(/stroke="#[0-9a-fA-F]{3,6}"/g, `stroke="${signatureColor}"`);
        svgText = svgText.replace(/stroke="rgb[^"]*"/g, `stroke="${signatureColor}"`);
        svgText = svgText.replace(/stroke="black"/g, `stroke="${signatureColor}"`);
        svgText = svgText.replace(/stroke="white"/g, `stroke="${signatureColor}"`);
        setColoredSvgXml(svgText);
      } catch (error) {
        console.error('Error fetching SVG:', error);
        setColoredSvgXml(null);
      }
    };
    fetchAndColorSvg();
  }, [signatureUrl, signatureColor]);

  const lastPanOffset = useRef({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const positionAtDragStart = useRef({ x: 0, y: 0 });
  // Référence toujours à jour de la position de la signature (le PanResponder
  // étant créé une seule fois, il ne doit pas lire une valeur figée).
  const signaturePositionRef = useRef({ x: 0, y: 0 });

  const handleWebDragStart = useCallback((e: React.MouseEvent) => {
    if (Platform.OS !== 'web') return;
    e.preventDefault();
    isDragging.current = true;
    lastPanOffset.current = { x: e.clientX, y: e.clientY };
    positionAtDragStart.current = { ...signaturePositionRef.current };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDragging.current) return;
      const deltaX = moveEvent.clientX - lastPanOffset.current.x;
      const deltaY = moveEvent.clientY - lastPanOffset.current.y;
      setSignaturePosition({
        x: positionAtDragStart.current.x + deltaX,
        y: positionAtDragStart.current.y + deltaY,
      });
    };
    const handleMouseUp = () => {
      isDragging.current = false;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [signaturePosition]);

  useEffect(() => {
    signaturePositionRef.current = { ...signaturePosition };
  }, [signaturePosition]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        lastPanOffset.current = { ...signaturePositionRef.current };
      },
      onPanResponderMove: (_, gestureState) => {
        setSignaturePosition({
          x: lastPanOffset.current.x + gestureState.dx,
          y: lastPanOffset.current.y + gestureState.dy,
        });
      },
    })
  ).current;

  const adjustScale = (delta: number) => {
    setSignatureScale(prev => Math.max(0.3, Math.min(3, prev + delta)));
  };

  const adjustRotation = (delta: number) => {
    setSignatureRotation(prev => prev + delta);
  };

  const resetTransform = () => {
    setSignaturePosition({
      x: parseFloat(params.positionX || '0') * scaleFactorX,
      y: parseFloat(params.positionY || '0') * scaleFactorY,
    });
    setSignatureScale(parseFloat(params.scale || '1') * uniformScaleFactor);
    setSignatureRotation(parseFloat(params.rotation || '0'));
    setSignatureColor(params.color || '#FFFFFF');
  };

  const captureComposite = async (): Promise<string | null> => {
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
        return await captureWebView(el);
      }

      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx || !photoUrl) return null;

        const img = new (window as any).Image() as HTMLImageElement;
        img.crossOrigin = 'anonymous';
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject();
          img.src = photoUrl;
        });

        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        if (signatureUrl) {
          const sigImg = new (window as any).Image() as HTMLImageElement;
          sigImg.crossOrigin = 'anonymous';
          await new Promise<void>((resolve, reject) => {
            sigImg.onload = () => resolve();
            sigImg.onerror = () => reject();
            sigImg.src = signatureUrl;
          });

          const previewW = containerLayout.width || PREVIEW_WIDTH;
          const previewH = containerLayout.height || PREVIEW_HEIGHT;
          const sx = canvas.width / previewW;
          const sy = canvas.height / previewH;
          const sigWidth = 200 * signatureScale * sx;
          const sigHeight = 100 * signatureScale * sy;
          const sigX = (canvas.width / 2) + (signaturePosition.x * sx) - (sigWidth / 2);
          const sigY = (canvas.height / 2) + (signaturePosition.y * sy) - (sigHeight / 2);

          ctx.save();
          ctx.translate(sigX + sigWidth / 2, sigY + sigHeight / 2);
          ctx.rotate((signatureRotation * Math.PI) / 180);
          ctx.drawImage(sigImg, -sigWidth / 2, -sigHeight / 2, sigWidth, sigHeight);
          ctx.restore();
        }

        return canvas.toDataURL('image/jpeg', 0.9);
      } catch (e) {
        console.error('[EventPhotoEditor] Canvas capture failed:', e);
      }
    }

    if (viewShotRef.current?.capture) {
      try {
        return await viewShotRef.current.capture();
      } catch (e) {
        console.error('[EventPhotoEditor] ViewShot capture failed:', e);
      }
    }
    return null;
  };

  const handleSave = async () => {
    setIsSaving(true);
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    try {
      const uri = await captureComposite();
      if (!uri) {
        showAlert(t('error'), t('downloadFailed') || 'Save failed');
        setIsSaving(false);
        return;
      }

      await saveMemory(uri, user?.id || null, { isEdited: true });

      if (Platform.OS === 'web') {
        downloadImageWeb(uri, `plyz_${signerName}_${Date.now()}.png`);
      }

      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      showAlert(t('done') || 'Done', (t as any)('savedToGallery') || 'Photo saved to your gallery!');
    } catch (error) {
      console.error('Save error:', error);
      showAlert(t('error'), t('downloadFailed') || 'Save failed');
    } finally {
      setIsSaving(false);
    }
  };

  const handleShare = async () => {
    try {
      const uri = await captureComposite();
      if (Platform.OS === 'web') {
        if (uri && typeof navigator !== 'undefined' && navigator.share) {
          try {
            const response = await fetch(uri);
            const blob = await response.blob();
            const file = new File([blob], `plyz_${signerName}.png`, { type: 'image/png' });
            await navigator.share({
              title: `${signerName} - Plyz`,
              files: [file],
            });
            return;
          } catch {}
        }
        if (uri) {
          downloadImageWeb(uri, `plyz_${signerName}_${Date.now()}.png`);
        }
      }
    } catch (error) {
      console.error('Share error:', error);
    }
  };

  if (!photoUrl) {
    return (
      <View style={[styles.container, styles.center]}>
        <LinearGradient colors={['#0f172a', '#1e293b']} style={StyleSheet.absoluteFill} />
        <Text style={{ color: '#fff', fontSize: 16 }}>{t('error')}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient colors={['#0f172a', '#1e293b']} style={StyleSheet.absoluteFill} />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <ArrowLeft size={22} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {signerName || (t('editPhoto') || 'Edit Photo')}
          </Text>
        </View>
        <TouchableOpacity style={styles.resetBtn} onPress={resetTransform}>
          <RotateCcw size={18} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={styles.hintContainer}>
        <Text style={styles.hintText}>
          {(t as any)('dragSignatureHint') || 'Drag the signature to move it. Use controls below to resize, rotate, or change color.'}
        </Text>
      </View>

      <View style={styles.photoWrapper}>
        <ViewShot
          ref={viewShotRef}
          options={{ format: 'png', quality: 1 }}
          style={styles.viewShotContainer}
        >
          <View
            ref={webCaptureRef}
            collapsable={false}
            style={styles.previewContainer}
            onLayout={(e) => setContainerLayout({
              width: e.nativeEvent.layout.width,
              height: e.nativeEvent.layout.height,
            })}
          >
            <Image source={{ uri: photoUrl }} style={styles.previewImage} resizeMode="cover" />

            {signatureUrl && (
              Platform.OS === 'web' ? (
                <div
                  onMouseDown={handleWebDragStart as any}
                  style={{
                    position: 'absolute',
                    width: 200,
                    height: 100,
                    cursor: 'grab',
                    transform: `translate(${signaturePosition.x}px, ${signaturePosition.y}px) scale(${signatureScale}) rotate(${signatureRotation}deg)`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    userSelect: 'none' as const,
                    left: '50%',
                    top: '50%',
                    marginLeft: -100,
                    marginTop: -50,
                  }}
                >
                  <img
                    src={signatureUrl}
                    draggable={false}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain' as const,
                      filter: getColorFilter(signatureColor),
                      pointerEvents: 'none' as const,
                    }}
                  />
                </div>
              ) : (
                <View
                  {...panResponder.panHandlers}
                  style={[
                    styles.signatureOverlay,
                    {
                      transform: [
                        { translateX: signaturePosition.x },
                        { translateY: signaturePosition.y },
                        { scale: signatureScale },
                        { rotate: `${signatureRotation}deg` },
                      ],
                    },
                  ]}
                >
                  {coloredSvgXml ? (
                    <SvgXml xml={coloredSvgXml} width={200} height={100} />
                  ) : (
                    <SvgUri uri={signatureUrl} width={200} height={100} />
                  )}
                </View>
              )
            )}
          </View>
        </ViewShot>
      </View>

      <View style={styles.controls}>
        <View style={styles.controlRow}>
          <TouchableOpacity style={styles.controlBtn} onPress={() => adjustScale(-0.1)}>
            <ZoomOut size={20} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.controlBtn} onPress={() => adjustScale(0.1)}>
            <ZoomIn size={20} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.controlBtn} onPress={() => adjustRotation(-15)}>
            <RotateCcw size={20} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.controlBtn} onPress={() => adjustRotation(15)}>
            <RotateCw size={20} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.controlBtn, showColorPicker && styles.controlBtnActive]}
            onPress={() => setShowColorPicker(!showColorPicker)}
          >
            <Palette size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        {showColorPicker && (
          <View style={styles.colorRow}>
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
        )}
      </View>

      <View style={styles.actionsRow}>
        <TouchableOpacity style={styles.actionBtn} onPress={handleSave} disabled={isSaving}>
          {isSaving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Download size={22} color="#fff" />
          )}
          <Text style={styles.actionBtnText}>{t('save') || 'Save'}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.actionBtn, styles.shareBtn]} onPress={handleShare}>
          <Share2 size={22} color="#fff" />
          <Text style={styles.actionBtnText}>{t('share') || 'Share'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  center: { justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '600', color: '#fff' },
  resetBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  hintContainer: {
    backgroundColor: 'rgba(16,185,129,0.1)',
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.3)',
  },
  hintText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
  },
  photoWrapper: {
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  viewShotContainer: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  previewContainer: {
    width: PREVIEW_WIDTH,
    height: PREVIEW_HEIGHT,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  signatureOverlay: {
    position: 'absolute',
    width: 200,
    height: 100,
    alignSelf: 'center',
    top: '50%',
    left: '50%',
    marginLeft: -100,
    marginTop: -50,
  },
  controls: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  controlRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
  },
  controlBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  controlBtnActive: {
    backgroundColor: '#10B981',
  },
  colorRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 12,
  },
  colorDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorDotSelected: {
    borderColor: '#fff',
    borderWidth: 3,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 20,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#10B981',
    paddingVertical: 14,
    borderRadius: 14,
  },
  shareBtn: {
    backgroundColor: '#6366f1',
  },
  actionBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
