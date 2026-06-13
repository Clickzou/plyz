import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

const ONBOARDING_KEY = '@plyz_onboarding_done';

interface OnboardingStep {
  route: string;
  titleKey: string;
  descKey: string;
  titleFallback: string;
  descFallback: string;
  tabLabel: string;
  highlightPosition: number;
  color: string;
}

const STEPS: OnboardingStep[] = [
  {
    route: '/activity',
    titleKey: 'onboardingFeedTitle',
    descKey: 'onboardingFeedDesc',
    titleFallback: 'Activity Feed',
    descFallback: 'Stay up to date with the latest news, posts, and upcoming events from your favorite celebrities.',
    tabLabel: 'Feed',
    highlightPosition: 0,
    color: '#10b981',
  },
  {
    route: '/discover',
    titleKey: 'onboardingDiscoverTitle',
    descKey: 'onboardingDiscoverDesc',
    titleFallback: 'Discover Celebrities',
    descFallback: 'Browse the celebrity wall, search by name, and find verified stars to follow and interact with.',
    tabLabel: 'Discover',
    highlightPosition: 1,
    color: '#3b82f6',
  },
  {
    route: '/camera',
    titleKey: 'onboardingCameraTitle',
    descKey: 'onboardingCameraDesc',
    titleFallback: 'Capture Memories',
    descFallback: 'Take photos, add signatures, text overlays, and create unique personalized memories to keep forever.',
    tabLabel: 'Camera',
    highlightPosition: 2,
    color: '#10b981',
  },
  {
    route: '/fan-choice',
    titleKey: 'onboardingLiveTitle',
    descKey: 'onboardingLiveDesc',
    titleFallback: 'Events',
    descFallback: 'Join live video calls and dedication events, or create your own event and invite your fans.',
    tabLabel: 'Events',
    highlightPosition: 3,
    color: '#6366f1',
  },
  {
    route: '/my-space',
    titleKey: 'onboardingMySpaceTitle',
    descKey: 'onboardingMySpaceDesc',
    titleFallback: 'My Space',
    descFallback: 'Find all your bookings, autograph requests, and collected dedications in one place.',
    tabLabel: 'My Space',
    highlightPosition: 4,
    color: '#10b981',
  },
  {
    route: '/account',
    titleKey: 'onboardingAccountTitle',
    descKey: 'onboardingAccountDesc',
    titleFallback: 'Account',
    descFallback: 'Manage your profile, switch to Celebrity Mode, change language, and access settings.',
    tabLabel: 'Account',
    highlightPosition: 5,
    color: '#10b981',
  },
];

interface OnboardingContextType {
  isOnboarding: boolean;
  currentStep: number;
  totalSteps: number;
  currentStepData: OnboardingStep | null;
  startOnboarding: () => void;
  nextStep: () => void;
  skipOnboarding: () => void;
}

const OnboardingContext = createContext<OnboardingContextType>({
  isOnboarding: false,
  currentStep: 0,
  totalSteps: STEPS.length,
  currentStepData: null,
  startOnboarding: () => {},
  nextStep: () => {},
  skipOnboarding: () => {},
});

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [isOnboarding, setIsOnboarding] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [, setHasChecked] = useState(false);
  const router = useRouter();

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_KEY).then(val => {
      if (val !== 'true') {
        setTimeout(() => {
          setIsOnboarding(true);
          setCurrentStep(0);
        }, 500);
      }
      setHasChecked(true);
    });
  }, []);

  const startOnboarding = useCallback(() => {
    setCurrentStep(0);
    setIsOnboarding(true);
    router.replace('/activity' as any);
  }, [router]);

  const nextStep = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    if (currentStep < STEPS.length - 1) {
      const next = currentStep + 1;
      setCurrentStep(next);
      router.replace(STEPS[next].route as any);
    } else {
      finishOnboarding();
    }
  }, [currentStep, router]);

  const skipOnboarding = useCallback(async () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    setIsOnboarding(false);
    setCurrentStep(0);
    router.replace('/activity' as any);
  }, [router]);

  const finishOnboarding = useCallback(async () => {
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    setIsOnboarding(false);
    setCurrentStep(0);
    router.replace('/activity' as any);
  }, [router]);

  return (
    <OnboardingContext.Provider
      value={{
        isOnboarding,
        currentStep,
        totalSteps: STEPS.length,
        currentStepData: isOnboarding ? STEPS[currentStep] : null,
        startOnboarding,
        nextStep,
        skipOnboarding,
      }}
    >
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  return useContext(OnboardingContext);
}

export { ONBOARDING_KEY };
