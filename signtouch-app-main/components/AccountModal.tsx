import { View, Text, StyleSheet, Modal, TouchableOpacity } from 'react-native';
import { User, Shield } from 'lucide-react-native';
import { useTranslation } from '@/contexts/LanguageContext';

interface AccountModalProps {
  visible: boolean;
  onCreateAccount: () => void;
  onSkip: () => void;
}

export default function AccountModal({ 
  visible, 
  onCreateAccount, 
  onSkip 
}: AccountModalProps) {
  const { t } = useTranslation();

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onSkip}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.iconContainer}>
            <User size={48} color="#3b82f6" />
          </View>

          <Text style={styles.title}>
            {t('createAccountToSave') || 'Créer un compte'}
          </Text>

          <Text style={styles.subtitle}>
            {t('createAccountSubtitle') || 'Sauvegardez vos photos en sécurité et accédez-y depuis n\'importe quel appareil'}
          </Text>

          <View style={styles.benefitsContainer}>
            <View style={styles.benefitRow}>
              <Shield size={18} color="#10b981" />
              <Text style={styles.benefitText}>
                {t('cloudSync') || 'Synchronisation cloud'}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.createButton}
            onPress={onCreateAccount}
            activeOpacity={0.8}
          >
            <User size={20} color="#fff" />
            <Text style={styles.createButtonText}>
              {t('createAccount') || 'Créer un compte'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.skipButton}
            onPress={onSkip}
            activeOpacity={0.7}
          >
            <Text style={styles.skipButtonText}>
              {t('skipForNow') || 'Passer pour le moment'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  container: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#1f2937',
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 15,
    color: '#9ca3af',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
  },
  benefitsContainer: {
    width: '100%',
    marginBottom: 24,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  benefitText: {
    fontSize: 14,
    color: '#d1d5db',
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    width: '100%',
    backgroundColor: '#3b82f6',
    paddingVertical: 16,
    borderRadius: 14,
    marginBottom: 12,
  },
  createButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
  },
  skipButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  skipButtonText: {
    fontSize: 15,
    color: '#9ca3af',
  },
});
