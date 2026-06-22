import { useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ActivityIndicator } from 'react-native';
import { ShieldCheck, Check } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface Props {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
}

export default function AgeCertificationModal({ visible, onClose, onConfirm }: Props) {
  const [checked, setChecked] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    if (!checked || loading) return;
    setLoading(true);
    try {
      await onConfirm();
      setChecked(false);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setChecked(false);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <LinearGradient colors={['#1a1a2e', '#16213e']} style={StyleSheet.absoluteFill} />
          <View style={styles.iconCircle}>
            <ShieldCheck size={30} color="#10b981" />
          </View>
          <Text style={styles.title}>Confirmation de majorité</Text>
          <Text style={styles.message}>
            Les paiements et les interactions avec les célébrités sont réservés aux personnes
            majeures. Avant de continuer, merci de confirmer votre âge.
          </Text>

          <TouchableOpacity style={styles.checkRow} onPress={() => setChecked((v) => !v)} activeOpacity={0.8}>
            <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
              {checked && <Check size={16} color="#fff" strokeWidth={3} />}
            </View>
            <Text style={styles.checkLabel}>
              Je certifie avoir 18 ans ou plus (ou l'âge légal de la majorité dans mon pays).
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.confirmBtn, !checked && styles.confirmBtnDisabled]}
            onPress={handleConfirm}
            disabled={!checked || loading}
            activeOpacity={0.85}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.confirmBtnText}>Continuer le paiement</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancelBtn} onPress={handleClose}>
            <Text style={styles.cancelBtnText}>Annuler</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  container: { width: '100%', maxWidth: 380, borderRadius: 24, overflow: 'hidden', padding: 26, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  iconCircle: { width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(16,185,129,0.12)', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  title: { color: '#fff', fontSize: 20, fontWeight: '800', marginBottom: 10, textAlign: 'center' },
  message: { color: 'rgba(255,255,255,0.7)', fontSize: 14, lineHeight: 20, textAlign: 'center', marginBottom: 20 },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 22, width: '100%' },
  checkbox: { width: 26, height: 26, borderRadius: 7, borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)', justifyContent: 'center', alignItems: 'center', marginTop: 1 },
  checkboxChecked: { backgroundColor: '#10b981', borderColor: '#10b981' },
  checkLabel: { flex: 1, color: '#fff', fontSize: 14, lineHeight: 20 },
  confirmBtn: { width: '100%', backgroundColor: '#10b981', borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginBottom: 8 },
  confirmBtnDisabled: { opacity: 0.4 },
  confirmBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  cancelBtn: { paddingVertical: 10 },
  cancelBtnText: { color: 'rgba(255,255,255,0.5)', fontSize: 14 },
});
