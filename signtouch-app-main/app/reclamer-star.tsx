import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList,
  ActivityIndicator, Platform, Share, KeyboardAvoidingView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft, Search, X, Megaphone, Users, Share2, CheckCircle, Sparkles,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { showAlert, showConfirm } from '@/utils/alertHelper';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { useAuthPrompt } from '@/contexts/AuthPromptContext';
import { useAutoTranslate } from '@/utils/translation';
import { authedFetch } from '@/utils/authedFetch';
import BottomNav, { BOTTOM_NAV_HEIGHT } from '@/components/BottomNav';

const API_BASE = process.env.EXPO_PUBLIC_STRIPE_SERVER_URL || '';

interface StarReclamee {
  slug: string;
  nom: string;
  fans: number;
  arrivee?: boolean;
  celebrity_id?: string | null;
}

export default function ReclamerStarScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { user } = useAuth();
  const { requireAuth } = useAuthPrompt();

  const [recherche, setRecherche] = useState('');
  const [resultats, setResultats] = useState<StarReclamee[]>([]);
  const [classement, setClassement] = useState<StarReclamee[]>([]);
  const [miennes, setMiennes] = useState<StarReclamee[]>([]);
  const [chargement, setChargement] = useState(false);
  const [envoiEnCours, setEnvoiEnCours] = useState(false);

  const trUI = useAutoTranslate([
    'Réclame ta star',
    'Elle n’est pas encore sur Plyz ? Dis-le. Plus vous êtes nombreux, plus elle a de raisons de venir.',
    'Nom de la personnalité',
    'Rechercher ou créer une réclamation…',
    'Personne ne réclame encore ce nom.',
    'Être le premier à la réclamer',
    'Je la réclame aussi',
    'Déjà sur Plyz',
    'Les plus réclamées',
    'Mes réclamations',
    'Elle est arrivée !',
    'Voir sa page',
    'Partager',
    'Réclamation enregistrée',
    'Impossible d’enregistrer ta réclamation. Réessaie.',
    'fan la réclame',
    'fans la réclament',
    'Fais-le savoir : plus vous êtes nombreux, plus elle viendra vite.',
    'Ta réclamation est enregistrée. Elle apparaîtra dans le classement public une fois que nous aurons confirmé qu’il s’agit bien d’une personnalité publique — c’est la même vérification que pour l’inscription d’une célébrité, et elle protège la vie privée de chacun.',
    'Seules les personnalités publiques peuvent être réclamées : nous le vérifions automatiquement, comme à l’inscription d’une célébrité.',
  ]);

  const chargerClassement = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/reclamations/classement`);
      const d = await r.json();
      setClassement(Array.isArray(d?.classement) ? d.classement : []);
    } catch { /* le classement n'est pas vital */ }
  }, []);

  const chargerMiennes = useCallback(async () => {
    if (!user) { setMiennes([]); return; }
    try {
      const r = await authedFetch(`${API_BASE}/api/reclamations/miennes`);
      const d = await r.json();
      setMiennes(Array.isArray(d?.miennes) ? d.miennes : []);
    } catch { /* idem */ }
  }, [user]);

  useEffect(() => { chargerClassement(); chargerMiennes(); }, [chargerClassement, chargerMiennes]);

  // Recherche différée : interroger le serveur à chaque lettre ferait dix
  // requêtes pour un seul nom tapé.
  useEffect(() => {
    const q = recherche.trim();
    if (q.length < 2) { setResultats([]); return; }
    setChargement(true);
    const minuteur = setTimeout(async () => {
      try {
        const r = await fetch(`${API_BASE}/api/reclamations/rechercher?q=${encodeURIComponent(q)}`);
        const d = await r.json();
        setResultats(Array.isArray(d?.resultats) ? d.resultats : []);
      } catch {
        setResultats([]);
      } finally {
        setChargement(false);
      }
    }, 400);
    return () => clearTimeout(minuteur);
  }, [recherche]);

  const partager = async (nom: string, fans: number) => {
    try {
      // Le nom de la star est DANS le message : c'est ce qui fait que ses
      // autres fans, et elle-même, tombent dessus sur les réseaux. C'est tout
      // l'intérêt du dispositif — mille fans qui interpellent publiquement une
      // personnalité valent mieux qu'un courriel de prospection.
      await Share.share({
        message:
          `J'ai réclamé ${nom} sur Plyz ! ${fans > 1 ? `Nous sommes déjà ${fans}. ` : ''}`
          + `Rejoins-moi pour qu'${nom} vienne nous faire des dédicaces et des appels vidéo 👉 `
          + `https://plyz.io/reclame/${encodeURIComponent(nom)}`,
      });
    } catch { /* partage annulé */ }
  };

  const reclamer = (nom: string) => {
    // Un compte est exigé : c'est ce qui donne sa valeur au chiffre présenté
    // aux agents. Mille réclamations anonymes ne valent rien, mille comptes
    // que l'on peut prévenir le jour de l'arrivée valent une négociation.
    requireAuth(async () => {
      if (envoiEnCours) return;
      setEnvoiEnCours(true);
      try {
        if (Platform.OS !== 'web') {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }
        const r = await authedFetch(`${API_BASE}/api/reclamer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nom }),
        });
        if (!r.ok) throw new Error('http_' + r.status);
        const d = await r.json();

        if (d.deja_arrivee) {
          router.push(`/celebrity-detail?id=${d.celebrity_id}` as any);
          return;
        }

        const fans = d.fans || 1;
        setRecherche('');
        setResultats([]);
        await Promise.all([chargerClassement(), chargerMiennes()]);

        // Le nom n'a pas été reconnu comme celui d'une personnalité publique :
        // on le DIT, et on dit pourquoi. Laisser le fan chercher son nom en
        // vain dans le classement lui ferait croire à une panne.
        const message = d.notoriete_a_confirmer
          ? trUI('Ta réclamation est enregistrée. Elle apparaîtra dans le classement public une fois que nous aurons confirmé qu’il s’agit bien d’une personnalité publique — c’est la même vérification que pour l’inscription d’une célébrité, et elle protège la vie privée de chacun.')
          : `${fans} ${fans > 1 ? trUI('fans la réclament') : trUI('fan la réclame')}. `
            + trUI('Fais-le savoir : plus vous êtes nombreux, plus elle viendra vite.');

        showConfirm(
          trUI('Réclamation enregistrée'),
          message,
          [
            { text: t('close') || 'Fermer', style: 'cancel' },
            { text: trUI('Partager'), onPress: () => partager(nom, fans) },
          ],
        );
      } catch {
        showAlert(t('error') || 'Erreur', trUI('Impossible d’enregistrer ta réclamation. Réessaie.'));
      } finally {
        setEnvoiEnCours(false);
      }
    });
  };

  const nomSaisi = recherche.trim();
  // Aucun résultat ne porte exactement ce nom : on propose de l'ouvrir.
  const aucunExact = nomSaisi.length >= 2
    && !resultats.some((r) => r.nom.toLowerCase() === nomSaisi.toLowerCase());

  const ligne = (item: StarReclamee, montrerBouton = true) => (
    <View style={styles.ligne}>
      <View style={styles.pastille}>
        <Text style={styles.pastilleTxt}>{item.fans}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.nom} numberOfLines={1}>{item.nom}</Text>
        <Text style={styles.sous}>
          {item.arrivee
            ? trUI('Elle est arrivée !')
            : `${item.fans} ${item.fans > 1 ? trUI('fans la réclament') : trUI('fan la réclame')}`}
        </Text>
      </View>
      {item.arrivee ? (
        <TouchableOpacity
          style={styles.btnArrivee}
          onPress={() => item.celebrity_id && router.push(`/celebrity-detail?id=${item.celebrity_id}` as any)}
        >
          <CheckCircle size={15} color="#052e1f" />
          <Text style={styles.btnArriveeTxt}>{trUI('Voir sa page')}</Text>
        </TouchableOpacity>
      ) : montrerBouton ? (
        <TouchableOpacity style={styles.btnReclamer} onPress={() => reclamer(item.nom)}>
          <Megaphone size={15} color="#052e1f" />
          <Text style={styles.btnReclamerTxt}>{trUI('Je la réclame aussi')}</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity onPress={() => partager(item.nom, item.fans)} hitSlop={10}>
          <Share2 size={18} color="#9ca3af" />
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0f172a', '#1e293b', '#0f172a']} style={StyleSheet.absoluteFill} />

      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity style={styles.retour} onPress={() => router.back()}>
          <ArrowLeft size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.titre}>{trUI('Réclame ta star')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <FlatList
          data={nomSaisi.length >= 2 ? resultats : classement}
          keyExtractor={(item) => item.slug || item.nom}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: BOTTOM_NAV_HEIGHT + 24 }}
          ListHeaderComponent={
            <View>
              <View style={styles.accroche}>
                <Sparkles size={18} color="#f59e0b" />
                <Text style={styles.accrocheTxt}>
                  {trUI('Elle n’est pas encore sur Plyz ? Dis-le. Plus vous êtes nombreux, plus elle a de raisons de venir.')}
                </Text>
              </View>

              <View style={styles.rechercheBoite}>
                <Search size={18} color="#6b7280" />
                <TextInput
                  style={styles.rechercheChamp}
                  value={recherche}
                  onChangeText={setRecherche}
                  placeholder={trUI('Rechercher ou créer une réclamation…')}
                  placeholderTextColor="#6b7280"
                  autoCorrect={false}
                />
                {chargement ? <ActivityIndicator size="small" color="#10b981" /> : null}
                {!!recherche && !chargement && (
                  <TouchableOpacity onPress={() => setRecherche('')} hitSlop={8}>
                    <X size={17} color="#6b7280" />
                  </TouchableOpacity>
                )}
              </View>

              {/* La règle est dite AVANT de taper, pas après le refus : c'est
                  la différence entre une règle comprise et une règle subie. */}
              <Text style={styles.regle}>
                {trUI('Seules les personnalités publiques peuvent être réclamées : nous le vérifions automatiquement, comme à l’inscription d’une célébrité.')}
              </Text>

              {/* Ouvrir une réclamation pour un nom que personne n'a encore
                  cité. Le bouton n'apparaît qu'ici, jamais dans le vide : on
                  crée en cherchant, pas en remplissant un formulaire de plus. */}
              {aucunExact && !chargement && (
                <TouchableOpacity
                  style={styles.creer}
                  onPress={() => reclamer(nomSaisi)}
                  disabled={envoiEnCours}
                >
                  <Megaphone size={18} color="#052e1f" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.creerTxt}>{trUI('Être le premier à la réclamer')}</Text>
                    <Text style={styles.creerNom} numberOfLines={1}>{nomSaisi}</Text>
                  </View>
                </TouchableOpacity>
              )}

              {miennes.length > 0 && nomSaisi.length < 2 && (
                <View style={styles.bloc}>
                  <Text style={styles.blocTitre}>{trUI('Mes réclamations')}</Text>
                  {miennes.map((m) => (
                    <View key={m.slug}>{ligne(m, false)}</View>
                  ))}
                </View>
              )}

              {nomSaisi.length < 2 && classement.length > 0 && (
                <View style={styles.blocTitreSeul}>
                  <Users size={16} color="#9ca3af" />
                  <Text style={styles.blocTitre}>{trUI('Les plus réclamées')}</Text>
                </View>
              )}
            </View>
          }
          renderItem={({ item }) => ligne(item)}
          ListEmptyComponent={
            nomSaisi.length >= 2 && !chargement && !aucunExact ? (
              <Text style={styles.vide}>{trUI('Personne ne réclame encore ce nom.')}</Text>
            ) : null
          }
        />
      </KeyboardAvoidingView>

      <BottomNav />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a1628' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12,
  },
  retour: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  titre: { color: '#fff', fontSize: 17, fontWeight: '800' },

  accroche: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    marginHorizontal: 16, marginBottom: 14, padding: 13,
    borderRadius: 14,
    backgroundColor: 'rgba(245,158,11,0.10)',
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.30)',
  },
  accrocheTxt: { flex: 1, color: '#fcd34d', fontSize: 13.5, lineHeight: 19 },

  rechercheBoite: {
    flexDirection: 'row', alignItems: 'center', gap: 9,
    marginHorizontal: 16, marginBottom: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12, paddingHorizontal: 13, paddingVertical: 10,
  },
  rechercheChamp: { flex: 1, color: '#fff', fontSize: 14.5, padding: 0 },
  regle: {
    color: '#6b7280', fontSize: 12, lineHeight: 17,
    marginHorizontal: 16, marginBottom: 14,
  },

  creer: {
    flexDirection: 'row', alignItems: 'center', gap: 11,
    marginHorizontal: 16, marginBottom: 16,
    paddingVertical: 13, paddingHorizontal: 14,
    borderRadius: 14, backgroundColor: '#10b981',
  },
  creerTxt: { color: '#052e1f', fontSize: 13, fontWeight: '700' },
  creerNom: { color: '#052e1f', fontSize: 15.5, fontWeight: '800', marginTop: 1 },

  bloc: { marginBottom: 8 },
  blocTitreSeul: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginTop: 6, marginBottom: 6,
  },
  blocTitre: {
    color: '#9ca3af', fontSize: 12.5, fontWeight: '800',
    textTransform: 'uppercase', letterSpacing: 0.6,
    marginHorizontal: 16, marginTop: 6, marginBottom: 6,
  },

  ligne: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginHorizontal: 16, marginBottom: 8,
    padding: 11, borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  // Le nombre est mis en avant : c'est l'argument. « Vous êtes 342 » pousse à
  // partager, « réclamée » ne dit rien.
  pastille: {
    minWidth: 42, height: 42, borderRadius: 21, paddingHorizontal: 6,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(16,185,129,0.16)',
    borderWidth: 1, borderColor: 'rgba(16,185,129,0.4)',
  },
  pastilleTxt: { color: '#10b981', fontSize: 15, fontWeight: '900' },
  nom: { color: '#fff', fontSize: 15, fontWeight: '700' },
  sous: { color: '#9ca3af', fontSize: 12.5, marginTop: 2 },

  btnReclamer: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 8, paddingHorizontal: 11,
    borderRadius: 10, backgroundColor: '#10b981',
  },
  btnReclamerTxt: { color: '#052e1f', fontSize: 12, fontWeight: '800' },
  btnArrivee: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 8, paddingHorizontal: 11,
    borderRadius: 10, backgroundColor: '#fcd34d',
  },
  btnArriveeTxt: { color: '#052e1f', fontSize: 12, fontWeight: '800' },

  vide: { color: '#6b7280', fontSize: 14, textAlign: 'center', marginTop: 24 },
});
