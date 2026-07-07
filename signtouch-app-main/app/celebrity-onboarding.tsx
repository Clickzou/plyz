import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Platform, TextInput, Image, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft, Star, Video, QrCode,
  DollarSign, Users, CreditCard, ArrowRight,
  CheckCircle, Zap, TrendingUp, Globe, Building2, Award,
  Camera, Link2, ShieldCheck,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { showAlert } from '@/utils/alertHelper';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAutoTranslate } from '@/utils/translation';
import { useCelebrityMode } from '@/contexts/CelebrityModeContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import StripeConnectModal from '@/components/StripeConnectModal';
import PhotoSourceSheet from '@/components/PhotoSourceSheet';
import { upsertUserProfile } from '@/utils/userProfile';
import { supabase } from '@/utils/supabase';
import { authedFetch } from '@/utils/authedFetch';
import { useAuth } from '@/contexts/AuthContext';
import { useAuthPrompt } from '@/contexts/AuthPromptContext';

const API_BASE = process.env.EXPO_PUBLIC_STRIPE_SERVER_URL || '';

const TOTAL_STEPS = 4; // étapes 0..3 : Bienvenue, Profil, Stripe, Récap

export default function CelebrityOnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  // t() renvoie la CLÉ quand la traduction manque (ex: nouvelles clés celOnboard* pas
  // encore dans les 15 locales) -> le `|| 'secours'` ne s'activait jamais. ct() renvoie
  // undefined dans ce cas pour activer le texte de secours français écrit dans le JSX.
  const ct = (key: any) => { const v = t(key); return v === key ? undefined : v; };
  const { user } = useAuth();
  const { requireAuth } = useAuthPrompt();
  const { profilePhoto, setProfilePhoto, enableCelebrityMode } = useCelebrityMode();

  // Écran de critères d'admission affiché AVANT tout (dès le clic « devenir célébrité »).
  const [accepted, setAccepted] = useState(false);

  const [step, setStep] = useState(0);
  const [showStripeModal, setShowStripeModal] = useState(false);
  const [stripeLinked, setStripeLinked] = useState(false);
  const [, setStripeAccountId] = useState<string | null>(null);
  // Nom public récupéré du profil de base (transmis à StripeConnectModal)
  const [celebrityName, setCelebrityName] = useState('');
  // Profil célébrité : présentation (bio) + site web officiel.
  const [bio, setBio] = useState('');
  const [website, setWebsite] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [showPhotoSheet, setShowPhotoSheet] = useState(false);

  // Traduction des textes de secours français (affichés quand les clés celOnboard*
  // ne sont pas encore présentes dans les 15 locales).
  const trUI = useAutoTranslate([
    'Sessions live vidéo',
    'Organisez des appels vidéo en direct avec vos fans. Définissez votre prix et votre durée.',
    'Événements dédicaces',
    'Créez des événements avec QR codes pour offrir des autographes personnalisés.',
    'Fil d\'actualité',
    'Publiez des posts et des événements pour garder le contact avec votre communauté.',
    'Profil public',
    'Votre profil enrichi par Wikidata est visible par tous les fans sur Discover.',
    'Étape',
    'Bienvenue dans le Mode Célébrité',
    'Monétisez votre notoriété et connectez-vous avec vos fans de manière unique.',
    'CE QUE VOUS POUVEZ FAIRE',
    'VOS REVENUS',
    'Gardez 85% de vos revenus',
    'Plyz prélève seulement 15% de commission. Les frais Stripe (2.9% + 0.30€) sont déduits séparément. Aucune commission Apple/Google.',
    'Appel vidéo',
    'net',
    'Autographe',
    'Dédicace',
    'Recevoir les paiements',
    'Pour recevoir l\'argent de tes fans, connecte un compte Stripe sécurisé. C\'est gratuit et tu peux le faire en 2 minutes.',
    'Compte connecté',
    'Connecter mon compte Stripe',
    'Je le ferai plus tard',
    'C\'est prêt !',
    'Ton Mode Célébrité est activé. Voici un récapitulatif :',
    'Photo de profil',
    'Nom public et présentation',
    'Paiements configurés',
    'Paiements à configurer (depuis Mon Compte)',
    'VÉRIFICATION (FACULTATIF)',
    'Facultatif : fais vérifier ton profil pour obtenir un badge officiel.',
    'Streamer / Créateur de contenu ?',
    'Twitch, YouTube, TikTok, Instagram... Faites vérifier votre profil pour obtenir un badge vérifié.',
    'Vous êtes une organisation ?',
    'Clubs sportifs, marques, associations... Faites vérifier votre compte pour un badge spécial.',
    'Vous êtes une célébrité / personnalité publique ?',
    'Acteur, musicien, sportif… Faites vérifier votre profil pour un badge officiel.',
    'Commencer',
    'Continuer',
    'Accéder à mon profil',
    // Écran critères
    'Critères pour devenir célébrité',
    'Avant de commencer, vérifie que tu remplis ces critères — sinon ta demande sera refusée :',
    'Retour',
    "J'accepte et je commence",
    // Étape profil
    'Ton profil public',
    'Ajoute une photo, une présentation et ton site — c\'est ce que verront tes fans.',
    'Ajouter une photo',
    'Nom public',
    'Ton nom de scène (ex : Omar Sy)',
    'Présentation',
    'Présente-toi : qui es-tu, ce que tu fais, pourquoi te suivre…',
    'Site web officiel (optionnel)',
  ]);

  // Les 5 critères d'admission (clés déjà traduites dans les 15 langues,
  // réutilisées depuis l'écran de vérification célébrité).
  const criteria = [
    t('celebVerifCrit1' as any),
    t('celebVerifCrit2' as any),
    t('celebVerifCrit3' as any),
    t('celebVerifCrit4' as any),
    t('celebVerifCrit5' as any),
  ];

  useEffect(() => {
    checkStripeStatus();
  }, []);

  // Synchronise le profil de base (pseudo / photo / description déjà saisis lors de
  // la création de compte) vers le profil célébrité, pour que la fiche publique soit
  // pré-remplie sans redemander ces infos. Ne bloque jamais en cas d'erreur.
  useEffect(() => {
    (async () => {
      if (!user?.id) return;
      try {
        const { data } = await supabase
          .from('profiles')
          .select('display_name, bio, avatar_url')
          .eq('id', user.id)
          .maybeSingle();
        if (data?.display_name) setCelebrityName(data.display_name);
        if (data?.bio) setBio(data.bio);
        if (data?.avatar_url) setProfilePhoto(data.avatar_url);
        // Pré-remplit bio + site web déjà enregistrés côté profil célébrité.
        const { data: cp } = await supabase
          .from('celebrity_profiles')
          .select('bio, website')
          .eq('user_id', user.id)
          .maybeSingle();
        if (cp?.bio) setBio((b) => b || cp.bio);
        if (cp?.website) setWebsite(cp.website);
      } catch (e) {
        console.warn('[celebrity-onboarding] sync profil de base échouée', e);
      }
    })();
  }, [user?.id]);

  const checkStripeStatus = async () => {
    try {
      const id = await AsyncStorage.getItem('stripe_connect_account_id');
      setStripeLinked(!!id);
      setStripeAccountId(id);
    } catch {}
  };

  // --- Photo de profil (galerie ou appareil) + upload public ---
  const applyPhoto = async (asset: ImagePicker.ImagePickerAsset) => {
    setProfilePhoto(asset.uri); // aperçu immédiat
    if (!asset.base64 || !user?.id) return;
    try {
      setUploadingPhoto(true);
      const res = await authedFetch(`${API_BASE}/api/upload-celebrity-avatar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id, image_base64: asset.base64, content_type: asset.mimeType || 'image/jpeg' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.avatar_url) {
        // Échec / rejet modération : on prévient et on retire l'aperçu trompeur.
        setProfilePhoto(null);
        showAlert(t('error') || 'Erreur', data?.message || (ct('photoUploadFailed' as any) || "Ta photo n'a pas pu être enregistrée (réessaie avec une autre image)."));
        return;
      }
      setProfilePhoto(data.avatar_url);
    } catch (e) {
      console.warn('[celebrity-onboarding] upload photo échoué', e);
      setProfilePhoto(null);
      showAlert(t('error') || 'Erreur', ct('photoUploadFailed' as any) || "Ta photo n'a pas pu être enregistrée. Réessaie.");
    } finally {
      setUploadingPhoto(false);
    }
  };

  const pickFromLibrary = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { showAlert(ct('permissionRequired' as any) || 'Permission', ct('galleryPermission' as any) || 'Autorise l\'accès à la galerie.'); return; }
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7, base64: true });
    if (!r.canceled && r.assets[0]) applyPhoto(r.assets[0]);
  };
  const takeWithCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { showAlert(ct('permissionRequired' as any) || 'Permission', ct('cameraPermission' as any) || 'Autorise l\'accès à l\'appareil photo.'); return; }
    const r = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.7, base64: true });
    if (!r.canceled && r.assets[0]) applyPhoto(r.assets[0]);
  };
  const pickPhoto = () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (Platform.OS === 'web') { pickFromLibrary(); return; }
    setShowPhotoSheet(true);
  };

  // Enregistre nom public + bio + site web sur le profil célébrité.
  // Renvoie true si OK ; false si rejet (modération bio/nom/site web) ou erreur
  // → l'appelant ne fait PAS avancer l'étape et un message est affiché.
  const saveProfile = async (): Promise<boolean> => {
    if (!user?.id) return false;
    try {
      await upsertUserProfile(user.id, { celebrity_name: celebrityName.trim(), bio: bio.trim() });
      const res = await authedFetch(`${API_BASE}/api/update-celebrity-profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id, stage_name: celebrityName.trim(), bio: bio.trim(), website: website.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.error) {
        showAlert(t('error') || 'Erreur', data?.message || data?.error || (ct('saveFailed' as any) || 'Enregistrement impossible. Vérifie tes informations.'));
        return false;
      }
      return true;
    } catch (e) {
      console.warn('[celebrity-onboarding] save profil échoué', e);
      showAlert(t('error') || 'Erreur', ct('saveFailed' as any) || 'Enregistrement impossible. Réessaie.');
      return false;
    }
  };

  const features = [
    {
      icon: <Video size={24} color="#3b82f6" />,
      title: ct('celOnboardFeature1Title' as any) || trUI('Sessions live vidéo'),
      desc: ct('celOnboardFeature1Desc' as any) || trUI('Organisez des appels vidéo en direct avec vos fans. Définissez votre prix et votre durée.'),
    },
    {
      icon: <QrCode size={24} color="#10b981" />,
      title: ct('celOnboardFeature2Title' as any) || trUI('Événements dédicaces'),
      desc: ct('celOnboardFeature2Desc' as any) || trUI('Créez des événements avec QR codes pour offrir des autographes personnalisés.'),
    },
    {
      icon: <Users size={24} color="#8b5cf6" />,
      title: ct('celOnboardFeature3Title' as any) || trUI('Fil d\'actualité'),
      desc: ct('celOnboardFeature3Desc' as any) || trUI('Publiez des posts et des événements pour garder le contact avec votre communauté.'),
    },
    {
      icon: <Globe size={24} color="#f59e0b" />,
      title: ct('celOnboardFeature4Title' as any) || trUI('Profil public'),
      desc: ct('celOnboardFeature4Desc' as any) || trUI('Votre profil enrichi par Wikidata est visible par tous les fans sur Discover.'),
    },
  ];

  // --- Validation par étape ---
  const stripeDone = stripeLinked;

  // Bouton « Continuer » : actif ? + hint si bloqué
  const canContinue = (): boolean => {
    if (step === 1) return celebrityName.trim().length > 0; // profil : nom public requis
    if (step === 2) return stripeDone; // « Je le ferai plus tard » contourne ce blocage
    return true;
  };

  const blockedHint = (): string | null => {
    return null;
  };

  const goNext = async () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    // L'activation du mode célébrité nécessite un compte.
    if (step === 0 && !user) {
      requireAuth(() => goNext(), {
        reason: 'Crée ton compte pour passer en mode célébrité',
        requireBillingIdentity: false,
      });
      return;
    }
    // En quittant l'étape Profil, on enregistre nom public + bio + site web.
    if (step === 1) { const ok = await saveProfile(); if (!ok) return; }
    setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1));
  };

  const goBack = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    if (step > 0) {
      setStep((s) => s - 1);
    } else {
      router.back();
    }
  };

  const finish = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    router.back();
  };

  // --- Barre de progression ---
  const progressPct = ((step + 1) / TOTAL_STEPS) * 100;

  const acceptCriteria = async () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const proceed = async () => { await enableCelebrityMode(); setAccepted(true); };
    if (!user) { requireAuth(() => proceed(), { reason: 'Crée ton compte pour passer en mode célébrité', requireBillingIdentity: false }); return; }
    await proceed();
  };

  // ===================== ÉCRAN CRITÈRES (avant l'onboarding) =====================
  if (!accepted) {
    return (
      <View style={styles.container}>
        <LinearGradient colors={['#0f172a', '#1e293b', '#0f172a']} style={StyleSheet.absoluteFill} />
        <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <ArrowLeft size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.critHeaderTitle} numberOfLines={1}>
            {ct('celOnboardCriteriaTitle' as any) || trUI('Critères pour devenir célébrité')}
          </Text>
          <View style={{ width: 40 }} />
        </View>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.critIconWrap}>
            <ShieldCheck size={40} color="#10b981" />
          </View>
          <Text style={styles.critIntro}>
            {ct('celOnboardCriteriaIntro' as any) || trUI('Avant de commencer, vérifie que tu remplis ces critères — sinon ta demande sera refusée :')}
          </Text>
          <View style={styles.critBox}>
            {criteria.map((c, i) => (
              <View key={i} style={styles.critRow}>
                <CheckCircle size={18} color="#10b981" style={{ marginTop: 2 }} />
                <Text style={styles.critText}>{c}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
        <View style={[styles.footer, styles.critFooter, { paddingBottom: insets.bottom + 14 }]}>
          <TouchableOpacity style={styles.critBackBtn} onPress={() => router.back()} activeOpacity={0.8}>
            <Text style={styles.critBackText}>{ct('celOnboardCriteriaBack' as any) || trUI('Retour')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.primaryButton, { flex: 1, marginLeft: 10 }]} onPress={acceptCriteria} activeOpacity={0.85}>
            <Zap size={18} color="#000" />
            <Text style={styles.primaryButtonText}>{ct('celOnboardCriteriaAccept' as any) || trUI('Commencer')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#0f172a', '#1e293b', '#0f172a']}
        style={StyleSheet.absoluteFill}
      />

      {/* Header + barre de progression */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn}>
          <ArrowLeft size={22} color="#fff" />
        </TouchableOpacity>
        <View style={styles.progressWrap}>
          <Text style={styles.progressLabel}>
            {`${ct('celOnboardStepLabel' as any) || trUI('Étape')} ${step + 1}/${TOTAL_STEPS}`}
          </Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
          </View>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ===================== ÉTAPE 0 — BIENVENUE ===================== */}
        {step === 0 && (
          <>
            <View style={styles.heroSection}>
              <View style={styles.heroIconWrap}>
                <Star size={40} color="#f59e0b" fill="#f59e0b" />
              </View>
              <Text style={styles.heroTitle}>
                {ct('celOnboardHeroTitle' as any) || trUI('Bienvenue dans le Mode Célébrité')}
              </Text>
              <Text style={styles.heroSubtitle}>
                {ct('celOnboardHeroSubtitle' as any) || trUI('Monétisez votre notoriété et connectez-vous avec vos fans de manière unique.')}
              </Text>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                {ct('celOnboardFeaturesSection' as any) || trUI('CE QUE VOUS POUVEZ FAIRE')}
              </Text>
              {features.map((f, i) => (
                <View key={i} style={styles.featureCard}>
                  <View style={styles.featureIcon}>{f.icon}</View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.featureTitle}>{f.title}</Text>
                    <Text style={styles.featureDesc}>{f.desc}</Text>
                  </View>
                </View>
              ))}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                {ct('celOnboardRevenueSection' as any) || trUI('VOS REVENUS')}
              </Text>
              <View style={styles.revenueCard}>
                <LinearGradient
                  colors={['rgba(245,158,11,0.12)', 'rgba(245,158,11,0.04)']}
                  style={StyleSheet.absoluteFill}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                />
                <View style={styles.revenueRow}>
                  <DollarSign size={28} color="#f59e0b" />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.revenueTitle}>
                      {ct('celOnboardRevenueTitle' as any) || trUI('Gardez 85% de vos revenus')}
                    </Text>
                    <Text style={styles.revenueDesc}>
                      {ct('celOnboardRevenueDesc' as any) || trUI('Plyz prélève seulement 15% de commission. Les frais Stripe (2.9% + 0.30€) sont déduits séparément. Aucune commission Apple/Google.')}
                    </Text>
                  </View>
                </View>
                <View style={styles.revenueDivider} />
                <View style={styles.revenueExamples}>
                  <View style={styles.revenueExample}>
                    <Text style={styles.revenueExampleLabel}>
                      {ct('celOnboardVideoCall' as any) || trUI('Appel vidéo')}
                    </Text>
                    <Text style={styles.revenueExamplePrice}>150€</Text>
                    <Text style={styles.revenueExampleNet}>
                      → ~123€ {ct('celOnboardNet' as any) || trUI('net')}
                    </Text>
                  </View>
                  <View style={styles.revenueExample}>
                    <Text style={styles.revenueExampleLabel}>
                      {ct('celOnboardAutograph' as any) || trUI('Autographe')}
                    </Text>
                    <Text style={styles.revenueExamplePrice}>50€</Text>
                    <Text style={styles.revenueExampleNet}>
                      → ~41€ {ct('celOnboardNet' as any) || trUI('net')}
                    </Text>
                  </View>
                  <View style={styles.revenueExample}>
                    <Text style={styles.revenueExampleLabel}>
                      {ct('celOnboardDedication' as any) || trUI('Dédicace')}
                    </Text>
                    <Text style={styles.revenueExamplePrice}>80€</Text>
                    <Text style={styles.revenueExampleNet}>
                      → ~66€ {ct('celOnboardNet' as any) || trUI('net')}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          </>
        )}

        {/* ===================== ÉTAPE 1 — PROFIL ===================== */}
        {step === 1 && (
          <View style={styles.stepContent}>
            <Text style={styles.stepHeadline}>
              {ct('celOnboardProfileHeadline' as any) || trUI('Ton profil public')}
            </Text>
            <Text style={styles.stepSubtitle}>
              {ct('celOnboardProfileSubtitle' as any) || trUI('Ajoute une photo, une présentation et ton site — c\'est ce que verront tes fans.')}
            </Text>

            {/* Photo de profil : élément central, mise en avant */}
            <TouchableOpacity style={styles.profilePhotoPicker} onPress={pickPhoto} activeOpacity={0.85}>
              {profilePhoto ? (
                <Image source={{ uri: profilePhoto }} style={styles.profilePhotoImg} />
              ) : (
                <Camera size={34} color="#10b981" />
              )}
              {uploadingPhoto && (
                <View style={styles.profilePhotoLoading}><ActivityIndicator color="#10b981" /></View>
              )}
              <View style={styles.profilePhotoBadge}><Camera size={14} color="#fff" /></View>
            </TouchableOpacity>
            <Text style={styles.profilePhotoLabel}>
              {ct('celOnboardAddPhoto' as any) || trUI('Ajouter une photo')}
            </Text>

            {/* Formulaire regroupé */}
            <View style={styles.profileForm}>
              <Text style={styles.profileFieldLabel}>{ct('celOnboardNameLabel' as any) || trUI('Nom public')}</Text>
              <TextInput
                style={styles.profileFieldInput}
                value={celebrityName}
                onChangeText={setCelebrityName}
                placeholder={ct('celOnboardNamePlaceholder' as any) || trUI('Ton nom de scène (ex : Omar Sy)')}
                placeholderTextColor="#64748b"
              />

              <Text style={styles.profileFieldLabel}>{ct('celOnboardBioLabel' as any) || trUI('Présentation')}</Text>
              <TextInput
                style={[styles.profileFieldInput, styles.profileFieldTextarea]}
                value={bio}
                onChangeText={setBio}
                placeholder={ct('celOnboardBioPlaceholder' as any) || trUI('Présente-toi : qui es-tu, ce que tu fais, pourquoi te suivre…')}
                placeholderTextColor="#64748b"
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />

              <Text style={styles.profileFieldLabel}>{ct('celOnboardWebsiteLabel' as any) || trUI('Site web officiel (optionnel)')}</Text>
              <View style={styles.websiteRow}>
                <Link2 size={18} color="#64748b" />
                <TextInput
                  style={styles.websiteInput}
                  value={website}
                  onChangeText={setWebsite}
                  placeholder="https://..."
                  placeholderTextColor="#64748b"
                  autoCapitalize="none"
                  keyboardType="url"
                />
              </View>
            </View>
          </View>
        )}

        {/* ===================== ÉTAPE 2 — STRIPE ===================== */}
        {step === 2 && (
          <View style={styles.stepContent}>
            <View style={styles.stripeIconWrap}>
              <CreditCard size={40} color="#6366f1" />
            </View>
            <Text style={styles.stepHeadline}>
              {ct('celOnboardStripeHeadline' as any) || trUI('Recevoir les paiements')}
            </Text>
            <Text style={styles.stepSubtitle}>
              {ct('celOnboardStripeSubtitle' as any) || trUI('Pour recevoir l\'argent de tes fans, connecte un compte Stripe sécurisé. C\'est gratuit et tu peux le faire en 2 minutes.')}
            </Text>

            {stripeLinked ? (
              <View style={styles.stripeConnectedBox}>
                <CheckCircle size={22} color="#10b981" />
                <Text style={styles.stripeConnectedText}>
                  {ct('celOnboardStripeConnected' as any) || trUI('Compte connecté')}
                </Text>
              </View>
            ) : (
              <>
                <TouchableOpacity
                  style={styles.stripeButton}
                  onPress={() => setShowStripeModal(true)}
                  activeOpacity={0.8}
                >
                  <CreditCard size={20} color="#fff" />
                  <Text style={styles.stripeButtonText}>
                    {ct('celOnboardConnectStripe' as any) || trUI('Connecter mon compte Stripe')}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.laterLink}
                  onPress={() => setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1))}
                  activeOpacity={0.7}
                >
                  <Text style={styles.laterLinkText}>
                    {ct('celOnboardStripeLater' as any) || trUI('Je le ferai plus tard')}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {/* ===================== ÉTAPE 3 — C'EST PRÊT ===================== */}
        {step === 3 && (
          <View style={styles.stepContent}>
            <View style={styles.heroIconWrap}>
              <CheckCircle size={44} color="#10b981" />
            </View>
            <Text style={styles.stepHeadline}>
              {ct('celOnboardDoneHeadline' as any) || trUI('C\'est prêt !')}
            </Text>
            <Text style={styles.stepSubtitle}>
              {ct('celOnboardDoneSubtitle' as any) || trUI('Ton Mode Célébrité est activé. Voici un récapitulatif :')}
            </Text>

            <View style={styles.recapBox}>
              <View style={styles.recapRow}>
                <CheckCircle size={18} color="#10b981" />
                <Text style={styles.recapText}>
                  {ct('celOnboardRecapPhoto' as any) || trUI('Photo de profil')}
                </Text>
              </View>
              <View style={styles.recapRow}>
                <CheckCircle size={18} color="#10b981" />
                <Text style={styles.recapText}>
                  {ct('celOnboardRecapProfile' as any) || trUI('Nom public et présentation')}
                </Text>
              </View>
              <View style={styles.recapRow}>
                {stripeLinked ? (
                  <CheckCircle size={18} color="#10b981" />
                ) : (
                  <Star size={18} color="#f59e0b" />
                )}
                <Text style={styles.recapText}>
                  {stripeLinked
                    ? (ct('celOnboardRecapStripeOk' as any) || trUI('Paiements configurés'))
                    : (ct('celOnboardRecapStripeTodo' as any) || trUI('Paiements à configurer (depuis Mon Compte)'))}
                </Text>
              </View>
            </View>

            <View style={[styles.section, { paddingHorizontal: 0, marginTop: 20 }]}>
              <Text style={styles.sectionTitle}>
                {ct('celOnboardVerifSection' as any) || trUI('VÉRIFICATION (FACULTATIF)')}
              </Text>
              <Text style={styles.verifIntro}>
                {ct('celOnboardVerifIntro' as any) || trUI('Facultatif : fais vérifier ton profil pour obtenir un badge officiel.')}
              </Text>

              <TouchableOpacity
                style={styles.creatorCard}
                onPress={() => router.push('/creator-verification')}
                activeOpacity={0.7}
              >
                <View style={styles.orgCardInner}>
                  <View style={styles.creatorIconWrap}>
                    <TrendingUp size={24} color="#3b82f6" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.orgCardTitle}>
                      {ct('celOnboardCreatorTitle' as any) || trUI('Streamer / Créateur de contenu ?')}
                    </Text>
                    <Text style={styles.orgCardDesc}>
                      {ct('celOnboardCreatorDesc' as any) || trUI('Twitch, YouTube, TikTok, Instagram... Faites vérifier votre profil pour obtenir un badge vérifié.')}
                    </Text>
                  </View>
                  <ArrowRight size={18} color="#3b82f6" />
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.orgCard, { marginTop: 10 }]}
                onPress={() => router.push('/org-verification')}
                activeOpacity={0.7}
              >
                <View style={styles.orgCardInner}>
                  <View style={styles.orgIconWrap}>
                    <Building2 size={24} color="#8b5cf6" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.orgCardTitle}>
                      {ct('celOnboardOrgTitle' as any) || trUI('Vous êtes une organisation ?')}
                    </Text>
                    <Text style={styles.orgCardDesc}>
                      {ct('celOnboardOrgDesc' as any) || trUI('Clubs sportifs, marques, associations... Faites vérifier votre compte pour un badge spécial.')}
                    </Text>
                  </View>
                  <ArrowRight size={18} color="#8b5cf6" />
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.orgCard, { marginTop: 10 }]}
                onPress={() => router.push('/celebrity-verification' as any)}
                activeOpacity={0.7}
              >
                <View style={styles.orgCardInner}>
                  <View style={[styles.orgIconWrap, { backgroundColor: 'rgba(16,185,129,0.15)' }]}>
                    <Award size={24} color="#10b981" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.orgCardTitle}>
                      {ct('celOnboardCelebTitle' as any) || trUI('Vous êtes une célébrité / personnalité publique ?')}
                    </Text>
                    <Text style={styles.orgCardDesc}>
                      {ct('celOnboardCelebDesc' as any) || trUI('Acteur, musicien, sportif… Faites vérifier votre profil pour un badge officiel.')}
                    </Text>
                  </View>
                  <ArrowRight size={18} color="#10b981" />
                </View>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>

      {/* ===================== BARRE D'ACTION BAS ===================== */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}>
        {blockedHint() && (
          <Text style={styles.blockedHint}>{blockedHint()}</Text>
        )}

        {step === 0 && (
          <TouchableOpacity style={styles.primaryButton} onPress={goNext} activeOpacity={0.85}>
            <Zap size={20} color="#000" />
            <Text style={styles.primaryButtonText}>
              {ct('celOnboardBegin' as any) || trUI('Commencer')}
            </Text>
          </TouchableOpacity>
        )}

        {step === 1 && (
          <TouchableOpacity
            style={[styles.primaryButton, !canContinue() && styles.primaryButtonDisabled]}
            onPress={goNext}
            disabled={!canContinue()}
            activeOpacity={0.85}
          >
            <Text style={[styles.primaryButtonText, !canContinue() && styles.primaryButtonTextDisabled]}>
              {ct('celOnboardContinue' as any) || trUI('Continuer')}
            </Text>
            <ArrowRight size={20} color={canContinue() ? '#000' : '#6b7280'} />
          </TouchableOpacity>
        )}

        {step === 2 && (
          <TouchableOpacity
            style={[styles.primaryButton, !canContinue() && styles.primaryButtonDisabled]}
            onPress={goNext}
            disabled={!canContinue()}
            activeOpacity={0.85}
          >
            <Text style={[styles.primaryButtonText, !canContinue() && styles.primaryButtonTextDisabled]}>
              {ct('celOnboardContinue' as any) || trUI('Continuer')}
            </Text>
            <ArrowRight size={20} color={canContinue() ? '#000' : '#6b7280'} />
          </TouchableOpacity>
        )}

        {step === 3 && (
          <TouchableOpacity style={styles.primaryButton} onPress={finish} activeOpacity={0.85}>
            <Text style={styles.primaryButtonText}>
              {ct('celOnboardFinish' as any) || trUI('Accéder à mon profil')}
            </Text>
            <ArrowRight size={20} color="#000" />
          </TouchableOpacity>
        )}
      </View>

      <StripeConnectModal
        visible={showStripeModal}
        onClose={() => {
          setShowStripeModal(false);
          checkStripeStatus();
        }}
        onConnected={(accountId) => {
          setStripeLinked(true);
          setStripeAccountId(accountId);
          setShowStripeModal(false);
        }}
        celebrityName={celebrityName}
        userId={user?.id}
      />

      <PhotoSourceSheet
        visible={showPhotoSheet}
        onClose={() => setShowPhotoSheet(false)}
        onCamera={takeWithCamera}
        onGallery={pickFromLibrary}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a1628' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center', alignItems: 'center',
  },
  progressWrap: { flex: 1, marginHorizontal: 14, alignItems: 'center' },
  progressLabel: { color: '#f59e0b', fontSize: 12, fontWeight: '700', marginBottom: 6 },
  progressTrack: {
    width: '100%', height: 6, borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.1)', overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 3, backgroundColor: '#f59e0b' },

  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 30 },

  stepContent: { paddingHorizontal: 20, paddingTop: 12, alignItems: 'center' },
  stepHeadline: {
    color: '#fff', fontSize: 24, fontWeight: '700',
    textAlign: 'center', marginBottom: 8,
  },
  stepSubtitle: {
    color: '#9ca3af', fontSize: 15, textAlign: 'center',
    lineHeight: 22, marginBottom: 24,
  },

  heroSection: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 10,
    paddingBottom: 24,
  },
  heroIconWrap: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(245,158,11,0.15)',
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 16,
  },
  heroTitle: {
    color: '#fff', fontSize: 24, fontWeight: '700',
    textAlign: 'center', marginBottom: 8,
  },
  heroSubtitle: {
    color: '#9ca3af', fontSize: 15, textAlign: 'center',
    lineHeight: 22,
  },

  section: {
    paddingHorizontal: 16,
    marginBottom: 24,
    width: '100%',
  },
  sectionTitle: {
    color: '#f59e0b', fontSize: 12, fontWeight: '700',
    letterSpacing: 1, marginBottom: 12,
  },

  // --- Photo (grande, étape 1) ---
  bigPhotoWrap: { alignItems: 'center', marginBottom: 8 },
  bigPhotoPicker: {
    width: 180, height: 180, borderRadius: 90,
    overflow: 'hidden',
    borderWidth: 3, borderColor: 'rgba(245,158,11,0.5)',
    borderStyle: 'dashed',
  },
  bigPhotoImage: { width: '100%', height: '100%', borderRadius: 90 },
  bigPhotoPlaceholder: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  bigPhotoEditBadge: {
    position: 'absolute', bottom: 8, right: 8,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#f59e0b',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 3, borderColor: '#1e293b',
  },
  photoPlaceholderText: { color: '#6b7280', fontSize: 12, marginTop: 6 },
  secondaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, marginTop: 18, paddingVertical: 12, paddingHorizontal: 22,
    borderRadius: 12, borderWidth: 1, borderColor: 'rgba(245,158,11,0.4)',
    backgroundColor: 'rgba(245,158,11,0.08)',
  },
  secondaryBtnText: { color: '#f59e0b', fontSize: 15, fontWeight: '600' },
  photoStatus: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16,
  },
  photoStatusText: { color: '#10b981', fontSize: 14, fontWeight: '500' },

  // --- Champs (étape 2) ---
  fieldLabel: {
    color: '#fff', fontSize: 14, fontWeight: '600',
    alignSelf: 'flex-start', marginBottom: 8,
  },
  fieldInput: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 14,
    color: '#fff', fontSize: 15,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  fieldInputMultiline: { minHeight: 130 },
  charCount: { color: '#6b7280', fontSize: 12, alignSelf: 'flex-end', marginTop: 6 },

  // --- Features (étape 0) ---
  featureCard: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14, padding: 16, marginBottom: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  featureIcon: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    justifyContent: 'center', alignItems: 'center',
    marginRight: 14,
  },
  featureTitle: { color: '#fff', fontSize: 15, fontWeight: '600', marginBottom: 4 },
  featureDesc: { color: '#9ca3af', fontSize: 13, lineHeight: 18 },

  // --- Revenus (étape 0) ---
  revenueCard: {
    borderRadius: 16, padding: 20, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.2)',
  },
  revenueRow: { flexDirection: 'row', alignItems: 'flex-start' },
  revenueTitle: { color: '#f59e0b', fontSize: 17, fontWeight: '700', marginBottom: 6 },
  revenueDesc: { color: '#9ca3af', fontSize: 13, lineHeight: 19 },
  revenueDivider: {
    height: 1, backgroundColor: 'rgba(255,255,255,0.06)',
    marginVertical: 16,
  },
  revenueExamples: {
    flexDirection: 'row', justifyContent: 'space-between',
  },
  revenueExample: { alignItems: 'center', flex: 1 },
  revenueExampleLabel: { color: '#6b7280', fontSize: 11, marginBottom: 4 },
  revenueExamplePrice: { color: '#fff', fontSize: 18, fontWeight: '700' },
  revenueExampleNet: { color: '#10b981', fontSize: 12, marginTop: 2 },

  // --- Stripe (étape 3) ---
  stripeIconWrap: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(99,102,241,0.15)',
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 16,
  },
  stripeButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#6366f1', borderRadius: 12,
    paddingVertical: 15, paddingHorizontal: 24, marginTop: 8, gap: 8,
    width: '100%',
  },
  stripeButtonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  laterLink: { marginTop: 18, paddingVertical: 8 },
  laterLinkText: { color: '#9ca3af', fontSize: 14, textDecorationLine: 'underline' },
  stripeConnectedBox: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: 'rgba(16,185,129,0.1)', borderRadius: 12,
    paddingVertical: 18, paddingHorizontal: 20, marginTop: 8, width: '100%',
    borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)',
  },
  stripeConnectedText: { color: '#10b981', fontSize: 16, fontWeight: '700' },

  // --- Récap (étape 4) ---
  recapBox: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    gap: 12,
  },
  recapRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  recapText: { color: '#e5e7eb', fontSize: 14, flex: 1 },
  verifIntro: { color: '#9ca3af', fontSize: 13, lineHeight: 18, marginBottom: 12 },

  // --- Cartes vérification (étape 4) ---
  creatorCard: {
    backgroundColor: 'rgba(59,130,246,0.08)',
    borderRadius: 16, borderWidth: 1, borderColor: 'rgba(59,130,246,0.2)',
    overflow: 'hidden',
  },
  creatorIconWrap: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(59,130,246,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  orgCard: {
    backgroundColor: 'rgba(139,92,246,0.08)',
    borderRadius: 16, borderWidth: 1, borderColor: 'rgba(139,92,246,0.2)',
    overflow: 'hidden',
  },
  orgCardInner: {
    flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12,
  },
  orgIconWrap: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(139,92,246,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  orgCardTitle: { color: '#fff', fontSize: 15, fontWeight: '600', marginBottom: 3 },
  orgCardDesc: { color: '#94a3b8', fontSize: 12, lineHeight: 17 },

  // --- Footer / boutons ---
  footer: {
    paddingHorizontal: 16, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(15,23,42,0.9)',
  },
  blockedHint: {
    color: '#f59e0b', fontSize: 13, textAlign: 'center', marginBottom: 10,
  },
  primaryButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#f59e0b', borderRadius: 14,
    paddingVertical: 16, gap: 8,
  },
  primaryButtonDisabled: { backgroundColor: 'rgba(255,255,255,0.1)' },
  primaryButtonText: { color: '#000', fontSize: 17, fontWeight: '700' },
  primaryButtonTextDisabled: { color: '#6b7280' },

  // --- Écran critères ---
  critHeaderTitle: { flex: 1, color: '#fff', fontSize: 17, fontWeight: '700', textAlign: 'center' },
  critIconWrap: {
    alignSelf: 'center', width: 76, height: 76, borderRadius: 38,
    backgroundColor: 'rgba(16,185,129,0.12)', alignItems: 'center', justifyContent: 'center',
    marginTop: 8, marginBottom: 16,
  },
  critIntro: { color: 'rgba(255,255,255,0.75)', fontSize: 15, lineHeight: 22, textAlign: 'center', paddingHorizontal: 16, marginBottom: 18 },
  critBox: {
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 16, padding: 16, gap: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', marginHorizontal: 4,
  },
  critRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  critText: { flex: 1, color: 'rgba(255,255,255,0.9)', fontSize: 14, lineHeight: 20 },
  critFooter: { flexDirection: 'row', alignItems: 'center' },
  critBackBtn: {
    paddingVertical: 16, paddingHorizontal: 18, borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  critBackText: { color: '#fff', fontSize: 16, fontWeight: '600' },

  // --- Étape profil ---
  profilePhotoPicker: {
    width: 108, height: 108, borderRadius: 54, marginTop: 20,
    backgroundColor: 'rgba(16,185,129,0.12)', borderWidth: 2, borderColor: '#10b981',
    alignItems: 'center', justifyContent: 'center', alignSelf: 'center',
  },
  profilePhotoImg: { width: 108, height: 108, borderRadius: 54 },
  profileForm: { alignSelf: 'stretch', marginTop: 10 },
  profilePhotoLoading: {
    ...StyleSheet.absoluteFillObject, borderRadius: 48,
    backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center',
  },
  profilePhotoBadge: {
    position: 'absolute', bottom: -2, right: -2, width: 30, height: 30, borderRadius: 15,
    backgroundColor: '#10b981', alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#0f172a',
  },
  profilePhotoLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 13, textAlign: 'center', marginTop: 8, marginBottom: 16 },
  profileFieldLabel: { alignSelf: 'stretch', color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '600', marginBottom: 6, marginTop: 8 },
  profileFieldInput: {
    alignSelf: 'stretch', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, color: '#fff', fontSize: 15,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  profileFieldTextarea: { minHeight: 100 },
  websiteRow: {
    alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, paddingHorizontal: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  websiteInput: { flex: 1, color: '#fff', fontSize: 15, paddingVertical: 12 },
});
