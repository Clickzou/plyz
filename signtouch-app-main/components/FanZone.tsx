import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Megaphone, Users, Trophy, ChevronRight, Sparkles } from 'lucide-react-native';
import { useFollow, FAN_TIER_CONFIG } from '@/contexts/FollowContext';
import { useAuth } from '@/contexts/AuthContext';
import { useAutoTranslate } from '@/utils/translation';
import { BOTTOM_NAV_HEIGHT } from '@/components/BottomNav';

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
  const [chargement, setChargement] = useState(true);

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
  ]);

  const charger = useCallback(async () => {
    try {
      const [rClassement, rMiennes] = await Promise.all([
        fetch(`${API_BASE}/api/reclamations/classement`).then((r) => r.json()).catch(() => null),
        user
          ? fetch(`${API_BASE}/api/reclamations/miennes`).then((r) => r.json()).catch(() => null)
          : Promise.resolve(null),
      ]);
      setClassement(Array.isArray(rClassement?.classement) ? rClassement.classement : []);
      setMiennes(Array.isArray(rMiennes?.miennes) ? rMiennes.miennes : []);
    } finally {
      setChargement(false);
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
          {miennes.length > 0 && (
            <View style={styles.bloc}>
              <View style={styles.blocEntete}>
                <Users size={15} color="#9ca3af" />
                <Text style={styles.blocTitre}>{trUI('Mes réclamations')}</Text>
              </View>
              {miennes.map(ligneStar)}
            </View>
          )}

          <View style={styles.bloc}>
            <View style={styles.blocEntete}>
              <Trophy size={15} color="#9ca3af" />
              <Text style={styles.blocTitre}>{trUI('Les plus réclamées')}</Text>
            </View>
            {classement.length === 0 ? (
              <Text style={styles.vide}>
                {trUI('Personne ne réclame encore de personnalité. Sois le premier.')}
              </Text>
            ) : (
              classement.map(ligneStar)
            )}
          </View>
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
});
