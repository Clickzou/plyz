import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated,
  Dimensions, Platform, Modal
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Newspaper, Search, Camera, Radio, Inbox, User, Star,
  ChevronRight, ChevronLeft, X, Sparkles
} from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useLanguage } from '@/contexts/LanguageContext';

const { width, height } = Dimensions.get('window');
const ONBOARDING_KEY = '@signtouch_onboarding_done';

interface OnboardingStep {
  icon: React.ReactNode;
  color: string;
  gradientColors: [string, string, string];
  titleKey: string;
  descKey: string;
  titleFallback: string;
  descFallback: string;
}

const STEPS: OnboardingStep[] = [
  {
    icon: <Sparkles size={56} color="#fff" strokeWidth={1.5} />,
    color: '#10b981',
    gradientColors: ['#064e3b', '#10b981', '#059669'],
    titleKey: 'onboardingWelcomeTitle',
    descKey: 'onboardingWelcomeDesc',
    titleFallback: 'Welcome to SignTouch!',
    descFallback: 'Discover a unique experience that connects you with your favorite celebrities through autographs, live events, and personalized video calls.',
  },
  {
    icon: <Newspaper size={56} color="#fff" strokeWidth={1.5} />,
    color: '#10b981',
    gradientColors: ['#022c22', '#065f46', '#10b981'],
    titleKey: 'onboardingFeedTitle',
    descKey: 'onboardingFeedDesc',
    titleFallback: 'Activity Feed',
    descFallback: 'Stay up to date with the latest news, posts, and upcoming events from your favorite celebrities.',
  },
  {
    icon: <Search size={56} color="#fff" strokeWidth={1.5} />,
    color: '#3b82f6',
    gradientColors: ['#1e1b4b', '#3b82f6', '#6366f1'],
    titleKey: 'onboardingDiscoverTitle',
    descKey: 'onboardingDiscoverDesc',
    titleFallback: 'Discover Celebrities',
    descFallback: 'Browse the celebrity wall, search by name, and find verified stars to follow and interact with.',
  },
  {
    icon: <Camera size={56} color="#fff" strokeWidth={1.5} />,
    color: '#10b981',
    gradientColors: ['#064e3b', '#059669', '#10b981'],
    titleKey: 'onboardingCameraTitle',
    descKey: 'onboardingCameraDesc',
    titleFallback: 'Capture Memories',
    descFallback: 'Take photos, add signatures, text overlays, and create unique personalized memories to keep forever.',
  },
  {
    icon: <Radio size={56} color="#fff" strokeWidth={1.5} />,
    color: '#6366f1',
    gradientColors: ['#1e1b4b', '#4f46e5', '#6366f1'],
    titleKey: 'onboardingLiveTitle',
    descKey: 'onboardingLiveDesc',
    titleFallback: 'Live Sessions',
    descFallback: 'Join live video calls with celebrities, get personalized dedications, and collect exclusive autographs in real time.',
  },
  {
    icon: <Star size={56} color="#f59e0b" strokeWidth={1.5} />,
    color: '#f59e0b',
    gradientColors: ['#451a03', '#b45309', '#f59e0b'],
    titleKey: 'onboardingCelebrityTitle',
    descKey: 'onboardingCelebrityDesc',
    titleFallback: 'Celebrity Mode',
    descFallback: 'Are you a public figure? Activate Celebrity Mode to create events, host live sessions, and connect with your fans!',
  },
];

interface Props {
  visible: boolean;
  onDone: () => void;
}

export default function OnboardingTutorial({ visible, onDone }: Props) {
  const { t } = useLanguage();
  const [step, setStep] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;
  const iconScale = useRef(new Animated.Value(0)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      animateIn();
    }
  }, [visible, step]);

  const animateIn = () => {
    iconScale.setValue(0);
    contentOpacity.setValue(0);
    slideAnim.setValue(30);

    Animated.parallel([
      Animated.spring(iconScale, {
        toValue: 1,
        friction: 5,
        tension: 60,
        useNativeDriver: true,
      }),
      Animated.timing(contentOpacity, {
        toValue: 1,
        duration: 500,
        delay: 200,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 400,
        delay: 200,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const goToStep = (nextStep: number) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      setStep(nextStep);
      fadeAnim.setValue(1);
    });
  };

  const handleNext = () => {
    if (step < STEPS.length - 1) {
      goToStep(step + 1);
    } else {
      handleDone();
    }
  };

  const handlePrev = () => {
    if (step > 0) {
      goToStep(step - 1);
    }
  };

  const handleDone = async () => {
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    onDone();
  };

  const handleSkip = async () => {
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    onDone();
  };

  if (!visible) return null;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <Modal visible={visible} animationType="fade" transparent={false} statusBarTranslucent>
      <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
        <LinearGradient
          colors={current.gradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />

        <View style={styles.bgOrb1} />
        <View style={styles.bgOrb2} />

        <View style={styles.header}>
          <TouchableOpacity onPress={handleSkip} style={styles.skipBtn} activeOpacity={0.7}>
            <Text style={styles.skipText}>{t('skip' as any) || 'Skip'}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.body}>
          <Animated.View
            style={[
              styles.iconWrap,
              {
                transform: [{ scale: iconScale }],
              },
            ]}
          >
            <View style={styles.iconCircle}>
              {current.icon}
            </View>
          </Animated.View>

          <Animated.View
            style={[
              styles.textWrap,
              {
                opacity: contentOpacity,
                transform: [{ translateY: slideAnim }],
              },
            ]}
          >
            <Text style={styles.title}>
              {t(current.titleKey as any) || current.titleFallback}
            </Text>
            <Text style={styles.description}>
              {t(current.descKey as any) || current.descFallback}
            </Text>
          </Animated.View>
        </View>

        <View style={styles.footer}>
          <View style={styles.dots}>
            {STEPS.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  i === step && styles.dotActive,
                ]}
              />
            ))}
          </View>

          <View style={styles.navRow}>
            {step > 0 ? (
              <TouchableOpacity onPress={handlePrev} style={styles.prevBtn} activeOpacity={0.7}>
                <ChevronLeft size={20} color="#fff" />
                <Text style={styles.prevText}>{t('previous' as any) || 'Back'}</Text>
              </TouchableOpacity>
            ) : (
              <View style={{ width: 80 }} />
            )}

            <TouchableOpacity
              onPress={handleNext}
              style={[styles.nextBtn, isLast && styles.doneBtn]}
              activeOpacity={0.7}
            >
              <Text style={[styles.nextText, isLast && styles.doneText]}>
                {isLast ? (t('getStarted' as any) || "Let's go!") : (t('next' as any) || 'Next')}
              </Text>
              {!isLast && <ChevronRight size={20} color="#fff" />}
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  bgOrb1: {
    position: 'absolute',
    width: width * 1.2,
    height: width * 1.2,
    borderRadius: width * 0.6,
    backgroundColor: 'rgba(255,255,255,0.04)',
    top: -width * 0.4,
    right: -width * 0.3,
  },
  bgOrb2: {
    position: 'absolute',
    width: width * 0.8,
    height: width * 0.8,
    borderRadius: width * 0.4,
    backgroundColor: 'rgba(0,0,0,0.06)',
    bottom: -width * 0.2,
    left: -width * 0.2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingHorizontal: 20,
  },
  skipBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  skipText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  body: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  iconWrap: {
    marginBottom: 40,
  },
  iconCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  textWrap: {
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 16,
    letterSpacing: -0.5,
  },
  description: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
    lineHeight: 24,
    maxWidth: 320,
  },
  footer: {
    paddingBottom: Platform.OS === 'ios' ? 50 : 30,
    paddingHorizontal: 24,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 24,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  dotActive: {
    backgroundColor: '#fff',
    width: 24,
  },
  navRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  prevBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  prevText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 15,
    fontWeight: '500',
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  nextText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  doneBtn: {
    backgroundColor: '#fff',
    borderColor: '#fff',
  },
  doneText: {
    color: '#064e3b',
  },
});
