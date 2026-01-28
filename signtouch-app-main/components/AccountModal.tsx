import { useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, ActivityIndicator, Platform } from 'react-native';
import { User, Shield, Mail, ArrowLeft, CheckCircle } from 'lucide-react-native';
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
  const [step, setStep] = useState<'intro' | 'email' | 'sent'>('intro');
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
    setStep('intro');
    setEmail('');
    setError('');
    onClose();
  };

  const handleSkip = () => {
    setStep('intro');
    setEmail('');
    setError('');
    onSkip();
  };

  const renderIntro = () => (
    <>
      <View style={styles.iconContainer}>
        <User size={48} color="#22c55e" />
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
        onPress={() => setStep('email')}
        activeOpacity={0.8}
      >
        <Mail size={20} color="#fff" />
        <Text style={styles.createButtonText}>
          {t('continueWithEmail') || 'Continuer avec email'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.skipButton}
        onPress={handleSkip}
        activeOpacity={0.7}
      >
        <Text style={styles.skipButtonText}>
          {t('skipForNow') || 'Passer pour le moment'}
        </Text>
      </TouchableOpacity>
    </>
  );

  const renderEmailForm = () => (
    <>
      <TouchableOpacity 
        style={styles.backButton}
        onPress={() => setStep('intro')}
      >
        <ArrowLeft size={24} color="#9ca3af" />
      </TouchableOpacity>

      <View style={styles.iconContainer}>
        <Mail size={48} color="#22c55e" />
      </View>

      <Text style={styles.title}>
        {t('enterYourEmail') || 'Entrez votre email'}
      </Text>

      <Text style={styles.subtitle}>
        {t('magicLinkExplanation') || 'Nous vous enverrons un lien magique pour vous connecter instantanément'}
      </Text>

      <TextInput
        style={styles.input}
        placeholder={t('emailPlaceholder') || 'votre@email.com'}
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
        style={[styles.createButton, loading && styles.buttonDisabled]}
        onPress={handleSendLink}
        activeOpacity={0.8}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <>
            <Mail size={20} color="#fff" />
            <Text style={styles.createButtonText}>
              {t('sendMagicLink') || 'Envoyer le lien'}
            </Text>
          </>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.skipButton}
        onPress={handleSkip}
        activeOpacity={0.7}
      >
        <Text style={styles.skipButtonText}>
          {t('skipForNow') || 'Passer pour le moment'}
        </Text>
      </TouchableOpacity>
    </>
  );

  const renderSent = () => (
    <>
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
        style={styles.createButton}
        onPress={handleClose}
        activeOpacity={0.8}
      >
        <Text style={styles.createButtonText}>
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
          {step === 'intro' && renderIntro()}
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
    alignItems: 'center',
  },
  backButton: {
    position: 'absolute',
    top: 16,
    left: 16,
    padding: 8,
    zIndex: 10,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
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
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    width: '100%',
    backgroundColor: '#22c55e',
    paddingVertical: 16,
    borderRadius: 14,
    marginBottom: 12,
  },
  buttonDisabled: {
    opacity: 0.7,
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
