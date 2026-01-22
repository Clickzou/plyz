import { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Camera } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import BottomNav from '@/components/BottomNav';

const { width } = Dimensions.get('window');
const isTablet = width >= 768;

export default function HomeScreen() {
  const router = useRouter();

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
  }, []);

  const handleCameraPress = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.push('/camera');
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#F2FF7A', '#69C587']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.gradient}>

        {/* Grandes bulles rondes fixes - Layer 2 */}
        <View style={[styles.bubble, styles.bubble1]} />
        <View style={[styles.bubble, styles.bubble2]} />
        <View style={[styles.bubble, styles.bubble3]} />
        <View style={[styles.bubble, styles.bubble4]} />
        <View style={[styles.bubble, styles.bubble5]} />
        <View style={[styles.bubble, styles.bubble6]} />

        {/* Contenu principal - Layer 3+ */}
        <View style={styles.logoContainer}>
          <Text style={styles.logoText}>Signtouch</Text>
        </View>

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={styles.cameraButton}
            onPress={handleCameraPress}
            activeOpacity={0.8}>
            <Camera size={36} color="#2e7d32" strokeWidth={2.5} />
          </TouchableOpacity>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    position: 'relative',
  },
  // Style de base pour toutes les bulles
  bubble: {
    position: 'absolute',
    borderRadius: 9999,
  },
  // Bulle 1 - Grande bulle en haut à gauche
  bubble1: {
    width: 400,
    height: 400,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    top: -150,
    left: -100,
  },
  // Bulle 2 - Grande bulle au centre-haut
  bubble2: {
    width: 350,
    height: 350,
    backgroundColor: 'rgba(242, 255, 122, 0.25)',
    top: 100,
    right: -80,
  },
  // Bulle 3 - Bulle moyenne au centre
  bubble3: {
    width: 280,
    height: 280,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    top: '40%',
    left: -50,
  },
  // Bulle 4 - Grande bulle au centre-droit
  bubble4: {
    width: 450,
    height: 450,
    backgroundColor: 'rgba(105, 197, 135, 0.2)',
    top: '35%',
    right: -120,
  },
  // Bulle 5 - Bulle moyenne en bas à gauche
  bubble5: {
    width: 320,
    height: 320,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    bottom: 50,
    left: -80,
  },
  // Bulle 6 - Grande bulle en bas à droite
  bubble6: {
    width: 380,
    height: 380,
    backgroundColor: 'rgba(242, 255, 122, 0.15)',
    bottom: -100,
    right: -60,
  },
  logoContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  logoText: {
    fontSize: isTablet ? 100 : 80,
    fontFamily: 'Pacifico_400Regular',
    color: '#FFFFFF',
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.35)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 6,
  },
  buttonContainer: {
    flex: 0.3,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 60,
    zIndex: 10,
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
