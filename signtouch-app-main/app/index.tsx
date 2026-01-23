import { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, useWindowDimensions } from 'react-native';
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

export default function HomeScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  const titleOpacity = useSharedValue(0);
  const titleTranslateY = useSharedValue(30);
  const subtitleOpacity = useSharedValue(0);
  const buttonScale = useSharedValue(0);
  const buttonPulse = useSharedValue(1);
  const glow1Opacity = useSharedValue(0.1);
  const glow2Opacity = useSharedValue(0.1);

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

    titleOpacity.value = withDelay(300, withTiming(1, { duration: 1000 }));
    titleTranslateY.value = withDelay(300, withTiming(0, { duration: 800, easing: Easing.out(Easing.back(1.5)) }));
    subtitleOpacity.value = withDelay(800, withTiming(1, { duration: 800 }));
    buttonScale.value = withDelay(1200, withTiming(1, { duration: 600, easing: Easing.out(Easing.back(2)) }));
    
    buttonPulse.value = withDelay(
      2000,
      withRepeat(
        withSequence(
          withTiming(1.1, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      )
    );

    glow1Opacity.value = withRepeat(
      withSequence(
        withTiming(0.2, { duration: 3000 }),
        withTiming(0.08, { duration: 3000 })
      ),
      -1,
      true
    );

    glow2Opacity.value = withDelay(
      1500,
      withRepeat(
        withSequence(
          withTiming(0.18, { duration: 2500 }),
          withTiming(0.06, { duration: 2500 })
        ),
        -1,
        true
      )
    );
  }, []);

  const titleStyle = useAnimatedStyle(() => ({
    opacity: titleOpacity.value,
    transform: [{ translateY: titleTranslateY.value }],
  }));

  const subtitleStyle = useAnimatedStyle(() => ({
    opacity: subtitleOpacity.value,
  }));

  const buttonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: buttonScale.value * buttonPulse.value }],
  }));

  const glow1Style = useAnimatedStyle(() => ({
    opacity: glow1Opacity.value,
  }));

  const glow2Style = useAnimatedStyle(() => ({
    opacity: glow2Opacity.value,
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
        colors={['#1a1a2e', '#16213e', '#0f3460']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}>

        <Animated.View style={[styles.glowCircle, glow1Style]} />
        <Animated.View style={[styles.glowCircle2, glow2Style]} />
        <Animated.View style={[styles.glowCircle3, glow1Style]} />

        <View style={styles.content}>
          <View style={styles.logoContainer}>
            <Animated.Text style={[styles.logoText, { fontSize: isTablet ? 72 : 56 }, titleStyle]}>
              Signtouch
            </Animated.Text>
            <Animated.Text style={[styles.subtitleText, subtitleStyle]}>
              Capturez vos rencontres
            </Animated.Text>
          </View>

          <View style={styles.buttonContainer}>
            <Animated.View style={buttonStyle}>
              <TouchableOpacity
                style={styles.cameraButton}
                onPress={handleCameraPress}
                activeOpacity={0.8}>
                <LinearGradient
                  colors={['#667eea', '#764ba2']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.buttonGradient}>
                  <Camera size={36} color="#ffffff" strokeWidth={2.5} />
                </LinearGradient>
              </TouchableOpacity>
            </Animated.View>
            <Animated.Text style={[styles.buttonLabel, subtitleStyle]}>
              Prendre une photo
            </Animated.Text>
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
  glowCircle: {
    position: 'absolute',
    width: 350,
    height: 350,
    borderRadius: 175,
    backgroundColor: '#667eea',
    top: '10%',
    left: -120,
  },
  glowCircle2: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: '#764ba2',
    bottom: '15%',
    right: -100,
  },
  glowCircle3: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: '#667eea',
    top: '45%',
    right: '20%',
  },
  content: {
    flex: 1,
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 10,
    paddingTop: 100,
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
    letterSpacing: 2,
  },
  subtitleText: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.6)',
    marginTop: 16,
    fontWeight: '300',
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
  buttonContainer: {
    alignItems: 'center',
  },
  cameraButton: {
    borderRadius: 40,
    overflow: 'hidden',
  },
  buttonGradient: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonLabel: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 14,
    marginTop: 16,
    fontWeight: '500',
    letterSpacing: 1,
  },
});
