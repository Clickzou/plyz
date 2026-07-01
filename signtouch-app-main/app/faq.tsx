import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, ChevronDown, ChevronUp, HelpCircle } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useTranslation } from '@/contexts/LanguageContext';
import { useAutoTranslate } from '@/utils/translation';

interface FaqItem {
  q: string;
  a: string;
}
interface FaqSection {
  title: string;
  items: FaqItem[];
}

// Contenu FAQ (français). Pourra être traduit ultérieurement.
const FAQ_SECTIONS: FaqSection[] = [
  {
    title: 'Découvrir Plyz',
    items: [
      {
        q: "Qu'est-ce que Plyz ?",
        a: "Plyz est l'application qui rapproche les célébrités, créateurs et clubs de leurs fans. Les fans peuvent obtenir des photos dédicacées en direct lors d'événements, participer à des sessions vidéo privées, et conserver leurs souvenirs dans leur galerie.",
      },
      {
        q: 'Plyz est-elle gratuite ?',
        a: "L'application est gratuite à télécharger et à utiliser. Certaines prestations proposées par les célébrités (événements ou sessions payantes) peuvent être facturées : le prix est toujours affiché avant tout paiement.",
      },
      {
        q: 'Où sont enregistrées mes photos ?',
        a: "Vos créations et dédicaces sont rangées dans l'onglet « Ma Galerie ». Vous pouvez aussi les enregistrer dans la galerie de votre téléphone ou les partager.",
      },
    ],
  },
  {
    title: 'Événements & dédicaces',
    items: [
      {
        q: 'Comment rejoindre un événement ?',
        a: "Depuis l'onglet « Événements », appuyez sur « Rejoindre », puis saisissez le code de l'événement ou scannez le QR code fourni par la célébrité. Vous recevrez alors les photos dédicacées en temps réel.",
      },
      {
        q: 'Qui peut créer un événement ou une session vidéo ?',
        a: "La création est réservée aux comptes vérifiés : célébrités, créateurs et clubs/organisations. Si votre compte n'est pas encore vérifié, une fenêtre vous proposera de lancer la demande de vérification.",
      },
      {
        q: 'Comment se faire vérifier ?',
        a: "Dans « Mon compte », lancez la vérification correspondant à votre profil (célébrité, créateur ou club). Après validation, vous pourrez créer vos événements et sessions vidéo.",
      },
      {
        q: "Quelle différence entre un événement et une session vidéo ?",
        a: "Un événement (QR code) permet d'envoyer des photos dédicacées à plusieurs fans présents. Une session vidéo est un appel privé en tête-à-tête entre la célébrité et un fan.",
      },
    ],
  },
  {
    title: 'Paiements',
    items: [
      {
        q: 'Comment fonctionnent les paiements ?',
        a: "Les paiements sont sécurisés par Stripe. Lorsqu'un fan paie une prestation, la somme est répartie automatiquement entre la célébrité et Plyz.",
      },
      {
        q: 'Quand suis-je payé en tant que célébrité ?',
        a: "Vos revenus sont reversés sur votre compte Stripe connecté. Vous pouvez suivre vos gains estimés directement depuis votre espace.",
      },
      {
        q: 'Le paiement est-il sécurisé ?',
        a: "Oui. Plyz ne stocke jamais vos données bancaires : tout est géré par Stripe, un prestataire de paiement reconnu.",
      },
    ],
  },
  {
    title: 'Mon compte',
    items: [
      {
        q: 'Comment me connecter ?',
        a: "La connexion se fait par e-mail avec un code à usage unique. Saisissez votre adresse, puis le code reçu par e-mail.",
      },
      {
        q: 'Comment supprimer une photo de ma galerie ?',
        a: "Ouvrez la photo dans « Ma Galerie », puis appuyez sur l'icône de suppression.",
      },
    ],
  },
];

export default function FaqScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [open, setOpen] = useState<string | null>(null);

  // Traduction automatique de la FAQ (contenu FR) dans la langue de l'utilisateur
  const trFaq = useAutoTranslate(
    FAQ_SECTIONS.flatMap((s) => [s.title, ...s.items.flatMap((i) => [i.q, i.a])])
  );

  const toggle = (key: string) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setOpen((prev) => (prev === key ? null : key));
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0f172a', '#1e293b', '#0f172a']} style={StyleSheet.absoluteFill} />

      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
          <ArrowLeft size={24} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('faqTitle' as any) || 'FAQ'}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.intro}>
          <HelpCircle size={28} color="#10b981" />
          <Text style={styles.introText}>
            {t('faqIntro' as any) || 'Retrouvez ici les réponses aux questions les plus fréquentes sur Plyz.'}
          </Text>
        </View>

        {FAQ_SECTIONS.map((section, si) => (
          <View key={`sec-${si}`} style={styles.section}>
            <Text style={styles.sectionTitle}>{trFaq(section.title)}</Text>
            {section.items.map((item, ii) => {
              const key = `${si}-${ii}`;
              const isOpen = open === key;
              return (
                <View key={key} style={styles.card}>
                  <TouchableOpacity
                    style={styles.cardHeader}
                    onPress={() => toggle(key)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.question}>{trFaq(item.q)}</Text>
                    {isOpen ? (
                      <ChevronUp size={20} color="#10b981" />
                    ) : (
                      <ChevronDown size={20} color="#94a3b8" />
                    )}
                  </TouchableOpacity>
                  {isOpen && <Text style={styles.answer}>{trFaq(item.a)}</Text>}
                </View>
              );
            })}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#ffffff' },
  content: { paddingHorizontal: 16, paddingTop: 8 },
  intro: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(16,185,129,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.25)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
  },
  introText: { flex: 1, color: 'rgba(255,255,255,0.8)', fontSize: 14, lineHeight: 20 },
  section: { marginBottom: 22 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#10b981',
    marginBottom: 10,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    marginBottom: 10,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    gap: 12,
  },
  question: { flex: 1, color: '#ffffff', fontSize: 15, fontWeight: '600' },
  answer: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    lineHeight: 21,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
});
