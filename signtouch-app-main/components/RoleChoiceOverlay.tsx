import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  Image,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Star, Heart, Check, ChevronLeft, ShieldCheck, CreditCard } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useAutoTranslate } from '@/utils/translation';

// Rôle déclaré au tout premier lancement : 'fan' | 'celebrity'.
// Ce n'est PAS un droit — il oriente l'app. Devenir vraiment personnalité passe
// toujours par la demande de vérification (celebrity-onboarding).
export const ROLE_CHOICE_KEY = '@plyz_role_choice';

/**
 * Écran d'accueil du tout premier lancement : fan ou personnalité ?
 *
 * Pourquoi : une personnalité qui installait Plyz arrivait sur le fil d'actualité
 * d'un fan. Rien ne lui disait qu'un espace personnalité existait — il fallait
 * deviner qu'il se cachait derrière l'avatar du compte. Elle ne pouvait donc
 * littéralement rien faire, et repartait.
 *
 * Aucun compte n'est demandé ici (l'app reste explorable sans inscription) :
 * seule la voie personnalité enchaîne sur la création de l'espace.
 */
export default function RoleChoiceOverlay() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState<'choice' | 'celebrity'>('choice');

  const tr = useAutoTranslate([
    'Bienvenue sur Plyz',
    'Pour vous proposer le bon écran, dites-nous qui vous êtes.',
    'Je suis un fan',
    'Rejoindre des événements, obtenir des dédicaces et des appels vidéo avec vos personnalités préférées.',
    'Je suis une personnalité',
    'Créer vos événements, dédicacer en direct, être payé pour vos prestations.',
    'Création de compte gratuite',
    'Vous pourrez changer à tout moment depuis votre compte.',
    'Espace personnalité',
    'Création de compte gratuite, en quelques secondes. Voici ce qu\'il faut savoir :',
    'Être une personnalité publique reconnue : compte certifié, page Wikipédia, plus de 100 000 abonnés ou des articles de presse à votre sujet.',
    'Pouvoir justifier votre identité et disposer d\'un lien officiel (site, réseau social).',
    'Être majeur et proposer un contenu légal.',
    'Aucune coordonnée bancaire maintenant : le compte de paiement ne vous sera demandé qu\'au moment de créer un événement payant ou de vendre une prestation.',
    'Créer mon espace personnalité',
    'Finalement, je suis un fan',
    'Retour',
  ]);

  useEffect(() => {
    (async () => {
      // Retour de paiement (web) : l'app se recharge sur /payment-success. On ne
      // s'interpose surtout pas entre le fan et sa confirmation de paiement.
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location) {
        const loc = (window.location.pathname + window.location.search).toLowerCase();
        if (/payment-success|purchase-session|paymentauthorized|checkout_session_id|evenement|post/.test(loc)) {
          return;
        }
      }
      try {
        const choice = await AsyncStorage.getItem(ROLE_CHOICE_KEY);
        if (!choice) setVisible(true);
      } catch {
        // Stockage indisponible : on n'affiche rien plutôt que de bloquer l'app.
      }
    })();
  }, []);

  const tap = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const chooseFan = async () => {
    tap();
    try { await AsyncStorage.setItem(ROLE_CHOICE_KEY, 'fan'); } catch {}
    setVisible(false);
  };

  const chooseCelebrity = () => {
    tap();
    setStep('celebrity');
  };

  const startCelebrity = async () => {
    tap();
    try { await AsyncStorage.setItem(ROLE_CHOICE_KEY, 'celebrity'); } catch {}
    setVisible(false);
    // L'inscription détaille les 5 critères, demande le profil public et propose
    // le compte de paiement — avec « Je le ferai plus tard ».
    router.push('/celebrity-onboarding' as any);
  };

  if (!visible) return null;

  return (
    <Modal visible animationType="fade" transparent={false} statusBarTranslucent>
      <View style={styles.container}>
        <LinearGradient colors={['#0f172a', '#1e293b', '#0f172a']} style={StyleSheet.absoluteFill} />
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingTop: insets.top + 28, paddingBottom: insets.bottom + 28 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <Image
            source={require('../assets/images/icon.png')}
            style={styles.logo}
            resizeMode="contain"
          />

          {step === 'choice' ? (
            <>
              <Text style={styles.title}>{tr('Bienvenue sur Plyz')}</Text>
              <Text style={styles.subtitle}>
                {tr('Pour vous proposer le bon écran, dites-nous qui vous êtes.')}
              </Text>

              <TouchableOpacity style={[styles.card, styles.cardFan]} onPress={chooseFan} activeOpacity={0.85}>
                <View style={[styles.cardIcon, { backgroundColor: 'rgba(16,185,129,0.16)' }]}>
                  <Heart size={28} color="#10b981" strokeWidth={1.9} />
                </View>
                <Text style={[styles.cardTitle, { color: '#10b981' }]}>{tr('Je suis un fan')}</Text>
                <Text style={styles.cardText}>
                  {tr('Rejoindre des événements, obtenir des dédicaces et des appels vidéo avec vos personnalités préférées.')}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.card, styles.cardCeleb]} onPress={chooseCelebrity} activeOpacity={0.85}>
                <View style={[styles.cardIcon, { backgroundColor: 'rgba(245,158,11,0.16)' }]}>
                  <Star size={28} color="#f59e0b" strokeWidth={1.9} />
                </View>
                <Text style={[styles.cardTitle, { color: '#f59e0b' }]}>{tr('Je suis une personnalité')}</Text>
                <Text style={styles.cardText}>
                  {tr('Créer vos événements, dédicacer en direct, être payé pour vos prestations.')}
                </Text>
                {/* La gratuité se dit AVANT le clic : c'est la première question
                    que se pose quelqu'un à qui l'on propose de « créer un espace ». */}
                <View style={styles.badgeGratuit}>
                  <Text style={styles.badgeGratuitTexte}>{tr('Création de compte gratuite')}</Text>
                </View>
              </TouchableOpacity>

              <Text style={styles.note}>
                {tr('Vous pourrez changer à tout moment depuis votre compte.')}
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.title}>{tr('Espace personnalité')}</Text>
              <Text style={styles.subtitle}>
                {tr('Création de compte gratuite, en quelques secondes. Voici ce qu\'il faut savoir :')}
              </Text>

              <View style={styles.critereBloc}>
                {[
                  'Être une personnalité publique reconnue : compte certifié, page Wikipédia, plus de 100 000 abonnés ou des articles de presse à votre sujet.',
                  'Pouvoir justifier votre identité et disposer d\'un lien officiel (site, réseau social).',
                  'Être majeur et proposer un contenu légal.',
                ].map((texte) => (
                  <View key={texte} style={styles.critereLigne}>
                    <Check size={16} color="#f59e0b" strokeWidth={2.6} />
                    <Text style={styles.critereTexte}>{tr(texte)}</Text>
                  </View>
                ))}
              </View>

              {/* Dit AVANT de commencer : la demande d'un compte de paiement au
                  mauvais moment fait abandonner une inscription. */}
              <View style={styles.paiementBloc}>
                <CreditCard size={18} color="#93c5fd" strokeWidth={2} />
                <Text style={styles.paiementTexte}>
                  {tr('Aucune coordonnée bancaire maintenant : le compte de paiement ne vous sera demandé qu\'au moment de créer un événement payant ou de vendre une prestation.')}
                </Text>
              </View>

              <TouchableOpacity style={styles.btnPrimaire} onPress={startCelebrity} activeOpacity={0.85}>
                <ShieldCheck size={18} color="#fff" strokeWidth={2.3} />
                <Text style={styles.btnPrimaireTexte}>{tr('Créer mon espace personnalité')}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.btnSecondaire} onPress={chooseFan} activeOpacity={0.8}>
                <Text style={styles.btnSecondaireTexte}>{tr('Finalement, je suis un fan')}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.retour} onPress={() => setStep('choice')} activeOpacity={0.8}>
                <ChevronLeft size={16} color="rgba(255,255,255,0.6)" />
                <Text style={styles.retourTexte}>{tr('Retour')}</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  content: { paddingHorizontal: 22, alignItems: 'center' },
  logo: { width: 72, height: 72, borderRadius: 18, marginBottom: 18 },
  title: { color: '#fff', fontSize: 26, fontWeight: '800', textAlign: 'center' },
  subtitle: {
    color: 'rgba(255,255,255,0.65)', fontSize: 15, textAlign: 'center',
    marginTop: 10, marginBottom: 26, lineHeight: 21,
  },
  card: {
    width: '100%', borderRadius: 20, borderWidth: 1, padding: 20,
    alignItems: 'center', marginBottom: 14,
  },
  cardFan: { borderColor: 'rgba(16,185,129,0.35)', backgroundColor: 'rgba(16,185,129,0.10)' },
  cardCeleb: { borderColor: 'rgba(245,158,11,0.35)', backgroundColor: 'rgba(245,158,11,0.10)' },
  cardIcon: {
    width: 58, height: 58, borderRadius: 29,
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  cardTitle: { fontSize: 18, fontWeight: '800', marginBottom: 6 },
  cardText: { color: 'rgba(255,255,255,0.7)', fontSize: 14, textAlign: 'center', lineHeight: 20 },
  badgeGratuit: {
    marginTop: 12, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999,
    backgroundColor: 'rgba(245,158,11,0.18)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.4)',
  },
  badgeGratuitTexte: { color: '#fcd34d', fontSize: 12, fontWeight: '800' },
  note: { color: 'rgba(255,255,255,0.45)', fontSize: 13, textAlign: 'center', marginTop: 8 },
  critereBloc: { width: '100%', gap: 12, marginBottom: 18 },
  critereLigne: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  critereTexte: { color: 'rgba(255,255,255,0.8)', fontSize: 14, lineHeight: 20, flex: 1 },
  paiementBloc: {
    width: '100%', flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: 'rgba(59,130,246,0.10)', borderColor: 'rgba(59,130,246,0.30)',
    borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 22,
  },
  paiementTexte: { color: '#bfdbfe', fontSize: 13, lineHeight: 19, flex: 1 },
  btnPrimaire: {
    width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: '#f59e0b', borderRadius: 14, paddingVertical: 15,
  },
  btnPrimaireTexte: { color: '#fff', fontSize: 16, fontWeight: '800' },
  btnSecondaire: { paddingVertical: 14 },
  btnSecondaireTexte: { color: 'rgba(255,255,255,0.75)', fontSize: 14, fontWeight: '600' },
  retour: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6 },
  retourTexte: { color: 'rgba(255,255,255,0.6)', fontSize: 14 },
});
