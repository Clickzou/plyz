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
import { Star, X, Shield, Heart } from 'lucide-react-native';
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

  const getRatingEmoji = () => {
    if (selectedRating === 0) return '';
    if (selectedRating <= 2) return '😕';
    if (selectedRating === 3) return '😊';
    if (selectedRating === 4) return '😄';
    return '🤩';
  };

  const getRatingLabel = () => {
    if (selectedRating === 0) return '';
    if (selectedRating === 1) return t('rating1Star') || 'Very poor';
    if (selectedRating === 2) return t('rating2Star') || 'Poor';
    if (selectedRating === 3) return t('rating3Star') || 'Average';
    if (selectedRating === 4) return t('rating4Star') || 'Good';
    return t('rating5Star') || 'Excellent';
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
        'Your rating helps maintain a respectful community. Fans with low ratings may be restricted from future sessions.';
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
            <X size={20} color="rgba(255,255,255,0.4)" />
          </TouchableOpacity>

          <View style={styles.content}>
            <View style={styles.iconCircle}>
              {isCelebrity ? (
                <Shield size={28} color="#818cf8" />
              ) : (
                <Heart size={28} color="#f472b6" />
              )}
            </View>

            <Text style={styles.title}>{getTitle()}</Text>
            <Text style={styles.userName}>{userName}</Text>

            <View style={styles.starsContainer}>
              {[1, 2, 3, 4, 5].map((star) => (
                <TouchableOpacity
                  key={star}
                  onPress={() => setSelectedRating(star)}
                  style={styles.starButton}
                  activeOpacity={0.7}
                >
                  <Star
                    size={40}
                    color={star <= selectedRating ? '#fbbf24' : 'rgba(255,255,255,0.15)'}
                    fill={star <= selectedRating ? '#fbbf24' : 'transparent'}
                  />
                </TouchableOpacity>
              ))}
            </View>

            {selectedRating > 0 && (
              <View style={styles.ratingFeedback}>
                <Text style={styles.ratingEmoji}>{getRatingEmoji()}</Text>
                <Text style={styles.ratingLabelText}>{getRatingLabel()}</Text>
              </View>
            )}

            {selectedRating === 0 && (
              <Text style={styles.tapHint}>
                {t('tapToRate') || 'Tap a star to rate'}
              </Text>
            )}

            <View style={styles.divider} />

            <View style={styles.explanationCard}>
              <Text style={styles.explanationText}>{getExplanation()}</Text>
            </View>

            <TouchableOpacity
              style={[
                styles.submitButton,
                selectedRating === 0 && styles.submitButtonDisabled,
              ]}
              onPress={handleSubmit}
              disabled={selectedRating === 0 || isSubmitting}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={selectedRating > 0 ? ['#8b5cf6', '#6d28d9'] : ['#4b5563', '#374151']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.submitButtonGradient}
              >
                {isSubmitting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.submitButtonText}>
                    {t('submitRating') || 'Submit'}
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
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 28,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  gradientBackground: {
    ...StyleSheet.absoluteFillObject,
  },
  closeButton: {
    position: 'absolute',
    top: 14,
    right: 14,
    zIndex: 10,
    padding: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 20,
  },
  content: {
    padding: 28,
    paddingTop: 32,
    alignItems: 'center',
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 6,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  userName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#a78bfa',
    marginBottom: 28,
    textAlign: 'center',
  },
  starsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
  },
  starButton: {
    padding: 6,
  },
  ratingFeedback: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
    minHeight: 32,
  },
  ratingEmoji: {
    fontSize: 22,
  },
  ratingLabelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fbbf24',
  },
  tapHint: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.35)',
    marginBottom: 4,
    minHeight: 32,
    textAlignVertical: 'center',
    lineHeight: 32,
  },
  divider: {
    width: 48,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 1,
    marginVertical: 16,
  },
  explanationCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 18,
    marginBottom: 24,
    width: '100%',
  },
  explanationText: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.5)',
    lineHeight: 19,
    textAlign: 'center',
  },
  submitButton: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 8,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonGradient: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.3,
  },
  skipButton: {
    paddingVertical: 10,
  },
  skipButtonText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.4)',
  },
});
