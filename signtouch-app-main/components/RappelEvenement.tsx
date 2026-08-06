import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Video, MapPin, X, TrendingUp } from 'lucide-react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAutoTranslate } from '@/utils/translation';

// APRÈS UNE PUBLICATION, QUAND RIEN N'EST À VENDRE
//
// Une personnalité peut publier pendant des semaines sans qu'aucun fan ne
// puisse rien lui réserver — et rien, dans l'app, ne le lui dit. Ce n'est pas
// un avertissement : c'est une occasion manquée qu'on lui montre, avec le
// bouton pour la saisir. Un message sans chemin d'action ne fait agir personne.
//
// Le rappel dit AUSSI ce que peu de gens savent : la dédicace se reçoit en
// personne (le fan doit être sur place le jour J), alors que le live vidéo
// fonctionne où que l'on soit. Une personnalité en tournée, ou loin de ses
// fans, doit savoir qu'il lui reste le live.

interface Props {
  visible: boolean;
  vues30j?: number;
  /** Vrai quand la publication a été REFUSÉE faute de quota vidéo. */
  quotaAtteint?: boolean;
  onClose: () => void;
}

export default function RappelEvenement({ visible, vues30j, quotaAtteint, onClose }: Props) {
  const router = useRouter();
  const { t } = useLanguage();
  const tr = useAutoTranslate([
    'Tes fans t’ont vue. Ils ne peuvent rien réserver.',
    '{{n}} fans ont vu tes publications ces 30 derniers jours.',
    'Tu n’as aucun événement en cours : personne ne peut réserver quoi que ce soit.',
    'Live vidéo — où que tu sois',
    'Tes fans te rejoignent depuis chez eux, partout dans le monde. Aucun déplacement.',
    'Dédicace — sur place uniquement',
    'Elle se reçoit en personne : tes fans doivent se trouver au même endroit que toi le jour J.',
    'Créer un événement',
    'Plus tard',
    "Ou fixe ton tarif d'appel vidéo privé",
    'Tu gardes 85 % de chaque prestation.',
    'Cette vidéo n’a pas été publiée',
    'Pourquoi cette limite',
    'Plyz est gratuit, pour toi comme pour tes fans : aucun abonnement, aucune publicité. L’application ne vit que des 15 % prélevés sur les prestations vendues — c’est ce qui paie l’hébergement de tes vidéos, les appels en direct et la sécurité des paiements.',
    'Publier des photos ne coûte presque rien, et restera toujours illimité. La vidéo, elle, est de loin le plus lourd à diffuser. Elle reste ouverte tant que tu fais vivre la communauté avec des événements — c’est ce qui fait tourner Plyz, et ce qui te rémunère.',
    'Tu as publié dix vidéos ce mois-ci sans proposer un seul événement. Crée-en un et tes vidéos repartent aussitôt — les photos, elles, restent illimitées.',
  ]);

  if (!visible) return null;

  const creer = () => {
    onClose();
    router.push('/fan-choice' as any);
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.fond}>
        <ScrollView
          style={styles.carteScroll}
          contentContainerStyle={styles.carte}
          showsVerticalScrollIndicator={false}
        >
          <TouchableOpacity style={styles.fermer} onPress={onClose} hitSlop={12}>
            <X size={20} color="rgba(255,255,255,0.4)" />
          </TouchableOpacity>

          <View style={styles.icone}>
            <TrendingUp size={28} color="#fbbf24" strokeWidth={2.2} />
          </View>

          <Text style={styles.titre}>
            {quotaAtteint
              ? tr('Cette vidéo n’a pas été publiée')
              : (t('reachPromptTitle' as any) || tr('Tes fans t’ont vue. Ils ne peuvent rien réserver.'))}
          </Text>

          {!!vues30j && vues30j > 0 && !quotaAtteint && (
            <Text style={styles.chiffre}>
              {tr('{{n}} fans ont vu tes publications ces 30 derniers jours.')
                .replace('{{n}}', String(vues30j))}
            </Text>
          )}
          <Text style={styles.texte}>
            {quotaAtteint
              ? tr('Tu as publié dix vidéos ce mois-ci sans proposer un seul événement. Crée-en un et tes vidéos repartent aussitôt — les photos, elles, restent illimitées.')
              : (t('reachPromptBody' as any)
                || tr('Tu n’as aucun événement en cours : personne ne peut réserver quoi que ce soit.'))}
          </Text>

          {/* Un blocage sans explication passe pour une brimade. On dit donc
              d'où vient la règle : Plyz est gratuit, ne vit que des prestations
              vendues, et la vidéo est le seul contenu dont la diffusion coûte
              vraiment. Personne ne respecte une limite qu'il ne comprend pas. */}
          {quotaAtteint && (
            <View style={styles.explication}>
              <Text style={styles.explicationTitre}>{tr('Pourquoi cette limite')}</Text>
              <Text style={styles.explicationTexte}>
                {tr('Plyz est gratuit, pour toi comme pour tes fans : aucun abonnement, aucune publicité. L’application ne vit que des 15 % prélevés sur les prestations vendues — c’est ce qui paie l’hébergement de tes vidéos, les appels en direct et la sécurité des paiements.')}
              </Text>
              <Text style={styles.explicationTexte}>
                {tr('Publier des photos ne coûte presque rien, et restera toujours illimité. La vidéo, elle, est de loin le plus lourd à diffuser. Elle reste ouverte tant que tu fais vivre la communauté avec des événements — c’est ce qui fait tourner Plyz, et ce qui te rémunère.')}
              </Text>
            </View>
          )}

          <View style={styles.option}>
            <View style={[styles.optionIcone, { backgroundColor: 'rgba(99,102,241,0.15)' }]}>
              <Video size={17} color="#818cf8" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.optionTitre}>{tr('Live vidéo — où que tu sois')}</Text>
              <Text style={styles.optionTexte}>
                {tr('Tes fans te rejoignent depuis chez eux, partout dans le monde. Aucun déplacement.')}
              </Text>
            </View>
          </View>

          <View style={styles.option}>
            <View style={[styles.optionIcone, { backgroundColor: 'rgba(245,158,11,0.15)' }]}>
              <MapPin size={17} color="#fbbf24" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.optionTitre}>{tr('Dédicace — sur place uniquement')}</Text>
              <Text style={styles.optionTexte}>
                {tr('Elle se reçoit en personne : tes fans doivent se trouver au même endroit que toi le jour J.')}
              </Text>
            </View>
          </View>

          <Text style={styles.part}>{tr('Tu gardes 85 % de chaque prestation.')}</Text>

          <TouchableOpacity style={styles.bouton} onPress={creer} activeOpacity={0.85}>
            <Text style={styles.boutonTexte}>{tr('Créer un événement')}</Text>
          </TouchableOpacity>

          {/* Deuxieme chemin : tout le monde ne veut pas organiser un
              evenement. Le tete-a-tete se vend sans date ni lieu — il suffit
              d'un tarif. Un seul bouton fermerait la porte a qui ne peut pas
              programmer. */}
          <TouchableOpacity
            onPress={() => { onClose(); router.push('/account' as any); }}
            activeOpacity={0.7}
          >
            <Text style={styles.autreAction}>{tr("Ou fixe ton tarif d'appel vidéo privé")}</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
            <Text style={styles.plusTard}>{tr('Plus tard')}</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fond: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.78)',
    alignItems: 'center', justifyContent: 'center', padding: 22,
  },
  carteScroll: { width: '100%', maxWidth: 420, maxHeight: '88%', flexGrow: 0 },
  carte: {
    borderRadius: 22, padding: 24,
    backgroundColor: '#111827', borderWidth: 1, borderColor: 'rgba(251,191,36,0.3)',
  },
  fermer: { position: 'absolute', top: 12, right: 12, padding: 4, zIndex: 2 },
  icone: {
    alignSelf: 'center', width: 56, height: 56, borderRadius: 28,
    backgroundColor: 'rgba(251,191,36,0.14)', borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.4)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
  },
  titre: {
    color: '#ffffff', fontSize: 19, fontWeight: '800',
    textAlign: 'center', marginBottom: 10, lineHeight: 25,
  },
  chiffre: {
    color: '#fbbf24', fontSize: 15, fontWeight: '800',
    textAlign: 'center', marginBottom: 6,
  },
  texte: {
    color: 'rgba(255,255,255,0.7)', fontSize: 14, lineHeight: 20,
    textAlign: 'center', marginBottom: 18,
  },
  explication: {
    backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12,
    padding: 14, marginBottom: 18, gap: 8,
  },
  explicationTitre: { color: '#ffffff', fontSize: 13.5, fontWeight: '800' },
  explicationTexte: { color: 'rgba(255,255,255,0.62)', fontSize: 12.5, lineHeight: 18 },
  option: { flexDirection: 'row', gap: 11, alignItems: 'flex-start', marginBottom: 14 },
  optionIcone: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
  },
  optionTitre: { color: '#ffffff', fontSize: 14.5, fontWeight: '700', marginBottom: 3 },
  optionTexte: { color: 'rgba(255,255,255,0.62)', fontSize: 13, lineHeight: 18 },
  part: {
    color: '#a7f3d0', fontSize: 13, fontWeight: '700',
    textAlign: 'center', marginTop: 4, marginBottom: 16,
  },
  bouton: {
    backgroundColor: '#fbbf24', borderRadius: 14, paddingVertical: 15,
    alignItems: 'center',
  },
  boutonTexte: { color: '#052e1f', fontSize: 16, fontWeight: '800' },
  autreAction: {
    color: '#a5b4fc', fontSize: 13.5, fontWeight: '700',
    textAlign: 'center', marginTop: 14,
  },
  plusTard: {
    color: 'rgba(255,255,255,0.45)', fontSize: 14, fontWeight: '600',
    textAlign: 'center', marginTop: 14,
  },
});
