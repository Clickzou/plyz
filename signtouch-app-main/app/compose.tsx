import { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Dimensions,
  Platform,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  GestureDetector,
  Gesture,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  makeMutable,
  runOnJS,
} from 'react-native-reanimated';
import { Type, Minus, CreditCard as Edit3, Check, RotateCw, ChevronLeft, ChevronRight, Palette, Pencil, Plus, Trash2 } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { captureRef } from 'react-native-view-shot';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { Memory, SignatureOverlay, TextOverlay } from '@/utils/memoriesStorage';
import { Modal, TextInput } from 'react-native';
import * as StorageService from '@/utils/storageService';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useAuth } from '@/contexts/AuthContext';
import PremiumModal from '@/components/PremiumModal';
import { useTranslation } from '@/contexts/LanguageContext';
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

// Safe haptic functions for use with runOnJS in Reanimated worklets
// These are called ONLY via runOnJS from gesture callbacks (onEnd, onFinalize)
// NEVER call Haptics directly in worklets (onUpdate, onStart, onChange)
const triggerHapticLight = () => {
  if (Platform.OS !== 'web') {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }
};

const triggerHapticMedium = () => {
  if (Platform.OS !== 'web') {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  }
};

const triggerHapticSuccess = () => {
  if (Platform.OS !== 'web') {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }
};

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
      <Animated.View style={[
        styles.signatureWrapper, 
        animatedStyle, 
        { 
          width: imageDimensions.width, 
          height: imageDimensions.height,
          zIndex: isSelected ? 1000 : index,
        }
      ]}>
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

interface AnimatedTextProps {
  overlay: TextOverlay;
  transform: TextTransform;
  isSelected: boolean;
  gesture: any;
  onFontPress?: () => void;
  screenWidth: number;
}

// Mapping des noms de polices vers les noms techniques React Native
const FONT_NAME_MAP: { [key: string]: string } = {
  'Shadows Into Light': 'ShadowsIntoLight_400Regular',
  'Covered By Your Grace': 'CoveredByYourGrace_400Regular',
  'Caveat': 'Caveat_400Regular',
  'Indie Flower': 'IndieFlower_400Regular',
  'Dancing Script': 'DancingScript_400Regular',
  'Great Vibes': 'GreatVibes_400Regular',
  'Bangers': 'Bangers_400Regular',
  'Fraunces': 'Fraunces_400Regular',
  'Shantell Sans': 'ShantellSans_400Regular',
  'Manrope': 'Manrope_400Regular',
};

const getMobileFontFamily = (fontFamily: string): string => {
  if (Platform.OS === 'web') {
    return fontFamily; // Sur web, utiliser le nom CSS
  }
  // Sur mobile, utiliser le nom technique ou retourner le nom original
  return FONT_NAME_MAP[fontFamily] || fontFamily;
};

function AnimatedText({ overlay, transform, isSelected, gesture, onFontPress, screenWidth }: AnimatedTextProps) {
  const mobileFontFamily = getMobileFontFamily(overlay.fontFamily);
  const [buttonOnLeft, setButtonOnLeft] = useState(false);
  
  const animatedStyle = useAnimatedStyle(() => {
    // Mettre à jour la position du bouton
    const isOnRight = transform.translateX.value > screenWidth / 2 - 50;
    runOnJS(setButtonOnLeft)(isOnRight);
    
    return {
      transform: [
        { translateX: transform.translateX.value },
        { translateY: transform.translateY.value },
        { rotate: `${transform.rotation.value}rad` },
        { scale: transform.scale.value },
      ],
    };
  });

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[styles.textWrapper, animatedStyle]}>
        <View style={styles.textContainer}>
          <Text
            style={[
              styles.textElement,
              {
                color: overlay.color,
                fontFamily: mobileFontFamily,
                fontSize: overlay.fontSize,
              },
            ]}
          >
            {overlay.text}
          </Text>
        </View>
        {isSelected && <View style={styles.selectionBorder} />}
        {isSelected && onFontPress && (
          <View style={[
            styles.inlineFontButton, 
            buttonOnLeft ? styles.inlineFontButtonLeft : styles.inlineFontButtonRight
          ]}>
            <TouchableOpacity
              style={styles.inlineFontButtonTouchable}
              onPress={onFontPress}
              activeOpacity={0.8}
            >
              <Text style={styles.inlineFontButtonText}>Aa</Text>
            </TouchableOpacity>
          </View>
        )}
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

// Font families - liste complète cohérente avec result.tsx
const FONT_FAMILIES = [
  // Police par défaut
  { name: 'Shadows Into Light', value: 'Shadows Into Light' },
  // Polices manuscrites naturelles
  { name: 'Covered By Your Grace', value: 'Covered By Your Grace' },
  { name: 'Caveat', value: 'Caveat' },
  { name: 'Indie Flower', value: 'Indie Flower' },
  // Polices script / cursive stylées
  { name: 'Dancing Script', value: 'Dancing Script' },
  { name: 'Great Vibes', value: 'Great Vibes' },
  // Style impact visuel fort (branding / titres)
  { name: 'Bangers', value: 'Bangers' },
  { name: 'Fraunces', value: 'Fraunces' },
  // Caractère unique
  { name: 'Shantell Sans', value: 'Shantell Sans' },
  // Look moderne et fonctionnel
  { name: 'Manrope', value: 'Manrope' },
  // Police système
  { name: 'System', value: Platform.OS === 'ios' ? 'System' : 'Roboto' },
  // Polices système additionnelles
  { name: 'Arial', value: 'Arial' },
  { name: 'Helvetica', value: 'Helvetica' },
  { name: 'Georgia', value: 'Georgia' },
  { name: 'Times', value: 'Times New Roman' },
  { name: 'Verdana', value: 'Verdana' },
  { name: 'Courier', value: 'Courier New' },
  { name: 'Comic Sans', value: 'Comic Sans MS' },
  { name: 'Brush Script', value: 'Brush Script MT' },
  { name: 'Lucida Handwriting', value: 'Lucida Handwriting' },
];

interface TextTransform {
  scale: any;
  savedScale: any;
  translateX: any;
  translateY: any;
  savedTranslateX: any;
  savedTranslateY: any;
  rotation: any;
  savedRotation: any;
}

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
  // Charger les polices pour mobile avec les noms techniques
  const [fontsLoaded] = useFonts({
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
  });

  const { photoUri, signatures, memoryId, texts } = useLocalSearchParams<{
    photoUri: string;
    signatures: string;
    memoryId?: string;
    texts?: string;
  }>();


  const signatureUris = signatures ? JSON.parse(signatures as string) : [];
  const initialTexts = texts ? JSON.parse(texts as string) : [];

  const [loadedPhotoUri, setLoadedPhotoUri] = useState<string | null>(null);
  const [isLoadingMemory, setIsLoadingMemory] = useState(!!memoryId);
  const [selectedSignatureIndex, setSelectedSignatureIndex] = useState<number | null>(0);
  const [signatureColors, setSignatureColors] = useState<string[]>(
    signatureUris.map(() => '#ffffff')
  );
  const [signatureStrokeScales, setSignatureStrokeScales] = useState<number[]>(
    signatureUris.map(() => 1.0)
  );
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showStrokePicker, setShowStrokePicker] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const [textOverlays, setTextOverlays] = useState<TextOverlay[]>([]);
  const [showTextModal, setShowTextModal] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [selectedFont, setSelectedFont] = useState(FONT_FAMILIES[0].value);
  const [selectedTextIndex, setSelectedTextIndex] = useState<number | null>(null);
  const [showFontPicker, setShowFontPicker] = useState(false);
  const [showEditFontPicker, setShowEditFontPicker] = useState(false);
  const [textColors, setTextColors] = useState<string[]>([]);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const viewShotRef = useRef<View>(null);
  const { status } = useSubscription();
  const { t } = useTranslation();
  const { user } = useAuth();

  const signatureTransforms = useRef<SignatureTransform[]>(
    signatureUris.map((_: string, index: number) => ({
      scale: useSharedValue(1.5),
      savedScale: useSharedValue(1.5),
      translateX: useSharedValue(SCREEN_WIDTH / 2 - 60 + index * 50),
      translateY: useSharedValue(SCREEN_HEIGHT / 2 - 60 + index * 50),
      savedTranslateX: useSharedValue(SCREEN_WIDTH / 2 - 60 + index * 50),
      savedTranslateY: useSharedValue(SCREEN_HEIGHT / 2 - 60 + index * 50),
      rotation: useSharedValue(0),
      savedRotation: useSharedValue(0),
    }))
  ).current;

  const textTransformsRef = useRef<Map<string, TextTransform>>(new Map());
  const getOrCreateTextTransform = (overlay: TextOverlay): TextTransform => {
    if (!textTransformsRef.current.has(overlay.id)) {
      const rotationRad = (overlay.rotation * Math.PI) / 180;
      textTransformsRef.current.set(overlay.id, {
        scale: makeMutable(overlay.scale),
        savedScale: makeMutable(overlay.scale),
        translateX: makeMutable(overlay.x),
        translateY: makeMutable(overlay.y),
        savedTranslateX: makeMutable(overlay.x),
        savedTranslateY: makeMutable(overlay.y),
        rotation: makeMutable(rotationRad),
        savedRotation: makeMutable(rotationRad),
      });
    }
    return textTransformsRef.current.get(overlay.id)!;
  };

  useEffect(() => {
    if (memoryId) {
      loadMemoryPhoto();
    }
  }, [memoryId]);

  useEffect(() => {
    if (initialTexts.length > 0 && textOverlays.length === 0) {
      const newTextOverlays: TextOverlay[] = initialTexts.map((item: { text: string; fontFamily: string }, index: number) => ({
        id: `text_${Date.now()}_${index}`,
        text: item.text,
        x: SCREEN_WIDTH / 2,
        y: SCREEN_HEIGHT / 2 + index * 60,
        rotation: 0,
        scale: 1,
        color: '#ffffff',
        fontFamily: item.fontFamily,
        fontSize: 40,
      }));
      setTextOverlays(newTextOverlays);
      setTextColors(newTextOverlays.map(() => '#ffffff'));
    }
  }, [initialTexts]);

  const loadMemoryPhoto = async () => {
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
  };

  const createGesture = (transform: SignatureTransform, index: number) => {
    const selectSignature = () => setSelectedSignatureIndex(index);
    
    const tap = Gesture.Tap()
      .onEnd(() => {
        'worklet';
        runOnJS(triggerHapticLight)();
        runOnJS(selectSignature)();
      });

    const pinch = Gesture.Pinch()
      .onUpdate((event) => {
        'worklet';
        transform.scale.value = Math.max(0.3, Math.min(4, transform.savedScale.value * event.scale));
      })
      .onEnd(() => {
        'worklet';
        transform.savedScale.value = transform.scale.value;
      });

    const rotate = Gesture.Rotation()
      .onUpdate((event) => {
        'worklet';
        transform.rotation.value = transform.savedRotation.value + event.rotation;
      })
      .onEnd(() => {
        'worklet';
        transform.savedRotation.value = transform.rotation.value;
      });

    const pan = Gesture.Pan()
      .onUpdate((event) => {
        'worklet';
        transform.translateX.value = transform.savedTranslateX.value + event.translationX;
        transform.translateY.value = transform.savedTranslateY.value + event.translationY;
      })
      .onEnd(() => {
        'worklet';
        transform.savedTranslateX.value = transform.translateX.value;
        transform.savedTranslateY.value = transform.translateY.value;
      });

    return Gesture.Race(tap, Gesture.Simultaneous(pinch, rotate, pan));
  };

  const updateTextOverlayTransform = (overlayId: string, transform: TextTransform) => {
    setTextOverlays(prev => {
      const updated = prev.map(overlay => {
        if (overlay.id === overlayId) {
          return {
            ...overlay,
            x: transform.translateX.value,
            y: transform.translateY.value,
            rotation: (transform.rotation.value * 180) / Math.PI,
            scale: transform.scale.value,
          };
        }
        return overlay;
      });
      return updated;
    });
  };

  const createTextGesture = (transform: TextTransform, overlay: TextOverlay, index: number) => {
    const selectText = () => {
      setSelectedTextIndex(index);
      setSelectedSignatureIndex(null);
    };
    const updateTransform = () => updateTextOverlayTransform(overlay.id, transform);
    
    const tap = Gesture.Tap()
      .onEnd(() => {
        'worklet';
        runOnJS(triggerHapticLight)();
        runOnJS(selectText)();
      });

    const pinch = Gesture.Pinch()
      .onUpdate((event) => {
        'worklet';
        transform.scale.value = Math.max(0.3, Math.min(4, transform.savedScale.value * event.scale));
      })
      .onEnd(() => {
        'worklet';
        transform.savedScale.value = transform.scale.value;
        runOnJS(updateTransform)();
      });

    const rotate = Gesture.Rotation()
      .onUpdate((event) => {
        'worklet';
        transform.rotation.value = transform.savedRotation.value + event.rotation;
      })
      .onEnd(() => {
        'worklet';
        transform.savedRotation.value = transform.rotation.value;
        runOnJS(updateTransform)();
      });

    const pan = Gesture.Pan()
      .onUpdate((event) => {
        'worklet';
        transform.translateX.value = transform.savedTranslateX.value + event.translationX;
        transform.translateY.value = transform.savedTranslateY.value + event.translationY;
      })
      .onEnd(() => {
        'worklet';
        transform.savedTranslateX.value = transform.translateX.value;
        transform.savedTranslateY.value = transform.translateY.value;
        runOnJS(updateTransform)();
      });

    return Gesture.Race(tap, Gesture.Simultaneous(pinch, rotate, pan));
  };


  const addNewSignature = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    router.replace({
      pathname: '/signature',
      params: {
        photoUri: finalPhotoUri as string,
        existingSignatures: JSON.stringify(signatureUris),
      },
    });
  };

  const openTextModal = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setTextInput('');
    setSelectedFont(FONT_FAMILIES[0].value);
    setShowTextModal(true);
  };

  const addTextOverlay = () => {
    if (!textInput.trim()) {
      setShowTextModal(false);
      return;
    }

    const newText: TextOverlay = {
      id: `text_${Date.now()}`,
      text: textInput.trim(),
      x: SCREEN_WIDTH / 2,
      y: SCREEN_HEIGHT / 2 + textOverlays.length * 60,
      rotation: 0,
      scale: 1,
      color: '#ffffff',
      fontFamily: selectedFont,
      fontSize: 40,
    };

    setTextOverlays([...textOverlays, newText]);
    setTextColors([...textColors, '#ffffff']);
    setSelectedTextIndex(textOverlays.length);
    setSelectedSignatureIndex(null);
    setShowTextModal(false);
  };

  const deleteSelectedText = () => {
    if (selectedTextIndex !== null) {
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      const overlayToDelete = textOverlays[selectedTextIndex];
      if (overlayToDelete) {
        textTransformsRef.current.delete(overlayToDelete.id);
      }
      const newOverlays = textOverlays.filter((_, i) => i !== selectedTextIndex);
      const newColors = textColors.filter((_, i) => i !== selectedTextIndex);
      setTextOverlays(newOverlays);
      setTextColors(newColors);
      setSelectedTextIndex(null);
    }
  };

  const selectTextColor = (color: string) => {
    if (selectedTextIndex !== null) {
      const newOverlays = [...textOverlays];
      newOverlays[selectedTextIndex] = { ...newOverlays[selectedTextIndex], color };
      setTextOverlays(newOverlays);
      const newColors = [...textColors];
      newColors[selectedTextIndex] = color;
      setTextColors(newColors);
    }
    setShowColorPicker(false);
  };

  const changeSelectedTextFont = (fontFamily: string) => {
    if (selectedTextIndex !== null) {
      const newOverlays = [...textOverlays];
      newOverlays[selectedTextIndex] = { ...newOverlays[selectedTextIndex], fontFamily };
      setTextOverlays(newOverlays);
    }
    setShowEditFontPicker(false);
  };

  const deleteSelectedElement = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    if (selectedSignatureIndex !== null) {
      // Supprimer la signature sélectionnée
      const newSignatureUris = signatureUris.filter((_: string, index: number) => index !== selectedSignatureIndex);
      const newColors = signatureColors.filter((_: string, index: number) => index !== selectedSignatureIndex);
      const newStrokeScales = signatureStrokeScales.filter((_: number, index: number) => index !== selectedSignatureIndex);

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

              textOverlays.forEach((overlay) => {
                const tx = overlay.x * canvasScale;
                const ty = overlay.y * canvasScale;
                const rotation = (overlay.rotation * Math.PI) / 180;
                const sc = overlay.scale * canvasScale;
                const fontSize = (overlay.fontSize || 32) * sc;

                console.log(`📝 Text - Position:`, tx, ty, 'Scale:', sc, 'Rotation:', rotation, 'Text:', overlay.text);

                ctx.save();
                ctx.translate(tx, ty);
                ctx.rotate(rotation);
                ctx.font = `bold ${fontSize}px ${overlay.fontFamily || 'System'}`;
                ctx.fillStyle = overlay.color || '#ffffff';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
                ctx.shadowBlur = 5;
                ctx.shadowOffsetX = 2;
                ctx.shadowOffsetY = 2;
                ctx.fillText(overlay.text, 0, 0);
                ctx.restore();
              });

              console.log('✅ Tous les textes dessinés sur le canvas');

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
          textOverlays: textOverlays.length > 0 ? textOverlays : undefined,
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
        // baseUri = image originale sans overlays, uri = image avec overlays
        const savedMemory = await StorageService.saveMemory(
          uri,
          user?.id || null,
          {
            baseUri: finalPhotoUri as string,
            signatureOverlays: signatureOverlays.length > 0 ? signatureOverlays : undefined,
            textOverlays: textOverlays.length > 0 ? textOverlays : undefined,
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
    } else if (selectedTextIndex !== null) {
      selectTextColor(color);
      return;
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

  // Attendre que les polices soient chargées ET que la mémoire soit chargée
  if (isLoadingMemory || !fontsLoaded) {
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
          {textOverlays.map((overlay, index) => {
            const transform = getOrCreateTextTransform(overlay);
            const gesture = createTextGesture(transform, overlay, index);
            const isSelected = selectedTextIndex === index;

            return (
              <AnimatedText
                key={overlay.id}
                overlay={overlay}
                transform={transform}
                isSelected={isSelected}
                gesture={gesture}
                onFontPress={() => setShowEditFontPicker(!showEditFontPicker)}
                screenWidth={SCREEN_WIDTH}
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
              {selectedTextIndex !== null && (
                <TouchableOpacity
                  style={[styles.bottomButton, styles.deleteBottomButton]}
                  onPress={deleteSelectedText}
                  activeOpacity={0.8}
                >
                  <View style={styles.deleteIconContainer}>
                    <Trash2 size={20} color="#ffffff" strokeWidth={2.5} />
                    <View style={styles.deleteSubIcon}>
                      <Type size={12} color="#ffffff" strokeWidth={3} />
                    </View>
                  </View>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.paletteButton, showColorPicker && styles.paletteButtonActive]}
                onPress={toggleColorPicker}
                activeOpacity={0.8}
                disabled={selectedSignatureIndex === null && selectedTextIndex === null}
              >
                <Palette size={24} color="#ffffff" strokeWidth={2} />
              </TouchableOpacity>
            </View>

            {showColorPicker && (selectedSignatureIndex !== null || selectedTextIndex !== null) && (
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

            {showEditFontPicker && selectedTextIndex !== null && (
              <View style={[styles.fontPickerOverlay, { bottom: buttonBottom + 80 }]}>
                <ScrollView 
                  style={styles.fontPickerScroll}
                  showsVerticalScrollIndicator={false}
                  nestedScrollEnabled
                >
                  {FONT_FAMILIES.map((font) => {
                    const currentFont = textOverlays[selectedTextIndex]?.fontFamily;
                    const isSelected = currentFont === font.value;
                    return (
                      <TouchableOpacity
                        key={font.value}
                        style={[
                          styles.fontPickerOption,
                          isSelected && styles.fontPickerOptionSelected,
                        ]}
                        onPress={() => changeSelectedTextFont(font.value)}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.fontPickerText, { fontFamily: font.value }]}>
                          {font.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
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
              <View style={styles.leftButtons}>
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
                  style={[styles.topButton, styles.textTopButton]}
                  onPress={openTextModal}
                  activeOpacity={0.8}
                >
                  <View style={styles.iconContainer}>
                    <Type size={20} color="#ffffff" strokeWidth={2.5} />
                    <View style={styles.plusIcon}>
                      <Plus size={14} color="#ffffff" strokeWidth={3} />
                    </View>
                  </View>
                </TouchableOpacity>
              </View>

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

      <Modal
        visible={showTextModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowTextModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t('addText') || 'Ajouter du texte'}</Text>
            
            <TextInput
              style={styles.textInputField}
              value={textInput}
              onChangeText={setTextInput}
              placeholder={t('enterText') || 'Entrez votre texte...'}
              placeholderTextColor="#999"
              autoFocus
              maxLength={50}
            />

            <TouchableOpacity
              style={styles.fontPickerButton}
              onPress={() => setShowFontPicker(!showFontPicker)}
            >
              <Text style={[styles.fontPickerButtonText, { fontFamily: selectedFont }]}>
                {FONT_FAMILIES.find(f => f.value === selectedFont)?.name || 'System'}
              </Text>
              <Type size={20} color="#10b981" />
            </TouchableOpacity>

            {showFontPicker && (
              <ScrollView style={styles.fontList} nestedScrollEnabled>
                {FONT_FAMILIES.map((font) => (
                  <TouchableOpacity
                    key={font.value}
                    style={[
                      styles.fontOption,
                      selectedFont === font.value && styles.fontOptionSelected,
                    ]}
                    onPress={() => {
                      setSelectedFont(font.value);
                      setShowFontPicker(false);
                    }}
                  >
                    <Text style={[styles.fontOptionText, { fontFamily: font.value }]}>
                      {font.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setShowTextModal(false)}
              >
                <Text style={styles.modalCancelText}>{t('cancel') || 'Annuler'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirmButton, !textInput.trim() && styles.modalButtonDisabled]}
                onPress={addTextOverlay}
                disabled={!textInput.trim()}
              >
                <Text style={styles.modalConfirmText}>Ajouter</Text>
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
    minWidth: 100,
    minHeight: 60,
    padding: 20,
  },
  textContainer: {
    alignSelf: 'flex-start',
  },
  textElement: {
    fontSize: 40,
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
    backgroundColor: '#3b82f6',
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
  fontEditButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#eab308',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  fontEditButtonActive: {
    backgroundColor: '#ca8a04',
  },
  fontEditButtonText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  inlineFontButton: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  inlineFontButtonLeft: {
    left: -48,
  },
  inlineFontButtonRight: {
    right: -48,
  },
  inlineFontButtonTouchable: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#eab308',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  inlineFontButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  fontPickerOverlay: {
    position: 'absolute',
    left: 20,
    right: 20,
    maxHeight: 300,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    borderRadius: 16,
    padding: 12,
    zIndex: 100,
  },
  fontPickerScroll: {
    maxHeight: 280,
  },
  fontPickerOption: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 4,
  },
  fontPickerOptionSelected: {
    backgroundColor: 'rgba(16, 185, 129, 0.3)',
  },
  fontPickerText: {
    color: '#ffffff',
    fontSize: 18,
    textAlign: 'center',
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
  leftButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#1a1a1a',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 20,
  },
  textInputField: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 16,
    fontSize: 18,
    color: '#ffffff',
    marginBottom: 16,
  },
  fontPickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  fontPickerButtonText: {
    fontSize: 16,
    color: '#ffffff',
  },
  fontList: {
    maxHeight: 200,
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    marginBottom: 16,
  },
  fontOption: {
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#3a3a3a',
  },
  fontOptionSelected: {
    backgroundColor: '#10b981',
  },
  fontOptionText: {
    fontSize: 16,
    color: '#ffffff',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalCancelButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#3a3a3a',
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  modalConfirmButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#10b981',
    alignItems: 'center',
  },
  modalButtonDisabled: {
    opacity: 0.5,
  },
  modalConfirmText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
});
