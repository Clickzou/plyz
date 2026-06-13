import { useState, useRef, useCallback, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, Platform, useWindowDimensions, ActivityIndicator, Image , Modal, TextInput, ScrollView, Text } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  GestureDetector,
  Gesture,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withRepeat, withSequence, withTiming, runOnJS } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { Eraser, Check, ArrowLeft, Plus, Pencil } from 'lucide-react-native';

import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { useTranslation } from '@/contexts/LanguageContext';

SplashScreen.preventAutoHideAsync();


interface DrawingPath {
  path: string;
  isDot?: boolean;
}

export default function SignatureScreen() {
  const { photoUri, existingSignatures, returnTo, memoryId } = useLocalSearchParams<{
    photoUri: string;
    existingSignatures?: string;
    returnTo?: string;
    memoryId?: string;
  }>();

  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  const [paths, setPaths] = useState<DrawingPath[]>([]);
  const [currentPath, setCurrentPath] = useState<string>('');
  const [savedSignatures, setSavedSignatures] = useState<string[]>(
    existingSignatures ? JSON.parse(existingSignatures as string) : []
  );
  const [showTextModal, setShowTextModal] = useState<boolean>(false);
  const [textInput, setTextInput] = useState<string>('');
  const [selectedFont, setSelectedFont] = useState<string>('SpaceMono');
  const [savedTexts, setSavedTexts] = useState<{ text: string; fontFamily: string }[]>([]);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const viewShotRef = useRef<View>(null);
  const startPointRef = useRef<{ x: number; y: number } | null>(null);
  const currentPathRef = useRef<string>('');

  const scale = useSharedValue(1);
  const badgePulse = useSharedValue(1);
  const hadPathsRef = useRef(paths.length > 0);
  
  const hasContent = savedSignatures.length > 0 || savedTexts.length > 0 || paths.length > 0;

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
  }, [paths.length]);

  const animatedTextStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
    };
  });

  const animatedBadgeStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: badgePulse.value }],
    };
  });

  useEffect(() => {
    if (hasContent) {
      badgePulse.value = withRepeat(
        withSequence(
          withTiming(1.3, { duration: 500 }),
          withTiming(1, { duration: 500 })
        ),
        -1,
        true
      );
    } else {
      badgePulse.value = 1;
    }
  }, [hasContent]);

  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    setTimeout(() => setIsReady(true), 100);
  }, []);

  const FONTS = [
    'SpaceMono',
    'Roboto',
    'OpenSans',
    'Lato',
    'Montserrat',
    'Oswald',
    'Raleway',
    'Merriweather',
    'PlayfairDisplay',
    'SourceSansPro',
    'NotoSans',
    'PTSans',
    'Ubuntu',
    'Nunito',
    'Quicksand',
    'DancingScript',
    'Pacifico',
    'GreatVibes',
    'Satisfy',
    'Caveat',
    'Kalam',
    'Handlee',
    'Architects Daughter',
    'IndieFlower',
    'ShadowsIntoLight',
    'Amatic SC',
    'Gloria Hallelujah',
    'Patrick Hand',
    'Courgette',
    'Sacramento',
  ];

  const handleAddText = useCallback(() => {
    if (textInput.trim()) {
      setSavedTexts((prev) => [...prev, { text: textInput.trim(), fontFamily: selectedFont }]);
      setTextInput('');
      setShowTextModal(false);
    }
  }, [textInput, selectedFont]);

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
        const r = 4;
        const cx = startPoint.x;
        const cy = startPoint.y;
        finalPath = `M ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy} Z`;
      }

      setPaths((prev) => [...prev, { path: finalPath, isDot: distance < 5 }]);
      setCurrentPath('');
      currentPathRef.current = '';
      startPointRef.current = null;
    }
  }, []);

  const onTapDot = useCallback((x: number, y: number) => {
    const r = 4;
    const dotPath = `M ${x - r} ${y} A ${r} ${r} 0 1 0 ${x + r} ${y} A ${r} ${r} 0 1 0 ${x - r} ${y} Z`;
    setPaths((prev) => [...prev, { path: dotPath, isDot: true }]);
  }, []);

  const tapDraw = Gesture.Tap()
    .onEnd((event) => {
      runOnJS(onTapDot)(event.x, event.y);
    });

  const panDraw = Gesture.Pan()
    .minDistance(1)
    .onStart((event) => {
      runOnJS(onDrawStart)(event.x, event.y);
    })
    .onUpdate((event) => {
      runOnJS(onDrawUpdate)(event.x, event.y);
    })
    .onEnd((event) => {
      runOnJS(onDrawEnd)(event.x, event.y);
    });

  const drawGesture = Gesture.Race(panDraw, tapDraw);

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
            const commands = pathData.split(/(?=[MLAZ])/);

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
              } else if (type === 'A' && parts.length >= 8) {
                const endX = parseFloat(parts[6]);
                const endY = parseFloat(parts[7]);
                minX = Math.min(minX, endX);
                minY = Math.min(minY, endY);
                maxX = Math.max(maxX, endX);
                maxY = Math.max(maxY, endY);
              }
            });
          });

          const padding = 20;

          if (minX === Infinity || minY === Infinity || maxX === -Infinity || maxY === -Infinity) {
            reject(new Error('Invalid path bounds'));
            return;
          }

          const normalizedPaths = paths.map(item => {
            const pathData = item.path;
            const commands = pathData.split(/(?=[MLAZ])/);
            let d = '';
            commands.forEach(command => {
              const parts = command.trim().split(/\s+/);
              const type = parts[0];
              if (type === 'M' || type === 'L') {
                const x = parseFloat(parts[1]) - minX + padding;
                const y = parseFloat(parts[2]) - minY + padding;
                d += `${type} ${x} ${y} `;
              } else if (type === 'A' && parts.length >= 8) {
                const endX = parseFloat(parts[6]) - minX + padding;
                const endY = parseFloat(parts[7]) - minY + padding;
                d += `A ${parts[1]} ${parts[2]} ${parts[3]} ${parts[4]} ${parts[5]} ${endX} ${endY} `;
              } else if (type === 'Z') {
                d += 'Z ';
              }
            });
            return { d: d.trim(), isDot: item.isDot || false };
          });

          const boundingWidth = maxX - minX + padding * 2;
          const boundingHeight = maxY - minY + padding * 2;

          const svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="${boundingWidth}" height="${boundingHeight}" viewBox="0 0 ${boundingWidth} ${boundingHeight}">
  ${normalizedPaths.map(p => p.isDot
    ? `<path d="${p.d}" stroke="none" fill="#ffffff" />`
    : `<path d="${p.d}" stroke="#ffffff" stroke-width="8" fill="none" stroke-linecap="round" stroke-linejoin="round" />`
  ).join('\n  ')}
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
            const commands = pathData.split(/(?=[MLAZ])/);

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
              } else if (type === 'A' && parts.length >= 8) {
                const endX = parseFloat(parts[6]);
                const endY = parseFloat(parts[7]);
                if (!isNaN(endX) && !isNaN(endY)) {
                  minX = Math.min(minX, endX);
                  minY = Math.min(minY, endY);
                  maxX = Math.max(maxX, endX);
                  maxY = Math.max(maxY, endY);
                }
              }
            });
          });

          const padding = 20;

          if (minX === Infinity || minY === Infinity || maxX === -Infinity || maxY === -Infinity) {
            reject(new Error('Invalid path bounds'));
            return;
          }

          const normalizedPaths = paths.map(item => {
            const pathData = item.path;
            const commands = pathData.split(/(?=[MLAZ])/);
            let d = '';
            commands.forEach(command => {
              const parts = command.trim().split(/\s+/);
              const type = parts[0];
              if (type === 'M' || type === 'L') {
                const x = parseFloat(parts[1]) - minX + padding;
                const y = parseFloat(parts[2]) - minY + padding;
                d += `${type} ${x} ${y} `;
              } else if (type === 'A' && parts.length >= 8) {
                const endX = parseFloat(parts[6]) - minX + padding;
                const endY = parseFloat(parts[7]) - minY + padding;
                d += `A ${parts[1]} ${parts[2]} ${parts[3]} ${parts[4]} ${parts[5]} ${endX} ${endY} `;
              } else if (type === 'Z') {
                d += 'Z ';
              }
            });
            return d.trim();
          });

          const boundingWidth = maxX - minX + padding * 2;
          const boundingHeight = maxY - minY + padding * 2;

          const svgJson = JSON.stringify({
            paths: normalizedPaths.map(p => p),
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
            texts: JSON.stringify(savedTexts),
          },
        });
      }
    } catch (error) {
      console.error('Error capturing signature:', error);
      alert('Erreur lors de la capture: ' + (error as Error).message);
    }
  }, [paths, savedSignatures, photoUri, router, convertSvgToImage, returnTo, memoryId, savedTexts]);

  const getPromptText = () => {
    if (paths.length > 0) {
      return t('signatureSaved');
    }
    if (savedTexts.length > 0) {
      return t('textAdded') || 'Texte ajouté !';
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
              <GestureDetector gesture={drawGesture}>
                <View style={styles.drawingArea}>
                  <Svg width={screenWidth} height={screenHeight}>
                    {paths.map((item, index) => (
                      <Path
                        key={index}
                        d={item.path}
                        stroke={item.isDot ? "none" : "#ffffff"}
                        strokeWidth={item.isDot ? 0 : 8}
                        fill={item.isDot ? "#ffffff" : "none"}
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
                  {savedSignatures.map((uri, index) => (
                    <View
                      key={`sig_${index}`}
                      style={[
                        styles.savedSignatureOverlay,
                        { top: 80 + index * 100 }
                      ]}
                    >
                      <Image 
                        source={{ uri }} 
                        style={styles.savedSignatureImage}
                        resizeMode="contain"
                      />
                    </View>
                  ))}
                  {savedTexts.map((item, index) => (
                    <View
                      key={`text_${index}`}
                      style={[
                        styles.savedTextOverlay,
                        { top: 150 + savedSignatures.length * 100 + index * 60 }
                      ]}
                    >
                      <Text style={[styles.savedTextStyle, { fontFamily: item.fontFamily }]}>
                        {item.text}
                      </Text>
                    </View>
                  ))}
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
                style={[styles.floatingButton, styles.signatureYellowButton]}
                onPress={saveAndAddNew}
                activeOpacity={0.8}
              >
                <Pencil size={24} color="#1a1a1a" strokeWidth={2.5} />
                {(savedSignatures.length > 0 || paths.length > 0) && (
                  <Animated.View style={[styles.plusBadgeYellow, animatedBadgeStyle]}>
                    <Plus size={14} color="#1a1a1a" strokeWidth={3} />
                  </Animated.View>
                )}
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

      <Modal
        visible={showTextModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowTextModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.textModalContainer}>
            <Text style={styles.textModalTitle}>{t('addText') || 'Ajouter du texte'}</Text>
            
            <TextInput
              style={[styles.textModalInput, { fontFamily: selectedFont }]}
              placeholder={t('enterText') || 'Entrez votre texte...'}
              placeholderTextColor="#666"
              value={textInput}
              onChangeText={setTextInput}
              multiline
              autoFocus
            />

            <Text style={styles.fontSectionTitle}>{t('selectFont') || 'Police'}</Text>
            <ScrollView style={styles.fontListModal} showsVerticalScrollIndicator={false}>
              {FONTS.map((font) => (
                <TouchableOpacity
                  key={font}
                  style={[
                    styles.fontOptionModal,
                    selectedFont === font && styles.fontOptionSelectedModal,
                  ]}
                  onPress={() => setSelectedFont(font)}
                >
                  <Text
                    style={[
                      styles.fontOptionTextModal,
                      { fontFamily: font },
                      selectedFont === font && styles.fontOptionTextSelectedModal,
                    ]}
                  >
                    {font}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.textModalButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => {
                  setShowTextModal(false);
                  setTextInput('');
                }}
              >
                <Text style={styles.cancelButtonText}>{t('cancel') || 'Annuler'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.addTextButton, !textInput.trim() && styles.addTextButtonDisabled]}
                onPress={handleAddText}
                disabled={!textInput.trim()}
              >
                <Text style={styles.addTextButtonText}>{t('add') || 'Ajouter'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  textAddButton: {
    backgroundColor: '#3B82F6',
  },
  signatureYellowButton: {
    backgroundColor: '#eab308',
  },
  plusBadgeYellow: {
    position: 'absolute',
    bottom: -10,
    right: -10,
    backgroundColor: '#eab308',
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#1a1a1a',
  },
  plusBadgeBlue: {
    position: 'absolute',
    bottom: -10,
    right: -10,
    backgroundColor: '#3B82F6',
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#1a1a1a',
  },
  savedTextOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  savedTextStyle: {
    color: '#ffffff',
    fontSize: 32,
    fontWeight: 'bold',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 5,
  },
  savedSignatureOverlay: {
    position: 'absolute',
    left: 20,
    right: 20,
    height: 80,
    alignItems: 'center',
  },
  savedSignatureImage: {
    width: 150,
    height: 80,
    tintColor: '#ffffff',
  },
  textModalContainer: {
    backgroundColor: '#2a2a2a',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 400,
    maxHeight: '80%',
  },
  textModalTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 16,
  },
  textModalInput: {
    backgroundColor: '#1a1a1a',
    color: '#ffffff',
    fontSize: 20,
    padding: 16,
    borderRadius: 12,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 16,
  },
  fontSectionTitle: {
    color: '#999',
    fontSize: 14,
    marginBottom: 8,
  },
  fontListModal: {
    maxHeight: 200,
    marginBottom: 16,
  },
  fontOptionModal: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 4,
    backgroundColor: '#1a1a1a',
  },
  fontOptionSelectedModal: {
    backgroundColor: '#10b98120',
    borderWidth: 2,
    borderColor: '#10b981',
  },
  fontOptionTextModal: {
    color: '#ffffff',
    fontSize: 16,
  },
  fontOptionTextSelectedModal: {
    color: '#10b981',
    fontWeight: '600',
  },
  textModalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#4a4a4a',
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  addTextButton: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#10b981',
    alignItems: 'center',
  },
  addTextButtonDisabled: {
    backgroundColor: '#4a4a4a',
    opacity: 0.5,
  },
  addTextButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
