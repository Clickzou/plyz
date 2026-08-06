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
import { ROLE_CHOICE_KEY } from '@/components/RoleChoiceOverlay';

// Base API serveur (vérification de compte). Sur web on passe par le proxy local.
const API_BASE = process.env.EXPO_PUBLIC_STRIPE_SERVER_URL || '';

// Mode d'emploi vu, mémorisé séparément pour chaque rôle.
const introKey = (celeb: boolean) =>
  celeb ? 'plyz_events_intro_seen_celeb' : 'plyz_events_intro_seen_fan';

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
  // Popup d'explication affichée UNE SEULE fois PAR RÔLE : le mode d'emploi du
  // fan et celui de la personnalité ne parlent pas des mêmes boutons. Avec une
  // clé unique, celui qui passe de fan à personnalité n'aurait jamais vu le sien.
  const [showIntro, setShowIntro] = useState(false);
  // Appels vidéo privés en cours. L'accès n'existait que dans Compte, tout en
  // bas du menu : personne ne va chercher là une demande qu'il vient de faire.
  // Sa place est ici, avec le reste de ce que le fan a engagé.
  const [vcrActifs, setVcrActifs] = useState(0);
  const [vcrARegler, setVcrARegler] = useState(0);
  // Rôle déclaré au premier lancement. Une personnalité qui s'est annoncée mais
  // n'a pas terminé son inscription doit garder l'écran de SON rôle : sinon elle
  // retombe sur l'interface fan, exactement le mur qu'on vient de supprimer.
  // `undefined` = rôle pas encore lu. On attend cette lecture avant de décider
  // quelle intro montrer, sinon la version fan s'affiche une fraction de seconde
  // à une personnalité.
  const [roleDeclare, setRoleDeclare] = useState<string | null | undefined>(undefined);
  const modeCeleb = isCelebrity || roleDeclare === 'celebrity';

  useEffect(() => {
    (async () => {
      try {
        setRoleDeclare(await AsyncStorage.getItem(ROLE_CHOICE_KEY));
      } catch {
        setRoleDeclare(null);
      }
    })();
  }, []);

  useEffect(() => {
    if (roleDeclare === undefined) return;
    (async () => {
      try {
        // L'ancienne clé unique n'est PAS reprise : le mode d'emploi qu'elle
        // validait annonçait un bouton « Créer » qui n'apparaissait qu'après
        // validation du compte — ce n'est plus vrai. Mieux vaut revoir une fois
        // la version juste que garder en tête une consigne fausse.
        const seen = await AsyncStorage.getItem(introKey(modeCeleb));
        if (seen !== '1') setShowIntro(true);
      } catch { /* pas bloquant */ }
    })();
  }, [roleDeclare, modeCeleb]);

  const dismissIntro = async () => {
    setShowIntro(false);
    try { await AsyncStorage.setItem(introKey(modeCeleb), '1'); } catch { /* pas bloquant */ }
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
          // Délai ANNONCÉ CONFORME à la réalité : la vérification est examinée à
          // la main. Promettre « 5 à 10 min » faisait attendre pour rien, puis
          // conclure que l'app était cassée.
          'Ton compte célébrité est en cours de vérification. Tu pourras créer tes événements dès qu\'il sera validé — réponse sous 24 h ouvrées.'
      );
      return;
    }

    // Aucune demande (ou rejetée) → onboarding (Stripe + demande de vérification).
    router.push('/celebrity-onboarding' as any);
  };

  // Recharge le nombre d'événements / sessions vidéo en cours à chaque retour sur l'écran
  // Compte les appels vidéo privés encore ouverts, pour afficher une pastille.
  // Une demande expire en 48 h et un créneau accepté doit être réglé : le fan
  // doit voir qu'il a quelque chose en cours sans avoir à ouvrir l'écran.
  useFocusEffect(
    useCallback(() => {
      let vivant = true;
      (async () => {
        if (!user?.id || !API_BASE) { setVcrActifs(0); setVcrARegler(0); return; }
        try {
          const res = await authedFetch(`${API_BASE}/api/video-call-requests`);
          if (!res.ok) return;
          const { requests } = await res.json();
          if (!vivant || !Array.isArray(requests)) return;
          const ouverts = requests.filter((r: any) => ['pending', 'accepted', 'paid'].includes(r.status));
          setVcrActifs(ouverts.length);
          setVcrARegler(ouverts.filter((r: any) => r.status === 'accepted' && r.role === 'fan').length);
        } catch { /* réseau : la pastille reste à sa valeur précédente */ }
      })();
      return () => { vivant = false; };
    }, [user?.id])
  );

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
  // Textes du mode d'emploi propres au rôle (pas encore dans les 15 locales).
  const trUI = useAutoTranslate([
    'Mes événements', 'Mes participations', 'En cours', 'À venir', 'Passés',
  ]);
  const trIntro = useAutoTranslate([
    'Rejoindre un événement',
    'Créer votre événement',
    'Touchez « Créer » sur la dédicace ou le live vidéo pour organiser votre événement. Vos fans vous rejoindront ensuite avec le code ou le QR code.',
  ]);

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
          <Text style={styles.subtitle}>
            {modeCeleb
              ? (t('fanChoiceSubtitleCeleb' as any) || 'Créez votre événement')
              : (t('fanChoiceSubtitleFan' as any) || 'Rejoignez un événement')}
          </Text>

          {/* Deux tuiles compactes plutôt que deux grandes cartes empilées : la
              liste des événements commence dès le premier écran au lieu d'être
              repoussée tout en bas. La TUILE ENTIÈRE est cliquable — pas de petit
              bouton à l'intérieur — donc la cible tactile est bien plus grande
              qu'avant.

              Chaque tuile porte l'action du RÔLE : une personnalité vient ici
              pour créer, un fan pour rejoindre. Auparavant les deux tuiles
              disaient « Rejoindre » à tout le monde, et la personnalité devait
              repérer deux boutons « + » séparés plus bas — d'où des créations
              manquées. Une personnalité qui veut rejoindre un événement passe
              par le catalogue juste en dessous. */}
          <View style={styles.tuiles}>
            <TouchableOpacity
              style={[styles.tuile, { borderColor: 'rgba(16,185,129,0.35)', backgroundColor: 'rgba(16,185,129,0.10)' }]}
              onPress={() => (modeCeleb ? handleCreate('/create-event') : handleChoice('/join-event'))}
              activeOpacity={0.85}
            >
              <View style={[styles.tuileIcone, { backgroundColor: 'rgba(16,185,129,0.16)' }]}>
                <PenTool size={26} color="#10b981" strokeWidth={1.8} />
              </View>
              <Text style={[styles.tuileTitre, { color: '#10b981' }]}>
                {t('eventTypeDedicace' as any) || 'Dédicace'}
              </Text>
              <Text style={styles.tuileAction}>
                {modeCeleb ? t('fanChoiceCreateBtn') : t('fanChoiceJoinBtn')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tuile, { borderColor: 'rgba(99,102,241,0.35)', backgroundColor: 'rgba(99,102,241,0.10)' }]}
              onPress={() => (modeCeleb ? handleCreate('/create-live-session') : handleChoice('/join-live-session'))}
              activeOpacity={0.85}
            >
              <View style={[styles.tuileIcone, { backgroundColor: 'rgba(99,102,241,0.16)' }]}>
                <Video size={26} color="#6366f1" strokeWidth={1.8} />
              </View>
              <Text style={[styles.tuileTitre, { color: '#6366f1' }]}>
                {t('eventTypeLiveVideo' as any) || 'Live vidéo'}
              </Text>
              <Text style={styles.tuileAction}>
                {modeCeleb ? t('fanChoiceCreateBtn') : t('fanChoiceJoinBtn')}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Appels vidéo privés — accessibles depuis l'écran où l'on gère ce
              qu'on a engagé, et non depuis le bas du menu Compte. Le même écran
              sert aux deux rôles : le fan y suit ses demandes, la personnalité
              celles qu'elle reçoit. La pastille compte ce qui est encore ouvert :
              une demande expire en 48 h, un créneau accepté attend son règlement. */}
          <TouchableOpacity
            style={styles.vcrAcces}
            onPress={() => requireAuth(() => router.push('/my-video-calls' as any), {
              reason: t('vcrAuthReason' as any) || 'Connecte-toi pour voir tes appels vidéo privés',
              requireBillingIdentity: false,
            })}
            activeOpacity={0.85}
          >
            <View style={styles.vcrAccesIcone}>
              <Video size={20} color="#a78bfa" strokeWidth={1.9} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.vcrAccesTitre}>
                {modeCeleb
                  ? (t('vcrEntryCeleb' as any) || 'Demandes d\'appel vidéo privé')
                  : (t('vcrEntryFan' as any) || 'Mes appels vidéo privés')}
              </Text>
              <Text style={styles.vcrAccesSous}>
                {vcrARegler > 0
                  ? (t('vcrEntryToPay' as any) || 'Un créneau vous attend — à régler')
                  : vcrActifs > 0
                    ? (t('vcrEntryOngoing' as any) || 'En cours')
                    : (t('vcrEntryNone' as any) || 'Aucune demande en cours')}
              </Text>
            </View>
            {vcrActifs > 0 && (
              <View style={[styles.vcrPastille, vcrARegler > 0 && { backgroundColor: '#f59e0b' }]}>
                <Text style={styles.vcrPastilleTexte}>{vcrActifs}</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Les deux boutons « + » qui doublonnaient les tuiles ont été retirés :
              la création se fait désormais depuis la tuile elle-même. */}

          {/* Retour à SES événements — en cours, à venir, passés.
              Cet accès n'existait plus : la fonction qui l'affichait était
              restée dans le fichier sans jamais être appelée. Une personnalité
              qui quittait sa séance de dédicace ne pouvait donc y revenir que
              par hasard, et ne voyait ni ses événements passés ni les annulés.
              Le compteur « en cours » est mis en avant : c'est celui qui appelle
              une action tout de suite. */}
          <View style={styles.mesEvenements}>
            <Text style={styles.mesEvenementsTitre}>
              {modeCeleb
                ? (t('myEventsCeleb' as any) || trUI('Mes événements'))
                : (t('myEventsFan' as any) || trUI('Mes participations'))}
            </Text>
            <View style={styles.mesEvenementsLigne}>
              {([
                { vue: 'ongoing' as const, libelle: trUI('En cours'), n: eventOngoingCount + videoOngoingCount, accent: '#10b981' },
                { vue: 'upcoming' as const, libelle: trUI('À venir'), n: eventUpcomingCount + videoUpcomingCount, accent: '#6366f1' },
                { vue: 'past' as const, libelle: trUI('Passés'), n: eventPastCount + videoPastCount, accent: '#6b7280' },
              ]).map((f) => (
                <TouchableOpacity
                  key={f.vue}
                  style={[styles.mesEvenementsCase, { borderColor: `${f.accent}55` }]}
                  onPress={() => goToList(f.vue, 'event')}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.mesEvenementsNombre, { color: f.accent }]}>{f.n}</Text>
                  <Text style={styles.mesEvenementsLibelle}>{f.libelle}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

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

                {/* Rejoindre en un geste. Le catalogue menait au profil de la
                    célébrité et n'affichait pas le code : le fan voyait
                    l'événement, mais devait ressortir, ouvrir « Rejoindre » et
                    saisir à la main un code qu'on ne lui montrait nulle part.
                    L'app le connaît — les écrans de participation acceptent
                    déjà un code en paramètre et lancent la recherche seuls. */}
                {!!ev.code && (
                  <TouchableOpacity
                    style={[styles.evtRejoindre, ev.kind === 'video' && styles.evtRejoindreVideo]}
                    onPress={() =>
                      router.push(
                        (ev.kind === 'video'
                          ? `/join-live-session?code=${ev.code}`
                          : `/join-event?code=${ev.code}`) as any
                      )
                    }
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.evtRejoindreTexte, ev.kind === 'video' && { color: '#a5b4fc' }]}>
                      {t('joinEvent' as any) || 'Rejoindre'} →
                    </Text>
                  </TouchableOpacity>
                )}
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

            {/* Un seul mode d'emploi : celui du rôle choisi. Présenter les deux
                obligeait à trier soi-même, et la moitié du texte parlait de
                boutons que l'on n'a pas à l'écran. */}
            <View style={styles.introRow}>
              <View style={[styles.introRowIcon, {
                backgroundColor: modeCeleb ? 'rgba(99,102,241,0.15)' : 'rgba(16,185,129,0.15)',
              }]}>
                {modeCeleb
                  ? <Plus size={20} color="#6366f1" strokeWidth={2.4} />
                  : <LogIn size={20} color="#10b981" strokeWidth={2.4} />}
              </View>
              <View style={styles.introRowText}>
                <Text style={styles.introRowTitle}>
                  {modeCeleb
                    ? trIntro('Créer votre événement')
                    : trIntro('Rejoindre un événement')}
                </Text>
                <Text style={styles.introRowBody}>
                  {modeCeleb
                    ? trIntro('Touchez « Créer » sur la dédicace ou le live vidéo pour organiser votre événement. Vos fans vous rejoindront ensuite avec le code ou le QR code.')
                    : (t('eventsIntroFanBody' as any) || 'Touchez « Rejoindre » et entrez le code que la célébrité vous a communiqué pour votre dédicace photo ou votre appel vidéo en direct.')}
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
  mesEvenements: { marginTop: 16 },
  mesEvenementsTitre: {
    color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: '800',
    letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8,
  },
  mesEvenementsLigne: { flexDirection: 'row', gap: 10 },
  mesEvenementsCase: {
    flex: 1, borderWidth: 1, borderRadius: 14,
    paddingVertical: 12, alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  mesEvenementsNombre: { fontSize: 20, fontWeight: '800' },
  mesEvenementsLibelle: { color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 2, fontWeight: '600' },
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
  vcrAcces: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: 'rgba(99,102,241,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.30)',
  },
  vcrAccesIcone: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(99,102,241,0.18)',
  },
  vcrAccesTitre: { color: '#fff', fontSize: 15, fontWeight: '700' },
  vcrAccesSous: { color: '#9ca3af', fontSize: 12, marginTop: 2 },
  vcrPastille: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    paddingHorizontal: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6366f1',
  },
  vcrPastilleTexte: { color: '#fff', fontSize: 13, fontWeight: '800' },
  evtRejoindre: {
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
    backgroundColor: 'rgba(16,185,129,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.4)',
  },
  evtRejoindreVideo: {
    backgroundColor: 'rgba(99,102,241,0.15)',
    borderColor: 'rgba(99,102,241,0.45)',
  },
  evtRejoindreTexte: { color: '#10b981', fontSize: 13, fontWeight: '700' },
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
