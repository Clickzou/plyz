import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Award, CheckCircle, Clock, XCircle, Send } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { authedFetch } from '@/utils/authedFetch';
import BottomNav, { BOTTOM_NAV_HEIGHT } from '@/components/BottomNav';

const API_BASE = process.env.EXPO_PUBLIC_STRIPE_SERVER_URL || '';

const CATEGORIES = [
  { key: 'athlete', fallback: 'Sportif' },
  { key: 'actor', fallback: 'Acteur / Actrice' },
  { key: 'singer', fallback: 'Chanteur / Chanteuse' },
  { key: 'artist', fallback: 'Artiste' },
  { key: 'other', fallback: 'Autre personnalité' },
];

export default function CelebrityVerificationScreen() {
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
    admin_notes?: string;
  }>(null);

  const [category, setCategory] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [wikipediaUrl, setWikipediaUrl] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [additionalInfo, setAdditionalInfo] = useState('');

  useEffect(() => {
    checkStatus();
  }, []);

  const checkStatus = async () => {
    if (!user?.id) { setLoading(false); return; }
    try {
      const res = await authedFetch(`${API_BASE}/api/celebrity-verification-status?user_id=${user.id}`);
      const data = await res.json();
      setExistingStatus(data);
    } catch (e) {
      console.error('Failed to check celebrity verification status:', e);
    }
    setLoading(false);
  };

  const handleSubmit = async () => {
    if (!displayName.trim() || !category) {
      Alert.alert(
        t('celebVerifMissingFields' as any) || 'Champs requis',
        t('celebVerifMissingFieldsMsg' as any) || 'Veuillez indiquer votre nom et votre catégorie.'
      );
      return;
    }
    const links: Record<string, string> = {};
    if (wikipediaUrl.trim()) links.wikipedia = wikipediaUrl.trim();
    if (websiteUrl.trim()) links.website = websiteUrl.trim();
    if (Object.keys(links).length === 0) {
      Alert.alert(
        t('celebVerifNoLinks' as any) || 'Lien requis',
        t('celebVerifNoLinksMsg' as any) || 'Veuillez renseigner au moins un lien de preuve (Wikipédia, site officiel, presse...).'
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
      const res = await fetch(`${API_BASE}/api/celebrity-verification-request`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          user_id: user?.id,
          display_name: displayName.trim(),
          category,
          proof_links: links,
          additional_info: additionalInfo.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === 'request_pending') {
          Alert.alert('', t('celebVerifAlreadyPending' as any) || 'Une demande est déjà en cours de traitement.');
        } else if (data.error === 'already_verified') {
          Alert.alert('', t('celebVerifAlreadyVerified' as any) || 'Votre profil est déjà vérifié.');
        } else {
          Alert.alert(t('error') || 'Erreur', data.error || data.message || '');
        }
        setSubmitting(false);
        return;
      }
      Alert.alert(
        t('celebVerifSubmittedTitle' as any) || 'Demande envoyée !',
        t('celebVerifSubmittedMsg' as any) || 'Votre demande de vérification a été soumise. Nous examinerons votre profil sous 48h.',
        [{ text: 'OK', onPress: () => checkStatus() }]
      );
    } catch (e: any) {
      Alert.alert(t('error') || 'Erreur', e.message);
    }
    setSubmitting(false);
  };

  const status = existingStatus?.status || null;
  const hasExisting = !!existingStatus?.has_request && status !== 'rejected';

  const statusConfig = (s: string | null) => {
    switch (s) {
      case 'pending':
        return { icon: <Clock size={40} color="#fbbf24" />, color: '#fbbf24', title: t('celebVerifPendingTitle' as any) || 'Demande en cours d\'examen', desc: t('celebVerifPendingDesc' as any) || 'Votre demande de vérification est en cours de traitement. Nous reviendrons vers vous sous 48h.' };
      case 'approved':
        return { icon: <CheckCircle size={40} color="#10b981" />, color: '#10b981', title: t('celebVerifApprovedTitle2' as any) || 'Profil vérifié !', desc: t('celebVerifApprovedDesc2' as any) || 'Votre profil est vérifié. Votre badge officiel est actif.' };
      default:
        return { icon: <XCircle size={40} color="#ef4444" />, color: '#ef4444', title: t('celebVerifRejectedTitle' as any) || 'Demande refusée', desc: existingStatus?.admin_notes || (t('celebVerifRejectedDesc' as any) || 'Votre demande n\'a pas pu être validée.') };
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0f172a', '#1e293b', '#0f172a']} style={StyleSheet.absoluteFill} />

      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()} activeOpacity={0.7}>
          <ArrowLeft size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('celebVerifTitle' as any) || 'Personnalité publique'}</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: BOTTOM_NAV_HEIGHT + 30 }} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator size="large" color="#8b5cf6" style={{ marginTop: 60 }} />
        ) : hasExisting ? (
          (() => {
            const cfg = statusConfig(status);
            return (
              <View style={[styles.statusCard, { borderColor: cfg.color }]}>
                {cfg.icon}
                <Text style={[styles.statusTitle, { color: cfg.color }]}>{cfg.title}</Text>
                <Text style={styles.statusDesc}>{cfg.desc}</Text>
              </View>
            );
          })()
        ) : (
          <>
            <View style={styles.intro}>
              <View style={styles.introIcon}>
                <Award size={28} color="#8b5cf6" />
              </View>
              <Text style={styles.introTitle}>{t('celebVerifIntroTitle' as any) || 'Faites vérifier votre profil'}</Text>
              <Text style={styles.introDesc}>
                {t('celebVerifIntroDesc' as any) || 'Sportif, acteur, chanteur, artiste… Obtenez un badge « Officiel » pour rassurer vos fans. Indiquez votre catégorie et un lien de preuve.'}
              </Text>
            </View>

            <View style={styles.criteriaBox}>
              <Text style={styles.criteriaTitle}>{t('celebVerifCriteriaTitle' as any) || 'Critères pour être accepté'}</Text>
              <Text style={styles.criteriaIntro}>
                {t('celebVerifCriteriaIntro' as any) || "Avant d'envoyer ta demande, vérifie que tu remplis ces critères — sinon elle sera refusée :"}
              </Text>
              {[1, 2, 3, 4, 5].map((n) => (
                <View key={n} style={styles.criteriaItem}>
                  <CheckCircle size={15} color="#10b981" style={{ marginTop: 2 }} />
                  <Text style={styles.criteriaText}>{t(`celebVerifCrit${n}` as any) || ''}</Text>
                </View>
              ))}
            </View>

            <Text style={styles.label}>{t('celebVerifCategory' as any) || 'Votre catégorie'}</Text>
            <View style={styles.categoryRow}>
              {CATEGORIES.map(c => (
                <TouchableOpacity
                  key={c.key}
                  style={[styles.categoryChip, category === c.key && styles.categoryChipActive]}
                  onPress={() => setCategory(c.key)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.categoryChipText, category === c.key && styles.categoryChipTextActive]}>
                    {t(`celebVerifCat_${c.key}` as any) || c.fallback}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>{t('celebVerifName' as any) || 'Nom complet ou nom de scène'}</Text>
            <TextInput
              style={styles.input}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder={t('celebVerifNamePlaceholder' as any) || 'Ex : Alex Martin'}
              placeholderTextColor="#6b7280"
            />

            <Text style={styles.label}>{t('celebVerifWikipedia' as any) || 'Lien Wikipédia (recommandé)'}</Text>
            <TextInput
              style={styles.input}
              value={wikipediaUrl}
              onChangeText={setWikipediaUrl}
              placeholder="https://fr.wikipedia.org/wiki/..."
              placeholderTextColor="#6b7280"
              keyboardType="url"
              autoCapitalize="none"
            />

            <Text style={styles.label}>{t('celebVerifWebsite' as any) || 'Site officiel / presse'}</Text>
            <TextInput
              style={styles.input}
              value={websiteUrl}
              onChangeText={setWebsiteUrl}
              placeholder="https://..."
              placeholderTextColor="#6b7280"
              keyboardType="url"
              autoCapitalize="none"
            />

            <Text style={styles.label}>{t('celebVerifMore' as any) || 'Informations complémentaires (optionnel)'}</Text>
            <TextInput
              style={[styles.input, { minHeight: 90 }]}
              value={additionalInfo}
              onChangeText={setAdditionalInfo}
              placeholder={t('celebVerifMorePlaceholder' as any) || 'Tout élément qui aide à confirmer votre identité.'}
              placeholderTextColor="#6b7280"
              multiline
              textAlignVertical="top"
            />

            <TouchableOpacity
              style={[styles.submitButton, submitting && { opacity: 0.6 }]}
              onPress={handleSubmit}
              disabled={submitting}
              activeOpacity={0.85}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Send size={18} color="#fff" />
                  <Text style={styles.submitButtonText}>{t('celebVerifSubmit' as any) || 'Envoyer ma demande'}</Text>
                </>
              )}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      <BottomNav />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12 },
  backButton: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  intro: { alignItems: 'center', marginBottom: 24 },
  criteriaBox: { backgroundColor: 'rgba(16,185,129,0.08)', borderWidth: 1, borderColor: 'rgba(16,185,129,0.35)', borderRadius: 14, padding: 16, marginBottom: 24 },
  criteriaTitle: { color: '#34d399', fontSize: 15, fontWeight: '700', marginBottom: 6 },
  criteriaIntro: { color: 'rgba(255,255,255,0.75)', fontSize: 13, lineHeight: 19, marginBottom: 12 },
  criteriaItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 8 },
  criteriaText: { color: 'rgba(255,255,255,0.85)', fontSize: 13, lineHeight: 19, flex: 1 },
  introIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(139,92,246,0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  introTitle: { color: '#fff', fontSize: 20, fontWeight: '700', textAlign: 'center', marginBottom: 8 },
  introDesc: { color: 'rgba(255,255,255,0.6)', fontSize: 14, textAlign: 'center', lineHeight: 20, paddingHorizontal: 8 },
  label: { color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: '600', marginBottom: 8, marginTop: 16 },
  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryChip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  categoryChipActive: { backgroundColor: 'rgba(139,92,246,0.2)', borderColor: '#8b5cf6' },
  categoryChipText: { color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: '600' },
  categoryChipTextActive: { color: '#fff' },
  input: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: '#fff', fontSize: 15, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  submitButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#8b5cf6', borderRadius: 14, paddingVertical: 16, marginTop: 28 },
  submitButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  statusCard: { alignItems: 'center', gap: 12, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 18, padding: 28, borderWidth: 1, marginTop: 20 },
  statusTitle: { fontSize: 20, fontWeight: '700', textAlign: 'center' },
  statusDesc: { color: 'rgba(255,255,255,0.7)', fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
