import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, ActivityIndicator, Platform } from 'react-native';
import { X, Mail } from 'lucide-react-native';
import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/contexts/LanguageContext';

interface PostPurchaseAccountModalProps {
  visible: boolean;
  onClose: () => void;
}

export default function PostPurchaseAccountModal({ visible, onClose }: PostPurchaseAccountModalProps) {
  const { user, session, sendMagicLink } = useAuth();
  const { t, language } = useTranslation();

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (visible && (user || session)) {
      onClose();
    }
  }, [user, session, visible, onClose]);

  useEffect(() => {
    if (!visible) {
      setEmail('');
      setError('');
      setSuccess(false);
      setLoading(false);
    }
  }, [visible]);

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleSendLink = async () => {
    if (!email.trim()) {
      setError(t('invalidEmail'));
      return;
    }

    if (!validateEmail(email)) {
      setError(t('invalidEmail'));
      return;
    }

    setLoading(true);
    setError('');
    setSuccess(false);

    try {
      const { error: sendError } = await sendMagicLink(email, language);

      if (sendError) {
        setError(sendError.message || t('emailLinkError'));
      } else {
        setSuccess(true);
        setEmail('');
      }
    } catch (_err) {
      setError(t('emailLinkError'));
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
            <View style={styles.iconContainer}>
              <Mail size={48} color="#10b981" strokeWidth={2} />
            </View>

            <Text style={styles.title}>{t('postPurchaseTitle')}</Text>
            <Text style={styles.description}>{t('postPurchaseDescription')}</Text>

            {success ? (
              <View style={styles.successContainer}>
                <Text style={styles.successText}>{t('postPurchaseSuccess')}</Text>
              </View>
            ) : (
              <>
                <TextInput
                  style={[styles.input, error && styles.inputError]}
                  placeholder={t('postPurchasePlaceholder')}
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
                  onPress={handleSendLink}
                  disabled={loading}
                  activeOpacity={0.8}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text style={styles.primaryButtonText}>{t('postPurchaseSendLink')}</Text>
                  )}
                </TouchableOpacity>

                <View style={styles.infoContainer}>
                  <Text style={styles.infoText}>{t('noPasswordRequired')}</Text>
                  <Text style={styles.infoText}>{t('postPurchaseSecureLink')}</Text>
                </View>

                <TouchableOpacity
                  style={styles.laterButton}
                  onPress={handleLater}
                  activeOpacity={0.8}
                >
                  <Text style={styles.laterButtonText}>{t('postPurchaseLater')}</Text>
                </TouchableOpacity>
              </>
            )}
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
  laterButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  laterButtonText: {
    color: '#a3a3a3',
    fontSize: 15,
    fontWeight: '500',
  },
  successContainer: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderRadius: 12,
    padding: 20,
    marginTop: 8,
  },
  successText: {
    color: '#10b981',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
});
