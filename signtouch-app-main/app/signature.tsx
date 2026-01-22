import { useState, useRef, useCallback, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, Platform, Dimensions, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  GestureDetector,
  Gesture,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, runOnJS } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { Eraser, Check, ArrowLeft, Plus, Pencil } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import PremiumModal from '@/components/PremiumModal';
import * as SplashScreen from 'expo-splash-screen';
import { useTranslation } from '@/contexts/LanguageContext';

SplashScreen.preventAutoHideAsync();

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface DrawingPath {
  path: string;
}

export default function SignatureScreen() {
  const { photoUri, existingSignatures, returnTo, memoryId } = useLocalSearchParams<{
    photoUri: string;
    existingSignatures?: string;
    returnTo?: string;
    memoryId?: string;
  }>();

  const [paths, setPaths] = useState<DrawingPath[]>([]);
  const [currentPath, setCurrentPath] = useState<string>('');
  const [savedSignatures, setSavedSignatures] = useState<string[]>(
    existingSignatures ? JSON.parse(existingSignatures as string) : []
  );
  const [showPremiumModal, setShowPremiumModal] = useState<boolean>(false);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const viewShotRef = useRef<View>(null);
  const startPointRef = useRef<{ x: number; y: number } | null>(null);
  const currentPathRef = useRef<string>('');

  const scale = useSharedValue(1);
  const hadPathsRef = useRef(paths.length > 0);

  useEffect(() => {
    const hasPathsNow = paths.length > 0;
    const hadPathsBefore = hadPathsRef.current;

    if (!hadPathsBefore && hasPathsNow) {
      scale.value = 0.8;
      scale.value = withSpring(1, {
        damping: 10,
        stiffness: 120,
      });
    }

    hadPathsRef.current = hasPathsNow;
  }, [paths.length, scale]);

  const animatedTextStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
    };
  });

  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    setTimeout(() => setIsReady(true), 100);
  }, []);

  const onDrawStart = useCallback((x: number, y: number) => {
    startPointRef.current = { x, y };
    const newPath = `M ${x} ${y}`;
    currentPathRef.current = newPath;
    setCurrentPath(newPath);
  }, []);

  const onDrawUpdate = useCallback((x: number, y: number) => {
    currentPathRef.current = currentPathRef.current + ` L ${x} ${y}`;
    setCurrentPath(currentPathRef.current);
  }, []);

  const onDrawEnd = useCallback((endX: number, endY: number) => {
    const startPoint = startPointRef.current;
    if (currentPathRef.current && startPoint) {
      const dx = Math.abs(endX - startPoint.x);
      const dy = Math.abs(endY - startPoint.y);
      const distance = Math.sqrt(dx * dx + dy * dy);

      let finalPath = currentPathRef.current;
      if (distance < 5) {
        finalPath = `M ${startPoint.x - 2} ${startPoint.y} L ${startPoint.x + 2} ${startPoint.y} L ${startPoint.x} ${startPoint.y - 2} L ${startPoint.x} ${startPoint.y + 2}`;
      }

      setPaths((prev) => [...prev, { path: finalPath }]);
      setCurrentPath('');
      currentPathRef.current = '';
      startPointRef.current = null;
    }
  }, []);

  const panDraw = Gesture.Pan()
    .onStart((event) => {
      runOnJS(onDrawStart)(event.x, event.y);
    })
    .onUpdate((event) => {
      runOnJS(onDrawUpdate)(event.x, event.y);
    })
    .onEnd((event) => {
      runOnJS(onDrawEnd)(event.x, event.y);
    });

  const clearSignature = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setPaths([]);
    setCurrentPath('');
    currentPathRef.current = '';
    startPointRef.current = null;
  };

  const goBackToPhoto = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.back();
  };

  const convertSvgToImage = useCallback(async (): Promise<string> => {
    return new Promise(async (resolve, reject) => {
      if (Platform.OS === 'web') {
        try {
          console.log('🔍 [WEB] Conversion de la signature...');

          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

          paths.forEach((item) => {
            const pathData = item.path;
            const commands = pathData.split(/(?=[ML])/);

            commands.forEach((command) => {
              const parts = command.trim().split(/\s+/);
              const type = parts[0];

              if (type === 'M' || type === 'L') {
                const x = parseFloat(parts[1]);
                const y = parseFloat(parts[2]);
                minX = Math.min(minX, x);
                minY = Math.min(minY, y);
                maxX = Math.max(maxX, x);
                maxY = Math.max(maxY, y);
              }
            });
          });

          const padding = 20;

          if (minX === Infinity || minY === Infinity || maxX === -Infinity || maxY === -Infinity) {
            reject(new Error('Invalid path bounds'));
            return;
          }

          // Normaliser les paths pour qu'ils commencent à (0,0)
          const normalizedPaths = paths.map(item => {
            const pathData = item.path;
            const commands = pathData.split(/(?=[ML])/);
            let d = '';
            commands.forEach(command => {
              const parts = command.trim().split(/\s+/);
              const type = parts[0];
              if (type === 'M' || type === 'L') {
                const x = parseFloat(parts[1]) - minX + padding;
                const y = parseFloat(parts[2]) - minY + padding;
                d += `${type} ${x} ${y} `;
              }
            });
            return d.trim();
          });

          const boundingWidth = maxX - minX + padding * 2;
          const boundingHeight = maxY - minY + padding * 2;

          // Créer un SVG string au lieu de PNG
          const svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="${boundingWidth}" height="${boundingHeight}" viewBox="0 0 ${boundingWidth} ${boundingHeight}">
  ${normalizedPaths.map(pathData => `<path d="${pathData}" stroke="#ffffff" stroke-width="8" fill="none" stroke-linecap="round" stroke-linejoin="round" />`).join('\n  ')}
</svg>`;

          // Convertir le SVG en data URI
          const svgBase64 = btoa(unescape(encodeURIComponent(svgString)));
          const svgDataUri = `data:image/svg+xml;base64,${svgBase64}`;

          console.log('✅ [WEB] Signature convertie en SVG');
          console.log('🔍 [WEB] SVG Data URI type:', svgDataUri.substring(0, 30));
          console.log('🔍 [WEB] Is SVG?', svgDataUri.startsWith('data:image/svg+xml'));

          resolve(svgDataUri);
        } catch (error) {
          reject(error);
        }
      } else {
        // Mobile: sauvegarder les paths SVG en JSON pour un rendu transparent
        try {
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

          paths.forEach((item) => {
            const pathData = item.path;
            const commands = pathData.split(/(?=[ML])/);

            commands.forEach((command) => {
              const parts = command.trim().split(/\s+/);
              const type = parts[0];

              if (type === 'M' || type === 'L') {
                const x = parseFloat(parts[1]);
                const y = parseFloat(parts[2]);
                if (!isNaN(x) && !isNaN(y)) {
                  minX = Math.min(minX, x);
                  minY = Math.min(minY, y);
                  maxX = Math.max(maxX, x);
                  maxY = Math.max(maxY, y);
                }
              }
            });
          });

          const padding = 20;

          if (minX === Infinity || minY === Infinity || maxX === -Infinity || maxY === -Infinity) {
            reject(new Error('Invalid path bounds'));
            return;
          }

          // Normaliser les paths pour qu'ils commencent à (0,0)
          const normalizedPaths = paths.map(item => {
            const pathData = item.path;
            const commands = pathData.split(/(?=[ML])/);
            let d = '';
            commands.forEach(command => {
              const parts = command.trim().split(/\s+/);
              const type = parts[0];
              if (type === 'M' || type === 'L') {
                const x = parseFloat(parts[1]) - minX + padding;
                const y = parseFloat(parts[2]) - minY + padding;
                d += `${type} ${x} ${y} `;
              }
            });
            return d.trim();
          });

          const boundingWidth = maxX - minX + padding * 2;
          const boundingHeight = maxY - minY + padding * 2;

          // Créer une data URI JSON contenant les paths
          const svgJson = JSON.stringify({
            paths: normalizedPaths,
            width: boundingWidth,
            height: boundingHeight
          });

          const jsonBase64 = btoa(unescape(encodeURIComponent(svgJson)));
          const jsonDataUri = `data:application/json;base64,${jsonBase64}`;

          resolve(jsonDataUri);
        } catch (error) {
          reject(error);
        }
      }
    });
  }, [paths]);

  const saveAndAddNew = useCallback(async () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    if (paths.length === 0) {
      return;
    }

    try {
      const uri = await convertSvgToImage();
      setSavedSignatures((prev) => [...prev, uri]);
      setPaths([]);
      setCurrentPath('');
    } catch (error) {
      console.error('❌ Erreur lors de la sauvegarde:', error);
      alert('Erreur lors de la sauvegarde: ' + (error as Error).message);
    }
  }, [paths, convertSvgToImage]);

  const validateSignature = useCallback(async () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    try {
      let allSignatures = [...savedSignatures];

      if (paths.length > 0) {
        console.log('🎨 Conversion de la signature en image...');
        const uri = await convertSvgToImage();
        console.log('✅ Signature convertie, URI:', uri.substring(0, 100) + '...');
        allSignatures.push(uri);
      }

      if (allSignatures.length === 0) {
        return;
      }

      if (returnTo === 'edit' && memoryId) {
        const { getAllMemories, updateMemory } = await import('@/utils/memoriesStorage');
        const memories = await getAllMemories();
        const memory = memories.find(m => m.id === memoryId);

        if (memory) {
          let updatedSignatures = memory.signatureOverlays || [];

          if (allSignatures.length > 0) {
            const latestSignature = allSignatures[allSignatures.length - 1];
            const newSignature = {
              id: Date.now().toString(),
              uri: latestSignature,
              x: 50,
              y: 150,
              rotation: 0,
              scale: 1.2,
              color: '#ffffff',
            };
            updatedSignatures = [...updatedSignatures, newSignature];
          }

          await updateMemory({
            ...memory,
            signatureOverlays: updatedSignatures,
          });
        }

        router.back();
      } else {
        router.replace({
          pathname: '/compose',
          params: {
            photoUri: photoUri as string,
            signatures: JSON.stringify(allSignatures),
          },
        });
      }
    } catch (error) {
      console.error('Error capturing signature:', error);
      alert('Erreur lors de la capture: ' + (error as Error).message);
    }
  }, [paths, savedSignatures, photoUri, router, convertSvgToImage, returnTo, memoryId]);

  const getPromptText = () => {
    if (paths.length > 0) {
      return t('signatureSaved');
    }
    return t('signNow');
  };

  if (!isReady) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#10b981" style={{ marginTop: 100 }} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.container}>
      <View style={styles.container}>
        <View style={styles.signatureContainer}>
          <View
            ref={viewShotRef}
            style={styles.viewShot}
            collapsable={false}
          >
              <GestureDetector gesture={panDraw}>
                <View style={styles.drawingArea}>
                  <Svg width={SCREEN_WIDTH} height={SCREEN_HEIGHT}>
                    {paths.map((item, index) => (
                      <Path
                        key={index}
                        d={item.path}
                        stroke="#ffffff"
                        strokeWidth={8}
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    ))}
                    {currentPath && (
                      <Path
                        d={currentPath}
                        stroke="#ffffff"
                        strokeWidth={8}
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    )}
                  </Svg>
                </View>
              </GestureDetector>
            </View>
          </View>

        <View style={[styles.topBar, { top: insets.top + 20 }]}>
            <View style={styles.leftButtons}>
              <TouchableOpacity
                style={[styles.floatingButton, styles.backButton]}
                onPress={goBackToPhoto}
                activeOpacity={0.8}
              >
                <ArrowLeft size={24} color="#ffffff" strokeWidth={2} />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.floatingButton, styles.eraserButton]}
                onPress={clearSignature}
                activeOpacity={0.8}
              >
                <Eraser size={24} color="#ffffff" strokeWidth={2} />
              </TouchableOpacity>
            </View>

            <View style={styles.floatingButtons}>
              <TouchableOpacity
                style={[styles.floatingButton, styles.plusButton]}
                onPress={saveAndAddNew}
                activeOpacity={0.8}
              >
                <View style={styles.compositeIconContainer}>
                  <Pencil size={24} color="#10b981" strokeWidth={2.5} />
                  <View style={styles.plusBadge}>
                    <Plus size={12} color="#10b981" strokeWidth={3} />
                  </View>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.floatingButton, styles.validateButton]}
                onPress={validateSignature}
                activeOpacity={0.8}
              >
                <Check size={24} color="#ffffff" strokeWidth={2.5} />
              </TouchableOpacity>
            </View>
          </View>

        <View style={[styles.bottomTextContainer, { bottom: Math.max(insets.bottom, 20) }]}>
          <Animated.Text
            style={[
              styles.bottomText,
              paths.length > 0 && styles.bottomTextSaved,
              paths.length > 0 && animatedTextStyle,
            ]}
          >
            {getPromptText()}
          </Animated.Text>
        </View>
      </View>

      <PremiumModal
        visible={showPremiumModal}
        onClose={() => {
          setShowPremiumModal(false);
        }}
        onUpgrade={() => {
          setShowPremiumModal(false);
          router.push('/subscription');
        }}
        title={t('limitReached')}
        message={t('signatureLimitMessage')}
      />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  textModeContainer: {
    flex: 1,
    backgroundColor: '#2a2a2a',
  },
  textInputContainer: {
    position: 'absolute',
    top: 100,
    bottom: 160,
    left: 20,
    right: 20,
    justifyContent: 'center',
  },
  textInputFull: {
    fontSize: 28,
    color: '#ffffff',
    fontWeight: '600',
    textAlign: 'center',
    flex: 1,
    padding: 20,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
  },
  signatureContainer: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  viewShot: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  drawingArea: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  topBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    zIndex: 10,
  },
  leftButtons: {
    flexDirection: 'column',
    gap: 12,
  },
  floatingButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  floatingButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  backButton: {
    backgroundColor: '#10b981',
  },
  eraserButton: {
    backgroundColor: '#ef4444',
  },
  plusButton: {
    backgroundColor: '#ffffff',
  },
  textButton: {
    backgroundColor: '#6b7280',
  },
  textButtonActive: {
    backgroundColor: '#3B82F6',
  },
  signatureButton: {
    backgroundColor: '#6b7280',
  },
  signatureButtonActive: {
    backgroundColor: '#10b981',
  },
  validateButton: {
    backgroundColor: '#10b981',
  },
  compositeIconContainer: {
    position: 'relative',
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  plusBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    width: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomTextContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  bottomText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '500',
    textAlign: 'center',
  },
  bottomTextSaved: {
    color: '#10B981',
    fontWeight: '700',
  },
  fontSelectorContainer: {
    position: 'absolute',
    bottom: 70,
    left: 0,
    right: 0,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  fontButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  fontPickerContainer: {
    backgroundColor: '#2a2a2a',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 400,
    maxHeight: '70%',
  },
  fontPickerTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 20,
  },
  fontList: {
    maxHeight: 400,
  },
  fontOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: '#1a1a1a',
  },
  fontOptionSelected: {
    backgroundColor: '#10b98120',
    borderWidth: 2,
    borderColor: '#10b981',
  },
  fontOptionText: {
    color: '#ffffff',
    fontSize: 18,
    flex: 1,
  },
  fontOptionTextSelected: {
    color: '#10b981',
    fontWeight: '600',
  },
  premiumFontButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 16,
    borderRadius: 12,
    marginTop: 10,
    backgroundColor: '#8b5cf6',
  },
  premiumFontButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
