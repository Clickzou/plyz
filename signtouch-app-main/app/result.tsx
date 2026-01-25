import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Image,
  Platform,
  Alert,
  ActivityIndicator,
  Text,
  ScrollView,
  Dimensions,
  TextInput,
  Modal,
} from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Download, Trash2, Share2, Palette, Pencil, Plus, Sparkles, X, RotateCw, Check, Save, Eraser, Type, BookOpen, Film } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import * as MediaLibrary from 'expo-media-library';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Memory, SignatureOverlay as StoredSignatureOverlay, TextOverlay as StoredTextOverlay, MemoryMetadata } from '@/utils/memoriesStorage';
import MetadataModal from '@/components/MetadataModal';
import * as StorageService from '@/utils/storageService';
import SocialShareModal from '@/components/SocialShareModal';
import AdModal from '@/components/AdModal';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useAuth } from '@/contexts/AuthContext';
import { captureRef } from 'react-native-view-shot';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming, withRepeat, withSequence, runOnJS } from 'react-native-reanimated';
import Svg, { Path, Defs, Filter, FeColorMatrix, Image as SvgImage } from 'react-native-svg';
import PremiumModal from '@/components/PremiumModal';
import { useTranslation } from '@/contexts/LanguageContext';
import { maybeShowSubscriptionOffer } from '@/utils/subscriptionOffer';
import Slider from '@react-native-community/slider';
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

// FilteredImage Component for cross-platform image filtering
interface FilteredImageProps {
  uri: string;
  brightness: number;
  contrast: number;
  saturation: number;
  style?: any;
}

function FilteredImage({ uri, brightness, contrast, saturation, style }: FilteredImageProps) {
  if (Platform.OS === 'web') {
    return (
      <Image
        source={{ uri }}
        style={[
          style,
          {
            filter: `brightness(${100 + brightness}%) contrast(${100 + contrast}%) saturate(${100 + saturation}%)`,
          } as any
        ]}
        resizeMode="cover"
      />
    );
  }

  // For mobile (Expo Go compatible approach)
  // Use overlays to simulate effects
  const brightnessOpacity = Math.abs(brightness) / 100;

  return (
    <View style={[style, { overflow: 'hidden' }]}>
      {/* Base image */}
      <Image
        source={{ uri }}
        style={[StyleSheet.absoluteFill, { opacity: 1 + (contrast / 200) }]}
        resizeMode="cover"
      />

      {/* Brightness overlay - white for positive, black for negative */}
      {brightness !== 0 && (
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: brightness > 0 ? '#FFFFFF' : '#000000',
              opacity: brightnessOpacity,
            }
          ]}
          pointerEvents="none"
        />
      )}

      {/* Saturation effect via tint */}
      {saturation !== 0 && (
        <Image
          source={{ uri }}
          style={[
            StyleSheet.absoluteFill,
            {
              opacity: Math.abs(saturation) / 200,
              tintColor: saturation < 0 ? '#808080' : undefined,
            }
          ]}
          resizeMode="cover"
        />
      )}
    </View>
  );
}

// Types
interface SignatureOverlay extends StoredSignatureOverlay {}
interface TextOverlay extends StoredTextOverlay {}

// Font families - mêmes polices que compose.tsx pour cohérence
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

// Constants
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

// StaticSignature Component (non-editable)
interface StaticSignatureProps {
  overlay: SignatureOverlay;
}

function StaticSignature({ overlay }: StaticSignatureProps) {
  // Vérifier si c'est une data URI JSON (mobile SVG paths)
  const isJsonData = overlay.uri.startsWith('data:application/json;base64,');

  if (isJsonData) {
    try {
      const base64Data = overlay.uri.split(',')[1];
      const jsonString = decodeURIComponent(escape(atob(base64Data)));
      const svgData = JSON.parse(jsonString);

      const signatureColor = overlay.color || '#ffffff';

      return (
        <View style={[styles.signatureWrapper, {
          left: overlay.x,
          top: overlay.y,
          width: svgData.width,
          height: svgData.height,
          transform: [
            { rotate: `${overlay.rotation}deg` },
            { scale: overlay.scale }
          ]
        }]}>
          <Svg
            key={`${overlay.id}-${signatureColor}`}
            width={svgData.width}
            height={svgData.height}
            style={styles.signature}
          >
            {svgData.paths.map((pathData: string, index: number) => (
              <Path
                key={`${index}-${signatureColor}`}
                d={pathData}
                stroke={signatureColor}
                strokeWidth={8}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </Svg>
        </View>
      );
    } catch (error) {
      console.error('Error parsing SVG data:', error);
    }
  }

  // SVG data (web)
  const isSvgData = overlay.uri.startsWith('data:image/svg+xml');

  if (isSvgData) {
    try {
      const base64Data = overlay.uri.split(',')[1];
      const svgString = atob(base64Data);

      // Extract all path data from the SVG
      const paths: string[] = [];
      const pathRegex = /d="([^"]+)"/g;
      let match;
      while ((match = pathRegex.exec(svgString)) !== null) {
        paths.push(match[1]);
      }

      // Use the color from overlay
      const signatureColor = overlay.color || '#ffffff';

      // Extract dimensions from SVG
      const widthMatch = svgString.match(/width="([^"]+)"/);
      const heightMatch = svgString.match(/height="([^"]+)"/);
      const width = widthMatch ? parseFloat(widthMatch[1]) : 300;
      const height = heightMatch ? parseFloat(heightMatch[1]) : 150;

      return (
        <View style={[styles.signatureWrapper, {
          left: overlay.x,
          top: overlay.y,
          width: 150,
          height: 80,
          transform: [
            { rotate: `${overlay.rotation}deg` },
            { scale: overlay.scale }
          ]
        }]}>
          <Svg
            key={`${overlay.id}-${signatureColor}`}
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            style={styles.signature}
          >
            {paths.map((pathData, index) => (
              <Path
                key={`${index}-${signatureColor}`}
                d={pathData}
                stroke={signatureColor}
                strokeWidth={3}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </Svg>
        </View>
      );
    } catch (error) {
      console.error('Error parsing SVG data in StaticSignature:', error);
    }
  }

  // Image PNG fallback
  return (
    <View style={[styles.draggableTextContainer, {
      left: overlay.x,
      top: overlay.y,
      transform: [
        { rotate: `${overlay.rotation}deg` },
        { scale: overlay.scale }
      ]
    }]}>
      <View style={styles.signatureTouchable}>
        <Image
          source={{ uri: overlay.uri }}
          style={[styles.signatureImage, { tintColor: overlay.color }]}
          resizeMode="contain"
        />
      </View>
    </View>
  );
}

// DraggableSignature Component
interface DraggableSignatureProps {
  overlay: SignatureOverlay;
  onPositionChange: (id: string, x: number, y: number) => void;
  onRotationChange: (id: string, rotation: number) => void;
  onScaleChange: (id: string, scale: number) => void;
  onLongPress: () => void;
  onPress: () => void;
  isSelected: boolean;
}

function DraggableSignature({ overlay, onPositionChange, onRotationChange, onScaleChange, onLongPress, onPress, isSelected }: DraggableSignatureProps) {
  console.log('🔄 [DraggableSignature] Rendering signature:', {
    id: overlay.id,
    color: overlay.color,
    uriPreview: overlay.uri.substring(0, 50)
  });

  const translateX = useSharedValue(overlay.x);
  const translateY = useSharedValue(overlay.y);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const rotation = useSharedValue(overlay.rotation);
  const savedRotation = useSharedValue(overlay.rotation);
  const scale = useSharedValue(overlay.scale);
  const savedScale = useSharedValue(overlay.scale);
  const isDragging = useSharedValue(0);

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
    .shouldCancelWhenOutside(false)
    .onStart(() => {
      isDragging.value = 1;
      startX.value = translateX.value;
      startY.value = translateY.value;
      if (Platform.OS !== 'web') {
        try {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        } catch (e) {
          console.log('Haptics error:', e);
        }
      }
    })
    .onUpdate((event) => {
      translateX.value = startX.value + event.translationX;
      translateY.value = startY.value + event.translationY;
    })
    .onEnd(() => {
      isDragging.value = 0;
      runOnJS(onPositionChange)(overlay.id, translateX.value, translateY.value);
      if (Platform.OS !== 'web') {
        try {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        } catch (e) {
          console.log('Haptics error:', e);
        }
      }
    });

  const rotationGesture = Gesture.Rotation()
    .onUpdate((event) => {
      rotation.value = savedRotation.value + (event.rotation * 180) / Math.PI;
    })
    .onEnd(() => {
      savedRotation.value = rotation.value;
      runOnJS(onRotationChange)(overlay.id, rotation.value);
    });

  const pinchGesture = Gesture.Pinch()
    .onUpdate((event) => {
      const newScale = savedScale.value * event.scale;
      scale.value = Math.max(0.2, Math.min(5, newScale));
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      runOnJS(onScaleChange)(overlay.id, scale.value);
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

  // Vérifier si c'est une data URI JSON (mobile SVG paths)
  // Use useMemo to recalculate when overlay.uri or overlay.color changes
  const svgInfo = useMemo(() => {
    const isJsonData = overlay.uri.startsWith('data:application/json;base64,');
    const isSvgData = overlay.uri.startsWith('data:image/svg+xml');
    let svgData: any = null;
    let svgPaths: string[] = [];
    let svgWidth = 150;
    let svgHeight = 80;
    let viewBoxWidth = 150;
    let viewBoxHeight = 80;
    let displayWidth = 150;
    let displayHeight = 80;

    if (isJsonData) {
      try {
        const base64Data = overlay.uri.split(',')[1];
        const jsonString = decodeURIComponent(escape(atob(base64Data)));
        svgData = JSON.parse(jsonString);
        // Use parsed dimensions like compose.tsx for JSON data
        displayWidth = svgData.width || 150;
        displayHeight = svgData.height || 80;
        viewBoxWidth = svgData.width || 150;
        viewBoxHeight = svgData.height || 80;
      } catch (error) {
        console.error('Error parsing SVG data:', error);
      }
    } else if (isSvgData) {
      try {
        const base64Data = overlay.uri.split(',')[1];
        const svgString = atob(base64Data);
        const pathRegex = /d="([^"]+)"/g;
        let match;
        while ((match = pathRegex.exec(svgString)) !== null) {
          svgPaths.push(match[1]);
        }
        // Extract dimensions
        const widthMatch = svgString.match(/width="([^"]+)"/);
        const heightMatch = svgString.match(/height="([^"]+)"/);
        if (widthMatch) svgWidth = parseFloat(widthMatch[1]);
        if (heightMatch) svgHeight = parseFloat(heightMatch[1]);
        
        // Extract viewBox if present (contains original canvas dimensions)
        const viewBoxMatch = svgString.match(/viewBox="([^"]+)"/);
        if (viewBoxMatch) {
          const parts = viewBoxMatch[1].split(/\s+/);
          if (parts.length >= 4) {
            viewBoxWidth = parseFloat(parts[2]);
            viewBoxHeight = parseFloat(parts[3]);
          }
        } else {
          viewBoxWidth = svgWidth;
          viewBoxHeight = svgHeight;
        }
        
        // Display at consistent size
        displayWidth = 150;
        displayHeight = 80;
      } catch (error) {
        console.error('Error parsing SVG data:', error);
      }
    }

    return { isJsonData, isSvgData, svgData, svgPaths, svgWidth, svgHeight, viewBoxWidth, viewBoxHeight, displayWidth, displayHeight };
  }, [overlay.uri, overlay.color]);

  const signatureColor = overlay.color || '#ffffff';

  return (
    <Animated.View style={[styles.draggableTextContainer, animatedStyle]} pointerEvents="box-none">
      <GestureDetector gesture={composedGesture}>
        <Animated.View collapsable={false}>
          <TouchableOpacity
            onLongPress={onLongPress}
            onPress={onPress}
            activeOpacity={0.9}
            style={styles.signatureTouchable}
            delayLongPress={500}
          >
            {svgInfo.svgData ? (
              <View style={{ width: svgInfo.displayWidth, height: svgInfo.displayHeight }}>
                <Svg
                  key={`${overlay.id}-${overlay.uri.slice(-20)}`}
                  width={svgInfo.svgData.width}
                  height={svgInfo.svgData.height}
                  viewBox={`0 0 ${svgInfo.svgData.width} ${svgInfo.svgData.height}`}
                  style={styles.signature}
                >
                  {svgInfo.svgData.paths.map((pathData: string, index: number) => (
                    <Path
                      key={`path-${index}-${overlay.uri.slice(-10)}`}
                      d={pathData}
                      stroke={signatureColor}
                      strokeWidth={8}
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ))}
                </Svg>
              </View>
            ) : svgInfo.isSvgData && svgInfo.svgPaths.length > 0 ? (
              <View style={{ width: svgInfo.displayWidth, height: svgInfo.displayHeight }}>
                <Svg
                  key={`${overlay.id}-${overlay.uri.slice(-20)}`}
                  width={svgInfo.displayWidth}
                  height={svgInfo.displayHeight}
                  viewBox={`0 0 ${svgInfo.viewBoxWidth} ${svgInfo.viewBoxHeight}`}
                  style={styles.signature}
                >
                  {svgInfo.svgPaths.map((pathData, index) => (
                    <Path
                      key={`path-${index}-${overlay.uri.slice(-10)}`}
                      d={pathData}
                      stroke={signatureColor}
                      strokeWidth={4}
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ))}
                </Svg>
              </View>
            ) : (
              <Image
                key={`${overlay.id}-${overlay.uri.slice(-20)}`}
                source={{ uri: overlay.uri }}
                style={[styles.signatureImage, { tintColor: signatureColor }]}
                resizeMode="contain"
              />
            )}
            {isSelected && (
              <View style={styles.selectionBorder} pointerEvents="none" />
            )}
          </TouchableOpacity>
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
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

// StaticText Component (non-editable)
interface StaticTextProps {
  overlay: TextOverlay;
}

function StaticText({ overlay }: StaticTextProps) {
  const mobileFontFamily = getMobileFontFamily(overlay.fontFamily);
  return (
    <View style={[styles.textWrapper, {
      left: overlay.x,
      top: overlay.y,
      transform: [
        { rotate: `${overlay.rotation}deg` },
        { scale: overlay.scale }
      ]
    }]}>
      <Text style={{
        fontFamily: mobileFontFamily,
        fontSize: overlay.fontSize,
        color: overlay.color,
      }}>
        {overlay.text}
      </Text>
    </View>
  );
}

// DraggableText Component
interface DraggableTextProps {
  overlay: TextOverlay;
  onPositionChange: (id: string, x: number, y: number) => void;
  onRotationChange: (id: string, rotation: number) => void;
  onScaleChange: (id: string, scale: number) => void;
  onLongPress: () => void;
  onPress: () => void;
  isSelected: boolean;
}

function DraggableText({ overlay, onPositionChange, onRotationChange, onScaleChange, onLongPress, onPress, isSelected }: DraggableTextProps) {
  const mobileFontFamily = getMobileFontFamily(overlay.fontFamily);
  const translateX = useSharedValue(overlay.x);
  const translateY = useSharedValue(overlay.y);
  const rotation = useSharedValue(overlay.rotation);
  const scale = useSharedValue(overlay.scale);
  const savedTranslateX = useSharedValue(overlay.x);
  const savedTranslateY = useSharedValue(overlay.y);
  const savedRotation = useSharedValue(overlay.rotation);
  const savedScale = useSharedValue(overlay.scale);
  const isDragging = useSharedValue(false);

  useEffect(() => {
    translateX.value = overlay.x;
    translateY.value = overlay.y;
    savedTranslateX.value = overlay.x;
    savedTranslateY.value = overlay.y;
    rotation.value = overlay.rotation;
    savedRotation.value = overlay.rotation;
    scale.value = overlay.scale;
    savedScale.value = overlay.scale;
  }, [overlay.x, overlay.y, overlay.rotation, overlay.scale]);

  const panGesture = Gesture.Pan()
    .shouldCancelWhenOutside(false)
    .onStart(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
      isDragging.value = true;
    })
    .onUpdate((event) => {
      translateX.value = savedTranslateX.value + event.translationX;
      translateY.value = savedTranslateY.value + event.translationY;
    })
    .onEnd(() => {
      isDragging.value = false;
      runOnJS(onPositionChange)(overlay.id, translateX.value, translateY.value);
    });

  const rotationGesture = Gesture.Rotation()
    .onStart(() => {
      savedRotation.value = rotation.value;
    })
    .onUpdate((event) => {
      rotation.value = savedRotation.value + (event.rotation * 180 / Math.PI);
    })
    .onEnd(() => {
      runOnJS(onRotationChange)(overlay.id, rotation.value);
    });

  const pinchGesture = Gesture.Pinch()
    .onStart(() => {
      savedScale.value = scale.value;
    })
    .onUpdate((event) => {
      scale.value = Math.max(0.3, Math.min(savedScale.value * event.scale, 5));
    })
    .onEnd(() => {
      runOnJS(onScaleChange)(overlay.id, scale.value);
    });

  const composedGesture = Gesture.Simultaneous(panGesture, rotationGesture, pinchGesture);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { rotate: `${rotation.value}deg` },
        { scale: withSpring(isDragging.value ? scale.value * 1.05 : scale.value) },
      ],
    };
  });

  return (
    <Animated.View style={[styles.textWrapper, { left: 0, top: 0 }, animatedStyle]} pointerEvents="box-none">
      <GestureDetector gesture={composedGesture}>
        <Animated.View collapsable={false}>
          <TouchableOpacity
            onLongPress={onLongPress}
            onPress={onPress}
            activeOpacity={0.9}
            delayLongPress={500}
            style={styles.textTouchable}
          >
            <Text style={{
              fontFamily: mobileFontFamily,
              fontSize: overlay.fontSize,
              color: overlay.color,
            }}>
              {overlay.text}
            </Text>
            {isSelected && (
              <View style={styles.selectionBorder} pointerEvents="none" />
            )}
          </TouchableOpacity>
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}

export default function ResultScreen() {
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

  const params = useLocalSearchParams<{ imageUri?: string; memoryId?: string }>();
  const { imageUri, memoryId } = params;
  const [memory, setMemory] = useState<Memory | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showAdModal, setShowAdModal] = useState(false);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { status } = useSubscription();
  const { t } = useTranslation();
  const { user } = useAuth();

  // Edit mode state
  const [isEditMode, setIsEditMode] = useState(false);
  const [signatureOverlays, setSignatureOverlays] = useState<SignatureOverlay[]>([]);
  const [textOverlays, setTextOverlays] = useState<TextOverlay[]>([]);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [selectedElementType, setSelectedElementType] = useState<'signature' | 'text' | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  // UI States
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showFontPicker, setShowFontPicker] = useState(false);
  const [showTextInput, setShowTextInput] = useState(false);
  const [newTextValue, setNewTextValue] = useState('');
  const [showTooltip, setShowTooltip] = useState(false);
  const [showSignatureMode, setShowSignatureMode] = useState(false);
  const [showEffectsPanel, setShowEffectsPanel] = useState(false);
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const [limitType, setLimitType] = useState<'signature' | 'text' | null>(null);
  const [showMetadataModal, setShowMetadataModal] = useState(false);

  // Welcome message state
  const [showWelcomeMessage, setShowWelcomeMessage] = useState(true);
  const welcomeOpacity = useSharedValue(0);

  const welcomeAnimatedStyle = useAnimatedStyle(() => {
    return {
      opacity: welcomeOpacity.value,
      transform: [
        { scale: 0.3 + (welcomeOpacity.value * 0.7) },
        { translateX: (1 - welcomeOpacity.value) * -50 },
        { translateY: (1 - welcomeOpacity.value) * -30 }
      ],
    };
  });

  // Edit button pulse animation
  const editButtonScale = useSharedValue(1);
  const editButtonOpacity = useSharedValue(1);

  useEffect(() => {
    // Start pulse animation
    editButtonScale.value = withRepeat(
      withSequence(
        withTiming(1.08, { duration: 800 }),
        withTiming(1, { duration: 800 })
      ),
      -1,
      false
    );
    editButtonOpacity.value = withRepeat(
      withSequence(
        withTiming(0.8, { duration: 800 }),
        withTiming(1, { duration: 800 })
      ),
      -1,
      false
    );
  }, []);

  const editButtonAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: editButtonScale.value }],
      opacity: editButtonOpacity.value,
    };
  });

  // Signature state
  const [signaturePaths, setSignaturePaths] = useState<string[]>([]);
  const [signatureColor, setSignatureColor] = useState('#ffffff');
  const [currentPath, setCurrentPath] = useState('');
  const [isDrawing, setIsDrawing] = useState(false);
  const signatureCanvasRef = useRef<View>(null);
  const currentPathRef = useRef('');
  const signaturePathsRef = useRef<string[]>([]);

  // Effects state - committed values (saved in memory)
  const [brightness, setBrightness] = useState(0);
  const [contrast, setContrast] = useState(0);
  const [saturation, setSaturation] = useState(0);

  // Effects state - temporary preview values (used during editing)
  const [tempBrightness, setTempBrightness] = useState(0);
  const [tempContrast, setTempContrast] = useState(0);
  const [tempSaturation, setTempSaturation] = useState(0);

  const viewShotRef = useRef<View>(null);

  // Sync signaturePaths with ref to avoid stale closures
  useEffect(() => {
    signaturePathsRef.current = signaturePaths;
    if (showSignatureMode) {
      console.log('🔄 signaturePaths changed:', signaturePaths.length, 'paths');
    }
  }, [signaturePaths, showSignatureMode]);

  // Load fonts
  useEffect(() => {
    if (memoryId) {
      loadMemory();
    }
  }, [memoryId]);

  // Welcome message animation
  useEffect(() => {
    if (showWelcomeMessage) {
      // Fade in
      welcomeOpacity.value = withTiming(1, { duration: 500 });

      // Auto hide after 4 seconds
      const timer = setTimeout(() => {
        welcomeOpacity.value = withTiming(0, { duration: 500 }, () => {
          runOnJS(setShowWelcomeMessage)(false);
        });
      }, 4000);

      return () => clearTimeout(timer);
    }
  }, [showWelcomeMessage]);

  // Wrapper functions for storage
  const saveMemory = async (imageUri: string, metadata?: any) => {
    return await StorageService.saveMemory(imageUri, user?.id || null, metadata);
  };

  const updateMemory = async (updatedMemory: Memory) => {
    if (!memory) return;
    const updates: any = {};
    if (updatedMemory.uri !== memory.uri) updates.imageUri = updatedMemory.uri;
    if (updatedMemory.signatureOverlays) updates.signatureOverlays = updatedMemory.signatureOverlays;
    if (updatedMemory.textOverlays) updates.textOverlays = updatedMemory.textOverlays;
    if (updatedMemory.filter) updates.filter = updatedMemory.filter;
    if (updatedMemory.adjustments) updates.adjustments = updatedMemory.adjustments;
    if (updatedMemory.isEdited !== undefined) updates.isEdited = updatedMemory.isEdited;
    return await StorageService.updateMemory(memory, user?.id || null, updates);
  };

  const deleteMemory = async (memoryId: string) => {
    return await StorageService.deleteMemory(memoryId, user?.id || null);
  };

  const handleMetadataSave = async (metadata: MemoryMetadata) => {
    if (!memory) return;
    try {
      await StorageService.updateMemory(memory, user?.id || null, { metadata });
      // Mettre à jour l'état local pour refléter les changements
      setMemory(prev => prev ? { ...prev, metadata } : null);
      setShowMetadataModal(false);
      console.log('✅ Metadata saved:', metadata);
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error) {
      console.error('Error saving metadata:', error);
    }
  };

  const handleMetadataSkip = () => {
    setShowMetadataModal(false);
  };

  useFocusEffect(
    useCallback(() => {
      // Ne recharger QUE si on revient d'un autre écran ET qu'on n'est PAS en mode édition
      if (memoryId && !isEditMode && signatureOverlays.length === 0) {
        console.log('🔄 Rechargement de la memory au retour sur result.tsx');
        loadMemory();
      }
    }, [memoryId, isEditMode, signatureOverlays.length])
  );

  const loadMemory = async () => {
    try {
      setLoading(true);
      const memories = await StorageService.getAllMemories(user?.id || null);
      const found = memories.find(m => m.id === memoryId);
      if (found) {
        setMemory(found);
        // Only load overlays if baseUri exists (meaning the overlays are not baked into the image)
        // If baseUri doesn't exist, the overlays are already in the uri image
        if (found.baseUri) {
          setSignatureOverlays(found.signatureOverlays || []);
          setTextOverlays(found.textOverlays || []);
        } else {
          // No baseUri means overlays are baked into the image, don't load them
          setSignatureOverlays([]);
          setTextOverlays([]);
        }
        if (found.adjustments) {
          setBrightness(found.adjustments.brightness || 0);
          setContrast(found.adjustments.contrast || 0);
          setSaturation(found.adjustments.saturation || 0);
        }
      }
      setLoading(false);
    } catch (error) {
      console.error('Error loading memory:', error);
      setLoading(false);
    }
  };

  const displayUri = memory ? (memory.baseUri || memory.uri) : imageUri;

  // Hide welcome message on tap
  const hideWelcomeMessage = () => {
    if (showWelcomeMessage) {
      welcomeOpacity.value = withTiming(0, { duration: 300 }, () => {
        runOnJS(setShowWelcomeMessage)(false);
      });
    }
  };

  // Toggle edit mode
  const toggleEditMode = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setIsEditMode(!isEditMode);
    if (isEditMode) {
      // Close all panels when exiting edit mode
      setShowColorPicker(false);
      setShowTooltip(false);
      setShowSignatureMode(false);
      // Cancel effects without applying when exiting edit mode
      if (showEffectsPanel) {
        cancelEffects();
      }
      setSelectedElementId(null);
      setSelectedElementType(null);
    }
  };

  // Signature overlay functions
  const addSignatureOverlay = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    console.log('✨ Opening signature modal');
    setSelectedElementId(null);
    setSelectedElementType(null);
    setShowSignatureMode(true);
    setSignaturePaths([]);
    signaturePathsRef.current = [];
    setCurrentPath('');
    currentPathRef.current = '';
  }, [signatureOverlays.length]);

  // Get current active color from selected element or default to white
  const getActiveSignatureColor = useCallback(() => {
    if (selectedElementId && selectedElementType === 'signature') {
      const overlay = signatureOverlays.find(o => o.id === selectedElementId);
      return overlay?.color || '#ffffff';
    }
    return signatureColor;
  }, [selectedElementId, selectedElementType, signatureOverlays, signatureColor]);

  // Signature gesture callbacks
  const handleGestureStart = useCallback((x: number, y: number) => {
    console.log('🎨 Gesture Start - Drawing signature');
    currentPathRef.current = `M ${x} ${y}`;
    setCurrentPath(`M ${x} ${y}`);
    setIsDrawing(true);
  }, []);

  const handleGestureUpdate = useCallback((x: number, y: number) => {
    currentPathRef.current = `${currentPathRef.current} L ${x} ${y}`;
    setCurrentPath(currentPathRef.current);
  }, []);

  const handleGestureEnd = useCallback(() => {
    if (currentPathRef.current) {
      const newPath = currentPathRef.current;
      console.log('✅ Gesture End - Saving path, total paths:', signaturePathsRef.current.length + 1);
      setSignaturePaths(prev => {
        const updated = [...prev, newPath];
        signaturePathsRef.current = updated;
        console.log('📝 Paths updated:', updated.length);
        return updated;
      });
      setCurrentPath('');
      currentPathRef.current = '';
    }
    setIsDrawing(false);
  }, []);

  // Signature gesture for drawing
  const signatureGesture = useMemo(() => Gesture.Pan()
    .onStart((event) => {
      runOnJS(handleGestureStart)(event.x, event.y);
    })
    .onUpdate((event) => {
      runOnJS(handleGestureUpdate)(event.x, event.y);
    })
    .onEnd(() => {
      runOnJS(handleGestureEnd)();
    }), [handleGestureStart, handleGestureUpdate, handleGestureEnd]);

  const clearSignature = useCallback(() => {
    setSignaturePaths([]);
    signaturePathsRef.current = [];
    setCurrentPath('');
    currentPathRef.current = '';
  }, []);

  const confirmAddSignature = useCallback(async () => {
    // Use the ref to get the current paths to avoid stale closures
    if (signaturePathsRef.current.length === 0 && signaturePaths.length === 0) return;

    const pathsToUse = signaturePathsRef.current.length > 0 ? signaturePathsRef.current : signaturePaths;

    // Use the active color from the palette
    const activeColor = getActiveSignatureColor();
    console.log('🎨 Creating signature with color:', activeColor);

    // Drawing canvas dimensions: (SCREEN_WIDTH - 80) x 200
    // Display dimensions: 150x80
    // Use viewBox to scale the signature paths from canvas to display size
    const canvasWidth = SCREEN_WIDTH - 80;
    const canvasHeight = 200;
    const svgString = `<svg width="150" height="80" viewBox="0 0 ${canvasWidth} ${canvasHeight}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">${pathsToUse.map(path => `<path d="${path}" stroke="${activeColor}" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`).join('')}</svg>`;
    const dataUri = `data:image/svg+xml;base64,${btoa(svgString)}`;

    console.log('🔍 DEBUG: dataUri type:', dataUri.substring(0, 50));
    console.log('🔍 DEBUG: Is SVG?', dataUri.startsWith('data:image/svg+xml'));

    const newOverlay: SignatureOverlay = {
      id: Date.now().toString(),
      uri: dataUri,
      x: SCREEN_WIDTH / 2 - 75,
      y: SCREEN_HEIGHT / 2 - 40,
      scale: 1,
      color: activeColor,
      rotation: 0,
    };

    console.log('📝 New signature overlay:', JSON.stringify(newOverlay));

    setSignatureOverlays([...signatureOverlays, newOverlay]);
    setShowSignatureMode(false);
    setSignaturePaths([]);
    signaturePathsRef.current = [];
    setCurrentPath('');
    currentPathRef.current = '';
  }, [signaturePaths, signatureOverlays, getActiveSignatureColor]);

  const updateSignaturePosition = useCallback((id: string, x: number, y: number) => {
    setSignatureOverlays(overlays =>
      overlays.map(overlay =>
        overlay.id === id ? { ...overlay, x, y } : overlay
      )
    );
  }, []);

  const updateSignatureRotation = useCallback((id: string, rotation: number) => {
    setSignatureOverlays(overlays =>
      overlays.map(overlay =>
        overlay.id === id ? { ...overlay, rotation } : overlay
      )
    );
  }, []);

  const updateSignatureScale = useCallback((id: string, scale: number) => {
    setSignatureOverlays(overlays =>
      overlays.map(overlay =>
        overlay.id === id ? { ...overlay, scale } : overlay
      )
    );
  }, []);

  const updateSignatureColor = useCallback((id: string, color: string) => {
    console.log('🎨 [updateSignatureColor] Changing color to:', color, 'for overlay:', id);

    setSignatureOverlays(overlays => {
      console.log('📊 [updateSignatureColor] Current overlays count:', overlays.length);
      overlays.forEach((o, i) => console.log(`  Overlay ${i}: id=${o.id}, color=${o.color}`));

      const updated = overlays.map(overlay => {
        if (overlay.id !== id) return overlay;

        console.log('🔍 [updateSignatureColor] Processing overlay:', {
          id: overlay.id,
          isSVG: overlay.uri.startsWith('data:image/svg+xml'),
          currentColor: overlay.color,
          newColor: color
        });

        // If it's an SVG, regenerate it with the new color
        if (overlay.uri.startsWith('data:image/svg+xml')) {
          try {
            const base64Data = overlay.uri.split(',')[1];
            const svgString = atob(base64Data);

            console.log('📄 [updateSignatureColor] Original SVG:', svgString.substring(0, 200));

            // Extract width, height, and viewBox from the original SVG
            const widthMatch = svgString.match(/width="([^"]+)"/);
            const heightMatch = svgString.match(/height="([^"]+)"/);
            const viewBoxMatch = svgString.match(/viewBox="([^"]+)"/);

            const width = widthMatch ? widthMatch[1] : '300';
            const height = heightMatch ? heightMatch[1] : '150';
            const viewBox = viewBoxMatch ? viewBoxMatch[1] : `0 0 ${width} ${height}`;

            // Extract path data from the SVG
            const paths: string[] = [];
            const pathRegex = /d="([^"]+)"/g;
            let match;
            while ((match = pathRegex.exec(svgString)) !== null) {
              paths.push(match[1]);
            }

            // Extract stroke-width from original if available, default to 8
            const strokeWidthMatch = svgString.match(/stroke-width="([^"]+)"/);
            const strokeWidth = strokeWidthMatch ? strokeWidthMatch[1] : '8';

            // Regenerate SVG with new color, preserving original dimensions
            const newSvgString = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${viewBox}">
  ${paths.map(path => `<path d="${path}" stroke="${color}" stroke-width="${strokeWidth}" fill="none" stroke-linecap="round" stroke-linejoin="round" />`).join('\n  ')}
</svg>`;

            const newDataUri = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(newSvgString)))}`;

            console.log('✅ [updateSignatureColor] New SVG generated with color:', color);
            console.log('📐 [updateSignatureColor] Dimensions:', { width, height, viewBox });

            return { ...overlay, color, uri: newDataUri };
          } catch (error) {
            console.error('❌ [updateSignatureColor] Error regenerating SVG:', error);
            return { ...overlay, color };
          }
        }

        // For non-SVG signatures, just update the color
        console.log('⚠️ [updateSignatureColor] Not an SVG, just updating color property');
        return { ...overlay, color };
      });

      console.log('✅ [updateSignatureColor] Updated overlays count:', updated.length);
      updated.forEach((o, i) => console.log(`  Updated ${i}: id=${o.id}, color=${o.color}`));

      return updated;
    });
  }, []);

  const removeSignatureOverlay = (id: string) => {
    setSignatureOverlays(overlays => overlays.filter(o => o.id !== id));
    if (selectedElementId === id) {
      setSelectedElementId(null);
      setSelectedElementType(null);
    }
  };

  // Text overlay functions
  const addTextOverlay = useCallback(() => {
    setShowTextInput(true);
    setNewTextValue('');
  }, []);

  const confirmAddText = useCallback(() => {
    if (!newTextValue.trim()) {
      setShowTextInput(false);
      return;
    }
    
    const newOverlay: TextOverlay = {
      id: `text_${Date.now()}`,
      text: newTextValue.trim(),
      x: SCREEN_WIDTH / 2 - 50,
      y: SCREEN_HEIGHT / 2 - 20,
      rotation: 0,
      scale: 1,
      color: '#ffffff',
      fontFamily: 'System',
      fontSize: 24,
    };

    setTextOverlays([...textOverlays, newOverlay]);
    setShowTextInput(false);
    setNewTextValue('');
    setIsEditMode(true);
    setSelectedElementId(newOverlay.id);
    setSelectedElementType('text');
  }, [newTextValue, textOverlays]);

  const updateTextPosition = useCallback((id: string, x: number, y: number) => {
    setTextOverlays(overlays =>
      overlays.map(o => o.id === id ? { ...o, x, y } : o)
    );
  }, []);

  const updateTextRotation = useCallback((id: string, rotation: number) => {
    setTextOverlays(overlays =>
      overlays.map(o => o.id === id ? { ...o, rotation } : o)
    );
  }, []);

  const updateTextScale = useCallback((id: string, scale: number) => {
    setTextOverlays(overlays =>
      overlays.map(o => o.id === id ? { ...o, scale } : o)
    );
  }, []);

  const updateTextColor = useCallback((id: string, color: string) => {
    setTextOverlays(overlays =>
      overlays.map(o => o.id === id ? { ...o, color } : o)
    );
  }, []);

  const updateTextFont = useCallback((id: string, fontFamily: string) => {
    setTextOverlays(overlays =>
      overlays.map(o => o.id === id ? { ...o, fontFamily } : o)
    );
  }, []);

  const removeTextOverlay = (id: string) => {
    setTextOverlays(overlays => overlays.filter(o => o.id !== id));
    if (selectedElementId === id) {
      setSelectedElementId(null);
      setSelectedElementType(null);
    }
  };

  // Selection functions
  const selectElement = (id: string, type: 'signature' | 'text') => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setSelectedElementId(id);
    setSelectedElementType(type);
    // Automatically show color picker when selecting a signature
    setShowColorPicker(true);
    setShowTooltip(false);
  };

  const togglePaletteMode = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    // If an element is already selected, toggle color picker directly
    if (selectedElementId) {
      setShowColorPicker(!showColorPicker);
    } else {
      // Otherwise, show tooltip to guide user to select an element
      setShowTooltip(true);
      setTimeout(() => setShowTooltip(false), 4000);
    }
  };

  const toggleColorPicker = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setShowColorPicker(!showColorPicker);
  };

  const changeSelectedColor = (color: string) => {
    console.log('🎨 [changeSelectedColor] Changing color to:', color, 'for element:', selectedElementId);
    if (selectedElementId && selectedElementType === 'signature') {
      updateSignatureColor(selectedElementId, color);
    } else if (selectedElementId && selectedElementType === 'text') {
      updateTextColor(selectedElementId, color);
    }
  };

  const changeSelectedFont = (fontFamily: string) => {
    if (selectedElementId && selectedElementType === 'text') {
      updateTextFont(selectedElementId, fontFamily);
    }
  };

  const deleteSelectedElement = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    if (selectedElementId && selectedElementType === 'signature') {
      removeSignatureOverlay(selectedElementId);
    } else if (selectedElementId && selectedElementType === 'text') {
      removeTextOverlay(selectedElementId);
    }
  };

  // Effects functions
  const toggleEffectsPanel = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    if (!showEffectsPanel) {
      // Opening: initialize temp values from committed values
      setTempBrightness(brightness);
      setTempContrast(contrast);
      setTempSaturation(saturation);
      setShowEffectsPanel(true);
    } else {
      // Closing without applying: rollback
      setTempBrightness(brightness);
      setTempContrast(contrast);
      setTempSaturation(saturation);
      setShowEffectsPanel(false);
    }
  };

  const resetEffectsPreview = () => {
    // Reset temporary values to 0 for live preview
    setTempBrightness(0);
    setTempContrast(0);
    setTempSaturation(0);
  };

  const applyEffects = async () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    // Commit temporary values to actual state
    setBrightness(tempBrightness);
    setContrast(tempContrast);
    setSaturation(tempSaturation);

    // Save to memory
    if (memoryId && memory) {
      const updatedMemory: Memory = {
        ...memory,
        adjustments: {
          brightness: tempBrightness,
          contrast: tempContrast,
          saturation: tempSaturation,
        },
      };
      await updateMemory(updatedMemory);
    }

    setShowEffectsPanel(false);
  };

  const cancelEffects = () => {
    // Rollback: restore committed values
    setTempBrightness(brightness);
    setTempContrast(contrast);
    setTempSaturation(saturation);
    setShowEffectsPanel(false);
  };

  // Save function
  const handleSaveEdits = async () => {
    if (!memory || !memoryId) return;

    try {
      setSaving(true);

      // Exit edit mode before capturing to show static overlays
      setIsEditMode(false);
      setSelectedElementId(null);
      setSelectedElementType(null);
      setShowColorPicker(false);
      setShowEffectsPanel(false);

      // Wait for UI to update
      await new Promise(resolve => setTimeout(resolve, 100));

      if (Platform.OS === 'web') {
        // Sur le web : on ne fait PAS de captureRef (findNodeHandle non supporté)
        console.log('💾 Saving memory with', signatureOverlays.length, 'signatures');
        signatureOverlays.forEach((overlay, idx) => {
          console.log(`  Signature ${idx}:`, {
            id: overlay.id,
            color: overlay.color,
            x: overlay.x,
            y: overlay.y,
            uriStart: overlay.uri.substring(0, 100)
          });
        });

        const updatedMemory: Memory = {
          ...memory,
          signatureOverlays,
          textOverlays,
          adjustments:
            brightness !== 0 || contrast !== 0 || saturation !== 0
              ? { brightness, contrast, saturation }
              : undefined,
          updatedAt: Date.now(),
          isEdited: true,
        };

        console.log('📤 Sending to updateMemory:', {
          id: updatedMemory.id,
          overlaysCount: updatedMemory.signatureOverlays?.length || 0,
          overlays: updatedMemory.signatureOverlays?.map(o => ({ id: o.id, color: o.color }))
        });

        await updateMemory(updatedMemory);
        setSaving(false);
        return;
      }

      // Native : on peut utiliser captureRef normalement
      if (viewShotRef.current) {
        const capturedUri = await captureRef(viewShotRef.current, {
          format: 'png',
          quality: 1.0,
        });

        const updatedMemory: Memory = {
          ...memory,
          uri: capturedUri,
          baseUri: memory.baseUri || displayUri,
          signatureOverlays,
          textOverlays,
          adjustments: (brightness !== 0 || contrast !== 0 || saturation !== 0) ? { brightness, contrast, saturation } : undefined,
          updatedAt: Date.now(),
          isEdited: true,
        };

        await updateMemory(updatedMemory);
      }

      setSaving(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error('❌ Erreur lors de la sauvegarde:', error);
      setSaving(false);
      if (Platform.OS === 'web') {
        alert("Cette action n'est pas disponible dans la prévisualisation web. Teste sur ton appareil iOS/Android.");
      } else {
        Alert.alert('Erreur', `Impossible d'enregistrer: ${(error as Error).message}`);
      }
    }
  };

  // Save and return to gallery
  const saveAndReturn = async () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    try {
      setSaving(true);

      // Exit edit mode before capturing to show static overlays
      setIsEditMode(false);
      setSelectedElementId(null);
      setSelectedElementType(null);
      setShowColorPicker(false);
      setShowEffectsPanel(false);

      // Wait for UI to update
      await new Promise(resolve => setTimeout(resolve, 100));

      // Capture the final image with all overlays
      if (viewShotRef.current) {
        if (Platform.OS === 'web') {
          // Web : On met à jour les métadonnées sans captureRef (pas supporté sur web)
          if (memoryId && memory) {
            const updatedMemory: Memory = {
              ...memory,
              signatureOverlays,
              textOverlays,
              adjustments:
                brightness !== 0 || contrast !== 0 || saturation !== 0
                  ? { brightness, contrast, saturation }
                  : undefined,
              updatedAt: Date.now(),
              isEdited: true,
            };

            await updateMemory(updatedMemory);
            setSaving(false);
            router.replace('/gallery');
            return;
          } else if (imageUri) {
            console.log('🔍 [saveAndReturn] Checking if image already exists in memories...');
            const allMemories = await StorageService.getAllMemories(user?.id || null);
            const existingMemory = allMemories.find((m: Memory) => m.uri === imageUri || m.baseUri === imageUri);

            if (existingMemory) {
              console.log('✅ [saveAndReturn] Found existing memory, updating it:', existingMemory.id);
              await updateMemory({
                ...existingMemory,
                signatureOverlays,
                adjustments:
                  brightness !== 0 || contrast !== 0 || saturation !== 0
                    ? { brightness, contrast, saturation }
                    : undefined,
                updatedAt: Date.now(),
                isEdited: true,
              });
            } else {
              console.log('📝 [saveAndReturn] New image, creating new memory');
              const savedMemory = await saveMemory(imageUri);
              if (signatureOverlays.length > 0 || brightness !== 0 || contrast !== 0 || saturation !== 0) {
                await updateMemory({
                  ...savedMemory,
                  signatureOverlays,
                  adjustments:
                    brightness !== 0 || contrast !== 0 || saturation !== 0
                      ? { brightness, contrast, saturation }
                      : undefined,
                  updatedAt: Date.now(),
                  isEdited: true,
                });
              }
            }

            setSaving(false);
            router.replace('/gallery');
            return;
          }
        }

        // Native : captureRef comme avant
        const capturedUri = await captureRef(viewShotRef.current, {
          format: 'png',
          quality: 1.0,
        });

        if (memoryId && memory) {
          const updatedMemory: Memory = {
            ...memory,
            uri: capturedUri,
            signatureOverlays,
            adjustments:
              brightness !== 0 || contrast !== 0 || saturation !== 0
                ? { brightness, contrast, saturation }
                : undefined,
            updatedAt: Date.now(),
            isEdited: true,
          };

          await updateMemory(updatedMemory);

          if (Platform.OS !== 'web') {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }

          setSaving(false);

          setTimeout(() => {
            router.replace('/gallery');
          }, 300);
        } else if (imageUri) {
          console.log('💾 Sauvegarde du nouveau souvenir dans l\'app...');
          await saveMemory(capturedUri);
          console.log('✅ Souvenir sauvegardé dans l\'app');

          if (Platform.OS !== 'web') {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }

          setSaving(false);

          // Naviguer vers la galerie (le modal s'affichera là-bas)
          setTimeout(() => {
            router.replace('/gallery');
          }, 500);
        }
      }
    } catch (error) {
      console.error('❌ Erreur lors de la sauvegarde:', error);
      const errorMessage = (error as Error).message;

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

      setSaving(false);
    }
  };

  // Download, delete, share functions (same as before)
  const validateAndSave = async () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    try {
      setIsSaving(true);

      if (imageUri && !memoryId) {
        console.log('💾 Sauvegarde du nouveau souvenir dans l\'app...');
        await saveMemory(imageUri);
        console.log('✅ Souvenir sauvegardé dans l\'app');

        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }

        // Naviguer vers la galerie (le modal s'affichera là-bas)
        setTimeout(() => {
          setIsSaving(false);
          router.replace('/gallery');
        }, 500);
      } else if (memoryId) {
        console.log('✅ Souvenir déjà enregistré, redirection vers galerie');

        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }

        setTimeout(() => {
          setIsSaving(false);
          router.replace('/gallery');
        }, 300);
      }
    } catch (error) {
      console.error('❌ Erreur lors de la sauvegarde:', error);
      const errorMessage = (error as Error).message;

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

      setIsSaving(false);
    }
  };

  const downloadToDevice = async () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    if (!displayUri) return;

    performDownload();
  };

  const performDownload = async () => {
    try {
      setIsSaving(true);
      console.log('💾 Téléchargement sur l\'appareil...');

      let uri: string | null = null;

      if (Platform.OS === 'web') {
        // Web : on ne passe pas par captureRef, on télécharge simplement l'image affichée
        uri = displayUri || null;
      } else {
        if (viewShotRef.current) {
          uri = await captureRef(viewShotRef.current, {
            format: 'png',
            quality: 1.0,
          });
        }
      }

      if (!uri) {
        throw new Error('Unable to capture image');
      }

      if (Platform.OS === 'web') {
        const link = document.createElement('a');
        link.href = uri;
        link.download = `souvenir_${Date.now()}.png`;
        link.click();
        console.log('✅ Téléchargement lancé');
      } else {
        const { status } = await MediaLibrary.requestPermissionsAsync(true);
        if (status !== 'granted') {
          Alert.alert('Permission requise', 'L\'accès à la galerie est nécessaire pour enregistrer.');
          setIsSaving(false);
          return;
        }

        await MediaLibrary.createAssetAsync(uri);
        console.log('✅ Enregistré dans la galerie du téléphone');

        Alert.alert(
          'Téléchargé',
          'L\'image a été enregistrée dans votre galerie.'
        );
      }

      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      setIsSaving(false);
    } catch (error) {
      console.error('❌ Erreur lors du téléchargement:', error);
      const errorMessage = (error as Error).message;

      if (Platform.OS === 'web') {
        alert("Téléchargement non disponible dans la prévisualisation web. Teste sur l'app mobile.");
      } else {
        Alert.alert('Erreur', 'Impossible de télécharger l\'image.');
      }

      setIsSaving(false);
    }
  };

  const handleAdWatched = () => {
    setShowAdModal(false);
    performDownload();
  };

  const confirmDelete = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    const message = memoryId
      ? 'Supprimer ce souvenir ? Cette action est irréversible.'
      : 'Supprimer ce souvenir sans l\'enregistrer ?';

    if (Platform.OS === 'web') {
      if (window.confirm(message)) {
        handleDelete();
      }
    } else {
      Alert.alert(
        'Supprimer ce souvenir ?',
        message,
        [
          {
            text: 'Annuler',
            style: 'cancel',
          },
          {
            text: 'Supprimer',
            style: 'destructive',
            onPress: handleDelete,
          },
        ]
      );
    }
  };

  const handleDelete = async () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    if (memoryId && memory) {
      try {
        setIsDeleting(true);
        await deleteMemory(memoryId);

        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }

        router.push('/gallery');
      } catch (error) {
        console.error('❌ Erreur lors de la suppression:', error);
        Alert.alert('Erreur', 'Impossible de supprimer ce souvenir.');
        setIsDeleting(false);
      }
    } else {
      router.push('/');
    }
  };

  const openShareModal = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setShowShareModal(true);
  };

  // Attendre que les polices soient chargées ET que l'image soit chargée
  if (!displayUri || loading || !fontsLoaded) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#10b981" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.container}>
      <View style={styles.container}>
        {/* Image with overlays */}
        <View style={styles.imageContainer} pointerEvents="box-none">
          <View ref={viewShotRef} style={styles.viewShot} collapsable={false}>
            <View style={StyleSheet.absoluteFillObject} pointerEvents={isEditMode ? "box-none" : "auto"}>
              <TouchableOpacity
                activeOpacity={1}
                onPress={() => {
                  if (showTooltip) setShowTooltip(false);
                  if (showColorPicker) setShowColorPicker(false);
                  // Deselect when tapping on background
                  if (isEditMode && selectedElementId) {
                    setSelectedElementId(null);
                    setSelectedElementType(null);
                  }
                }}
                style={StyleSheet.absoluteFillObject}
              >
                <FilteredImage
                  uri={displayUri}
                  brightness={showEffectsPanel ? tempBrightness : brightness}
                  contrast={showEffectsPanel ? tempContrast : contrast}
                  saturation={showEffectsPanel ? tempSaturation : saturation}
                  style={styles.image}
                />
              </TouchableOpacity>
            </View>
            {/* Static overlays (non-editable) */}
            {!isEditMode && signatureOverlays.map(overlay => (
              <StaticSignature
                key={overlay.id}
                overlay={overlay}
              />
            ))}
            {/* Draggable overlays (editable) */}
            {isEditMode && !saving && signatureOverlays.map(overlay => (
              <DraggableSignature
                key={overlay.id}
                overlay={overlay}
                onPositionChange={updateSignaturePosition}
                onRotationChange={updateSignatureRotation}
                onScaleChange={updateSignatureScale}
                onLongPress={() => removeSignatureOverlay(overlay.id)}
                onPress={() => selectElement(overlay.id, 'signature')}
                isSelected={selectedElementId === overlay.id}
              />
            ))}
            {/* Static text overlays (non-editable) */}
            {!isEditMode && textOverlays.map(overlay => (
              <StaticText
                key={overlay.id}
                overlay={overlay}
              />
            ))}
            {/* Draggable text overlays (editable) */}
            {isEditMode && !saving && textOverlays.map(overlay => (
              <DraggableText
                key={overlay.id}
                overlay={overlay}
                onPositionChange={updateTextPosition}
                onRotationChange={updateTextRotation}
                onScaleChange={updateTextScale}
                onLongPress={() => removeTextOverlay(overlay.id)}
                onPress={() => selectElement(overlay.id, 'text')}
                isSelected={selectedElementId === overlay.id}
              />
            ))}
          </View>
        </View>

        {/* Top left - Edit mode toggle and Eraser */}
        <View style={[styles.topLeft, { top: insets.top + 20, left: 20 }]}>
          <Animated.View style={editButtonAnimatedStyle}>
            <TouchableOpacity
              style={[styles.editModeButton, isEditMode && styles.editModeButtonActive]}
              onPress={toggleEditMode}
              activeOpacity={0.8}
            >
              <Pencil size={20} color="#ffffff" strokeWidth={2} />
            </TouchableOpacity>
          </Animated.View>

          {/* Eraser button - visible only when element is selected */}
          {isEditMode && selectedElementId && (
            <TouchableOpacity
              style={styles.eraserButton}
              onPress={deleteSelectedElement}
              activeOpacity={0.8}
            >
              <Eraser size={20} color="#ffffff" strokeWidth={2} />
            </TouchableOpacity>
          )}
        </View>

        {/* Top right - Save button (visible when not in edit mode) */}
        {!isEditMode && (
          <View style={[styles.topRight, { top: insets.top + 20, right: 20 }]}>
            <TouchableOpacity
              style={styles.saveButton}
              onPress={saveAndReturn}
              disabled={saving}
              activeOpacity={0.8}
            >
              {saving ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <Save size={24} color="#ffffff" strokeWidth={2} />
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Top right - Edit buttons (visible only in edit mode) */}
        {isEditMode && (
          <View style={[styles.topRight, { top: insets.top + 20, right: 20 }]}>
            <TouchableOpacity
              style={[styles.editActionButton, styles.paletteButton, showTooltip && styles.paletteButtonActive]}
              onPress={togglePaletteMode}
              activeOpacity={0.8}
            >
              <Palette size={20} color="#ffffff" strokeWidth={2} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.editActionButton, styles.signaturePlusButton]}
              onPress={addSignatureOverlay}
              activeOpacity={0.8}
            >
              <View style={styles.iconWithBadge}>
                <Pencil size={20} color="#ffffff" strokeWidth={2} />
                <View style={styles.plusBadgeSmall}>
                  <Plus size={10} color="#ffffff" strokeWidth={3} />
                </View>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.editActionButton, styles.textPlusButton]}
              onPress={addTextOverlay}
              activeOpacity={0.8}
            >
              <View style={styles.iconWithBadge}>
                <Type size={20} color="#ffffff" strokeWidth={2} />
                <View style={styles.plusBadgeSmall}>
                  <Plus size={10} color="#ffffff" strokeWidth={3} />
                </View>
              </View>
            </TouchableOpacity>

            {selectedElementType === 'text' && (
              <TouchableOpacity
                style={[styles.editActionButton, styles.fontButton, showFontPicker && styles.fontButtonActive]}
                onPress={() => setShowFontPicker(!showFontPicker)}
                activeOpacity={0.8}
              >
                <Text style={styles.fontButtonText}>Aa</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.editActionButton, styles.effectsButton, showEffectsPanel && styles.effectsButtonActive]}
              onPress={toggleEffectsPanel}
              activeOpacity={0.8}
            >
              <Sparkles size={20} color="#ffffff" strokeWidth={2} />
            </TouchableOpacity>
          </View>
        )}

        {/* Edit mode instructions */}
        {isEditMode && !selectedElementId && !showColorPicker && !showSignatureMode && !showEffectsPanel && (
          <View style={[styles.tooltipContainer, { top: insets.top + 90 }]}>
            <View style={styles.tooltip}>
              <Text style={styles.tooltipText}>
                Touchez une signature ou un texte pour le modifier
              </Text>
            </View>
          </View>
        )}

        {/* Selection tooltip */}
        {showTooltip && !selectedElementId && (
          <View style={[styles.tooltipContainer, { top: insets.top + 90 }]}>
            <View style={styles.tooltip}>
              <Text style={styles.tooltipText}>
                {t('selectElementTooltip')}
              </Text>
            </View>
          </View>
        )}

        {/* Color picker for selected element */}
        {isEditMode && selectedElementId && showColorPicker && (
          <View style={[styles.pickerOverlay, { top: insets.top + 90 }]}>
            <View style={styles.pickerContainer}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.pickerScroll}
                scrollEnabled={true}
                nestedScrollEnabled={true}
              >
                <View style={styles.pickerContent}>
                  {SIGNATURE_COLORS.map((color) => (
                    <TouchableOpacity
                      key={color}
                      style={[
                        styles.colorOption,
                        { backgroundColor: color, marginRight: 15 },
                      ]}
                      onPress={() => changeSelectedColor(color)}
                      activeOpacity={0.8}
                    />
                  ))}
                </View>
              </ScrollView>
            </View>
          </View>
        )}

        {/* Font picker for selected text */}
        {/* Signature mode */}
        {showSignatureMode && (
          <View style={styles.modalOverlay} key="signature-modal">
            <View style={styles.signatureModal}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Ajouter une signature</Text>
                <TouchableOpacity onPress={() => {
                  setShowSignatureMode(false);
                  setSignaturePaths([]);
                  signaturePathsRef.current = [];
                  setCurrentPath('');
                  currentPathRef.current = '';
                }}>
                  <X size={24} color="#ffffff" strokeWidth={2} />
                </TouchableOpacity>
              </View>

              <GestureDetector gesture={signatureGesture} key="signature-gesture">
                <View style={styles.signatureCanvas} ref={signatureCanvasRef}>
                  <Svg width={SCREEN_WIDTH - 80} height={200}>
                    {signaturePaths.map((path, index) => (
                      <Path
                        key={`path-${index}`}
                        d={path}
                        stroke={getActiveSignatureColor()}
                        strokeWidth="3"
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    ))}
                    {currentPath && (
                      <Path
                        key="current-path"
                        d={currentPath}
                        stroke={getActiveSignatureColor()}
                        strokeWidth="3"
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    )}
                  </Svg>
                </View>
              </GestureDetector>

              <View style={styles.signatureActions}>
                <TouchableOpacity
                  style={[styles.confirmButton, styles.clearButton]}
                  onPress={clearSignature}
                  activeOpacity={0.8}
                >
                  <Text style={styles.confirmButtonText}>Effacer</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.confirmButton}
                  onPress={confirmAddSignature}
                  activeOpacity={0.8}
                  disabled={signaturePaths.length === 0}
                >
                  <Text style={styles.confirmButtonText}>Ajouter</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* Effects sidebar */}
        {showEffectsPanel && (
          <>
            <TouchableOpacity
              style={styles.effectsOverlay}
              activeOpacity={1}
              onPress={cancelEffects}
            />
            <View style={[styles.effectsSidebar, { top: insets.top + 70 }]}>
              <View style={styles.sidebarContent}>
                <Text style={styles.sidebarTitle}>{t('adjustments')}</Text>

                {/* Luminosité slider */}
                <View style={styles.sliderGroup}>
                  <Text style={styles.sliderLabel}>{t('brightness')}</Text>
                  <View style={styles.sliderContainer}>
                    <Slider
                      style={{ width: '100%', height: 40 }}
                      minimumValue={-100}
                      maximumValue={100}
                      value={tempBrightness}
                      onValueChange={(value) => setTempBrightness(Math.round(value))}
                      minimumTrackTintColor={tempBrightness >= 0 ? '#00C26E' : '#ef4444'}
                      maximumTrackTintColor="rgba(255, 255, 255, 0.2)"
                      thumbTintColor="#00C26E"
                    />
                    <Text style={styles.sliderValueText}>{tempBrightness}</Text>
                  </View>
                </View>

                {/* Contraste slider */}
                <View style={styles.sliderGroup}>
                  <Text style={styles.sliderLabel}>{t('contrast')}</Text>
                  <View style={styles.sliderContainer}>
                    <Slider
                      style={{ width: '100%', height: 40 }}
                      minimumValue={-100}
                      maximumValue={100}
                      value={tempContrast}
                      onValueChange={(value) => setTempContrast(Math.round(value))}
                      minimumTrackTintColor={tempContrast >= 0 ? '#00C26E' : '#ef4444'}
                      maximumTrackTintColor="rgba(255, 255, 255, 0.2)"
                      thumbTintColor="#00C26E"
                    />
                    <Text style={styles.sliderValueText}>{tempContrast}</Text>
                  </View>
                </View>

                {/* Saturation slider */}
                <View style={styles.sliderGroup}>
                  <Text style={styles.sliderLabel}>{t('saturation')}</Text>
                  <View style={styles.sliderContainer}>
                    <Slider
                      style={{ width: '100%', height: 40 }}
                      minimumValue={-100}
                      maximumValue={100}
                      value={tempSaturation}
                      onValueChange={(value) => setTempSaturation(Math.round(value))}
                      minimumTrackTintColor={tempSaturation >= 0 ? '#00C26E' : '#ef4444'}
                      maximumTrackTintColor="rgba(255, 255, 255, 0.2)"
                      thumbTintColor="#00C26E"
                    />
                    <Text style={styles.sliderValueText}>{tempSaturation}</Text>
                  </View>
                </View>

                {/* Action buttons */}
                <View style={styles.sidebarActions}>
                  <TouchableOpacity
                    style={[styles.sidebarButtonRound, styles.resetButtonSidebar]}
                    onPress={resetEffectsPreview}
                    activeOpacity={0.8}
                  >
                    <RotateCw size={20} color="#ffffff" strokeWidth={2} />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.sidebarButtonRound, styles.applyButtonSidebar]}
                    onPress={applyEffects}
                    activeOpacity={0.8}
                  >
                    <Check size={20} color="#ffffff" strokeWidth={2} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </>
        )}

        {/* Bottom buttons */}
        <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          {isEditMode ? (
            // Edit mode - Single validate button
            <TouchableOpacity
              style={styles.validateEditButton}
              onPress={handleSaveEdits}
              disabled={saving}
              activeOpacity={0.8}
            >
              {saving ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <Check size={28} color="#ffffff" strokeWidth={3} />
              )}
            </TouchableOpacity>
          ) : (
            // Normal mode - 3 buttons
            <>
              {memoryId && (
                <TouchableOpacity
                  style={styles.shareButton}
                  onPress={openShareModal}
                  activeOpacity={0.7}
                >
                  <Share2 size={24} color="#ffffff" strokeWidth={2} />
                </TouchableOpacity>
              )}

              {memoryId && (
                <TouchableOpacity
                  style={styles.storyButton}
                  onPress={() => router.push({
                    pathname: '/story',
                    params: { 
                      imageUri: displayUri, 
                      eventType: memory?.metadata?.eventType || 'meetup',
                      signatureOverlays: JSON.stringify(signatureOverlays),
                      textOverlays: JSON.stringify(textOverlays),
                    }
                  })}
                  activeOpacity={0.7}
                >
                  <Film size={24} color="#ffffff" strokeWidth={2} />
                </TouchableOpacity>
              )}

              {memoryId && (
                <TouchableOpacity
                  style={styles.notebookButton}
                  onPress={() => setShowMetadataModal(true)}
                  activeOpacity={0.7}
                >
                  <BookOpen size={24} color="#ffffff" strokeWidth={2} />
                </TouchableOpacity>
              )}


              <TouchableOpacity
                style={styles.deleteButton}
                onPress={confirmDelete}
                disabled={isDeleting}
                activeOpacity={0.7}
              >
                {isDeleting ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Trash2 size={24} color="#ffffff" strokeWidth={2} />
                )}
              </TouchableOpacity>
            </>
          )}
        </View>

        <SocialShareModal
          visible={showShareModal}
          onClose={() => setShowShareModal(false)}
          imageUri={displayUri}
          onSave={downloadToDevice}
        />

        <AdModal
          visible={showAdModal}
          onClose={() => setShowAdModal(false)}
          onAdWatched={handleAdWatched}
        />

        <MetadataModal
          visible={showMetadataModal}
          onClose={() => setShowMetadataModal(false)}
          onSave={handleMetadataSave}
          onSkip={handleMetadataSkip}
          initialMetadata={memory?.metadata}
        />

        <PremiumModal
          visible={showPremiumModal}
          onClose={() => setShowPremiumModal(false)}
          onUpgrade={() => {
            setShowPremiumModal(false);
            router.push('/subscription');
          }}
          title={t('limitReached')}
          message={
            limitType === 'signature'
              ? t('limitReachedSignatureMessage')
              : t('limitReachedTextMessage')
          }
        />

        {/* Text Input Modal */}
        <Modal
          visible={showTextInput}
          transparent
          animationType="fade"
          onRequestClose={() => setShowTextInput(false)}
        >
          <View style={styles.textInputModal}>
            <View style={styles.textInputContainer}>
              <Text style={styles.textInputTitle}>{t('addText') || 'Add Text'}</Text>
              <TextInput
                style={styles.textInputField}
                value={newTextValue}
                onChangeText={setNewTextValue}
                placeholder={t('enterText') || 'Enter your text...'}
                placeholderTextColor="#888"
                autoFocus
                multiline={false}
              />
              <View style={styles.textInputButtons}>
                <TouchableOpacity
                  style={[styles.textInputButton, styles.textInputCancelButton]}
                  onPress={() => setShowTextInput(false)}
                >
                  <Text style={styles.textInputButtonText}>{t('cancel') || 'Cancel'}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.textInputButton, styles.textInputConfirmButton]}
                  onPress={confirmAddText}
                >
                  <Text style={styles.textInputButtonText}>Add</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Font Picker */}
        {showFontPicker && selectedElementType === 'text' && (
          <View style={styles.fontPickerContainer}>
            <Text style={styles.fontPickerTitle}>Select Font</Text>
            <ScrollView style={styles.fontPickerScroll} showsVerticalScrollIndicator={false}>
              {FONT_FAMILIES.map((font) => {
                const selectedText = textOverlays.find(t => t.id === selectedElementId);
                const isSelected = selectedText?.fontFamily === font.value;
                return (
                  <TouchableOpacity
                    key={font.value}
                    style={[styles.fontPickerItem, isSelected && styles.fontPickerItemSelected]}
                    onPress={() => {
                      changeSelectedFont(font.value);
                      setShowFontPicker(false);
                    }}
                  >
                    <Text style={[styles.fontPickerItemText, { fontFamily: font.value }]}>
                      {font.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* Welcome message - Tooltip from edit button */}
        {showWelcomeMessage && (
          <TouchableOpacity
            activeOpacity={1}
            onPress={hideWelcomeMessage}
            style={styles.welcomeMessageOverlay}
          >
            <Animated.View
              style={[
                styles.welcomeMessageContainer,
                { top: insets.top + 80, left: 20 },
                welcomeAnimatedStyle,
              ]}
            >
              <View style={styles.tooltipArrow} />
              <View style={styles.welcomeMessageContent}>
                <View style={styles.welcomeIconContainer}>
                  <Pencil size={20} color="#ffffff" strokeWidth={2.5} />
                </View>
                <Text style={styles.welcomeMessageText}>
                  {t('editModeTooltip')}
                </Text>
              </View>
            </Animated.View>
          </TouchableOpacity>
        )}
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  imageContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  viewShot: {
    flex: 1,
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  topLeft: {
    position: 'absolute',
    zIndex: 10,
    flexDirection: 'column',
    gap: 10,
  },
  editModeButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#2BA6FF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#2BA6FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 10,
    elevation: 10,
  },
  editModeButtonActive: {
    backgroundColor: '#1E90FF',
  },
  editIconContainer: {
    position: 'relative',
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textIconBadge: {
    position: 'absolute',
    bottom: -4,
    right: -6,
    width: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  topRight: {
    position: 'absolute',
    zIndex: 10,
    flexDirection: 'row',
    gap: 10,
  },
  saveButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#10b981',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 10,
    elevation: 10,
  },
  editActionButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  paletteButton: {
    backgroundColor: '#8b5cf6',
  },
  paletteButtonActive: {
    backgroundColor: '#a855f7',
  },
  signaturePlusButton: {
    backgroundColor: '#10b981',
  },
  textPlusButton: {
    backgroundColor: '#3b82f6',
  },
  effectsButton: {
    backgroundColor: '#F59E0B',
  },
  effectsButtonActive: {
    backgroundColor: '#FBB824',
  },
  fontButton: {
    backgroundColor: '#8B5CF6',
  },
  fontButtonActive: {
    backgroundColor: '#A78BFA',
  },
  fontButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  textWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  textInputModal: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
  },
  textInputContainer: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 24,
    width: '85%',
    maxWidth: 400,
  },
  textInputTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
    textAlign: 'center',
  },
  textInputField: {
    backgroundColor: '#333',
    color: '#ffffff',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    marginBottom: 20,
    minHeight: 50,
  },
  textInputButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  textInputButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  textInputCancelButton: {
    backgroundColor: '#444',
  },
  textInputConfirmButton: {
    backgroundColor: '#10b981',
  },
  textInputButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  fontPickerContainer: {
    position: 'absolute',
    bottom: 100,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    borderRadius: 16,
    padding: 16,
    maxHeight: 300,
    zIndex: 50,
  },
  fontPickerTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    textAlign: 'center',
  },
  fontPickerScroll: {
    maxHeight: 220,
  },
  fontPickerItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 4,
  },
  fontPickerItemSelected: {
    backgroundColor: '#8B5CF6',
  },
  fontPickerItemText: {
    color: '#ffffff',
    fontSize: 16,
  },
  iconWithBadge: {
    position: 'relative',
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  plusBadgeSmall: {
    position: 'absolute',
    bottom: -3,
    right: -5,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tooltipContainer: {
    position: 'absolute',
    left: 20,
    right: 20,
    zIndex: 15,
    alignItems: 'center',
  },
  tooltip: {
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    maxWidth: SCREEN_WIDTH - 40,
  },
  tooltipText: {
    color: '#ffffff',
    fontSize: 14,
    textAlign: 'center',
  },
  pickerOverlay: {
    position: 'absolute',
    left: 20,
    right: 20,
    zIndex: 15,
  },
  pickerContainer: {
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    borderRadius: 12,
    padding: 15,
  },
  pickerScroll: {
    flexGrow: 0,
  },
  pickerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  colorOption: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  premiumColorButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fbbf24',
    justifyContent: 'center',
    alignItems: 'center',
  },
  premiumColorText: {
    color: '#000',
    fontSize: 12,
    fontWeight: 'bold',
  },
  fontOption: {
    paddingHorizontal: 15,
    paddingVertical: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
    marginRight: 10,
  },
  fontOptionText: {
    color: '#ffffff',
    fontSize: 14,
  },
  textEditContainer: {
    position: 'absolute',
    left: 20,
    right: 20,
    zIndex: 15,
  },
  textEditBox: {
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    borderRadius: 12,
    padding: 15,
    flexDirection: 'row',
    alignItems: 'center',
  },
  textEditInput: {
    flex: 1,
    color: '#ffffff',
    fontSize: 16,
    marginRight: 10,
  },
  textEditConfirm: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#10b981',
    justifyContent: 'center',
    alignItems: 'center',
  },
  elementControls: {
    position: 'absolute',
    flexDirection: 'row',
    zIndex: 10,
  },
  controlBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(64, 64, 64, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  controlBadgeActive: {
    backgroundColor: '#10b981',
  },
  elementControlsBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 15,
    zIndex: 10,
  },
  controlButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteControlButton: {
    backgroundColor: '#ef4444',
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20,
  },
  textEditorModal: {
    width: SCREEN_WIDTH - 40,
    backgroundColor: '#1a1a1a',
    borderRadius: 20,
    padding: 20,
    maxHeight: SCREEN_HEIGHT - 100,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  textInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 15,
    color: '#ffffff',
    fontSize: 16,
    minHeight: 100,
    marginBottom: 20,
  },
  sectionLabel: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 10,
  },
  colorPickerScroll: {
    marginBottom: 20,
  },
  colorOptionLarge: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 10,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorOptionSelected: {
    borderColor: '#ffffff',
    borderWidth: 3,
  },
  fontOptionLarge: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 10,
    marginRight: 10,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  fontOptionSelected: {
    borderColor: '#ffffff',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  fontOptionTextLarge: {
    color: '#ffffff',
    fontSize: 16,
  },
  confirmButton: {
    backgroundColor: '#10b981',
    borderRadius: 12,
    padding: 15,
    alignItems: 'center',
  },
  confirmButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  signatureModal: {
    width: SCREEN_WIDTH - 40,
    backgroundColor: '#1a1a1a',
    borderRadius: 20,
    padding: 20,
    maxHeight: SCREEN_HEIGHT - 100,
  },
  signatureCanvas: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  signatureActions: {
    flexDirection: 'row',
    gap: 10,
  },
  clearButton: {
    flex: 1,
    backgroundColor: '#ef4444',
  },
  // Effects sidebar styles
  effectsOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
    zIndex: 14,
  },
  effectsSidebar: {
    position: 'absolute',
    right: 20,
    width: SCREEN_WIDTH * 0.45,
    maxWidth: 280,
    bottom: 100,
    zIndex: 15,
    borderRadius: 16,
    backgroundColor: '#000000CC',
    overflow: 'hidden',
  },
  sidebarContent: {
    padding: 20,
  },
  sidebarTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  sliderGroup: {
    marginBottom: 24,
  },
  sliderLabel: {
    color: '#ffffff',
    fontSize: 14,
    marginBottom: 12,
    fontWeight: '600',
  },
  sliderContainer: {
    position: 'relative',
    alignItems: 'center',
  },
  sliderValueText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
    marginTop: 4,
  },
  sidebarActions: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sidebarButtonRound: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  resetButtonSidebar: {
    backgroundColor: '#ef4444',
  },
  applyButtonSidebar: {
    backgroundColor: '#00C26E',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingTop: 20,
    paddingHorizontal: 20,
    backgroundColor: 'transparent',
  },
  validateEditButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#10b981',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 15,
    elevation: 15,
  },
  shareButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#10B981',
    justifyContent: 'center',
    alignItems: 'center',
  },
  storyButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#46ACC2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  notebookButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#29274C',
    justifyContent: 'center',
    alignItems: 'center',
  },
  downloadButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
  },
  eraserButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 10,
    elevation: 10,
  },
  draggableTextContainer: {
    position: 'absolute',
    left: 0,
    top: 0,
    backgroundColor: 'transparent',
  },
  textTouchable: {
    padding: 25,
    margin: -25,
    position: 'relative',
  },
  textContentWrapper: {
    justifyContent: 'center',
    alignItems: 'center',
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
  signatureTouchable: {
    padding: 0,
    margin: 0,
    backgroundColor: 'transparent',
    position: 'relative',
  },
  signatureImage: {
    width: 150,
    height: 75,
    backgroundColor: 'transparent',
  },
  selectionBorder: {
    position: 'absolute',
    top: -4,
    left: -4,
    right: -4,
    bottom: -4,
    borderWidth: 2,
    borderColor: '#10b981',
    borderStyle: 'dashed',
    borderRadius: 8,
    backgroundColor: 'transparent',
    pointerEvents: 'none',
  },
  welcomeMessageOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
  },
  welcomeMessageContainer: {
    position: 'absolute',
    width: SCREEN_WIDTH - 100,
    maxWidth: 300,
    borderRadius: 16,
    backgroundColor: '#2BA6FF',
    shadowColor: '#2BA6FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 10,
  },
  tooltipArrow: {
    position: 'absolute',
    top: -8,
    left: 25,
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#2BA6FF',
  },
  welcomeMessageContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  welcomeIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  welcomeMessageText: {
    flex: 1,
    color: '#ffffff',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
});
