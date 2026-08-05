import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  ScrollView,
  Modal,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import PlyzHeader from '@/components/PlyzHeader';
import { PenTool, Video, Plus, LogIn, CalendarClock, Sparkles, Search, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAutoTranslate } from '@/utils/translation';
import { getDateLocale } from '@/utils/dateLocale';
import { useAuth } from '@/contexts/AuthContext';
import { useAuthPrompt } from '@/contexts/AuthPromptContext';
import { useCelebrityMode } from '@/contexts/CelebrityModeContext';
import { supabase } from '@/utils/supabase';
import { authedFetch } from '@/utils/authedFetch';
import { showAlert } from '@/utils/alertHelper';
import BottomNav, { BOTTOM_NAV_HEIGHT } from '@/components/BottomNav';
import AccountAvatarButton from '@/components/AccountAvatarButton';
import { getMyScheduledEvents, getMergedFanEvents } from '@/utils/eventSessionStorage';

// Base API serveur (vérification de compte). Sur web on passe par le proxy local.
const API_BASE = process.env.EXPO_PUBLIC_STRIPE_SERVER_URL || '';

export default function FanChoiceScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { user } = useAuth();
  const { requireAuth } = useAuthPrompt();
  const { enableCelebrityMode, isCelebrity } = useCelebrityMode();
  // 6 compteurs : à venir / en cours / passés × événements / vidéo
  // Catalogue public : ce qui permet enfin a un fan de DECOUVRIR des evenements
  // sans code ni QR.
  const [catalogue, setCatalogue] = useState<any[]>([]);
  const [catalogueLoading, setCatalogueLoading] = useState(true);
  const [catalogueFailed, setCatalogueFailed] = useState(false);
  const [recherche, setRecherche] = useState('');
  const [periode, setPeriode] = useState<'ongoing' | 'upcoming' | 'all'>('all');

  const [eventUpcomingCount, setEventUpcomingCount] = useState(0);
  const [eventOngoingCount, setEventOngoingCount] = useState(0);
  const [eventPastCount, setEventPastCount] = useState(0);
  const [videoUpcomingCount, setVideoUpcomingCount] = useState(0);
  const [videoOngoingCount, setVideoOngoingCount] = useState(0);
  const [videoPastCount, setVideoPastCount] = useState(0);
  // Popup d'explication affichée UNE SEULE fois (au tout premier accès à l'écran Événements).
  const [showIntro, setShowIntro] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const seen = await AsyncStorage.getItem('plyz_events_intro_seen');
        if (seen !== '1') setShowIntro(true);
      } catch { /* pas bloquant */ }
    })();
  }, []);

  const dismissIntro = async () => {
    setShowIntro(false);
    try { await AsyncStorage.setItem('plyz_events_intro_seen', '1'); } catch { /* pas bloquant */ }
  };

  // Cliquer « Créer » : exige un compte, puis bascule en mode célébrité et
  // route selon le statut de vérification.
  const handleCreate = (createPath: string) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    requireAuth(() => proceedCreate(createPath), {
      reason: t('createAuthReason' as any) || 'Crée ton compte pour organiser un événement',
      requireBillingIdentity: false,
      celebrityPitch: true,
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
          authedFetch(`${API_BASE}/api/${type}-verification-status?user_id=${user.id}`)
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
          const [items, fanEvents] = await Promise.all([
            getMyScheduledEvents().catch(() => []),
            getMergedFanEvents().catch(() => []),
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
          // Les événements rejoints par le fan, lus depuis la BASE (+ cache local fusionné).
          // S'ils sont programmés pour plus tard (starts_at futur), ils comptent comme
          // « à venir » (réservation) ; sinon « en cours ».
          for (const fanEvent of fanEvents as any[]) {
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
  // Traduction des titres : ils sont ecrits par les personnalites, dans leur
  // langue. Un fan doit lire le catalogue dans la sienne.
  const trCatalogue = useAutoTranslate(catalogue.map((e: any) => e.title));

  const chargerCatalogue = useCallback(async () => {
    setCatalogueFailed(false);
    try {
      const params = new URLSearchParams();
      if (recherche.trim()) params.set('search', recherche.trim());
      if (periode !== 'all') params.set('when', periode);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(API_BASE + '/api/events?' + params.toString(), { signal: controller.signal });
      clearTimeout(timeoutId);
      const data = await res.json();
      setCatalogue(Array.isArray(data.events) ? data.events : []);
    } catch {
      // Un echec de chargement n'est PAS une absence d'evenements : sans cette
      // distinction, une coupure reseau ferait croire que Plyz est vide.
      setCatalogueFailed(true);
      setCatalogue([]);
    } finally {
      setCatalogueLoading(false);
    }
  }, [recherche, periode]);

  // Delai court avant de relancer : evite une requete a chaque lettre tapee.
  useEffect(() => {
    const timer = setTimeout(chargerCatalogue, 300);
    return () => clearTimeout(timer);
  }, [chargerCatalogue]);

  const formatCreneau = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString(getDateLocale(), { day: 'numeric', month: 'short' })
      + ' · ' + d.toLocaleTimeString(getDateLocale(), { hour: '2-digit', minute: '2-digit' });
  };
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

          {/* Le bouton coloré = action principale du rôle : « Créer » pour la célébrité,
              « Rejoindre » pour le fan. Donc « Rejoindre » est plein UNIQUEMENT si le fan
              n'a pas le bouton « Créer » à côté ; sinon il reste en outline. */}
          <TouchableOpacity
            style={[styles.btn, isCelebrity ? [styles.btnOutline, { borderColor: accent }] : { backgroundColor: accent }]}
            onPress={() => handleChoice(joinPath)}
            activeOpacity={0.85}
          >
            <LogIn size={18} color={isCelebrity ? accent : '#ffffff'} strokeWidth={2.5} />
            <Text style={isCelebrity ? [styles.btnOutlineText, { color: accent }] : styles.btnPrimaryText}>{t('fanChoiceJoinBtn')}</Text>
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

          {/* Deux tuiles compactes plutôt que deux grandes cartes empilées : la
              liste des événements commence dès le premier écran au lieu d'être
              repoussée tout en bas. La TUILE ENTIÈRE est cliquable — pas de petit
              bouton à l'intérieur — donc la cible tactile est bien plus grande
              qu'avant. */}
          <View style={styles.tuiles}>
            <TouchableOpacity
              style={[styles.tuile, { borderColor: 'rgba(16,185,129,0.35)', backgroundColor: 'rgba(16,185,129,0.10)' }]}
              onPress={() => handleChoice('/join-event')}
              activeOpacity={0.85}
            >
              <View style={[styles.tuileIcone, { backgroundColor: 'rgba(16,185,129,0.16)' }]}>
                <PenTool size={26} color="#10b981" strokeWidth={1.8} />
              </View>
              <Text style={[styles.tuileTitre, { color: '#10b981' }]}>
                {t('eventTypeDedicace' as any) || 'Dédicace'}
              </Text>
              <Text style={styles.tuileAction}>{t('fanChoiceJoinBtn')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tuile, { borderColor: 'rgba(99,102,241,0.35)', backgroundColor: 'rgba(99,102,241,0.10)' }]}
              onPress={() => handleChoice('/join-live-session')}
              activeOpacity={0.85}
            >
              <View style={[styles.tuileIcone, { backgroundColor: 'rgba(99,102,241,0.16)' }]}>
                <Video size={26} color="#6366f1" strokeWidth={1.8} />
              </View>
              <Text style={[styles.tuileTitre, { color: '#6366f1' }]}>
                {t('eventTypeLiveVideo' as any) || 'Live vidéo'}
              </Text>
              <Text style={styles.tuileAction}>{t('fanChoiceJoinBtn')}</Text>
            </TouchableOpacity>
          </View>

          {/* Créer reste l'action principale d'une personnalité : elle garde ses
              deux boutons, sur une ligne dédiée pour ne pas encombrer les tuiles. */}
          {isCelebrity && (
            <View style={styles.creerRangee}>
              <TouchableOpacity
                style={[styles.creerBtn, { backgroundColor: '#10b981' }]}
                onPress={() => handleCreate('/create-event')}
                activeOpacity={0.85}
              >
                <Plus size={16} color="#fff" strokeWidth={2.5} />
                <Text style={styles.creerTexte}>{t('celebrityEventSimple' as any) || 'Créer une dédicace'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.creerBtn, { backgroundColor: '#6366f1' }]}
                onPress={() => handleCreate('/create-live-session')}
                activeOpacity={0.85}
              >
                <Plus size={16} color="#fff" strokeWidth={2.5} />
                <Text style={styles.creerTexte}>{t('celebrityLiveSession' as any) || 'Créer un live'}</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Catalogue : c'est ce qui manquait le plus. Sans lui, un fan ne
              pouvait DÉCOUVRIR aucun événement — il lui fallait un code. */}
          <View style={styles.recherche}>
            <Search size={18} color="#6b7280" />
            <TextInput
              style={styles.rechercheInput}
              value={recherche}
              onChangeText={setRecherche}
              placeholder={t('evtSearchPlaceholder' as any) || 'Rechercher une personnalité, un événement…'}
              placeholderTextColor="#6b7280"
            />
            {!!recherche && (
              <TouchableOpacity onPress={() => setRecherche('')} hitSlop={8}>
                <X size={17} color="#6b7280" />
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.filtres}>
            {([
              { k: 'ongoing', l: t('evtFilterOngoing' as any) || 'En cours' },
              { k: 'upcoming', l: t('evtFilterUpcoming' as any) || 'À venir' },
              { k: 'all', l: t('evtFilterAll' as any) || 'Tous' },
            ] as const).map(f => (
              <TouchableOpacity
                key={f.k}
                style={[styles.filtre, periode === f.k && styles.filtreActif]}
                onPress={() => setPeriode(f.k)}
                activeOpacity={0.8}
              >
                <Text style={[styles.filtreTexte, periode === f.k && styles.filtreTexteActif]}>{f.l}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {catalogueLoading ? (
            <ActivityIndicator color="#10b981" style={{ marginTop: 28 }} />
          ) : catalogueFailed ? (
            <View style={styles.vide}>
              <Text style={styles.videTexte}>{t('feedLoadFailed' as any) || 'Impossible de charger'}</Text>
              <TouchableOpacity style={styles.reessayer} onPress={chargerCatalogue}>
                <Text style={styles.reessayerTexte}>{t('retry') || 'Réessayer'}</Text>
              </TouchableOpacity>
            </View>
          ) : catalogue.length === 0 ? (
            <View style={styles.vide}>
              <Text style={styles.videTexte}>
                {recherche
                  ? (t('evtNoMatch' as any) || 'Aucun événement ne correspond à ta recherche')
                  : (t('noEvents' as any) || 'Aucun événement pour le moment')}
              </Text>
            </View>
          ) : (
            catalogue.map(ev => (
              <TouchableOpacity
                key={ev.kind + ev.id}
                style={styles.evtCarte}
                onPress={() => router.push(`/celebrity-detail?id=${ev.celebrity_id}` as any)}
                activeOpacity={0.85}
              >
                <View style={styles.evtEntete}>
                  <View style={[styles.evtPastille, { backgroundColor: ev.kind === 'video' ? '#6366f1' : '#10b981' }]} />
                  <Text style={styles.evtNom} numberOfLines={1}>{ev.celebrity_name}</Text>
                  {ev.is_live && (
                    <View style={styles.evtLive}>
                      <Text style={styles.evtLiveTexte}>{t('eventLive' as any) || 'EN COURS'}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.evtTitre} numberOfLines={2}>{trCatalogue(ev.title)}</Text>
                <View style={styles.evtMeta}>
                  {!!ev.scheduled_at && (
                    <Text style={styles.evtMetaTexte}>{formatCreneau(ev.scheduled_at)}</Text>
                  )}
                  {!!ev.location && <Text style={styles.evtMetaTexte}>· {ev.location}</Text>}
                  {ev.price_cents > 0 && (
                    <Text style={[styles.evtMetaTexte, { color: '#10b981', fontWeight: '700' }]}>
                      · {(ev.price_cents / 100).toFixed(2).replace('.', ',')} €
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            ))
          )}

        </ScrollView>
      </View>

      <AccountAvatarButton />
      <BottomNav />

      <Modal
        visible={showIntro}
        transparent
        animationType="fade"
        onRequestClose={dismissIntro}
      >
        <View style={styles.introOverlay}>
          <View style={styles.introCard}>
            <View style={styles.introIconWrap}>
              <Sparkles size={28} color="#fbbf24" strokeWidth={2} />
            </View>
            <Text style={styles.introTitle}>
              {t('eventsIntroTitle' as any) || 'Bienvenue dans les Événements'}
            </Text>

            <View style={styles.introRow}>
              <View style={[styles.introRowIcon, { backgroundColor: 'rgba(16,185,129,0.15)' }]}>
                <LogIn size={20} color="#10b981" strokeWidth={2.4} />
              </View>
              <View style={styles.introRowText}>
                <Text style={styles.introRowTitle}>
                  {t('eventsIntroFanTitle' as any) || 'Vous êtes un fan ?'}
                </Text>
                <Text style={styles.introRowBody}>
                  {t('eventsIntroFanBody' as any) || 'Touchez « Rejoindre » et entrez le code que la célébrité vous a communiqué pour votre dédicace photo ou votre appel vidéo en direct.'}
                </Text>
              </View>
            </View>

            <View style={styles.introRow}>
              <View style={[styles.introRowIcon, { backgroundColor: 'rgba(99,102,241,0.15)' }]}>
                <Plus size={20} color="#6366f1" strokeWidth={2.4} />
              </View>
              <View style={styles.introRowText}>
                <Text style={styles.introRowTitle}>
                  {t('eventsIntroCelebTitle' as any) || 'Vous êtes une célébrité ?'}
                </Text>
                <Text style={styles.introRowBody}>
                  {t('eventsIntroCelebBody' as any) || 'Touchez « Créer » pour organiser votre événement et recevoir vos fans. Le bouton « Créer » apparaît une fois votre compte de célébrité validé.'}
                </Text>
              </View>
            </View>

            <TouchableOpacity style={styles.introBtn} onPress={dismissIntro} activeOpacity={0.85}>
              <Text style={styles.introBtnText}>
                {t('eventsIntroGotIt' as any) || "J'ai compris"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  tuiles: { flexDirection: 'row', gap: 12, marginTop: 4 },
  tuile: {
    flex: 1, borderRadius: 18, borderWidth: 1, paddingVertical: 18,
    paddingHorizontal: 12, alignItems: 'center', gap: 8,
  },
  tuileIcone: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  tuileTitre: { fontSize: 15, fontWeight: '800' },
  tuileAction: { color: 'rgba(255,255,255,0.55)', fontSize: 12, fontWeight: '600' },
  creerRangee: { flexDirection: 'row', gap: 10, marginTop: 12 },
  creerBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 11, borderRadius: 12,
  },
  creerTexte: { color: '#fff', fontSize: 13, fontWeight: '700' },
  recherche: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 22,
    backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 11,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  rechercheInput: { flex: 1, color: '#fff', fontSize: 15, padding: 0 },
  filtres: { flexDirection: 'row', gap: 8, marginTop: 12, marginBottom: 4 },
  filtre: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  filtreActif: { backgroundColor: 'rgba(16,185,129,0.18)', borderColor: 'rgba(16,185,129,0.5)' },
  filtreTexte: { color: '#9ca3af', fontSize: 13, fontWeight: '600' },
  filtreTexteActif: { color: '#10b981' },
  vide: { alignItems: 'center', marginTop: 34, gap: 12 },
  videTexte: { color: '#6b7280', fontSize: 14, textAlign: 'center' },
  reessayer: {
    paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20,
    backgroundColor: 'rgba(16,185,129,0.15)', borderWidth: 1, borderColor: 'rgba(16,185,129,0.4)',
  },
  reessayerTexte: { color: '#10b981', fontSize: 13, fontWeight: '700' },
  evtCarte: {
    backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 14, padding: 14, marginTop: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
  },
  evtEntete: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  evtPastille: { width: 8, height: 8, borderRadius: 4 },
  evtNom: { color: '#fff', fontSize: 14, fontWeight: '700', flex: 1 },
  evtLive: {
    backgroundColor: 'rgba(239,68,68,0.18)', borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.45)',
  },
  evtLiveTexte: { color: '#ef4444', fontSize: 10, fontWeight: '800' },
  evtTitre: { color: '#d1d5db', fontSize: 15, marginTop: 8, lineHeight: 21 },
  evtMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  evtMetaTexte: { color: '#9ca3af', fontSize: 12 },
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
  introOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  introCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 22,
    padding: 24,
    width: '100%',
    maxWidth: 380,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  introIconWrap: {
    alignSelf: 'center',
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(251,191,36,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  introTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 20,
  },
  introRow: {
    flexDirection: 'row',
    gap: 14,
    marginBottom: 18,
  },
  introRowIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  introRowText: {
    flex: 1,
  },
  introRowTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 4,
  },
  introRowBody: {
    fontSize: 13.5,
    lineHeight: 19,
    color: 'rgba(255,255,255,0.7)',
  },
  introBtn: {
    marginTop: 6,
    backgroundColor: '#10b981',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  introBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
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
