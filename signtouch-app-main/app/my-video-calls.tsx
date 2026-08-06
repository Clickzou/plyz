import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, RefreshControl, Linking, Platform,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { ArrowLeft, Video, Clock, Check, X, CreditCard, AlertCircle, CalendarDays } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getDateLocale } from '@/utils/dateLocale';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAutoTranslate } from '@/utils/translation';
import { authedFetch } from '@/utils/authedFetch';
import { showAlert, showConfirm } from '@/utils/alertHelper';
import { rafraichirBadgeAppelsVideo } from '@/utils/videoCallBadge';
import BottomNav from '@/components/BottomNav';
import DateHeurePicker from '@/components/DateHeurePicker';
import ChampCodePromo, { PromoApplique } from '@/components/ChampCodePromo';

const API_BASE = process.env.EXPO_PUBLIC_STRIPE_SERVER_URL || '';

interface Demande {
  id: string;
  role: 'fan' | 'celebrity';
  status: string;
  fan_message: string | null;
  scheduled_at: string | null;
  expires_at: string | null;
  price_cents: number | null;
  currency: string | null;
  duration_minutes: number | null;
  cancelled_by: string | null;
  fan_name: string;
  celebrity_name: string;
}

export default function MyVideoCallsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const [demandes, setDemandes] = useState<Demande[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [creneau, setCreneau] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  // Demande dont on est en train de choisir le creneau (null = ferme).
  const [pickerPour, setPickerPour] = useState<string | null>(null);
  // Code promo par demande. Le montant reellement preleve est recalcule par le
  // SERVEUR a partir du code : l'app n'affiche qu'un apercu et ne transmet
  // jamais de montant.
  const [promoParDemande, setPromoParDemande] = useState<Record<string, PromoApplique>>({});

  // Le message du fan est écrit dans SA langue. La personnalité doit pouvoir le
  // lire dans la sienne — la traduction doit marcher dans les deux sens, pas
  // seulement de la personnalité vers le fan.
  const trMessages = useAutoTranslate(demandes.map(d => d.fan_message));

  const charger = useCallback(async () => {
    try {
      const res = await authedFetch(`${API_BASE}/api/video-call-requests`);
      // Un refus du serveur (session expirée, panne) renvoie un JSON valide :
      // sans ce contrôle, il était lu comme « zéro demande » et l'écran affichait
      // une liste vide rassurante alors que rien n'avait pu être chargé.
      if (!res.ok) throw new Error('http_' + res.status);
      const data = await res.json();
      setDemandes(Array.isArray(data.requests) ? data.requests : []);
      setFailed(false);
    } catch {
      // On distingue « aucune demande » de « le chargement a échoué » : afficher
      // une liste vide sur une panne réseau ferait croire que tout a disparu.
      setFailed(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { charger(); }, [charger]));

  const agir = async (id: string, action: string, body?: any) => {
    setBusy(id);
    try {
      const res = await authedFetch(`${API_BASE}/api/video-call-requests/${id}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const raisons: Record<string, string> = {
          date_in_past: t('vcrDatePast' as any) || 'Choisis une date à venir.',
          invalid_date: t('vcrDateInvalid' as any) || 'Format attendu : AAAA-MM-JJTHH:MM',
          too_late_to_cancel: t('vcrTooLate' as any)
            || "L'annulation gratuite n'est plus possible : il reste moins de 24 h avant le créneau.",
          celebrity_cannot_receive_payments: t('vcrCelebNoStripe' as any)
            || "La personnalité ne peut pas encore encaisser de paiement.",
          // Deux cas où l'écran affiché n'est plus à jour : mieux vaut le dire
          // et recharger que laisser croire à une panne.
          slot_passed: t('vcrSlotPassed' as any)
            || "Le créneau est passé : il n'est plus possible de régler. Tu n'as pas été débité.",
          already_closed: t('vcrAlreadyClosed' as any)
            || "Cette demande est déjà close. Tire vers le bas pour rafraîchir.",
          not_pending: t('vcrAlreadyClosed' as any)
            || "Cette demande n'est plus en attente. Tire vers le bas pour rafraîchir.",
        };
        showAlert(t('error') || 'Erreur', raisons[data?.error] || (t('actionFailed') || 'Action impossible.'));
        // Quand le refus vient d'un état périmé à l'écran, on remet la liste à
        // jour tout de suite : sinon le bouton reste là et l'erreur se répète.
        if (data?.error === 'already_closed' || data?.error === 'not_pending' || data?.error === 'slot_passed') await charger();
        return null;
      }
      await charger();
      // La pastille de l'onglet Événements doit suivre immédiatement :
      // accepter ou payer fait changer sa couleur, et l'utilisateur revient
      // souvent en arrière juste après pour vérifier que c'est bien pris.
      rafraichirBadgeAppelsVideo();
      return data;
    } catch {
      showAlert(t('error') || 'Erreur', t('actionFailed') || 'Action impossible.');
      return null;
    } finally {
      setBusy(null);
    }
  };

  const payer = async (id: string) => {
    const data = await agir(id, 'checkout', promoParDemande[id] ? { promo_id: promoParDemande[id].promoId } : undefined);
    // Offert par un code promo : rien a payer, la demande est deja confirmee.
    if (data?.gratuit) {
      showAlert(
        t('success') || "C'est confirmé",
        t('vcrFreeByPromo' as any)
          || "Code promo appliqué : cet appel est offert. Rendez-vous à l'heure prévue.",
      );
      return;
    }
    if (data?.url) {
      // Le paiement s'ouvre dans le navigateur ; au retour, on confirme auprès
      // du serveur, qui VÉRIFIE l'autorisation auprès de Stripe.
      await Linking.openURL(data.url);
      showAlert(
        t('vcrPayOpenedTitle' as any) || 'Paiement ouvert',
        t('vcrPayOpenedMsg' as any)
          || 'Une fois le paiement validé, reviens ici et tire vers le bas pour rafraîchir.',
      );
    }
  };

  // La saisie est validée AVANT l'appel : « new Date(saisie).toISOString() »
  // lève une exception sur une date vide ou mal tapée, et cette exception se
  // produisait hors de tout filet — la personnalité appuyait sur Accepter et
  // il ne se passait rien, sans le moindre message.
  const proposerCreneau = (id: string) => {
    const saisie = (creneau[id] || '').trim();
    const quand = new Date(saisie);
    if (!saisie || Number.isNaN(quand.getTime())) {
      showAlert(t('error') || 'Erreur',
        t('vcrPickSlotFirst' as any) || 'Choisis d\'abord une date et une heure.');
      return;
    }
    if (quand.getTime() < Date.now()) {
      showAlert(t('error') || 'Erreur',
        t('vcrDatePast' as any) || 'Choisis une date à venir.');
      return;
    }
    // Sans suffixe de fuseau, la saisie est lue dans le fuseau de l'appareil,
    // puis convertie en UTC pour la base. Chacun relit ensuite dans le sien.
    agir(id, 'accept', { scheduled_at: quand.toISOString() });
  };

  const dateLocale = (iso: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso);
    // timestamptz : la date est stockée en UTC et affichée dans le fuseau de
    // l'appareil. Le fan et la personnalité peuvent être dans des fuseaux
    // différents — chacun lit donc SON heure locale.
    return d.toLocaleDateString(getDateLocale(), { weekday: 'short', day: 'numeric', month: 'long' })
      + ' — ' + d.toLocaleTimeString(getDateLocale(), { hour: '2-digit', minute: '2-digit' });
  };

  // L'heure du rendez-vous est-elle derrière nous ? Le balayage serveur passe
  // ces demandes en « expiré », mais il tourne toutes les 60 secondes : l'écran
  // ne doit pas attendre son passage pour cesser de proposer le paiement.
  const creneauPasse = (d: Demande) =>
    !!d.scheduled_at && new Date(d.scheduled_at).getTime() < Date.now();

  const libelle = (s: string): { texte: string; couleur: string } => {
    const m: Record<string, { texte: string; couleur: string }> = {
      pending: { texte: t('vcrStatusPending' as any) || 'En attente de réponse', couleur: '#f59e0b' },
      accepted: { texte: t('vcrStatusAccepted' as any) || 'Créneau proposé — à régler', couleur: '#6366f1' },
      paid: { texte: t('vcrStatusPaid' as any) || 'Confirmé et pré-payé', couleur: '#10b981' },
      refused: { texte: t('vcrStatusRefused' as any) || 'Refusé', couleur: '#6b7280' },
      expired: { texte: t('vcrStatusExpired' as any) || 'Expiré', couleur: '#6b7280' },
      cancelled: { texte: t('vcrStatusCancelled' as any) || 'Annulé', couleur: '#6b7280' },
      completed: { texte: t('vcrStatusCompleted' as any) || 'Terminé', couleur: '#10b981' },
    };
    return m[s] || { texte: s, couleur: '#6b7280' };
  };

  const prix = (d: Demande) =>
    d.price_cents ? (d.price_cents / 100).toFixed(2).replace('.', ',') + ' €' : '—';

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <ArrowLeft size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('vcrMyCalls' as any) || 'Mes appels vidéo'}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 90 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); charger(); }} tintColor="#10b981" />}
      >
        {loading ? (
          <ActivityIndicator color="#10b981" style={{ marginTop: 40 }} />
        ) : failed ? (
          <View style={styles.empty}>
            <AlertCircle size={40} color="#374151" />
            <Text style={styles.emptyText}>{t('feedLoadFailed' as any) || 'Impossible de charger'}</Text>
            <TouchableOpacity style={styles.retry} onPress={() => { setLoading(true); charger(); }}>
              <Text style={styles.retryText}>{t('retry') || 'Réessayer'}</Text>
            </TouchableOpacity>
          </View>
        ) : demandes.length === 0 ? (
          <View style={styles.empty}>
            <Video size={40} color="#374151" />
            <Text style={styles.emptyText}>{t('vcrNone' as any) || 'Aucune demande pour le moment'}</Text>
          </View>
        ) : (
          demandes.map((d, i) => {
            // Un créneau dépassé n'est plus « à régler » : l'annoncer ainsi
            // envoie vers un paiement qui n'existe plus. En ROUGE, et la carte
            // entière bordée : des deux côtés, il faut voir d'un coup d'œil que
            // le rendez-vous est manqué — la personnalité ne voyait, elle, qu'un
            // lien « Annuler » sous un créneau à première vue encore valable.
            const manque = d.status === 'accepted' && creneauPasse(d);
            const st = manque
              ? { texte: t('vcrStatusSlotPassed' as any) || 'Créneau dépassé — non payé', couleur: '#ef4444' }
              : libelle(d.status);
            const estCeleb = d.role === 'celebrity';
            return (
              <View key={d.id} style={[styles.card, manque && styles.cardManquee]}>
                <View style={styles.cardTop}>
                  <Text style={styles.cardName}>
                    {estCeleb ? d.fan_name : d.celebrity_name}
                  </Text>
                  <View style={[styles.badge, { backgroundColor: st.couleur + '22', borderColor: st.couleur }]}>
                    <Text style={[styles.badgeText, { color: st.couleur }]}>{st.texte}</Text>
                  </View>
                </View>

                {!!d.fan_message && (
                  <Text style={styles.message}>« {trMessages(d.fan_message)} »</Text>
                )}

                {!!d.scheduled_at && (
                  <View style={styles.row}>
                    <Clock size={15} color="#9ca3af" />
                    <Text style={styles.rowText}>{dateLocale(d.scheduled_at)}</Text>
                  </View>
                )}
                {!!d.price_cents && (
                  <View style={styles.row}>
                    <CreditCard size={15} color="#10b981" />
                    <Text style={[styles.rowText, { color: '#10b981', fontWeight: '700' }]}>
                      {prix(d)} · {d.duration_minutes || 10} min
                    </Text>
                  </View>
                )}

                {/* Côté personnalité, demande en attente : proposer un créneau */}
                {estCeleb && d.status === 'pending' && (
                  <View style={{ marginTop: 12 }}>
                    <Text style={styles.label}>
                      {t('vcrProposeSlot' as any) || 'Propose une date et une heure'}
                    </Text>
                    {/* Un calendrier, pas une saisie au format strict : taper
                        « 2026-08-20T18:30 » sans faute sur un clavier de
                        téléphone était le vrai obstacle à la réponse. */}
                    <TouchableOpacity
                      style={styles.choixCreneau}
                      onPress={() => setPickerPour(d.id)}
                      activeOpacity={0.8}
                    >
                      <CalendarDays size={18} color="#a5b4fc" />
                      <Text style={[styles.choixCreneauTexte, !creneau[d.id] && { color: '#6b7280' }]}>
                        {creneau[d.id]
                          ? dateLocale(creneau[d.id])
                          : (t('vcrPickSlot' as any) || 'Choisir une date et une heure')}
                      </Text>
                    </TouchableOpacity>
                    <Text style={styles.hint}>
                      {t('vcrSlotHintTz' as any)
                        || "L'heure est celle de TON fuseau horaire. Le fan la verra dans le sien."}
                    </Text>
                    <View style={styles.actions}>
                      <TouchableOpacity
                        style={[styles.btn, styles.btnAccept, busy === d.id && styles.btnBusy]}
                        disabled={busy === d.id}
                        onPress={() => proposerCreneau(d.id)}
                      >
                        <Check size={16} color="#fff" />
                        <Text style={styles.btnText}>{t('accept') || 'Accepter'}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.btn, styles.btnRefuse, busy === d.id && styles.btnBusy]}
                        disabled={busy === d.id}
                        onPress={() => showConfirm(
                          t('vcrRefuseTitle' as any) || 'Refuser cette demande ?',
                          t('vcrRefuseMsg' as any) || 'Le fan en sera informé.',
                          [
                            { text: t('cancel') || 'Annuler', style: 'cancel' },
                            { text: t('decline') || 'Refuser', style: 'destructive', onPress: () => agir(d.id, 'refuse') },
                          ],
                        )}
                      >
                        <X size={16} color="#fff" />
                        <Text style={styles.btnText}>{t('decline') || 'Refuser'}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {/* Côté fan, créneau proposé : régler pour confirmer — sauf si
                    l'heure du rendez-vous est déjà passée. Le bouton restait
                    actif après le créneau : on pouvait payer un appel qui
                    n'aurait jamais lieu. Le serveur refuse désormais aussi, mais
                    un bouton qui ne doit plus servir ne doit plus s'afficher. */}
                {/* Code promo cote fan : c'est lui qui paie. Le SERVEUR seul
                    decide de la gratuite — l'app ne transmet qu'un
                    identifiant, jamais un montant. */}
                {!estCeleb && d.status === 'accepted' && !manque && (
                  <View style={{ marginTop: 12 }}>
                    <ChampCodePromo
                      type="live_video"
                      cibleId={d.id}
                      prixCents={d.price_cents || 0}
                      applique={promoParDemande[d.id] || null}
                      onApplique={(promo) => setPromoParDemande((p) => ({ ...p, [d.id]: promo }))}
                      onRetire={() => setPromoParDemande((p) => {
                        const suite = { ...p }; delete suite[d.id]; return suite;
                      })}
                    />
                  </View>
                )}

                {!estCeleb && d.status === 'accepted' && !manque && (
                  <TouchableOpacity
                    style={[styles.btnFull, busy === d.id && styles.btnBusy]}
                    disabled={busy === d.id}
                    onPress={() => payer(d.id)}
                  >
                    <CreditCard size={17} color="#fff" />
                    <Text style={styles.btnText}>
                      {(t('vcrPayNow' as any) || 'Confirmer et régler {price}').replace(
                        '{price}',
                        promoParDemande[d.id]
                          ? (promoParDemande[d.id].prixRemiseCents / 100).toFixed(2).replace('.', ',') + ' €'
                          : prix(d),
                      )}
                    </Text>
                  </TouchableOpacity>
                )}

                {manque && (
                  <Text style={styles.creneauManque}>
                    {estCeleb
                      ? (t('vcrSlotMissedCeleb' as any)
                        || "Le créneau est passé sans règlement. Propose-en un autre si le fan te relance.")
                      : (t('vcrSlotMissedFan' as any)
                        || "Le créneau est passé : il n'est plus possible de régler. Tu n'as pas été débité — refais une demande pour un autre horaire.")}
                  </Text>
                )}

                {/* Annulation : possible des deux côtés tant que ce n'est pas clos */}
                {['pending', 'accepted', 'paid'].includes(d.status) && (
                  <TouchableOpacity
                    style={{ marginTop: 10, alignSelf: 'flex-start' }}
                    disabled={busy === d.id}
                    onPress={() => showConfirm(
                      t('vcrCancelTitle' as any) || 'Annuler cet appel ?',
                      d.status === 'paid'
                        ? (t('vcrCancelPaidMsg' as any) || "L'autorisation est libérée : rien ne sera prélevé.")
                        : (t('vcrCancelMsg' as any) || "L'autre partie en sera informée."),
                      [
                        { text: t('back' as any) || 'Retour', style: 'cancel' },
                        { text: t('vcrCancelYes' as any) || 'Annuler l\'appel', style: 'destructive', onPress: () => agir(d.id, 'cancel') },
                      ],
                    )}
                  >
                    <Text style={styles.cancelLink}>{t('vcrCancel' as any) || 'Annuler'}</Text>
                  </TouchableOpacity>
                )}

                {d.status === 'cancelled' && !!d.cancelled_by && (
                  <Text style={styles.hint}>
                    {d.cancelled_by === 'fan'
                      ? (t('vcrCancelledByFan' as any) || 'Annulé par le fan.')
                      : (t('vcrCancelledByCeleb' as any) || 'Annulé par la personnalité. Aucun prélèvement.')}
                  </Text>
                )}
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Choix du creneau : un calendrier, ouvert depuis la demande concernee. */}
      <DateHeurePicker
        visible={pickerPour !== null}
        onClose={() => setPickerPour(null)}
        titre={t('vcrProposeSlot' as any) || 'Propose une date et une heure'}
        valeurInitiale={pickerPour && creneau[pickerPour] ? new Date(creneau[pickerPour]) : null}
        onValider={(d) => {
          if (pickerPour) setCreneau(p => ({ ...p, [pickerPour]: d.toISOString() }));
        }}
      />

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
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  empty: { alignItems: 'center', marginTop: 60, gap: 12 },
  emptyText: { color: '#6b7280', fontSize: 15 },
  retry: {
    marginTop: 8, paddingHorizontal: 22, paddingVertical: 11, borderRadius: 22,
    backgroundColor: 'rgba(16,185,129,0.15)', borderWidth: 1, borderColor: 'rgba(16,185,129,0.4)',
  },
  retryText: { color: '#10b981', fontSize: 14, fontWeight: '700' },
  card: {
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 16, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
  },
  // Rendez-vous manqué : bordure rouge franche, pour que la carte se distingue
  // avant même d'être lue.
  cardManquee: {
    borderColor: '#ef4444', borderWidth: 1.5,
    backgroundColor: 'rgba(239,68,68,0.06)',
  },
  creneauManque: {
    color: '#fca5a5', fontSize: 13, lineHeight: 19, marginTop: 12, fontWeight: '600',
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  cardName: { color: '#fff', fontSize: 16, fontWeight: '700', flex: 1 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  message: { color: '#d1d5db', fontSize: 14, fontStyle: 'italic', marginTop: 10, lineHeight: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  rowText: { color: '#9ca3af', fontSize: 14 },
  label: { color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: '600', marginBottom: 6 },
  input: {
    backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, paddingHorizontal: 14,
    paddingVertical: 11, color: '#fff', fontSize: 15,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  hint: { color: '#6b7280', fontSize: 12, marginTop: 6, lineHeight: 17 },
  choixCreneau: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(99,102,241,0.12)', borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.4)', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 14,
  },
  choixCreneauTexte: { color: '#fff', fontSize: 15, fontWeight: '600', flex: 1 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  btn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 7, paddingVertical: 12, borderRadius: 12,
  },
  btnFull: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, borderRadius: 12, marginTop: 12, backgroundColor: '#6366f1',
  },
  btnAccept: { backgroundColor: '#10b981' },
  btnRefuse: { backgroundColor: 'rgba(239,68,68,0.85)' },
  btnBusy: { opacity: 0.5 },
  btnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  cancelLink: { color: '#ef4444', fontSize: 13, textDecorationLine: 'underline' },
});
