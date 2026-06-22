import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  ScrollView,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import PlyzHeader from '@/components/PlyzHeader';
import { Calendar, Video, Plus, LogIn, CalendarClock } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useLanguage } from '@/contexts/LanguageContext';
import BottomNav, { BOTTOM_NAV_HEIGHT } from '@/components/BottomNav';
import AccountAvatarButton from '@/components/AccountAvatarButton';
import { getMyScheduledEvents } from '@/utils/eventSessionStorage';

export default function FanChoiceScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const [ongoingCount, setOngoingCount] = useState(0);

  // Recharge le nombre d'événements en cours à chaque fois qu'on revient sur l'écran
  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        try {
          const events = await getMyScheduledEvents();
          if (active) setOngoingCount(events.filter((e: any) => e?.status !== 'ended').length);
        } catch {
          /* silencieux : pas bloquant */
        }
      })();
      return () => { active = false; };
    }, [])
  );

  const handleChoice = (path: string) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.push(path as any);
  };

  const renderCard = (
    accent: string,
    icon: React.ReactNode,
    title: string,
    description: string,
    createPath: string,
    joinPath: string,
  ) => (
    <View style={styles.card}>
      <LinearGradient colors={[`${accent}26`, `${accent}0d`]} style={styles.cardGradient}>
        <View style={[styles.iconContainer, { backgroundColor: `${accent}1f` }]}>{icon}</View>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardDescription}>{description}</Text>

        <View style={styles.btnRow}>
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: accent }]}
            onPress={() => handleChoice(createPath)}
            activeOpacity={0.85}
          >
            <Plus size={18} color="#ffffff" strokeWidth={2.5} />
            <Text style={styles.btnPrimaryText}>{t('fanChoiceCreateBtn')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btn, styles.btnOutline, { borderColor: accent }]}
            onPress={() => handleChoice(joinPath)}
            activeOpacity={0.85}
          >
            <LogIn size={18} color={accent} strokeWidth={2.5} />
            <Text style={[styles.btnOutlineText, { color: accent }]}>{t('fanChoiceJoinBtn')}</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    </View>
  );

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0f172a', '#1e293b', '#0f172a']} style={StyleSheet.absoluteFill} />

      <View style={[styles.content, { paddingTop: insets.top }]}>
        <PlyzHeader />
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: BOTTOM_NAV_HEIGHT + 20 }]}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title}>{t('fanChoiceTitle')}</Text>
          <Text style={styles.subtitle}>{t('fanChoiceSubtitle')}</Text>

          <View style={styles.cardsContainer}>
            {renderCard(
              '#10b981',
              <Calendar size={40} color="#10b981" strokeWidth={1.5} />,
              t('fanChoiceEventTitle'),
              t('fanChoiceEventDesc'),
              '/create-event',
              '/join-event',
            )}

            <TouchableOpacity
              style={styles.historyBtn}
              onPress={() => handleChoice('/celebrity-menu')}
              activeOpacity={0.85}
            >
              <CalendarClock size={18} color="#10b981" strokeWidth={2.2} />
              <Text style={styles.historyBtnText}>
                {t('myEventsHistory' as any) || 'Événements en cours et passés'}
              </Text>
              {ongoingCount > 0 && (
                <View style={styles.historyBadge}>
                  <Text style={styles.historyBadgeText}>{ongoingCount}</Text>
                </View>
              )}
            </TouchableOpacity>

            {renderCard(
              '#6366f1',
              <Video size={40} color="#6366f1" strokeWidth={1.5} />,
              t('fanChoiceVideoTitle'),
              t('fanChoiceVideoDesc2'),
              '/create-live-session',
              '/join-live-session',
            )}
          </View>
        </ScrollView>
      </View>

      <AccountAvatarButton />
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
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
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
    marginBottom: 32,
  },
  cardsContainer: {
    gap: 20,
  },
  historyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginTop: -4,
  },
  historyBtnText: {
    color: '#10b981',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  historyBadge: {
    backgroundColor: '#ef4444',
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  historyBadgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
  },
  card: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  cardGradient: {
    padding: 22,
    alignItems: 'center',
  },
  iconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
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
    marginBottom: 18,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 13,
    borderRadius: 12,
  },
  btnPrimaryText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  btnOutline: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
  },
  btnOutlineText: {
    fontSize: 15,
    fontWeight: '700',
  },
});
