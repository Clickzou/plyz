import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft, Building2, CheckCircle, Clock,
  XCircle, AlertTriangle, ChevronDown, Send,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { authedFetch } from '@/utils/authedFetch';
import BottomNav, { BOTTOM_NAV_HEIGHT } from '@/components/BottomNav';

const API_BASE = Platform.OS === 'web' ? '' : (process.env.EXPO_PUBLIC_STRIPE_SERVER_URL || '');

const ORG_TYPES = [
  { value: 'sports_club', labelKey: 'orgTypeSportsClub' as const, fallback: 'Club sportif' },
  { value: 'brand', labelKey: 'orgTypeBrand' as const, fallback: 'Marque' },
  { value: 'association', labelKey: 'orgTypeAssociation' as const, fallback: 'Association' },
  { value: 'media', labelKey: 'orgTypeMedia' as const, fallback: 'Média' },
  { value: 'label', labelKey: 'orgTypeLabel' as const, fallback: 'Label' },
  { value: 'agency', labelKey: 'orgTypeAgency' as const, fallback: 'Agence' },
  { value: 'other', labelKey: 'orgTypeOther' as const, fallback: 'Autre' },
];

export default function OrgVerificationScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [existingStatus, setExistingStatus] = useState<null | {
    has_request: boolean;
    status: string | null;
    org_name?: string;
    org_type?: string;
    admin_notes?: string;
    created_at?: string;
    reviewed_at?: string;
  }>(null);

  const [orgName, setOrgName] = useState('');
  const [orgType, setOrgType] = useState('');
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [officialWebsite, setOfficialWebsite] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [representativeName, setRepresentativeName] = useState('');
  const [representativeRole, setRepresentativeRole] = useState('');
  const [proofDescription, setProofDescription] = useState('');
  const [proofUrl, setProofUrl] = useState('');

  useEffect(() => {
    checkStatus();
  }, []);

  const checkStatus = async () => {
    if (!user?.id) { setLoading(false); return; }
    try {
      const res = await authedFetch(`${API_BASE}/api/org-verification-status?user_id=${user.id}`);
      const data = await res.json();
      setExistingStatus(data);
    } catch (e) {
      console.error('Failed to check org verification status:', e);
    }
    setLoading(false);
  };

  const handleSubmit = async () => {
    if (!orgName.trim() || !orgType || !contactEmail.trim() || !representativeName.trim()) {
      Alert.alert(
        t('orgVerifMissingFields' as any) || 'Champs requis',
        t('orgVerifMissingFieldsMsg' as any) || 'Veuillez remplir tous les champs obligatoires.'
      );
      return;
    }

    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    setSubmitting(true);
    try {
      const res = await authedFetch(`${API_BASE}/api/org-verification-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user?.id,
          org_name: orgName.trim(),
          org_type: orgType,
          official_website: officialWebsite.trim() || null,
          contact_email: contactEmail.trim(),
          representative_name: representativeName.trim(),
          representative_role: representativeRole.trim() || null,
          proof_description: proofDescription.trim() || null,
          proof_url: proofUrl.trim() || null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.error === 'request_pending') {
          Alert.alert('', t('orgVerifAlreadyPending' as any) || 'Une demande est déjà en cours de traitement.');
        } else if (data.error === 'already_verified') {
          Alert.alert('', t('orgVerifAlreadyVerified' as any) || 'Votre organisation est déjà vérifiée.');
        } else {
          Alert.alert('Erreur', data.error || data.message);
        }
        setSubmitting(false);
        return;
      }

      Alert.alert(
        t('orgVerifSubmittedTitle' as any) || 'Demande envoyée !',
        t('orgVerifSubmittedMsg' as any) || 'Votre demande de vérification a été soumise. Nous vous contacterons sous 48h.',
        [{ text: 'OK', onPress: () => checkStatus() }]
      );
    } catch (e: any) {
      Alert.alert('Erreur', e.message);
    }
    setSubmitting(false);
  };

  const getStatusConfig = (status: string | null) => {
    switch (status) {
      case 'pending':
        return { icon: Clock, color: '#f59e0b', bg: '#78350f', label: t('orgStatusPending' as any) || 'En attente de vérification' };
      case 'approved':
        return { icon: CheckCircle, color: '#10b981', bg: '#064e3b', label: t('orgStatusApproved' as any) || 'Vérifié' };
      case 'rejected':
        return { icon: XCircle, color: '#ef4444', bg: '#7f1d1d', label: t('orgStatusRejected' as any) || 'Refusé' };
      case 'more_info':
        return { icon: AlertTriangle, color: '#f59e0b', bg: '#78350f', label: t('orgStatusMoreInfo' as any) || 'Informations complémentaires requises' };
      default:
        return { icon: Clock, color: '#6b7280', bg: '#374151', label: '' };
    }
  };

  const selectedTypeLabel = ORG_TYPES.find(o => o.value === orgType);

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <LinearGradient colors={['#0f172a', '#1e293b', '#0f172a']} style={StyleSheet.absoluteFill} />
        <ActivityIndicator size="large" color="#8b5cf6" />
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
          {t('orgVerifTitle' as any) || 'Vérification Organisation'}
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
            <Building2 size={40} color="#8b5cf6" />
          </View>
          <Text style={styles.heroTitle}>
            {t('orgVerifHeroTitle' as any) || 'Compte Organisation'}
          </Text>
          <Text style={styles.heroSubtitle}>
            {t('orgVerifHeroSubtitle' as any) || 'Vérifiez votre organisation pour accéder à des fonctionnalités exclusives et un badge vérifié.'}
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
                  <Text style={styles.statusOrgName}>{existingStatus!.org_name}</Text>
                  <Text style={styles.statusDate}>
                    {t('orgVerifSubmittedOn' as any) || 'Soumise le'}{' '}
                    {new Date(existingStatus!.created_at!).toLocaleDateString()}
                  </Text>
                  {existingStatus!.admin_notes && (
                    <View style={styles.adminNotesBox}>
                      <Text style={styles.adminNotesLabel}>
                        {t('orgVerifAdminNotes' as any) || 'Notes :'}
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
                    ? (t('orgVerifRejectedNotice' as any) || 'Votre demande précédente a été refusée. Vous pouvez soumettre une nouvelle demande.')
                    : (t('orgVerifMoreInfoNotice' as any) || 'Des informations complémentaires sont requises. Veuillez corriger et resoumettre.')}
                </Text>
                {existingStatus.admin_notes && (
                  <Text style={styles.resubmitNotes}>{existingStatus.admin_notes}</Text>
                )}
              </View>
            )}

            <Text style={styles.sectionTitle}>
              {t('orgVerifFormSection' as any) || 'INFORMATIONS DE L\'ORGANISATION'}
            </Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>
                {t('orgVerifOrgName' as any) || 'Nom de l\'organisation'} *
              </Text>
              <TextInput
                style={styles.input}
                value={orgName}
                onChangeText={setOrgName}
                placeholder={t('orgVerifOrgNamePlaceholder' as any) || 'Ex: FC Barcelone, Nike, etc.'}
                placeholderTextColor="#6b7280"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>
                {t('orgVerifOrgType' as any) || 'Type d\'organisation'} *
              </Text>
              <TouchableOpacity
                style={styles.selectBtn}
                onPress={() => setShowTypePicker(!showTypePicker)}
              >
                <Text style={[styles.selectBtnText, !orgType && { color: '#6b7280' }]}>
                  {selectedTypeLabel
                    ? (t(selectedTypeLabel.labelKey as any) || selectedTypeLabel.fallback)
                    : (t('orgVerifSelectType' as any) || 'Sélectionner un type')}
                </Text>
                <ChevronDown size={18} color="#9ca3af" />
              </TouchableOpacity>
              {showTypePicker && (
                <View style={styles.pickerDropdown}>
                  {ORG_TYPES.map(type => (
                    <TouchableOpacity
                      key={type.value}
                      style={[styles.pickerItem, orgType === type.value && styles.pickerItemActive]}
                      onPress={() => {
                        setOrgType(type.value);
                        setShowTypePicker(false);
                        if (Platform.OS !== 'web') Haptics.selectionAsync();
                      }}
                    >
                      <Text style={[styles.pickerItemText, orgType === type.value && styles.pickerItemTextActive]}>
                        {t(type.labelKey as any) || type.fallback}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>
                {t('orgVerifWebsite' as any) || 'Site web officiel'}
              </Text>
              <TextInput
                style={styles.input}
                value={officialWebsite}
                onChangeText={setOfficialWebsite}
                placeholder="https://..."
                placeholderTextColor="#6b7280"
                keyboardType="url"
                autoCapitalize="none"
              />
            </View>

            <Text style={[styles.sectionTitle, { marginTop: 24 }]}>
              {t('orgVerifContactSection' as any) || 'REPRÉSENTANT'}
            </Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>
                {t('orgVerifRepName' as any) || 'Nom du représentant'} *
              </Text>
              <TextInput
                style={styles.input}
                value={representativeName}
                onChangeText={setRepresentativeName}
                placeholder={t('orgVerifRepNamePlaceholder' as any) || 'Prénom et nom'}
                placeholderTextColor="#6b7280"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>
                {t('orgVerifRepRole' as any) || 'Fonction'}
              </Text>
              <TextInput
                style={styles.input}
                value={representativeRole}
                onChangeText={setRepresentativeRole}
                placeholder={t('orgVerifRepRolePlaceholder' as any) || 'Ex: Directeur communication'}
                placeholderTextColor="#6b7280"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>
                {t('orgVerifEmail' as any) || 'Email professionnel'} *
              </Text>
              <TextInput
                style={styles.input}
                value={contactEmail}
                onChangeText={setContactEmail}
                placeholder={t('orgVerifEmailPlaceholder' as any) || 'contact@organisation.com'}
                placeholderTextColor="#6b7280"
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <Text style={[styles.sectionTitle, { marginTop: 24 }]}>
              {t('orgVerifProofSection' as any) || 'JUSTIFICATIFS'}
            </Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>
                {t('orgVerifProofDesc' as any) || 'Description des justificatifs'}
              </Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={proofDescription}
                onChangeText={setProofDescription}
                placeholder={t('orgVerifProofDescPlaceholder' as any) || 'Décrivez les documents que vous pouvez fournir (SIRET, statuts, etc.)'}
                placeholderTextColor="#6b7280"
                multiline
                numberOfLines={3}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>
                {t('orgVerifProofUrl' as any) || 'Lien vers les justificatifs'}
              </Text>
              <TextInput
                style={styles.input}
                value={proofUrl}
                onChangeText={setProofUrl}
                placeholder={t('orgVerifProofUrlPlaceholder' as any) || 'URL vers un document ou dossier partagé'}
                placeholderTextColor="#6b7280"
                keyboardType="url"
                autoCapitalize="none"
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
                      ? (t('orgVerifResubmit' as any) || 'Resoumettre la demande')
                      : (t('orgVerifSubmit' as any) || 'Envoyer la demande')}
                  </Text>
                </>
              )}
            </TouchableOpacity>

            <Text style={styles.disclaimer}>
              {t('orgVerifDisclaimer' as any) || 'La vérification est gratuite et prend généralement 24 à 48h. Vous serez contacté par email.'}
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
    width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(139,92,246,0.15)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  heroTitle: { fontSize: 24, fontWeight: '800', color: '#fff', textAlign: 'center', marginBottom: 8 },
  heroSubtitle: { fontSize: 14, color: '#94a3b8', textAlign: 'center', lineHeight: 20, maxWidth: 320 },
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
  statusOrgName: { fontSize: 20, fontWeight: '700', color: '#fff', marginBottom: 4 },
  statusDate: { fontSize: 13, color: '#94a3b8', marginBottom: 12 },
  adminNotesBox: {
    backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 16,
    width: '100%', marginTop: 8,
  },
  adminNotesLabel: { fontSize: 12, fontWeight: '600', color: '#94a3b8', marginBottom: 4 },
  adminNotesText: { fontSize: 14, color: '#e2e8f0', lineHeight: 20 },
  formSection: { marginTop: 10 },
  sectionTitle: {
    fontSize: 12, fontWeight: '700', color: '#64748b', letterSpacing: 1,
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
  pickerItem: { paddingHorizontal: 16, paddingVertical: 12 },
  pickerItemActive: { backgroundColor: 'rgba(139,92,246,0.2)' },
  pickerItemText: { fontSize: 14, color: '#e2e8f0' },
  pickerItemTextActive: { color: '#8b5cf6', fontWeight: '600' },
  resubmitNotice: {
    backgroundColor: 'rgba(245,158,11,0.1)', borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)', marginBottom: 20, gap: 8,
  },
  resubmitText: { fontSize: 14, color: '#fbbf24', lineHeight: 20 },
  resubmitNotes: { fontSize: 13, color: '#e2e8f0', fontStyle: 'italic', marginTop: 4 },
  submitBtn: {
    backgroundColor: '#8b5cf6', borderRadius: 14, paddingVertical: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, marginTop: 24,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  disclaimer: {
    fontSize: 12, color: '#64748b', textAlign: 'center', marginTop: 16, lineHeight: 18,
  },
});
