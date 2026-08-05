import React, { useState } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { X, Video, Clock } from 'lucide-react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { showAlert } from '@/utils/alertHelper';
import { authedFetch } from '@/utils/authedFetch';

const API_BASE = process.env.EXPO_PUBLIC_STRIPE_SERVER_URL || '';

interface Props {
  visible: boolean;
  onClose: () => void;
  celebrityId: string;
  celebrityName: string;
  priceCents: number;
  durationMinutes: number;
  currency?: string;
  onRequested?: () => void;
}

export default function VideoCallRequestModal({
  visible, onClose, celebrityId, celebrityName,
  priceCents, durationMinutes, currency = 'eur', onRequested,
}: Props) {
  const { t } = useLanguage();
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const prix = (priceCents / 100).toFixed(2).replace('.', ',')
    + (currency === 'eur' ? ' €' : ' ' + currency.toUpperCase());

  const envoyer = async () => {
    if (sending) return;
    setSending(true);
    try {
      const res = await authedFetch(`${API_BASE}/api/video-call-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ celebrity_id: celebrityId, message: message.trim() }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        // Chaque refus a sa raison : un message générique laisserait le fan
        // relancer indéfiniment sans comprendre.
        const raisons: Record<string, string> = {
          request_already_open: t('vcrAlreadyOpen' as any)
            || 'Tu as déjà une demande en cours auprès de cette personnalité.',
          celebrity_has_no_video_rate: t('vcrNoRate' as any)
            || "Cette personnalité n'a pas encore fixé de tarif pour les appels privés.",
          cannot_request_self: t('vcrSelf' as any) || 'Tu ne peux pas te demander un appel à toi-même.',
        };
        showAlert(t('error') || 'Erreur', raisons[data?.error] || (t('actionFailed') || "La demande n'a pas pu être envoyée."));
        return;
      }

      setMessage('');
      onClose();
      onRequested?.();
      showAlert(
        t('vcrSentTitle' as any) || 'Demande envoyée',
        t('vcrSentMsg' as any)
          || 'La personnalité a 48 h pour te répondre. Tu seras prévenu, et tu ne paieras qu\'après avoir accepté le créneau proposé.',
      );
    } catch {
      showAlert(t('error') || 'Erreur', t('actionFailed') || "La demande n'a pas pu être envoyée.");
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View style={styles.card}>
          <LinearGradient colors={['#1f2937', '#111827']} style={StyleSheet.absoluteFill} />

          <View style={styles.header}>
            <View style={styles.icon}><Video size={20} color="#6366f1" strokeWidth={2} /></View>
            <Text style={styles.title}>
              {t('vcrTitle' as any) || 'Demander un appel vidéo privé'}
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}><X size={20} color="#9ca3af" /></TouchableOpacity>
          </View>

          <Text style={styles.subtitle}>
            {(t('vcrSubtitle' as any) || 'Un tête-à-tête avec {name}, rien que pour toi.')
              .replace('{name}', celebrityName)}
          </Text>

          <View style={styles.infoRow}>
            <Clock size={15} color="#10b981" />
            <Text style={styles.infoText}>{durationMinutes} min · {prix}</Text>
          </View>

          {/* On dit clairement qu'aucun paiement n'a lieu maintenant : sans ça,
              un fan hésite à envoyer sa demande de peur d'être débité. */}
          <Text style={styles.reassure}>
            {t('vcrNoChargeYet' as any)
              || "Tu n'es pas débité maintenant. La personnalité te proposera une date, et tu régleras seulement si elle te convient."}
          </Text>

          <TextInput
            style={styles.input}
            value={message}
            onChangeText={setMessage}
            placeholder={t('vcrMessagePlaceholder' as any) || 'Un mot pour accompagner ta demande (facultatif)'}
            placeholderTextColor="#6b7280"
            multiline
            maxLength={1000}
          />

          <TouchableOpacity
            style={[styles.submit, sending && styles.submitDisabled]}
            onPress={envoyer}
            disabled={sending}
            activeOpacity={0.85}
          >
            {sending ? <ActivityIndicator size="small" color="#fff" /> : (
              <Text style={styles.submitText}>{t('vcrSend' as any) || 'Envoyer ma demande'}</Text>
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
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  icon: {
    width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(99,102,241,0.14)',
  },
  title: { color: '#fff', fontSize: 17, fontWeight: '800', flex: 1 },
  subtitle: { color: '#9ca3af', fontSize: 13, lineHeight: 19, marginBottom: 12 },
  infoRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(16,185,129,0.08)', borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10,
    borderWidth: 1, borderColor: 'rgba(16,185,129,0.2)',
  },
  infoText: { color: '#10b981', fontSize: 15, fontWeight: '700' },
  reassure: { color: '#9ca3af', fontSize: 12, lineHeight: 17, marginBottom: 12 },
  input: {
    minHeight: 80, borderRadius: 12, padding: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    color: '#fff', fontSize: 14, textAlignVertical: 'top',
  },
  submit: {
    marginTop: 16, borderRadius: 14, paddingVertical: 14, alignItems: 'center',
    backgroundColor: '#6366f1',
  },
  submitDisabled: { backgroundColor: '#4b5563' },
  submitText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
