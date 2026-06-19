import { useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { Mail, CheckCircle, KeyRound, X } from 'lucide-react-native';
import { useTranslation } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';

interface AccountModalProps {
  visible: boolean;
  onClose: () => void;
  onSkip: () => void;
  returnPath?: string;
  allowSkip?: boolean;
}

export default function AccountModal({
  visible,
  onClose,
  onSkip,
  returnPath,
  allowSkip = true,
}: AccountModalProps) {
  const { t } = useTranslation();
  const { sendOtpCode, verifyOtpCode } = useAuth();
  const [step, setStep] = useState<'email' | 'code' | 'success'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSendCode = async () => {
    if (!email.trim() || !email.includes('@')) {
      setError(t('invalidEmail') || 'Adresse email invalide');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      const { error: sendError } = await sendOtpCode(email.trim());
      if (sendError) {
        setError(sendError.message);
      } else {
        setStep('code');
      }
    } catch (err: any) {
      setError(err.message || 'Une erreur est survenue');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!code.trim() || code.trim().length < 6) {
      setError(t('invalidCode') || 'Code invalide');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      const { error: verifyError } = await verifyOtpCode(email.trim(), code.trim());
      if (verifyError) {
        setError(verifyError.message);
      } else {
        setStep('success');
        setTimeout(() => {
          handleClose();
        }, 1500);
      }
    } catch (err: any) {
      setError(err.message || 'Une erreur est survenue');
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    setLoading(true);
    setError('');
    setCode('');
    
    try {
      const { error: sendError } = await sendOtpCode(email.trim());
      if (sendError) {
        setError(sendError.message);
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
    setCode('');
    setError('');
    onClose();
  };

  const renderEmailForm = () => (
    <>
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
        onPress={handleSendCode}
        activeOpacity={0.8}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={styles.sendButtonText}>
            {t('receiveCode') || 'Recevoir un code de connexion'}
          </Text>
        )}
      </TouchableOpacity>

      <Text style={styles.noPasswordText}>
        {t('noPasswordRequired') || 'Aucun mot de passe requis'}
      </Text>
      <Text style={styles.secureEmailText}>
        {t('secureCodeExplanation') || 'Vous recevrez un code à 6 chiffres par email.'}
      </Text>
    </>
  );

  const renderCodeForm = () => (
    <>
      <View style={styles.iconContainer}>
        <KeyRound size={48} color="#22c55e" />
      </View>

      <Text style={styles.title}>
        {t('enterCode') || 'Entrez votre code'}
      </Text>

      <Text style={styles.subtitle}>
        {t('codeSentTo') || `Nous avons envoyé un code à 6 chiffres à ${email}. Copiez-collez le code ci-dessous.`}
      </Text>

      <TextInput
        style={[styles.input, styles.codeInput]}
        placeholder="000000"
        placeholderTextColor="#6b7280"
        value={code}
        onChangeText={(text) => setCode(text.replace(/[^0-9]/g, '').slice(0, 6))}
        keyboardType="number-pad"
        autoCapitalize="none"
        maxLength={6}
        editable={!loading}
      />

      {error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : null}

      <TouchableOpacity
        style={[styles.sendButton, loading && styles.buttonDisabled]}
        onPress={handleVerifyCode}
        activeOpacity={0.8}
        disabled={loading || code.length < 6}
      >
        {loading ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={styles.sendButtonText}>
            {t('verify') || 'Vérifier'}
          </Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        onPress={handleResendCode}
        disabled={loading}
        style={styles.resendButton}
      >
        <Text style={styles.resendText}>
          {t('resendCode') || 'Renvoyer le code'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => {
          setStep('email');
          setCode('');
          setError('');
        }}
        style={styles.changeEmailButton}
      >
        <Text style={styles.changeEmailText}>
          {t('changeEmail') || 'Changer d\'adresse email'}
        </Text>
      </TouchableOpacity>
    </>
  );

  const renderSuccess = () => (
    <>
      <View style={[styles.iconContainer, styles.successIcon]}>
        <CheckCircle size={48} color="#22c55e" />
      </View>

      <Text style={styles.title}>
        {t('connectionSuccess') || 'Connexion réussie !'}
      </Text>

      <Text style={styles.subtitle}>
        {t('welcomeBack') || 'Bienvenue ! Vos photos sont maintenant sécurisées.'}
      </Text>
    </>
  );

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={allowSkip ? onSkip : onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {step !== 'success' && (
            <TouchableOpacity
              style={styles.closeButton}
              onPress={allowSkip ? onSkip : onClose}
              activeOpacity={0.7}
            >
              <X size={22} color="#9ca3af" />
            </TouchableOpacity>
          )}
          {step === 'email' && renderEmailForm()}
          {step === 'code' && renderCodeForm()}
          {step === 'success' && renderSuccess()}
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
    position: 'relative' as const,
  },
  closeButton: {
    position: 'absolute' as const,
    top: 12,
    right: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
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
  codeInput: {
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 4,
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
  },
  resendButton: {
    marginBottom: 8,
  },
  resendText: {
    fontSize: 14,
    color: '#22c55e',
    textAlign: 'center',
  },
  changeEmailButton: {
    marginTop: 4,
  },
  changeEmailText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
});
