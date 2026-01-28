import { useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { Mail, X, CheckCircle } from 'lucide-react-native';
import { useTranslation } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';

interface AccountModalProps {
  visible: boolean;
  onClose: () => void;
  onSkip: () => void;
}

export default function AccountModal({ 
  visible, 
  onClose,
  onSkip 
}: AccountModalProps) {
  const { t, language } = useTranslation();
  const { sendMagicLink } = useAuth();
  const [step, setStep] = useState<'email' | 'sent'>('email');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSendLink = async () => {
    if (!email.trim() || !email.includes('@')) {
      setError(t('invalidEmail') || 'Adresse email invalide');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      const { error: sendError } = await sendMagicLink(email.trim(), language);
      if (sendError) {
        setError(sendError.message);
      } else {
        setStep('sent');
      }
    } catch (err: any) {
      setError(err.message || 'Une erreur est survenue');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setStep('email');
    setEmail('');
    setError('');
    onClose();
  };

  const handleSkip = () => {
    setStep('email');
    setEmail('');
    setError('');
    onSkip();
  };

  const renderEmailForm = () => (
    <>
      <TouchableOpacity 
        style={styles.closeButton}
        onPress={handleSkip}
      >
        <X size={24} color="#9ca3af" />
      </TouchableOpacity>

      <View style={styles.iconContainer}>
        <Mail size={48} color="#22c55e" />
      </View>

      <Text style={styles.title}>
        {t('securePhotosTitle') || 'Sécurisez vos photos et votre abonnement'}
      </Text>

      <Text style={styles.subtitle}>
        {t('securePhotosSubtitle') || 'Connectez-vous pour retrouver vos dédicaces et conserver votre abonnement si vous changez d\'appareil.'}
      </Text>

      <TextInput
        style={styles.input}
        placeholder={t('emailPlaceholder') || 'Votre adresse email'}
        placeholderTextColor="#6b7280"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        editable={!loading}
      />

      {error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : null}

      <TouchableOpacity
        style={[styles.sendButton, loading && styles.buttonDisabled]}
        onPress={handleSendLink}
        activeOpacity={0.8}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={styles.sendButtonText}>
            {t('receiveConnectionLink') || 'Recevoir un lien de connexion'}
          </Text>
        )}
      </TouchableOpacity>

      <Text style={styles.noPasswordText}>
        {t('noPasswordRequired') || 'Aucun mot de passe requis'}
      </Text>
      <Text style={styles.secureEmailText}>
        {t('secureEmailExplanation') || 'Vous recevrez un lien sécurisé par email.'}
      </Text>

      <TouchableOpacity
        style={styles.laterButton}
        onPress={handleSkip}
        activeOpacity={0.7}
      >
        <Text style={styles.laterButtonText}>
          {t('later') || 'Plus tard'}
        </Text>
      </TouchableOpacity>
    </>
  );

  const renderSent = () => (
    <>
      <TouchableOpacity 
        style={styles.closeButton}
        onPress={handleClose}
      >
        <X size={24} color="#9ca3af" />
      </TouchableOpacity>

      <View style={[styles.iconContainer, styles.successIcon]}>
        <CheckCircle size={48} color="#22c55e" />
      </View>

      <Text style={styles.title}>
        {t('checkYourEmail') || 'Vérifiez votre email'}
      </Text>

      <Text style={styles.subtitle}>
        {t('magicLinkSent') || `Nous avons envoyé un lien de connexion à ${email}. Cliquez sur le lien pour vous connecter.`}
      </Text>

      <TouchableOpacity
        style={styles.sendButton}
        onPress={handleClose}
        activeOpacity={0.8}
      >
        <Text style={styles.sendButtonText}>
          {t('understood') || 'Compris'}
        </Text>
      </TouchableOpacity>
    </>
  );

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={handleSkip}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {step === 'email' && renderEmailForm()}
          {step === 'sent' && renderSent()}
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
    paddingTop: 48,
    alignItems: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#374151',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  successIcon: {
    backgroundColor: 'rgba(34, 197, 94, 0.25)',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 28,
  },
  subtitle: {
    fontSize: 15,
    color: '#9ca3af',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  input: {
    width: '100%',
    backgroundColor: '#374151',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#fff',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#4b5563',
  },
  errorText: {
    color: '#ef4444',
    fontSize: 14,
    marginBottom: 12,
    textAlign: 'center',
  },
  sendButton: {
    width: '100%',
    backgroundColor: '#22c55e',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  sendButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
  },
  noPasswordText: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
    marginBottom: 4,
  },
  secureEmailText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 16,
  },
  laterButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  laterButtonText: {
    fontSize: 15,
    color: '#9ca3af',
    fontWeight: '500',
  },
});
