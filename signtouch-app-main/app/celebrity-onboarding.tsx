import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Platform, Image, TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft, Star, Camera as CameraIcon, Video, QrCode,
  DollarSign, Users, CreditCard, ArrowRight,
  CheckCircle, Zap, TrendingUp, Globe, Building2, Award,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useLanguage } from '@/contexts/LanguageContext';
import { useCelebrityMode } from '@/contexts/CelebrityModeContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import StripeConnectModal from '@/components/StripeConnectModal';
import { getUserProfile, upsertUserProfile } from '@/utils/userProfile';
import { useAuth } from '@/contexts/AuthContext';

const API_BASE = Platform.OS === 'web' ? '' : (process.env.EXPO_PUBLIC_STRIPE_SERVER_URL || '');

const TOTAL_STEPS = 5; // étapes 0..4

export default function CelebrityOnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  // t() renvoie la CLÉ quand la traduction manque (ex: nouvelles clés celOnboard* pas
  // encore dans les 15 locales) -> le `|| 'secours'` ne s'activait jamais. ct() renvoie
  // undefined dans ce cas pour activer le texte de secours français écrit dans le JSX.
  const ct = (key: any) => { const v = t(key); return v === key ? undefined : v; };
  const { user } = useAuth();
  const { profilePhoto, setProfilePhoto } = useCelebrityMode();

  const [step, setStep] = useState(0);
  const [showStripeModal, setShowStripeModal] = useState(false);
  const [stripeLinked, setStripeLinked] = useState(false);
  const [, setStripeAccountId] = useState<string | null>(null);
  const [celebrityName, setCelebrityName] = useState('');
  const [bioInput, setBioInput] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    checkStripeStatus();
    (async () => {
      if (user?.id) {
        const profile = await getUserProfile(user.id);
        if (profile?.bio) setBioInput(profile.bio);
        if (profile?.celebrity_name) setCelebrityName(profile.celebrity_name);
      }
    })();
  }, []);

  const checkStripeStatus = async () => {
    try {
      const id = await AsyncStorage.getItem('stripe_connect_account_id');
      setStripeLinked(!!id);
      setStripeAccountId(id);
    } catch {}
  };

  const pickProfilePhoto = async () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      await setProfilePhoto(result.assets[0].uri);
    }
  };

  // Sauvegarde nom public + présentation (étape 2)
  const saveNameAndBio = async (): Promise<boolean> => {
    if (!user?.id) return false;
    const name = celebrityName.trim();
    const v = bioInput.trim();
    setSaving(true);
    try {
      // 1. Sauvegarde interne (source d'édition dans l'app)
      await upsertUserProfile(user.id, { celebrity_name: name, bio: v });
      // 2. Publication sur le profil public
      await fetch(`${API_BASE}/api/update-celebrity-profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id, bio: v, stage_name: name }),
      });
      return true;
    } catch (e) {
      console.warn('[saveNameAndBio] publication sur le profil public échouée', e);
      return true; // la sauvegarde interne a réussi, on n'empêche pas l'avancée
    } finally {
      setSaving(false);
    }
  };

  const features = [
    {
      icon: <Video size={24} color="#3b82f6" />,
      title: ct('celOnboardFeature1Title' as any) || 'Sessions live vidéo',
      desc: ct('celOnboardFeature1Desc' as any) || 'Organisez des appels vidéo en direct avec vos fans. Définissez votre prix et votre durée.',
    },
    {
      icon: <QrCode size={24} color="#10b981" />,
      title: ct('celOnboardFeature2Title' as any) || 'Événements dédicaces',
      desc: ct('celOnboardFeature2Desc' as any) || 'Créez des événements avec QR codes pour offrir des autographes personnalisés.',
    },
    {
      icon: <Users size={24} color="#8b5cf6" />,
      title: ct('celOnboardFeature3Title' as any) || 'Fil d\'actualité',
      desc: ct('celOnboardFeature3Desc' as any) || 'Publiez des posts et des événements pour garder le contact avec votre communauté.',
    },
    {
      icon: <Globe size={24} color="#f59e0b" />,
      title: ct('celOnboardFeature4Title' as any) || 'Profil public',
      desc: ct('celOnboardFeature4Desc' as any) || 'Votre profil enrichi par Wikidata est visible par tous les fans sur Discover.',
    },
  ];

  // --- Validation par étape ---
  const photoDone = !!profilePhoto;
  const nameDone = !!celebrityName.trim();
  const bioDone = !!bioInput.trim();
  const stripeDone = stripeLinked;

  // Bouton « Continuer » : actif ? + hint si bloqué
  const canContinue = (): boolean => {
    if (step === 1) return photoDone;
    if (step === 2) return nameDone && bioDone && !saving;
    if (step === 3) return stripeDone; // « Je le ferai plus tard » contourne ce blocage
    return true;
  };

  const blockedHint = (): string | null => {
    if (step === 1 && !photoDone) {
      return ct('celOnboardHintPhoto' as any) || 'Ajoute une photo pour continuer';
    }
    if (step === 2 && !canContinue()) {
      if (!nameDone) return ct('celOnboardHintName' as any) || 'Renseigne ton nom public pour continuer';
      if (!bioDone) return ct('celOnboardHintBio' as any) || 'Ajoute une présentation pour continuer';
    }
    return null;
  };

  const goNext = async () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    // À l'étape 2, on sauvegarde avant d'avancer
    if (step === 2) {
      const ok = await saveNameAndBio();
      if (!ok) return;
    }
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
            {`${ct('celOnboardStepLabel' as any) || 'Étape'} ${step + 1}/${TOTAL_STEPS}`}
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
                {ct('celOnboardHeroTitle' as any) || 'Bienvenue dans le Mode Célébrité'}
              </Text>
              <Text style={styles.heroSubtitle}>
                {ct('celOnboardHeroSubtitle' as any) || 'Monétisez votre notoriété et connectez-vous avec vos fans de manière unique.'}
              </Text>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                {ct('celOnboardFeaturesSection' as any) || 'CE QUE VOUS POUVEZ FAIRE'}
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
                {ct('celOnboardRevenueSection' as any) || 'VOS REVENUS'}
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
                      {ct('celOnboardRevenueTitle' as any) || 'Gardez 85% de vos revenus'}
                    </Text>
                    <Text style={styles.revenueDesc}>
                      {ct('celOnboardRevenueDesc' as any) || 'Plyz prélève seulement 15% de commission. Les frais Stripe (2.9% + 0.30€) sont déduits séparément. Aucune commission Apple/Google.'}
                    </Text>
                  </View>
                </View>
                <View style={styles.revenueDivider} />
                <View style={styles.revenueExamples}>
                  <View style={styles.revenueExample}>
                    <Text style={styles.revenueExampleLabel}>
                      {ct('celOnboardVideoCall' as any) || 'Appel vidéo'}
                    </Text>
                    <Text style={styles.revenueExamplePrice}>150€</Text>
                    <Text style={styles.revenueExampleNet}>
                      → ~123€ {ct('celOnboardNet' as any) || 'net'}
                    </Text>
                  </View>
                  <View style={styles.revenueExample}>
                    <Text style={styles.revenueExampleLabel}>
                      {ct('celOnboardAutograph' as any) || 'Autographe'}
                    </Text>
                    <Text style={styles.revenueExamplePrice}>50€</Text>
                    <Text style={styles.revenueExampleNet}>
                      → ~41€ {ct('celOnboardNet' as any) || 'net'}
                    </Text>
                  </View>
                  <View style={styles.revenueExample}>
                    <Text style={styles.revenueExampleLabel}>
                      {ct('celOnboardDedication' as any) || 'Dédicace'}
                    </Text>
                    <Text style={styles.revenueExamplePrice}>80€</Text>
                    <Text style={styles.revenueExampleNet}>
                      → ~66€ {ct('celOnboardNet' as any) || 'net'}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          </>
        )}

        {/* ===================== ÉTAPE 1 — PHOTO ===================== */}
        {step === 1 && (
          <View style={styles.stepContent}>
            <Text style={styles.stepHeadline}>
              {ct('celOnboardPhotoHeadline' as any) || 'Ta photo de profil'}
            </Text>
            <Text style={styles.stepSubtitle}>
              {ct('celOnboardPhotoSubtitle' as any) || 'Choisis une belle photo : c\'est la première chose que tes fans verront.'}
            </Text>

            <View style={styles.bigPhotoWrap}>
              <TouchableOpacity
                style={styles.bigPhotoPicker}
                onPress={pickProfilePhoto}
                activeOpacity={0.8}
              >
                {profilePhoto ? (
                  <Image source={{ uri: profilePhoto }} style={styles.bigPhotoImage} />
                ) : (
                  <View style={styles.bigPhotoPlaceholder}>
                    <CameraIcon size={48} color="#6b7280" />
                    <Text style={styles.photoPlaceholderText}>
                      {t('addProfilePhoto' as any) || 'Ajouter photo'}
                    </Text>
                  </View>
                )}
                <View style={styles.bigPhotoEditBadge}>
                  <CameraIcon size={18} color="#fff" />
                </View>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.secondaryBtn} onPress={pickProfilePhoto} activeOpacity={0.8}>
              <CameraIcon size={18} color="#f59e0b" />
              <Text style={styles.secondaryBtnText}>
                {profilePhoto
                  ? (ct('celOnboardChangePhoto' as any) || 'Changer la photo')
                  : (ct('celOnboardAddPhoto' as any) || 'Ajouter une photo')}
              </Text>
            </TouchableOpacity>

            {photoDone && (
              <View style={styles.photoStatus}>
                <CheckCircle size={16} color="#10b981" />
                <Text style={styles.photoStatusText}>
                  {ct('celOnboardPhotoDone' as any) || 'Photo ajoutée !'}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* ===================== ÉTAPE 2 — NOM PUBLIC + PRÉSENTATION ===================== */}
        {step === 2 && (
          <View style={styles.stepContent}>
            <Text style={styles.stepHeadline}>
              {ct('celOnboardNameHeadline' as any) || 'Ton nom public et ta présentation'}
            </Text>
            <Text style={styles.stepSubtitle}>
              {ct('celOnboardNameSubtitle' as any) || 'C\'est ce qui apparaîtra sur ton profil public visible par les fans.'}
            </Text>

            <Text style={styles.fieldLabel}>
              {ct('celOnboardPublicName' as any) || 'Nom public'}
            </Text>
            <TextInput
              style={styles.fieldInput}
              value={celebrityName}
              onChangeText={setCelebrityName}
              placeholder={ct('celOnboardPublicNamePlaceholder' as any) || 'Votre nom de scène (ex : Omar Sy)'}
              placeholderTextColor="#6b7280"
              maxLength={60}
            />

            <Text style={[styles.fieldLabel, { marginTop: 18 }]}>
              {ct('celOnboardBioTitle' as any) || 'Présentation / À propos'}
            </Text>
            <TextInput
              style={[styles.fieldInput, styles.fieldInputMultiline]}
              value={bioInput}
              onChangeText={setBioInput}
              placeholder={ct('celOnboardBioPlaceholder' as any) || 'Ex : Acteur et humoriste français, connu pour...'}
              placeholderTextColor="#6b7280"
              multiline
              maxLength={300}
              textAlignVertical="top"
            />
            <Text style={styles.charCount}>{bioInput.length}/300</Text>
          </View>
        )}

        {/* ===================== ÉTAPE 3 — STRIPE ===================== */}
        {step === 3 && (
          <View style={styles.stepContent}>
            <View style={styles.stripeIconWrap}>
              <CreditCard size={40} color="#6366f1" />
            </View>
            <Text style={styles.stepHeadline}>
              {ct('celOnboardStripeHeadline' as any) || 'Recevoir les paiements'}
            </Text>
            <Text style={styles.stepSubtitle}>
              {ct('celOnboardStripeSubtitle' as any) || 'Pour recevoir l\'argent de tes fans, connecte un compte Stripe sécurisé. C\'est gratuit et tu peux le faire en 2 minutes.'}
            </Text>

            {stripeLinked ? (
              <View style={styles.stripeConnectedBox}>
                <CheckCircle size={22} color="#10b981" />
                <Text style={styles.stripeConnectedText}>
                  {ct('celOnboardStripeConnected' as any) || 'Compte connecté'}
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
                    {ct('celOnboardConnectStripe' as any) || 'Connecter mon compte Stripe'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.laterLink}
                  onPress={() => setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1))}
                  activeOpacity={0.7}
                >
                  <Text style={styles.laterLinkText}>
                    {ct('celOnboardStripeLater' as any) || 'Je le ferai plus tard'}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {/* ===================== ÉTAPE 4 — C'EST PRÊT ===================== */}
        {step === 4 && (
          <View style={styles.stepContent}>
            <View style={styles.heroIconWrap}>
              <CheckCircle size={44} color="#10b981" />
            </View>
            <Text style={styles.stepHeadline}>
              {ct('celOnboardDoneHeadline' as any) || 'C\'est prêt !'}
            </Text>
            <Text style={styles.stepSubtitle}>
              {ct('celOnboardDoneSubtitle' as any) || 'Ton Mode Célébrité est activé. Voici un récapitulatif :'}
            </Text>

            <View style={styles.recapBox}>
              <View style={styles.recapRow}>
                <CheckCircle size={18} color="#10b981" />
                <Text style={styles.recapText}>
                  {ct('celOnboardRecapPhoto' as any) || 'Photo de profil'}
                </Text>
              </View>
              <View style={styles.recapRow}>
                <CheckCircle size={18} color="#10b981" />
                <Text style={styles.recapText}>
                  {ct('celOnboardRecapProfile' as any) || 'Nom public et présentation'}
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
                    ? (ct('celOnboardRecapStripeOk' as any) || 'Paiements configurés')
                    : (ct('celOnboardRecapStripeTodo' as any) || 'Paiements à configurer (depuis Mon Compte)')}
                </Text>
              </View>
            </View>

            <View style={[styles.section, { paddingHorizontal: 0, marginTop: 20 }]}>
              <Text style={styles.sectionTitle}>
                {ct('celOnboardVerifSection' as any) || 'VÉRIFICATION (FACULTATIF)'}
              </Text>
              <Text style={styles.verifIntro}>
                {ct('celOnboardVerifIntro' as any) || 'Facultatif : fais vérifier ton profil pour obtenir un badge officiel.'}
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
                      {ct('celOnboardCreatorTitle' as any) || 'Streamer / Créateur de contenu ?'}
                    </Text>
                    <Text style={styles.orgCardDesc}>
                      {ct('celOnboardCreatorDesc' as any) || 'Twitch, YouTube, TikTok, Instagram... Faites vérifier votre profil pour obtenir un badge vérifié.'}
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
                      {ct('celOnboardOrgTitle' as any) || 'Vous êtes une organisation ?'}
                    </Text>
                    <Text style={styles.orgCardDesc}>
                      {ct('celOnboardOrgDesc' as any) || 'Clubs sportifs, marques, associations... Faites vérifier votre compte pour un badge spécial.'}
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
                      {ct('celOnboardCelebTitle' as any) || 'Vous êtes une célébrité / personnalité publique ?'}
                    </Text>
                    <Text style={styles.orgCardDesc}>
                      {ct('celOnboardCelebDesc' as any) || 'Acteur, musicien, sportif… Faites vérifier votre profil pour un badge officiel.'}
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
              {ct('celOnboardBegin' as any) || 'Commencer'}
            </Text>
          </TouchableOpacity>
        )}

        {(step === 1 || step === 2 || step === 3) && (
          <TouchableOpacity
            style={[styles.primaryButton, !canContinue() && styles.primaryButtonDisabled]}
            onPress={goNext}
            disabled={!canContinue()}
            activeOpacity={0.85}
          >
            <Text style={[styles.primaryButtonText, !canContinue() && styles.primaryButtonTextDisabled]}>
              {saving ? (ct('celOnboardSaving' as any) || 'Enregistrement…') : (ct('celOnboardContinue' as any) || 'Continuer')}
            </Text>
            {!saving && <ArrowRight size={20} color={canContinue() ? '#000' : '#6b7280'} />}
          </TouchableOpacity>
        )}

        {step === 4 && (
          <TouchableOpacity style={styles.primaryButton} onPress={finish} activeOpacity={0.85}>
            <Text style={styles.primaryButtonText}>
              {ct('celOnboardFinish' as any) || 'Accéder à mon profil'}
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
});
