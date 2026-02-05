import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Star, AlertTriangle, X } from 'lucide-react-native';
import { useLanguage } from '@/contexts/LanguageContext';

interface RatingModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (rating: number) => Promise<void>;
  userName: string;
  isCelebrity: boolean;
}

export default function RatingModal({
  visible,
  onClose,
  onSubmit,
  userName,
  isCelebrity,
}: RatingModalProps) {
  const { t } = useLanguage();
  const [selectedRating, setSelectedRating] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (selectedRating === 0) return;
    
    setIsSubmitting(true);
    try {
      await onSubmit(selectedRating);
      setSelectedRating(0);
      onClose();
    } catch (error) {
      console.error('Error submitting rating:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSkip = () => {
    setSelectedRating(0);
    onClose();
  };

  const renderStars = () => {
    return (
      <View style={styles.starsContainer}>
        {[1, 2, 3, 4, 5].map((star) => (
          <TouchableOpacity
            key={star}
            onPress={() => setSelectedRating(star)}
            style={styles.starButton}
          >
            <Star
              size={48}
              color={star <= selectedRating ? '#fbbf24' : 'rgba(255,255,255,0.3)'}
              fill={star <= selectedRating ? '#fbbf24' : 'transparent'}
            />
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  const getTitle = () => {
    if (isCelebrity) {
      return t('rateFan') || 'Rate this fan';
    }
    return t('rateCelebrity') || 'Rate your experience';
  };

  const getExplanation = () => {
    if (isCelebrity) {
      return t('rateFanExplanation') || 
        'Your rating helps maintain a respectful community. Fans with an average rating below 3 stars may be banned from future sessions.';
    }
    return t('rateCelebrityExplanation') || 
      'Your feedback helps improve the experience. Celebrities with low ratings will be reviewed by our team.';
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleSkip}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          <LinearGradient
            colors={['#1a1a2e', '#16213e', '#0f3460']}
            style={styles.gradientBackground}
          />
          
          <TouchableOpacity style={styles.closeButton} onPress={handleSkip}>
            <X size={24} color="rgba(255,255,255,0.5)" />
          </TouchableOpacity>

          <View style={styles.content}>
            <Text style={styles.title}>{getTitle()}</Text>
            <Text style={styles.userName}>{userName}</Text>

            {renderStars()}

            <View style={styles.explanationCard}>
              <AlertTriangle size={20} color="#f59e0b" />
              <Text style={styles.explanationText}>{getExplanation()}</Text>
            </View>

            <View style={styles.ratingLabels}>
              <Text style={styles.ratingLabel}>
                {t('rating1Star') || '1 = Very bad behavior'}
              </Text>
              <Text style={styles.ratingLabel}>
                {t('rating3Star') || '3 = Average'}
              </Text>
              <Text style={styles.ratingLabel}>
                {t('rating5Star') || '5 = Excellent'}
              </Text>
            </View>

            <TouchableOpacity
              style={[
                styles.submitButton,
                selectedRating === 0 && styles.submitButtonDisabled,
              ]}
              onPress={handleSubmit}
              disabled={selectedRating === 0 || isSubmitting}
            >
              <LinearGradient
                colors={selectedRating > 0 ? ['#10B981', '#059669'] : ['#4b5563', '#374151']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.submitButtonGradient}
              >
                {isSubmitting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.submitButtonText}>
                    {t('submitRating') || 'Submit Rating'}
                  </Text>
                )}
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
              <Text style={styles.skipButtonText}>
                {t('skipRating') || 'Skip'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 24,
    overflow: 'hidden',
    position: 'relative',
  },
  gradientBackground: {
    ...StyleSheet.absoluteFillObject,
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 10,
    padding: 8,
  },
  content: {
    padding: 32,
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
    textAlign: 'center',
  },
  userName: {
    fontSize: 20,
    fontWeight: '600',
    color: '#10B981',
    marginBottom: 24,
    textAlign: 'center',
  },
  starsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 24,
  },
  starButton: {
    padding: 4,
  },
  explanationCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderRadius: 12,
    padding: 16,
    gap: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  explanationText: {
    flex: 1,
    fontSize: 13,
    color: '#fbbf24',
    lineHeight: 20,
  },
  ratingLabels: {
    alignItems: 'center',
    marginBottom: 24,
    gap: 6,
  },
  ratingLabel: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.6)',
  },
  submitButton: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 12,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonGradient: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  skipButton: {
    paddingVertical: 12,
  },
  skipButtonText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.5)',
  },
});
