import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, useWindowDimensions, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Camera } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withTiming, 
  withRepeat, 
  withSequence,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import BottomNav from '@/components/BottomNav';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSubscription, SUBSCRIPTION_ENABLED } from '@/contexts/SubscriptionContext';
import TrialModal from '@/components/TrialModal';
import { getTrialStatus, hasFirstPhotoBeenSaved } from '@/utils/trialStorage';

function SignatureImage({ delay }: { delay: number }) {
  const clipWidth = useSharedValue(400);
  const opacity = useSharedValue(1);

  useEffect(() => {
    // Animation optionnelle - le contenu est visible par défaut
    clipWidth.value = 0;
    opacity.value = 0;
    opacity.value = withDelay(delay, withTiming(1, { duration: 300 }));
    clipWidth.value = withDelay(
      delay + 300,
      withTiming(400, { duration: 3500, easing: Easing.out(Easing.ease) })
    );
  }, []);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const maskStyle = useAnimatedStyle(() => ({
    width: clipWidth.value,
    overflow: 'hidden' as const,
    alignItems: 'center' as const,
  }));

  return (
    <Animated.View style={[styles.signatureContainer, containerStyle]}>
      <View style={styles.signatureCenterWrapper}>
        <Animated.View style={maskStyle}>
          <Image 
            source={require('@/assets/images/signature.png')} 
            style={styles.signatureImage}
            resizeMode="contain"
          />
        </Animated.View>
      </View>
    </Animated.View>
  );
}

function AnimatedBubble({ size, top, left, delay, duration }: { 
  size: number; 
  top: number; 
  left: number; 
  delay: number;
  duration: number;
}) {
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = 0;
    opacity.value = withDelay(delay, withTiming(1, { duration: 1000 }));
    
    translateY.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(-20, { duration, easing: Easing.inOut(Easing.ease) }),
          withTiming(20, { duration, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      )
    );

    scale.value = withDelay(
      delay + 500,
      withRepeat(
        withSequence(
          withTiming(1.1, { duration: duration * 0.8, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.95, { duration: duration * 0.8, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      )
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <Animated.View 
      style={[
        {
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: 'rgba(255, 255, 255, 0.15)',
          top,
          left,
        },
        animatedStyle
      ]} 
    />
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const { t } = useLanguage();
  const { status } = useSubscription();
  const isTablet = width >= 768;
  
  const [showTrialExpiredModal, setShowTrialExpiredModal] = useState(false);
  const [isTrialExpired, setIsTrialExpired] = useState(false);

  const titleOpacity = useSharedValue(1);
  const titleTranslateY = useSharedValue(0);
  const titleScale = useSharedValue(1);
  const glowPulse = useSharedValue(0);
  const subtitleOpacity = useSharedValue(1);
  const buttonScale = useSharedValue(1);
  const buttonPulse = useSharedValue(1);

  useEffect(() => {
    if (Platform.OS === 'web') {
      try {
        const stored = localStorage.getItem('memories');
        if (stored) {
          const memories = JSON.parse(stored);
          const validMemories = memories.filter((m: any) =>
            m.uri && m.timestamp && m.uri.length < 300000
          ).slice(0, 8);
          localStorage.setItem('memories', JSON.stringify(validMemories));
        }
      } catch (error) {
        console.error('Nettoyage localStorage échoué:', error);
        localStorage.removeItem('memories');
      }
    }

    titleOpacity.value = withDelay(400, withTiming(1, { duration: 1200, easing: Easing.out(Easing.ease) }));
    titleTranslateY.value = withDelay(400, withTiming(0, { duration: 1000, easing: Easing.out(Easing.back(1.2)) }));
    titleScale.value = withDelay(400, withTiming(1, { duration: 1000, easing: Easing.out(Easing.back(1.2)) }));
    subtitleOpacity.value = withDelay(1200, withTiming(1, { duration: 1000, easing: Easing.out(Easing.ease) }));
    
    glowPulse.value = withDelay(
      1500,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
          withTiming(0, { duration: 2000, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      )
    );

    buttonScale.value = withDelay(1000, withTiming(1, { duration: 600, easing: Easing.out(Easing.back(2)) }));
    
    buttonPulse.value = withDelay(
      1800,
      withRepeat(
        withSequence(
          withTiming(1.12, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      )
    );
  }, []);

  useEffect(() => {
    if (!SUBSCRIPTION_ENABLED) return;

    const checkTrialExpired = async () => {
      if (status === 'paid') return;
      
      const firstPhotoSaved = await hasFirstPhotoBeenSaved();
      if (!firstPhotoSaved) return;
      
      const trialStatus = await getTrialStatus(null);
      if (trialStatus.isExpired) {
        setIsTrialExpired(true);
        setShowTrialExpiredModal(true);
      }
    };

    checkTrialExpired();
  }, [status]);

  const titleStyle = useAnimatedStyle(() => ({
    opacity: titleOpacity.value,
    transform: [
      { translateY: titleTranslateY.value },
      { scale: titleScale.value },
    ],
  }));

  const glowStyle = useAnimatedStyle(() => {
    const glowRadius = 15 + glowPulse.value * 25;
    return {
      textShadowRadius: glowRadius,
    };
  });

  const subtitleStyle = useAnimatedStyle(() => ({
    opacity: subtitleOpacity.value,
  }));

  const buttonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: buttonScale.value * buttonPulse.value }],
  }));

  const handleCameraPress = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.push('/camera');
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#3AC697', '#1ca074']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.3, y: 1 }}
        style={styles.gradient}>

        <AnimatedBubble size={380} top={-140} left={-100} delay={0} duration={4000} />
        <AnimatedBubble size={300} top={height * 0.15} left={width - 120} delay={300} duration={3500} />
        <AnimatedBubble size={250} top={height * 0.35} left={-80} delay={600} duration={4500} />
        <AnimatedBubble size={420} top={height * 0.3} left={width - 180} delay={900} duration={3800} />
        <AnimatedBubble size={280} top={height * 0.55} left={width * 0.3} delay={1200} duration={4200} />
        <AnimatedBubble size={350} top={height * 0.65} left={-120} delay={400} duration={3600} />
        <AnimatedBubble size={320} top={height * 0.75} left={width - 140} delay={800} duration={4000} />

        <View style={styles.content}>
          <View style={styles.logoContainer}>
            <Animated.Text 
              style={[
                styles.logoText, 
                { fontSize: isTablet ? 90 : 56 }, 
                titleStyle,
                glowStyle,
              ]}
            >
              Signtouch
            </Animated.Text>
            <Animated.Text style={[styles.subtitleText, subtitleStyle]}>
              CAPTUREZ VOS RENCONTRES
            </Animated.Text>
          </View>

          <SignatureImage delay={1800} />

          <View style={styles.buttonContainer}>
            <Animated.View style={buttonStyle}>
              <TouchableOpacity
                style={styles.cameraButton}
                onPress={handleCameraPress}
                activeOpacity={0.8}>
                <Camera size={36} color="#2e7d32" strokeWidth={2.5} />
              </TouchableOpacity>
            </Animated.View>

          </View>
        </View>
      </LinearGradient>
      <BottomNav />
      
      {SUBSCRIPTION_ENABLED && (
        <TrialModal
          visible={showTrialExpiredModal}
          daysRemaining={0}
          isExpired={true}
          onSubscribe={() => {
            setShowTrialExpiredModal(false);
            router.push('/paywall');
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  content: {
    flex: 1,
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 10,
    paddingTop: 120,
    paddingBottom: 80,
  },
  logoContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
    zIndex: 999,
    overflow: 'visible',
  },
  logoText: {
    fontFamily: 'Pacifico',
    color: '#FFFFFF',
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 3, height: 3 },
    textShadowRadius: 15,
    letterSpacing: 2,
    paddingTop: 25,
    paddingBottom: 20,
    marginBottom: 30,
    zIndex: 999,
    overflow: 'visible',
  },
  subtitleText: {
    fontSize: 16,
    color: '#FFFFFF',
    marginTop: 35,
    fontWeight: '600',
    letterSpacing: 5,
    textTransform: 'uppercase',
    textShadowColor: 'rgba(0, 0, 0, 0.35)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 6,
  },
  signatureContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    marginVertical: 40,
  },
  signatureCenterWrapper: {
    width: 400,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signatureImage: {
    width: 400,
    height: 160,
  },
  buttonContainer: {
    alignItems: 'center',
  },
  cameraButton: {
    backgroundColor: '#ffffff',
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 10,
  },
});
