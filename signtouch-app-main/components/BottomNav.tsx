import { View, TouchableOpacity, StyleSheet, Platform, Text } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { Home, Images, User, Star, Users } from 'lucide-react-native';
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

  const handleNavigation = (path: '/' | '/gallery' | '/account' | '/celebrity-menu' | '/join-event') => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.push(path);
  };

  const isActive = (path: string) => pathname === path;

  return (
    <View style={[
      styles.container,
      { paddingBottom: Math.max(insets.bottom, 15) },
      transparent && styles.transparentContainer
    ]}>
      <TouchableOpacity
        style={styles.navButton}
        onPress={() => handleNavigation('/')}
        activeOpacity={0.7}
      >
        <Home
          size={24}
          color={isActive('/') ? '#10b981' : '#ffffff'}
          strokeWidth={2}
        />
        <Text style={[styles.navLabel, isActive('/') && styles.navLabelActive]}>
          {t('home')}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.navButton}
        onPress={() => handleNavigation('/celebrity-menu')}
        activeOpacity={0.7}
      >
        <Star
          size={24}
          color={isActive('/celebrity-menu') || isActive('/create-event') || isActive('/create-live-session') ? '#f59e0b' : '#ffffff'}
          fill={isActive('/celebrity-menu') || isActive('/create-event') || isActive('/create-live-session') ? '#f59e0b' : 'transparent'}
          strokeWidth={2}
        />
        <Text style={[styles.navLabel, (isActive('/celebrity-menu') || isActive('/create-event') || isActive('/create-live-session')) && styles.navLabelStar]}>
          {t('celebrity')}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.navButton}
        onPress={() => handleNavigation('/gallery')}
        activeOpacity={0.7}
      >
        <Images
          size={24}
          color={isActive('/gallery') ? '#10b981' : '#ffffff'}
          strokeWidth={2}
        />
        <Text style={[styles.navLabel, isActive('/gallery') && styles.navLabelActive]}>
          {t('gallery')}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.navButton}
        onPress={() => handleNavigation('/join-event')}
        activeOpacity={0.7}
      >
        <Users
          size={24}
          color={isActive('/join-event') ? '#6366f1' : '#ffffff'}
          strokeWidth={2}
        />
        <Text style={[styles.navLabel, isActive('/join-event') && styles.navLabelFan]}>
          {t('fan')}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.navButton}
        onPress={() => handleNavigation('/account')}
        activeOpacity={0.7}
      >
        <User
          size={24}
          color={isActive('/account') ? '#10b981' : '#ffffff'}
          strokeWidth={2}
        />
        <Text style={[styles.navLabel, isActive('/account') && styles.navLabelActive]}>
          {t('account')}
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
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  navLabel: {
    color: '#ffffff',
    fontSize: 10,
    marginTop: 4,
    fontWeight: '500',
  },
  navLabelActive: {
    color: '#10b981',
  },
  navLabelStar: {
    color: '#f59e0b',
  },
  navLabelFan: {
    color: '#6366f1',
  },
});
