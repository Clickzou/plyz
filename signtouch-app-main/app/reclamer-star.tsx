import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList,
  ActivityIndicator, Platform, Share, KeyboardAvoidingView, Modal, ScrollView,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft, Search, X, Megaphone, Users, Share2, CheckCircle, Sparkles,
  PenLine, Video, CalendarDays, MessageCircle, Globe, Send, Clock,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import {
  destinations, memoriserReseau, messageInterpellation, reseauPrefere,
  trierParPreference, type Destination, type ReseauxStar,
} from '@/utils/interpeller';
import { showAlert, showConfirm } from '@/utils/alertHelper';
import { getDateLocale } from '@/utils/dateLocale';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { useAuthPrompt } from '@/contexts/AuthPromptContext';
import { useAutoTranslate } from '@/utils/translation';
import { authedFetch } from '@/utils/authedFetch';
import BottomNav, { BOTTOM_NAV_HEIGHT } from '@/components/BottomNav';

const API_BASE = process.env.EXPO_PUBLIC_STRIPE_SERVER_URL || '';

/**
 * Ce que le fan veut, et ce qu'il y mettrait.
 *
 * Ces deux champs existent en base depuis le premier jour et personne ne les
 * remplissait : l'app envoyait le nom, rien d'autre. Ce sont pourtant eux qui
 * font la différence entre un compteur de likes et un dossier commercial.
 */
const ENVIES = [
  { cle: 'dedicace' as const, titre: 'Une dédicace', Icone: PenLine },
  { cle: 'appel' as const, titre: 'Un appel vidéo', Icone: Video },
  { cle: 'evenement' as const, titre: 'Un événement', Icone: CalendarDays },
];

// Des montants ronds plutôt qu'un champ libre : on obtient une réponse en un
// toucher, là où un clavier ferait abandonner la moitié des fans. « Je ne sais
// pas » compte aussi — un fan qui veut sans savoir combien reste un fan.
const BUDGETS = [
  { cents: null as number | null, libelle: 'Je ne sais pas' },
  { cents: 500, libelle: '5 €' },
  { cents: 1000, libelle: '10 €' },
  { cents: 2000, libelle: '20 €' },
  { cents: 5000, libelle: '50 €' },
];

interface StarReclamee {
  slug: string;
  nom: string;
  fans: number;
  metier?: string | null;
  pays?: string | null;
  arrivee?: boolean;
  celebrity_id?: string | null;
  /** Ses comptes officiels connus, pour aller l'interpeller chez elle. */
  reseaux?: ReseauxStar | null;
}

/** L'icône d'une destination. Aucune icône de marque : lucide les retire au
 *  fil des versions, et un écran qui plante pour un logo n'a aucun sens. */
const ICONE_RESEAU: Record<string, any> = {
  x: Send,
  facebook: MessageCircle,
  instagram: MessageCircle,
  youtube: Video,
  tiktok: Video,
  site: Globe,
  recherche: Search,
};

/**
 * Les portes d'entrée du catalogue.
 *
 * Des familles et non les métiers bruts : le catalogue compte une trentaine
 * de professions, et trente boutons ne se lisent pas. Personne ne cherche
 * « judoka » — on cherche « du sport ».
 */
const FAMILLES = [
  { cle: 'football', titre: 'Football' },
  { cle: 'sport', titre: 'Sport' },
  { cle: 'musique', titre: 'Musique' },
  { cle: 'cinema', titre: 'Cinéma' },
  { cle: 'tv', titre: 'TV & humour' },
  { cle: 'web', titre: 'Web' },
  { cle: 'politique', titre: 'Politique' },
  { cle: 'culture', titre: 'Culture' },
];

/**
 * Nom proposé pendant la frappe, que personne n'a encore réclamé.
 *
 * Il vient de Wikipédia, filtré sur les êtres humains. Le toucher réclame le
 * nom EXACT — c'est ce qui empêche « Killian mbappe » et « Kylian Mbappé » de
 * compter pour deux personnalités différentes.
 */
interface SuggestionNom {
  nom: string;
  description?: string | null;
  source?: string | null;
}

export default function ReclamerStarScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { user } = useAuth();
  const { requireAuth } = useAuthPrompt();

  const [recherche, setRecherche] = useState('');
  const [resultats, setResultats] = useState<StarReclamee[]>([]);
  const [suggestions, setSuggestions] = useState<SuggestionNom[]>([]);
  const [classement, setClassement] = useState<StarReclamee[]>([]);
  const [miennes, setMiennes] = useState<StarReclamee[]>([]);
  const [chargement, setChargement] = useState(false);
  const [envoiEnCours, setEnvoiEnCours] = useState(false);

  // La demande en cours de composition : ce que le fan veut, et ce qu'il
  // serait prêt à y mettre. Rien n'est envoyé tant qu'il n'a pas répondu.
  // La famille en cours de consultation. `null` = aucune : on montre alors le
  // classement, c'est-à-dire ce que les fans réclament vraiment.
  const [famille, setFamille] = useState<string | null>(null);
  const [catalogue, setCatalogue] = useState<StarReclamee[]>([]);
  const [chargementCatalogue, setChargementCatalogue] = useState(false);

  const [demande, setDemande] = useState<{ nom: string } | null>(null);
  const [envie, setEnvie] = useState<'dedicace' | 'appel' | 'evenement'>('dedicace');
  const [budget, setBudget] = useState<number | null>(null);

  // L'interpellation en cours de composition : où le fan peut écrire à cette
  // personnalité, et combien de places il reste aujourd'hui.
  const [interpellation, setInterpellation] = useState<{
    nom: string;
    slug: string;
    fans: number;
    ou: Destination[];
    restant: number;
    monTour: boolean;
  } | null>(null);
  const [ouverture, setOuverture] = useState(false);

  const trUI = useAutoTranslate([
    'Réclame ta star',
    'Elle n’est pas encore sur Plyz ? Dis-le. Plus vous êtes nombreux, plus elle a de raisons de venir.',
    'Nom de la personnalité',
    'Rechercher ou créer une réclamation…',
    'Personne ne réclame encore ce nom.',
    'Être le premier à la réclamer',
    'Je la réclame aussi',
    'Tu veux dire…',
    'Je la réclame',
    'Football',
    'Sport',
    'Musique',
    'Cinéma',
    'TV & humour',
    'Web',
    'Politique',
    'Culture',
    'Personne ne la réclame encore',
    'Tu veux voir arriver',
    'Pour quoi, d’abord ?',
    'Une dédicace',
    'Un appel vidéo',
    'Un événement',
    'Tu mettrais combien ?',
    'Ce n’est pas un engagement et tu ne paies rien maintenant. C’est ce chiffre qui décide une personnalité à venir.',
    'Je veux qu’elle vienne',
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
    'Vous avez atteint un palier ! Rendez-vous le',
    'à',
    // ⚠️ Ce texte disait « on lui écrit tous en même temps ». C'est devenu faux
    // le jour où les vagues ont été étalées à trois fans par jour — et une
    // promesse démentie par l'app coûte plus qu'une promesse modeste.
    'chacun son tour, quelques fans par jour. Tu seras prévenu quand ce sera à toi.',
    'Une personnalité peut à tout moment demander le retrait de son nom.',
    // Interpeller — écrire à la personnalité, là où elle est.
    'Lui écrire',
    'Connecte-toi pour lui écrire',
    'Tu lui as déjà écrit',
    'On n’écrit qu’une fois à une personnalité : c’est ce qui fait qu’elle nous lit encore. Fais plutôt venir d’autres fans.',
    'Ce n’est plus possible',
    'Cette personnalité a demandé qu’on cesse de la solliciter. Nous respectons sa décision.',
    'Reviens demain',
    'Trois fans lui ont déjà écrit aujourd’hui. C’est la limite que nous nous imposons : une personnalité harcelée ne vient jamais. Ton tour arrive.',
    'Impossible de préparer ton message. Réessaie.',
    'Impossible d’ouvrir ce réseau. Réessaie.',
    'Écris à {{nom}}',
    'C’est ton tour !',
    'Il reste {{n}} place aujourd’hui',
    'Il reste {{n}} places aujourd’hui',
    'Nous ne laissons passer que trois messages par jour vers une même personnalité : c’est ce qui fait la différence entre une invitation et du harcèlement.',
    'Publier sur X',
    'Ton message est déjà écrit. Tous ses fans le verront.',
    'Écrire sur Messenger',
    'Sa conversation Facebook s’ouvre, ton message est copié.',
    'Message Instagram',
    'Sa messagerie s’ouvre, ton message est copié.',
    'Sa chaîne YouTube',
    'Son compte TikTok',
    'Colle ton message en commentaire de sa dernière vidéo.',
    'Son site officiel',
    'Cherche sa page de contact et colle ton message.',
    'Trouver ses réseaux',
    'Nous ne connaissons pas encore ses comptes. Ton message est copié.',
    'Ton message',
    'Public',
  ]);

  const chargerCatalogue = useCallback(async (fam: string) => {
    setChargementCatalogue(true);
    try {
      const r = await fetch(`${API_BASE}/api/reclamations/catalogue?famille=${fam}`);
      const d = await r.json();
      setCatalogue(Array.isArray(d?.catalogue) ? d.catalogue : []);
    } catch {
      setCatalogue([]);
    } finally {
      setChargementCatalogue(false);
    }
  }, []);

  useEffect(() => {
    if (famille) chargerCatalogue(famille);
  }, [famille, chargerCatalogue]);

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
    if (q.length < 2) { setResultats([]); setSuggestions([]); return; }
    setChargement(true);
    const minuteur = setTimeout(async () => {
      try {
        const r = await fetch(`${API_BASE}/api/reclamations/rechercher?q=${encodeURIComponent(q)}`);
        const d = await r.json();
        setResultats(Array.isArray(d?.resultats) ? d.resultats : []);
        setSuggestions(Array.isArray(d?.suggestions) ? d.suggestions : []);
      } catch {
        setResultats([]);
        setSuggestions([]);
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

  /**
   * Interpeller une personnalité : lui écrire, à elle, là où elle est.
   *
   * C'est le geste qui manquait. Le partage n'envoyait un lien qu'aux proches
   * du fan ; la personne concernée n'apprenait jamais que trois cents fans
   * l'attendaient.
   *
   * ⚠️ Le serveur est consulté AVANT d'ouvrir quoi que ce soit. C'est lui qui
   * tient le plafond de trois messages par jour et par personnalité — sans
   * quoi trois cents fans écriraient le même matin, et une star agacée ne
   * viendrait jamais. Ce qu'il refuse, on l'explique : un bouton qui ne fait
   * rien passe pour une panne.
   */
  const interpeller = (item: StarReclamee) => {
    requireAuth(async () => {
      if (ouverture) return;
      setOuverture(true);
      try {
        const r = await authedFetch(
          `${API_BASE}/api/interpeller/etat?slug=${encodeURIComponent(item.slug || item.nom)}`,
        );
        const d = await r.json();

        if (d?.motif === 'deja_la' && d.celebrity_id) {
          router.push(`/celebrity-detail?id=${d.celebrity_id}` as any);
          return;
        }
        if (d?.motif === 'deja_ecrit') {
          showAlert(trUI('Tu lui as déjà écrit'), trUI('On n’écrit qu’une fois à une personnalité : c’est ce qui fait qu’elle nous lit encore. Fais plutôt venir d’autres fans.'));
          return;
        }
        if (d?.motif === 'retrait') {
          showAlert(trUI('Ce n’est plus possible'), trUI('Cette personnalité a demandé qu’on cesse de la solliciter. Nous respectons sa décision.'));
          return;
        }
        if (!d?.autorise) {
          showConfirm(
            trUI('Reviens demain'),
            trUI('Trois fans lui ont déjà écrit aujourd’hui. C’est la limite que nous nous imposons : une personnalité harcelée ne vient jamais. Ton tour arrive.'),
            [
              { text: t('close') || 'Fermer', style: 'cancel' },
              { text: trUI('Partager'), onPress: () => partager(item.nom, item.fans) },
            ],
          );
          return;
        }

        const fans = Number(d.fans ?? item.fans) || item.fans || 1;
        const ou = trierParPreference(
          destinations(item.nom, fans, d.reseaux || item.reseaux),
          await reseauPrefere(),
        );
        setInterpellation({
          nom: item.nom,
          slug: item.slug || item.nom,
          fans,
          ou,
          restant: Number(d.restant) || 0,
          monTour: !!d.mon_tour,
        });
      } catch {
        showAlert(t('error') || 'Erreur', trUI('Impossible de préparer ton message. Réessaie.'));
      } finally {
        setOuverture(false);
      }
    }, { reason: trUI('Connecte-toi pour lui écrire'), requireBillingIdentity: false });
  };

  /**
   * Le fan part écrire. On consomme sa place, on copie son message, on ouvre.
   *
   * La place est prise AVANT l'ouverture : une fois l'application quittée,
   * rien ne garantit qu'on y revienne, et un compteur qui ne compte que les
   * retours ne compte rien.
   */
  const partirVers = async (dest: Destination) => {
    const en = interpellation;
    if (!en) return;
    try {
      const r = await authedFetch(`${API_BASE}/api/interpeller`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: en.slug, reseau: dest.cle }),
      });
      if (!r.ok) {
        setInterpellation(null);
        showAlert(
          trUI('Reviens demain'),
          trUI('Trois fans lui ont déjà écrit aujourd’hui. C’est la limite que nous nous imposons : une personnalité harcelée ne vient jamais. Ton tour arrive.'),
        );
        return;
      }

      // Sur X le message part déjà écrit. Ailleurs, le presse-papier est le
      // seul moyen de le transporter : aucun réseau n'accepte qu'on
      // pré-remplisse un message privé.
      if (!dest.prerempli) {
        await Clipboard.setStringAsync(messageInterpellation(en.nom, en.fans));
      }
      await memoriserReseau(dest.cle);
      setInterpellation(null);
      await Linking.openURL(dest.url);
      chargerMiennes();
    } catch {
      showAlert(t('error') || 'Erreur', trUI('Impossible d’ouvrir ce réseau. Réessaie.'));
    }
  };

  /**
   * Ouvre la demande. On ne l'envoie pas encore : on demande d'abord CE QUE
   * le fan veut.
   *
   * Un cœur ne se vend pas. « 800 personnes l'aiment bien » n'intéresse aucun
   * agent ; « 800 personnes veulent une dédicace, dont 300 prêtes à mettre
   * 20 € » est une proposition commerciale. Les deux champs existaient en base
   * depuis le début et personne ne les remplissait.
   */
  const reclamer = (nom: string) => {
    setDemande({ nom });
    setEnvie('dedicace');
    setBudget(null);
  };

  const confirmerDemande = () => {
    const nom = demande?.nom;
    if (!nom) return;
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
          body: JSON.stringify({
            nom,
            envie,
            budget_cents: budget,
            // Le pays vient de la langue de l'app : il montre à l'agent
            // l'étendue géographique de la demande. Approximatif, mais un fan
            // n'a aucune envie de renseigner son pays pour cliquer un bouton.
            pays: (getDateLocale() || '').split('-')[1] || null,
          }),
        });
        if (!r.ok) throw new Error('http_' + r.status);
        const d = await r.json();

        if (d.deja_arrivee) {
          router.push(`/celebrity-detail?id=${d.celebrity_id}` as any);
          return;
        }

        const fans = d.fans || 1;
        setDemande(null);
        setRecherche('');
        setResultats([]);
        setSuggestions([]);
        await Promise.all([chargerClassement(), chargerMiennes()]);

        // Le nom n'a pas été reconnu comme celui d'une personnalité publique :
        // on le DIT, et on dit pourquoi. Laisser le fan chercher son nom en
        // vain dans le classement lui ferait croire à une panne.
        let message = d.notoriete_a_confirmer
          ? trUI('Ta réclamation est enregistrée. Elle apparaîtra dans le classement public une fois que nous aurons confirmé qu’il s’agit bien d’une personnalité publique — c’est la même vérification que pour l’inscription d’une célébrité, et elle protège la vie privée de chacun.')
          : `${fans} ${fans > 1 ? trUI('fans la réclament') : trUI('fan la réclame')}. `
            + trUI('Fais-le savoir : plus vous êtes nombreux, plus elle viendra vite.');

        // Un palier vient d'être franchi : c'est LA nouvelle du jour. Cinq
        // cents partages étalés sur trois mois ne se voient pas ; cinq cents
        // messages dans la même heure, si.
        if (d.vague_prevue_le) {
          const quand = new Date(d.vague_prevue_le);
          message += '\n\n' + trUI('Vous avez atteint un palier ! Rendez-vous le')
            + ` ${quand.toLocaleDateString(getDateLocale(), { weekday: 'long', day: 'numeric', month: 'long' })} `
            + `${trUI('à')} ${quand.toLocaleTimeString(getDateLocale(), { hour: '2-digit', minute: '2-digit' })} : `
            + trUI('chacun son tour, quelques fans par jour. Tu seras prévenu quand ce sera à toi.');
        }

        // C'est ici que le fan est le plus motivé : il vient de dire qu'il
        // veut cette personne, il a la confirmation sous les yeux. Lui
        // proposer d'aller le lui dire vaut mieux que de le renvoyer au
        // partage entre amis — à condition que la fiche soit vérifiée : on
        // n'envoie personne interpeller un nom dont on ignore encore s'il
        // s'agit d'une personnalité publique.
        showConfirm(
          trUI('Réclamation enregistrée'),
          message,
          [
            { text: t('close') || 'Fermer', style: 'cancel' },
            d.notoriete_a_confirmer
              ? { text: trUI('Partager'), onPress: () => partager(nom, fans) }
              : {
                text: trUI('Lui écrire'),
                onPress: () => interpeller({
                  slug: d.star?.slug || nom,
                  nom,
                  fans,
                  reseaux: d.reseaux || null,
                }),
              },
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
  // Aucun résultat ni aucune suggestion ne porte exactement ce nom : on propose
  // de l'ouvrir tel qu'il a été tapé. Le champ reste libre — une personnalité
  // montante suivie par 500 000 personnes et absente des encyclopédies doit
  // pouvoir être réclamée. Mais la proposition passe APRÈS les suggestions :
  // entre « Kylian Mbappé » et « Killian mbappe », le bon choix doit être le
  // plus facile à faire.
  const aucunExact = nomSaisi.length >= 2
    && !resultats.some((r) => r.nom.toLowerCase() === nomSaisi.toLowerCase())
    && !suggestions.some((s) => s.nom.toLowerCase() === nomSaisi.toLowerCase());

  const ligne = (item: StarReclamee, montrerBouton = true) => (
    <View style={styles.ligne}>
      <View style={styles.pastille}>
        <Text style={styles.pastilleTxt}>{item.fans}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.nom} numberOfLines={1}>{item.nom}</Text>
        {/* Le métier plutôt que « 0 fan la réclame » : sur une fiche que
            personne n'a encore demandée, répéter le zéro ne fait que souligner
            le vide. « Footballeur français » aide à reconnaître la personne —
            et à distinguer deux homonymes. */}
        <Text style={styles.sous} numberOfLines={1}>
          {item.arrivee
            ? trUI('Elle est arrivée !')
            : item.fans > 0
              ? `${item.fans} ${item.fans > 1 ? trUI('fans la réclament') : trUI('fan la réclame')}`
              : [item.metier, item.pays].filter(Boolean).join(' · ') || trUI('Personne ne la réclame encore')}
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
          {/* « Je la réclame » et non « Je la réclame aussi » : le libellé long
              mangeait la moitié de la carte et coupait le nom au troisième
              caractère — « Zinedine … ». */}
          <Text style={styles.btnReclamerTxt}>{trUI('Je la réclame')}</Text>
        </TouchableOpacity>
      ) : (
        // Deux gestes, et non un seul : « Lui écrire » s'adresse à la
        // personnalité, le partage s'adresse aux autres fans. Confondre les
        // deux, c'était n'en faire aucun — le partage seul ne prévenait jamais
        // la personne concernée.
        <View style={styles.actionsLigne}>
          <TouchableOpacity
            style={styles.btnEcrire}
            onPress={() => interpeller(item)}
            disabled={ouverture}
            activeOpacity={0.85}
          >
            <Megaphone size={14} color="#052e1f" />
            <Text style={styles.btnEcrireTxt}>{trUI('Lui écrire')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => partager(item.nom, item.fans)} hitSlop={10}>
            <Share2 size={18} color="#9ca3af" />
          </TouchableOpacity>
        </View>
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
          data={nomSaisi.length >= 2 ? resultats : (famille ? catalogue : classement)}
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
                {'\n'}
                {trUI('Une personnalité peut à tout moment demander le retrait de son nom.')}
              </Text>

              {/* Noms proposés pendant la frappe, corrigés et vérifiés. Ils
                  passent AVANT le bouton de création libre : c'est ce qui
                  rassemble tous les fans d'une même star sur un seul compteur
                  au lieu d'en ouvrir un par orthographe. */}
              {suggestions.length > 0 && !chargement && (
                <View style={styles.bloc}>
                  <Text style={styles.blocTitre}>{trUI('Tu veux dire…')}</Text>
                  {suggestions.map((s) => (
                    <TouchableOpacity
                      key={s.nom}
                      style={styles.suggestion}
                      onPress={() => reclamer(s.nom)}
                      disabled={envoiEnCours}
                      activeOpacity={0.8}
                    >
                      <View style={styles.suggestionPastille}>
                        <Sparkles size={15} color="#f59e0b" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.nom} numberOfLines={1}>{s.nom}</Text>
                        {!!s.description && (
                          <Text style={styles.sous} numberOfLines={1}>{s.description}</Text>
                        )}
                      </View>
                      <View style={styles.btnReclamer}>
                        <Megaphone size={15} color="#052e1f" />
                        <Text style={styles.btnReclamerTxt}>{trUI('Je la réclame')}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

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

              {/* Parcourir par famille. Sans ces portes d'entrée, un fan qui
                  ne sait pas encore qui réclamer repart les mains vides : le
                  catalogue ne se découvre que si l'on connaît déjà le nom. */}
              {nomSaisi.length < 2 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.famillesRangee}
                >
                  <TouchableOpacity
                    style={[styles.famille, !famille && styles.familleActive]}
                    onPress={() => setFamille(null)}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.familleTxt, !famille && styles.familleTxtActif]}>
                      {trUI('Les plus réclamées')}
                    </Text>
                  </TouchableOpacity>
                  {FAMILLES.map((f) => (
                    <TouchableOpacity
                      key={f.cle}
                      style={[styles.famille, famille === f.cle && styles.familleActive]}
                      onPress={() => setFamille(f.cle)}
                      activeOpacity={0.85}
                    >
                      <Text style={[styles.familleTxt, famille === f.cle && styles.familleTxtActif]}>
                        {trUI(f.titre)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}

              {nomSaisi.length < 2 && chargementCatalogue && (
                <ActivityIndicator color="#10b981" style={{ marginTop: 12 }} />
              )}

              {nomSaisi.length < 2 && !famille && classement.length > 0 && (
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

      {/* Ce qui sépare une demande d'un cœur. Deux questions, deux touchers —
          et le chiffre présenté à un agent cesse d'être « des gens l'aiment
          bien » pour devenir « voilà ce qu'ils veulent, et ce qu'ils sont
          prêts à y mettre ». */}
      <Modal
        visible={!!demande}
        transparent
        animationType="slide"
        onRequestClose={() => setDemande(null)}
      >
        <View style={styles.modalFond}>
          <View style={[styles.feuille, { paddingBottom: insets.bottom + 18 }]}>
            <View style={styles.feuilleEntete}>
              <View style={{ flex: 1 }}>
                <Text style={styles.feuilleSur}>{trUI('Tu veux voir arriver')}</Text>
                <Text style={styles.feuilleNom} numberOfLines={1}>{demande?.nom}</Text>
              </View>
              <TouchableOpacity onPress={() => setDemande(null)} hitSlop={12}>
                <X size={20} color="#9ca3af" />
              </TouchableOpacity>
            </View>

            <Text style={styles.question}>{trUI('Pour quoi, d’abord ?')}</Text>
            <View style={styles.choixLigne}>
              {ENVIES.map((e) => (
                <TouchableOpacity
                  key={e.cle}
                  style={[styles.choix, envie === e.cle && styles.choixActif]}
                  onPress={() => setEnvie(e.cle)}
                  activeOpacity={0.85}
                >
                  <e.Icone size={17} color={envie === e.cle ? '#052e1f' : '#9ca3af'} />
                  <Text style={[styles.choixTxt, envie === e.cle && styles.choixTxtActif]}>
                    {trUI(e.titre)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.question}>{trUI('Tu mettrais combien ?')}</Text>
            <Text style={styles.questionAide}>
              {trUI('Ce n’est pas un engagement et tu ne paies rien maintenant. C’est ce chiffre qui décide une personnalité à venir.')}
            </Text>
            <View style={styles.choixLigne}>
              {BUDGETS.map((b) => (
                <TouchableOpacity
                  key={String(b.cents)}
                  style={[styles.budget, budget === b.cents && styles.budgetActif]}
                  onPress={() => setBudget(b.cents)}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.choixTxt, budget === b.cents && styles.choixTxtActif]}>
                    {b.libelle}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.btnDemande, envoiEnCours && { opacity: 0.5 }]}
              onPress={confirmerDemande}
              disabled={envoiEnCours}
              activeOpacity={0.85}
            >
              {envoiEnCours ? (
                <ActivityIndicator size="small" color="#052e1f" />
              ) : (
                <>
                  <Megaphone size={18} color="#052e1f" />
                  <Text style={styles.btnDemandeTxt}>{trUI('Je veux qu’elle vienne')}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Où écrire à la personnalité.
          Une LISTE, et non une ouverture directe : X est de loin le meilleur
          endroit — le message y part déjà écrit, avec sa mention, et tous ses
          fans le voient — mais encore faut-il que le fan y ait un compte, ce
          qui est loin d'être acquis. Il voit donc en un coup d'œil ce qui lui
          est possible, et l'on retient son choix pour la fois suivante. */}
      <Modal
        visible={!!interpellation}
        transparent
        animationType="slide"
        onRequestClose={() => setInterpellation(null)}
      >
        <View style={styles.modalFond}>
          <View style={[styles.feuille, { paddingBottom: insets.bottom + 18 }]}>
            <View style={styles.feuilleEntete}>
              <View style={{ flex: 1 }}>
                <Text style={styles.feuilleSur}>
                  {interpellation?.monTour ? trUI('C’est ton tour !') : trUI('Ton message')}
                </Text>
                <Text style={styles.feuilleNom} numberOfLines={1}>
                  {trUI('Écris à {{nom}}').replace('{{nom}}', interpellation?.nom || '')}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setInterpellation(null)} hitSlop={12}>
                <X size={20} color="#9ca3af" />
              </TouchableOpacity>
            </View>

            {/* Le message est montré AVANT le départ : le fan doit savoir ce
                qu'il s'apprête à publier en son nom. */}
            <View style={styles.apercuMessage}>
              <Text style={styles.apercuMessageTxt}>
                {interpellation
                  ? messageInterpellation(interpellation.nom, interpellation.fans)
                  : ''}
              </Text>
            </View>

            <ScrollView style={{ maxHeight: 320 }} keyboardShouldPersistTaps="handled">
              {(interpellation?.ou || []).map((d) => {
                const Icone = ICONE_RESEAU[d.cle] || Send;
                return (
                  <TouchableOpacity
                    key={d.cle}
                    style={styles.destination}
                    onPress={() => partirVers(d)}
                    activeOpacity={0.85}
                  >
                    <View style={[styles.destinationIcone, d.prerempli && styles.destinationIconeFort]}>
                      <Icone size={17} color={d.prerempli ? '#052e1f' : '#10b981'} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={styles.destinationTitreLigne}>
                        <Text style={styles.destinationTitre} numberOfLines={1}>{trUI(d.titre)}</Text>
                        {d.public && (
                          <View style={styles.etiquettePublic}>
                            <Text style={styles.etiquettePublicTxt}>{trUI('Public')}</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.destinationDetail} numberOfLines={2}>{trUI(d.detail)}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Le plafond est DIT, jamais subi. Un fan qui comprend pourquoi
                il n'y a que trois places accepte d'attendre son tour ; un fan
                qui se heurte à un refus muet croit à une panne. */}
            <View style={styles.plafondLigne}>
              <Clock size={14} color="#f59e0b" />
              <Text style={styles.plafondTxt}>
                {(interpellation?.restant === 1
                  ? trUI('Il reste {{n}} place aujourd’hui')
                  : trUI('Il reste {{n}} places aujourd’hui')
                ).replace('{{n}}', String(interpellation?.restant ?? 0))}
              </Text>
            </View>
            <Text style={styles.plafondNote}>
              {trUI('Nous ne laissons passer que trois messages par jour vers une même personnalité : c’est ce qui fait la différence entre une invitation et du harcèlement.')}
            </Text>
          </View>
        </View>
      </Modal>

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

  // Écrire à la personnalité, et faire venir d'autres fans : deux gestes
  // distincts, côte à côte. Le premier est le plus important, il est plein.
  actionsLigne: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  btnEcrire: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#f59e0b', borderRadius: 10,
    paddingVertical: 8, paddingHorizontal: 11,
  },
  btnEcrireTxt: { color: '#052e1f', fontSize: 12.5, fontWeight: '800' },

  apercuMessage: {
    backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12,
    padding: 12, marginBottom: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  apercuMessageTxt: { color: '#d1d5db', fontSize: 13.5, lineHeight: 19 },

  destination: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 12, marginBottom: 9, borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  destinationIcone: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(16,185,129,0.14)',
  },
  // Le seul endroit où le message part déjà écrit se voit au premier coup
  // d'œil : c'est le geste le plus court, il doit être le plus visible.
  destinationIconeFort: { backgroundColor: '#10b981' },
  destinationTitreLigne: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  destinationTitre: { color: '#fff', fontSize: 14.5, fontWeight: '700' },
  destinationDetail: { color: '#9ca3af', fontSize: 12.5, lineHeight: 17, marginTop: 2 },
  etiquettePublic: {
    backgroundColor: 'rgba(16,185,129,0.16)',
    borderWidth: 1, borderColor: 'rgba(16,185,129,0.35)',
    paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6,
  },
  etiquettePublicTxt: { color: '#10b981', fontSize: 10, fontWeight: '800' },

  plafondLigne: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 6 },
  plafondTxt: { color: '#f59e0b', fontSize: 13, fontWeight: '800' },
  plafondNote: { color: '#6b7280', fontSize: 11.5, lineHeight: 16, marginTop: 5 },

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

  famillesRangee: { paddingHorizontal: 16, gap: 8, paddingVertical: 4 },
  famille: {
    paddingVertical: 8, paddingHorizontal: 13, borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
  },
  familleActive: { backgroundColor: '#10b981', borderColor: '#10b981' },
  familleTxt: { color: '#9ca3af', fontSize: 13, fontWeight: '700' },
  familleTxtActif: { color: '#052e1f' },

  modalFond: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.65)' },
  feuille: {
    backgroundColor: '#111827',
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
    paddingHorizontal: 18, paddingTop: 16,
  },
  feuilleEntete: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 16 },
  feuilleSur: { color: '#9ca3af', fontSize: 12.5, fontWeight: '600' },
  feuilleNom: { color: '#fff', fontSize: 19, fontWeight: '800', marginTop: 2 },
  question: { color: '#fff', fontSize: 14.5, fontWeight: '700', marginBottom: 8 },
  questionAide: { color: '#9ca3af', fontSize: 12.5, lineHeight: 18, marginTop: -4, marginBottom: 10 },
  choixLigne: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  choix: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 10, paddingHorizontal: 13, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
  },
  choixActif: { backgroundColor: '#10b981', borderColor: '#10b981' },
  choixTxt: { color: '#9ca3af', fontSize: 13.5, fontWeight: '700' },
  choixTxtActif: { color: '#052e1f' },
  budget: {
    paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
  },
  budgetActif: { backgroundColor: '#f59e0b', borderColor: '#f59e0b' },
  btnDemande: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9,
    backgroundColor: '#10b981', borderRadius: 14, paddingVertical: 15, marginTop: 4,
  },
  btnDemandeTxt: { color: '#052e1f', fontSize: 16, fontWeight: '800' },

  // Nom suggéré : bordure orange comme l'accroche du haut, pour qu'on voie
  // d'un coup d'œil que ces lignes-là viennent de l'encyclopédie et non du
  // classement des fans.
  suggestion: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginHorizontal: 16, marginBottom: 8,
    padding: 11, borderRadius: 13,
    backgroundColor: 'rgba(245,158,11,0.07)',
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.28)',
  },
  suggestionPastille: {
    width: 42, height: 42, borderRadius: 21,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(245,158,11,0.14)',
  },

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
