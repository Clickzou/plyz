import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Platform,
  Linking,
  KeyboardAvoidingView,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Send, AlertCircle } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { showAlert } from '@/utils/alertHelper';
import { useTranslation } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/utils/supabase';

const SUPPORT_EMAIL = 'jc@clickzou.fr';
const API_BASE = process.env.EXPO_PUBLIC_STRIPE_SERVER_URL || '';

export default function ReportProblemScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { user } = useAuth();
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!message.trim()) {
      showAlert(
        t('error') || 'Erreur',
        t('reportEmptyMsg' as any) || 'Veuillez décrire le problème rencontré.'
      );
      return;
    }
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    setSending(true);

    // 0) Enregistrement en base pour le dashboard admin (meilleur effort).
    try {
      await supabase.from('problem_reports').insert({
        user_id: user?.id || null,
        reporter_email: user?.email || null,
        subject: subject.trim() || null,
        message: message.trim(),
        platform: Platform.OS,
        app_version: '1.0.0',
      });
    } catch { /* non bloquant */ }

    // 1) Envoi automatique via le serveur (e-mail direct au support).
    try {
      // Contexte technique ajouté au corps du message.
      const fullDescription =
        `${message.trim()}\n\n` +
        `------------------------------\n` +
        `Compte : ${user?.email || 'non connecté'}\n` +
        `Plateforme : ${Platform.OS}\n` +
        `Version : 1.0.0`;

      const res = await fetch(`${API_BASE}/api/report-problem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // On envoie les DEUX conventions de champs pour être compatible quelle que
        // soit la version du serveur (category/description/reporter_email ou
        // subject/message/userEmail).
        body: JSON.stringify({
          category: subject.trim() || 'Signalement',
          description: fullDescription,
          reporter_email: user?.email || null,
          subject: subject.trim(),
          message: message.trim(),
          userEmail: user?.email || null,
          platform: Platform.OS,
          appVersion: '1.0.0',
        }),
      });
      // Succès = réponse JSON 2xx sans champ "error". Si le serveur renvoie du HTML
      // (endpoint absent / proxy), res.json() échoue -> on bascule sur le mailto.
      let data: any = null;
      try { data = await res.json(); } catch { /* réponse non-JSON */ }
      if (res.ok && data && !data.error) {
        setSending(false);
        showAlert(
          t('reportSentTitle' as any) || 'Message envoyé',
          t('reportSentMsg' as any) || 'Merci ! Votre signalement a bien été transmis à notre équipe.'
        );
        router.back();
        return;
      }
      // 503 = SMTP non configuré côté serveur, ou autre erreur -> on bascule sur le mailto.
    } catch {
      // Réseau indisponible -> on bascule sur le mailto de secours.
    }

    // 2) Repli : ouverture de l'app e-mail pré-remplie (si le serveur n'a pas pu envoyer).
    setSending(false);
    const subjectLine = subject.trim()
      ? `[Plyz] ${subject.trim()}`
      : '[Plyz] Signalement d\'un problème';
    const body =
      `${message.trim()}\n\n` +
      `------------------------------\n` +
      `Envoyé depuis l'application Plyz\n` +
      `Compte : ${user?.email || 'non connecté'}\n` +
      `Plateforme : ${Platform.OS}\n` +
      `Version : 1.0.0`;
    const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subjectLine)}&body=${encodeURIComponent(body)}`;

    try {
      if (Platform.OS === 'web') {
        window.location.href = url;
      } else {
        const supported = await Linking.canOpenURL(url);
        if (!supported) {
          showAlert(
            t('reportNoMailTitle' as any) || 'Aucune messagerie',
            (t('reportNoMailMsg' as any) ||
              'Aucune application e-mail n\'est configurée. Écrivez-nous directement à') + ` ${SUPPORT_EMAIL}`
          );
          return;
        }
        await Linking.openURL(url);
      }
      router.back();
    } catch (e) {
      showAlert(
        t('error') || 'Erreur',
        (t('reportSendError' as any) || 'Impossible d\'ouvrir la messagerie. Contactez-nous à') + ` ${SUPPORT_EMAIL}`
      );
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.container}>
        <LinearGradient colors={['#0f172a', '#1e293b', '#0f172a']} style={StyleSheet.absoluteFill} />

        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
            <ArrowLeft size={24} color="#ffffff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('reportProblem' as any) || 'Signaler un problème'}</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.intro}>
            <AlertCircle size={24} color="#f59e0b" />
            <Text style={styles.introText}>
              {t('reportIntro' as any) ||
                'Décrivez le problème rencontré, nous vous répondrons par e-mail. Soyez précis (écran concerné, ce qui se passe…).'}
            </Text>
          </View>

          <Text style={styles.label}>{t('reportSubjectLabel' as any) || 'Sujet (facultatif)'}</Text>
          <TextInput
            style={styles.input}
            value={subject}
            onChangeText={setSubject}
            placeholder={t('reportSubjectPlaceholder' as any) || 'Ex : Bug à la création d\'événement'}
            placeholderTextColor="rgba(255,255,255,0.35)"
          />

          <Text style={styles.label}>{t('reportMessageLabel' as any) || 'Votre message'}</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={message}
            onChangeText={setMessage}
            placeholder={t('reportMessagePlaceholder' as any) || 'Décrivez le problème ici…'}
            placeholderTextColor="rgba(255,255,255,0.35)"
            multiline
            textAlignVertical="top"
          />

          <TouchableOpacity
            style={[styles.sendBtn, sending && { opacity: 0.6 }]}
            onPress={handleSend}
            activeOpacity={0.85}
            disabled={sending}
          >
            {sending ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <>
                <Send size={20} color="#ffffff" strokeWidth={2.2} />
                <Text style={styles.sendBtnText}>{t('reportSendBtn' as any) || 'Envoyer'}</Text>
              </>
            )}
          </TouchableOpacity>

          <Text style={styles.footerNote}>
            {t('reportFooter' as any) || 'Votre message sera envoyé à'} {SUPPORT_EMAIL}
          </Text>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
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
    backgroundColor: 'rgba(245,158,11,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.25)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 22,
  },
  introText: { flex: 1, color: 'rgba(255,255,255,0.8)', fontSize: 14, lineHeight: 20 },
  label: { color: '#ffffff', fontSize: 14, fontWeight: '600', marginBottom: 8 },
  input: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#ffffff',
    fontSize: 15,
    marginBottom: 18,
  },
  textArea: { minHeight: 140 },
  sendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#10b981',
    borderRadius: 14,
    paddingVertical: 16,
    marginTop: 4,
  },
  sendBtnText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  footerNote: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 16,
  },
});
