import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Clock } from 'lucide-react-native';
import { showAlert } from '@/utils/alertHelper';
import { useLanguage } from '@/contexts/LanguageContext';
import { authedFetch } from '@/utils/authedFetch';

const STRIPE_SERVER_URL = process.env.EXPO_PUBLIC_STRIPE_SERVER_URL || '';

// Bandeau « l'heure de fin est dépassée » + boutons de prolongation.
//
// Signalé par JC en test réel : la célébrité peut rester sur l'écran « Événement
// créé ! » sans jamais lancer sa séance de dédicace. Le bandeau n'existait que
// sur l'écran de dédicace : son événement expirait donc sans qu'on lui dise
// jamais rien, pendant que l'argent de ses fans restait pré-autorisé. Le
// composant est partagé pour que les deux écrans se comportent à l'identique.
type Props = {
  sessionId: string;
  /** Heure de fin initiale (ISO). Les prolongations sont suivies en interne. */
  endsAt?: string | null;
  /** Notifie l'écran parent de la nouvelle heure de fin après une prolongation. */
  onExtended?: (newEndsAt: string) => void;
};

const EXTEND_CHOICES = [15, 30, 60, 120];

export default function EventPastEndBanner({ sessionId, endsAt, onExtended }: Props) {
  const { t } = useLanguage();
  // Horloge rafraîchie chaque minute : sans elle, une célébrité restée sur cet
  // écran ne verrait jamais l'heure de fin passer.
  const [nowTs, setNowTs] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTs(Date.now()), 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const [effectiveEndsAt, setEffectiveEndsAt] = useState<string | null>(null);
  const [extending, setExtending] = useState(false);
  const [extendExhausted, setExtendExhausted] = useState(false);

  const currentEndsAt = effectiveEndsAt || endsAt;
  const isPastEnd = !!currentEndsAt && new Date(currentEndsAt).getTime() < nowTs;

  // Prolonge la séance (plafond de 2 h cumulées, contrôlé côté serveur).
  const handleExtend = async (minutes: number) => {
    if (extending || !sessionId || !STRIPE_SERVER_URL) return;
    setExtending(true);
    try {
      const r = await authedFetch(`${STRIPE_SERVER_URL}/api/extend-event-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventSessionId: sessionId, minutes }),
      });
      const data = await r.json();
      if (!r.ok) {
        if (data?.error === 'max_extension_reached') {
          setExtendExhausted(true);
          showAlert(
            t('extendMaxTitle') || 'Prolongation maximale atteinte',
            t('extendMaxMsg') || "Tu as déjà prolongé cette séance de 2 h au total. Termine-la pour que les fans non servis soient remboursés."
          );
          return;
        }
        showAlert(t('error') || 'Erreur', data?.error || 'Prolongation impossible');
        return;
      }
      setEffectiveEndsAt(data.endsAt);
      setNowTs(Date.now());
      onExtended?.(data.endsAt);
      if (typeof data.remainingMinutes === 'number' && data.remainingMinutes <= 0) setExtendExhausted(true);
    } catch (e: any) {
      showAlert(t('error') || 'Erreur', e?.message || 'Prolongation impossible');
    } finally {
      setExtending(false);
    }
  };

  if (!isPastEnd) return null;

  return (
    <View style={styles.pastEndBanner}>
      <View style={styles.pastEndHeaderRow}>
        <Clock size={18} color="#f59e0b" />
        <Text style={styles.pastEndBannerText}>
          {t('eventPastEndNotice') || "Cette séance devait se terminer à l'heure prévue. Tu peux encore publier les dédicaces en attente, mais pense à terminer la séance : les fans non servis seront automatiquement remboursés."}
        </Text>
      </View>
      {!extendExhausted && (
        <>
          <Text style={styles.extendLabel}>
            {t('extendSessionLabel') || 'Prolonger la séance :'}
          </Text>
          <View style={styles.extendRow}>
            {EXTEND_CHOICES.map((m) => (
              <TouchableOpacity
                key={m}
                style={[styles.extendChip, extending && styles.extendChipDisabled]}
                onPress={() => handleExtend(m)}
                disabled={extending}
              >
                <Text style={styles.extendChipText}>
                  {m < 60 ? `${m} min` : `${m / 60} h`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pastEndBanner: {
    backgroundColor: 'rgba(245,158,11,0.12)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.45)',
  },
  pastEndHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  pastEndBannerText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: '#f59e0b',
    fontWeight: '600',
  },
  extendLabel: { fontSize: 12, color: '#f59e0b', fontWeight: '700', marginTop: 12, marginBottom: 8 },
  extendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  extendChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(245,158,11,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.6)',
  },
  extendChipDisabled: { opacity: 0.5 },
  extendChipText: { color: '#f59e0b', fontWeight: '700', fontSize: 13 },
});
