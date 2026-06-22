import { View, TouchableOpacity, StyleSheet, Platform, Text } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { Search, Newspaper, Images, Camera, Calendar } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '@/contexts/LanguageContext';

export const BOTTOM_NAV_HEIGHT = 70;

interface BottomNavProps {
  transparent?: boolean;
}

export default function BottomNav({ transparent = false }: BottomNavProps) {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();

  const handleNavigation = (path: string) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.push(path as any);
  };

  const handleCameraPress = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    router.push('/camera' as any);
  };

  const isActiveMulti = (...paths: string[]) => paths.some(p => pathname === p || pathname.startsWith(p));
  const isCameraActive = isActiveMulti('/camera', '/photo-editor', '/signature', '/result');

  return (
    <View style={[
      styles.container,
      { paddingBottom: Math.max(insets.bottom, 15) },
      transparent && styles.transparentContainer
    ]}>
      <TouchableOpacity
        style={styles.navButton}
        onPress={() => handleNavigation('/activity')}
        activeOpacity={0.7}
      >
        <Newspaper
          size={22}
          color={isActiveMulti('/activity', '/') ? '#10b981' : '#ffffff'}
          strokeWidth={2}
        />
        <Text style={[styles.navLabel, isActiveMulti('/activity', '/') && styles.navLabelActive]}>
          {t('feed')}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.navButton}
        onPress={() => handleNavigation('/discover')}
        activeOpacity={0.7}
      >
        <Search
          size={22}
          color={isActiveMulti('/discover', '/celebrity-detail') ? '#10b981' : '#ffffff'}
          strokeWidth={2}
        />
        <Text style={[styles.navLabel, isActiveMulti('/discover', '/celebrity-detail') && styles.navLabelActive]}>
          {t('discover')}
        </Text>
      </TouchableOpacity>

      <View style={styles.cameraButtonWrapper}>
        <TouchableOpacity
          style={[
            styles.cameraButton,
            isCameraActive && styles.cameraButtonActive
          ]}
          onPress={handleCameraPress}
          activeOpacity={0.8}
        >
          <Camera
            size={28}
            color="#ffffff"
            strokeWidth={2.5}
          />
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.navButton}
        onPress={() => handleNavigation('/fan-choice')}
        activeOpacity={0.7}
      >
        <Calendar
          size={22}
          color={isActiveMulti('/fan-choice', '/create-event', '/create-live-session', '/join-event', '/join-live-session', '/event-publish', '/event-gallery', '/event-photo-editor', '/live-session-dashboard', '/add-signer', '/fan-live-view', '/purchase-session') ? '#10b981' : '#ffffff'}
          strokeWidth={2}
        />
        <Text style={[styles.navLabel, isActiveMulti('/fan-choice', '/create-event', '/create-live-session', '/join-event', '/join-live-session', '/event-publish', '/event-gallery', '/event-photo-editor', '/live-session-dashboard', '/add-signer', '/fan-live-view', '/purchase-session') && styles.navLabelActive]}>
          {t('eventsTab')}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.navButton}
        onPress={() => handleNavigation('/gallery')}
        activeOpacity={0.7}
      >
        <Images
          size={22}
          color={isActiveMulti('/gallery', '/my-space', '/account') ? '#10b981' : '#ffffff'}
          strokeWidth={2}
        />
        <Text style={[styles.navLabel, isActiveMulti('/gallery', '/my-space', '/account') && styles.navLabelActive]}>
          {t('mySpace')}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  transparentContainer: {
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
  },
  navButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  cameraButtonWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -30,
  },
  cameraButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#10b981',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
    borderWidth: 3,
    borderColor: 'rgba(0, 0, 0, 0.95)',
  },
  cameraButtonActive: {
    backgroundColor: '#059669',
    shadowOpacity: 0.6,
  },
  navLabel: {
    color: '#ffffff',
    fontSize: 9,
    marginTop: 4,
    fontWeight: '500',
  },
  navLabelActive: {
    color: '#10b981',
  },
});
