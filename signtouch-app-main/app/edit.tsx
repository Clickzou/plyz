import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  Dimensions,
  ScrollView,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { X, FileSliders as Sliders, Check, Save, Move, Pencil, RotateCw, ChevronLeft, ChevronRight, Palette, Trash2, Sparkles, Eraser, Plus } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Memory, SignatureOverlay as StoredSignatureOverlay } from '@/utils/memoriesStorage';
import * as StorageService from '@/utils/storageService';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useAuth } from '@/contexts/AuthContext';
import PremiumModal from '@/components/PremiumModal';
import { useTranslation } from '@/contexts/LanguageContext';
import { captureRef } from 'react-native-view-shot';
import * as ImageManipulator from 'expo-image-manipulator';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, runOnJS } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { useFonts } from 'expo-font';
import { ShadowsIntoLight_400Regular } from '@expo-google-fonts/shadows-into-light';
import { CoveredByYourGrace_400Regular } from '@expo-google-fonts/covered-by-your-grace';
import { Caveat_400Regular } from '@expo-google-fonts/caveat';
import { IndieFlower_400Regular } from '@expo-google-fonts/indie-flower';
import { DancingScript_400Regular } from '@expo-google-fonts/dancing-script';
import { GreatVibes_400Regular } from '@expo-google-fonts/great-vibes';
import { Bangers_400Regular } from '@expo-google-fonts/bangers';
import { Fraunces_400Regular } from '@expo-google-fonts/fraunces';
import { ShantellSans_400Regular } from '@expo-google-fonts/shantell-sans';
import { Manrope_400Regular } from '@expo-google-fonts/manrope';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Safe haptics wrapper to prevent crashes on unsupported devices
const safeHaptics = {
  impact: async (style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) => {
    if (Platform.OS === 'web') return;
    try {
      await Haptics.impactAsync(style);
    } catch (e) {
      // Haptics not available
    }
  },
  notification: async (type: Haptics.NotificationFeedbackType = Haptics.NotificationFeedbackType.Success) => {
    if (Platform.OS === 'web') return;
    try {
      await Haptics.notificationAsync(type);
    } catch (e) {
      // Haptics not available
    }
  }
};

const SIGNATURE_COLORS = [
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

interface SignatureOverlay {
  id: string;
  uri: string;
  x: number;
  y: number;
  rotation: number;
  scale: number;
  color: string;
}

type OverlayElement = SignatureOverlay;

interface DraggableSignatureProps {
  overlay: SignatureOverlay;
  onPositionChange: (id: string, x: number, y: number) => void;
  onRotationChange: (id: string, rotation: number) => void;
  onScaleChange: (id: string, scale: number) => void;
  onLongPress: () => void;
  onPress: () => void;
  onSelect: () => void;
  isSelected: boolean;
  zIndex: number;
}

function DraggableSignature({ overlay, onPositionChange, onRotationChange, onScaleChange, onLongPress, onPress, onSelect, isSelected, zIndex }: DraggableSignatureProps) {
  const [imageDimensions, setImageDimensions] = useState({ width: 150, height: 80 });
  const [svgData, setSvgData] = useState<any>(null);
  
  const translateX = useSharedValue(overlay.x);
  const translateY = useSharedValue(overlay.y);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const rotation = useSharedValue(overlay.rotation);
  const savedRotation = useSharedValue(overlay.rotation);
  const scale = useSharedValue(overlay.scale);
  const savedScale = useSharedValue(overlay.scale);
  const isDragging = useSharedValue(0);

  // Vérifier si c'est une data URI JSON (mobile SVG paths)
  const isJsonData = overlay.uri.startsWith('data:application/json;base64,');

  useEffect(() => {
    if (isJsonData) {
      try {
        const base64Data = overlay.uri.split(',')[1];
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
      overlay.uri,
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
  }, [overlay.uri, isJsonData]);

  useEffect(() => {
    translateX.value = overlay.x;
    translateY.value = overlay.y;
  }, [overlay.x, overlay.y]);

  useEffect(() => {
    rotation.value = overlay.rotation;
    savedRotation.value = overlay.rotation;
  }, [overlay.rotation]);

  useEffect(() => {
    scale.value = overlay.scale;
    savedScale.value = overlay.scale;
  }, [overlay.scale]);

  const panGesture = Gesture.Pan()
    .shouldCancelWhenOutside(true)
    .onStart(() => {
      'worklet';
      isDragging.value = 1;
      startX.value = translateX.value;
      startY.value = translateY.value;
      runOnJS(onSelect)();
      if (Platform.OS !== 'web') {
        runOnJS(safeHaptics.impact)(Haptics.ImpactFeedbackStyle.Light);
      }
    })
    .onUpdate((event) => {
      'worklet';
      translateX.value = startX.value + event.translationX;
      translateY.value = startY.value + event.translationY;
    })
    .onEnd(() => {
      'worklet';
      isDragging.value = 0;
      runOnJS(onPositionChange)(overlay.id, translateX.value, translateY.value);
      if (Platform.OS !== 'web') {
        runOnJS(safeHaptics.impact)(Haptics.ImpactFeedbackStyle.Medium);
      }
    });

  const rotationGesture = Gesture.Rotation()
    .onUpdate((event) => {
      'worklet';
      rotation.value = savedRotation.value + (event.rotation * 180) / Math.PI;
    })
    .onEnd(() => {
      'worklet';
      savedRotation.value = rotation.value;
      runOnJS(onRotationChange)(overlay.id, rotation.value);
    });

  const pinchGesture = Gesture.Pinch()
    .onUpdate((event) => {
      'worklet';
      const newScale = savedScale.value * event.scale;
      scale.value = Math.max(0.2, Math.min(5, newScale));
    })
    .onEnd(() => {
      'worklet';
      runOnJS(onScaleChange)(overlay.id, scale.value);
      savedScale.value = scale.value;
    });

  const composedGesture = Gesture.Simultaneous(panGesture, rotationGesture, pinchGesture);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { rotate: `${rotation.value}deg` },
        { scale: withSpring(isDragging.value ? scale.value * 1.1 : scale.value) },
      ],
    };
  });

  return (
    <Animated.View
      style={[styles.draggableTextContainer, animatedStyle, { zIndex: zIndex }]}
      pointerEvents="auto"
    >
      <GestureDetector gesture={composedGesture}>
        <Animated.View collapsable={false}>
          <TouchableOpacity
            onLongPress={() => {
              console.log('[DEBUG] DraggableSignature onLongPress');
              onLongPress();
            }}
            onPress={() => {
              console.log('[DEBUG] DraggableSignature onPress');
              onPress();
            }}
            activeOpacity={0.9}
            style={styles.signatureTouchable}
            delayLongPress={500}
          >
            <View style={[styles.signatureContentWrapper, { width: imageDimensions.width, height: imageDimensions.height }]}>
              {svgData ? (
                <Svg 
                  width={svgData.width} 
                  height={svgData.height} 
                  viewBox={`0 0 ${svgData.width} ${svgData.height}`}
                  style={{ width: imageDimensions.width, height: imageDimensions.height }}
                >
                  {svgData.paths.map((pathData: string, idx: number) => (
                    <Path
                      key={idx}
                      d={pathData}
                      stroke={overlay.color}
                      strokeWidth={8}
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ))}
                </Svg>
              ) : (
                <Image
                  source={{ uri: overlay.uri }}
                  style={[{ width: imageDimensions.width, height: imageDimensions.height }, { tintColor: overlay.color }]}
                  resizeMode="contain"
                />
              )}
              {isSelected && <View style={styles.signatureSelectionBorder} />}
            </View>
          </TouchableOpacity>
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}

export default function EditScreen() {
  // Charger les polices pour mobile avec les nouveaux ET anciens noms comme alias
  const [fontsLoaded] = useFonts({
    // Nouveaux noms (pour les nouveaux textes)
    ShadowsIntoLight_400Regular,
    CoveredByYourGrace_400Regular,
    Caveat_400Regular,
    IndieFlower_400Regular,
    DancingScript_400Regular,
    GreatVibes_400Regular,
    Bangers_400Regular,
    Fraunces_400Regular,
    ShantellSans_400Regular,
    Manrope_400Regular,
    // Anciens noms comme alias (pour les textes existants)
    'Shadows Into Light': ShadowsIntoLight_400Regular,
    'Covered By Your Grace': CoveredByYourGrace_400Regular,
    'Caveat': Caveat_400Regular,
    'Indie Flower': IndieFlower_400Regular,
    'Dancing Script': DancingScript_400Regular,
    'Great Vibes': GreatVibes_400Regular,
    'Bangers': Bangers_400Regular,
    'Fraunces': Fraunces_400Regular,
    'Shantell Sans': ShantellSans_400Regular,
    'Manrope': Manrope_400Regular,
  });

  const params = useLocalSearchParams<{ memoryId: string; autoSave?: string }>();
  const { memoryId, autoSave } = params;

  const [memory, setMemory] = useState<Memory | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [overlays, setOverlays] = useState<OverlayElement[]>([]);
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null);
  const [showEditPanel, setShowEditPanel] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [isSignatureMode, setIsSignatureMode] = useState(false);
  const [signaturePaths, setSignaturePaths] = useState<{ path: string }[]>([]);
  const [currentPath, setCurrentPath] = useState('');
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const [showTooltip, setShowTooltip] = useState(true);
  const startPointRef = useRef<{ x: number; y: number } | null>(null);
  const viewShotRef = useRef<View>(null);
  const signatureViewRef = useRef<View>(null);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { status } = useSubscription();
  const { t } = useTranslation();
  const { user } = useAuth();

  const COLORS = SIGNATURE_COLORS;

  const loadOverlaysFromMemory = useCallback((signatures: SignatureOverlay[]) => {
    const newOverlays: OverlayElement[] = signatures.map(s => ({
      id: s.id,
      x: s.x,
      y: s.y,
      rotation: s.rotation,
      color: s.color,
      uri: s.uri,
      scale: s.scale,
    }));
    setOverlays(newOverlays);
  }, []);

  const getSignatureOverlays = useCallback((): SignatureOverlay[] => {
    return overlays;
  }, [overlays]);

  useEffect(() => {
    loadMemory();
  }, [memoryId]);

  useFocusEffect(
    useCallback(() => {
      loadMemory();
    }, [memoryId])
  );

  useEffect(() => {
    if (autoSave === 'true' && memory && !saving) {
      console.log('🔄 AutoSave activé, sauvegarde automatique de l\'image composite');
      setTimeout(() => {
        handleSave();
      }, 500);
    }
  }, [autoSave, memory]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowTooltip(false);
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (selectedOverlayId !== null) {
      setShowTooltip(false);
    }
  }, [selectedOverlayId]);

  const loadMemory = async () => {
    try {
      setLoading(true);
      const memories = await StorageService.getAllMemories(user?.id || null);
      const found = memories.find(m => m.id === memoryId);
      if (found) {
        setMemory(found);
        // Only load overlays if baseUri exists (meaning overlays are not baked into the image)
        if (found.baseUri) {
          console.log('🔍 Signatures chargées:', found.signatureOverlays?.length || 0);
          loadOverlaysFromMemory(found.signatureOverlays || []);
        } else {
          console.log('🔍 Pas de baseUri, overlays déjà dans l\'image');
          loadOverlaysFromMemory([]);
        }
      }
    } catch (error) {
      console.error('Error loading memory:', error);
    } finally {
      setLoading(false);
    }
  };

  const goToSignature = () => {
    if (Platform.OS !== 'web') {
      safeHaptics.impact(Haptics.ImpactFeedbackStyle.Light);
    }

    setIsSignatureMode(true);
    setShowEditPanel(false);
    setShowColorPicker(false);
    setSignaturePaths([]);
    setCurrentPath('');
  };

  const cancelSignature = () => {
    if (Platform.OS !== 'web') {
      safeHaptics.impact(Haptics.ImpactFeedbackStyle.Light);
    }
    setIsSignatureMode(false);
    setSignaturePaths([]);
    setCurrentPath('');
  };

  const clearSignaturePaths = () => {
    if (Platform.OS !== 'web') {
      safeHaptics.impact(Haptics.ImpactFeedbackStyle.Medium);
    }
    setSignaturePaths([]);
    setCurrentPath('');
  };

  const panDraw = Gesture.Pan()
    .onStart((event) => {
      startPointRef.current = { x: event.x, y: event.y };
      const newPath = `M ${event.x} ${event.y}`;
      setCurrentPath(newPath);
    })
    .onUpdate((event) => {
      setCurrentPath((prev) => `${prev} L ${event.x} ${event.y}`);
    })
    .onEnd((event) => {
      if (currentPath && startPointRef.current) {
        const dx = Math.abs(event.x - startPointRef.current.x);
        const dy = Math.abs(event.y - startPointRef.current.y);
        const distance = Math.sqrt(dx * dx + dy * dy);

        let finalPath = currentPath;
        if (distance < 3) {
          finalPath = `M ${startPointRef.current.x - 1} ${startPointRef.current.y} L ${startPointRef.current.x + 1} ${startPointRef.current.y}`;
        }

        setSignaturePaths((prev) => [
          ...prev,
          { path: finalPath },
        ]);
        setCurrentPath('');
        startPointRef.current = null;
      }
    });

  const convertSignatureToImage = async (): Promise<string> => {
    return new Promise(async (resolve, reject) => {
      if (Platform.OS === 'web') {
        try {
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

          signaturePaths.forEach((item) => {
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
          const boundingWidth = maxX - minX + padding * 2;
          const boundingHeight = maxY - minY + padding * 2;

          const canvas = document.createElement('canvas');
          canvas.width = boundingWidth;
          canvas.height = boundingHeight;
          const ctx = canvas.getContext('2d');

          if (!ctx) {
            reject(new Error('Could not get canvas context'));
            return;
          }

          ctx.clearRect(0, 0, boundingWidth, boundingHeight);
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 4;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.globalAlpha = 1.0;

          signaturePaths.forEach((item) => {
            const pathData = item.path;
            const commands = pathData.split(/(?=[ML])/);

            ctx.beginPath();
            let isFirstCommand = true;
            commands.forEach((command, index) => {
              const parts = command.trim().split(/\s+/);
              const type = parts[0];
              const x = parseFloat(parts[1]) - minX + padding;
              const y = parseFloat(parts[2]) - minY + padding;

              if (type === 'M') {
                ctx.moveTo(x, y);
                isFirstCommand = false;
              } else if (type === 'L') {
                if (isFirstCommand) {
                  ctx.moveTo(x, y);
                  isFirstCommand = false;
                } else {
                  ctx.lineTo(x, y);
                }
              }
            });
            ctx.stroke();
          });

          const dataUrl = canvas.toDataURL('image/png');
          resolve(dataUrl);
        } catch (error) {
          reject(error);
        }
      } else {
        try {
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

          signaturePaths.forEach((item) => {
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
          const originX = Math.max(0, Math.floor(minX - padding));
          const originY = Math.max(0, Math.floor(minY - padding));
          const cropWidth = Math.min(Math.ceil(SCREEN_WIDTH - originX), Math.ceil(maxX - minX + padding * 2));
          const cropHeight = Math.min(Math.ceil(SCREEN_HEIGHT - originY), Math.ceil(maxY - minY + padding * 2));

          if (!signatureViewRef.current) {
            reject(new Error('Signature view ref is null'));
            return;
          }

          const fullScreenUri = await captureRef(signatureViewRef.current, {
            format: 'png',
            quality: 1.0,
          });

          const croppedResult = await ImageManipulator.manipulateAsync(
            fullScreenUri,
            [
              {
                crop: {
                  originX,
                  originY,
                  width: cropWidth,
                  height: cropHeight,
                },
              },
            ],
            { compress: 1, format: ImageManipulator.SaveFormat.PNG }
          );

          resolve(croppedResult.uri);
        } catch (error) {
          console.error('Error converting signature on native:', error);
          reject(error);
        }
      }
    });
  };

  const validateSignature = async () => {
    if (signaturePaths.length === 0) {
      Alert.alert('Erreur', 'Veuillez dessiner une signature');
      return;
    }

    try {
      if (Platform.OS !== 'web') {
        safeHaptics.impact(Haptics.ImpactFeedbackStyle.Medium);
      }

      const signatureImageUri = await convertSignatureToImage();

      const newSignature: OverlayElement = {
        id: Date.now().toString(),
        uri: signatureImageUri,
        x: SCREEN_WIDTH / 2 - 75,
        y: SCREEN_HEIGHT / 2 - 50,
        rotation: 0,
        scale: 1,
        color: '#ffffff',
      };

      setOverlays([...overlays, newSignature]);
      setIsSignatureMode(false);
      setSignaturePaths([]);
      setCurrentPath('');
    } catch (error) {
      console.error('Erreur lors de la création de la signature:', error);
      Alert.alert('Erreur', 'Impossible de créer la signature');
    }
  };


  const removeOverlay = async (id: string) => {
    if (Platform.OS !== 'web') {
      safeHaptics.impact(Haptics.ImpactFeedbackStyle.Light);
    }

    const overlay = overlays.find(o => o.id === id);
    if (!overlay) {
      console.warn('removeOverlay: overlay not found', id);
      return;
    }

    const updatedOverlays = overlays.filter(o => o.id !== id);
    setOverlays(updatedOverlays);

    if (selectedOverlayId === id) {
      setSelectedOverlayId(null);
      setShowEditPanel(false);
    }

    if (memory) {
      const updatedSignatures = updatedOverlays.length > 0 ? updatedOverlays.map(s => ({
        id: s.id, uri: s.uri, x: s.x, y: s.y, rotation: s.rotation, scale: s.scale, color: s.color
      })) : undefined;

      await StorageService.updateMemory(
        memory,
        user?.id || null,
        { signatureOverlays: updatedSignatures }
      );
      console.log('✅ Overlay supprimé et sauvegardé');
    }
  };

  const updateOverlayPosition = (id: string, x: number, y: number) => {
    const overlay = overlays.find(o => o.id === id);
    if (!overlay) {
      console.warn('updateOverlayPosition: overlay not found', id);
      return;
    }

    setOverlays(prevOverlays =>
      prevOverlays.map(o =>
        o.id === id ? { ...o, x, y } : o
      )
    );
  };

  const updateOverlayRotation = (id: string, rotation: number) => {
    const overlay = overlays.find(o => o.id === id);
    if (!overlay) {
      console.warn('updateOverlayRotation: overlay not found', id);
      return;
    }

    setOverlays(prevOverlays =>
      prevOverlays.map(o =>
        o.id === id ? { ...o, rotation: rotation % 360 } : o
      )
    );
  };

  const updateOverlayScale = (id: string, value: number) => {
    const overlay = overlays.find(o => o.id === id);
    if (!overlay) {
      console.warn('updateOverlayScale: overlay not found', id);
      return;
    }

    setOverlays(prevOverlays =>
      prevOverlays.map(o => {
        if (o.id !== id) return o;
        return { ...o, scale: value };
      })
    );
  };

  const selectOverlay = (id: string) => {
    console.log('[DEBUG] selectOverlay called with id:', id);
    const overlay = overlays.find(o => o.id === id);
    if (!overlay) {
      console.warn('[DEBUG] selectOverlay: overlay not found');
      return;
    }

    console.log('[DEBUG] Selecting overlay:', id);
    setSelectedOverlayId(id);
    setShowColorPicker(false);
    safeHaptics.impact(Haptics.ImpactFeedbackStyle.Light);
  };

  const deselectOverlay = () => {
    console.log('[DEBUG] deselectOverlay called');
    setSelectedOverlayId(null);
    setShowColorPicker(false);
  };

  const getSelectedOverlay = useCallback((): OverlayElement | undefined => {
    if (!selectedOverlayId) return undefined;
    return overlays.find(o => o.id === selectedOverlayId);
  }, [selectedOverlayId, overlays]);

  const rotateSelectedOverlay = (delta: number = 90) => {
    const overlay = getSelectedOverlay();
    if (!overlay) {
      console.warn('rotateSelectedOverlay: no overlay selected');
      return;
    }

    setOverlays(prevOverlays =>
      prevOverlays.map(o =>
        o.id === selectedOverlayId
          ? { ...o, rotation: (o.rotation + delta) % 360 }
          : o
      )
    );

    if (Platform.OS !== 'web') {
      safeHaptics.impact(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const toggleColorPicker = () => {
    if (Platform.OS !== 'web') {
      safeHaptics.impact(Haptics.ImpactFeedbackStyle.Light);
    }
    setShowColorPicker(!showColorPicker);
  };

  const changeSelectedColor = (color: string) => {
    console.log('[DEBUG] changeSelectedColor called');
    const overlay = getSelectedOverlay();
    if (!overlay) {
      console.warn('[DEBUG] changeSelectedColor: no overlay selected');
      return;
    }

    console.log('[DEBUG] Changing color for overlay:', selectedOverlayId);
    setOverlays(prevOverlays =>
      prevOverlays.map(o =>
        o.id === selectedOverlayId ? { ...o, color } : o
      )
    );

    if (Platform.OS !== 'web') {
      safeHaptics.impact(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const deleteSelectedOverlay = () => {
    const overlay = getSelectedOverlay();
    if (!overlay) {
      console.warn('deleteSelectedOverlay: no overlay selected');
      return;
    }

    if (Platform.OS !== 'web') {
      safeHaptics.impact(Haptics.ImpactFeedbackStyle.Medium);
    }

    removeOverlay(selectedOverlayId!);
  };


  const compressImageDataUrl = async (dataUrl: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxWidth = 800;
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Cannot get canvas context'));
          return;
        }

        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);

        ctx.drawImage(img, 0, 0, width, height);
        const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.7);
        resolve(compressedDataUrl);
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = dataUrl;
    });
  };

  const captureImageWeb = async (): Promise<string> => {
    if (!memory) {
      throw new Error('Memory is null');
    }

    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      canvas.width = SCREEN_WIDTH;
      canvas.height = SCREEN_HEIGHT;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('Cannot get canvas context'));
        return;
      }

      const img = new window.Image();
      img.crossOrigin = 'anonymous';
      img.onload = async () => {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

        ctx.drawImage(img, 0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

        if (overlays.length > 0) {
          let loadedCount = 0;
          overlays.forEach((overlay) => {
            const sigImg = new window.Image();
            sigImg.crossOrigin = 'anonymous';
            sigImg.onload = () => {
              ctx.save();
              ctx.translate(overlay.x, overlay.y);
              ctx.rotate((overlay.rotation * Math.PI) / 180);
              ctx.scale(overlay.scale, overlay.scale);
              ctx.drawImage(sigImg, 0, 0, 100, 60);
              ctx.restore();

              loadedCount++;
              if (loadedCount === overlays.length) {
                const dataUrl = canvas.toDataURL('image/png', 1.0);
                resolve(dataUrl);
              }
            };
            sigImg.onerror = () => reject(new Error('Failed to load signature'));
            sigImg.src = overlay.uri;
          });
        } else {
          const dataUrl = canvas.toDataURL('image/png', 1.0);
          resolve(dataUrl);
        }
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = memory.baseUri || memory.uri;
    });
  };

  const handleSave = async () => {
    if (!memory) {
      console.error('❌ Memory is null');
      return;
    }

    try {
      console.log('🔄 Début de la sauvegarde...');
      setSaving(true);
      if (Platform.OS !== 'web') {
        safeHaptics.impact(Haptics.ImpactFeedbackStyle.Medium);
      }

      await new Promise(resolve => setTimeout(resolve, 200));

      console.log('📸 Capture de l\'image...');
      let capturedUri: string;

      if (Platform.OS === 'web') {
        capturedUri = await captureImageWeb();
      } else {
        if (!viewShotRef.current) {
          throw new Error('ViewShot ref is null');
        }
        capturedUri = await captureRef(viewShotRef.current, {
          format: 'png',
          quality: 1.0,
        });
      }
      console.log('✅ Image capturée');

      let finalUri = capturedUri;

      if (Platform.OS === 'web') {
        console.log('🗜️ Compression de l\'image...');
        try {
          finalUri = await compressImageDataUrl(capturedUri);
          console.log('✅ Image compressée');
        } catch (compressError) {
          console.error('⚠️ Erreur de compression, utilisation de l\'original:', compressError);
        }
      }

      const baseUri = memory.baseUri || memory.uri;
      const savedSignatureOverlays = getSignatureOverlays();

      console.log('💾 Mise à jour de l\'image...');
      await StorageService.updateMemory(
        memory,
        user?.id || null,
        {
          imageUri: finalUri,
          baseUri: baseUri,
          signatureOverlays: savedSignatureOverlays.length > 0 ? savedSignatureOverlays : undefined,
        }
      );
      console.log('✅ Image mise à jour');

      if (Platform.OS !== 'web') {
        safeHaptics.notification(Haptics.NotificationFeedbackType.Success);
      }

      setSaving(false);

      console.log('✅ Sauvegarde terminée, redirection vers result');
      router.push({
        pathname: '/result',
        params: { memoryId: memoryId },
      });
    } catch (error) {
      console.error('❌ Erreur lors de la sauvegarde:', error);
      setSaving(false);
      if (Platform.OS === 'web') {
        alert(`Erreur: ${(error as Error).message}`);
      } else {
        Alert.alert('Erreur', `Impossible d\'enregistrer: ${(error as Error).message}`);
      }
    }
  };

  const handleClose = () => {
    if (Platform.OS !== 'web') {
      safeHaptics.impact(Haptics.ImpactFeedbackStyle.Light);
    }

    if (overlays.length > 0) {
      Alert.alert(
        'Modifications non enregistrées',
        'Voulez-vous quitter sans enregistrer ?',
        [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Quitter', style: 'destructive', onPress: () => router.back() },
        ]
      );
    } else {
      router.back();
    }
  };

  // Attendre que les polices soient chargées ET que la mémoire soit chargée
  if (loading || !memory || !fontsLoaded) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#10b981" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.imageContainer} pointerEvents="box-none">
        <View style={{ flex: 1 }} pointerEvents="box-none">
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => {
              if (showTooltip) setShowTooltip(false);
              if (showColorPicker) setShowColorPicker(false);
            }}
            style={{ flex: 1 }}
          >
          <View ref={viewShotRef} style={styles.viewShot} collapsable={false}>
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => {
              console.log('[DEBUG] Image background tapped');
              if (showTooltip) setShowTooltip(false);
              if (showColorPicker) setShowColorPicker(false);
              if (selectedOverlayId) {
                deselectOverlay();
              }
            }}
          >
            <Image
              source={{ uri: memory.baseUri || memory.uri }}
              style={styles.image}
              resizeMode="cover"
            />
          </TouchableOpacity>
          {!saving && overlays.map((overlay, index) => (
            <DraggableSignature
              key={overlay.id}
              overlay={overlay}
              onPositionChange={updateOverlayPosition}
              onRotationChange={updateOverlayRotation}
              onScaleChange={updateOverlayScale}
              onLongPress={() => removeOverlay(overlay.id)}
              onPress={() => selectOverlay(overlay.id)}
              onSelect={() => selectOverlay(overlay.id)}
              isSelected={selectedOverlayId === overlay.id}
              zIndex={selectedOverlayId === overlay.id ? 1000 : index}
            />
          ))}
          {saving && overlays.map(overlay => (
            <Image
              key={`static-sig-${overlay.id}`}
              source={{ uri: overlay.uri }}
              style={[
                styles.staticSignature,
                {
                  tintColor: overlay.color,
                  transform: [
                    { translateX: overlay.x },
                    { translateY: overlay.y },
                    { rotate: `${overlay.rotation}deg` },
                    { scale: overlay.scale },
                  ],
                }
              ]}
              resizeMode="contain"
            />
          ))}
        </View>
          </TouchableOpacity>
        </View>
      </View>

      <View style={[styles.topActions, { top: insets.top + 20 }]}>
        <TouchableOpacity
          style={[styles.topButton, styles.saveTopButton, saving && styles.disabledButton]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.8}
        >
          {saving ? (
            <ActivityIndicator color="#ffffff" size="small" />
          ) : (
            <Check size={24} color="#ffffff" strokeWidth={2} />
          )}
        </TouchableOpacity>
      </View>

      <View style={[styles.floatingControls, { bottom: insets.bottom + 20 }]}>
        <TouchableOpacity
          style={[styles.paletteButton, showColorPicker && styles.paletteButtonActive, !selectedOverlayId && styles.disabledButton]}
          onPress={toggleColorPicker}
          activeOpacity={0.8}
          disabled={!selectedOverlayId}
        >
          <Palette size={24} color="#ffffff" strokeWidth={2} />
        </TouchableOpacity>

        {selectedOverlayId && (
          <TouchableOpacity
            style={[styles.controlButton, { backgroundColor: '#ef4444' }]}
            onPress={deleteSelectedOverlay}
            activeOpacity={0.8}
          >
            <Trash2 size={24} color="#ffffff" strokeWidth={2} />
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.controlButton, styles.textButtonGreen]}
          onPress={goToSignature}
          activeOpacity={0.8}
        >
          {overlays.length === 0 ? (
            <View style={styles.iconWithBadge}>
              <Pencil size={24} color="#ffffff" strokeWidth={2} />
              <View style={styles.plusBadge}>
                <Plus size={12} color="#ffffff" strokeWidth={3} />
              </View>
            </View>
          ) : (
            <Pencil size={24} color="#ffffff" strokeWidth={2} />
          )}
        </TouchableOpacity>
      </View>

      {showColorPicker && selectedOverlayId && (
        <View style={[styles.pickerOverlay, { bottom: insets.bottom + 80 }]}>
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
                {SIGNATURE_COLORS.map((color, index) => (
                  <TouchableOpacity
                    key={color}
                    style={[
                      styles.colorOption,
                      { backgroundColor: color, marginRight: 15 },
                    ]}
                    onPress={() => {
                      changeSelectedColor(color);
                      setShowColorPicker(false);
                    }}
                    activeOpacity={0.8}
                  />
                ))}
              </View>
            </ScrollView>
            <View style={styles.pickerArrow}>
              <ChevronRight size={20} color="rgba(255, 255, 255, 0.6)" strokeWidth={2} />
            </View>
          </View>
        </View>
      )}

      {isSignatureMode && (
        <View style={styles.signatureOverlay}>
          <View style={styles.signatureHeader}>
            <Text style={styles.signatureTitle}>Signez maintenant</Text>
          </View>

          <View style={[styles.signatureTopLeftButtons, { top: insets.top + 20 }]}>
            <TouchableOpacity
              style={[styles.signatureButton, styles.clearButton]}
              onPress={clearSignaturePaths}
              activeOpacity={0.8}
            >
              <Eraser size={24} color="#ffffff" strokeWidth={2} />
            </TouchableOpacity>
          </View>

          <View style={styles.signatureCanvasContainer}>
            <View ref={signatureViewRef} style={styles.signatureCanvasWrapper} collapsable={false}>
              <GestureDetector gesture={panDraw}>
                <View style={styles.signatureCanvas}>
                  <Svg style={styles.signatureSvg}>
                  {signaturePaths.map((item, index) => (
                    <Path
                      key={index}
                      d={item.path}
                      stroke="#000000"
                      strokeWidth="8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fill="none"
                    />
                  ))}
                  {currentPath && (
                    <Path
                      d={currentPath}
                      stroke="#000000"
                      strokeWidth="8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fill="none"
                    />
                  )}
                  </Svg>
                </View>
              </GestureDetector>
            </View>
          </View>

          <View style={[styles.signatureActions, { bottom: insets.bottom + 20 }]}>
            <TouchableOpacity
              style={[styles.signatureButton, styles.cancelButton]}
              onPress={cancelSignature}
              activeOpacity={0.8}
            >
              <X size={24} color="#ffffff" strokeWidth={2} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.signatureButton, styles.validateButton]}
              onPress={validateSignature}
              activeOpacity={0.8}
            >
              <Check size={24} color="#ffffff" strokeWidth={2} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {showTooltip && !isSignatureMode && (
        <View style={styles.tooltipOverlay}>
          <TouchableOpacity
            style={styles.tooltipContainer}
            onPress={() => setShowTooltip(false)}
            activeOpacity={0.9}
          >
            <Text style={styles.tooltipText}>
              {t('selectElementTooltip')}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <PremiumModal
        visible={showPremiumModal}
        onClose={() => setShowPremiumModal(false)}
        onUpgrade={() => {
          setShowPremiumModal(false);
          router.push('/subscription');
        }}
        title={t('premiumSubscription')}
        message={t('signatureLimitEditMessage')}
      />

    </View>
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
  imageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewShot: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  draggableTextContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  textTouchable: {
    backgroundColor: 'transparent',
    borderRadius: 8,
  },
  textContentWrapper: {
    alignSelf: 'flex-start',
  },
  moveIcon: {
    opacity: 0.8,
  },
  moveIconAbsolute: {
    position: 'absolute',
    top: 4,
    left: 4,
    opacity: 0.8,
  },
  textTouchableSelected: {
    borderColor: 'transparent',
    borderWidth: 0,
  },
  signatureTouchable: {
    padding: 0,
    margin: 0,
  },
  signatureContentWrapper: {
    padding: 0,
    margin: 0,
  },
  signatureImage: {
    width: 150,
    height: 80,
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
  signatureSelectionBorder: {
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
  staticTextContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  staticSignature: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 100,
    height: 60,
  },
  editSection: {
    marginBottom: 20,
    paddingHorizontal: 20,
  },
  rotationButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  rotationButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
  },
  rotationButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  topActions: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
    zIndex: 10,
  },
  topButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(64, 64, 64, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveTopButton: {
    backgroundColor: '#10b981',
  },
  topLeftIndicator: {
    position: 'absolute',
    zIndex: 20,
    flexDirection: 'row',
  },
  indicatorBadge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#10b981',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  indicatorBadgeActive: {
    backgroundColor: '#059669',
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  textEditOverlay: {
    position: 'absolute',
    left: 20,
    right: 20,
    alignItems: 'center',
    zIndex: 15,
  },
  textEditContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    borderRadius: 25,
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
    width: '100%',
  },
  textEditInput: {
    flex: 1,
    color: '#ffffff',
    fontSize: 16,
    paddingVertical: 8,
  },
  textEditButton: {
    backgroundColor: '#10b981',
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  disabledButton: {
    opacity: 0.6,
  },
  floatingControls: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 20,
    paddingHorizontal: 20,
    zIndex: 10,
  },
  controlButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(64, 64, 64, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  paletteButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#8b5cf6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  paletteButtonActive: {
    backgroundColor: '#a855f7',
  },
  combinedButton: {
    width: 80,
    paddingHorizontal: 10,
  },
  combinedIconContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  controlButtonActive: {
    backgroundColor: '#10b981',
  },
  textButton: {
    backgroundColor: '#3b82f6',
  },
  pickerOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 15,
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
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  premiumColorButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#8b5cf6',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  premiumColorText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  fontOption: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fontOptionText: {
    color: '#ffffff',
    fontSize: 18,
  },
  sizeOption: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sizeOptionText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  strokeSizeContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    borderRadius: 30,
    paddingVertical: 15,
    paddingHorizontal: 20,
    gap: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  strokeSizeOption: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 10,
  },
  strokeSizeCircleSmall: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#ffffff',
  },
  strokeSizeCircleMedium: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  strokeSizeCircleMediumInner: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 3,
    borderColor: '#10b981',
  },
  strokeSizeCircleLarge: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#ffffff',
  },
  optionsPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.98)',
    paddingVertical: 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    maxHeight: SCREEN_HEIGHT * 0.4,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 15,
  },
  panelTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  closePanelButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingHorizontal: 20,
    gap: 12,
  },
  filterButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    marginRight: 12,
  },
  filterButtonActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    borderWidth: 2,
    borderColor: '#10b981',
  },
  filterButtonText: {
    color: '#888',
    fontSize: 14,
    fontWeight: '500',
  },
  filterButtonTextActive: {
    color: '#10b981',
  },
  premiumFilterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#8b5cf6',
    marginRight: 12,
  },
  premiumFilterText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  textInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 20,
    gap: 10,
  },
  textInput: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: '#ffffff',
    fontSize: 16,
  },
  addTextButton: {
    backgroundColor: '#10b981',
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textOption: {
    marginBottom: 20,
  },
  optionLabel: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 12,
    marginLeft: 20,
  },
  colorScrollContent: {
    paddingHorizontal: 20,
    gap: 12,
  },
  colorButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  colorButtonActive: {
    borderColor: '#10b981',
    borderWidth: 3,
  },
  sizeButtons: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 12,
  },
  sizeButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  sizeButtonActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    borderWidth: 2,
    borderColor: '#10b981',
  },
  sizeButtonText: {
    color: '#888',
    fontSize: 14,
    fontWeight: '600',
  },
  sizeButtonTextActive: {
    color: '#10b981',
  },
  helpText: {
    color: '#666',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 10,
    fontStyle: 'italic',
  },
  signatureOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    zIndex: 1000,
  },
  signatureHeader: {
    paddingTop: 60,
    paddingBottom: 20,
    alignItems: 'center',
  },
  signatureTitle: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '600',
  },
  signatureCanvasContainer: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#1a1a1a',
  },
  signatureCanvasWrapper: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#ffffff',
  },
  signatureCanvas: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#ffffff',
  },
  signatureSvg: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  signatureTopLeftButtons: {
    position: 'absolute',
    left: 20,
    zIndex: 10,
  },
  signatureActions: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 20,
    paddingHorizontal: 20,
  },
  signatureButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
  },
  clearButton: {
    backgroundColor: 'rgba(251, 191, 36, 0.2)',
  },
  validateButton: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
  },
  tooltipOverlay: {
    position: 'absolute',
    top: '40%',
    left: 20,
    right: 20,
    alignItems: 'center',
    zIndex: 15,
  },
  tooltipContainer: {
    backgroundColor: 'rgba(16, 185, 129, 0.95)',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
    maxWidth: '90%',
  },
  tooltipText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 22,
  },
  iconWithBadge: {
    position: 'relative',
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  plusBadge: {
    position: 'absolute',
    bottom: -6,
    right: -6,
    width: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textButtonGreen: {
    backgroundColor: '#10b981',
  },
});
