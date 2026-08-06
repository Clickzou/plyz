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
// Seule la remise de 100 % est appliquée : c'est le seul cas que la chaîne de
// paiement sait traiter aujourd'hui (on saute le paiement). Une remise
// partielle exigerait de recalculer le montant côté Stripe — annoncer « -20 % »
// sans savoir le prélever serait pire que de ne rien proposer.

export type TypePromo = 'live_video' | 'evenement';

interface Props {
  type: TypePromo;
  /** Identifiant de la session ou de l'événement concerné. */
  cibleId: string;
  /** Appelé quand un code 100 % est validé : la prestation devient gratuite. */
  onGratuit: (promoId: string) => void;
  /** Vrai quand un code a déjà été appliqué : le champ laisse place au bandeau. */
  applique: boolean;
}

export default function ChampCodePromo({ type, cibleId, onGratuit, applique }: Props) {
  const { t } = useLanguage();
  const tr = useAutoTranslate([
    'Code promo',
    'Entrer un code promo',
    'Valider',
    'Code promo appliqué — c’est offert !',
    'Ce code n’existe pas ou n’est plus actif.',
    'Ce code a expiré.',
    'Ce code a atteint son nombre maximum d’utilisations.',
    'Ce code ne donne pas la gratuité totale : il n’est pas encore utilisable ici.',
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
      if (data.discount_percent !== 100) {
        setErreur(tr('Ce code ne donne pas la gratuité totale : il n’est pas encore utilisable ici.'));
        return;
      }
      onGratuit(String(data.promo_id));
    } catch {
      // Réseau : on le dit, plutôt que de laisser un bouton sans effet.
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
          {t('promoApplied' as any) || tr('Code promo appliqué — c’est offert !')}
        </Text>
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
});
