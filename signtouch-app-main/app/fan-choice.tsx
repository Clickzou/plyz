import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { QrCode, Video } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useLanguage } from '@/contexts/LanguageContext';
import BottomNav, { BOTTOM_NAV_HEIGHT } from '@/components/BottomNav';

export default function FanChoiceScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();

  const handleChoice = (path: string) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.push(path as any);
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#0f172a', '#1e293b', '#0f172a']}
        style={StyleSheet.absoluteFill}
      />

      <View style={[styles.content, { paddingTop: insets.top + 20, paddingBottom: BOTTOM_NAV_HEIGHT + 20 }]}>
        <Text style={styles.title}>{t('fanChoiceTitle')}</Text>
        <Text style={styles.subtitle}>{t('fanChoiceSubtitle')}</Text>

        <View style={styles.cardsContainer}>
          <TouchableOpacity
            style={styles.card}
            onPress={() => handleChoice('/join-event')}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={['rgba(16, 185, 129, 0.15)', 'rgba(16, 185, 129, 0.05)']}
              style={styles.cardGradient}
            >
              <View style={styles.iconContainer}>
                <QrCode size={48} color="#10b981" strokeWidth={1.5} />
              </View>
              <Text style={styles.cardTitle}>{t('fanChoiceQR')}</Text>
              <Text style={styles.cardDescription}>{t('fanChoiceQRDesc')}</Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.card}
            onPress={() => handleChoice('/join-live-session')}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={['rgba(99, 102, 241, 0.15)', 'rgba(99, 102, 241, 0.05)']}
              style={styles.cardGradient}
            >
              <View style={styles.iconContainerVideo}>
                <Video size={48} color="#6366f1" strokeWidth={1.5} />
              </View>
              <Text style={styles.cardTitle}>{t('fanChoiceVideo')}</Text>
              <Text style={styles.cardDescription}>{t('fanChoiceVideoDesc')}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>

      <BottomNav />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.6)',
    textAlign: 'center',
    marginBottom: 40,
  },
  cardsContainer: {
    gap: 20,
  },
  card: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  cardGradient: {
    padding: 24,
    alignItems: 'center',
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  iconContainerVideo: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 8,
    textAlign: 'center',
  },
  cardDescription: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
    textAlign: 'center',
    lineHeight: 20,
  },
});
