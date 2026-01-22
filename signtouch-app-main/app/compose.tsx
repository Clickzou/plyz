import { useState, useRef, useEffect } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Image,
  Dimensions,
  Platform,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { GestureDetector, Gesture, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { Check, ChevronLeft, ChevronRight, Palette, Pencil, Plus, Trash2 } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { captureRef } from 'react-native-view-shot';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { Memory, SignatureOverlay } from '@/utils/memoriesStorage';
import * as StorageService from '@/utils/storageService';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useAuth } from '@/contexts/AuthContext';
import PremiumModal from '@/components/PremiumModal';
import { useTranslation } from '@/contexts/LanguageContext';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface AnimatedSignatureProps {
  uri: string;
  transform: SignatureTransform;
  index: number;
  strokeScale: number;
  color: string;
  isSelected: boolean;
  gesture: any;
}

function AnimatedSignature({ uri, transform, index, strokeScale, color, isSelected, gesture }: AnimatedSignatureProps) {
  const [imageDimensions, setImageDimensions] = useState({ width: 150, height: 80 });
  const [svgData, setSvgData] = useState<any>(null);

  // Vérifier si c'est une data URI JSON (mobile SVG paths)
  const isJsonData = uri.startsWith('data:application/json;base64,');

  useEffect(() => {
    if (isJsonData) {
      try {
        const base64Data = uri.split(',')[1];
        const jsonString = decodeURIComponent(escape(atob(base64Data)));
        const parsed = JSON.parse(jsonString);
        setSvgData(parsed);
        setImageDimensions({ width: parsed.width, height: parsed.height });
      } catch (error) {
        console.error('Error parsing SVG data:', error);
      }
      return;
    }

    if (Platform.OS === 'web') {
      return;
    }

    Image.getSize(
      uri,
      (width, height) => {
        if (width && height && width > 0 && height > 0) {
          const aspectRatio = width / height;
          const maxWidth = Math.min(width, 250);
          const calculatedHeight = maxWidth / aspectRatio;
          setImageDimensions({ width: maxWidth, height: calculatedHeight });
        }
      },
      (error) => {
        console.error('Error getting image size:', error);
      }
    );
  }, [uri, isJsonData]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateX: transform.translateX.value },
        { translateY: transform.translateY.value },
        { rotate: `${transform.rotation.value}rad` },
        { scale: transform.scale.value * strokeScale },
      ],
    };
  });

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[styles.signatureWrapper, animatedStyle, { width: imageDimensions.width, height: imageDimensions.height }]}>
        {svgData ? (
          <Svg width={svgData.width} height={svgData.height} style={styles.signature}>
            {svgData.paths.map((pathData: string, idx: number) => (
              <Path
                key={idx}
                d={pathData}
                stroke={color}
                strokeWidth={8}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </Svg>
        ) : (
          <Image
            source={{ uri }}
            style={[styles.signature, { tintColor: color }]}
            resizeMode="contain"
          />
        )}
        {isSelected && <View style={styles.selectionBorder} />}
      </Animated.View>
    </GestureDetector>
  );
}

const COLORS = [
  '#ffffff', // Blanc
  '#3b82f6', // Bleu
  '#10b981', // Vert
  '#eab308', // Jaune
  '#f97316', // Orange
  '#a855f7', // Violet
  '#ec4899', // Rose
  '#000000', // Noir
  '#6b7280', // Gris
  '#92400e', // Marron
  '#d4c5a9', // Beige
  '#14b8a6', // Turquoise
  '#06b6d4', // Cyan
  '#e879f9', // Magenta
  '#6366f1', // Indigo
  '#9333ea', // Pourpre
  '#7f1d1d', // Bordeaux
  '#fb923c', // Saumon
  '#fb7185', // Corail
  '#84803b', // Kaki
  '#808000', // Olive
  '#98ff98', // Menthe
  '#e6e6fa', // Lavande
  '#fffff0', // Ivoire
  '#cc7722', // Ocre
  '#c2b280', // Sable
  '#293133', // Anthracite
  '#084c61', // Pétrole
  '#ff00ff', // Fuchsia
];
const STROKE_SCALES = [0.7, 1.0, 1.4];

interface SignatureTransform {
  scale: any;
  savedScale: any;
  translateX: any;
  translateY: any;
  savedTranslateX: any;
  savedTranslateY: any;
  rotation: any;
  savedRotation: any;
}

export default function ComposeScreen() {
  const { photoUri, signatures, memoryId } = useLocalSearchParams<{
    photoUri: string;
    signatures: string;
    memoryId?: string;
  }>();


  const signatureUris = signatures ? JSON.parse(signatures as string) : [];

  const [loadedPhotoUri, setLoadedPhotoUri] = useState<string | null>(null);
  const [isLoadingMemory, setIsLoadingMemory] = useState(!!memoryId);
  const [selectedSignatureIndex, setSelectedSignatureIndex] = useState<number | null>(0);
  const [signatureColors, setSignatureColors] = useState<string[]>(
    signatureUris.map(() => '#ffffff')
  );
  const [signatureStrokeScales] = useState<number[]>(
    signatureUris.map(() => 1.0)
  );
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showStrokePicker, setShowStrokePicker] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const viewShotRef = useRef<View>(null);
  const { status } = useSubscription();
  const { t } = useTranslation();
  const { user } = useAuth();

  // Create shared values for all potential signatures (max 20 for example)
  const scales = [
    useSharedValue(1.5), useSharedValue(1.5), useSharedValue(1.5), useSharedValue(1.5), useSharedValue(1.5),
    useSharedValue(1.5), useSharedValue(1.5), useSharedValue(1.5), useSharedValue(1.5), useSharedValue(1.5),
    useSharedValue(1.5), useSharedValue(1.5), useSharedValue(1.5), useSharedValue(1.5), useSharedValue(1.5),
    useSharedValue(1.5), useSharedValue(1.5), useSharedValue(1.5), useSharedValue(1.5), useSharedValue(1.5)
  ];
  const savedScales = [
    useSharedValue(1.5), useSharedValue(1.5), useSharedValue(1.5), useSharedValue(1.5), useSharedValue(1.5),
    useSharedValue(1.5), useSharedValue(1.5), useSharedValue(1.5), useSharedValue(1.5), useSharedValue(1.5),
    useSharedValue(1.5), useSharedValue(1.5), useSharedValue(1.5), useSharedValue(1.5), useSharedValue(1.5),
    useSharedValue(1.5), useSharedValue(1.5), useSharedValue(1.5), useSharedValue(1.5), useSharedValue(1.5)
  ];
  const translateXs = [
    useSharedValue(0), useSharedValue(0), useSharedValue(0), useSharedValue(0), useSharedValue(0),
    useSharedValue(0), useSharedValue(0), useSharedValue(0), useSharedValue(0), useSharedValue(0),
    useSharedValue(0), useSharedValue(0), useSharedValue(0), useSharedValue(0), useSharedValue(0),
    useSharedValue(0), useSharedValue(0), useSharedValue(0), useSharedValue(0), useSharedValue(0)
  ];
  const translateYs = [
    useSharedValue(0), useSharedValue(0), useSharedValue(0), useSharedValue(0), useSharedValue(0),
    useSharedValue(0), useSharedValue(0), useSharedValue(0), useSharedValue(0), useSharedValue(0),
    useSharedValue(0), useSharedValue(0), useSharedValue(0), useSharedValue(0), useSharedValue(0),
    useSharedValue(0), useSharedValue(0), useSharedValue(0), useSharedValue(0), useSharedValue(0)
  ];
  const savedTranslateXs = [
    useSharedValue(0), useSharedValue(0), useSharedValue(0), useSharedValue(0), useSharedValue(0),
    useSharedValue(0), useSharedValue(0), useSharedValue(0), useSharedValue(0), useSharedValue(0),
    useSharedValue(0), useSharedValue(0), useSharedValue(0), useSharedValue(0), useSharedValue(0),
    useSharedValue(0), useSharedValue(0), useSharedValue(0), useSharedValue(0), useSharedValue(0)
  ];
  const savedTranslateYs = [
    useSharedValue(0), useSharedValue(0), useSharedValue(0), useSharedValue(0), useSharedValue(0),
    useSharedValue(0), useSharedValue(0), useSharedValue(0), useSharedValue(0), useSharedValue(0),
    useSharedValue(0), useSharedValue(0), useSharedValue(0), useSharedValue(0), useSharedValue(0),
    useSharedValue(0), useSharedValue(0), useSharedValue(0), useSharedValue(0), useSharedValue(0)
  ];
  const rotations = [
    useSharedValue(0), useSharedValue(0), useSharedValue(0), useSharedValue(0), useSharedValue(0),
    useSharedValue(0), useSharedValue(0), useSharedValue(0), useSharedValue(0), useSharedValue(0),
    useSharedValue(0), useSharedValue(0), useSharedValue(0), useSharedValue(0), useSharedValue(0),
    useSharedValue(0), useSharedValue(0), useSharedValue(0), useSharedValue(0), useSharedValue(0)
  ];
  const savedRotations = [
    useSharedValue(0), useSharedValue(0), useSharedValue(0), useSharedValue(0), useSharedValue(0),
    useSharedValue(0), useSharedValue(0), useSharedValue(0), useSharedValue(0), useSharedValue(0),
    useSharedValue(0), useSharedValue(0), useSharedValue(0), useSharedValue(0), useSharedValue(0),
    useSharedValue(0), useSharedValue(0), useSharedValue(0), useSharedValue(0), useSharedValue(0)
  ];

  const signatureTransforms = useRef<SignatureTransform[]>(
    signatureUris.map((_: string, index: number) => {
      const initialX = SCREEN_WIDTH / 2 - 60 + index * 50;
      const initialY = SCREEN_HEIGHT / 2 - 60 + index * 50;
      
      translateXs[index].value = initialX;
      translateYs[index].value = initialY;
      savedTranslateXs[index].value = initialX;
      savedTranslateYs[index].value = initialY;

      return {
        scale: scales[index],
        savedScale: savedScales[index],
        translateX: translateXs[index],
        translateY: translateYs[index],
        savedTranslateX: savedTranslateXs[index],
        savedTranslateY: savedTranslateYs[index],
        rotation: rotations[index],
        savedRotation: savedRotations[index],
      };
    })
  ).current;

  useEffect(() => {
    if (memoryId) {
      loadMemoryPhoto();
    }
  }, [memoryId, loadMemoryPhoto]);

  const loadMemoryPhoto = useCallback(async () => {
    try {
      console.log('📂 Chargement de la memory pour composition:', memoryId);
      const memories = await StorageService.getAllMemories(user?.id || null);
      const memory = memories.find(m => m.id === memoryId);

      if (memory && memory.uri) {
        console.log('✅ Memory trouvée, URI:', memory.uri.substring(0, 50) + '...');
        setLoadedPhotoUri(memory.uri);
      } else {
        console.warn('⚠️ Memory non trouvée ou sans URI');
        setLoadedPhotoUri(photoUri as string);
      }
    } catch (error) {
      console.error('❌ Erreur chargement memory:', error);
      setLoadedPhotoUri(photoUri as string);
    } finally {
      setIsLoadingMemory(false);
    }
  }, [memoryId, photoUri, user?.id]);

  const createGesture = (transform: SignatureTransform, index: number) => {
    const tap = Gesture.Tap()
      .onEnd(() => {
        if (Platform.OS !== 'web') {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        setSelectedSignatureIndex(index);
      });

    const pinch = Gesture.Pinch()
      .onUpdate((event) => {
        transform.scale.value = Math.max(0.3, Math.min(4, transform.savedScale.value * event.scale));
      })
      .onEnd(() => {
        transform.savedScale.value = transform.scale.value;
      });

    const rotate = Gesture.Rotation()
      .onUpdate((event) => {
        transform.rotation.value = transform.savedRotation.value + event.rotation;
      })
      .onEnd(() => {
        transform.savedRotation.value = transform.rotation.value;
      });

    const pan = Gesture.Pan()
      .onUpdate((event) => {
        transform.translateX.value = transform.savedTranslateX.value + event.translationX;
        transform.translateY.value = transform.savedTranslateY.value + event.translationY;
      })
      .onEnd(() => {
        transform.savedTranslateX.value = transform.translateX.value;
        transform.savedTranslateY.value = transform.translateY.value;
      });

    return Gesture.Race(tap, Gesture.Simultaneous(pinch, rotate, pan));
  };


  const addNewSignature = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    // Naviguer vers l'écran de signature avec les signatures existantes
    router.replace({
      pathname: '/signature',
      params: {
        photoUri: finalPhotoUri as string,
        existingSignatures: JSON.stringify(signatureUris),
      },
    });
  };

  const deleteSelectedElement = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    if (selectedSignatureIndex !== null) {
      // Supprimer la signature sélectionnée
      const newSignatureUris = signatureUris.filter((_: string, index: number) => index !== selectedSignatureIndex);
      // Removed newColors and newStrokeScales as they were unused


      router.replace({
        pathname: '/compose',
        params: {
          photoUri: finalPhotoUri as string,
          signatures: JSON.stringify(newSignatureUris),
        },
      });
    }
  };

  const captureComposition = async (): Promise<string> => {
    return new Promise(async (resolve, reject) => {
      if (Platform.OS === 'web') {
        try {
          console.log('🎨 Début capture Web...');
          console.log('📸 Photo URI:', finalPhotoUri);
          console.log('✍️ Signatures:', signatureUris.length);

          // Réduire la taille du canvas pour économiser l'espace
          const maxWidth = 800; // Limite la largeur pour réduire la taille
          const canvasScale = Math.min(1, maxWidth / SCREEN_WIDTH);
          const canvasWidth = SCREEN_WIDTH * canvasScale;
          const canvasHeight = SCREEN_HEIGHT * canvasScale;

          const canvas = document.createElement('canvas');
          canvas.width = canvasWidth;
          canvas.height = canvasHeight;
          const ctx = canvas.getContext('2d');

          if (!ctx) {
            reject(new Error('Could not get canvas context'));
            return;
          }

          const photoImg = new window.Image();

          photoImg.onload = () => {
            console.log('✅ Photo chargée');
            console.log('📐 Canvas:', canvas.width, 'x', canvas.height);
            console.log('📐 Photo:', photoImg.width, 'x', photoImg.height);

            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.drawImage(photoImg, 0, 0, canvas.width, canvas.height);
            console.log('✅ Photo dessinée sur le canvas');

            let loadedSignatures = 0;
            const signatureImages: HTMLImageElement[] = [];

            const drawAllSignatures = () => {
              console.log('✅ Toutes les signatures chargées');

              signatureImages.forEach((signatureImg, index) => {
                const transform = signatureTransforms[index];
                const tx = transform.translateX.value * canvasScale;
                const ty = transform.translateY.value * canvasScale;
                const rotation = transform.rotation.value;
                const strokeScale = signatureStrokeScales[index] || 1.0;
                const sc = (transform.scale.value * strokeScale) * canvasScale;
                const color = signatureColors[index] || '#ffffff';

                console.log(`🎯 Signature ${index + 1} - Position:`, tx, ty, 'Scale:', sc, 'Rotation:', rotation, 'Color:', color);

                ctx.save();
                ctx.translate(tx, ty);
                ctx.rotate(rotation);
                ctx.scale(sc, sc);

                if (color !== '#ffffff') {
                  const tempCanvas = document.createElement('canvas');
                  tempCanvas.width = 100;
                  tempCanvas.height = 60;
                  const tempCtx = tempCanvas.getContext('2d');

                  if (tempCtx) {
                    tempCtx.drawImage(signatureImg, 0, 0, 100, 60);
                    tempCtx.globalCompositeOperation = 'source-in';
                    tempCtx.fillStyle = color;
                    tempCtx.fillRect(0, 0, 100, 60);

                    ctx.drawImage(tempCanvas, 0, 0, 100, 60);
                  }
                } else {
                  ctx.drawImage(signatureImg, 0, 0, 100, 60);
                }

                ctx.restore();
              });

              console.log('✅ Toutes les signatures dessinées sur le canvas');

              const dataUrl = canvas.toDataURL('image/jpeg', 0.5);
              console.log('✅ Data URL créé, longueur:', dataUrl.length);
              resolve(dataUrl);
            };

            // Si pas de signatures, dessiner directement le texte
            if (signatureUris.length === 0) {
              console.log('⚡ Pas de signatures, dessin direct du texte');
              drawAllSignatures();
              return;
            }

            signatureUris.forEach((uri: string, index: number) => {
              // Vérifier si c'est une data URI JSON (mobile SVG paths)
              if (uri.startsWith('data:application/json;base64,')) {
                try {
                  const base64Data = uri.split(',')[1];
                  const jsonString = decodeURIComponent(escape(atob(base64Data)));
                  const svgData = JSON.parse(jsonString);

                  // Créer un SVG et le convertir en Image
                  const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgData.width}" height="${svgData.height}">${svgData.paths.map((pathData: string) => `<path d="${pathData}" stroke="white" stroke-width="8" fill="none" stroke-linecap="round" stroke-linejoin="round" />`).join('')}</svg>`;
                  const svgBlob = new Blob([svgContent], { type: 'image/svg+xml' });
                  const svgUrl = URL.createObjectURL(svgBlob);

                  const signatureImg = new window.Image();
                  signatureImg.onload = () => {
                    console.log(`✅ Signature SVG ${index + 1} chargée`);
                    signatureImages[index] = signatureImg;
                    loadedSignatures++;
                    URL.revokeObjectURL(svgUrl);

                    if (loadedSignatures === signatureUris.length) {
                      drawAllSignatures();
                    }
                  };
                  signatureImg.onerror = (e) => {
                    console.error(`❌ Erreur chargement signature SVG ${index + 1}:`, e);
                    URL.revokeObjectURL(svgUrl);
                    reject(new Error(`Failed to load signature ${index + 1}`));
                  };
                  signatureImg.src = svgUrl;
                } catch (error) {
                  console.error(`❌ Erreur parsing signature JSON ${index + 1}:`, error);
                  reject(new Error(`Failed to parse signature ${index + 1}`));
                }
              } else {
                // Image PNG classique
                const signatureImg = new window.Image();

                signatureImg.onload = () => {
                  console.log(`✅ Signature ${index + 1} chargée`);
                  signatureImages[index] = signatureImg;
                  loadedSignatures++;

                  if (loadedSignatures === signatureUris.length) {
                    drawAllSignatures();
                  }
                };

                signatureImg.onerror = (e) => {
                  console.error(`❌ Erreur chargement signature ${index + 1}:`, e);
                  reject(new Error(`Failed to load signature ${index + 1}`));
                };
                signatureImg.src = uri;
              }
            });
          };

          photoImg.onerror = (e) => {
            console.error('❌ Erreur chargement photo:', e);
            reject(new Error('Failed to load photo'));
          };
          photoImg.src = finalPhotoUri as string;
        } catch (error) {
          console.error('❌ Erreur capture:', error);
          reject(error);
        }
      } else {
        try {
          if (!viewShotRef.current) {
            throw new Error('View reference is null');
          }
          const uri = await captureRef(viewShotRef.current, {
            format: 'png',
            quality: 1.0,
          });
          resolve(uri);
        } catch (error) {
          reject(error);
        }
      }
    });
  };

  const validateComposition = async () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    try {
      setIsSaving(true);
      console.log('📸 Capture de la composition...');

      const uri = await captureComposition();
      console.log('✅ Image capturée:', uri);

      const signatureOverlays: SignatureOverlay[] = signatureUris.map((sigUri: string, index: number) => {
        const transform = signatureTransforms[index];
        return {
          id: `sig_${Date.now()}_${index}`,
          uri: sigUri,
          x: transform.translateX.value,
          y: transform.translateY.value,
          rotation: (transform.rotation.value * 180) / Math.PI,
          scale: transform.scale.value * signatureStrokeScales[index],
          color: signatureColors[index],
        };
      });

      console.log('💾 Sauvegarde dans la galerie avec overlays...');

      if (Platform.OS === 'web') {
        // Web: utiliser localStorage avec gestion quota
        const timestamp = Date.now();
        const newMemoryId = `memory_${timestamp}.jpg`;
        const newMemory: Memory = {
          id: newMemoryId,
          uri: uri,
          baseUri: finalPhotoUri as string,
          timestamp: timestamp,
          signatureOverlays: signatureOverlays.length > 0 ? signatureOverlays : undefined,
        };

        const memories = JSON.parse(localStorage.getItem('memories') || '[]');

        if (memories.length >= 8) {
          memories.splice(7);
          console.log('⚠️ Limite atteinte, suppression des plus anciens');
        }

        memories.unshift(newMemory);
        try {
          localStorage.setItem('memories', JSON.stringify(memories));
        } catch (quotaError: any) {
          if (quotaError.name === 'QuotaExceededError') {
            console.error('❌ Quota dépassé, nettoyage...');
            const reducedMemories = memories.slice(0, 3);
            try {
              localStorage.setItem('memories', JSON.stringify(reducedMemories));
            } catch (e) {
              localStorage.clear();
              localStorage.setItem('memories', JSON.stringify([newMemory]));
            }
          } else {
            throw quotaError;
          }
        }
      } else {
        // Mobile: utiliser StorageService avec AsyncStorage ou cloud
        const savedMemory = await StorageService.saveMemory(
          uri,
          user?.id || null,
          {
            signatureOverlays: signatureOverlays.length > 0 ? signatureOverlays : undefined,
          }
        );
      }

      console.log('✅ Souvenir sauvegardé');

      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      setIsSaved(true);
      console.log('✨ Animation de succès...');

      setTimeout(() => {
        console.log('🚀 Navigation vers la galerie');
        setIsSaving(false);
        setIsSaved(false);
        router.push('/gallery');
      }, 800);
    } catch (error) {
      console.error('❌ Erreur lors de la validation:', error);
      const errorMessage = (error as Error).message;
      setIsSaving(false);
      setIsSaved(false);

      if (errorMessage.includes('quota') || errorMessage.includes('Quota')) {
        if (Platform.OS === 'web') {
          alert('Espace de stockage saturé. Supprimez des souvenirs depuis la galerie.');
        } else {
          Alert.alert('Erreur', 'Espace de stockage saturé. Supprimez des souvenirs depuis la galerie.');
        }
      } else {
        if (Platform.OS === 'web') {
          alert('Erreur: ' + errorMessage);
        } else {
          Alert.alert('Erreur', errorMessage);
        }
      }
    }
  };

  const toggleColorPicker = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setShowColorPicker(!showColorPicker);
    setShowStrokePicker(false);
  };

  const toggleStrokePicker = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setShowStrokePicker(!showStrokePicker);
    setShowColorPicker(false);
  };

  const selectColor = (color: string) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    if (selectedSignatureIndex !== null) {
      const newColors = [...signatureColors];
      newColors[selectedSignatureIndex] = color;
      setSignatureColors(newColors);
    }
    setShowColorPicker(false);
  };

  const selectStroke = (strokeScale: number) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    if (selectedSignatureIndex !== null) {
      const newStrokeScales = [...signatureStrokeScales];
      newStrokeScales[selectedSignatureIndex] = strokeScale;
      setSignatureStrokeScales(newStrokeScales);
    }
    setShowStrokePicker(false);
  };

  const rotateSelected = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    if (selectedSignatureIndex !== null) {
      const transform = signatureTransforms[selectedSignatureIndex];
      transform.rotation.value = transform.rotation.value + Math.PI / 2;
      transform.savedRotation.value = transform.rotation.value;
    }
  };

  const buttonBottom = insets.bottom + 20;

  const finalPhotoUri = loadedPhotoUri || photoUri;

  if (isLoadingMemory) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#10b981" />
        </View>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.container}>
      <View style={styles.container}>
        <View
          ref={viewShotRef}
          style={styles.viewShot}
          collapsable={false}
        >
          <Image
            source={{ uri: finalPhotoUri }}
            style={styles.photo}
            resizeMode="cover"
          />
          {signatureUris.map((uri: string, index: number) => {
            const transform = signatureTransforms[index];
            const gesture = createGesture(transform, index);
            const strokeScale = signatureStrokeScales[index] || 1.0;
            const color = signatureColors[index];
            const isSelected = selectedSignatureIndex === index;

            return (
              <AnimatedSignature
                key={index}
                uri={uri}
                transform={transform}
                index={index}
                strokeScale={strokeScale}
                color={color}
                isSelected={isSelected}
                gesture={gesture}
              />
            );
          })}
        </View>

        {!isSaved && (
          <>
            <View style={[styles.floatingControls, { bottom: buttonBottom }]}>
              {selectedSignatureIndex !== null && (
                <TouchableOpacity
                  style={[styles.bottomButton, styles.deleteBottomButton]}
                  onPress={deleteSelectedElement}
                  activeOpacity={0.8}
                >
                  <View style={styles.deleteIconContainer}>
                    <Trash2 size={20} color="#ffffff" strokeWidth={2.5} />
                    <View style={styles.deleteSubIcon}>
                      <Pencil size={12} color="#ffffff" strokeWidth={3} />
                    </View>
                  </View>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.paletteButton, showColorPicker && styles.paletteButtonActive]}
                onPress={toggleColorPicker}
                activeOpacity={0.8}
                disabled={selectedSignatureIndex === null}
              >
                <Palette size={24} color="#ffffff" strokeWidth={2} />
              </TouchableOpacity>
            </View>

            {showColorPicker && selectedSignatureIndex !== null && (
              <View style={[styles.pickerOverlay, { bottom: buttonBottom + 80 }]}>
                <View style={styles.pickerContainer}>
                  <View style={styles.pickerArrow}>
                    <ChevronLeft size={20} color="rgba(255, 255, 255, 0.6)" strokeWidth={2} />
                  </View>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.pickerScroll}
                    scrollEnabled={true}
                    nestedScrollEnabled={true}
                  >
                    <View style={styles.pickerContent}>
                      {COLORS.map((color, index) => {
                        const isSelected = selectedSignatureIndex !== null && signatureColors[selectedSignatureIndex] === color;
                        return (
                          <TouchableOpacity
                            key={color}
                            style={[
                              styles.colorOption,
                              { backgroundColor: color, marginRight: index < COLORS.length - 1 ? 15 : 0 },
                              isSelected && styles.selectedOption,
                            ]}
                            onPress={() => selectColor(color)}
                            activeOpacity={0.8}
                          />
                        );
                      })}
                    </View>
                  </ScrollView>
                  <View style={styles.pickerArrow}>
                    <ChevronRight size={20} color="rgba(255, 255, 255, 0.6)" strokeWidth={2} />
                  </View>
                </View>
              </View>
            )}

            {showStrokePicker && selectedSignatureIndex !== null && (
              <View style={[styles.pickerOverlay, { bottom: buttonBottom + 80 }]}>
                <View style={styles.pickerContent}>
                  {STROKE_SCALES.map((strokeScale, index) => {
                    const isSelected = selectedSignatureIndex !== null && signatureStrokeScales[selectedSignatureIndex] === strokeScale;
                    return (
                      <TouchableOpacity
                        key={strokeScale}
                        style={[
                          styles.strokeOption,
                          isSelected && styles.selectedOption,
                        ]}
                        onPress={() => selectStroke(strokeScale)}
                        activeOpacity={0.8}
                      >
                        <View
                          style={[
                            styles.strokeDot,
                            {
                              width: 10 + index * 6,
                              height: 10 + index * 6,
                              borderRadius: (10 + index * 6) / 2,
                            },
                          ]}
                        />
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            <View style={[styles.topActions, { top: insets.top + 20 }]}>
              <TouchableOpacity
                style={[styles.topButton, styles.editTopButton]}
                onPress={addNewSignature}
                activeOpacity={0.8}
              >
                <View style={styles.iconContainer}>
                  <Pencil size={20} color="#ffffff" strokeWidth={2.5} />
                  <View style={styles.plusIcon}>
                    <Plus size={14} color="#ffffff" strokeWidth={3} />
                  </View>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.topButton, styles.saveTopButton, isSaving && styles.disabledButton]}
                onPress={validateComposition}
                disabled={isSaving}
                activeOpacity={0.8}
              >
                {isSaving ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Check size={24} color="#ffffff" strokeWidth={2} />
                )}
              </TouchableOpacity>
            </View>
          </>
        )}

        {isSaved && (
          <View style={styles.successOverlay}>
            <View style={styles.successIcon}>
              <Check size={32} color="#10b981" strokeWidth={3} />
            </View>
          </View>
        )}
      </View>

      <PremiumModal
        visible={showPremiumModal}
        onClose={() => setShowPremiumModal(false)}
        onUpgrade={() => {
          setShowPremiumModal(false);
          router.push('/subscription');
        }}
        title={t('limitReached')}
        message={t('limitReachedSignatureMessage')}
      />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewShot: {
    flex: 1,
    position: 'relative',
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  signatureWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  signature: {
    width: '100%',
    height: '100%',
  },
  textWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  textContainer: {
    alignSelf: 'flex-start',
  },
  textElement: {
    fontSize: 32,
    fontWeight: 'bold',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 5,
  },
  selectionBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 2,
    borderColor: '#10b981',
    borderRadius: 4,
    borderStyle: 'dashed',
  },
  floatingControls: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 20,
    zIndex: 10,
  },
  controlButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  controlButtonActive: {
    backgroundColor: '#10b981',
  },
  pickerOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 9,
  },
  pickerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    borderRadius: 30,
    paddingHorizontal: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
    maxWidth: '90%',
  },
  pickerArrow: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  pickerScroll: {
    flex: 1,
  },
  pickerContent: {
    flexDirection: 'row',
    paddingVertical: 15,
    paddingHorizontal: 15,
  },
  colorOption: {
    width: 45,
    height: 45,
    borderRadius: 22.5,
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  strokeOption: {
    width: 45,
    height: 45,
    borderRadius: 22.5,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selectedOption: {
    borderColor: '#10b981',
    borderWidth: 3,
  },
  strokeDot: {
    backgroundColor: '#ffffff',
  },
  topActions: {
    position: 'absolute',
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 10,
  },
  topButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  editTopButton: {
    backgroundColor: '#10b981',
  },
  textTopButton: {
    backgroundColor: '#10b981',
  },
  saveTopButton: {
    backgroundColor: '#10b981',
  },
  iconContainer: {
    position: 'relative',
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  plusIcon: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: '#10b981',
    borderRadius: 10,
  },
  deleteIconContainer: {
    position: 'relative',
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteSubIcon: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: '#ef4444',
    borderRadius: 8,
    padding: 1,
  },
  paletteButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#8b5cf6',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  paletteButtonActive: {
    backgroundColor: '#a855f7',
  },
  bottomButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  deleteBottomButton: {
    backgroundColor: '#ef4444',
  },
  disabledButton: {
    opacity: 0.6,
  },
  successOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20,
  },
  successIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
});
