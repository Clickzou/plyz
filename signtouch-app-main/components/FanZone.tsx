import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  Megaphone, Users, Trophy, ChevronRight, Sparkles, MessageCircle,
  HelpCircle, Tag, Image as ImageIcon, Flame, Plus,
} from 'lucide-react-native';
import { useFollow, FAN_TIER_CONFIG } from '@/contexts/FollowContext';
import { useAuth } from '@/contexts/AuthContext';
import { useAutoTranslate } from '@/utils/translation';
import { supabase } from '@/utils/supabase';
import { BOTTOM_NAV_HEIGHT } from '@/components/BottomNav';
import PremiersPas from '@/components/PremiersPas';

const API_BASE = process.env.EXPO_PUBLIC_STRIPE_SERVER_URL || '';

interface StarClassee {
  slug: string;
  nom: string;
  fans: number;
  arrivee?: boolean;
  celebrity_id?: string | null;
}

/**
 * Paliers de la demande collective.
 *
 * Ce sont les mêmes que ceux qui déclenchent les vagues côté serveur. Les
 * afficher change tout : « 847 fans » est un chiffre, « plus que 153 avant la
 * vague » est un objectif — et un objectif se revient vérifier.
 */
const PALIERS = [10, 50, 100, 250, 500, 1000, 2500, 5000];

function prochainPalier(fans: number): number | null {
  return PALIERS.find((p) => p > fans) ?? null;
}

/** Une ligne du fil : un sujet ouvert dans l'un des espaces du fan. */
interface SujetFil {
  id: string;
  celebrity_id: string | null;
  star_id: string | null;
  type: 'discussion' | 'question' | 'bon_plan' | 'photo';
  titre: string;
  contenu: string | null;
  media_url: string | null;
  nb_messages: number;
  nb_soutiens: number;
  dernier_le: string;
  auteur_nom: string;
  auteur_avatar: string | null;
  par_la_star: boolean;
  soutenu: boolean;
  espace_nom: string | null;
  espace_avatar: string | null;
  espace_slug: string | null;
}

const TYPES_SUJET: Record<string, { titre: string; Icone: any; couleur: string }> = {
  discussion: { titre: 'Discussion', Icone: MessageCircle, couleur: '#60a5fa' },
  question: { titre: 'Question', Icone: HelpCircle, couleur: '#f59e0b' },
  bon_plan: { titre: 'Bon plan', Icone: Tag, couleur: '#10b981' },
  photo: { titre: 'Photo', Icone: ImageIcon, couleur: '#a78bfa' },
};

/** « il y a 3 h » plutôt qu'une date : dans un fil, c'est la fraîcheur qui
 *  compte, et « 07/08 14:32 » ne dit pas si c'est vivant. */
function depuis(iso: string, tr: (s: string) => string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 60) return tr('à l’instant');
  const heures = Math.round(minutes / 60);
  if (heures < 24) return `${heures} h`;
  return `${Math.round(heures / 24)} j`;
}

/**
 * La moitié « fans » de l'écran d'accueil.
 *
 * Elle ne cherche pas à concurrencer Instagram sur son terrain — on y perdrait.
 * Elle joue la seule carte qu'aucun réseau social n'a : ici, ce que font les
 * fans peut réellement faire venir la personnalité. Tout ce qu'on y montre doit
 * servir cela.
 */
export default function FanZone() {
  const router = useRouter();
  const { user } = useAuth();
  const { fanTier, followCount, interactions, followedCelebrities } = useFollow();

  const [classement, setClassement] = useState<StarClassee[]>([]);
  const [miennes, setMiennes] = useState<StarClassee[]>([]);
  const [fil, setFil] = useState<SujetFil[]>([]);
  const [chargement, setChargement] = useState(true);
  const [premiersPasFaits, setPremiersPasFaits] = useState(false);

  const trUI = useAutoTranslate([
    'Ton rang de fan',
    'Tu es',
    'Encore {{n}} points pour passer',
    'Rang maximal atteint. Respect.',
    'Le rang se gagne en étant là : suivre, venir aux événements, obtenir des dédicaces.',
    'Fais venir tes stars',
    'Personne ne réclame encore de personnalité. Sois le premier.',
    'Réclamer une personnalité',
    'Mes réclamations',
    'Les plus réclamées',
    'fan',
    'fans',
    'Plus que {{n}} avant la vague',
    'Elle est arrivée !',
    'Voir sa page',
    'Une vague, c\'est le jour où vous lui écrivez tous en même temps. Mille messages le même matin ne s\'ignorent pas.',
    'Tes espaces fans',
    'Suis une personnalité pour entrer dans l’espace de ses fans.',
    'Discussions, bons plans, photos',
    // Le fil d'activité — ce que les fans font, à la place du classement.
    'Ce qui bouge chez tes stars',
    'Rien encore dans tes espaces. Ouvre le premier sujet, les autres suivront.',
    'Discussion',
    'Question',
    'Bon plan',
    'Photo',
    'à l’instant',
    'réponse',
    'réponses',
    'Moi aussi',
    'Tout voir',
  ]);

  const charger = useCallback(async () => {
    try {
      const [rClassement, rMiennes, rFil] = await Promise.all([
        fetch(`${API_BASE}/api/reclamations/classement`).then((r) => r.json()).catch(() => null),
        user
          ? fetch(`${API_BASE}/api/reclamations/miennes`).then((r) => r.json()).catch(() => null)
          : Promise.resolve(null),
        // Le fil passe par la base, pas par le serveur : les règles d'accès
        // aux espaces y sont déjà écrites, et les redoubler côté serveur
        // aurait fait deux vérités à tenir d'accord.
        user
          // `then(succès, échec)` et non `.catch` : le constructeur de requête
          // de Supabase n'est pas une vraie promesse, il n'a pas de `.catch`.
          ? supabase.rpc('fz_fil_activite', { p_limite: 20 }).then((r) => r.data, () => null)
          : Promise.resolve(null),
      ]);
      setClassement(Array.isArray(rClassement?.classement) ? rClassement.classement : []);
      setMiennes(Array.isArray(rMiennes?.miennes) ? rMiennes.miennes : []);
      setFil(Array.isArray(rFil) ? (rFil as SujetFil[]) : []);
    } finally {
      setChargement(false);
    }
  }, [user]);

  /**
   * « Moi aussi je veux savoir. »
   *
   * Sans ce geste, quarante fans posent quarante fois la même question et la
   * personnalité voit un mur illisible. Avec lui, une question monte — et
   * c'est elle qu'on met dans le dossier qu'on lui envoie.
   *
   * L'affichage est mis à jour AVANT la base : un compteur qui attend
   * l'aller-retour donne l'impression que le bouton n'a pas marché.
   */
  const soutenir = useCallback(async (sujet: SujetFil) => {
    if (!user) return;
    const soutenu = !sujet.soutenu;
    setFil((actuel) => actuel.map((s) => (s.id === sujet.id
      ? { ...s, soutenu, nb_soutiens: Math.max(0, s.nb_soutiens + (soutenu ? 1 : -1)) }
      : s)));
    try {
      if (soutenu) {
        await supabase.from('fanzone_soutiens').insert({ sujet_id: sujet.id, fan_id: user.id });
      } else {
        await supabase.from('fanzone_soutiens').delete()
          .eq('sujet_id', sujet.id).eq('fan_id', user.id);
      }
    } catch {
      // L'écriture a échoué : on remet la ligne comme elle était, sinon le
      // compteur mentirait jusqu'au prochain rafraîchissement.
      setFil((actuel) => actuel.map((s) => (s.id === sujet.id
        ? { ...s, soutenu: sujet.soutenu, nb_soutiens: sujet.nb_soutiens }
        : s)));
    }
  }, [user]);

  useEffect(() => { charger(); }, [charger]);

  const rang = FAN_TIER_CONFIG[fanTier];
  // Le même calcul que celui qui attribue le rang. Le montrer permet au fan de
  // savoir ce qui lui manque — un rang qu'on ne sait pas comment gagner ne fait
  // revenir personne.
  const points = followCount
    + interactions.totalBookings * 3
    + interactions.totalAutographs * 2
    + interactions.totalLiveSessions * 5;
  const suivant = Object.values(FAN_TIER_CONFIG)
    .filter((r) => r.minPoints > points)
    .sort((a, b) => a.minPoints - b.minPoints)[0];

  const ligneStar = (s: StarClassee) => {
    const reste = prochainPalier(s.fans);
    return (
      <TouchableOpacity
        key={s.slug}
        style={styles.ligneStar}
        onPress={() => (s.arrivee && s.celebrity_id
          ? router.push(`/celebrity-detail?id=${s.celebrity_id}` as any)
          : router.push('/reclamer-star' as any))}
        activeOpacity={0.85}
      >
        <View style={styles.pastilleFans}>
          <Text style={styles.pastilleFansTxt}>{s.fans}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.nomStar} numberOfLines={1}>{s.nom}</Text>
          {s.arrivee ? (
            <Text style={[styles.sousStar, { color: '#10b981' }]}>{trUI('Elle est arrivée !')}</Text>
          ) : (
            <>
              <Text style={styles.sousStar}>
                {s.fans} {s.fans > 1 ? trUI('fans') : trUI('fan')}
              </Text>
              {!!reste && (
                <View style={styles.jauge}>
                  <View style={[styles.jaugeRemplie, { width: `${Math.min(100, (s.fans / reste) * 100)}%` }]} />
                </View>
              )}
              {!!reste && (
                <Text style={styles.resteTxt}>
                  {trUI('Plus que {{n}} avant la vague').replace('{{n}}', String(reste - s.fans))}
                </Text>
              )}
            </>
          )}
        </View>
        <ChevronRight size={18} color="#6b7280" />
      </TouchableOpacity>
    );
  };

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingBottom: BOTTOM_NAV_HEIGHT + 24, paddingTop: 12 }}
      refreshControl={<RefreshControl refreshing={false} onRefresh={charger} tintColor="#10b981" />}
    >
      {/* Le rang était calculé depuis toujours et n'était montré nulle part.
          Un fan qui voit sa progression revient ; une personnalité qui voit le
          nom de ses plus grands fans s'y attache. */}
      <View style={styles.carte}>
        <View style={styles.carteEntete}>
          <Trophy size={17} color={rang.color} />
          <Text style={styles.carteTitre}>{trUI('Ton rang de fan')}</Text>
        </View>
        <View style={styles.rangLigne}>
          <Text style={styles.rangIcone}>{rang.icon}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.rangNom, { color: rang.color }]}>{rang.label}</Text>
            <Text style={styles.rangPoints}>{points} pts</Text>
          </View>
        </View>
        {suivant ? (
          <>
            <View style={styles.jauge}>
              <View
                style={[
                  styles.jaugeRemplie,
                  { width: `${Math.min(100, (points / suivant.minPoints) * 100)}%`, backgroundColor: suivant.color },
                ]}
              />
            </View>
            <Text style={styles.rangAide}>
              {trUI('Encore {{n}} points pour passer').replace('{{n}}', String(suivant.minPoints - points))}
              {' '}{suivant.icon} {suivant.label}
            </Text>
          </>
        ) : (
          <Text style={styles.rangAide}>{trUI('Rang maximal atteint. Respect.')}</Text>
        )}
        <Text style={styles.rangNote}>
          {trUI('Le rang se gagne en étant là : suivre, venir aux événements, obtenir des dédicaces.')}
        </Text>
      </View>

      {/* La demande collective : le seul mécanisme qui, à force de revenir, fait
          réellement venir quelqu'un. C'est ce qui distingue cette zone d'un
          énième fil de discussion. */}
      <View style={styles.carte}>
        <View style={styles.carteEntete}>
          <Megaphone size={17} color="#f59e0b" />
          <Text style={styles.carteTitre}>{trUI('Fais venir tes stars')}</Text>
        </View>
        <Text style={styles.rangNote}>
          {trUI('Une vague, c\'est le jour où vous lui écrivez tous en même temps. Mille messages le même matin ne s\'ignorent pas.')}
        </Text>
        <TouchableOpacity
          style={styles.btnPrincipal}
          onPress={() => router.push('/reclamer-star' as any)}
          activeOpacity={0.85}
        >
          <Sparkles size={16} color="#052e1f" />
          <Text style={styles.btnPrincipalTxt}>{trUI('Réclamer une personnalité')}</Text>
        </TouchableOpacity>
      </View>

      {/* Les espaces où le fan est déjà entré. On n'entre que dans l'espace de
          quelqu'un qu'on suit : la communauté se fédère autour d'une personne,
          pas dans le vide — et suivre est un signal utile à la star. */}
      <View style={styles.bloc}>
        <View style={styles.blocEntete}>
          <Users size={15} color="#9ca3af" />
          <Text style={styles.blocTitre}>{trUI('Tes espaces fans')}</Text>
        </View>
        {followedCelebrities.length === 0 ? (
          <Text style={styles.vide}>
            {trUI('Suis une personnalité pour entrer dans l’espace de ses fans.')}
          </Text>
        ) : (
          followedCelebrities.map((c) => (
            <TouchableOpacity
              key={c.user_id}
              style={styles.ligneStar}
              activeOpacity={0.85}
              onPress={() => router.push({
                pathname: '/fan-groupe',
                params: { celebrityId: c.user_id, nom: c.stage_name },
              } as any)}
            >
              {c.avatar_url ? (
                <Image source={{ uri: c.avatar_url }} style={styles.avatarStar} />
              ) : (
                <View style={[styles.avatarStar, styles.avatarVide]}>
                  <Text style={styles.avatarTxt}>{(c.stage_name || '?')[0].toUpperCase()}</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.nomStar} numberOfLines={1}>{c.stage_name}</Text>
                <Text style={styles.sousStar}>{trUI('Discussions, bons plans, photos')}</Text>
              </View>
              <ChevronRight size={18} color="#6b7280" />
            </TouchableOpacity>
          ))
        )}
      </View>

      {chargement ? (
        <ActivityIndicator color="#10b981" style={{ marginTop: 20 }} />
      ) : (
        <>
          {/* Le premier pas, tant qu'on n'a suivi ni réclamé personne. Sans
              lui, un nouveau venu trouve une page vide qui lui demande de
              faire une chose sans lui dire où la trouver. Il disparaît dès
              qu'on est entré : ce n'est pas un écran de bienvenue, c'est un
              raccourci. */}
          {!premiersPasFaits && followedCelebrities.length === 0 && miennes.length === 0 && (
            <PremiersPas onTermine={() => { setPremiersPasFaits(true); charger(); }} />
          )}

          {miennes.length > 0 && (
            <View style={styles.bloc}>
              <View style={styles.blocEntete}>
                <Users size={15} color="#9ca3af" />
                <Text style={styles.blocTitre}>{trUI('Mes réclamations')}</Text>
              </View>
              {miennes.map(ligneStar)}
            </View>
          )}

          {/* Le fil d'activité, à la place qu'occupait « Les plus réclamées ».
              Le classement a sa page dédiée derrière « Réclamer une
              personnalité » ; ici, ce sont les fans qu'on montre. Un fil qui
              bouge donne une raison de revenir, un classement figé non. */}
          {/* Le fil suffit à s'afficher lui-même : un fan qui a réclamé une
              personnalité sans suivre personne a bien un espace, et exiger un
              abonnement l'aurait caché. */}
          {(fil.length > 0 || followedCelebrities.length > 0) && (
            <View style={styles.bloc}>
              <View style={styles.blocEntete}>
                <Flame size={15} color="#9ca3af" />
                <Text style={styles.blocTitre}>{trUI('Ce qui bouge chez tes stars')}</Text>
              </View>

              {fil.length === 0 ? (
                <Text style={styles.vide}>
                  {trUI('Rien encore dans tes espaces. Ouvre le premier sujet, les autres suivront.')}
                </Text>
              ) : fil.map((s) => {
                const genre = TYPES_SUJET[s.type] || TYPES_SUJET.discussion;
                return (
                  <TouchableOpacity
                    key={s.id}
                    style={styles.sujet}
                    activeOpacity={0.85}
                    onPress={() => router.push({
                      pathname: '/fan-sujet',
                      params: { id: s.id, titre: s.titre, celebrityId: s.celebrity_id || '' },
                    } as any)}
                  >
                    {/* De quel espace vient ce sujet : sans lui, « Il arrive
                        quand ? » ne veut rien dire. */}
                    <View style={styles.sujetEntete}>
                      {s.espace_avatar ? (
                        <Image source={{ uri: s.espace_avatar }} style={styles.espaceAvatar} />
                      ) : (
                        <View style={[styles.espaceAvatar, styles.avatarVide]}>
                          <Text style={styles.espaceAvatarTxt}>
                            {(s.espace_nom || '?')[0].toUpperCase()}
                          </Text>
                        </View>
                      )}
                      <Text style={styles.espaceNom} numberOfLines={1}>{s.espace_nom}</Text>
                      <View style={[styles.genre, { borderColor: `${genre.couleur}55` }]}>
                        <genre.Icone size={10} color={genre.couleur} />
                        <Text style={[styles.genreTxt, { color: genre.couleur }]}>
                          {trUI(genre.titre)}
                        </Text>
                      </View>
                      <Text style={styles.quand}>{depuis(s.dernier_le, trUI)}</Text>
                    </View>

                    <Text style={styles.sujetTitre} numberOfLines={2}>{s.titre}</Text>
                    {!!s.contenu && (
                      <Text style={styles.sujetExtrait} numberOfLines={2}>{s.contenu}</Text>
                    )}
                    {!!s.media_url && (
                      <Image source={{ uri: s.media_url }} style={styles.sujetPhoto} resizeMode="cover" />
                    )}

                    <View style={styles.sujetPied}>
                      <Text style={styles.sujetAuteur} numberOfLines={1}>
                        {s.par_la_star ? `⭐ ${s.auteur_nom}` : s.auteur_nom}
                        {' · '}
                        {s.nb_messages} {s.nb_messages > 1 ? trUI('réponses') : trUI('réponse')}
                      </Text>

                      {/* Le soutien n'a de sens que sur une question : c'est ce
                          qui la fait monter dans le dossier qu'on enverra à la
                          personnalité. Sur une photo, il n'aurait rien à trier. */}
                      {s.type === 'question' && (
                        <TouchableOpacity
                          style={[styles.soutien, s.soutenu && styles.soutienActif]}
                          onPress={() => soutenir(s)}
                          activeOpacity={0.85}
                          hitSlop={6}
                        >
                          <Plus size={12} color={s.soutenu ? '#052e1f' : '#f59e0b'} />
                          <Text style={[styles.soutienTxt, s.soutenu && styles.soutienTxtActif]}>
                            {trUI('Moi aussi')} {s.nb_soutiens > 0 ? s.nb_soutiens : ''}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  carte: {
    marginHorizontal: 16, marginBottom: 12,
    padding: 14, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  carteEntete: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  carteTitre: { color: '#fff', fontSize: 15, fontWeight: '800' },

  rangLigne: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  rangIcone: { fontSize: 30 },
  rangNom: { fontSize: 18, fontWeight: '900' },
  rangPoints: { color: '#9ca3af', fontSize: 12.5, marginTop: 1 },
  rangAide: { color: '#d1d5db', fontSize: 13, marginTop: 7 },
  rangNote: { color: '#9ca3af', fontSize: 12.5, lineHeight: 18, marginTop: 8 },

  jauge: {
    height: 6, borderRadius: 3, overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.09)', marginTop: 6,
  },
  jaugeRemplie: { height: '100%', borderRadius: 3, backgroundColor: '#10b981' },

  btnPrincipal: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#10b981', borderRadius: 12, paddingVertical: 12, marginTop: 12,
  },
  btnPrincipalTxt: { color: '#052e1f', fontSize: 14.5, fontWeight: '800' },

  bloc: { marginBottom: 10 },
  blocEntete: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    marginHorizontal: 16, marginTop: 8, marginBottom: 8,
  },
  blocTitre: {
    color: '#9ca3af', fontSize: 12.5, fontWeight: '800',
    textTransform: 'uppercase', letterSpacing: 0.6,
  },

  ligneStar: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginHorizontal: 16, marginBottom: 8,
    padding: 11, borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  pastilleFans: {
    minWidth: 42, height: 42, borderRadius: 21, paddingHorizontal: 6,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(245,158,11,0.16)',
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.4)',
  },
  pastilleFansTxt: { color: '#f59e0b', fontSize: 15, fontWeight: '900' },
  avatarStar: { width: 42, height: 42, borderRadius: 21 },
  avatarVide: {
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  avatarTxt: { color: '#fff', fontSize: 17, fontWeight: '800' },
  nomStar: { color: '#fff', fontSize: 15, fontWeight: '700' },
  sousStar: { color: '#9ca3af', fontSize: 12.5, marginTop: 2 },
  resteTxt: { color: '#f59e0b', fontSize: 11.5, fontWeight: '700', marginTop: 4 },

  vide: { color: '#6b7280', fontSize: 13.5, marginHorizontal: 16, lineHeight: 19 },

  // Le fil d'activité
  sujet: {
    marginHorizontal: 16, marginBottom: 9,
    padding: 12, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
  },
  sujetEntete: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 7 },
  espaceAvatar: { width: 22, height: 22, borderRadius: 11 },
  espaceAvatarTxt: { color: '#fff', fontSize: 10, fontWeight: '800' },
  espaceNom: { color: '#d1d5db', fontSize: 12.5, fontWeight: '700', flexShrink: 1 },
  genre: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 6, paddingVertical: 1,
    borderRadius: 6, borderWidth: 1,
  },
  genreTxt: { fontSize: 10, fontWeight: '800' },
  quand: { color: '#6b7280', fontSize: 11, marginLeft: 'auto' },

  sujetTitre: { color: '#fff', fontSize: 14.5, fontWeight: '700', lineHeight: 20 },
  sujetExtrait: { color: '#9ca3af', fontSize: 13, lineHeight: 18, marginTop: 4 },
  sujetPhoto: { width: '100%', height: 150, borderRadius: 10, marginTop: 9 },
  sujetPied: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 9,
  },
  sujetAuteur: { color: '#6b7280', fontSize: 11.5, flex: 1 },
  soutien: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 9, paddingVertical: 5, borderRadius: 9,
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.4)',
    backgroundColor: 'rgba(245,158,11,0.12)',
  },
  soutienActif: { backgroundColor: '#f59e0b', borderColor: '#f59e0b' },
  soutienTxt: { color: '#f59e0b', fontSize: 11.5, fontWeight: '800' },
  soutienTxtActif: { color: '#052e1f' },
});
