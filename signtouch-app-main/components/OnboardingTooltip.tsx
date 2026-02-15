import React, { useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated,
  Dimensions, Platform, Pressable
} from 'react-native';
import {
  Newspaper, Search, Camera, Radio, Inbox, User,
  ChevronRight, X
} from 'lucide-react-native';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { useLanguage } from '@/contexts/LanguageContext';

const { width } = Dimensions.get('window');

const TAB_COUNT = 6;
const TAB_WIDTH = width / TAB_COUNT;

const ICONS: Record<string, React.ReactNode> = {
  onboardingFeedTitle: <Newspaper size={20} color="#10b981" strokeWidth={2} />,
  onboardingDiscoverTitle: <Search size={20} color="#3b82f6" strokeWidth={2} />,
  onboardingCameraTitle: <Camera size={20} color="#10b981" strokeWidth={2} />,
  onboardingLiveTitle: <Radio size={20} color="#6366f1" strokeWidth={2} />,
  onboardingMySpaceTitle: <Inbox size={20} color="#10b981" strokeWidth={2} />,
  onboardingAccountTitle: <User size={20} color="#10b981" strokeWidth={2} />,
};

export default function OnboardingOverlay() {
  const { isOnboarding, currentStep, totalSteps, currentStepData, nextStep, skipOnboarding } = useOnboarding();
  const { t } = useLanguage();
  const tooltipOpacity = useRef(new Animated.Value(0)).current;
  const tooltipScale = useRef(new Animated.Value(0.85)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isOnboarding && currentStepData) {
      overlayOpacity.setValue(0);
      tooltipOpacity.setValue(0);
      tooltipScale.setValue(0.85);
      pulseAnim.setValue(1);

      Animated.timing(overlayOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();

      const timer = setTimeout(() => {
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
      }, 400);

      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.4,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();

      return () => {
        clearTimeout(timer);
        pulse.stop();
      };
    }
  }, [isOnboarding, currentStep]);

  if (!isOnboarding || !currentStepData) return null;

  const isLast = currentStep === totalSteps - 1;
  const icon = ICONS[currentStepData.titleKey];
  const highlightX = TAB_WIDTH * currentStepData.highlightPosition + TAB_WIDTH / 2;
  const tooltipW = Math.min(300, width - 32);
  const tooltipLeft = Math.max(16, Math.min(highlightX - tooltipW / 2, width - tooltipW - 16));
  const arrowLeft = highlightX - tooltipLeft - 8;

  return (
    <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}>
      <Pressable onPress={nextStep} style={styles.touchBlocker}>
          <View style={styles.skipContainer}>
            <TouchableOpacity onPress={skipOnboarding} style={styles.skipBtn} activeOpacity={0.7}>
              <X size={16} color="#fff" />
              <Text style={styles.skipText}>{t('skip' as any) || 'Skip'}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.counterContainer}>
            <Text style={styles.counterText}>{currentStep + 1} / {totalSteps}</Text>
          </View>
      </Pressable>

      <View style={styles.bottomSection} pointerEvents="box-none">
        <Animated.View
          style={[
            styles.tooltipCard,
            {
              opacity: tooltipOpacity,
              transform: [{ scale: tooltipScale }],
              borderColor: currentStepData.color + '40',
              left: tooltipLeft,
              width: tooltipW,
            },
          ]}
        >
          <View style={[styles.tooltipHeader, { borderBottomColor: currentStepData.color + '20' }]}>
            <View style={[styles.tooltipIconWrap, { backgroundColor: currentStepData.color + '15' }]}>
              {icon}
            </View>
            <Text style={styles.tooltipTitle}>
              {t(currentStepData.titleKey as any) || currentStepData.titleFallback}
            </Text>
          </View>
          <Text style={styles.tooltipDesc}>
            {t(currentStepData.descKey as any) || currentStepData.descFallback}
          </Text>

          <View style={styles.tooltipFooter}>
            <View style={styles.dotsRow}>
              {Array.from({ length: totalSteps }).map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.dot,
                    i === currentStep && [styles.dotActive, { backgroundColor: currentStepData.color }],
                  ]}
                />
              ))}
            </View>
            <TouchableOpacity
              onPress={nextStep}
              style={[styles.tooltipBtn, { backgroundColor: currentStepData.color }]}
              activeOpacity={0.8}
            >
              <Text style={styles.tooltipBtnText}>
                {isLast ? (t('getStarted' as any) || "Let's go!") : (t('next' as any) || 'Next')}
              </Text>
              {!isLast && <ChevronRight size={16} color="#fff" />}
            </TouchableOpacity>
          </View>
        </Animated.View>

        <View style={[styles.arrowDown, { left: arrowLeft + tooltipLeft, borderTopColor: '#1a1a2e' }]} />

        <View style={styles.highlightArea}>
          <Animated.View
            style={[
              styles.highlightDot,
              {
                left: highlightX - 22,
                backgroundColor: currentStepData.color,
                transform: [{ scale: pulseAnim }],
                opacity: pulseAnim.interpolate({
                  inputRange: [1, 1.4],
                  outputRange: [0.4, 0],
                }),
              },
            ]}
          />
          <View
            style={[
              styles.highlightSolid,
              {
                left: highlightX - 16,
                backgroundColor: currentStepData.color,
              },
            ]}
          />
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    zIndex: 9999,
  },
  touchBlocker: {
    flex: 1,
  },
  skipContainer: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 55 : 35,
    right: 16,
    zIndex: 10000,
  },
  skipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  skipText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  counterContainer: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 58 : 38,
    left: 16,
    zIndex: 10000,
  },
  counterText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    fontWeight: '600',
  },
  bottomSection: {
    paddingBottom: Platform.OS === 'ios' ? 20 : 10,
  },
  tooltipCard: {
    position: 'absolute',
    bottom: 100,
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 20,
    zIndex: 10001,
  },
  tooltipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
  },
  tooltipIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tooltipTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    flex: 1,
  },
  tooltipDesc: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    lineHeight: 19,
    marginBottom: 12,
  },
  tooltipFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 5,
    alignItems: 'center',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  dotActive: {
    width: 16,
  },
  tooltipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  tooltipBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  arrowDown: {
    position: 'absolute',
    bottom: 90,
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    zIndex: 10001,
  },
  highlightArea: {
    height: 80,
    position: 'relative',
  },
  highlightDot: {
    position: 'absolute',
    top: 6,
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  highlightSolid: {
    position: 'absolute',
    top: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    opacity: 0.25,
  },
});
