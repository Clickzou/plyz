import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated,
  Dimensions, Platform, Modal
} from 'react-native';
import {
  Newspaper, Search, Camera, Radio, Inbox, User,
  ChevronRight, X
} from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useLanguage } from '@/contexts/LanguageContext';

const { width, height } = Dimensions.get('window');
const ONBOARDING_KEY = '@signtouch_onboarding_done';

interface TooltipStep {
  tabIndex: number;
  titleKey: string;
  descKey: string;
  titleFallback: string;
  descFallback: string;
  icon: React.ReactNode;
  color: string;
  arrowPosition: 'left' | 'center-left' | 'center' | 'center-right' | 'right' | 'far-right';
}

const STEPS: TooltipStep[] = [
  {
    tabIndex: 0,
    titleKey: 'onboardingFeedTitle',
    descKey: 'onboardingFeedDesc',
    titleFallback: 'Activity Feed',
    descFallback: 'Stay up to date with the latest news, posts, and upcoming events from your favorite celebrities.',
    icon: <Newspaper size={20} color="#10b981" strokeWidth={2} />,
    color: '#10b981',
    arrowPosition: 'left',
  },
  {
    tabIndex: 1,
    titleKey: 'onboardingDiscoverTitle',
    descKey: 'onboardingDiscoverDesc',
    titleFallback: 'Discover Celebrities',
    descFallback: 'Browse the celebrity wall, search by name, and find verified stars to follow and interact with.',
    icon: <Search size={20} color="#3b82f6" strokeWidth={2} />,
    color: '#3b82f6',
    arrowPosition: 'center-left',
  },
  {
    tabIndex: 2,
    titleKey: 'onboardingCameraTitle',
    descKey: 'onboardingCameraDesc',
    titleFallback: 'Capture Memories',
    descFallback: 'Take photos, add signatures, text overlays, and create unique personalized memories to keep forever.',
    icon: <Camera size={20} color="#10b981" strokeWidth={2} />,
    color: '#10b981',
    arrowPosition: 'center',
  },
  {
    tabIndex: 3,
    titleKey: 'onboardingLiveTitle',
    descKey: 'onboardingLiveDesc',
    titleFallback: 'Live Sessions',
    descFallback: 'Join live video calls with celebrities, get personalized dedications, and collect exclusive autographs in real time.',
    icon: <Radio size={20} color="#6366f1" strokeWidth={2} />,
    color: '#6366f1',
    arrowPosition: 'center-right',
  },
  {
    tabIndex: 4,
    titleKey: 'onboardingMySpaceTitle',
    descKey: 'onboardingMySpaceDesc',
    titleFallback: 'My Space',
    descFallback: 'Find all your bookings, autograph requests, and collected dedications in one place.',
    icon: <Inbox size={20} color="#10b981" strokeWidth={2} />,
    color: '#10b981',
    arrowPosition: 'right',
  },
  {
    tabIndex: 5,
    titleKey: 'onboardingAccountTitle',
    descKey: 'onboardingAccountDesc',
    titleFallback: 'Account',
    descFallback: 'Manage your profile, switch to Celebrity Mode, change language, and access settings.',
    icon: <User size={20} color="#10b981" strokeWidth={2} />,
    color: '#10b981',
    arrowPosition: 'far-right',
  },
];

const ARROW_POSITIONS: Record<string, number> = {
  'left': width * 0.08,
  'center-left': width * 0.22,
  'center': width * 0.5,
  'center-right': width * 0.62,
  'right': width * 0.78,
  'far-right': width * 0.92,
};

const HIGHLIGHT_POSITIONS: Record<string, number> = {
  'left': width * 0.08,
  'center-left': width * 0.22,
  'center': width * 0.5,
  'center-right': width * 0.62,
  'right': width * 0.78,
  'far-right': width * 0.92,
};

interface Props {
  visible: boolean;
  onDone: () => void;
}

export default function OnboardingTooltip({ visible, onDone }: Props) {
  const { t } = useLanguage();
  const [step, setStep] = useState(0);
  const tooltipOpacity = useRef(new Animated.Value(0)).current;
  const tooltipScale = useRef(new Animated.Value(0.85)).current;
  const highlightPulse = useRef(new Animated.Value(1)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.timing(overlayOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
      animateIn();
    }
  }, [visible]);

  useEffect(() => {
    if (visible) {
      animateIn();
      startPulse();
    }
  }, [step]);

  const animateIn = () => {
    tooltipOpacity.setValue(0);
    tooltipScale.setValue(0.85);

    Animated.parallel([
      Animated.timing(tooltipOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.spring(tooltipScale, {
        toValue: 1,
        friction: 6,
        tension: 80,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const startPulse = () => {
    highlightPulse.setValue(1);
    Animated.loop(
      Animated.sequence([
        Animated.timing(highlightPulse, {
          toValue: 1.3,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(highlightPulse, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    ).start();
  };

  const handleNext = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    Animated.timing(tooltipOpacity, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(() => {
      if (step < STEPS.length - 1) {
        setStep(step + 1);
      } else {
        handleDone();
      }
    });
  }, [step]);

  const handleDone = async () => {
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    Animated.timing(overlayOpacity, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      onDone();
    });
  };

  const handleSkip = async () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    Animated.timing(overlayOpacity, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      onDone();
    });
  };

  if (!visible) return null;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const arrowX = ARROW_POSITIONS[current.arrowPosition];
  const highlightX = HIGHLIGHT_POSITIONS[current.arrowPosition];

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent>
      <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}>
        <TouchableOpacity style={styles.overlayTouch} activeOpacity={1} onPress={handleNext}>
          <View style={styles.topArea} />

          <View style={styles.skipContainer}>
            <TouchableOpacity onPress={handleSkip} style={styles.skipBtn} activeOpacity={0.7}>
              <X size={18} color="#fff" />
              <Text style={styles.skipText}>{t('skip' as any) || 'Skip'}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.counterContainer}>
            <Text style={styles.counterText}>{step + 1} / {STEPS.length}</Text>
          </View>

          <View style={styles.tooltipArea}>
            <Animated.View
              style={[
                styles.tooltipCard,
                {
                  opacity: tooltipOpacity,
                  transform: [{ scale: tooltipScale }],
                  borderColor: current.color + '40',
                },
              ]}
            >
              <View style={[styles.tooltipHeader, { borderBottomColor: current.color + '20' }]}>
                <View style={[styles.tooltipIconWrap, { backgroundColor: current.color + '15' }]}>
                  {current.icon}
                </View>
                <Text style={styles.tooltipTitle}>
                  {t(current.titleKey as any) || current.titleFallback}
                </Text>
              </View>
              <Text style={styles.tooltipDesc}>
                {t(current.descKey as any) || current.descFallback}
              </Text>
              <TouchableOpacity
                onPress={handleNext}
                style={[styles.tooltipBtn, { backgroundColor: current.color }]}
                activeOpacity={0.8}
              >
                <Text style={styles.tooltipBtnText}>
                  {isLast ? (t('getStarted' as any) || "Let's go!") : (t('next' as any) || 'Next')}
                </Text>
                {!isLast && <ChevronRight size={16} color="#fff" />}
              </TouchableOpacity>
            </Animated.View>

            <View style={[styles.arrowDown, { left: arrowX - 10, borderTopColor: '#1a1a2e' }]} />
          </View>

          <View style={styles.bottomNavPlaceholder}>
            <Animated.View
              style={[
                styles.highlightDot,
                {
                  left: highlightX - 20,
                  backgroundColor: current.color,
                  transform: [{ scale: highlightPulse }],
                },
              ]}
            />
            <Animated.View
              style={[
                styles.highlightRing,
                {
                  left: highlightX - 25,
                  borderColor: current.color,
                  transform: [{ scale: highlightPulse }],
                  opacity: Animated.multiply(
                    highlightPulse.interpolate({
                      inputRange: [1, 1.3],
                      outputRange: [0.6, 0],
                    }),
                    new Animated.Value(1)
                  ),
                },
              ]}
            />
          </View>

          <View style={styles.dotsRow}>
            {STEPS.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  i === step && [styles.dotActive, { backgroundColor: current.color }],
                ]}
              />
            ))}
          </View>
        </TouchableOpacity>
      </Animated.View>
    </Modal>
  );
}

const BOTTOM_NAV_H = 85;

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
  },
  overlayTouch: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  topArea: {
    flex: 1,
  },
  skipContainer: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 55 : 35,
    right: 20,
    zIndex: 10,
  },
  skipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  skipText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  counterContainer: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 58 : 38,
    left: 20,
    zIndex: 10,
  },
  counterText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    fontWeight: '600',
  },
  tooltipArea: {
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  tooltipCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  tooltipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
  },
  tooltipIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tooltipTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
    flex: 1,
  },
  tooltipDesc: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    lineHeight: 20,
    marginBottom: 14,
  },
  tooltipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 24,
    alignSelf: 'flex-end',
  },
  tooltipBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  arrowDown: {
    width: 0,
    height: 0,
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderTopWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    marginTop: -1,
  },
  bottomNavPlaceholder: {
    height: BOTTOM_NAV_H,
    position: 'relative',
  },
  highlightDot: {
    position: 'absolute',
    top: 8,
    width: 40,
    height: 40,
    borderRadius: 20,
    opacity: 0.3,
  },
  highlightRing: {
    position: 'absolute',
    top: 3,
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 2,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    paddingBottom: Platform.OS === 'ios' ? 30 : 15,
    backgroundColor: 'transparent',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  dotActive: {
    width: 18,
  },
});
