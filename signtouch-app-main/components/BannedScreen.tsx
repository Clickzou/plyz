import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { Ban } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';

export default function BannedScreen() {
  const { banReason, banUntil, signOut } = useAuth();
  const insets = useSafeAreaInsets();

  let untilText = 'définitivement';
  if (banUntil) {
    try {
      untilText = `jusqu'au ${new Date(banUntil).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}`;
    } catch { /* garde la valeur par défaut */ }
  }

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#1a1a2e', '#3b1111', '#1a1a2e']} style={StyleSheet.absoluteFill} />
      <View style={[styles.content, { paddingTop: insets.top + 80 }]}>
        <View style={styles.iconCircle}>
          <Ban size={56} color="#ef4444" strokeWidth={2} />
        </View>
        <Text style={styles.title}>Compte suspendu</Text>
        <Text style={styles.message}>
          Votre accès à Plyz est suspendu {untilText}.
        </Text>
        {!!banReason && (
          <View style={styles.reasonBox}>
            <Text style={styles.reasonLabel}>Motif</Text>
            <Text style={styles.reasonText}>{banReason}</Text>
          </View>
        )}
        <Text style={styles.contact}>
          Si vous pensez qu'il s'agit d'une erreur, contactez-nous à jc@clickzou.fr.
        </Text>
        <TouchableOpacity style={styles.btn} onPress={signOut} activeOpacity={0.85}>
          <Text style={styles.btnText}>Se déconnecter</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e' },
  content: { flex: 1, alignItems: 'center', paddingHorizontal: 32, gap: 16 },
  iconCircle: {
    width: 110, height: 110, borderRadius: 55,
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderWidth: 2, borderColor: 'rgba(239,68,68,0.4)',
    justifyContent: 'center', alignItems: 'center', marginBottom: 8,
  },
  title: { color: '#fff', fontSize: 26, fontWeight: '800' },
  message: { color: 'rgba(255,255,255,0.8)', fontSize: 16, textAlign: 'center', lineHeight: 24 },
  reasonBox: {
    width: '100%', backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12, padding: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', marginTop: 4,
  },
  reasonLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', marginBottom: 4 },
  reasonText: { color: '#fff', fontSize: 15, lineHeight: 21 },
  contact: { color: 'rgba(255,255,255,0.5)', fontSize: 13, textAlign: 'center', lineHeight: 19, marginTop: 8 },
  btn: {
    marginTop: 20, backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 40, paddingVertical: 14, borderRadius: 26,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
