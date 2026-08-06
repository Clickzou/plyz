import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, Platform, Linking, AppState,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BellRing, Video, CalendarClock, Users, X } from 'lucide-react-native';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAutoTranslate } from '@/utils/translation';
import { registerPushTokenWithServer } from '@/utils/notifications';

// expo-notifications n'existe pas sur le web : même chargement paresseux que
// partout ailleurs dans l'app.
let Notifications: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Notifications = require('expo-notifications');
} catch {
  Notifications = null;
}

// POURQUOI CET ÉCRAN EXISTE
//
// La boîte de dialogue d'Android et d'iOS n'est PAS personnalisable : texte
// imposé, et surtout UNE SEULE CHANCE — un refus est définitif, le système ne
// la repropose plus jamais. Une personne qui la voit surgir sans contexte
// refuse par réflexe, et perd alors DÉFINITIVEMENT toute notification :
// créneau accepté, événement qui commence, son tour dans la file.
//
// C'est exactement ce qui s'est produit en test : la demande d'appel a été
// acceptée, la notification écrite, marquée envoyée — et jamais reçue, faute
// de jeton. On explique donc AVANT, avec nos mots, et on ne déclenche la boîte
// système que devant quelqu'un qui a déjà dit oui.

const REPORTE_LE = '@plyz_notifs_reporte_le';
const DELAI_RAPPEL_MS = 3 * 24 * 60 * 60 * 1000; // 3 jours

export default function NotificationsGate() {
  const { user, session } = useAuth();
  const { t } = useLanguage();
  const tr = useAutoTranslate([
    'Active les notifications',
    'Sans elles, tu ne sauras rien.',
    "Quand une personnalité accepte ton appel vidéo, tu as 48 h pour régler — passé ce délai, le créneau est perdu.",
    "Quand ton événement commence, personne ne te préviendra.",
    "Quand c'est ton tour dans la file, tu le manqueras.",
    'Activer les notifications',
    'Ouvrir les réglages',
    'Plus tard',
    "Tu as refusé les notifications par le passé. Android ne peut plus te les redemander : il faut les réactiver dans les réglages du téléphone.",
  ]);

  const [visible, setVisible] = useState(false);
  // Vrai quand le système ne veut plus poser la question : on ne peut alors
  // qu'envoyer la personne dans les réglages de son téléphone.
  const [reglagesSeuls, setReglagesSeuls] = useState(false);

  const verifier = async () => {
    if (Platform.OS === 'web' || !Notifications || !user?.id) return;
    try {
      const perm = await Notifications.getPermissionsAsync();
      if (perm?.status === 'granted') { setVisible(false); return; }

      // Reporté récemment : on n'insiste pas à chaque ouverture.
      const reporte = await AsyncStorage.getItem(REPORTE_LE);
      if (reporte && Date.now() - Number(reporte) < DELAI_RAPPEL_MS) return;

      setReglagesSeuls(perm?.canAskAgain === false);
      setVisible(true);
    } catch {
      /* pas bloquant : au pire l'écran ne s'affiche pas */
    }
  };

  useEffect(() => {
    verifier();
    // Au retour d'arrière-plan : la personne revient peut-être des réglages,
    // où elle vient d'accorder la permission. L'écran doit alors disparaître.
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') verifier();
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const activer = async () => {
    if (reglagesSeuls) {
      setVisible(false);
      try { await Linking.openSettings(); } catch { /* rien à faire de plus */ }
      return;
    }
    try {
      const r = await Notifications.requestPermissionsAsync();
      if (r?.status === 'granted') {
        setVisible(false);
        // Le jeton est enregistré tout de suite : sans lui, l'autorisation ne
        // sert à rien côté serveur, qui n'a personne à qui écrire.
        await registerPushTokenWithServer(session?.access_token);
        return;
      }
      // Refus : le système ne reposera plus la question, on bascule sur les
      // réglages plutôt que de laisser un bouton qui ne fait plus rien.
      setReglagesSeuls(true);
    } catch {
      setVisible(false);
    }
  };

  const plusTard = async () => {
    setVisible(false);
    try { await AsyncStorage.setItem(REPORTE_LE, String(Date.now())); } catch { /* pas bloquant */ }
  };

  if (!visible) return null;

  const ligne = (icone: React.ReactNode, texte: string) => (
    <View style={styles.ligne}>
      <View style={styles.ligneIcone}>{icone}</View>
      <Text style={styles.ligneTexte}>{texte}</Text>
    </View>
  );

  return (
    <Modal visible transparent animationType="fade" onRequestClose={plusTard}>
      <View style={styles.fond}>
        <View style={styles.carte}>
          <TouchableOpacity style={styles.fermer} onPress={plusTard} hitSlop={12}>
            <X size={20} color="rgba(255,255,255,0.4)" />
          </TouchableOpacity>

          <View style={styles.cloche}>
            <BellRing size={30} color="#ef4444" strokeWidth={2.2} />
          </View>

          <Text style={styles.titre}>
            {t('notifGateTitle' as any) || tr('Active les notifications')}
          </Text>
          <Text style={styles.alerte}>
            {t('notifGateWarning' as any) || tr('Sans elles, tu ne sauras rien.')}
          </Text>

          <View style={styles.lignes}>
            {ligne(
              <Video size={18} color="#a5b4fc" strokeWidth={2} />,
              t('notifGateVideo' as any)
                || tr("Quand une personnalité accepte ton appel vidéo, tu as 48 h pour régler — passé ce délai, le créneau est perdu."),
            )}
            {ligne(
              <CalendarClock size={18} color="#fbbf24" strokeWidth={2} />,
              t('notifGateEvent' as any) || tr("Quand ton événement commence, personne ne te préviendra."),
            )}
            {ligne(
              <Users size={18} color="#34d399" strokeWidth={2} />,
              t('notifGateQueue' as any) || tr("Quand c'est ton tour dans la file, tu le manqueras."),
            )}
          </View>

          {reglagesSeuls && (
            <Text style={styles.reglagesNote}>
              {t('notifGateSettingsNote' as any)
                || tr("Tu as refusé les notifications par le passé. Android ne peut plus te les redemander : il faut les réactiver dans les réglages du téléphone.")}
            </Text>
          )}

          <TouchableOpacity style={styles.bouton} onPress={activer} activeOpacity={0.85}>
            <BellRing size={18} color="#ffffff" strokeWidth={2.4} />
            <Text style={styles.boutonTexte}>
              {reglagesSeuls
                ? (t('notifGateOpenSettings' as any) || tr('Ouvrir les réglages'))
                : (t('notifGateEnable' as any) || tr('Activer les notifications'))}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={plusTard} activeOpacity={0.7}>
            <Text style={styles.plusTard}>{t('notifGateLater' as any) || tr('Plus tard')}</Text>
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
    backgroundColor: '#111827', borderWidth: 1, borderColor: 'rgba(239,68,68,0.35)',
  },
  fermer: { position: 'absolute', top: 12, right: 12, padding: 4, zIndex: 2 },
  cloche: {
    alignSelf: 'center', width: 60, height: 60, borderRadius: 30,
    backgroundColor: 'rgba(239,68,68,0.14)', borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.4)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
  },
  titre: {
    color: '#ffffff', fontSize: 21, fontWeight: '800',
    textAlign: 'center', marginBottom: 8,
  },
  // Rouge et gras : c'est la phrase qui doit rester si on ne lit qu'une ligne.
  alerte: {
    color: '#ef4444', fontSize: 16, fontWeight: '800',
    textAlign: 'center', marginBottom: 18,
  },
  lignes: { gap: 12, marginBottom: 18 },
  ligne: { flexDirection: 'row', gap: 11, alignItems: 'flex-start' },
  ligneIcone: { width: 22, alignItems: 'center', marginTop: 1 },
  ligneTexte: {
    flex: 1, color: 'rgba(255,255,255,0.82)', fontSize: 14, lineHeight: 20,
  },
  reglagesNote: {
    color: '#fbbf24', fontSize: 13, lineHeight: 19,
    marginBottom: 16, textAlign: 'center', fontWeight: '600',
  },
  bouton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9,
    backgroundColor: '#10b981', borderRadius: 14, paddingVertical: 16,
  },
  boutonTexte: { color: '#ffffff', fontSize: 16, fontWeight: '800' },
  plusTard: {
    color: 'rgba(255,255,255,0.45)', fontSize: 14, fontWeight: '600',
    textAlign: 'center', marginTop: 14,
  },
});
