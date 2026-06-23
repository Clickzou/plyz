import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Platform, Image, Modal, TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft, Star, Camera as CameraIcon, Video, QrCode,
  DollarSign, Users, CreditCard, ArrowRight,
  CheckCircle, Zap, TrendingUp, Globe, Building2, Lock, FileText, Award,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useLanguage } from '@/contexts/LanguageContext';
import { useCelebrityMode } from '@/contexts/CelebrityModeContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import StripeConnectModal from '@/components/StripeConnectModal';
import { getUserProfile, upsertUserProfile } from '@/utils/userProfile';
import { useAuth } from '@/contexts/AuthContext';
import BottomNav, { BOTTOM_NAV_HEIGHT } from '@/components/BottomNav';

const API_BASE = Platform.OS === 'web' ? '' : (process.env.EXPO_PUBLIC_STRIPE_SERVER_URL || '');

export default function CelebrityOnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { user } = useAuth();
  const { profilePhoto, setProfilePhoto } = useCelebrityMode();
  const [showStripeModal, setShowStripeModal] = useState(false);
  const [stripeLinked, setStripeLinked] = useState(false);
  const [, setStripeAccountId] = useState<string | null>(null);
  const [bio, setBio] = useState('');
  const [showBioModal, setShowBioModal] = useState(false);
  const [bioInput, setBioInput] = useState('');

  useEffect(() => {
    checkStripeStatus();
    (async () => {
      if (user?.id) {
        const profile = await getUserProfile(user.id);
        if (profile?.bio) setBio(profile.bio);
      }
    })();
  }, []);

  const openBioModal = () => {
    setBioInput(bio);
    setShowBioModal(true);
  };

  const saveBio = async () => {
    const v = bioInput.trim();
    setBio(v);
    setShowBioModal(false);
    if (!user?.id) return;
    try {
      // 1. Sauvegarde interne (source d'édition dans l'app)
      await upsertUserProfile(user.id, { bio: v });
      // 2. Publication sur le profil public : le « À propos » est lu depuis celebrity_profiles.bio
      const prof = await getUserProfile(user.id);
      const stageName = (prof?.celebrity_name || '').trim();
      await fetch(`${API_BASE}/api/update-celebrity-profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id, bio: v, ...(stageName ? { stage_name: stageName } : {}) }),
      });
    } catch (e) {
      console.warn('[saveBio] publication sur le profil public échouée', e);
    }
  };

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

  const features = [
    {
      icon: <Video size={24} color="#3b82f6" />,
      title: t('celOnboardFeature1Title' as any) || 'Sessions live vidéo',
      desc: t('celOnboardFeature1Desc' as any) || 'Organisez des appels vidéo en direct avec vos fans. Définissez votre prix et votre durée.',
    },
    {
      icon: <QrCode size={24} color="#10b981" />,
      title: t('celOnboardFeature2Title' as any) || 'Événements dédicaces',
      desc: t('celOnboardFeature2Desc' as any) || 'Créez des événements avec QR codes pour offrir des autographes personnalisés.',
    },
    {
      icon: <Users size={24} color="#8b5cf6" />,
      title: t('celOnboardFeature3Title' as any) || 'Fil d\'actualité',
      desc: t('celOnboardFeature3Desc' as any) || 'Publiez des posts et des événements pour garder le contact avec votre communauté.',
    },
    {
      icon: <Globe size={24} color="#f59e0b" />,
      title: t('celOnboardFeature4Title' as any) || 'Profil public',
      desc: t('celOnboardFeature4Desc' as any) || 'Votre profil enrichi par Wikidata est visible par tous les fans sur Discover.',
    },
  ];

  const photoDone = !!profilePhoto;
  const bioDone = !!bio.trim();
  const stripeDone = stripeLinked;

  const steps = [
    {
      num: '1',
      title: t('celOnboardStep1' as any) || 'Ajoutez votre photo de profil',
      done: photoDone,
      locked: false,
      onPress: pickProfilePhoto,
    },
    {
      num: '2',
      title: t('celOnboardStep2' as any) || 'Ajoutez votre texte de présentation',
      done: bioDone,
      locked: !photoDone,
      onPress: openBioModal,
    },
    {
      num: '3',
      title: t('celOnboardStep3' as any) || 'Créez ou connectez votre compte Stripe pour recevoir les paiements',
      done: stripeDone,
      locked: !bioDone,
      onPress: () => setShowStripeModal(true),
    },
  ];

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#0f172a', '#1e293b', '#0f172a']}
        style={StyleSheet.absoluteFill}
      />

      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {t('celOnboardTitle' as any) || 'Mode Célébrité'}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: BOTTOM_NAV_HEIGHT + 30 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroSection}>
          <View style={styles.heroIconWrap}>
            <Star size={40} color="#f59e0b" fill="#f59e0b" />
          </View>
          <Text style={styles.heroTitle}>
            {t('celOnboardHeroTitle' as any) || 'Bienvenue dans le Mode Célébrité'}
          </Text>
          <Text style={styles.heroSubtitle}>
            {t('celOnboardHeroSubtitle' as any) || 'Monétisez votre notoriété et connectez-vous avec vos fans de manière unique.'}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {t('celOnboardPhotoSection' as any) || 'VOTRE PHOTO DE PROFIL'}
          </Text>
          <View style={styles.photoCard}>
            <TouchableOpacity
              style={styles.photoPicker}
              onPress={pickProfilePhoto}
              activeOpacity={0.7}
            >
              {profilePhoto ? (
                <Image source={{ uri: profilePhoto }} style={styles.photoImage} />
              ) : (
                <View style={styles.photoPlaceholder}>
                  <CameraIcon size={36} color="#6b7280" />
                  <Text style={styles.photoPlaceholderText}>
                    {t('addProfilePhoto' as any) || 'Ajouter photo'}
                  </Text>
                </View>
              )}
              <View style={styles.photoEditBadge}>
                <CameraIcon size={14} color="#fff" />
              </View>
            </TouchableOpacity>
            {profilePhoto ? (
              <View style={styles.photoStatus}>
                <CheckCircle size={16} color="#10b981" />
                <Text style={styles.photoStatusText}>
                  {t('celOnboardPhotoDone' as any) || 'Photo ajoutée !'}
                </Text>
              </View>
            ) : (
              <Text style={styles.photoHint}>
                {t('profilePhotoHint' as any) || 'Appuyez pour ajouter ou changer votre photo'}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {t('celOnboardStepsSection' as any) || 'ÉTAPES POUR COMMENCER'}
          </Text>
          {steps.map((s, i) => (
            <TouchableOpacity
              key={i}
              style={[styles.stepRow, s.locked && { opacity: 0.4 }]}
              onPress={s.onPress}
              disabled={s.locked || s.done}
              activeOpacity={0.7}
            >
              <View style={[styles.stepNum, s.done && styles.stepNumDone]}>
                {s.done ? (
                  <CheckCircle size={18} color="#fff" />
                ) : s.locked ? (
                  <Lock size={14} color="#9ca3af" />
                ) : (
                  <Text style={styles.stepNumText}>{s.num}</Text>
                )}
              </View>
              <Text style={[styles.stepTitle, s.done && styles.stepTitleDone]}>{s.title}</Text>
              {!s.locked && !s.done && <ArrowRight size={16} color="#6b7280" />}
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {t('celOnboardFeaturesSection' as any) || 'CE QUE VOUS POUVEZ FAIRE'}
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
            {t('celOnboardRevenueSection' as any) || 'VOS REVENUS'}
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
                  {t('celOnboardRevenueTitle' as any) || 'Gardez 85% de vos revenus'}
                </Text>
                <Text style={styles.revenueDesc}>
                  {t('celOnboardRevenueDesc' as any) || 'Plyz prélève seulement 15% de commission. Les frais Stripe (2.9% + 0.30€) sont déduits séparément. Aucune commission Apple/Google.'}
                </Text>
              </View>
            </View>
            <View style={styles.revenueDivider} />
            <View style={styles.revenueExamples}>
              <View style={styles.revenueExample}>
                <Text style={styles.revenueExampleLabel}>
                  {t('celOnboardVideoCall' as any) || 'Appel vidéo'}
                </Text>
                <Text style={styles.revenueExamplePrice}>150€</Text>
                <Text style={styles.revenueExampleNet}>
                  → ~123€ {t('celOnboardNet' as any) || 'net'}
                </Text>
              </View>
              <View style={styles.revenueExample}>
                <Text style={styles.revenueExampleLabel}>
                  {t('celOnboardAutograph' as any) || 'Autographe'}
                </Text>
                <Text style={styles.revenueExamplePrice}>50€</Text>
                <Text style={styles.revenueExampleNet}>
                  → ~41€ {t('celOnboardNet' as any) || 'net'}
                </Text>
              </View>
              <View style={styles.revenueExample}>
                <Text style={styles.revenueExampleLabel}>
                  {t('celOnboardDedication' as any) || 'Dédicace'}
                </Text>
                <Text style={styles.revenueExamplePrice}>80€</Text>
                <Text style={styles.revenueExampleNet}>
                  → ~66€ {t('celOnboardNet' as any) || 'net'}
                </Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {t('celOnboardVerifSection' as any) || 'VÉRIFICATION'}
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
                  {t('celOnboardCreatorTitle' as any) || 'Streamer / Créateur de contenu ?'}
                </Text>
                <Text style={styles.orgCardDesc}>
                  {t('celOnboardCreatorDesc' as any) || 'Twitch, YouTube, TikTok, Instagram... Faites vérifier votre profil pour obtenir un badge vérifié.'}
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
                  {t('celOnboardOrgTitle' as any) || 'Vous êtes une organisation ?'}
                </Text>
                <Text style={styles.orgCardDesc}>
                  {t('celOnboardOrgDesc' as any) || 'Clubs sportifs, marques, associations... Faites vérifier votre compte pour un badge spécial.'}
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
                  {t('celOnboardCelebTitle' as any) || 'Sportif, artiste, chanteur ?'}
                </Text>
                <Text style={styles.orgCardDesc}>
                  {t('celOnboardCelebDesc' as any) || 'Acteurs, sportifs, musiciens... Faites vérifier votre profil pour obtenir un badge « Officiel ».'}
                </Text>
              </View>
              <ArrowRight size={18} color="#10b981" />
            </View>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.startButton}
          onPress={() => {
            if (Platform.OS !== 'web') {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            }
            router.back();
          }}
          activeOpacity={0.8}
        >
          <Zap size={20} color="#000" />
          <Text style={styles.startButtonText}>
            {t('celOnboardStart' as any) || 'C\'est parti !'}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      <BottomNav />

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
        celebrityName=""
        userId={user?.id}
      />

      <Modal visible={showBioModal} transparent animationType="fade" onRequestClose={() => setShowBioModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <View style={{ width: '100%', maxWidth: 440, backgroundColor: '#0f1e30', borderRadius: 20, padding: 22, borderWidth: 1, borderColor: 'rgba(16,185,129,0.2)' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <FileText size={22} color="#10b981" />
              <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>{t('celOnboardBioTitle' as any) || 'Texte de présentation'}</Text>
            </View>
            <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, marginBottom: 14, lineHeight: 19 }}>
              {t('celOnboardBioSub' as any) || 'Ce texte apparaîtra dans le « À propos » de votre profil public.'}
            </Text>
            <TextInput
              style={{ backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: 14, color: '#fff', fontSize: 15, minHeight: 120, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }}
              value={bioInput}
              onChangeText={setBioInput}
              placeholder={t('celOnboardBioPlaceholder' as any) || 'Ex : Acteur et humoriste français, connu pour...'}
              placeholderTextColor="#6b7280"
              multiline
              maxLength={300}
              textAlignVertical="top"
            />
            <Text style={{ color: '#6b7280', fontSize: 12, textAlign: 'right', marginTop: 6 }}>{bioInput.length}/300</Text>
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
              <TouchableOpacity style={{ flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center' }} onPress={() => setShowBioModal(false)} activeOpacity={0.7}>
                <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>{t('cancel') || 'Annuler'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: '#10b981', alignItems: 'center' }} onPress={saveBio} activeOpacity={0.8}>
                <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>{t('save' as any) || 'Enregistrer'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  scroll: { flex: 1 },

  heroSection: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 10,
    paddingBottom: 24,
  },
  heroIconWrap: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: 'rgba(245,158,11,0.15)',
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 16,
  },
  heroTitle: {
    color: '#fff', fontSize: 22, fontWeight: '700',
    textAlign: 'center', marginBottom: 8,
  },
  heroSubtitle: {
    color: '#9ca3af', fontSize: 15, textAlign: 'center',
    lineHeight: 22,
  },

  section: {
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  sectionTitle: {
    color: '#f59e0b', fontSize: 12, fontWeight: '700',
    letterSpacing: 1, marginBottom: 12,
  },

  photoCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 16, padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  photoPicker: {
    width: 100, height: 100, borderRadius: 50,
    overflow: 'hidden',
    borderWidth: 2, borderColor: 'rgba(245,158,11,0.4)',
    borderStyle: 'dashed',
  },
  photoImage: { width: '100%', height: '100%', borderRadius: 50 },
  photoPlaceholder: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  photoPlaceholderText: { color: '#6b7280', fontSize: 11, marginTop: 4 },
  photoEditBadge: {
    position: 'absolute', bottom: 2, right: 2,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#f59e0b',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: '#1e293b',
  },
  photoStatus: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10,
  },
  photoStatusText: { color: '#10b981', fontSize: 13, fontWeight: '500' },
  photoHint: { color: '#9ca3af', fontSize: 12, marginTop: 10, textAlign: 'center' },

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

  stepRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 16,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12, marginBottom: 8,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  stepNum: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center', alignItems: 'center',
    marginRight: 14,
  },
  stepNumDone: { backgroundColor: '#10b981' },
  stepNumText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  stepTitle: { color: '#fff', fontSize: 14, fontWeight: '500', flex: 1 },
  stepTitleDone: { color: '#9ca3af', textDecorationLine: 'line-through' },

  stripeCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 16, padding: 20,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  stripeHeader: { flexDirection: 'row', alignItems: 'flex-start' },
  stripeTitle: { color: '#fff', fontSize: 16, fontWeight: '600', marginBottom: 4 },
  stripeDesc: { color: '#9ca3af', fontSize: 13, lineHeight: 18 },
  stripeButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#6366f1', borderRadius: 12,
    paddingVertical: 14, marginTop: 16, gap: 8,
  },
  stripeButtonText: { color: '#fff', fontSize: 15, fontWeight: '600' },

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

  startButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#f59e0b', borderRadius: 14,
    paddingVertical: 16, marginHorizontal: 16, marginTop: 8,
    gap: 8,
  },
  startButtonText: { color: '#000', fontSize: 17, fontWeight: '700' },
});
