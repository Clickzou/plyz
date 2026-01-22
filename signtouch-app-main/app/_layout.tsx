import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { SubscriptionProvider } from '@/contexts/SubscriptionContext';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { useFonts, Pacifico_400Regular } from '@expo-google-fonts/pacifico';
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
