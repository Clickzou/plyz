import { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Camera } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  useAnimatedProps,
  withTiming, 
  withRepeat, 
  withSequence,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import BottomNav from '@/components/BottomNav';

const AnimatedPath = Animated.createAnimatedComponent(Path);

function DrawingSignature({ delay }: { delay: number }) {
  const progress = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = withDelay(delay, withTiming(1, { duration: 500 }));
    progress.value = withDelay(
      delay,
      withTiming(1, { duration: 3000, easing: Easing.out(Easing.ease) })
    );
  }, []);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: 800 * (1 - progress.value),
  }));

  const containerStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[styles.signatureContainer, containerStyle]}>
      <Svg width={280} height={100} viewBox="0 0 280 100">
        <AnimatedPath
          d="M 20 60 
             Q 35 30, 50 50 
             T 80 45 
             Q 95 40, 110 55 
             T 140 50 
             Q 160 45, 180 60 
             T 210 55 
             Q 230 50, 250 65
             M 250 65 Q 260 50, 265 60"
          stroke="rgba(255, 255, 255, 0.6)"
          strokeWidth={3}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={800}
          animatedProps={animatedProps}
        />
        <AnimatedPath
          d="M 60 75 Q 80 85, 100 75"
          stroke="rgba(255, 255, 255, 0.5)"
          strokeWidth={2}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={800}
          animatedProps={animatedProps}
        />
      </Svg>
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
  const opacity = useSharedValue(0);

  useEffect(() => {
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
  const isTablet = width >= 768;

  const titleOpacity = useSharedValue(0);
  const titleTranslateY = useSharedValue(50);
  const titleScale = useSharedValue(0.8);
  const glowPulse = useSharedValue(0);
  const subtitleOpacity = useSharedValue(0);
  const buttonScale = useSharedValue(0);
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
        colors={['#F2FF7A', '#A8E063', '#69C587']}
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
                { fontSize: isTablet ? 100 : 72 }, 
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

          <DrawingSignature delay={1800} />

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
    paddingTop: 60,
    paddingBottom: 80,
  },
  logoContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoText: {
    fontFamily: 'Pacifico_400Regular',
    color: '#FFFFFF',
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 3, height: 3 },
    textShadowRadius: 15,
    letterSpacing: 2,
  },
  subtitleText: {
    fontSize: 16,
    color: '#FFFFFF',
    marginTop: 20,
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
    marginVertical: 20,
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
