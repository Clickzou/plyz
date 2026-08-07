import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, Image, ActivityIndicator,
  TextInput, Platform, KeyboardAvoidingView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Send, Flag, UserX, BadgeCheck, Star } from 'lucide-react-native';
import { supabase } from '@/utils/supabase';
import { showAlert, showConfirm } from '@/utils/alertHelper';
import { useAuth } from '@/contexts/AuthContext';
import { useAuthPrompt } from '@/contexts/AuthPromptContext';
import { useAutoTranslate } from '@/utils/translation';
import { detecterCoordonnees } from '@/utils/filtreCoordonnees';
import { bloquer } from '@/utils/blocages';
import ReportContentModal from '@/components/ReportContentModal';

interface Message {
  id: string;
  sujet_id: string;
  auteur_id: string;
  contenu: string;
  media_url: string | null;
  created_at: string;
  auteur_nom: string;
  auteur_avatar: string | null;
  par_la_star: boolean;
}

/**
 * Un sujet et ses réponses.
 *
 * Trois obligations des stores tiennent dans cet écran : on peut signaler un
 * message, on peut bloquer son auteur, et rien ne s'échange en privé. Le
 * blocage filtre en base — un message bloqué n'arrive même pas sur l'appareil.
 */
export default function FanSujetScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { requireAuth } = useAuthPrompt();
  const params = useLocalSearchParams<{ id?: string; titre?: string; celebrityId?: string }>();
  const sujetId = String(params.id || '');

  const [messages, setMessages] = useState<Message[]>([]);
  const [verifies, setVerifies] = useState<Set<string>>(new Set());
  const [chargement, setChargement] = useState(true);
  const [texte, setTexte] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [signale, setSignale] = useState<Message | null>(null);

  const trUI = useAutoTranslate([
    'Écris ta réponse…',
    'Personne n’a encore répondu. Lance la discussion.',
    'Message non publié',
    'Les liens ne sont pas autorisés dans la Fan zone : c’est par là que passent les fausses pages et les arnaques aux fans.',
    'Les numéros de téléphone ne sont pas autorisés dans la Fan zone, ni le tien ni celui de quelqu’un d’autre.',
    'Ton message n’a pas pu être publié. Vérifie ta connexion et réessaie.',
    'Bloquer cette personne ?',
    'Vous ne verrez plus vos messages respectifs dans la Fan zone. Elle n’en sera pas informée.',
    'Bloquer',
    'Annuler',
    'A rencontré la star',
    'Signaler',
    'Connecte-toi pour participer',
    'Connecte-toi pour signaler ce contenu',
    'Sujet',
  ]);

  const charger = useCallback(async () => {
    if (!sujetId) return;
    const { data } = await supabase
      .from('fanzone_messages_public')
      .select('*')
      .eq('sujet_id', sujetId)
      .order('created_at', { ascending: true })
      .limit(300);
    setMessages((data || []) as Message[]);

    if (params.celebrityId) {
      const { data: v } = await supabase.rpc('fz_fans_verifies', { p_celebrity: params.celebrityId });
      setVerifies(new Set((v || []).map((r: any) => r.fan_id)));
    }
    setChargement(false);
  }, [sujetId, params.celebrityId]);

  useEffect(() => { charger(); }, [charger]);

  const envoyer = () => {
    const t = texte.trim();
    if (!t || envoi) return;

    const trouve = detecterCoordonnees(t);
    if (trouve) {
      showAlert(
        trUI('Message non publié'),
        trouve === 'lien'
          ? trUI('Les liens ne sont pas autorisés dans la Fan zone : c’est par là que passent les fausses pages et les arnaques aux fans.')
          : trUI('Les numéros de téléphone ne sont pas autorisés dans la Fan zone, ni le tien ni celui de quelqu’un d’autre.'),
      );
      return;
    }

    requireAuth(async () => {
      setEnvoi(true);
      try {
        const { error } = await supabase.from('fanzone_messages').insert({
          sujet_id: sujetId,
          auteur_id: user?.id,
          contenu: t,
        });
        if (error) throw error;
        setTexte('');
        await charger();
      } catch {
        showAlert(
          trUI('Message non publié'),
          trUI('Ton message n’a pas pu être publié. Vérifie ta connexion et réessaie.'),
        );
      } finally {
        setEnvoi(false);
      }
    }, { reason: trUI('Connecte-toi pour participer'), requireBillingIdentity: false });
  };

  const demanderBlocage = (m: Message) => {
    showConfirm(
      trUI('Bloquer cette personne ?'),
      trUI('Vous ne verrez plus vos messages respectifs dans la Fan zone. Elle n’en sera pas informée.'),
      [
        { text: trUI('Annuler'), style: 'cancel' },
        {
          text: trUI('Bloquer'),
          style: 'destructive',
          onPress: async () => {
            if (await bloquer(m.auteur_id)) {
              // Retiré tout de suite : attendre le rechargement donnerait
              // l'impression que le blocage n'a pas pris.
              setMessages((l) => l.filter((x) => x.auteur_id !== m.auteur_id));
            }
          },
        },
      ],
    );
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0f172a', '#1e293b', '#0f172a']} style={StyleSheet.absoluteFill} />

      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity style={styles.retour} onPress={() => router.back()}>
          <ArrowLeft size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.titre} numberOfLines={2}>{params.titre || trUI('Sujet')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {chargement ? (
          <ActivityIndicator color="#10b981" style={{ marginTop: 30 }} />
        ) : (
          <FlatList
            data={messages}
            keyExtractor={(m) => m.id}
            contentContainerStyle={{ padding: 16, paddingBottom: 20 }}
            keyboardShouldPersistTaps="handled"
            onRefresh={charger}
            refreshing={false}
            ListEmptyComponent={
              <Text style={styles.vide}>{trUI('Personne n’a encore répondu. Lance la discussion.')}</Text>
            }
            renderItem={({ item }) => {
              const estMien = item.auteur_id === user?.id;
              return (
                <View style={[styles.message, item.par_la_star && styles.messageStar]}>
                  {item.auteur_avatar ? (
                    <Image source={{ uri: item.auteur_avatar }} style={styles.avatar} />
                  ) : (
                    <View style={[styles.avatar, styles.avatarVide]}>
                      <Text style={styles.avatarTxt}>{(item.auteur_nom || '?')[0].toUpperCase()}</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <View style={styles.auteurLigne}>
                      <Text style={[styles.auteur, item.par_la_star && { color: '#f59e0b' }]} numberOfLines={1}>
                        {item.auteur_nom}
                      </Text>
                      {item.par_la_star && <Star size={11} color="#f59e0b" fill="#f59e0b" />}
                      {!item.par_la_star && verifies.has(item.auteur_id) && (
                        <View style={styles.badgeVerif}>
                          <BadgeCheck size={11} color="#10b981" />
                          <Text style={styles.badgeVerifTxt}>{trUI('A rencontré la star')}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.contenu}>{item.contenu}</Text>

                    {/* Signaler et bloquer, à portée de pouce sur chaque message.
                        Les stores l'exigent, et une fonction de sécurité cachée
                        dans un menu ne sert personne. */}
                    {!estMien && (
                      <View style={styles.actions}>
                        <TouchableOpacity
                          onPress={() => requireAuth(() => setSignale(item), {
                            reason: trUI('Connecte-toi pour signaler ce contenu'),
                            requireBillingIdentity: false,
                          })}
                          hitSlop={8}
                          style={styles.actionBtn}
                        >
                          <Flag size={13} color="#9ca3af" />
                          <Text style={styles.actionTxt}>{trUI('Signaler')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => demanderBlocage(item)} hitSlop={8} style={styles.actionBtn}>
                          <UserX size={13} color="#9ca3af" />
                          <Text style={styles.actionTxt}>{trUI('Bloquer')}</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                </View>
              );
            }}
          />
        )}

        <View style={[styles.barre, { paddingBottom: insets.bottom + 10 }]}>
          <TextInput
            style={styles.champ}
            placeholder={trUI('Écris ta réponse…')}
            placeholderTextColor="#6b7280"
            value={texte}
            onChangeText={setTexte}
            multiline
            maxLength={2000}
          />
          <TouchableOpacity
            style={[styles.envoyer, (!texte.trim() || envoi) && styles.envoyerDesactive]}
            onPress={envoyer}
            disabled={!texte.trim() || envoi}
            activeOpacity={0.8}
          >
            {envoi
              ? <ActivityIndicator size="small" color="#052e1f" />
              : <Send size={18} color={texte.trim() ? '#052e1f' : '#6b7280'} />}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      <ReportContentModal
        visible={!!signale}
        onClose={() => setSignale(null)}
        targetType="fanzone_message"
        targetId={signale?.id || null}
        targetLabel={signale?.contenu?.slice(0, 60) || null}
        reportedUserId={signale?.auteur_id || null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  header: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 10,
  },
  retour: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  titre: { color: '#fff', fontSize: 16, fontWeight: '800', flex: 1, textAlign: 'center', paddingTop: 8 },

  message: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  messageStar: {
    backgroundColor: 'rgba(245,158,11,0.07)',
    borderLeftWidth: 3, borderLeftColor: '#f59e0b',
    paddingLeft: 9, paddingVertical: 8, borderRadius: 10,
  },
  avatar: { width: 36, height: 36, borderRadius: 18 },
  avatarVide: {
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  avatarTxt: { color: '#fff', fontSize: 15, fontWeight: '800' },
  auteurLigne: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  auteur: { color: '#9ca3af', fontSize: 12.5, fontWeight: '700' },
  badgeVerif: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(16,185,129,0.14)',
    borderWidth: 1, borderColor: 'rgba(16,185,129,0.35)',
    paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6,
  },
  badgeVerifTxt: { color: '#10b981', fontSize: 10, fontWeight: '800' },
  contenu: { color: '#e5e7eb', fontSize: 14.5, lineHeight: 20, marginTop: 3 },
  actions: { flexDirection: 'row', gap: 16, marginTop: 7 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionTxt: { color: '#9ca3af', fontSize: 12 },

  vide: { color: '#6b7280', fontSize: 14, textAlign: 'center', marginTop: 40, lineHeight: 20 },

  barre: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 9,
    paddingHorizontal: 14, paddingTop: 10,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#0f172a',
  },
  champ: {
    flex: 1, maxHeight: 120, color: '#fff', fontSize: 15,
    backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 20,
    paddingHorizontal: 15, paddingVertical: 10,
  },
  envoyer: {
    width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#10b981',
  },
  envoyerDesactive: { backgroundColor: 'rgba(255,255,255,0.08)' },
});
