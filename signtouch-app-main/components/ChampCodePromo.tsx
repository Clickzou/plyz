import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Check, Tag } from 'lucide-react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAutoTranslate } from '@/utils/translation';

const API_BASE = process.env.EXPO_PUBLIC_STRIPE_SERVER_URL || '';

// CHAMP DE CODE PROMO, PARTOUT OÙ L'ON PAIE
//
// Il n'existait que sur UN écran — les sessions live vidéo rejointes par code.
// Les codes « événement » n'avaient donc aucun endroit où être saisis : une
// campagne pouvait être créée sans qu'aucun fan puisse jamais s'en servir.
//
// Deux familles de codes coexistent en base, chacune avec sa route de
// validation. Le composant choisit selon le contexte, l'appelant n'a pas à le
// savoir.
//
// TOUTES les remises sont acceptées, pas seulement la gratuité. Le montant
// affiché ici n'est qu'un aperçu : le prix réellement facturé est recalculé par
// le SERVEUR à partir du code. L'app ne transmet jamais de montant — sans quoi
// elle fixerait ses propres prix.

export type TypePromo = 'live_video' | 'evenement';

export interface PromoApplique {
  promoId: string;
  pourcentage: number;
  /** Prix après remise, en centimes — pour l'affichage uniquement. */
  prixRemiseCents: number;
}

interface Props {
  type: TypePromo;
  /** Identifiant de la session ou de l'événement concerné. */
  cibleId: string;
  /** Prix affiché avant remise, en centimes. */
  prixCents: number;
  onApplique: (promo: PromoApplique) => void;
  /** Code déjà appliqué : le champ laisse place au bandeau récapitulatif. */
  applique: PromoApplique | null;
  /** Retire le code appliqué. */
  onRetire?: () => void;
}

const euros = (cents: number) => (cents / 100).toFixed(2).replace('.', ',') + ' €';

export default function ChampCodePromo({
  type, cibleId, prixCents, onApplique, applique, onRetire,
}: Props) {
  const { t } = useLanguage();
  const tr = useAutoTranslate([
    'Code promo',
    'Entrer un code promo',
    'Valider',
    'Retirer',
    'C’est offert !',
    '−{{p}} % : {{prix}} au lieu de {{avant}}',
    'Ce code n’existe pas ou n’est plus actif.',
    'Ce code a expiré.',
    'Ce code a atteint son nombre maximum d’utilisations.',
  ]);

  const [code, setCode] = useState('');
  const [validation, setValidation] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const valider = async () => {
    const saisi = code.trim();
    if (!saisi || validation) return;
    setValidation(true);
    setErreur(null);
    try {
      const route = type === 'evenement' ? 'validate-event-promo-code' : 'validate-promo-code';
      const corps = type === 'evenement'
        ? { code: saisi, event_session_id: cibleId }
        : { code: saisi, session_id: cibleId };

      const r = await fetch(`${API_BASE}/api/${route}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corps),
      });
      const data = await r.json();

      if (!data?.valid) {
        setErreur(
          data?.reason === 'expired' ? tr('Ce code a expiré.')
            : data?.reason === 'max_uses_reached' ? tr('Ce code a atteint son nombre maximum d’utilisations.')
              : tr('Ce code n’existe pas ou n’est plus actif.'),
        );
        return;
      }

      const pourcentage = Math.max(0, Math.min(100, Number(data.discount_percent) || 0));
      // Même arrondi que le serveur (à l'entier inférieur) : entre deux
      // centimes, la différence va au fan. Un aperçu qui ne correspond pas au
      // montant prélevé vaudrait mieux ne pas exister.
      const prixRemiseCents = Math.max(0, prixCents - Math.floor((prixCents * pourcentage) / 100));

      onApplique({ promoId: String(data.promo_id), pourcentage, prixRemiseCents });
    } catch {
      setErreur(tr('Ce code n’existe pas ou n’est plus actif.'));
    } finally {
      setValidation(false);
    }
  };

  if (applique) {
    return (
      <View style={styles.applique}>
        <Check size={17} color="#10b981" />
        <Text style={styles.appliqueTexte}>
          {applique.prixRemiseCents === 0
            ? tr('C’est offert !')
            : tr('−{{p}} % : {{prix}} au lieu de {{avant}}')
              .replace('{{p}}', String(applique.pourcentage))
              .replace('{{prix}}', euros(applique.prixRemiseCents))
              .replace('{{avant}}', euros(prixCents))}
        </Text>
        {!!onRetire && (
          <TouchableOpacity onPress={onRetire} hitSlop={10}>
            <Text style={styles.retirer}>{tr('Retirer')}</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <View style={styles.bloc}>
      <View style={styles.entete}>
        <Tag size={14} color="rgba(255,255,255,0.55)" />
        <Text style={styles.titre}>{t('promoCode' as any) || tr('Code promo')}</Text>
      </View>
      <View style={styles.ligne}>
        <TextInput
          style={styles.champ}
          placeholder={t('enterPromoCode' as any) || tr('Entrer un code promo')}
          placeholderTextColor="rgba(255,255,255,0.35)"
          value={code}
          onChangeText={(v) => { setCode(v.toUpperCase()); setErreur(null); }}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={30}
        />
        <TouchableOpacity
          style={[styles.bouton, !code.trim() && styles.boutonInactif]}
          onPress={valider}
          disabled={!code.trim() || validation}
          activeOpacity={0.85}
        >
          {validation
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={styles.boutonTexte}>{t('validate' as any) || tr('Valider')}</Text>}
        </TouchableOpacity>
      </View>
      {!!erreur && <Text style={styles.erreur}>{erreur}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  bloc: { marginBottom: 16 },
  entete: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  titre: { color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: '600' },
  ligne: { flexDirection: 'row', gap: 8 },
  champ: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 14, paddingVertical: 12, color: '#fff', fontSize: 15,
  },
  bouton: {
    backgroundColor: '#3b82f6', borderRadius: 12,
    paddingHorizontal: 18, justifyContent: 'center', alignItems: 'center',
    minWidth: 88,
  },
  boutonInactif: { backgroundColor: 'rgba(255,255,255,0.1)', opacity: 0.5 },
  boutonTexte: { color: '#fff', fontSize: 14.5, fontWeight: '700' },
  erreur: { color: '#fca5a5', fontSize: 12.5, marginTop: 8, lineHeight: 17 },
  applique: {
    flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 16,
    backgroundColor: 'rgba(16,185,129,0.12)', borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.35)', borderRadius: 12, padding: 13,
  },
  appliqueTexte: { color: '#a7f3d0', fontSize: 14, fontWeight: '700', flex: 1 },
  retirer: { color: 'rgba(255,255,255,0.5)', fontSize: 12.5, fontWeight: '700' },
});
