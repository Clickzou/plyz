import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, ActivityIndicator, Platform } from 'react-native';
import { X, Mail, KeyRound, CheckCircle } from 'lucide-react-native';
import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/contexts/LanguageContext';

interface PostPurchaseAccountModalProps {
  visible: boolean;
  onClose: () => void;
}

export default function PostPurchaseAccountModal({ visible, onClose }: PostPurchaseAccountModalProps) {
  const { user, session, sendOtpCode, verifyOtpCode } = useAuth();
  const { t } = useTranslation();

  const [step, setStep] = useState<'email' | 'code' | 'success'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (visible && (user || session)) {
      onClose();
    }
  }, [user, session, visible, onClose]);

  useEffect(() => {
    if (!visible) {
      setStep('email');
      setEmail('');
      setCode('');
      setError('');
      setLoading(false);
    }
  }, [visible]);

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleSendCode = async () => {
    if (!email.trim()) {
      setError(t('invalidEmail') || 'Adresse email invalide');
      return;
    }

    if (!validateEmail(email)) {
      setError(t('invalidEmail') || 'Adresse email invalide');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { error: sendError } = await sendOtpCode(email.trim());

      if (sendError) {
        setError(sendError.message || t('emailLinkError'));
      } else {
        setStep('code');
      }
    } catch {
      setError(t('emailLinkError') || 'Une erreur est survenue');
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
        setError(verifyError.message || t('invalidCode'));
      } else {
        setStep('success');
        setTimeout(() => {
          onClose();
        }, 2000);
      }
    } catch {
      setError(t('invalidCode') || 'Code invalide');
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

  const handleLater = () => {
    onClose();
  };

  const handleBackdropPress = () => {
    if (!loading) {
      onClose();
    }
  };

  const renderEmailStep = () => (
    <>
      <View style={styles.iconContainer}>
        <Mail size={48} color="#10b981" strokeWidth={2} />
      </View>

      <Text style={styles.title}>{t('postPurchaseTitle') || 'Sécurisez vos photos et votre abonnement'}</Text>
      <Text style={styles.description}>{t('postPurchaseDescription') || 'Connectez-vous pour retrouver vos dédicaces et conserver votre abonnement si vous changez d\'appareil.'}</Text>

      <TextInput
        style={[styles.input, error && styles.inputError]}
        placeholder={t('postPurchasePlaceholder') || 'Votre adresse email'}
        placeholderTextColor="#666666"
        value={email}
        onChangeText={(text) => {
          setEmail(text);
          setError('');
        }}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        editable={!loading}
      />

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <TouchableOpacity
        style={[styles.primaryButton, loading && styles.buttonDisabled]}
        onPress={handleSendCode}
        disabled={loading}
        activeOpacity={0.8}
      >
        {loading ? (
          <ActivityIndicator size="small" color="#ffffff" />
        ) : (
          <Text style={styles.primaryButtonText}>{t('sendCode') || 'Envoyer le code'}</Text>
        )}
      </TouchableOpacity>

      <View style={styles.infoContainer}>
        <Text style={styles.infoText}>{t('noPasswordRequired') || 'Pas de mot de passe requis'}</Text>
      </View>

      <TouchableOpacity
        style={styles.laterButton}
        onPress={handleLater}
        activeOpacity={0.8}
      >
        <Text style={styles.laterButtonText}>{t('postPurchaseLater') || 'Plus tard'}</Text>
      </TouchableOpacity>
    </>
  );

  const renderCodeStep = () => (
    <>
      <View style={styles.iconContainer}>
        <KeyRound size={48} color="#10b981" strokeWidth={2} />
      </View>

      <Text style={styles.title}>{t('enterCode') || 'Entrez le code'}</Text>
      <Text style={styles.description}>
        {t('codeSentToEmail') || `Nous avons envoyé un code à 6 chiffres à ${email}. Copiez-collez le code ci-dessous.`}
      </Text>

      <TextInput
        style={[styles.input, styles.codeInput, error && styles.inputError]}
        placeholder="123456"
        placeholderTextColor="#666666"
        value={code}
        onChangeText={(text) => {
          setCode(text.replace(/[^0-9]/g, '').slice(0, 6));
          setError('');
        }}
        keyboardType="number-pad"
        maxLength={6}
        editable={!loading}
      />

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <TouchableOpacity
        style={[styles.primaryButton, loading && styles.buttonDisabled]}
        onPress={handleVerifyCode}
        disabled={loading}
        activeOpacity={0.8}
      >
        {loading ? (
          <ActivityIndicator size="small" color="#ffffff" />
        ) : (
          <Text style={styles.primaryButtonText}>{t('verify') || 'Vérifier'}</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.resendButton}
        onPress={handleResendCode}
        disabled={loading}
        activeOpacity={0.8}
      >
        <Text style={styles.resendButtonText}>{t('resendCode') || 'Renvoyer le code'}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.laterButton}
        onPress={() => setStep('email')}
        activeOpacity={0.8}
      >
        <Text style={styles.laterButtonText}>{t('changeEmail') || 'Changer d\'email'}</Text>
      </TouchableOpacity>
    </>
  );

  const renderSuccessStep = () => (
    <>
      <View style={[styles.iconContainer, styles.successIcon]}>
        <CheckCircle size={48} color="#10b981" strokeWidth={2} />
      </View>

      <Text style={styles.title}>{t('connectionSuccess') || 'Connexion réussie !'}</Text>
      <Text style={styles.description}>
        {t('accountSecured') || 'Votre compte est maintenant sécurisé. Vos photos et abonnement seront synchronisés.'}
      </Text>
    </>
  );

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={handleLater}
    >
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={handleBackdropPress}
      >
        <TouchableOpacity
          style={styles.card}
          activeOpacity={1}
          onPress={(e) => e.stopPropagation()}
        >
          <TouchableOpacity
            style={styles.closeButton}
            onPress={handleLater}
            activeOpacity={0.8}
          >
            <X size={24} color="#ffffff" strokeWidth={2} />
          </TouchableOpacity>

          <View style={styles.content}>
            {step === 'email' && renderEmailStep()}
            {step === 'code' && renderCodeStep()}
            {step === 'success' && renderSuccessStep()}
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 24,
    width: '100%',
    maxWidth: 440,
    position: 'relative',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 16,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  content: {
    padding: 28,
    paddingTop: 40,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: 24,
  },
  successIcon: {
    backgroundColor: 'rgba(16, 185, 129, 0.25)',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 32,
  },
  description: {
    fontSize: 16,
    color: '#a3a3a3',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 28,
  },
  input: {
    backgroundColor: '#0a0a0a',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#ffffff',
    marginBottom: 8,
    borderWidth: 2,
    borderColor: '#2a2a2a',
  },
  codeInput: {
    fontSize: 24,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: 4,
  },
  inputError: {
    borderColor: '#ef4444',
  },
  errorText: {
    color: '#ef4444',
    fontSize: 14,
    marginBottom: 12,
    marginLeft: 4,
  },
  primaryButton: {
    backgroundColor: '#10b981',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 16,
    minHeight: 52,
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  infoContainer: {
    marginBottom: 20,
    alignItems: 'center',
  },
  infoText: {
    fontSize: 13,
    color: '#737373',
    textAlign: 'center',
    lineHeight: 20,
  },
  resendButton: {
    paddingVertical: 8,
    alignItems: 'center',
    marginBottom: 8,
  },
  resendButtonText: {
    color: '#10b981',
    fontSize: 15,
    fontWeight: '500',
  },
  laterButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  laterButtonText: {
    color: '#a3a3a3',
    fontSize: 15,
    fontWeight: '500',
  },
});
