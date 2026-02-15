import { useEffect, useState, useRef } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { SubscriptionProvider } from '@/contexts/SubscriptionContext';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { useFonts } from 'expo-font';
import SplashOverlay from '@/components/SplashOverlay';
import { ShadowsIntoLight_400Regular } from '@expo-google-fonts/shadows-into-light';
import { AlexBrush_400Regular } from '@expo-google-fonts/alex-brush';
import { Pacifico_400Regular } from '@expo-google-fonts/pacifico';
import { CoveredByYourGrace_400Regular } from '@expo-google-fonts/covered-by-your-grace';
import { Caveat_400Regular } from '@expo-google-fonts/caveat';
import { IndieFlower_400Regular } from '@expo-google-fonts/indie-flower';
import { DancingScript_400Regular } from '@expo-google-fonts/dancing-script';
import { GreatVibes_400Regular } from '@expo-google-fonts/great-vibes';
import { Bangers_400Regular } from '@expo-google-fonts/bangers';
import { Fraunces_400Regular } from '@expo-google-fonts/fraunces';
import { ShantellSans_400Regular } from '@expo-google-fonts/shantell-sans';
import { Manrope_400Regular } from '@expo-google-fonts/manrope';
import { Montserrat_700Bold, Montserrat_800ExtraBold } from '@expo-google-fonts/montserrat';
import { Satisfy_400Regular } from '@expo-google-fonts/satisfy';
import { CedarvilleCursive_400Regular } from '@expo-google-fonts/cedarville-cursive';
import * as SplashScreen from 'expo-splash-screen';
import SubscriptionOfferModal from '@/components/SubscriptionOfferModal';
import PostPurchaseAccountModal from '@/components/PostPurchaseAccountModal';
import { setSubscriptionOfferCallback } from '@/utils/subscriptionOffer';
import { SUBSCRIPTION_ENABLED } from '@/contexts/SubscriptionContext';
import {
  setPostPurchaseAccountCallback,
  setManualAccountModalCallback,
  maybeShowPostPurchaseAccountModal,
} from '@/utils/postPurchaseAccount';
import { setAccountPromptSnooze } from '@/utils/postPurchaseAccountStorage';
import { initRevenueCat } from '@/utils/revenueCat';
import CustomAlert from '@/components/CustomAlert';
import { CelebrityModeProvider } from '@/contexts/CelebrityModeContext';
import { FollowProvider } from '@/contexts/FollowContext';
import { OnboardingProvider } from '@/contexts/OnboardingContext';
import OnboardingOverlay from '@/components/OnboardingTooltip';

SplashScreen.preventAutoHideAsync();

function AppContent() {
  const [showSubscriptionOffer, setShowSubscriptionOffer] = useState(false);
  const [showPostPurchaseAccount, setShowPostPurchaseAccount] = useState(false);
  const [isPostPurchaseContext, setIsPostPurchaseContext] = useState(false);
  const { user, session } = useAuth();

  useEffect(() => {
    setSubscriptionOfferCallback(() => {
      setShowSubscriptionOffer(true);
    });

    setPostPurchaseAccountCallback(() => {
      setShowPostPurchaseAccount(true);
    });

    setManualAccountModalCallback(() => {
      setIsPostPurchaseContext(false);
      setShowPostPurchaseAccount(true);
    });
  }, []);

  const handlePurchaseSuccess = async () => {
    const isConnected = !!(user || session);
    setIsPostPurchaseContext(true);
    await maybeShowPostPurchaseAccountModal(true, isConnected);
  };

  const handleClosePostPurchaseAccount = async () => {
    if (isPostPurchaseContext) {
      await setAccountPromptSnooze();
    }
    setShowPostPurchaseAccount(false);
    setIsPostPurchaseContext(false);
  };

  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'fade',
          animationDuration: 200,
        }}
      >
        <Stack.Screen name="+not-found" />
        <Stack.Screen name="index" options={{ animation: 'none' }} />
        <Stack.Screen name="activity" options={{ animation: 'none' }} />
        <Stack.Screen name="discover" options={{ animation: 'none' }} />
        <Stack.Screen name="gallery" options={{ animation: 'none' }} />
        <Stack.Screen name="account" options={{ animation: 'none' }} />
        <Stack.Screen name="celebrity-menu" options={{ animation: 'none' }} />
        <Stack.Screen name="celebrity-detail" />
        <Stack.Screen name="fan-choice" options={{ animation: 'none' }} />
        <Stack.Screen name="my-space" options={{ animation: 'none' }} />
        <Stack.Screen name="join-event" options={{ animation: 'none' }} />
        <Stack.Screen name="compose" />
      </Stack>

      <StatusBar style="auto" />

      {SUBSCRIPTION_ENABLED && (
        <SubscriptionOfferModal
          visible={showSubscriptionOffer}
          onClose={() => setShowSubscriptionOffer(false)}
          onPurchaseSuccess={handlePurchaseSuccess}
        />
      )}

      <PostPurchaseAccountModal
        visible={showPostPurchaseAccount}
        onClose={handleClosePostPurchaseAccount}
      />

      <CustomAlert />
      <OnboardingOverlay />
    </>
  );
}

export default function RootLayout() {
  useFrameworkReady();

  const pumpkindFont = (() => {
    try { return require('@/assets/fonts/PumpkindCustard.ttf'); } catch { return null; }
  })();

  const fontMap: Record<string, any> = {
    'Shadows Into Light': ShadowsIntoLight_400Regular,
    'Alex Brush': AlexBrush_400Regular,
    Pacifico: Pacifico_400Regular,
    'Covered By Your Grace': CoveredByYourGrace_400Regular,
    Caveat: Caveat_400Regular,
    'Indie Flower': IndieFlower_400Regular,
    'Dancing Script': DancingScript_400Regular,
    'Great Vibes': GreatVibes_400Regular,
    Bangers: Bangers_400Regular,
    Fraunces: Fraunces_400Regular,
    'Shantell Sans': ShantellSans_400Regular,
    Manrope: Manrope_400Regular,
    'Montserrat-Bold': Montserrat_700Bold,
    'Montserrat-ExtraBold': Montserrat_800ExtraBold,
    Satisfy: Satisfy_400Regular,
    CedarvilleCursive: CedarvilleCursive_400Regular,
  };

  if (pumpkindFont) {
    fontMap['PumpkindCustard'] = pumpkindFont;
  }

  const [fontsLoaded, fontError] = useFonts(fontMap);

  useEffect(() => {
    SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    initRevenueCat().catch(console.warn);
  }, []);

  const [showSplash, setShowSplash] = useState(true);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <LanguageProvider>
          <SubscriptionProvider>
            <CelebrityModeProvider>
              <FollowProvider>
                <OnboardingProvider>
                  <AppContent />
                  {showSplash && <SplashOverlay onFinish={() => setShowSplash(false)} />}
                </OnboardingProvider>
              </FollowProvider>
            </CelebrityModeProvider>
          </SubscriptionProvider>
        </LanguageProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
