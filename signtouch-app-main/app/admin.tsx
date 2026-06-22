import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft, Users, Euro, BadgeCheck, Search, Ban, ShieldAlert,
  Clock, CheckCircle2, XCircle, RefreshCw, Megaphone, Calendar, Video,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { showAlert, showConfirm } from '@/utils/alertHelper';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/utils/supabase';

const ADMIN_EMAIL = 'jc@clickzou.fr';

type TabKey = 'overview' | 'verifs' | 'revenue' | 'search' | 'reports';

const euro = (cents: number | null | undefined) =>
  `${((cents || 0) / 100).toFixed(2).replace('.', ',')} €`;

const fmtDate = (d?: string) => {
  if (!d) return '';
  try { return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
  catch { return d; }
};

export default function AdminScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const isAdmin = (user?.email || '').toLowerCase() === ADMIN_EMAIL;

  const [tab, setTab] = useState<TabKey>('overview');
  const [loading, setLoading] = useState(false);
  const [overview, setOverview] = useState<any>(null);
  const [verifs, setVerifs] = useState<any[]>([]);
  const [verifFilter, setVerifFilter] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [revenue, setRevenue] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [lowRatings, setLowRatings] = useState<any[]>([]);
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  const loadOverview = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_get_overview');
    if (!error) setOverview(data);
  }, []);

  const loadVerifs = useCallback(async (status: string) => {
    setLoading(true);
    const { data, error } = await supabase.rpc('admin_list_verifications', { p_status: status });
    if (!error) setVerifs(data || []);
    setLoading(false);
  }, []);

  const loadRevenue = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('admin_revenue_by_celebrity');
    if (!error) setRevenue(data || []);
    setLoading(false);
  }, []);

  const loadReports = useCallback(async () => {
    setLoading(true);
    const [rep, low] = await Promise.all([
      supabase.rpc('admin_list_reports'),
      supabase.rpc('admin_list_low_ratings'),
    ]);
    if (!rep.error) setReports(rep.data || []);
    if (!low.error) setLowRatings(low.data || []);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (isAdmin) loadOverview();
    }, [isAdmin, loadOverview])
  );

  const switchTab = (t: TabKey) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTab(t);
    if (t === 'verifs') loadVerifs(verifFilter);
    if (t === 'revenue') loadRevenue();
    if (t === 'reports') loadReports();
  };

  const runSearch = async () => {
    if (!searchQ.trim()) return;
    setSearching(true);
    const { data, error } = await supabase.rpc('admin_search_people', { q: searchQ.trim() });
    if (!error) setSearchResults(data || []);
    else showAlert('Erreur', error.message);
    setSearching(false);
  };

  const handleBan = (target: any) => {
    showConfirm(
      `Bannir ${target.name || target.email || 'ce compte'} ?`,
      'Choisis la durée du bannissement.',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: '30 jours', onPress: () => doBan(target, 30) },
        { text: 'À vie', style: 'destructive', onPress: () => doBan(target, null) },
      ]
    );
  };

  const doBan = async (target: any, days: number | null) => {
    const { error } = await supabase.rpc('admin_ban_user', {
      p_user_id: target.user_id,
      p_days: days,
      p_reason: 'Banni depuis le dashboard admin',
    });
    if (error) { showAlert('Erreur', error.message); return; }
    showAlert('Banni', days ? `Compte banni ${days} jours.` : 'Compte banni à vie.');
    runSearch();
  };

  const handleUnban = async (target: any) => {
    const { error } = await supabase.rpc('admin_unban_user', { p_user_id: target.user_id });
    if (error) { showAlert('Erreur', error.message); return; }
    showAlert('Débanni', 'Le bannissement a été levé.');
    runSearch();
  };

  const handleVerifAction = (item: any, status: 'approved' | 'rejected') => {
    if (status === 'approved') {
      doVerif(item, 'approved', 'Approuvé depuis le dashboard');
    } else {
      // Refus : on demande une raison simple via confirm (V1)
      showConfirm(
        'Refuser cette demande ?',
        'La raison sera enregistrée et visible dans l\'historique.',
        [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Refuser (non vérifiable)', style: 'destructive', onPress: () => doVerif(item, 'rejected', 'Profil non vérifiable') },
          { text: 'Refuser (preuves insuffisantes)', style: 'destructive', onPress: () => doVerif(item, 'rejected', 'Preuves insuffisantes') },
        ]
      );
    }
  };

  const doVerif = async (item: any, status: string, notes: string) => {
    const { error } = await supabase.rpc('admin_set_verification', {
      p_kind: item.kind, p_request_id: item.request_id, p_status: status, p_notes: notes,
    });
    if (error) { showAlert('Erreur', error.message); return; }
    loadVerifs(verifFilter);
    loadOverview();
  };

  // ---- Garde d'accès ----
  if (!isAdmin) {
    return (
      <View style={styles.container}>
        <LinearGradient colors={['#0f172a', '#1e293b', '#0f172a']} style={StyleSheet.absoluteFill} />
        <View style={[styles.center, { paddingTop: insets.top + 80, paddingHorizontal: 32 }]}>
          <ShieldAlert size={56} color="#ef4444" />
          <Text style={styles.deniedTitle}>Accès réservé</Text>
          <Text style={styles.deniedText}>Cette page est réservée à l'administrateur de Plyz.</Text>
          <TouchableOpacity style={styles.backBtnWide} onPress={() => router.back()}>
            <Text style={styles.backBtnWideText}>Retour</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const TABS: { key: TabKey; label: string; icon: any }[] = [
    { key: 'overview', label: 'Vue d\'ensemble', icon: Users },
    { key: 'verifs', label: 'Vérifications', icon: BadgeCheck },
    { key: 'revenue', label: 'Revenus', icon: Euro },
    { key: 'search', label: 'Recherche', icon: Search },
    { key: 'reports', label: 'Signalements', icon: Megaphone },
  ];

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0f172a', '#1e293b', '#0f172a']} style={StyleSheet.absoluteFill} />

      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <ArrowLeft size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Administration</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => { loadOverview(); switchTab(tab); }}>
          <RefreshCw size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar} contentContainerStyle={styles.tabBarContent}>
        {TABS.map((tb) => {
          const Icon = tb.icon;
          const active = tab === tb.key;
          return (
            <TouchableOpacity key={tb.key} style={[styles.tabBtn, active && styles.tabBtnActive]} onPress={() => switchTab(tb.key)}>
              <Icon size={16} color={active ? '#0f172a' : '#94a3b8'} />
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{tb.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]} showsVerticalScrollIndicator={false}>
        {/* ---- VUE D'ENSEMBLE ---- */}
        {tab === 'overview' && (
          <View style={styles.cardsGrid}>
            <StatCard icon={Users} color="#10b981" label="Utilisateurs" value={overview?.total_users ?? '—'} />
            <StatCard icon={Euro} color="#f59e0b" label="Revenu total" value={overview ? euro(overview.revenue_total_cents) : '—'} />
            <StatCard icon={Euro} color="#22c55e" label="Revenu net" value={overview ? euro(overview.revenue_net_cents) : '—'} />
            <StatCard icon={BadgeCheck} color="#3b82f6" label="Célébrités validées" value={overview?.celebrities_approved ?? '—'} />
            <StatCard icon={Clock} color="#eab308" label="Vérifs en attente" value={overview?.verifications_pending ?? '—'} />
            <StatCard icon={XCircle} color="#ef4444" label="Vérifs refusées" value={overview?.verifications_rejected ?? '—'} />
            <StatCard icon={Megaphone} color="#ec4899" label="Signalements ouverts" value={overview?.open_reports ?? '—'} />
            <StatCard icon={Ban} color="#ef4444" label="Bannissements actifs" value={overview?.active_bans ?? '—'} />
            <StatCard icon={Calendar} color="#14b8a6" label="Événements" value={overview?.total_events ?? '—'} />
            <StatCard icon={Video} color="#8b5cf6" label="Sessions vidéo" value={overview?.total_live_sessions ?? '—'} />
            <StatCard icon={Euro} color="#64748b" label="Transactions" value={overview?.transactions_count ?? '—'} />
          </View>
        )}

        {/* ---- VÉRIFICATIONS ---- */}
        {tab === 'verifs' && (
          <View>
            <View style={styles.filterRow}>
              {(['pending', 'approved', 'rejected'] as const).map((f) => (
                <TouchableOpacity key={f} style={[styles.filterChip, verifFilter === f && styles.filterChipActive]}
                  onPress={() => { setVerifFilter(f); loadVerifs(f); }}>
                  <Text style={[styles.filterChipText, verifFilter === f && styles.filterChipTextActive]}>
                    {f === 'pending' ? 'En attente' : f === 'approved' ? 'Acceptées' : 'Refusées'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {loading ? <ActivityIndicator color="#10b981" style={{ marginTop: 30 }} /> :
              verifs.length === 0 ? <Text style={styles.empty}>Aucune demande {verifFilter === 'pending' ? 'en attente' : verifFilter === 'approved' ? 'acceptée' : 'refusée'}.</Text> :
              verifs.map((v) => (
                <View key={`${v.kind}-${v.request_id}`} style={styles.itemCard}>
                  <View style={styles.itemRow}>
                    <Text style={styles.itemName}>{v.name || '(sans nom)'}</Text>
                    <View style={[styles.badge, { backgroundColor: kindColor(v.kind) }]}>
                      <Text style={styles.badgeText}>{kindLabel(v.kind)}</Text>
                    </View>
                  </View>
                  {!!v.email && <Text style={styles.itemSub}>{v.email}</Text>}
                  {!!v.category && <Text style={styles.itemSub}>Catégorie : {v.category}</Text>}
                  {!!v.additional_info && <Text style={styles.itemSub}>Info : {v.additional_info}</Text>}
                  {v.status === 'rejected' && !!v.admin_notes && (
                    <Text style={styles.reasonText}>Raison du refus : {v.admin_notes}</Text>
                  )}
                  <Text style={styles.itemDate}>Demande du {fmtDate(v.created_at)}</Text>
                  {verifFilter === 'pending' && (
                    <View style={styles.actionRow}>
                      <TouchableOpacity style={[styles.actionBtn, styles.approveBtn]} onPress={() => handleVerifAction(v, 'approved')}>
                        <CheckCircle2 size={16} color="#fff" />
                        <Text style={styles.actionBtnText}>Accepter</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.actionBtn, styles.rejectBtn]} onPress={() => handleVerifAction(v, 'rejected')}>
                        <XCircle size={16} color="#fff" />
                        <Text style={styles.actionBtnText}>Refuser</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              ))}
          </View>
        )}

        {/* ---- REVENUS ---- */}
        {tab === 'revenue' && (
          <View>
            <View style={styles.totalBanner}>
              <Euro size={22} color="#f59e0b" />
              <Text style={styles.totalBannerText}>
                Total généré : {overview ? euro(overview.revenue_total_cents) : '—'} · Net : {overview ? euro(overview.revenue_net_cents) : '—'}
              </Text>
            </View>
            <Text style={styles.sectionLabel}>Par célébrité</Text>
            {loading ? <ActivityIndicator color="#10b981" style={{ marginTop: 30 }} /> :
              revenue.length === 0 ? <Text style={styles.empty}>Aucune transaction pour le moment.</Text> :
              revenue.map((r, i) => (
                <View key={`${r.celebrity_id}-${i}`} style={styles.itemCard}>
                  <View style={styles.itemRow}>
                    <Text style={styles.itemName}>{r.celebrity_name || r.celebrity_id || '(inconnu)'}</Text>
                    <Text style={styles.revenueAmount}>{euro(r.gross_cents)}</Text>
                  </View>
                  <Text style={styles.itemSub}>Net célébrité : {euro(r.net_cents)} · {r.tx_count} transaction(s)</Text>
                </View>
              ))}
          </View>
        )}

        {/* ---- RECHERCHE ---- */}
        {tab === 'search' && (
          <View>
            <View style={styles.searchRow}>
              <TextInput
                style={styles.searchInput}
                value={searchQ}
                onChangeText={setSearchQ}
                placeholder="Nom ou e-mail d'un fan / célébrité…"
                placeholderTextColor="rgba(255,255,255,0.35)"
                onSubmitEditing={runSearch}
                returnKeyType="search"
              />
              <TouchableOpacity style={styles.searchBtn} onPress={runSearch}>
                {searching ? <ActivityIndicator color="#fff" /> : <Search size={20} color="#fff" />}
              </TouchableOpacity>
            </View>
            {searchResults.map((p, i) => (
              <View key={`${p.user_id}-${i}`} style={styles.itemCard}>
                <View style={styles.itemRow}>
                  <Text style={styles.itemName}>{p.name || p.email || '(sans nom)'}</Text>
                  <View style={[styles.badge, { backgroundColor: kindColor(p.kind) }]}>
                    <Text style={styles.badgeText}>{p.detail || p.kind}</Text>
                  </View>
                </View>
                {!!p.email && p.name && <Text style={styles.itemSub}>{p.email}</Text>}
                {p.is_banned && <Text style={styles.bannedTag}>⛔ Actuellement banni</Text>}
                {!!p.user_id && (
                  <View style={styles.actionRow}>
                    {p.is_banned ? (
                      <TouchableOpacity style={[styles.actionBtn, styles.approveBtn]} onPress={() => handleUnban(p)}>
                        <CheckCircle2 size={16} color="#fff" />
                        <Text style={styles.actionBtnText}>Lever le ban</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity style={[styles.actionBtn, styles.rejectBtn]} onPress={() => handleBan(p)}>
                        <Ban size={16} color="#fff" />
                        <Text style={styles.actionBtnText}>Bannir</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
            ))}
            {searchResults.length === 0 && !searching && (
              <Text style={styles.empty}>Saisis un nom ou un e-mail puis lance la recherche.</Text>
            )}
          </View>
        )}

        {/* ---- SIGNALEMENTS ---- */}
        {tab === 'reports' && (
          <View>
            {loading && <ActivityIndicator color="#10b981" style={{ marginTop: 30 }} />}

            {/* Notes basses (1-2 étoiles) remontées comme signalements */}
            {lowRatings.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>⭐ Notes basses (1-2 étoiles)</Text>
                {lowRatings.map((r) => (
                  <View key={r.id} style={[styles.itemCard, { borderColor: 'rgba(239,68,68,0.3)' }]}>
                    <View style={styles.itemRow}>
                      <Text style={styles.itemName}>
                        {'⭐'.repeat(r.rating)} · {r.rated_name || (r.rated_type === 'celebrity' ? 'Célébrité' : 'Fan')}
                      </Text>
                      <Text style={styles.itemDate}>{fmtDate(r.created_at)}</Text>
                    </View>
                    {!!r.comment && <Text style={styles.reportMsg}>« {r.comment} »</Text>}
                    <Text style={styles.itemSub}>Noté par un {r.rater_type === 'celebrity' ? 'célébrité' : 'fan'}</Text>
                  </View>
                ))}
                <Text style={[styles.sectionLabel, { marginTop: 18 }]}>🐛 Problèmes signalés</Text>
              </>
            )}

            {!loading && reports.length === 0 && lowRatings.length === 0 && (
              <Text style={styles.empty}>Aucun signalement ni note basse.</Text>
            )}

            {reports.map((r) => (
              <View key={r.id} style={styles.itemCard}>
                <View style={styles.itemRow}>
                  <Text style={styles.itemName}>{r.subject || 'Signalement'}</Text>
                  <Text style={styles.itemDate}>{fmtDate(r.created_at)}</Text>
                </View>
                <Text style={styles.reportMsg}>{r.message}</Text>
                <Text style={styles.itemSub}>
                  {(r.reporter_name ? r.reporter_name + ' · ' : '')}{r.reporter_email || 'e-mail inconnu'}{r.platform ? ' · ' + r.platform : ''}
                </Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function StatCard({ icon: Icon, color, label, value }: { icon: any; color: string; label: string; value: any }) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIcon, { backgroundColor: color + '22' }]}><Icon size={20} color={color} /></View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const kindLabel = (k: string) => k === 'celebrity' ? 'Célébrité' : k === 'creator' ? 'Créateur' : k === 'organization' ? 'Club/Orga' : k === 'fan' ? 'Fan' : 'Compte';
const kindColor = (k: string) => k === 'celebrity' ? '#3b82f6' : k === 'creator' ? '#8b5cf6' : k === 'organization' ? '#14b8a6' : k === 'fan' ? '#64748b' : '#6b7280';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  center: { flex: 1, alignItems: 'center', gap: 14 },
  deniedTitle: { color: '#fff', fontSize: 22, fontWeight: '700', marginTop: 8 },
  deniedText: { color: 'rgba(255,255,255,0.6)', fontSize: 15, textAlign: 'center', lineHeight: 22 },
  backBtnWide: { marginTop: 16, backgroundColor: '#10b981', paddingHorizontal: 32, paddingVertical: 12, borderRadius: 24 },
  backBtnWideText: { color: '#fff', fontWeight: '700' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 10 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  tabBar: { flexGrow: 0, maxHeight: 52 },
  tabBarContent: { paddingHorizontal: 12, gap: 8, alignItems: 'center' },
  tabBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.08)' },
  tabBtnActive: { backgroundColor: '#10b981' },
  tabText: { color: '#94a3b8', fontSize: 13, fontWeight: '600' },
  tabTextActive: { color: '#0f172a' },
  content: { paddingHorizontal: 16, paddingTop: 12 },
  cardsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  statCard: { width: '47%', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  statIcon: { width: 38, height: 38, borderRadius: 19, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  statValue: { color: '#fff', fontSize: 22, fontWeight: '800' },
  statLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 13, marginTop: 2 },
  filterRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  filterChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.08)' },
  filterChipActive: { backgroundColor: '#10b981' },
  filterChipText: { color: '#94a3b8', fontWeight: '600', fontSize: 13 },
  filterChipTextActive: { color: '#0f172a' },
  itemCard: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  itemRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  itemName: { color: '#fff', fontSize: 16, fontWeight: '700', flex: 1 },
  itemSub: { color: 'rgba(255,255,255,0.6)', fontSize: 13, marginTop: 3 },
  itemDate: { color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 4 },
  reasonText: { color: '#fca5a5', fontSize: 13, marginTop: 4, fontStyle: 'italic' },
  reportMsg: { color: 'rgba(255,255,255,0.85)', fontSize: 14, marginTop: 6, lineHeight: 20 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10 },
  approveBtn: { backgroundColor: '#10b981' },
  rejectBtn: { backgroundColor: '#ef4444' },
  actionBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  totalBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(245,158,11,0.1)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)', borderRadius: 12, padding: 14, marginBottom: 16 },
  totalBannerText: { color: '#fbbf24', fontSize: 14, fontWeight: '600', flex: 1 },
  sectionLabel: { color: '#fff', fontSize: 15, fontWeight: '700', marginBottom: 10 },
  revenueAmount: { color: '#f59e0b', fontSize: 16, fontWeight: '800' },
  searchRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  searchInput: { flex: 1, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', borderRadius: 12, paddingHorizontal: 14, color: '#fff', fontSize: 15 },
  searchBtn: { width: 50, borderRadius: 12, backgroundColor: '#10b981', justifyContent: 'center', alignItems: 'center' },
  bannedTag: { color: '#fca5a5', fontSize: 13, fontWeight: '700', marginTop: 6 },
  empty: { color: 'rgba(255,255,255,0.5)', fontSize: 14, textAlign: 'center', marginTop: 30, fontStyle: 'italic' },
});
