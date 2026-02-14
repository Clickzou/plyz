import { View, TouchableOpacity, StyleSheet, Platform, Text } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { Home, Images, User, Star, Users, Search, Newspaper, Inbox, Radio } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '@/contexts/LanguageContext';
import { useCelebrityMode } from '@/contexts/CelebrityModeContext';

export const BOTTOM_NAV_HEIGHT = 70;

interface BottomNavProps {
  transparent?: boolean;
}

export default function BottomNav({ transparent = false }: BottomNavProps) {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { isCelebrity } = useCelebrityMode();

  const handleNavigation = (path: string) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.push(path as any);
  };

  const isActive = (path: string) => pathname === path;
  const isActiveMulti = (...paths: string[]) => paths.some(p => pathname === p || pathname.startsWith(p));

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
          size={24}
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
          size={24}
          color={isActiveMulti('/discover', '/celebrity-detail') ? '#10b981' : '#ffffff'}
          strokeWidth={2}
        />
        <Text style={[styles.navLabel, isActiveMulti('/discover', '/celebrity-detail') && styles.navLabelActive]}>
          {t('discover')}
        </Text>
      </TouchableOpacity>

      {isCelebrity && (
        <TouchableOpacity
          style={styles.navButton}
          onPress={() => handleNavigation('/celebrity-menu')}
          activeOpacity={0.7}
        >
          <Star
            size={24}
            color={isActiveMulti('/celebrity-menu', '/create-event', '/create-live-session') ? '#f59e0b' : '#ffffff'}
            fill={isActiveMulti('/celebrity-menu', '/create-event', '/create-live-session') ? '#f59e0b' : 'transparent'}
            strokeWidth={2}
          />
          <Text style={[styles.navLabel, isActiveMulti('/celebrity-menu', '/create-event', '/create-live-session') && styles.navLabelStar]}>
            {t('celebrity')}
          </Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={styles.navButton}
        onPress={() => handleNavigation('/fan-choice')}
        activeOpacity={0.7}
      >
        <Radio
          size={24}
          color={isActiveMulti('/fan-choice', '/join-event', '/join-live-session') ? '#6366f1' : '#ffffff'}
          strokeWidth={2}
        />
        <Text style={[styles.navLabel, isActiveMulti('/fan-choice', '/join-event', '/join-live-session') && styles.navLabelFan]}>
          {t('live')}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.navButton}
        onPress={() => handleNavigation('/my-space')}
        activeOpacity={0.7}
      >
        <Inbox
          size={24}
          color={isActive('/my-space') ? '#10b981' : '#ffffff'}
          strokeWidth={2}
        />
        <Text style={[styles.navLabel, isActive('/my-space') && styles.navLabelActive]}>
          {t('mySpace')}
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
    paddingHorizontal: 4,
    paddingVertical: 6,
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
  navLabelStar: {
    color: '#f59e0b',
  },
  navLabelFan: {
    color: '#6366f1',
  },
});
