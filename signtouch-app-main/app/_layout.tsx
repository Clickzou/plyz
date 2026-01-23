import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { SubscriptionProvider } from '@/contexts/SubscriptionContext';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { useFonts } from 'expo-font';
import { ShadowsIntoLight_400Regular } from '@expo-google-fonts/shadows-into-light';
import { AlexBrush_400Regular } from '@expo-google-fonts/alex-brush';
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
import * as SplashScreen from 'expo-splash-screen';
import SubscriptionOfferModal from '@/components/SubscriptionOfferModal';
import PostPurchaseAccountModal from '@/components/PostPurchaseAccountModal';
import { setSubscriptionOfferCallback } from '@/utils/subscriptionOffer';
import { setPostPurchaseAccountCallback, setManualAccountModalCallback, maybeShowPostPurchaseAccountModal } from '@/utils/postPurchaseAccount';
import { setAccountPromptSnooze } from '@/utils/postPurchaseAccountStorage';

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
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="+not-found" />
      </Stack>
      <StatusBar style="auto" />
      <SubscriptionOfferModal
        visible={showSubscriptionOffer}
        onClose={() => setShowSubscriptionOffer(false)}
        onPurchaseSuccess={handlePurchaseSuccess}
      />
      <PostPurchaseAccountModal
        visible={showPostPurchaseAccount}
        onClose={handleClosePostPurchaseAccount}
      />
    </>
  );
}

export default function RootLayout() {
  useFrameworkReady();

  const [fontsLoaded, fontError] = useFonts({
    'Shadows Into Light': ShadowsIntoLight_400Regular,
    'Alex Brush': AlexBrush_400Regular,
    'Covered By Your Grace': CoveredByYourGrace_400Regular,
    'Caveat': Caveat_400Regular,
    'Indie Flower': IndieFlower_400Regular,
    'Dancing Script': DancingScript_400Regular,
    'Great Vibes': GreatVibes_400Regular,
    'Bangers': Bangers_400Regular,
    'Fraunces': Fraunces_400Regular,
    'Shantell Sans': ShantellSans_400Regular,
    'Manrope': Manrope_400Regular,
    'Montserrat-Bold': Montserrat_700Bold,
    'Montserrat-ExtraBold': Montserrat_800ExtraBold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <LanguageProvider>
          <SubscriptionProvider>
            <AppContent />
          </SubscriptionProvider>
        </LanguageProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
