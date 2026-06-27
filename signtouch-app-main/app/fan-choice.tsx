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
import { PenTool, Video, Plus, LogIn, CalendarClock } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { useAuthPrompt } from '@/contexts/AuthPromptContext';
import { useCelebrityMode } from '@/contexts/CelebrityModeContext';
import { supabase } from '@/utils/supabase';
import { showAlert } from '@/utils/alertHelper';
import BottomNav, { BOTTOM_NAV_HEIGHT } from '@/components/BottomNav';
import AccountAvatarButton from '@/components/AccountAvatarButton';
import { getMyScheduledEvents, getActiveFanEvent } from '@/utils/eventSessionStorage';

// Base API serveur (vérification de compte). Sur web on passe par le proxy local.
const API_BASE = Platform.OS === 'web' ? '' : (process.env.EXPO_PUBLIC_STRIPE_SERVER_URL || '');

export default function FanChoiceScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { user } = useAuth();
  const { requireAuth } = useAuthPrompt();
  const { enableCelebrityMode, isCelebrity } = useCelebrityMode();
  // 6 compteurs : à venir / en cours / passés × événements / vidéo
  const [eventUpcomingCount, setEventUpcomingCount] = useState(0);
  const [eventOngoingCount, setEventOngoingCount] = useState(0);
  const [eventPastCount, setEventPastCount] = useState(0);
  const [videoUpcomingCount, setVideoUpcomingCount] = useState(0);
  const [videoOngoingCount, setVideoOngoingCount] = useState(0);
  const [videoPastCount, setVideoPastCount] = useState(0);

  // Cliquer « Créer » : exige un compte, puis bascule en mode célébrité et
  // route selon le statut de vérification.
  const handleCreate = (createPath: string) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    requireAuth(() => proceedCreate(createPath), {
      reason: t('createAuthReason' as any) || 'Crée ton compte pour organiser un événement',
    });
  };

  const proceedCreate = async (createPath: string) => {
    // a. Bascule automatique en mode célébrité.
    await enableCelebrityMode();

    if (!user?.id) {
      // Sécurité : ne devrait pas arriver (requireAuth garantit un user).
      router.push('/celebrity-onboarding' as any);
      return;
    }

    // b. Le compte est-il déjà vérifié ?
    let verified = false;
    try {
      const { data } = await supabase.rpc('is_user_verified', { uid: user.id });
      verified = data === true;
    } catch {
      verified = false;
    }

    // c. Vérifié → accès direct au formulaire de création.
    if (verified) {
      router.push(createPath as any);
      return;
    }

    // d. Sinon, regarde s'il a une demande EN COURS de vérification.
    let pending = false;
    try {
      const types = ['celebrity', 'creator', 'org'];
      const results = await Promise.all(
        types.map((type) =>
          fetch(`${API_BASE}/api/${type}-verification-status?user_id=${user.id}`)
            .then((r) => r.json())
            .catch(() => null)
        )
      );
      pending = results.some((d: any) => d?.status === 'pending');
    } catch {
      pending = false;
    }

    if (pending) {
      // Demande en cours : on patiente.
      showAlert(
        t('verificationPendingTitle' as any) || 'Compte en cours de vérification',
        t('verificationPendingMsg' as any) ||
          'Ton compte célébrité est en cours de vérification. Tu pourras créer tes événements dès qu\'il sera validé (sous 5 à 10 min).'
      );
      return;
    }

    // Aucune demande (ou rejetée) → onboarding (Stripe + demande de vérification).
    router.push('/celebrity-onboarding' as any);
  };

  // Recharge le nombre d'événements / sessions vidéo en cours à chaque retour sur l'écran
  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        try {
          const [items, fanEvent] = await Promise.all([
            getMyScheduledEvents().catch(() => []),
            getActiveFanEvent().catch(() => null),
          ]);
          if (!active) return;
          const now = Date.now();
          const isVideo = (e: any) => e?.event_type === 'live_video';
          // Catégorise un événement : à venir / en cours / passé (cf. ends_at vs now).
          const categorize = (e: any): 'upcoming' | 'ongoing' | 'past' => {
            const endsAt = e?.ends_at ? new Date(e.ends_at).getTime() : 0;
            const startsAt = e?.starts_at ? new Date(e.starts_at).getTime() : 0;
            if (e?.status === 'ended' || (endsAt && endsAt < now)) return 'past';
            if (startsAt && startsAt > now) return 'upcoming';
            return 'ongoing';
          };
          const counts = {
            event: { upcoming: 0, ongoing: 0, past: 0 },
            video: { upcoming: 0, ongoing: 0, past: 0 },
          };
          for (const e of items as any[]) {
            const bucket = isVideo(e) ? counts.video : counts.event;
            bucket[categorize(e)] += 1;
          }
          // L'événement rejoint actif (non null = non expiré, getActiveFanEvent
          // l'a déjà vérifié). S'il est programmé pour plus tard (starts_at futur),
          // il compte comme « à venir » (réservation) ; sinon « en cours ».
          if (fanEvent) {
            const fanBucket = isVideo(fanEvent) ? counts.video : counts.event;
            fanBucket[categorize(fanEvent)] += 1;
          }
          setEventUpcomingCount(counts.event.upcoming);
          setEventOngoingCount(counts.event.ongoing);
          setEventPastCount(counts.event.past);
          setVideoUpcomingCount(counts.video.upcoming);
          setVideoOngoingCount(counts.video.ongoing);
          setVideoPastCount(counts.video.past);
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

  // Navigue vers la liste pré-filtrée (catégorie + type événement/vidéo).
  const goToList = (view: 'upcoming' | 'ongoing' | 'past', kind: 'event' | 'video') => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.push({ pathname: '/celebrity-menu', params: { view, kind } } as any);
  };

  // Petit bouton-raccourci pleine largeur avec badge compteur.
  const renderHistoryBtn = (
    label: string,
    count: number,
    view: 'upcoming' | 'ongoing' | 'past',
    kind: 'event' | 'video',
  ) => {
    const accent = '#10b981'; // vert pour tous (événements ET sessions vidéo)

    // Tous les boutons liste (à venir / en cours / passés) restent SANS couleur de fond :
    // transparent + contour léger. Seul le bouton « Rejoindre » de chaque carte est plein
    // (vert pour la dédicace, violet pour la vidéo).
    const bg = 'transparent';
    const border = `${accent}66`;
    const fg = accent;
    const badgeBg = accent;
    const badgeFg = '#ffffff';

    return (
      <TouchableOpacity
        style={[styles.historyBtn, { backgroundColor: bg, borderColor: border }]}
        onPress={() => goToList(view, kind)}
        activeOpacity={0.85}
      >
        <CalendarClock size={18} color={fg} strokeWidth={2.2} />
        <Text style={[styles.historyBtnText, { color: fg }]}>
          {label}
        </Text>
        {count > 0 && (
          <View style={[styles.historyBadge, { backgroundColor: badgeBg }]}>
            <Text style={[styles.historyBadgeText, { color: badgeFg }]}>{count}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderCard = (
    accent: string,
    icon: React.ReactNode,
    badgeIcon: React.ReactNode,
    badgeLabel: string,
    title: string,
    description: string,
    createPath: string,
    joinPath: string,
  ) => (
    <View style={[styles.card, { borderColor: `${accent}40` }]}>
      <LinearGradient colors={[`${accent}26`, `${accent}0d`]} style={styles.cardGradient}>
        <View style={[styles.typeBadge, { backgroundColor: `${accent}26`, borderColor: `${accent}59` }]}>
          {badgeIcon}
          <Text style={[styles.typeBadgeText, { color: accent }]}>{badgeLabel}</Text>
        </View>
        <View style={[styles.iconContainer, { backgroundColor: `${accent}1f` }]}>{icon}</View>
        <Text style={[styles.cardTitle, { color: accent }]}>{title}</Text>
        <Text style={styles.cardDescription}>{description}</Text>

        <View style={styles.btnRow}>
          {isCelebrity && (
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: accent }]}
              onPress={() => handleCreate(createPath)}
              activeOpacity={0.85}
            >
              <Plus size={18} color="#ffffff" strokeWidth={2.5} />
              <Text style={styles.btnPrimaryText}>{t('fanChoiceCreateBtn')}</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.btn, { backgroundColor: accent }]}
            onPress={() => handleChoice(joinPath)}
            activeOpacity={0.85}
          >
            <LogIn size={18} color="#ffffff" strokeWidth={2.5} />
            <Text style={styles.btnPrimaryText}>{t('fanChoiceJoinBtn')}</Text>
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
              <PenTool size={40} color="#10b981" strokeWidth={1.5} />,
              <PenTool size={14} color="#10b981" strokeWidth={2.5} />,
              t('eventTypeDedicace' as any) || 'Dédicace',
              t('fanChoiceEventTitle'),
              t('fanChoiceEventDesc'),
              '/create-event',
              '/join-event',
            )}

            <View style={styles.historyGroup}>
              {renderHistoryBtn(
                t('eventsUpcoming' as any) || 'Événements à venir',
                eventUpcomingCount, 'upcoming', 'event',
              )}
              {renderHistoryBtn(
                t('eventsOngoing' as any) || 'Événements en cours',
                eventOngoingCount, 'ongoing', 'event',
              )}
              {isCelebrity && renderHistoryBtn(
                t('eventsPast' as any) || 'Événements passés',
                eventPastCount, 'past', 'event',
              )}
            </View>

            {renderCard(
              '#6366f1',
              <Video size={40} color="#6366f1" strokeWidth={1.5} />,
              <Video size={14} color="#6366f1" strokeWidth={2.5} />,
              t('eventTypeLiveVideo' as any) || 'Live vidéo',
              t('fanChoiceVideoTitle'),
              t('fanChoiceVideoDesc2'),
              '/create-live-session',
              '/join-live-session',
            )}

            <View style={styles.historyGroup}>
              {renderHistoryBtn(
                t('videoSessionsUpcoming' as any) || 'Sessions vidéo à venir',
                videoUpcomingCount, 'upcoming', 'video',
              )}
              {renderHistoryBtn(
                t('videoSessionsOngoing' as any) || 'Sessions vidéo en cours',
                videoOngoingCount, 'ongoing', 'video',
              )}
              {isCelebrity && renderHistoryBtn(
                t('videoSessionsPast' as any) || 'Sessions vidéo passées',
                videoPastCount, 'past', 'video',
              )}
            </View>
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
    marginBottom: 24,
  },
  cardsContainer: {
    gap: 18,
  },
  historyGroup: {
    gap: 8,
    marginTop: -8,
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
  },
  historyBtnText: {
    color: '#10b981',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  historyBtnVideo: {
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    borderColor: 'rgba(99, 102, 241, 0.3)',
    marginTop: 0,
  },
  historyBtnTextVideo: {
    color: '#6366f1',
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
    padding: 20,
    alignItems: 'center',
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 11,
    marginBottom: 12,
  },
  typeBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 21,
    fontWeight: '800',
    color: '#ffffff',
    marginBottom: 6,
    textAlign: 'center',
  },
  cardDescription: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
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
