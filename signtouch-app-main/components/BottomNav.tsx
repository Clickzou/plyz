import React, { useEffect, useRef } from 'react';
import { View, TouchableOpacity, StyleSheet, Platform, Text, Animated, Easing } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { Search, Newspaper, Images, Camera, Calendar } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAutoTranslate } from '@/utils/translation';
import { useBadgeAppelsVideo } from '@/utils/videoCallBadge';

export const BOTTOM_NAV_HEIGHT = 70;

interface BottomNavProps {
  transparent?: boolean;
}

export default function BottomNav({ transparent = false }: BottomNavProps) {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const trUI = useAutoTranslate(['Dédicace']);
  const badge = useBadgeAppelsVideo();

  // Battement lent, uniquement quand c'est à cet utilisateur d'agir. Une
  // pastille qui pulse en permanence devient un décor qu'on ne voit plus.
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!badge.aAgir || badge.total === 0) {
      pulse.setValue(1);
      return;
    }
    const boucle = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.25, duration: 700, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ])
    );
    boucle.start();
    return () => { boucle.stop(); pulse.setValue(1); };
  }, [badge.aAgir, badge.total, pulse]);

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
        {/* Seul bouton de la barre sans libellé : un appareil photo ne dit pas
            ce qu'on en fait ici — signer une photo, pas la prendre pour la
            prendre. Les quatre autres onglets sont nommés, celui-ci aussi. */}
        <Text style={[styles.navLabel, isCameraActive && styles.navLabelActive]}>
          {t('dedicate' as any) || trUI('Dédicace')}
        </Text>
      </View>

      <TouchableOpacity
        style={styles.navButton}
        onPress={() => handleNavigation('/fan-choice')}
        activeOpacity={0.7}
      >
        <View>
          <Calendar
            size={22}
            color={isActiveMulti('/fan-choice', '/create-event', '/create-live-session', '/join-event', '/join-live-session', '/event-publish', '/event-gallery', '/event-photo-editor', '/live-session-dashboard', '/add-signer', '/fan-live-view', '/purchase-session') ? '#10b981' : '#ffffff'}
            strokeWidth={2}
          />
          {/* Appels vidéo privés en cours. Sur l'onglet lui-même : autrement il
              faudrait déjà être sur la page Événements pour apprendre qu'il s'y
              passe quelque chose. Rouge = rien n'a bougé, vert = c'est validé ;
              la pastille bat quand c'est à cet utilisateur d'agir — une demande
              expire en 48 h, un créneau accepté attend son règlement. */}
          {(badge.total > 0 || badge.alerte) && (
            <Animated.View
              style={[
                styles.badge,
                // Sans chiffre à montrer, la pastille se réduit à un point : le
                // compteur ne comptant plus que ce qui demande une action, une
                // annulation seule affichait « 0 » — ou, la pastille étant
                // conditionnée à `total > 0`, ne s'affichait pas du tout.
                badge.total === 0 && styles.badgePoint,
                { backgroundColor: badge.couleur, transform: [{ scale: pulse }] },
              ]}
            >
              {badge.total > 0 && (
                <Text style={styles.badgeText}>{badge.total > 9 ? '9+' : badge.total}</Text>
              )}
            </Animated.View>
          )}
        </View>
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
  badge: {
    position: 'absolute',
    top: -6,
    right: -11,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    // Liseré sombre : sans lui, la pastille se confond avec l'icône quand elle
    // la chevauche, surtout en vert sur un onglet actif lui aussi vert.
    borderWidth: 2,
    borderColor: '#0f172a',
  },
  badgePoint: {
    minWidth: 12,
    width: 12,
    height: 12,
    borderRadius: 6,
    paddingHorizontal: 0,
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
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
