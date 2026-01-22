import { View, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useRouter, usePathname, Href } from 'expo-router';
import { Home, Images, User } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export const BOTTOM_NAV_HEIGHT = 70;

interface BottomNavProps {
  transparent?: boolean;
}

export default function BottomNav({ transparent = false }: BottomNavProps) {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  const handleNavigation = (path: Href) => {
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
          size={28}
          color={isActive('/') ? '#10b981' : '#ffffff'}
          strokeWidth={2}
        />
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.navButton}
        onPress={() => handleNavigation('/gallery')}
        activeOpacity={0.7}
      >
        <Images
          size={28}
          color={isActive('/gallery') ? '#10b981' : '#ffffff'}
          strokeWidth={2}
        />
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.navButton}
        onPress={() => handleNavigation('/account')}
        activeOpacity={0.7}
      >
        <User
          size={28}
          color={isActive('/account') ? '#10b981' : '#ffffff'}
          strokeWidth={2}
        />
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
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  transparentContainer: {
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
  },
  navButton: {
    padding: 10,
  },
});
