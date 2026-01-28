import { View, Text, StyleSheet, Modal, TouchableOpacity } from 'react-native';
import { Crown, Clock } from 'lucide-react-native';
import { useTranslation } from '@/contexts/LanguageContext';

interface TrialModalProps {
  visible: boolean;
  daysRemaining: number;
  isExpired: boolean;
  onSubscribe: () => void;
  onLater?: () => void;
}

export default function TrialModal({ 
  visible, 
  daysRemaining, 
  isExpired, 
  onSubscribe, 
  onLater 
}: TrialModalProps) {
  const { t } = useTranslation();

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={isExpired ? undefined : onLater}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.iconContainer}>
            <Crown size={48} color="#10b981" />
          </View>

          <Text style={styles.title}>
            {isExpired 
              ? (t('trialExpired') || 'Votre essai gratuit est terminé')
              : (t('chooseSubscription') || 'Choisir mon abonnement')
            }
          </Text>

          {!isExpired && (
            <View style={styles.counterContainer}>
              <Clock size={20} color="#f59e0b" />
              <Text style={styles.counterText}>
                {t('freeAppRemaining') || 'Votre app gratuite encore'}{' '}
                <Text style={styles.counterDays}>{daysRemaining}</Text>{' '}
                {daysRemaining === 1 ? (t('day') || 'jour') : (t('days') || 'jours')}
              </Text>
            </View>
          )}

          {isExpired && (
            <Text style={styles.expiredText}>
              {t('subscribeToAccess') || 'Abonnez-vous pour continuer à utiliser SignTouch'}
            </Text>
          )}

          <TouchableOpacity
            style={styles.subscribeButton}
            onPress={onSubscribe}
            activeOpacity={0.8}
          >
            <Crown size={20} color="#fff" />
            <Text style={styles.subscribeButtonText}>
              {t('choosePlan') || 'Choisir mon offre'}
            </Text>
          </TouchableOpacity>

          {!isExpired && onLater && (
            <TouchableOpacity
              style={styles.laterButton}
              onPress={onLater}
              activeOpacity={0.7}
            >
              <Text style={styles.laterButtonText}>
                {t('maybeLater') || 'Plus tard'}
              </Text>
            </TouchableOpacity>
          )}
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
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 16,
  },
  counterContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginBottom: 24,
  },
  counterText: {
    fontSize: 15,
    color: '#f59e0b',
  },
  counterDays: {
    fontWeight: '700',
    fontSize: 18,
  },
  expiredText: {
    fontSize: 15,
    color: '#9ca3af',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  subscribeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    width: '100%',
    backgroundColor: '#10b981',
    paddingVertical: 16,
    borderRadius: 14,
    marginBottom: 12,
  },
  subscribeButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
  },
  laterButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  laterButtonText: {
    fontSize: 15,
    color: '#9ca3af',
  },
});
