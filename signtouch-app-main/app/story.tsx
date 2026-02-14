import { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ScrollView, TextInput, Dimensions, Platform, ActivityIndicator } from 'react-native';
import Slider from '@react-native-community/slider';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Sparkles, Film, Layers, Share2, Download, Play, Zap, Heart, Move, RotateCw, Wind, Activity } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withTiming, 
  withSequence,
  withDelay,
  withRepeat,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import {
  GestureDetector,
  Gesture,
} from 'react-native-gesture-handler';
import { useLanguage } from '@/contexts/LanguageContext';
import ViewShot from 'react-native-view-shot';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';

// html2canvas is web-only, import conditionally
let html2canvas: any = null;
if (Platform.OS === 'web') {
  html2canvas = require('html2canvas');
}
import { SignatureOverlay, TextOverlay, getAllMemories } from '@/utils/memoriesStorage';
import { saveStory, getStories } from '@/utils/storiesStorage';
import SocialShareModal from '@/components/SocialShareModal';
import Svg, { Path } from 'react-native-svg';

interface StorySignatureProps {
  overlay: SignatureOverlay;
  overrideX?: number;
  overrideY?: number;
  overrideScale?: number;
  overrideRotation?: number;
  overrideColor?: string;
}

function StorySignature({ overlay, overrideX, overrideY, overrideScale, overrideRotation, overrideColor }: StorySignatureProps) {
  const x = overrideX !== undefined ? overrideX : overlay.x;
  const y = overrideY !== undefined ? overrideY : overlay.y;
  const scale = overrideScale !== undefined ? overrideScale : overlay.scale;
  const rotation = overrideRotation !== undefined ? overrideRotation : overlay.rotation;
  const color = overrideColor !== undefined ? overrideColor : overlay.color;
  
  const isJsonData = overlay.uri.startsWith('data:application/json;base64,');
  const isSvgData = overlay.uri.startsWith('data:image/svg+xml');
  
  const RESULT_IMAGE_WIDTH = 402;
  const RESULT_IMAGE_HEIGHT = 874;
  const scaledX = (x / RESULT_IMAGE_WIDTH) * STORY_WIDTH;
  const scaledY = (y / RESULT_IMAGE_HEIGHT) * STORY_HEIGHT;
  
  console.log('🎨 StorySignature rendering:', { id: overlay.id, x, y, scaledX, scaledY, scale, color });

  if (isJsonData) {
    try {
      const base64Data = overlay.uri.split(',')[1];
      const jsonString = decodeURIComponent(escape(atob(base64Data)));
      const svgData = JSON.parse(jsonString);
      const signatureColor = color || '#ffffff';

      return (
        <View style={{
          position: 'absolute',
          left: scaledX,
          top: scaledY,
          width: 150,
          height: 80,
          transform: [
            { rotate: `${rotation}rad` },
            { scale: scale * 0.5 }
          ],
          zIndex: 10,
        }}>
          <Svg
            width={svgData.width}
            height={svgData.height}
            viewBox={`0 0 ${svgData.width} ${svgData.height}`}
            style={{ width: '100%', height: '100%' }}
          >
            {svgData.paths.map((pathData: string, index: number) => (
              <Path
                key={index}
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
      console.error('Error parsing JSON SVG data:', error);
    }
  }

  if (isSvgData) {
    try {
      const base64Data = overlay.uri.split(',')[1];
      const svgString = atob(base64Data);
      const paths: string[] = [];
      const pathRegex = /d="([^"]+)"/g;
      let match;
      while ((match = pathRegex.exec(svgString)) !== null) {
        paths.push(match[1]);
      }
      const signatureColor = color || '#ffffff';
      const widthMatch = svgString.match(/width="([^"]+)"/);
      const heightMatch = svgString.match(/height="([^"]+)"/);
      const width = widthMatch ? parseFloat(widthMatch[1]) : 300;
      const height = heightMatch ? parseFloat(heightMatch[1]) : 150;
      
      const targetSize = 60 * scale;
      const aspectRatio = width / height;
      const displayWidth = aspectRatio >= 1 ? targetSize : targetSize * aspectRatio;
      const displayHeight = aspectRatio >= 1 ? targetSize / aspectRatio : targetSize;
      
      console.log('🎨 StorySignature SVG parsed:', { id: overlay.id, pathsCount: paths.length, displayWidth, displayHeight, color: signatureColor });

      return (
        <View style={{
          position: 'absolute',
          left: scaledX,
          top: scaledY,
          transform: [{ rotate: `${rotation}rad` }],
          zIndex: 10,
        }}>
          <Svg
            width={displayWidth}
            height={displayHeight}
            viewBox={`0 0 ${width} ${height}`}
          >
            {paths.map((pathData, index) => (
              <Path
                key={index}
                d={pathData}
                stroke={signatureColor}
                strokeWidth={5}
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

  return (
    <View style={{
      position: 'absolute',
      left: scaledX,
      top: scaledY,
      width: 150,
      height: 80,
      transform: [
        { rotate: `${rotation}rad` },
        { scale: scale * 0.5 }
      ],
      zIndex: 10,
    }}>
      <Image
        source={{ uri: overlay.uri }}
        tintColor={color}
        style={{ width: 150, height: 80 }}
        resizeMode="contain"
      />
    </View>
  );
}

interface InteractiveSignatureProps {
  overlay: SignatureOverlay;
  color: string;
  isSelected: boolean;
  onSelect: () => void;
}

function InteractiveSignature({ overlay, color, isSelected, onSelect }: InteractiveSignatureProps) {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const rotation = useSharedValue(0);
  const savedRotation = useSharedValue(0);
  
  const RESULT_IMAGE_WIDTH = 402;
  const RESULT_IMAGE_HEIGHT = 874;
  const scaledX = (overlay.x / RESULT_IMAGE_WIDTH) * STORY_WIDTH;
  const scaledY = (overlay.y / RESULT_IMAGE_HEIGHT) * STORY_HEIGHT;
  
  const panGesture = Gesture.Pan()
    .onStart(() => {
      runOnJS(onSelect)();
    })
    .onUpdate((e) => {
      translateX.value = savedTranslateX.value + e.translationX;
      translateY.value = savedTranslateY.value + e.translationY;
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });
  
  const pinchGesture = Gesture.Pinch()
    .onStart(() => {
      runOnJS(onSelect)();
    })
    .onUpdate((e) => {
      scale.value = savedScale.value * e.scale;
    })
    .onEnd(() => {
      savedScale.value = scale.value;
    });
  
  const rotateGesture = Gesture.Rotation()
    .onStart(() => {
      runOnJS(onSelect)();
    })
    .onUpdate((e) => {
      rotation.value = savedRotation.value + e.rotation;
    })
    .onEnd(() => {
      savedRotation.value = rotation.value;
    });
  
  const tapGesture = Gesture.Tap()
    .maxDuration(250)
    .onEnd(() => {
      runOnJS(onSelect)();
    });
  
  const transformGestures = Gesture.Simultaneous(panGesture, pinchGesture, rotateGesture);
  const composedGesture = Gesture.Exclusive(transformGestures, tapGesture);
  
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
      { rotate: `${rotation.value}rad` },
    ],
  }));
  
  return (
    <GestureDetector gesture={composedGesture}>
      <Animated.View
        style={[{
          position: 'absolute',
          left: scaledX,
          top: scaledY,
          zIndex: isSelected ? 100 : 10,
          padding: 4,
          borderWidth: isSelected ? 2 : 0,
          borderColor: '#10B981',
          borderRadius: 8,
          borderStyle: 'dashed',
        }, animatedStyle]}
      >
        <SignatureSvgContent overlay={overlay} color={color} />
      </Animated.View>
    </GestureDetector>
  );
}

interface InteractiveTextProps {
  overlay: TextOverlay;
  isSelected: boolean;
  onSelect: () => void;
}

function InteractiveText({ overlay, isSelected, onSelect }: InteractiveTextProps) {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  const scale = useSharedValue(overlay.scale || 1);
  const savedScale = useSharedValue(overlay.scale || 1);
  const rotation = useSharedValue(0);
  const savedRotation = useSharedValue(0);
  
  const RESULT_IMAGE_WIDTH = 402;
  const RESULT_IMAGE_HEIGHT = 874;
  const scaledX = (overlay.x / RESULT_IMAGE_WIDTH) * STORY_WIDTH;
  const scaledY = (overlay.y / RESULT_IMAGE_HEIGHT) * STORY_HEIGHT;
  
  const panGesture = Gesture.Pan()
    .onStart(() => {
      runOnJS(onSelect)();
    })
    .onUpdate((e) => {
      translateX.value = savedTranslateX.value + e.translationX;
      translateY.value = savedTranslateY.value + e.translationY;
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });
  
  const pinchGesture = Gesture.Pinch()
    .onStart(() => {
      runOnJS(onSelect)();
    })
    .onUpdate((e) => {
      scale.value = savedScale.value * e.scale;
    })
    .onEnd(() => {
      savedScale.value = scale.value;
    });
  
  const rotateGesture = Gesture.Rotation()
    .onStart(() => {
      runOnJS(onSelect)();
    })
    .onUpdate((e) => {
      rotation.value = savedRotation.value + e.rotation;
    })
    .onEnd(() => {
      savedRotation.value = rotation.value;
    });
  
  const tapGesture = Gesture.Tap()
    .maxDuration(250)
    .onEnd(() => {
      runOnJS(onSelect)();
    });
  
  const transformGestures = Gesture.Simultaneous(panGesture, pinchGesture, rotateGesture);
  const composedGesture = Gesture.Exclusive(transformGestures, tapGesture);
  
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
      { rotate: `${rotation.value}rad` },
    ],
  }));
  
  return (
    <GestureDetector gesture={composedGesture}>
      <Animated.View
        style={[{
          position: 'absolute',
          left: scaledX,
          top: scaledY,
          zIndex: isSelected ? 100 : 15,
          padding: 4,
          borderWidth: isSelected ? 2 : 0,
          borderColor: '#10B981',
          borderRadius: 8,
          borderStyle: 'dashed',
        }, animatedStyle]}
      >
        <Text style={{
          color: overlay.color || '#ffffff',
          fontSize: overlay.fontSize || 18,
          fontFamily: overlay.fontFamily,
        }}>
          {overlay.text}
        </Text>
      </Animated.View>
    </GestureDetector>
  );
}

function SignatureSvgContent({ overlay, color }: { overlay: SignatureOverlay; color: string }) {
  const isJsonData = overlay.uri.startsWith('data:application/json;base64,');
  const isSvgData = overlay.uri.startsWith('data:image/svg+xml');
  const signatureColor = color || '#ffffff';
  
  if (isSvgData) {
    try {
      const base64Data = overlay.uri.split(',')[1];
      const svgString = atob(base64Data);
      const paths: string[] = [];
      const pathRegex = /d="([^"]+)"/g;
      let match;
      while ((match = pathRegex.exec(svgString)) !== null) {
        paths.push(match[1]);
      }
      const widthMatch = svgString.match(/width="([^"]+)"/);
      const heightMatch = svgString.match(/height="([^"]+)"/);
      const width = widthMatch ? parseFloat(widthMatch[1]) : 300;
      const height = heightMatch ? parseFloat(heightMatch[1]) : 150;
      
      const targetSize = 80;
      const aspectRatio = width / height;
      const displayWidth = aspectRatio >= 1 ? targetSize : targetSize * aspectRatio;
      const displayHeight = aspectRatio >= 1 ? targetSize / aspectRatio : targetSize;
      
      const strokeScale = width / displayWidth;
      const scaledStrokeWidth = 3 * strokeScale;
      
      console.log('🖊️ SignatureSvgContent SVG parsed:', { id: overlay.id, pathsCount: paths.length, width, height, displayWidth, displayHeight, strokeScale, scaledStrokeWidth, color: signatureColor });
      
      return (
        <Svg
          width={displayWidth}
          height={displayHeight}
          viewBox={`0 0 ${width} ${height}`}
        >
          {paths.map((pathData, index) => (
            <Path
              key={index}
              d={pathData}
              stroke={signatureColor}
              strokeWidth={scaledStrokeWidth}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </Svg>
      );
    } catch (error) {
      console.error('Error in SignatureSvgContent:', error);
    }
  }
  
  console.log('🖊️ SignatureSvgContent fallback:', { id: overlay.id, isJsonData, isSvgData });

  if (isJsonData) {
    try {
      const base64Data = overlay.uri.split(',')[1];
      const jsonString = decodeURIComponent(escape(atob(base64Data)));
      const svgData = JSON.parse(jsonString);
      return (
        <Svg
          width={svgData.width}
          height={svgData.height}
          viewBox={`0 0 ${svgData.width} ${svgData.height}`}
          style={{ width: 150, height: 80 }}
        >
          {svgData.paths.map((pathData: string, index: number) => (
            <Path
              key={index}
              d={pathData}
              stroke={signatureColor}
              strokeWidth={8}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </Svg>
      );
    } catch (error) {
      console.error('Error parsing JSON SVG:', error);
    }
  }

  if (isSvgData) {
    try {
      const base64Data = overlay.uri.split(',')[1];
      const svgString = atob(base64Data);
      const paths: string[] = [];
      const pathRegex = /d="([^"]+)"/g;
      let match;
      while ((match = pathRegex.exec(svgString)) !== null) {
        paths.push(match[1]);
      }
      const widthMatch = svgString.match(/width="([^"]+)"/);
      const heightMatch = svgString.match(/height="([^"]+)"/);
      const width = widthMatch ? parseFloat(widthMatch[1]) : 300;
      const height = heightMatch ? parseFloat(heightMatch[1]) : 150;

      return (
        <Svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          style={{ width: 150, height: 80 }}
        >
          {paths.map((pathData, index) => (
            <Path
              key={index}
              d={pathData}
              stroke={signatureColor}
              strokeWidth={3}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </Svg>
      );
    } catch (error) {
      console.error('Error parsing SVG:', error);
    }
  }

  return (
    <Image
      source={{ uri: overlay.uri }}
      tintColor={signatureColor}
      style={{ width: 150, height: 80 }}
      resizeMode="contain"
    />
  );
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const STORY_WIDTH = SCREEN_WIDTH * 0.7;
const STORY_HEIGHT = STORY_WIDTH * (16 / 9);

type AnimationType = 'cinematic' | 'dramatic-zoom' | 'bounce' | 'pulse' | 'slide-reveal' | 'shake' | 'spin-zoom' | 'float' | 'heartbeat' | 'swing';

interface Animation {
  id: AnimationType;
  nameKey: 'animCinematic' | 'animDramaticZoom' | 'animBounce' | 'animPulse' | 'animSlideReveal' | 'animShake' | 'animSpinZoom' | 'animFloat' | 'animHeartbeat' | 'animSwing';
  colors: [string, string];
  textColor: string;
  overlayOpacity: number;
  hasGlow?: boolean;
}

const ANIMATIONS: Animation[] = [
  { 
    id: 'cinematic', 
    nameKey: 'animCinematic',
    colors: ['#1a1a2e', '#16213e'], 
    textColor: '#ffffff', 
    overlayOpacity: 0.3 
  },
  { 
    id: 'dramatic-zoom', 
    nameKey: 'animDramaticZoom',
    colors: ['#0d0d0d', '#1a1a1a'], 
    textColor: '#ffffff', 
    overlayOpacity: 0.4,
    hasGlow: true
  },
  { 
    id: 'bounce', 
    nameKey: 'animBounce',
    colors: ['#ff6b6b', '#ee5a5a'], 
    textColor: '#ffffff', 
    overlayOpacity: 0.25 
  },
  { 
    id: 'pulse', 
    nameKey: 'animPulse',
    colors: ['#6c5ce7', '#a29bfe'], 
    textColor: '#ffffff', 
    overlayOpacity: 0.3,
    hasGlow: true
  },
  { 
    id: 'slide-reveal', 
    nameKey: 'animSlideReveal',
    colors: ['#00b894', '#00cec9'], 
    textColor: '#ffffff', 
    overlayOpacity: 0.25 
  },
  { 
    id: 'shake', 
    nameKey: 'animShake',
    colors: ['#fdcb6e', '#f39c12'], 
    textColor: '#1a1a1a', 
    overlayOpacity: 0.2 
  },
  { 
    id: 'spin-zoom', 
    nameKey: 'animSpinZoom',
    colors: ['#e84393', '#fd79a8'], 
    textColor: '#ffffff', 
    overlayOpacity: 0.3,
    hasGlow: true
  },
  { 
    id: 'float', 
    nameKey: 'animFloat',
    colors: ['#74b9ff', '#0984e3'], 
    textColor: '#ffffff', 
    overlayOpacity: 0.25 
  },
  { 
    id: 'heartbeat', 
    nameKey: 'animHeartbeat',
    colors: ['#ff7675', '#d63031'], 
    textColor: '#ffffff', 
    overlayOpacity: 0.35,
    hasGlow: true
  },
  { 
    id: 'swing', 
    nameKey: 'animSwing',
    colors: ['#2d3436', '#636e72'], 
    textColor: '#ffffff', 
    overlayOpacity: 0.3 
  },
];


function StoryPreview({ 
  imageUri, 
  animation, 
  customText,
  isAnimating,
  onAnimationComplete,
  defaultText,
  signatureOverlays = [],
  textOverlays = [],
  signatureScale = 1,
  signatureRotation = 0,
  signatureX = 0.5,
  signatureY = 0.3,
  signatureColor = '#ffffff',
  textScale = 1,
  textColor = '#ffffff',
  textY = 0.75,
  onSignatureChange,
  onTextChange,
  interactive = false,
  selectedSignatureIndex = null,
  setSelectedSignatureIndex,
  selectedTextIndex = null,
  setSelectedTextIndex,
}: { 
  imageUri: string; 
  animation: Animation; 
  customText: string;
  isAnimating: boolean;
  onAnimationComplete?: () => void;
  defaultText: string;
  signatureOverlays?: SignatureOverlay[];
  textOverlays?: TextOverlay[];
  signatureScale?: number;
  signatureRotation?: number;
  signatureX?: number;
  signatureY?: number;
  signatureColor?: string;
  textScale?: number;
  textColor?: string;
  textY?: number;
  onSignatureChange?: (scale: number, rotation: number, x: number, y: number) => void;
  onTextChange?: (scale: number, y: number) => void;
  interactive?: boolean;
  selectedSignatureIndex?: number | null;
  setSelectedSignatureIndex?: (index: number | null) => void;
  selectedTextIndex?: number | null;
  setSelectedTextIndex?: (index: number | null) => void;
}) {
  const scale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const textOpacity = useSharedValue(1);
  const glowOpacity = useSharedValue(0);
  const bgScale = useSharedValue(1);
  const bgTranslateX = useSharedValue(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sigTranslateX = useSharedValue(0);
  const sigTranslateY = useSharedValue(0);
  const sigScale = useSharedValue(signatureScale);
  const sigRotation = useSharedValue(signatureRotation);
  const savedSigTranslateX = useSharedValue(0);
  const savedSigTranslateY = useSharedValue(0);
  const savedSigScale = useSharedValue(signatureScale);
  const savedSigRotation = useSharedValue(signatureRotation);

  const txtTranslateX = useSharedValue(0);
  const txtTranslateY = useSharedValue((textY - 0.5) * STORY_HEIGHT);
  const txtScale = useSharedValue(textScale);
  const txtRotation = useSharedValue(0);
  const savedTxtTranslateX = useSharedValue(0);
  const savedTxtTranslateY = useSharedValue((textY - 0.5) * STORY_HEIGHT);
  const savedTxtScale = useSharedValue(textScale);
  const savedTxtRotation = useSharedValue(0);

  useEffect(() => {
    sigScale.value = signatureScale;
    sigRotation.value = signatureRotation;
    savedSigScale.value = signatureScale;
    savedSigRotation.value = signatureRotation;
  }, [signatureScale, signatureRotation]);

  useEffect(() => {
    txtTranslateY.value = (textY - 0.5) * STORY_HEIGHT;
    txtScale.value = textScale;
    savedTxtTranslateY.value = (textY - 0.5) * STORY_HEIGHT;
    savedTxtScale.value = textScale;
  }, [textY, textScale]);

  const updateSignatureCallback = (s: number, r: number, x: number, y: number) => {
    if (onSignatureChange) onSignatureChange(s, r, x, y);
  };

  const updateTextCallback = (s: number, y: number) => {
    if (onTextChange) onTextChange(s, y);
  };

  const signatureGesture = useMemo(() => {
    if (!interactive) return Gesture.Tap();
    
    const pinch = Gesture.Pinch()
      .onUpdate((e) => {
        sigScale.value = Math.max(0.3, Math.min(4, savedSigScale.value * e.scale));
      })
      .onEnd(() => {
        savedSigScale.value = sigScale.value;
        const newX = 0.5 + sigTranslateX.value / STORY_WIDTH;
        const newY = 0.5 + sigTranslateY.value / STORY_HEIGHT;
        runOnJS(updateSignatureCallback)(sigScale.value, sigRotation.value, newX, newY);
      });

    const rotate = Gesture.Rotation()
      .onUpdate((e) => {
        sigRotation.value = savedSigRotation.value + e.rotation;
      })
      .onEnd(() => {
        savedSigRotation.value = sigRotation.value;
        const newX = 0.5 + sigTranslateX.value / STORY_WIDTH;
        const newY = 0.5 + sigTranslateY.value / STORY_HEIGHT;
        runOnJS(updateSignatureCallback)(sigScale.value, sigRotation.value, newX, newY);
      });

    const pan = Gesture.Pan()
      .onUpdate((e) => {
        sigTranslateX.value = savedSigTranslateX.value + e.translationX;
        sigTranslateY.value = savedSigTranslateY.value + e.translationY;
      })
      .onEnd(() => {
        savedSigTranslateX.value = sigTranslateX.value;
        savedSigTranslateY.value = sigTranslateY.value;
        const newX = 0.5 + sigTranslateX.value / STORY_WIDTH;
        const newY = 0.5 + sigTranslateY.value / STORY_HEIGHT;
        runOnJS(updateSignatureCallback)(sigScale.value, sigRotation.value, newX, newY);
      });

    return Gesture.Simultaneous(pinch, rotate, pan);
  }, [interactive]);

  const textGesture = useMemo(() => {
    if (!interactive) return Gesture.Tap();
    
    const pinch = Gesture.Pinch()
      .onUpdate((e) => {
        txtScale.value = Math.max(0.5, Math.min(3, savedTxtScale.value * e.scale));
      })
      .onEnd(() => {
        savedTxtScale.value = txtScale.value;
        const newY = 0.5 + txtTranslateY.value / STORY_HEIGHT;
        runOnJS(updateTextCallback)(txtScale.value, newY);
      });

    const rotate = Gesture.Rotation()
      .onUpdate((e) => {
        txtRotation.value = savedTxtRotation.value + e.rotation;
      })
      .onEnd(() => {
        savedTxtRotation.value = txtRotation.value;
      });

    const pan = Gesture.Pan()
      .onUpdate((e) => {
        txtTranslateX.value = savedTxtTranslateX.value + e.translationX;
        txtTranslateY.value = savedTxtTranslateY.value + e.translationY;
      })
      .onEnd(() => {
        savedTxtTranslateX.value = txtTranslateX.value;
        savedTxtTranslateY.value = txtTranslateY.value;
        const newY = 0.5 + txtTranslateY.value / STORY_HEIGHT;
        runOnJS(updateTextCallback)(txtScale.value, newY);
      });

    return Gesture.Simultaneous(pinch, rotate, pan);
  }, [interactive]);

  const sigAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: sigTranslateX.value },
      { translateY: sigTranslateY.value },
      { scale: sigScale.value },
      { rotate: `${sigRotation.value}rad` },
    ],
  }));

  const txtAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: txtTranslateX.value },
      { translateY: txtTranslateY.value },
      { scale: txtScale.value },
      { rotate: `${txtRotation.value}rad` },
    ],
  }));

  useEffect(() => {
    if (isAnimating) {
      scale.value = 1;
      translateX.value = 0;
      translateY.value = 0;
      textOpacity.value = 1;
      glowOpacity.value = 0;
      bgScale.value = 1;
      bgTranslateX.value = 0;

      if (animation.id === 'cinematic') {
        // Slow cinematic pan with subtle zoom
        scale.value = withSequence(
          withTiming(1.15, { duration: 4000, easing: Easing.inOut(Easing.ease) }),
          withTiming(1.1, { duration: 3000, easing: Easing.inOut(Easing.ease) })
        );
        translateX.value = withSequence(
          withTiming(-15, { duration: 3500, easing: Easing.inOut(Easing.ease) }),
          withTiming(15, { duration: 3500, easing: Easing.inOut(Easing.ease) })
        );
        textOpacity.value = withDelay(5000, withTiming(1, { duration: 800 }));
        if (onAnimationComplete) timerRef.current = setTimeout(() => onAnimationComplete(), 7000);
        
      } else if (animation.id === 'dramatic-zoom') {
        // Intense zoom-in with glow
        scale.value = withSequence(
          withTiming(1, { duration: 500 }),
          withTiming(2.5, { duration: 3000, easing: Easing.out(Easing.cubic) }),
          withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) })
        );
        glowOpacity.value = withSequence(
          withDelay(500, withTiming(0.8, { duration: 2000 })),
          withTiming(0.3, { duration: 2000 })
        );
        textOpacity.value = withDelay(4500, withTiming(1, { duration: 500 }));
        if (onAnimationComplete) timerRef.current = setTimeout(() => onAnimationComplete(), 6000);
        
      } else if (animation.id === 'bounce') {
        // Energetic bounce effect
        scale.value = withSequence(
          withTiming(1.3, { duration: 300, easing: Easing.out(Easing.back(2)) }),
          withTiming(0.95, { duration: 200, easing: Easing.inOut(Easing.ease) }),
          withTiming(1.15, { duration: 250, easing: Easing.out(Easing.back(1.5)) }),
          withTiming(1, { duration: 200, easing: Easing.inOut(Easing.ease) }),
          withTiming(1.08, { duration: 200, easing: Easing.out(Easing.ease) }),
          withTiming(1.05, { duration: 2000, easing: Easing.inOut(Easing.ease) })
        );
        translateY.value = withSequence(
          withTiming(-30, { duration: 300, easing: Easing.out(Easing.ease) }),
          withTiming(10, { duration: 200, easing: Easing.inOut(Easing.ease) }),
          withTiming(-15, { duration: 250, easing: Easing.out(Easing.ease) }),
          withTiming(0, { duration: 200, easing: Easing.inOut(Easing.ease) })
        );
        textOpacity.value = withDelay(1500, withTiming(1, { duration: 300 }));
        if (onAnimationComplete) timerRef.current = setTimeout(() => onAnimationComplete(), 4000);
        
      } else if (animation.id === 'pulse') {
        // Heartbeat-like pulsing with glow
        scale.value = withRepeat(
          withSequence(
            withTiming(1.12, { duration: 400, easing: Easing.out(Easing.ease) }),
            withTiming(1, { duration: 400, easing: Easing.inOut(Easing.ease) }),
            withTiming(1.08, { duration: 300, easing: Easing.out(Easing.ease) }),
            withTiming(1, { duration: 600, easing: Easing.inOut(Easing.ease) })
          ),
          3,
          false
        );
        glowOpacity.value = withRepeat(
          withSequence(
            withTiming(0.7, { duration: 400 }),
            withTiming(0.2, { duration: 400 }),
            withTiming(0.5, { duration: 300 }),
            withTiming(0.2, { duration: 600 })
          ),
          3,
          false
        );
        textOpacity.value = withDelay(3500, withTiming(1, { duration: 500 }));
        if (onAnimationComplete) timerRef.current = setTimeout(() => onAnimationComplete(), 5500);
        
      } else if (animation.id === 'slide-reveal') {
        // Slide from side with reveal
        translateX.value = withSequence(
          withTiming(-100, { duration: 0 }),
          withTiming(0, { duration: 800, easing: Easing.out(Easing.cubic) }),
          withTiming(10, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
          withTiming(0, { duration: 2000, easing: Easing.inOut(Easing.ease) })
        );
        scale.value = withSequence(
          withTiming(1.2, { duration: 800, easing: Easing.out(Easing.ease) }),
          withTiming(1.05, { duration: 3000, easing: Easing.inOut(Easing.ease) })
        );
        textOpacity.value = withDelay(2500, withTiming(1, { duration: 500 }));
        if (onAnimationComplete) timerRef.current = setTimeout(() => onAnimationComplete(), 5000);
        
      } else if (animation.id === 'shake') {
        // Energetic shake effect
        translateX.value = withSequence(
          withRepeat(
            withSequence(
              withTiming(-8, { duration: 50 }),
              withTiming(8, { duration: 50 }),
              withTiming(-6, { duration: 50 }),
              withTiming(6, { duration: 50 }),
              withTiming(-4, { duration: 50 }),
              withTiming(4, { duration: 50 }),
              withTiming(0, { duration: 50 })
            ),
            3,
            false
          ),
          withTiming(0, { duration: 2000 })
        );
        scale.value = withSequence(
          withTiming(1.1, { duration: 350 }),
          withTiming(1.05, { duration: 2500, easing: Easing.inOut(Easing.ease) })
        );
        textOpacity.value = withDelay(2000, withTiming(1, { duration: 300 }));
        if (onAnimationComplete) timerRef.current = setTimeout(() => onAnimationComplete(), 4000);
        
      } else if (animation.id === 'spin-zoom') {
        // Rotation with zoom
        bgScale.value = withSequence(
          withTiming(1.3, { duration: 2000, easing: Easing.out(Easing.ease) }),
          withTiming(1.1, { duration: 2000, easing: Easing.inOut(Easing.ease) })
        );
        scale.value = withSequence(
          withTiming(0.8, { duration: 500 }),
          withTiming(1.2, { duration: 1500, easing: Easing.out(Easing.back(1.2)) }),
          withTiming(1.05, { duration: 2000, easing: Easing.inOut(Easing.ease) })
        );
        glowOpacity.value = withSequence(
          withTiming(0.8, { duration: 2000 }),
          withTiming(0.4, { duration: 2000 })
        );
        textOpacity.value = withDelay(3500, withTiming(1, { duration: 500 }));
        if (onAnimationComplete) timerRef.current = setTimeout(() => onAnimationComplete(), 5000);
        
      } else if (animation.id === 'float') {
        // Gentle floating motion
        translateY.value = withRepeat(
          withSequence(
            withTiming(-20, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
            withTiming(20, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
            withTiming(-10, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
            withTiming(0, { duration: 1000, easing: Easing.inOut(Easing.ease) })
          ),
          1,
          false
        );
        scale.value = withSequence(
          withTiming(1.1, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
          withTiming(1.05, { duration: 3000, easing: Easing.inOut(Easing.ease) })
        );
        textOpacity.value = withDelay(4000, withTiming(1, { duration: 500 }));
        if (onAnimationComplete) timerRef.current = setTimeout(() => onAnimationComplete(), 5500);
        
      } else if (animation.id === 'heartbeat') {
        // Strong heartbeat rhythm
        scale.value = withRepeat(
          withSequence(
            withTiming(1.18, { duration: 150, easing: Easing.out(Easing.ease) }),
            withTiming(1, { duration: 150, easing: Easing.inOut(Easing.ease) }),
            withTiming(1.22, { duration: 150, easing: Easing.out(Easing.ease) }),
            withTiming(1, { duration: 550, easing: Easing.inOut(Easing.ease) })
          ),
          4,
          false
        );
        glowOpacity.value = withRepeat(
          withSequence(
            withTiming(0.9, { duration: 150 }),
            withTiming(0.3, { duration: 150 }),
            withTiming(0.9, { duration: 150 }),
            withTiming(0.2, { duration: 550 })
          ),
          4,
          false
        );
        textOpacity.value = withDelay(3500, withTiming(1, { duration: 500 }));
        if (onAnimationComplete) timerRef.current = setTimeout(() => onAnimationComplete(), 5000);
        
      } else if (animation.id === 'swing') {
        // Pendulum swing effect
        translateX.value = withSequence(
          withTiming(40, { duration: 600, easing: Easing.out(Easing.ease) }),
          withTiming(-35, { duration: 500, easing: Easing.inOut(Easing.ease) }),
          withTiming(25, { duration: 450, easing: Easing.inOut(Easing.ease) }),
          withTiming(-15, { duration: 400, easing: Easing.inOut(Easing.ease) }),
          withTiming(8, { duration: 350, easing: Easing.inOut(Easing.ease) }),
          withTiming(0, { duration: 300, easing: Easing.inOut(Easing.ease) })
        );
        scale.value = withSequence(
          withTiming(1.1, { duration: 600, easing: Easing.out(Easing.ease) }),
          withTiming(1.05, { duration: 2000, easing: Easing.inOut(Easing.ease) })
        );
        textOpacity.value = withDelay(2500, withTiming(1, { duration: 500 }));
        if (onAnimationComplete) timerRef.current = setTimeout(() => onAnimationComplete(), 4000);
      }
    } else {
      scale.value = 1;
      translateX.value = 0;
      translateY.value = 0;
      textOpacity.value = 1;
      glowOpacity.value = animation.hasGlow ? 0.4 : 0;
      bgScale.value = 1;
      bgTranslateX.value = 0;
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [isAnimating, animation.id]);

  const imageStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value },
      { translateX: translateX.value },
      { translateY: translateY.value },
    ],
  }));

  const bgImageStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: bgScale.value },
      { translateX: bgTranslateX.value },
    ],
  }));

  const textStyle = useAnimatedStyle(() => ({
    opacity: textOpacity.value,
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  return (
    <View style={styles.storyPreviewContainer}>
      <LinearGradient
        colors={animation.colors}
        style={styles.storyPreview}
      >
        <View style={styles.imageContainer}>
          {imageUri ? (
            <Animated.Image
              source={{ uri: imageUri }}
              style={[styles.storyImage, imageStyle]}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.storyImage, { backgroundColor: '#333' }]} />
          )}
          {!interactive && signatureOverlays.length > 0 && signatureOverlays.map((overlay, index) => {
            const isFirst = index === 0;
            return (
              <StorySignature
                key={overlay.id}
                overlay={overlay}
                overrideX={isFirst ? signatureX : undefined}
                overrideY={isFirst ? signatureY : undefined}
                overrideScale={isFirst ? signatureScale : undefined}
                overrideRotation={isFirst ? signatureRotation : undefined}
                overrideColor={isFirst ? signatureColor : undefined}
              />
            );
          })}
        </View>

        {animation.hasGlow && (
          <Animated.View style={[styles.glowOverlay, glowStyle]} />
        )}

        <View style={[styles.overlay, { opacity: animation.overlayOpacity }]} pointerEvents="none" />

        {!interactive && textOverlays.length > 0 && textOverlays.map((overlay, index) => {
          const RESULT_IMAGE_WIDTH = 402;
          const RESULT_IMAGE_HEIGHT = 874;
          const scaledX = (overlay.x / RESULT_IMAGE_WIDTH) * STORY_WIDTH;
          const scaledY = (overlay.y / RESULT_IMAGE_HEIGHT) * STORY_HEIGHT;
          return (
            <Animated.View
              key={overlay.id}
              style={[textStyle, {
                position: 'absolute',
                left: scaledX,
                top: scaledY,
                transform: [
                  { scale: overlay.scale || 1 },
                  { rotate: `${overlay.rotation || 0}deg` },
                ],
                zIndex: 50,
              }]}
            >
              <Text style={[styles.customText, { 
                color: overlay.color || '#ffffff', 
                fontSize: overlay.fontSize || 18,
                fontFamily: overlay.fontFamily,
              }]}>
                {overlay.text}
              </Text>
            </Animated.View>
          );
        })}

        {interactive && signatureOverlays
          .map((overlay, index) => ({ overlay, index }))
          .sort((a, b) => {
            if (a.index === selectedSignatureIndex) return 1;
            if (b.index === selectedSignatureIndex) return -1;
            return a.index - b.index;
          })
          .map(({ overlay, index }) => (
            <InteractiveSignature
              key={overlay.id}
              overlay={overlay}
              color={overlay.color}
              isSelected={index === selectedSignatureIndex && selectedTextIndex === null}
              onSelect={() => {
                setSelectedSignatureIndex && setSelectedSignatureIndex(index);
                setSelectedTextIndex && setSelectedTextIndex(null);
              }}
            />
          ))}

        {interactive && textOverlays.length > 0 && textOverlays.map((overlay, index) => (
          <InteractiveText
            key={overlay.id}
            overlay={overlay}
            isSelected={index === selectedTextIndex && selectedSignatureIndex === null}
            onSelect={() => {
              setSelectedTextIndex && setSelectedTextIndex(index);
              setSelectedSignatureIndex && setSelectedSignatureIndex(null);
            }}
          />
        ))}

        <View style={styles.watermark}>
          <Text style={styles.watermarkText}>SignTouch</Text>
        </View>
      </LinearGradient>
    </View>
  );
}

export default function StoryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { t } = useLanguage();
  const viewShotRef = useRef<ViewShot>(null);
  const webContainerRef = useRef<HTMLDivElement>(null);

  const storyId = params.storyId as string | undefined;
  const mode = params.mode as string | undefined;
  const sourceMemoryId = params.memoryId as string | undefined;

  const [imageUri, setImageUri] = useState(params.imageUri as string || '');
  const [signatureOverlays, setSignatureOverlays] = useState<SignatureOverlay[]>([]);
  const [textOverlays, setTextOverlays] = useState<TextOverlay[]>([]);
  const [selectedAnimation, setSelectedAnimation] = useState<Animation>(ANIMATIONS[0]);
  const [customText, setCustomText] = useState('');
  const [isAnimating, setIsAnimating] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareImageUri, setShareImageUri] = useState<string | null>(null);
  
  const [signatureScale, setSignatureScale] = useState(1);
  const [signatureRotation, setSignatureRotation] = useState(0);
  const [signatureX, setSignatureX] = useState(0.5);
  const [signatureY, setSignatureY] = useState(0.3);
  const [signatureColor, setSignatureColor] = useState('#ffffff');
  
  const [textScale, setTextScale] = useState(1);
  const [textColor, setTextColor] = useState('#ffffff');
  const [textY, setTextY] = useState(0.75);
  
  const [selectedSignatureIndex, setSelectedSignatureIndex] = useState<number | null>(0);
  const [selectedTextIndex, setSelectedTextIndex] = useState<number | null>(null);
  
  const COLORS = ['#ffffff', '#000000', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#ffa500', '#10B981'];

  useEffect(() => {
    const loadData = async () => {
      if (storyId && sourceMemoryId && (mode === 'edit' || mode === 'preview')) {
        setIsLoading(true);
        try {
          const memories = await getAllMemories();
          const memory = memories.find(m => m.id === sourceMemoryId);
          if (memory) {
            const hasBaseUri = memory.baseUri && memory.baseUri !== memory.uri;
            setImageUri(hasBaseUri ? memory.baseUri : memory.uri);
            const sigs = memory.signatureOverlays || [];
            const txts = memory.textOverlays || [];
            console.log('📥 Story loaded from memory:', { sigCount: sigs.length, txtCount: txts.length });
            if (sigs.length > 0) {
              console.log('📥 First signature from memory:', { id: sigs[0].id, uri: sigs[0].uri?.substring(0, 50), color: sigs[0].color });
            }
            setSignatureOverlays(sigs);
            setTextOverlays(txts);
            if (sigs.length > 0) {
              const firstSig = sigs[0];
              setSignatureX(firstSig.x);
              setSignatureY(firstSig.y);
              setSignatureScale(firstSig.scale);
              setSignatureRotation(firstSig.rotation);
              setSignatureColor(firstSig.color || '#ffffff');
            }
            if (txts.length > 0) {
              const firstTxt = txts[0];
              setTextY(firstTxt.y);
              setTextScale(firstTxt.scale);
              setTextColor(firstTxt.color || '#ffffff');
              setCustomText(firstTxt.text || t('storyDefaultText'));
            }
          }
          
          const stories = await getStories();
          const story = stories.find(s => s.id === storyId);
          if (story) {
            setCustomText(story.customText || t('storyDefaultText'));
            const anim = ANIMATIONS.find(a => a.id === story.template);
            if (anim) setSelectedAnimation(anim);
          }
        } catch (error) {
          console.error('Error loading story data:', error);
        } finally {
          setIsLoading(false);
        }
      } else {
        try {
          const sigs = params.signatureOverlays ? JSON.parse(params.signatureOverlays as string) : [];
          const txts = params.textOverlays ? JSON.parse(params.textOverlays as string) : [];
          console.log('📥 Story loaded from params:', { sigCount: sigs.length, txtCount: txts.length });
          if (sigs.length > 0) {
            console.log('📥 First signature:', { id: sigs[0].id, uri: sigs[0].uri?.substring(0, 50), color: sigs[0].color });
          }
          setSignatureOverlays(sigs);
          setTextOverlays(txts);
          if (sigs.length > 0) {
            const firstSig = sigs[0];
            setSignatureX(firstSig.x);
            setSignatureY(firstSig.y);
            setSignatureScale(firstSig.scale);
            setSignatureRotation(firstSig.rotation);
            setSignatureColor(firstSig.color || '#ffffff');
          }
          if (txts.length > 0) {
            const firstTxt = txts[0];
            console.log('📝 First text overlay:', { text: firstTxt.text, y: firstTxt.y, color: firstTxt.color });
            setTextY(firstTxt.y);
            setTextScale(firstTxt.scale);
            setTextColor(firstTxt.color || '#ffffff');
            setCustomText(firstTxt.text || t('storyDefaultText'));
          } else {
            setCustomText('');
          }
        } catch { }
      }
    };
    loadData();
  }, [storyId, sourceMemoryId, mode]);

  const handleBack = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.back();
  };

  const handlePlayPreview = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setIsAnimating(true);
  };

  const handleAnimationComplete = () => {
    setIsAnimating(false);
  };

  const handleExport = async () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    
    setIsExporting(true);
    
    try {
      let uri: string;
      
      if (Platform.OS === 'web') {
        if (!webContainerRef.current) {
          throw new Error('Web container ref not available');
        }
        const canvas = await html2canvas(webContainerRef.current, {
          useCORS: true,
          allowTaint: true,
          backgroundColor: '#000000',
        });
        uri = canvas.toDataURL('image/png');
      } else {
        if (!viewShotRef.current || typeof viewShotRef.current.capture !== 'function') {
          throw new Error('ViewShot ref not available');
        }
        uri = await viewShotRef.current.capture();
      }
      
      if (!uri) {
        throw new Error('Capture returned empty URI');
      }
      
      await saveStory({
        uri,
        template: selectedAnimation.id,
        customText,
        sourceMemoryId: params.memoryId as string,
      });
      
      alert(t('storySaved'));
    } catch (error) {
      console.error('Export error:', error instanceof Error ? error.message : error);
      alert(t('storyExportError'));
    } finally {
      setIsExporting(false);
    }
  };

  const handleShare = async () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    
    try {
      if (viewShotRef.current?.capture) {
        const uri = await viewShotRef.current.capture();
        setShareImageUri(uri);
      }
    } catch (error) {
      console.error('Share error:', error);
    }
    setShowShareModal(true);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <ArrowLeft size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('storyTitle')}</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.previewColumn}>
          <View ref={Platform.OS === 'web' ? webContainerRef as any : undefined}>
            <ViewShot ref={viewShotRef} options={{ format: 'png', quality: 1 }}>
              <StoryPreview
                imageUri={imageUri}
                animation={selectedAnimation}
                customText={customText}
                isAnimating={isAnimating}
                onAnimationComplete={handleAnimationComplete}
                defaultText={t('storyDefaultText')}
                signatureOverlays={signatureOverlays}
                textOverlays={textOverlays}
                signatureScale={signatureScale}
                signatureRotation={signatureRotation}
                signatureX={signatureX}
                signatureY={signatureY}
                signatureColor={signatureColor}
                textScale={textScale}
                textColor={textColor}
                textY={textY}
                interactive={!isAnimating}
                onSignatureChange={(s, r, x, y) => {
                  setSignatureScale(s);
                  setSignatureRotation(r);
                  setSignatureX(x);
                  setSignatureY(y);
                }}
                onTextChange={(s, y) => {
                  setTextScale(s);
                  setTextY(y);
                }}
                selectedSignatureIndex={selectedSignatureIndex}
                setSelectedSignatureIndex={setSelectedSignatureIndex}
                selectedTextIndex={selectedTextIndex}
                setSelectedTextIndex={setSelectedTextIndex}
              />
            </ViewShot>
          </View>

          <TouchableOpacity 
            style={styles.centeredPlayButton}
            onPress={handlePlayPreview}
            disabled={isAnimating}
            activeOpacity={0.8}
          >
            <Play size={24} color="#fff" fill="#fff" />
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('storyAnimation')}</Text>
          <View style={styles.templateGrid}>
            {ANIMATIONS.map((anim) => {
              const getIcon = () => {
                const iconProps = { size: 18, color: anim.textColor };
                switch(anim.id) {
                  case 'cinematic': return <Film {...iconProps} />;
                  case 'dramatic-zoom': return <Zap {...iconProps} />;
                  case 'bounce': return <Activity {...iconProps} />;
                  case 'pulse': return <Heart {...iconProps} />;
                  case 'slide-reveal': return <Layers {...iconProps} />;
                  case 'shake': return <Move {...iconProps} />;
                  case 'spin-zoom': return <RotateCw {...iconProps} />;
                  case 'float': return <Wind {...iconProps} />;
                  case 'heartbeat': return <Heart {...iconProps} />;
                  case 'swing': return <Sparkles {...iconProps} />;
                  default: return <Film {...iconProps} />;
                }
              };
              return (
                <TouchableOpacity
                  key={anim.id}
                  style={[
                    styles.templateCard,
                    selectedAnimation.id === anim.id && styles.templateCardActive,
                  ]}
                  onPress={() => {
                    setSelectedAnimation(anim);
                    setIsAnimating(true);
                  }}
                >
                  <LinearGradient
                    colors={anim.colors}
                    style={styles.templatePreview}
                  >
                    {getIcon()}
                  </LinearGradient>
                                  </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.exportSection}>
          <TouchableOpacity
            style={styles.shareIconButton}
            onPress={handleShare}
          >
            <Share2 size={28} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      <SocialShareModal
        visible={showShareModal}
        onClose={() => setShowShareModal(false)}
        imageUri={shareImageUri || ''}
        onSave={async () => {
          if (shareImageUri) {
            await saveStory({
              uri: shareImageUri,
              template: selectedAnimation.id,
              customText,
              sourceMemoryId: params.memoryId as string,
            });
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 50 : 16,
    paddingBottom: 16,
    backgroundColor: '#10B981',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  headerRight: {
    width: 40,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  storyPreviewContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  storyPreview: {
    width: STORY_WIDTH,
    height: STORY_HEIGHT,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  imageContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  storyImage: {
    width: '100%',
    height: '100%',
  },
  glowOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(100, 200, 255, 0.3)',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
  },
  textContainer: {
    position: 'absolute',
    bottom: 80,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  textContainerInteractive: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginLeft: -100,
    marginTop: 80,
  },
  selectionBorder: {
    position: 'absolute',
    top: -4,
    left: -4,
    right: -4,
    bottom: -4,
    borderWidth: 2,
    borderColor: '#10B981',
    borderRadius: 8,
    borderStyle: 'dashed',
  },
  customText: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 4,
  },
  watermark: {
    position: 'absolute',
    bottom: 20,
    right: 20,
  },
  watermarkText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '600',
  },
  playButton: {
    alignSelf: 'center',
    marginBottom: 20,
  },
  playButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  previewColumn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  centeredPlayButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  verticalColorPicker: {
    flexDirection: 'column',
    gap: 6,
  },
  smallColorOption: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#fff',
  },
  smallColorOptionActive: {
    borderColor: '#333',
    borderWidth: 3,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  textInput: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  slider: {
    width: '100%',
    height: 40,
  },
  sliderLabel: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
    marginBottom: 4,
  },
  hintText: {
    fontSize: 12,
    color: '#999',
    fontStyle: 'italic',
    marginTop: 8,
    marginBottom: 12,
    textAlign: 'center',
  },
  colorPicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 8,
  },
  colorOption: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#ddd',
  },
  colorOptionActive: {
    borderColor: '#10B981',
    borderWidth: 3,
  },
  categoryRow: {
    flexDirection: 'row',
    gap: 10,
  },
  categoryButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  categoryButtonActive: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  categoryButtonText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  categoryButtonTextActive: {
    color: '#fff',
  },
  templateGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
  },
  templateCard: {
    width: '18%',
    alignItems: 'center',
    padding: 6,
    borderRadius: 10,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: 'transparent',
    marginBottom: 4,
  },
  templateCardActive: {
    borderColor: '#10B981',
  },
  templatePreview: {
    width: 44,
    height: 58,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  minimalIcon: {
    width: 20,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.5)',
    borderRadius: 1,
  },
  templateLabel: {
    fontSize: 9,
    color: '#666',
    marginTop: 4,
    fontWeight: '500',
    textAlign: 'center',
  },
  exportSection: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 16,
  },
  exportButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  shareButton: {
    backgroundColor: '#10B981',
  },
  shareIconButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  exportButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
