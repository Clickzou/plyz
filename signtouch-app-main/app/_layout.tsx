import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { SubscriptionProvider } from '@/contexts/SubscriptionContext';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { useFonts } from 'expo-font';
import { Pacifico_400Regular } from '@expo-google-fonts/pacifico';
import { ShadowsIntoLight_400Regular } from '@expo-google-fonts/shadows-into-light';
import { NanumPenScript_400Regular } from '@expo-google-fonts/nanum-pen-script';
import { CoveredByYourGrace_400Regular } from '@expo-google-fonts/covered-by-your-grace';
import { JustAnotherHand_400Regular } from '@expo-google-fonts/just-another-hand';
import { Caveat_400Regular } from '@expo-google-fonts/caveat';
import { IndieFlower_400Regular } from '@expo-google-fonts/indie-flower';
import { AlexBrush_400Regular } from '@expo-google-fonts/alex-brush';
import { DancingScript_400Regular } from '@expo-google-fonts/dancing-script';
import { GreatVibes_400Regular } from '@expo-google-fonts/great-vibes';
import { Sacramento_400Regular } from '@expo-google-fonts/sacramento';
import { Bangers_400Regular } from '@expo-google-fonts/bangers';
import { Playball_400Regular } from '@expo-google-fonts/playball';
import { Yesteryear_400Regular } from '@expo-google-fonts/yesteryear';
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
    Pacifico_400Regular,
    'Shadows Into Light': ShadowsIntoLight_400Regular,
    'Nanum Pen Script': NanumPenScript_400Regular,
    'Covered By Your Grace': CoveredByYourGrace_400Regular,
    'Just Another Hand': JustAnotherHand_400Regular,
    'Caveat': Caveat_400Regular,
    'Indie Flower': IndieFlower_400Regular,
    'Alex Brush': AlexBrush_400Regular,
    'Dancing Script': DancingScript_400Regular,
    'Great Vibes': GreatVibes_400Regular,
    'Pacifico': Pacifico_400Regular,
    'Sacramento': Sacramento_400Regular,
    'Bangers': Bangers_400Regular,
    'Playball': Playball_400Regular,
    'Yesteryear': Yesteryear_400Regular,
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
