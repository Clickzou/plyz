import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft, Tv, CheckCircle, Clock,
  XCircle, AlertTriangle, Send,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import BottomNav, { BOTTOM_NAV_HEIGHT } from '@/components/BottomNav';

const API_BASE = Platform.OS === 'web' ? '' : (process.env.EXPO_PUBLIC_STRIPE_SERVER_URL || '');

const PLATFORMS = [
  { key: 'twitch', label: 'Twitch', placeholder: 'https://twitch.tv/votre_chaine', color: '#9146FF' },
  { key: 'youtube', label: 'YouTube', placeholder: 'https://youtube.com/@votre_chaine', color: '#FF0000' },
  { key: 'tiktok', label: 'TikTok', placeholder: 'https://tiktok.com/@votre_compte', color: '#000000' },
  { key: 'instagram', label: 'Instagram', placeholder: 'https://instagram.com/votre_compte', color: '#E4405F' },
  { key: 'x', label: 'X (Twitter)', placeholder: 'https://x.com/votre_compte', color: '#1DA1F2' },
];

export default function CreatorVerificationScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { user, session } = useAuth();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [existingStatus, setExistingStatus] = useState<null | {
    has_request: boolean;
    status: string | null;
    display_name?: string;
    primary_platform?: string;
    admin_notes?: string;
    created_at?: string;
    reviewed_at?: string;
  }>(null);

  const [displayName, setDisplayName] = useState('');
  const [primaryPlatform, setPrimaryPlatform] = useState('');
  const [showPlatformPicker, setShowPlatformPicker] = useState(false);
  const [twitchUrl, setTwitchUrl] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [tiktokUrl, setTiktokUrl] = useState('');
  const [instagramUrl, setInstagramUrl] = useState('');
  const [xUrl, setXUrl] = useState('');
  const [followerCount, setFollowerCount] = useState('');
  const [contentCategory, setContentCategory] = useState('');
  const [additionalInfo, setAdditionalInfo] = useState('');

  useEffect(() => {
    checkStatus();
  }, []);

  const checkStatus = async () => {
    if (!user?.id) { setLoading(false); return; }
    try {
      const res = await fetch(`${API_BASE}/api/creator-verification-status?user_id=${user.id}`);
      const data = await res.json();
      setExistingStatus(data);
    } catch (e) {
      console.error('Failed to check creator verification status:', e);
    }
    setLoading(false);
  };

  const handleSubmit = async () => {
    if (!displayName.trim() || !primaryPlatform) {
      Alert.alert(
        t('creatorVerifMissingFields' as any) || 'Champs requis',
        t('creatorVerifMissingFieldsMsg' as any) || 'Veuillez indiquer votre nom et votre plateforme principale.'
      );
      return;
    }

    const links: Record<string, string> = {};
    if (twitchUrl.trim()) links.twitch = twitchUrl.trim();
    if (youtubeUrl.trim()) links.youtube = youtubeUrl.trim();
    if (tiktokUrl.trim()) links.tiktok = tiktokUrl.trim();
    if (instagramUrl.trim()) links.instagram = instagramUrl.trim();
    if (xUrl.trim()) links.x = xUrl.trim();

    if (Object.keys(links).length === 0) {
      Alert.alert(
        t('creatorVerifNoLinks' as any) || 'Lien requis',
        t('creatorVerifNoLinksMsg' as any) || 'Veuillez renseigner au moins un lien vers votre profil sur une plateforme.'
      );
      return;
    }

    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    setSubmitting(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }
      const res = await fetch(`${API_BASE}/api/creator-verification-request`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          user_id: user?.id,
          display_name: displayName.trim(),
          primary_platform: primaryPlatform,
          platform_links: links,
          follower_count: followerCount.trim() || null,
          content_category: contentCategory.trim() || null,
          additional_info: additionalInfo.trim() || null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.error === 'request_pending') {
          Alert.alert('', t('creatorVerifAlreadyPending' as any) || 'Une demande est d\u00e9j\u00e0 en cours de traitement.');
        } else if (data.error === 'already_verified') {
          Alert.alert('', t('creatorVerifAlreadyVerified' as any) || 'Votre profil cr\u00e9ateur est d\u00e9j\u00e0 v\u00e9rifi\u00e9.');
        } else {
          Alert.alert('Erreur', data.error || data.message);
        }
        setSubmitting(false);
        return;
      }

      if (data.auto_approved) {
        Alert.alert(
          t('creatorVerifApprovedTitle' as any) || 'Profil vérifié !',
          t('creatorVerifApprovedMsg' as any) || 'Félicitations ! Votre profil créateur a été vérifié automatiquement. Votre badge officiel est maintenant actif.',
          [{ text: 'OK', onPress: () => checkStatus() }]
        );
      } else {
        Alert.alert(
          t('creatorVerifSubmittedTitle' as any) || 'Demande envoyée !',
          t('creatorVerifSubmittedMsg' as any) || 'Votre demande de vérification créateur a été soumise. Nous examinerons votre profil sous 48h.',
          [{ text: 'OK', onPress: () => checkStatus() }]
        );
      }
    } catch (e: any) {
      Alert.alert('Erreur', e.message);
    }
    setSubmitting(false);
  };

  const getStatusConfig = (status: string | null) => {
    switch (status) {
      case 'pending':
        return { icon: Clock, color: '#f59e0b', bg: '#78350f', label: t('creatorStatusPending' as any) || 'En attente de v\u00e9rification' };
      case 'approved':
        return { icon: CheckCircle, color: '#10b981', bg: '#064e3b', label: t('creatorStatusApproved' as any) || 'V\u00e9rifi\u00e9' };
      case 'rejected':
        return { icon: XCircle, color: '#ef4444', bg: '#7f1d1d', label: t('creatorStatusRejected' as any) || 'Refus\u00e9' };
      case 'more_info':
        return { icon: AlertTriangle, color: '#f59e0b', bg: '#78350f', label: t('creatorStatusMoreInfo' as any) || 'Informations compl\u00e9mentaires requises' };
      default:
        return { icon: Clock, color: '#6b7280', bg: '#374151', label: '' };
    }
  };

  const selectedPlatform = PLATFORMS.find(p => p.key === primaryPlatform);

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <LinearGradient colors={['#0f172a', '#1e293b', '#0f172a']} style={StyleSheet.absoluteFill} />
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  const hasExisting = existingStatus?.has_request && existingStatus.status !== 'rejected' && existingStatus.status !== 'more_info';
  const canResubmit = existingStatus?.has_request && (existingStatus.status === 'rejected' || existingStatus.status === 'more_info');

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0f172a', '#1e293b', '#0f172a']} style={StyleSheet.absoluteFill} />

      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {t('creatorVerifTitle' as any) || 'V\u00e9rification Cr\u00e9ateur'}
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
            <Tv size={40} color="#3b82f6" />
          </View>
          <Text style={styles.heroTitle}>
            {t('creatorVerifHeroTitle' as any) || 'Compte Cr\u00e9ateur'}
          </Text>
          <Text style={styles.heroSubtitle}>
            {t('creatorVerifHeroSubtitle' as any) || 'Streamers, YouTubers, TikTokeurs, influenceurs... Faites v\u00e9rifier votre profil pour obtenir un badge v\u00e9rifi\u00e9 m\u00eame sans page Wikidata.'}
          </Text>
        </View>

        {hasExisting ? (
          <View style={styles.statusSection}>
            {(() => {
              const cfg = getStatusConfig(existingStatus!.status);
              const StatusIcon = cfg.icon;
              return (
                <View style={[styles.statusCard, { borderColor: cfg.color }]}>
                  <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
                    <StatusIcon size={20} color={cfg.color} />
                    <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
                  </View>
                  <Text style={styles.statusName}>{existingStatus!.display_name}</Text>
                  <Text style={styles.statusPlatform}>
                    {PLATFORMS.find(p => p.key === existingStatus!.primary_platform)?.label || existingStatus!.primary_platform}
                  </Text>
                  <Text style={styles.statusDate}>
                    {t('creatorVerifSubmittedOn' as any) || 'Soumise le'}{' '}
                    {new Date(existingStatus!.created_at!).toLocaleDateString()}
                  </Text>
                  {existingStatus!.admin_notes && (
                    <View style={styles.adminNotesBox}>
                      <Text style={styles.adminNotesLabel}>
                        {t('creatorVerifAdminNotes' as any) || 'Notes :'}
                      </Text>
                      <Text style={styles.adminNotesText}>{existingStatus!.admin_notes}</Text>
                    </View>
                  )}
                </View>
              );
            })()}
          </View>
        ) : (
          <View style={styles.formSection}>
            {canResubmit && existingStatus?.admin_notes && (
              <View style={styles.resubmitNotice}>
                <AlertTriangle size={18} color="#f59e0b" />
                <Text style={styles.resubmitText}>
                  {existingStatus.status === 'rejected'
                    ? (t('creatorVerifRejectedNotice' as any) || 'Votre demande pr\u00e9c\u00e9dente a \u00e9t\u00e9 refus\u00e9e. Vous pouvez soumettre une nouvelle demande.')
                    : (t('creatorVerifMoreInfoNotice' as any) || 'Des informations compl\u00e9mentaires sont requises. Veuillez corriger et resoumettre.')}
                </Text>
                {existingStatus.admin_notes && (
                  <Text style={styles.resubmitNotes}>{existingStatus.admin_notes}</Text>
                )}
              </View>
            )}

            <Text style={styles.sectionTitle}>
              {t('creatorVerifIdentitySection' as any) || 'VOTRE IDENTIT\u00c9'}
            </Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>
                {t('creatorVerifDisplayName' as any) || 'Nom de sc\u00e8ne / pseudo'} *
              </Text>
              <TextInput
                style={styles.input}
                value={displayName}
                onChangeText={setDisplayName}
                placeholder={t('creatorVerifDisplayNamePlaceholder' as any) || 'Ex: Squeezie, Gotaga, Amine...'}
                placeholderTextColor="#6b7280"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>
                {t('creatorVerifPrimaryPlatform' as any) || 'Plateforme principale'} *
              </Text>
              <TouchableOpacity
                style={styles.selectBtn}
                onPress={() => setShowPlatformPicker(!showPlatformPicker)}
              >
                <Text style={[styles.selectBtnText, !primaryPlatform && { color: '#6b7280' }]}>
                  {selectedPlatform
                    ? selectedPlatform.label
                    : (t('creatorVerifSelectPlatform' as any) || 'S\u00e9lectionner une plateforme')}
                </Text>
              </TouchableOpacity>
              {showPlatformPicker && (
                <View style={styles.pickerDropdown}>
                  {PLATFORMS.map(p => (
                    <TouchableOpacity
                      key={p.key}
                      style={[styles.pickerItem, primaryPlatform === p.key && styles.pickerItemActive]}
                      onPress={() => {
                        setPrimaryPlatform(p.key);
                        setShowPlatformPicker(false);
                        if (Platform.OS !== 'web') Haptics.selectionAsync();
                      }}
                    >
                      <View style={[styles.platformDot, { backgroundColor: p.color }]} />
                      <Text style={[styles.pickerItemText, primaryPlatform === p.key && styles.pickerItemTextActive]}>
                        {p.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>
                {t('creatorVerifFollowers' as any) || 'Nombre d\u2019abonn\u00e9s (approximatif)'}
              </Text>
              <TextInput
                style={styles.input}
                value={followerCount}
                onChangeText={setFollowerCount}
                placeholder={t('creatorVerifFollowersPlaceholder' as any) || 'Ex: 150 000'}
                placeholderTextColor="#6b7280"
                keyboardType="numeric"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>
                {t('creatorVerifCategory' as any) || 'Cat\u00e9gorie de contenu'}
              </Text>
              <TextInput
                style={styles.input}
                value={contentCategory}
                onChangeText={setContentCategory}
                placeholder={t('creatorVerifCategoryPlaceholder' as any) || 'Ex: Gaming, Lifestyle, Fitness, Musique...'}
                placeholderTextColor="#6b7280"
              />
            </View>

            <Text style={[styles.sectionTitle, { marginTop: 24 }]}>
              {t('creatorVerifLinksSection' as any) || 'LIENS DE VOS PROFILS'}
            </Text>

            <Text style={styles.linksHint}>
              {t('creatorVerifLinksHint' as any) || 'Renseignez au moins un lien vers votre profil. Plus vous en ajoutez, plus la v\u00e9rification sera rapide.'}
            </Text>

            {PLATFORMS.map(p => (
              <View key={p.key} style={styles.inputGroup}>
                <View style={styles.platformLabel}>
                  <View style={[styles.platformDot, { backgroundColor: p.color }]} />
                  <Text style={styles.inputLabel}>{p.label}</Text>
                </View>
                <TextInput
                  style={styles.input}
                  value={
                    p.key === 'twitch' ? twitchUrl :
                    p.key === 'youtube' ? youtubeUrl :
                    p.key === 'tiktok' ? tiktokUrl :
                    p.key === 'instagram' ? instagramUrl : xUrl
                  }
                  onChangeText={
                    p.key === 'twitch' ? setTwitchUrl :
                    p.key === 'youtube' ? setYoutubeUrl :
                    p.key === 'tiktok' ? setTiktokUrl :
                    p.key === 'instagram' ? setInstagramUrl : setXUrl
                  }
                  placeholder={p.placeholder}
                  placeholderTextColor="#6b7280"
                  keyboardType="url"
                  autoCapitalize="none"
                />
              </View>
            ))}

            <Text style={[styles.sectionTitle, { marginTop: 24 }]}>
              {t('creatorVerifAdditionalSection' as any) || 'INFORMATIONS COMPL\u00c9MENTAIRES'}
            </Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>
                {t('creatorVerifAdditionalInfo' as any) || 'Informations suppl\u00e9mentaires'}
              </Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={additionalInfo}
                onChangeText={setAdditionalInfo}
                placeholder={t('creatorVerifAdditionalInfoPlaceholder' as any) || 'Tout ce qui pourrait nous aider \u00e0 v\u00e9rifier votre identit\u00e9 (articles de presse, collaborations, etc.)'}
                placeholderTextColor="#6b7280"
                multiline
                numberOfLines={3}
              />
            </View>

            <TouchableOpacity
              style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={submitting}
              activeOpacity={0.8}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Send size={20} color="#fff" />
                  <Text style={styles.submitBtnText}>
                    {canResubmit
                      ? (t('creatorVerifResubmit' as any) || 'Resoumettre la demande')
                      : (t('creatorVerifSubmit' as any) || 'Envoyer la demande')}
                  </Text>
                </>
              )}
            </TouchableOpacity>

            <Text style={styles.disclaimer}>
              {t('creatorVerifDisclaimer' as any) || 'La v\u00e9rification est gratuite et prend g\u00e9n\u00e9ralement 24 \u00e0 48h. Vous recevrez une notification une fois la demande examin\u00e9e.'}
            </Text>
          </View>
        )}
      </ScrollView>

      <BottomNav />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  scroll: { flex: 1, paddingHorizontal: 20 },
  heroSection: { alignItems: 'center', paddingVertical: 30 },
  heroIconWrap: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(59,130,246,0.15)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  heroTitle: { fontSize: 24, fontWeight: '800', color: '#fff', textAlign: 'center', marginBottom: 8 },
  heroSubtitle: { fontSize: 14, color: '#94a3b8', textAlign: 'center', lineHeight: 20, maxWidth: 340 },
  statusSection: { marginTop: 10 },
  statusCard: {
    borderRadius: 16, borderWidth: 1, backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 24, alignItems: 'center',
  },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16,
    paddingVertical: 8, borderRadius: 20, marginBottom: 16,
  },
  statusText: { fontSize: 14, fontWeight: '700' },
  statusName: { fontSize: 20, fontWeight: '700', color: '#fff', marginBottom: 4 },
  statusPlatform: { fontSize: 14, color: '#3b82f6', fontWeight: '600', marginBottom: 4 },
  statusDate: { fontSize: 13, color: '#94a3b8', marginBottom: 12 },
  adminNotesBox: {
    backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 16,
    width: '100%', marginTop: 8,
  },
  adminNotesLabel: { fontSize: 12, fontWeight: '600', color: '#94a3b8', marginBottom: 4 },
  adminNotesText: { fontSize: 14, color: '#e2e8f0', lineHeight: 20 },
  formSection: { marginTop: 10 },
  sectionTitle: {
    fontSize: 12, fontWeight: '700', color: '#3b82f6', letterSpacing: 1,
    marginBottom: 16,
  },
  inputGroup: { marginBottom: 16 },
  inputLabel: { fontSize: 14, fontWeight: '600', color: '#e2e8f0', marginBottom: 6 },
  input: {
    backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12, paddingHorizontal: 16,
    paddingVertical: 14, color: '#fff', fontSize: 15, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  selectBtn: {
    backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12, paddingHorizontal: 16,
    paddingVertical: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  selectBtnText: { fontSize: 15, color: '#fff' },
  pickerDropdown: {
    backgroundColor: '#1e293b', borderRadius: 12, marginTop: 4,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', overflow: 'hidden',
  },
  pickerItem: {
    paddingHorizontal: 16, paddingVertical: 12,
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  pickerItemActive: { backgroundColor: 'rgba(59,130,246,0.2)' },
  pickerItemText: { fontSize: 14, color: '#e2e8f0' },
  pickerItemTextActive: { color: '#3b82f6', fontWeight: '600' },
  platformDot: { width: 10, height: 10, borderRadius: 5 },
  platformLabel: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  linksHint: {
    fontSize: 13, color: '#64748b', marginBottom: 16, lineHeight: 18,
  },
  resubmitNotice: {
    backgroundColor: 'rgba(245,158,11,0.1)', borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)', marginBottom: 20, gap: 8,
  },
  resubmitText: { fontSize: 14, color: '#fbbf24', lineHeight: 20 },
  resubmitNotes: { fontSize: 13, color: '#e2e8f0', fontStyle: 'italic', marginTop: 4 },
  submitBtn: {
    backgroundColor: '#3b82f6', borderRadius: 14, paddingVertical: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, marginTop: 24,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  disclaimer: {
    fontSize: 12, color: '#64748b', textAlign: 'center', marginTop: 16, lineHeight: 18,
  },
});
