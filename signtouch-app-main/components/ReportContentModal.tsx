import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  ScrollView,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { X, Flag, Check } from 'lucide-react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/utils/supabase';
import { showAlert } from '@/utils/alertHelper';
import { APP_VERSION_FULL } from '@/utils/appVersion';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';

const API_BASE = process.env.EXPO_PUBLIC_STRIPE_SERVER_URL || '';

/** Motifs proposés. Les valeurs sont stockées telles quelles dans `content_reports.reason`. */
const REASONS = [
  { value: 'sexual', key: 'reportReasonSexual', fallback: 'Contenu sexuel ou nudité' },
  { value: 'violence', key: 'reportReasonViolence', fallback: 'Violence ou incitation à la haine' },
  { value: 'harassment', key: 'reportReasonHarassment', fallback: 'Harcèlement ou intimidation' },
  { value: 'scam', key: 'reportReasonScam', fallback: 'Arnaque ou tentative de fraude' },
  { value: 'impersonation', key: 'reportReasonImpersonation', fallback: 'Usurpation d\'identité' },
  { value: 'illegal', key: 'reportReasonIllegal', fallback: 'Contenu illégal' },
  { value: 'other', key: 'reportReasonOther', fallback: 'Autre' },
] as const;

interface ReportContentModalProps {
  visible: boolean;
  onClose: () => void;
  /** Nature de l'élément visé : publication, profil de célébrité ou événement. */
  targetType: 'post' | 'profile' | 'event' | 'comment';
  /** Identifiant de l'élément visé, quand il en a un. */
  targetId?: string | null;
  /** Titre de la publication ou nom affiché : permet de lire le signalement sans requête annexe. */
  targetLabel?: string | null;
  /** Célébrité ou auteur visé, quand il est connu. */
  reportedUserId?: string | null;
}

export default function ReportContentModal({
  visible,
  onClose,
  targetType,
  targetId,
  targetLabel,
  reportedUserId,
}: ReportContentModalProps) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [reason, setReason] = useState<string | null>(null);
  const [details, setDetails] = useState('');
  const [sending, setSending] = useState(false);
  // Le champ « details » est en bas de la carte : sans cette marge, le clavier
  // d'une Modal Android le recouvre entierement.
  const hauteurClavier = useKeyboardHeight();

  const close = () => {
    setReason(null);
    setDetails('');
    onClose();
  };

  const handleSubmit = async () => {
    if (!reason || sending) return;
    setSending(true);

    // 1) Enregistrement en base : c'est la trace qui fait foi, et elle alimente
    //    la revue des signalements côté admin.
    const { error } = await supabase.from('content_reports').insert({
      reporter_user_id: user?.id || null,
      reporter_email: user?.email || null,
      target_type: targetType,
      target_id: targetId || null,
      reported_user_id: reportedUserId || null,
      target_label: targetLabel || null,
      reason,
      details: details.trim() || null,
      platform: Platform.OS,
      app_version: APP_VERSION_FULL,
    });

    // 2) Alerte e-mail au support, en meilleur effort : un signalement qui dort
    //    en base sans prévenir personne ne protège personne.
    try {
      const label = REASONS.find(r => r.value === reason);
      await fetch(`${API_BASE}/api/report-problem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: `Signalement de contenu — ${reason}`,
          description:
            `Motif : ${label?.fallback || reason}\n` +
            `Type : ${targetType}\n` +
            `Élément : ${targetLabel || targetId || 'non précisé'}\n` +
            `Utilisateur visé : ${reportedUserId || 'non précisé'}\n\n` +
            `${details.trim() || '(aucune précision)'}\n\n` +
            `------------------------------\n` +
            `Signalé par : ${user?.email || 'visiteur non connecté'}\n` +
            `Plateforme : ${Platform.OS}\n` +
            `Version : ${APP_VERSION_FULL}`,
          reporter_email: user?.email || null,
          subject: `Signalement de contenu (${targetType})`,
          message: details.trim() || label?.fallback || reason,
          userEmail: user?.email || null,
          platform: Platform.OS,
          appVersion: APP_VERSION_FULL,
        }),
      });
    } catch { /* l'e-mail est un confort : l'enregistrement en base a déjà eu lieu */ }

    setSending(false);

    // On ne remercie que si la trace existe vraiment. Afficher « merci » sur un
    // signalement perdu donnerait à l'utilisateur une fausse impression de sécurité.
    if (error) {
      showAlert(
        t('error') || 'Erreur',
        t('reportContentError' as any) || "L'envoi a échoué. Réessaie dans un instant.",
      );
      return;
    }

    close();
    showAlert(
      t('reportContentSentTitle' as any) || 'Signalement envoyé',
      t('reportContentSentMsg' as any) || 'Merci. Notre équipe va examiner ce contenu.',
    );
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={[styles.overlay, { paddingBottom: 20 + hauteurClavier }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={close} />
        <View style={styles.card}>
          <LinearGradient colors={['#1f2937', '#111827']} style={StyleSheet.absoluteFill} />

          <View style={styles.header}>
            <View style={styles.headerIcon}>
              <Flag size={20} color="#ef4444" strokeWidth={2} />
            </View>
            <Text style={styles.title}>
              {t('reportContentTitle' as any) || 'Signaler ce contenu'}
            </Text>
            <TouchableOpacity onPress={close} style={styles.closeButton} hitSlop={10}>
              <X size={20} color="#9ca3af" />
            </TouchableOpacity>
          </View>

          <Text style={styles.subtitle}>
            {t('reportContentSubtitle' as any)
              || 'Dis-nous ce qui ne va pas. Notre équipe examinera ce signalement.'}
          </Text>

          <ScrollView style={styles.reasons} keyboardShouldPersistTaps="handled">
            {REASONS.map(r => {
              const selected = reason === r.value;
              return (
                <TouchableOpacity
                  key={r.value}
                  style={[styles.reasonRow, selected && styles.reasonRowSelected]}
                  onPress={() => setReason(r.value)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.radio, selected && styles.radioSelected]}>
                    {selected && <Check size={12} color="#fff" strokeWidth={3} />}
                  </View>
                  <Text style={[styles.reasonText, selected && styles.reasonTextSelected]}>
                    {t(r.key as any) || r.fallback}
                  </Text>
                </TouchableOpacity>
              );
            })}

            <TextInput
              style={styles.input}
              value={details}
              onChangeText={setDetails}
              placeholder={t('reportDetailsPlaceholder' as any) || 'Précisions (facultatif)'}
              placeholderTextColor="#6b7280"
              multiline
              numberOfLines={3}
              maxLength={1000}
            />
          </ScrollView>

          <TouchableOpacity
            style={[styles.submit, (!reason || sending) && styles.submitDisabled]}
            onPress={handleSubmit}
            disabled={!reason || sending}
            activeOpacity={0.85}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.submitText}>
                {t('reportSubmit' as any) || 'Envoyer le signalement'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 20 },
  card: {
    borderRadius: 20, overflow: 'hidden', padding: 20,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', maxHeight: '85%',
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  headerIcon: {
    width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(239,68,68,0.12)',
  },
  title: { color: '#fff', fontSize: 17, fontWeight: '800', flex: 1 },
  closeButton: { padding: 4 },
  subtitle: { color: '#9ca3af', fontSize: 13, lineHeight: 19, marginBottom: 16 },
  reasons: { flexGrow: 0 },
  reasonRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 12, borderRadius: 12, marginBottom: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'transparent',
  },
  reasonRowSelected: { borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.10)' },
  radio: {
    width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#4b5563',
    alignItems: 'center', justifyContent: 'center',
  },
  radioSelected: { borderColor: '#ef4444', backgroundColor: '#ef4444' },
  reasonText: { color: '#d1d5db', fontSize: 14, flex: 1 },
  reasonTextSelected: { color: '#fff', fontWeight: '600' },
  input: {
    marginTop: 8, minHeight: 80, borderRadius: 12, padding: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    color: '#fff', fontSize: 14, textAlignVertical: 'top',
  },
  submit: {
    marginTop: 16, borderRadius: 14, paddingVertical: 14, alignItems: 'center',
    backgroundColor: '#ef4444',
  },
  submitDisabled: { backgroundColor: '#4b5563' },
  submitText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
