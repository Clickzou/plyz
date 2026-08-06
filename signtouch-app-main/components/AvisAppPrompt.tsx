import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { Star, X } from 'lucide-react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAutoTranslate } from '@/utils/translation';
import { peutDemanderAvis, ouvrirAvis, noterDemandeFaite } from '@/utils/avisApp';

// Proposée UNIQUEMENT aux utilisateurs actifs : deux prestations menées à
// terme, quel que soit le rôle. Demander un avis à quelqu'un qui vient
// d'ouvrir l'app, c'est récolter des « 1 étoile, je ne comprends pas à quoi
// ça sert » — et une note d'ouverture basse est très longue à rattraper.
//
// Un refus vaut deux mois de silence. L'écran ne revient jamais une fois
// l'avis donné.

export default function AvisAppPrompt() {
  const { t } = useLanguage();
  const tr = useAutoTranslate([
    'Vous aimez Plyz ?',
    'Votre avis aide les autres fans à nous découvrir — et les personnalités à nous faire confiance. Cela prend dix secondes.',
    'Donner mon avis',
    'Plus tard',
  ]);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let annule = false;
    // Léger décalage : la fenêtre ne doit pas surgir pendant l'animation de fin
    // de prestation, au moment où l'on regarde encore sa dédicace.
    const id = setTimeout(async () => {
      const ok = await peutDemanderAvis();
      if (!annule && ok) setVisible(true);
    }, 2500);
    return () => { annule = true; clearTimeout(id); };
  }, []);

  const plusTard = async () => {
    setVisible(false);
    await noterDemandeFaite();
  };

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={plusTard}>
      <View style={styles.fond}>
        <View style={styles.carte}>
          <TouchableOpacity style={styles.fermer} onPress={plusTard} hitSlop={12}>
            <X size={20} color="rgba(255,255,255,0.4)" />
          </TouchableOpacity>

          <View style={styles.etoiles}>
            {[0, 1, 2, 3, 4].map((i) => (
              <Star key={i} size={22} color="#fbbf24" fill="#fbbf24" />
            ))}
          </View>

          <Text style={styles.titre}>
            {t('reviewPromptTitle' as any) || tr('Vous aimez Plyz ?')}
          </Text>
          <Text style={styles.texte}>
            {t('reviewPromptBody' as any)
              || tr('Votre avis aide les autres fans à nous découvrir — et les personnalités à nous faire confiance. Cela prend dix secondes.')}
          </Text>

          <TouchableOpacity
            style={styles.bouton}
            activeOpacity={0.85}
            onPress={async () => { setVisible(false); await ouvrirAvis(); }}
          >
            <Star size={17} color="#052e1f" fill="#052e1f" />
            <Text style={styles.boutonTexte}>
              {t('reviewPromptCta' as any) || tr('Donner mon avis')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={plusTard} activeOpacity={0.7}>
            <Text style={styles.plusTard}>
              {t('reviewPromptLater' as any) || tr('Plus tard')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fond: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  carte: {
    width: '100%', maxWidth: 400, borderRadius: 22, padding: 24,
    backgroundColor: '#111827', borderWidth: 1, borderColor: 'rgba(251,191,36,0.3)',
    alignItems: 'center',
  },
  fermer: { position: 'absolute', top: 12, right: 12, padding: 4, zIndex: 2 },
  etoiles: { flexDirection: 'row', gap: 4, marginBottom: 14 },
  titre: {
    color: '#ffffff', fontSize: 20, fontWeight: '800',
    textAlign: 'center', marginBottom: 8,
  },
  texte: {
    color: 'rgba(255,255,255,0.72)', fontSize: 14, lineHeight: 20,
    textAlign: 'center', marginBottom: 20,
  },
  bouton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9,
    backgroundColor: '#fbbf24', borderRadius: 14, paddingVertical: 15,
    alignSelf: 'stretch',
  },
  boutonTexte: { color: '#052e1f', fontSize: 16, fontWeight: '800' },
  plusTard: {
    color: 'rgba(255,255,255,0.45)', fontSize: 14, fontWeight: '600',
    textAlign: 'center', marginTop: 14,
  },
});
