import { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ScrollView, TextInput, Dimensions, Platform, ActivityIndicator } from 'react-native';
import Slider from '@react-native-community/slider';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Sparkles, Film, Layers, Share2, Download, Play } from 'lucide-react-native';
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
import html2canvas from 'html2canvas';
import * as Sharing from 'expo-sharing';
import { SignatureOverlay, TextOverlay, getAllMemories } from '@/utils/memoriesStorage';
import { saveStory, getStories } from '@/utils/storiesStorage';
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
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            style={{ width: '100%', height: '100%' }}
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
      
      console.log('🖊️ SignatureSvgContent SVG parsed:', { id: overlay.id, pathsCount: paths.length, width, height, displayWidth, displayHeight, color: signatureColor });
      
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
              strokeWidth={5}
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

type AnimationType = 'ken-burns' | 'sequential-zoom' | 'parallax';

interface Animation {
  id: AnimationType;
  nameKey: 'animKenBurns' | 'animSequentialZoom' | 'animParallax';
  colors: [string, string];
  textColor: string;
  overlayOpacity: number;
  hasGlow?: boolean;
}

const ANIMATIONS: Animation[] = [
  { 
    id: 'ken-burns', 
    nameKey: 'animKenBurns',
    colors: ['#1a1a2e', '#16213e'], 
    textColor: '#ffffff', 
    overlayOpacity: 0.3 
  },
  { 
    id: 'sequential-zoom', 
    nameKey: 'animSequentialZoom',
    colors: ['#2d3436', '#636e72'], 
    textColor: '#ffffff', 
    overlayOpacity: 0.35 
  },
  { 
    id: 'parallax', 
    nameKey: 'animParallax',
    colors: ['#0f0f0f', '#1a1a1a'], 
    textColor: '#ffffff', 
    overlayOpacity: 0.3,
    hasGlow: true
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
}) {
  const scale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const textOpacity = useSharedValue(0);
  const glowOpacity = useSharedValue(0);
  const bgScale = useSharedValue(1);
  const bgTranslateX = useSharedValue(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sigTranslateX = useSharedValue((signatureX - 0.5) * STORY_WIDTH);
  const sigTranslateY = useSharedValue((signatureY - 0.5) * STORY_HEIGHT);
  const sigScale = useSharedValue(signatureScale);
  const sigRotation = useSharedValue(signatureRotation);
  const savedSigTranslateX = useSharedValue((signatureX - 0.5) * STORY_WIDTH);
  const savedSigTranslateY = useSharedValue((signatureY - 0.5) * STORY_HEIGHT);
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
    sigTranslateX.value = (signatureX - 0.5) * STORY_WIDTH;
    sigTranslateY.value = (signatureY - 0.5) * STORY_HEIGHT;
    sigScale.value = signatureScale;
    sigRotation.value = signatureRotation;
    savedSigTranslateX.value = (signatureX - 0.5) * STORY_WIDTH;
    savedSigTranslateY.value = (signatureY - 0.5) * STORY_HEIGHT;
    savedSigScale.value = signatureScale;
    savedSigRotation.value = signatureRotation;
  }, [signatureX, signatureY, signatureScale, signatureRotation]);

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
      textOpacity.value = 0;
      glowOpacity.value = 0;
      bgScale.value = 1;
      bgTranslateX.value = 0;

      if (animation.id === 'ken-burns') {
        scale.value = withSequence(
          withTiming(1.2, { duration: 5000, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 5000, easing: Easing.inOut(Easing.ease) }),
          withRepeat(
            withSequence(
              withTiming(1.05, { duration: 2500, easing: Easing.inOut(Easing.ease) }),
              withTiming(1, { duration: 2500, easing: Easing.inOut(Easing.ease) })
            ),
            1,
            true
          )
        );
        translateY.value = withSequence(
          withTiming(0, { duration: 5000 }),
          withRepeat(
            withSequence(
              withTiming(-5, { duration: 2500, easing: Easing.inOut(Easing.ease) }),
              withTiming(5, { duration: 2500, easing: Easing.inOut(Easing.ease) })
            ),
            1,
            true
          )
        );
        textOpacity.value = withDelay(10000, withTiming(1, { duration: 500 }));
        
        if (onAnimationComplete) {
          timerRef.current = setTimeout(() => onAnimationComplete(), 15000);
        }
      } else if (animation.id === 'sequential-zoom') {
        scale.value = withSequence(
          withTiming(2, { duration: 4000, easing: Easing.out(Easing.ease) }),
          withDelay(500, withTiming(1, { duration: 3000, easing: Easing.inOut(Easing.ease) }))
        );
        translateY.value = withSequence(
          withTiming(-40, { duration: 4000, easing: Easing.out(Easing.ease) }),
          withDelay(500, withTiming(0, { duration: 3000, easing: Easing.inOut(Easing.ease) }))
        );
        textOpacity.value = withDelay(7000, withTiming(1, { duration: 500 }));
        
        if (onAnimationComplete) {
          timerRef.current = setTimeout(() => onAnimationComplete(), 8000);
        }
      } else if (animation.id === 'parallax') {
        bgScale.value = withTiming(1.1, { duration: 6000, easing: Easing.out(Easing.ease) });
        bgTranslateX.value = withTiming(-20, { duration: 6000, easing: Easing.out(Easing.ease) });
        scale.value = withSequence(
          withTiming(1.15, { duration: 3000, easing: Easing.out(Easing.ease) }),
          withTiming(1.1, { duration: 3000, easing: Easing.inOut(Easing.ease) })
        );
        glowOpacity.value = withDelay(1000, withTiming(0.6, { duration: 2000 }));
        textOpacity.value = withDelay(5000, withTiming(1, { duration: 500 }));
        
        if (onAnimationComplete) {
          timerRef.current = setTimeout(() => onAnimationComplete(), 7000);
        }
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
          {signatureOverlays.length > 0 && signatureOverlays.map((overlay, index) => {
            if (interactive && index === 0) return null;
            const isFirstNonInteractive = !interactive && index === 0;
            return (
              <StorySignature
                key={overlay.id}
                overlay={overlay}
                overrideX={isFirstNonInteractive ? signatureX : undefined}
                overrideY={isFirstNonInteractive ? signatureY : undefined}
                overrideScale={isFirstNonInteractive ? signatureScale : undefined}
                overrideRotation={isFirstNonInteractive ? signatureRotation : undefined}
                overrideColor={isFirstNonInteractive ? signatureColor : undefined}
              />
            );
          })}
          {!interactive && textOverlays.length > 0 && textOverlays.map((overlay, index) => (
            <View
              key={overlay.id}
              style={{
                position: 'absolute',
                left: `${overlay.x * 100}%`,
                top: `${(index === 0 ? textY : overlay.y) * 100}%`,
                transform: [
                  { translateX: -50 },
                  { scale: index === 0 ? textScale : overlay.scale },
                ],
              }}
            >
              <Text style={[styles.customText, { 
                color: index === 0 ? textColor : overlay.color, 
                fontSize: overlay.fontSize || 18,
                fontFamily: overlay.fontFamily,
              }]}>
                {overlay.text}
              </Text>
            </View>
          ))}
        </View>

        {animation.hasGlow && (
          <Animated.View style={[styles.glowOverlay, glowStyle]} />
        )}

        <View style={[styles.overlay, { opacity: animation.overlayOpacity }]} pointerEvents="none" />

        {interactive && signatureOverlays.length > 0 && signatureOverlays[0] && (() => {
          const RESULT_IMAGE_WIDTH = 402;
          const RESULT_IMAGE_HEIGHT = 874;
          const scaledX = (signatureOverlays[0].x / RESULT_IMAGE_WIDTH) * STORY_WIDTH;
          const scaledY = (signatureOverlays[0].y / RESULT_IMAGE_HEIGHT) * STORY_HEIGHT;
          console.log('🔶 Interactive signature 0 position:', { x: signatureOverlays[0].x, y: signatureOverlays[0].y, scaledX, scaledY, color: signatureOverlays[0].color });
          return (
            <GestureDetector key={signatureOverlays[0].id} gesture={signatureGesture}>
              <Animated.View
                style={[{
                  position: 'absolute',
                  left: scaledX,
                  top: scaledY,
                  zIndex: 20,
                  justifyContent: 'center',
                  alignItems: 'center',
                }, sigAnimatedStyle]}
              >
                <View style={styles.selectionBorder} />
                <SignatureSvgContent
                  overlay={signatureOverlays[0]}
                  color={signatureColor}
                />
              </Animated.View>
            </GestureDetector>
          );
        })()}

        {interactive ? (
          <GestureDetector gesture={textGesture}>
            <Animated.View style={[styles.textContainerInteractive, { zIndex: 15 }, txtAnimatedStyle]}>
              <View style={styles.selectionBorder} />
              <Text style={[styles.customText, { color: textColor, fontSize: 18 }]}>
                {customText || defaultText}
              </Text>
            </Animated.View>
          </GestureDetector>
        ) : (
          <Animated.View style={[styles.textContainer, textStyle, { top: `${textY * 100}%` }]}>
            <Text style={[styles.customText, { color: textColor, fontSize: 18 * textScale }]}>
              {customText || defaultText}
            </Text>
          </Animated.View>
        )}

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
  const [customText, setCustomText] = useState(t('storyDefaultText'));
  const [isAnimating, setIsAnimating] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  const [signatureScale, setSignatureScale] = useState(1);
  const [signatureRotation, setSignatureRotation] = useState(0);
  const [signatureX, setSignatureX] = useState(0.5);
  const [signatureY, setSignatureY] = useState(0.3);
  const [signatureColor, setSignatureColor] = useState('#ffffff');
  
  const [textScale, setTextScale] = useState(1);
  const [textColor, setTextColor] = useState('#ffffff');
  const [textY, setTextY] = useState(0.75);
  
  const COLORS = ['#ffffff', '#000000', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#ffa500', '#10B981'];

  useEffect(() => {
    const loadData = async () => {
      if (storyId && sourceMemoryId && (mode === 'edit' || mode === 'preview')) {
        setIsLoading(true);
        try {
          const memories = await getAllMemories();
          const memory = memories.find(m => m.id === sourceMemoryId);
          if (memory) {
            setImageUri(memory.uri);
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
            setTextY(firstTxt.y);
            setTextScale(firstTxt.scale);
            setTextColor(firstTxt.color || '#ffffff');
            setCustomText(firstTxt.text || t('storyDefaultText'));
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
        
        if (Platform.OS === 'web') {
          const response = await fetch(uri);
          const blob = await response.blob();
          const file = new File([blob], `signtouch-story-${Date.now()}.png`, { type: 'image/png' });
          
          if (navigator.share && navigator.canShare({ files: [file] })) {
            await navigator.share({
              files: [file],
              title: 'SignTouch Story',
            });
          } else {
            const link = document.createElement('a');
            link.href = uri;
            link.download = `signtouch-story-${Date.now()}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            alert(t('storySaved'));
          }
        } else if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri, {
            mimeType: 'image/png',
            dialogTitle: t('storyShareTitle'),
          });
        }
      }
    } catch (error) {
      console.error('Share error:', error);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <ArrowLeft size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('storyTitle')}</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
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
            />
          </ViewShot>
        </View>

        <TouchableOpacity 
          style={styles.playButton}
          onPress={handlePlayPreview}
          disabled={isAnimating}
          activeOpacity={0.8}
        >
          <View style={styles.playButtonInner}>
            <Play size={32} color="#fff" fill="#fff" />
          </View>
        </TouchableOpacity>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('storyCustomText')}</Text>
          <TextInput
            style={styles.textInput}
            value={customText}
            onChangeText={setCustomText}
            placeholder={t('storyDefaultText')}
            placeholderTextColor="#999"
          />
          
          <Text style={styles.hintText}>Glissez le texte pour le déplacer, ou utilisez les curseurs ci-dessous.</Text>
          
          <Text style={styles.sliderLabel}>Taille du texte</Text>
          <Slider
            style={styles.slider}
            minimumValue={0.5}
            maximumValue={2}
            value={textScale}
            onValueChange={setTextScale}
            minimumTrackTintColor="#10B981"
            maximumTrackTintColor="#ccc"
          />
          
          <Text style={styles.sliderLabel}>Couleur du texte</Text>
          <View style={styles.colorPicker}>
            {COLORS.map((color) => (
              <TouchableOpacity
                key={color}
                style={[
                  styles.colorOption,
                  { backgroundColor: color },
                  textColor === color && styles.colorOptionActive,
                ]}
                onPress={() => setTextColor(color)}
              />
            ))}
          </View>
        </View>

        {signatureOverlays.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Signature</Text>
            
            <Text style={styles.hintText}>Glissez la signature pour la déplacer, ou utilisez les curseurs ci-dessous.</Text>
            
            <Text style={styles.sliderLabel}>Taille</Text>
            <Slider
              style={styles.slider}
              minimumValue={0.3}
              maximumValue={3}
              value={signatureScale}
              onValueChange={setSignatureScale}
              minimumTrackTintColor="#10B981"
              maximumTrackTintColor="#ccc"
            />
            
            <Text style={styles.sliderLabel}>Rotation</Text>
            <Slider
              style={styles.slider}
              minimumValue={-Math.PI}
              maximumValue={Math.PI}
              value={signatureRotation}
              onValueChange={setSignatureRotation}
              minimumTrackTintColor="#10B981"
              maximumTrackTintColor="#ccc"
            />
            
            <Text style={styles.sliderLabel}>Couleur</Text>
            <View style={styles.colorPicker}>
              {COLORS.map((color) => (
                <TouchableOpacity
                  key={color}
                  style={[
                    styles.colorOption,
                    { backgroundColor: color },
                    signatureColor === color && styles.colorOptionActive,
                  ]}
                  onPress={() => setSignatureColor(color)}
                />
              ))}
            </View>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('storyAnimation')}</Text>
          <View style={styles.templateGrid}>
            {ANIMATIONS.map((anim) => (
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
                  {anim.id === 'ken-burns' && (
                    <Film size={16} color={anim.textColor} />
                  )}
                  {anim.id === 'sequential-zoom' && (
                    <Layers size={16} color={anim.textColor} />
                  )}
                  {anim.id === 'parallax' && (
                    <Sparkles size={16} color={anim.textColor} />
                  )}
                </LinearGradient>
                <Text style={styles.templateLabel}>{t(anim.nameKey)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.exportSection}>
          <TouchableOpacity
            style={styles.exportButton}
            onPress={handleExport}
            disabled={isExporting}
          >
            <Download size={20} color="#fff" />
            <Text style={styles.exportButtonText}>
              {isExporting ? t('storyExporting') : t('storySave')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.exportButton, styles.shareButton]}
            onPress={handleShare}
          >
            <Share2 size={20} color="#fff" />
            <Text style={styles.exportButtonText}>{t('storyShare')}</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
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
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
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
    gap: 12,
  },
  templateCard: {
    flex: 1,
    alignItems: 'center',
    padding: 8,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  templateCardActive: {
    borderColor: '#10B981',
  },
  templatePreview: {
    width: 60,
    height: 80,
    borderRadius: 8,
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
    fontSize: 12,
    color: '#666',
    marginTop: 8,
    fontWeight: '500',
  },
  exportSection: {
    flexDirection: 'row',
    gap: 12,
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
    backgroundColor: '#3b82f6',
  },
  exportButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
