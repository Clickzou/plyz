import { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ScrollView, TextInput, Dimensions, Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Sparkles, Film, Layers, Share2, Download } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withTiming, 
  withSequence,
  withDelay,
  withRepeat,
  Easing,
} from 'react-native-reanimated';
import { useLanguage } from '@/contexts/LanguageContext';
import ViewShot from 'react-native-view-shot';
import * as MediaLibrary from 'expo-media-library';
import html2canvas from 'html2canvas';
import * as Sharing from 'expo-sharing';
import { SignatureOverlay, TextOverlay } from '@/utils/memoriesStorage';
import { saveStory } from '@/utils/storiesStorage';

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
}: { 
  imageUri: string; 
  animation: Animation; 
  customText: string;
  isAnimating: boolean;
  onAnimationComplete?: () => void;
  defaultText: string;
  signatureOverlays?: SignatureOverlay[];
  textOverlays?: TextOverlay[];
}) {
  const scale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const textOpacity = useSharedValue(0);
  const glowOpacity = useSharedValue(0);
  const bgScale = useSharedValue(1);
  const bgTranslateX = useSharedValue(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
          {signatureOverlays.map((overlay) => (
            <Image
              key={overlay.id}
              source={{ uri: overlay.uri }}
              style={{
                position: 'absolute',
                left: `${overlay.x * 100}%`,
                top: `${overlay.y * 100}%`,
                width: overlay.width || 100,
                height: overlay.height || 50,
                transform: [
                  { scale: overlay.scale || 1 },
                  { rotate: `${overlay.rotation || 0}rad` },
                ],
                tintColor: overlay.color,
              }}
              resizeMode="contain"
            />
          ))}
          {textOverlays.map((overlay) => (
            <Text
              key={overlay.id}
              style={{
                position: 'absolute',
                left: `${overlay.x * 100}%`,
                top: `${overlay.y * 100}%`,
                color: overlay.color,
                fontFamily: overlay.fontFamily,
                fontSize: (overlay.fontSize || 16) * (overlay.scale || 1),
                transform: [{ rotate: `${overlay.rotation || 0}rad` }],
              }}
            >
              {overlay.text}
            </Text>
          ))}
        </View>

        {animation.hasGlow && (
          <Animated.View style={[styles.glowOverlay, glowStyle]} />
        )}

        <View style={[styles.overlay, { opacity: animation.overlayOpacity }]} />

        <Animated.View style={[styles.textContainer, textStyle]}>
          <Text style={[styles.customText, { color: animation.textColor }]}>
            {customText || defaultText}
          </Text>
        </Animated.View>

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

  const imageUri = params.imageUri as string || '';
  
  const signatureOverlays: SignatureOverlay[] = useMemo(() => {
    try {
      return params.signatureOverlays ? JSON.parse(params.signatureOverlays as string) : [];
    } catch { return []; }
  }, [params.signatureOverlays]);
  
  const textOverlays: TextOverlay[] = useMemo(() => {
    try {
      return params.textOverlays ? JSON.parse(params.textOverlays as string) : [];
    } catch { return []; }
  }, [params.textOverlays]);

  const [selectedAnimation, setSelectedAnimation] = useState<Animation>(ANIMATIONS[0]);
  const [customText, setCustomText] = useState(t('storyDefaultText'));
  const [isAnimating, setIsAnimating] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

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
            />
          </ViewShot>
        </View>

        <TouchableOpacity 
          style={styles.previewButton}
          onPress={handlePlayPreview}
          disabled={isAnimating}
        >
          <Film size={20} color="#fff" />
          <Text style={styles.previewButtonText}>
            {isAnimating ? t('storyPreviewPlaying') : t('storyPreview')}
          </Text>
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
        </View>

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
                onPress={() => setSelectedAnimation(anim)}
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
    overflow: 'hidden',
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
  previewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 25,
    marginBottom: 20,
    gap: 8,
  },
  previewButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
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
