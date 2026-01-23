import { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ScrollView, TextInput, Dimensions, Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Sparkles, Film, Clock, Share2, Download } from 'lucide-react-native';
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
import * as Sharing from 'expo-sharing';
import { SignatureOverlay, TextOverlay } from '@/utils/memoriesStorage';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const STORY_WIDTH = SCREEN_WIDTH * 0.7;
const STORY_HEIGHT = STORY_WIDTH * (16 / 9);

type TemplateCategory = 'concert' | 'sport' | 'meetup';
type TemplateStyle = 'minimal' | 'flashy' | 'vintage';

interface Template {
  id: string;
  name: string;
  style: TemplateStyle;
  category: TemplateCategory;
  colors: [string, string];
  textColor: string;
  overlayOpacity: number;
  confetti?: boolean;
  grain?: boolean;
}

const TEMPLATES: Template[] = [
  { id: 'concert-minimal', name: 'Concert Minimal', style: 'minimal', category: 'concert', colors: ['#1a1a2e', '#16213e'], textColor: '#ffffff', overlayOpacity: 0.3 },
  { id: 'concert-flashy', name: 'Concert Flashy', style: 'flashy', category: 'concert', colors: ['#ff006e', '#8338ec'], textColor: '#ffffff', overlayOpacity: 0.4, confetti: true },
  { id: 'concert-vintage', name: 'Concert Vintage', style: 'vintage', category: 'concert', colors: ['#2d1b0e', '#5c3a21'], textColor: '#f5e6d3', overlayOpacity: 0.5, grain: true },
  { id: 'sport-minimal', name: 'Sport Minimal', style: 'minimal', category: 'sport', colors: ['#0f0f0f', '#1a1a1a'], textColor: '#ffffff', overlayOpacity: 0.3 },
  { id: 'sport-flashy', name: 'Sport Flashy', style: 'flashy', category: 'sport', colors: ['#00f5d4', '#00bbf9'], textColor: '#000000', overlayOpacity: 0.4, confetti: true },
  { id: 'sport-vintage', name: 'Sport Vintage', style: 'vintage', category: 'sport', colors: ['#3d2914', '#6b4423'], textColor: '#f0e4d7', overlayOpacity: 0.5, grain: true },
  { id: 'meetup-minimal', name: 'Meetup Minimal', style: 'minimal', category: 'meetup', colors: ['#2d3436', '#636e72'], textColor: '#ffffff', overlayOpacity: 0.3 },
  { id: 'meetup-flashy', name: 'Meetup Flashy', style: 'flashy', category: 'meetup', colors: ['#f72585', '#7209b7'], textColor: '#ffffff', overlayOpacity: 0.4, confetti: true },
  { id: 'meetup-vintage', name: 'Meetup Vintage', style: 'vintage', category: 'meetup', colors: ['#4a3728', '#6d5344'], textColor: '#ede0d4', overlayOpacity: 0.5, grain: true },
];


function ConfettiParticle({ delay, x }: { delay: number; x: number }) {
  const translateY = useSharedValue(-20);
  const opacity = useSharedValue(0);
  const rotate = useSharedValue(0);

  useEffect(() => {
    opacity.value = withDelay(delay, withTiming(1, { duration: 300 }));
    translateY.value = withDelay(
      delay,
      withRepeat(
        withTiming(STORY_HEIGHT + 50, { duration: 3000, easing: Easing.linear }),
        -1,
        false
      )
    );
    rotate.value = withDelay(
      delay,
      withRepeat(
        withTiming(360, { duration: 2000, easing: Easing.linear }),
        -1,
        false
      )
    );
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value },
      { rotate: `${rotate.value}deg` },
    ],
    opacity: opacity.value,
  }));

  const colors = ['#ff006e', '#8338ec', '#00f5d4', '#ffbe0b', '#fb5607'];
  const color = colors[Math.floor(Math.random() * colors.length)];

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: x,
          width: 8,
          height: 8,
          backgroundColor: color,
          borderRadius: 2,
        },
        style,
      ]}
    />
  );
}

function StoryPreview({ 
  imageUri, 
  template, 
  customText,
  isAnimating,
  onAnimationComplete,
  defaultText,
  signatureOverlays = [],
  textOverlays = [],
}: { 
  imageUri: string; 
  template: Template; 
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
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isAnimating) {
      scale.value = 1;
      translateX.value = 0;
      translateY.value = 0;
      textOpacity.value = 0;

      scale.value = withSequence(
        withTiming(2.5, { duration: 3000, easing: Easing.out(Easing.ease) }),
        withDelay(500, withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) }))
      );

      translateY.value = withSequence(
        withTiming(-50, { duration: 3000, easing: Easing.out(Easing.ease) }),
        withDelay(500, withTiming(0, { duration: 2000, easing: Easing.inOut(Easing.ease) }))
      );

      textOpacity.value = withDelay(
        5000,
        withTiming(1, { duration: 500 })
      );

      if (onAnimationComplete) {
        timerRef.current = setTimeout(() => {
          onAnimationComplete();
        }, 6000);
      }
    } else {
      scale.value = 1;
      translateX.value = 0;
      translateY.value = 0;
      textOpacity.value = 1;
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [isAnimating]);

  const imageStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value },
      { translateX: translateX.value },
      { translateY: translateY.value },
    ],
  }));

  const textStyle = useAnimatedStyle(() => ({
    opacity: textOpacity.value,
  }));

  return (
    <View style={styles.storyPreviewContainer}>
      <LinearGradient
        colors={template.colors}
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

        {template.confetti && (
          <View style={styles.confettiContainer}>
            {Array.from({ length: 15 }).map((_, i) => (
              <ConfettiParticle
                key={i}
                delay={i * 200}
                x={Math.random() * STORY_WIDTH}
              />
            ))}
          </View>
        )}

        {template.grain && (
          <View style={[styles.grainOverlay, { opacity: 0.1 }]} />
        )}

        <View style={[styles.overlay, { opacity: template.overlayOpacity }]} />

        <Animated.View style={[styles.textContainer, textStyle]}>
          <Text style={[styles.customText, { color: template.textColor }]}>
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

  const imageUri = params.imageUri as string || '';
  const eventType = (params.eventType as TemplateCategory) || 'meetup';
  
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

  const categoryLabels: Record<TemplateCategory, string> = useMemo(() => ({
    concert: t('storyConcert'),
    sport: t('storySport'),
    meetup: t('storyMeetup'),
  }), [t]);

  const styleLabels: Record<TemplateStyle, string> = useMemo(() => ({
    minimal: t('storyMinimal'),
    flashy: t('storyFlashy'),
    vintage: t('storyVintage'),
  }), [t]);

  const [selectedCategory, setSelectedCategory] = useState<TemplateCategory>(eventType);
  const [selectedTemplate, setSelectedTemplate] = useState<Template>(
    TEMPLATES.find(tmpl => tmpl.category === eventType && tmpl.style === 'minimal') || TEMPLATES[0]
  );
  const [customText, setCustomText] = useState(t('storyDefaultText'));
  const [isAnimating, setIsAnimating] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const filteredTemplates = TEMPLATES.filter(t => t.category === selectedCategory);

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
      if (viewShotRef.current?.capture) {
        const uri = await viewShotRef.current.capture();
        
        if (Platform.OS === 'web') {
          const link = document.createElement('a');
          link.href = uri;
          link.download = `signtouch-story-${Date.now()}.png`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          alert(t('storySaved'));
        } else {
          const { status } = await MediaLibrary.requestPermissionsAsync();
          if (status === 'granted') {
            await MediaLibrary.saveToLibraryAsync(uri);
            alert(t('storySaved'));
          }
        }
      }
    } catch (error) {
      console.error('Export error:', error);
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
        <ViewShot ref={viewShotRef} options={{ format: 'png', quality: 1 }}>
          <StoryPreview
            imageUri={imageUri}
            template={selectedTemplate}
            customText={customText}
            isAnimating={isAnimating}
            onAnimationComplete={handleAnimationComplete}
            defaultText={t('storyDefaultText')}
            signatureOverlays={signatureOverlays}
            textOverlays={textOverlays}
          />
        </ViewShot>

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
          <Text style={styles.sectionTitle}>{t('storyCategory')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.categoryRow}>
              {(Object.keys(categoryLabels) as TemplateCategory[]).map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[
                    styles.categoryButton,
                    selectedCategory === cat && styles.categoryButtonActive,
                  ]}
                  onPress={() => {
                    setSelectedCategory(cat);
                    const newTemplate = TEMPLATES.find(tmpl => tmpl.category === cat && tmpl.style === selectedTemplate.style);
                    if (newTemplate) setSelectedTemplate(newTemplate);
                  }}
                >
                  <Text
                    style={[
                      styles.categoryButtonText,
                      selectedCategory === cat && styles.categoryButtonTextActive,
                    ]}
                  >
                    {categoryLabels[cat]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('storyStyle')}</Text>
          <View style={styles.templateGrid}>
            {filteredTemplates.map((tmpl) => (
              <TouchableOpacity
                key={tmpl.id}
                style={[
                  styles.templateCard,
                  selectedTemplate.id === tmpl.id && styles.templateCardActive,
                ]}
                onPress={() => setSelectedTemplate(tmpl)}
              >
                <LinearGradient
                  colors={tmpl.colors}
                  style={styles.templatePreview}
                >
                  {tmpl.confetti && (
                    <Sparkles size={16} color={tmpl.textColor} />
                  )}
                  {tmpl.grain && (
                    <Clock size={16} color={tmpl.textColor} />
                  )}
                  {!tmpl.confetti && !tmpl.grain && (
                    <View style={styles.minimalIcon} />
                  )}
                </LinearGradient>
                <Text style={styles.templateLabel}>{styleLabels[tmpl.style]}</Text>
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
  confettiContainer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  grainOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
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
