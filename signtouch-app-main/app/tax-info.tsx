import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Check, ShieldCheck, Info } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { showAlert } from '@/utils/alertHelper';

const API_BASE = process.env.EXPO_PUBLIC_STRIPE_SERVER_URL || '';

export default function TaxInfoScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { user, session } = useAuth();

  const [taxStatus, setTaxStatus] = useState<'individual' | 'business' | null>(null);
  const [country, setCountry] = useState('');
  const [taxId, setTaxId] = useState('');
  const [businessNumber, setBusinessNumber] = useState('');
  const [vatNumber, setVatNumber] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const authHeaders = (): Record<string, string> => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (session?.access_token) h['Authorization'] = `Bearer ${session.access_token}`;
    return h;
  };

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/celebrity/tax-info`, { headers: authHeaders() });
        const data = await res.json();
        const info = data?.taxInfo;
        if (info) {
          if (info.tax_status) setTaxStatus(info.tax_status);
          setCountry(info.tax_country || '');
          setTaxId(info.tax_id || '');
          setBusinessNumber(info.business_number || '');
          setVatNumber(info.vat_number || '');
        }
      } catch (e) {
        console.warn('[TaxInfo] load error', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSave = async () => {
    if (!taxStatus || !country.trim() || !taxId.trim()) {
      showAlert(t('error') || 'Erreur', t('taxInfoRequiredMsg') || 'Champs requis manquants.');
      return;
    }
    try {
      setSaving(true);
      const res = await fetch(`${API_BASE}/api/celebrity/tax-info`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          tax_status: taxStatus,
          tax_country: country.trim(),
          tax_id: taxId.trim(),
          business_number: taxStatus === 'business' ? businessNumber.trim() : null,
          vat_number: taxStatus === 'business' ? vatNumber.trim() : null,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.message || data.error || 'save failed');
      showAlert(t('saved') || 'Enregistré', t('taxInfoSavedMsg') || 'Informations enregistrées.');
      router.back();
    } catch (e: any) {
      console.error('[TaxInfo] save error', e);
      // Fait remonter le message serveur (ex : « complète d'abord ton profil »).
      showAlert(t('error') || 'Erreur', e?.message && e.message !== 'save failed' ? e.message : (t('taxInfoErrorMsg') || 'Erreur lors de l\'enregistrement.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0a1628', '#0f2035', '#0a1628']} style={StyleSheet.absoluteFill} />

      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <ArrowLeft size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('taxInfoTitle') || 'Informations fiscales'}</Text>
        <View style={{ width: 38 }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#10b981" /></View>
      ) : (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]} showsVerticalScrollIndicator={false}>
          <View style={styles.introRow}>
            <ShieldCheck size={22} color="#10b981" />
            <Text style={styles.introText}>{t('taxInfoSubtitle') || ''}</Text>
          </View>

          {/* Statut */}
          <Text style={styles.label}>{t('taxInfoStatusLabel') || 'Ton statut'}</Text>
          <View style={styles.statusRow}>
            <TouchableOpacity
              style={[styles.statusBtn, taxStatus === 'individual' && styles.statusBtnActive]}
              onPress={() => setTaxStatus('individual')}
              activeOpacity={0.8}
            >
              <Text style={[styles.statusBtnText, taxStatus === 'individual' && styles.statusBtnTextActive]}>
                {t('taxInfoIndividual') || 'Particulier'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.statusBtn, taxStatus === 'business' && styles.statusBtnActive]}
              onPress={() => setTaxStatus('business')}
              activeOpacity={0.8}
            >
              <Text style={[styles.statusBtnText, taxStatus === 'business' && styles.statusBtnTextActive]}>
                {t('taxInfoBusiness') || 'Professionnel'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Pays */}
          <Text style={styles.label}>{t('taxInfoCountryLabel') || 'Pays de résidence fiscale'}</Text>
          <TextInput
            style={styles.input}
            value={country}
            onChangeText={(v) => setCountry(v.toUpperCase().slice(0, 2))}
            placeholder={t('taxInfoCountryPlaceholder') || 'FR'}
            placeholderTextColor="#64748b"
            autoCapitalize="characters"
            maxLength={2}
          />

          {/* NIF */}
          <Text style={styles.label}>{t('taxInfoTaxIdLabel') || 'Numéro fiscal (NIF)'}</Text>
          <TextInput
            style={styles.input}
            value={taxId}
            onChangeText={setTaxId}
            placeholder={t('taxInfoTaxIdPlaceholder') || ''}
            placeholderTextColor="#64748b"
          />
          <Text style={styles.hint}>{t('taxInfoTaxIdHint') || ''}</Text>

          {/* Champs pro */}
          {taxStatus === 'business' && (
            <>
              <Text style={styles.label}>{t('taxInfoBusinessNumberLabel') || 'SIREN'}</Text>
              <TextInput
                style={styles.input}
                value={businessNumber}
                onChangeText={setBusinessNumber}
                placeholder="SIREN"
                placeholderTextColor="#64748b"
              />
              <Text style={styles.label}>{t('taxInfoVatNumberLabel') || 'Numéro de TVA'}</Text>
              <TextInput
                style={styles.input}
                value={vatNumber}
                onChangeText={setVatNumber}
                placeholder="FR..."
                placeholderTextColor="#64748b"
                autoCapitalize="characters"
              />
            </>
          )}

          {/* Pourquoi */}
          <View style={styles.whyBox}>
            <View style={styles.whyHeader}>
              <Info size={16} color="#38bdf8" />
              <Text style={styles.whyTitle}>{t('taxInfoWhyTitle') || 'Pourquoi ces informations ?'}</Text>
            </View>
            <Text style={styles.whyText}>{t('taxInfoWhyText') || ''}</Text>
          </View>

          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Check size={20} color="#fff" />
                <Text style={styles.saveBtnText}>{t('taxInfoSaveBtn') || 'Enregistrer'}</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a1628' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12 },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { paddingHorizontal: 16, paddingTop: 8 },
  introRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', backgroundColor: 'rgba(16,185,129,0.1)', borderWidth: 1, borderColor: 'rgba(16,185,129,0.25)', borderRadius: 12, padding: 14, marginBottom: 22 },
  introText: { flex: 1, color: 'rgba(255,255,255,0.85)', fontSize: 13.5, lineHeight: 20 },
  label: { color: '#e2e8f0', fontSize: 14, fontWeight: '600', marginBottom: 8, marginTop: 6 },
  statusRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  statusBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.04)' },
  statusBtnActive: { borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.15)' },
  statusBtnText: { color: '#cbd5e1', fontSize: 14, fontWeight: '600' },
  statusBtnTextActive: { color: '#10b981' },
  input: { backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: '#fff', fontSize: 15, marginBottom: 6 },
  hint: { color: '#94a3b8', fontSize: 12, lineHeight: 17, marginBottom: 14 },
  whyBox: { backgroundColor: 'rgba(56,189,248,0.08)', borderWidth: 1, borderColor: 'rgba(56,189,248,0.2)', borderRadius: 12, padding: 14, marginTop: 12, marginBottom: 24 },
  whyHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  whyTitle: { color: '#38bdf8', fontSize: 13.5, fontWeight: '700' },
  whyText: { color: 'rgba(255,255,255,0.75)', fontSize: 12.5, lineHeight: 19 },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#10b981', paddingVertical: 16, borderRadius: 14 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
