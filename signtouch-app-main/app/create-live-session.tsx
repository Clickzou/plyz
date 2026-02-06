import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Image,
  Platform,
} from 'react-native';
import { showAlert } from '@/utils/alertHelper';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Clock, Users, DollarSign, Play, Star, Camera, RotateCcw, Info, ChevronDown, ChevronUp } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Slider from '@react-native-community/slider';
import * as ImagePicker from 'expo-image-picker';
import { useLanguage } from '@/contexts/LanguageContext';
import { createLiveSession, uploadCoverPhoto } from '@/utils/liveSessionStorage';

const formatDuration = (minutes: number): string => {
  if (minutes < 1) {
    return `${Math.round(minutes * 60)} sec`;
  } else if (minutes < 60) {
    return `${Math.round(minutes)} min`;
  } else {
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    if (mins === 0) {
      return `${hours}h`;
    }
    return `${hours}h${mins.toString().padStart(2, '0')}`;
  }
};

const PRICE_OPTIONS = [
  { label: '2€', value: 200 },
  { label: '5€', value: 500 },
  { label: '10€', value: 1000 },
  { label: '20€', value: 2000 },
  { label: '50€', value: 5000 },
  { label: '100€', value: 10000 },
];

const STORE_FEES = 0.30; // 30% Apple/Google
const SIGNTOUCH_FEES = 0.15; // 15% SignTouch
const STRIPE_PERCENT = 0.029; // 2.9% Stripe
const STRIPE_FIXED = 30; // 0.30€ par transaction (en centimes)

export default function CreateLiveSessionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();

  const [celebrityName, setCelebrityName] = useState('');
  const [durationPerFan, setDurationPerFan] = useState(5);
  const [totalDuration, setTotalDuration] = useState(10);
  const [price, setPrice] = useState(200); // Prix minimum 2€
  const [isCustomPrice, setIsCustomPrice] = useState(false);
  const [customPriceText, setCustomPriceText] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [showPaymentInfo, setShowPaymentInfo] = useState(false);
  const [nameError, setNameError] = useState(false);
  const [coverPhotoUri, setCoverPhotoUri] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState(false);

  const handleWebFileChange = useCallback((event: Event) => {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          setCoverPhotoUri(e.target.result as string);
          setPhotoError(false);
        }
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const handleTakeSelfie = async () => {
    try {
      if (Platform.OS === 'web') {
        // Use native HTML5 input with capture for camera on mobile web
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.capture = 'user'; // This opens front camera on mobile
        input.onchange = handleWebFileChange as any;
        input.click();
        return;
      }

      const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
      
      if (!permissionResult.granted) {
        const libraryResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!libraryResult.granted) {
          showAlert(t('error'), t('cameraPermissionRequired') || 'Camera permission required');
          return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.8,
        });
        if (!result.canceled && result.assets[0]) {
          setCoverPhotoUri(result.assets[0].uri);
          setPhotoError(false);
        }
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        cameraType: ImagePicker.CameraType.front,
      });

      if (!result.canceled && result.assets[0]) {
        setCoverPhotoUri(result.assets[0].uri);
        setPhotoError(false);
      }
    } catch (error) {
      console.error('Error taking selfie:', error);
      showAlert(t('error'), t('cameraError') || 'Could not access camera');
    }
  };

  const calculatedMaxFans = Math.floor(totalDuration / durationPerFan);
  
  const handleDurationPerFanChange = (value: number) => {
    setDurationPerFan(value);
    const minTotalDuration = value * 2;
    if (totalDuration < minTotalDuration) {
      setTotalDuration(Math.min(minTotalDuration, 60));
    }
    if (totalDuration > 60) {
      setTotalDuration(60);
    }
  };

  const handleTotalDurationChange = (value: number) => {
    if (value >= durationPerFan) {
      setTotalDuration(value);
    } else {
      setTotalDuration(durationPerFan);
    }
  };
  
  const minTotalDuration = Math.max(1, durationPerFan);
  
  const handlePriceSelect = (value: number) => {
    setPrice(value);
    setIsCustomPrice(false);
    setCustomPriceText('');
  };

  const handleCustomPriceChange = (text: string) => {
    const numericText = text.replace(/[^0-9]/g, '');
    setCustomPriceText(numericText);
    if (numericText) {
      setPrice(parseInt(numericText) * 100);
    } else {
      setPrice(0);
    }
  };

  const handleCreateSession = async () => {
    console.log('[CreateSession] Button pressed, name:', celebrityName, 'photo:', coverPhotoUri ? 'YES' : 'NO');
    let hasError = false;
    
    if (!celebrityName.trim()) {
      setNameError(true);
      hasError = true;
    }
    
    if (!coverPhotoUri) {
      setPhotoError(true);
      hasError = true;
    }
    
    if (hasError) {
      console.log('[CreateSession] Validation failed - name:', !celebrityName.trim(), 'photo:', !coverPhotoUri);
      showAlert(t('error') || 'Erreur', t('liveSessionFieldsRequired') || 'Veuillez remplir le nom et prendre une photo');
      return;
    }
    setNameError(false);

    setIsCreating(true);
    setNameError(false);
    setPhotoError(false);
    console.log('[CreateSession] Starting session creation...');
    try {
      const celebrityId = `celebrity_${Date.now()}`;
      let session;
      
      const generateCode = () => {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code = '';
        for (let i = 0; i < 6; i++) {
          code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
      };

      let uploadedPhotoUrl: string | null = null;
      if (coverPhotoUri) {
        const tempId = `temp_${Date.now()}`;
        uploadedPhotoUrl = await uploadCoverPhoto(tempId, coverPhotoUri);
      }

      const createLocalSession = () => {
        const now = new Date();
        const expiresAt = new Date(now.getTime() + totalDuration * 60 * 1000);
        return {
          id: `local_session_${Date.now()}`,
          code: generateCode(),
          celebrity_id: celebrityId,
          celebrity_name: celebrityName.trim(),
          duration_minutes: totalDuration,
          duration_per_fan_minutes: durationPerFan,
          max_slots: calculatedMaxFans,
          price_cents: price,
          status: 'active',
          current_fan_id: null,
          queue: [],
          created_at: now.toISOString(),
          expires_at: expiresAt.toISOString(),
          cover_photo_url: uploadedPhotoUrl,
        };
      };
      
      try {
        session = await createLiveSession(
          celebrityId,
          celebrityName.trim(),
          totalDuration,
          calculatedMaxFans,
          price,
          durationPerFan,
          uploadedPhotoUrl
        );
        if (!session) {
          console.log('Supabase returned null, creating local session');
          session = createLocalSession();
        }
      } catch (supabaseError) {
        console.log('Supabase error, creating local session:', supabaseError);
        session = createLocalSession();
      }

      console.log('Session created:', session);
      router.replace({
        pathname: '/live-session-dashboard',
        params: { sessionId: session.id },
      });
    } catch (error) {
      console.error('Error creating session:', error);
      showAlert(t('error'), t('liveSessionCreateError'));
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={['#1a1a2e', '#16213e', '#0f3460']}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <ArrowLeft size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('createLiveSession')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionTitle}>{t('liveSessionCoverPhoto') || 'Your Cover Photo'}</Text>
        <Text style={styles.sectionHint}>{t('liveSessionCoverPhotoHint') || 'Take a selfie to show fans who is hosting'}</Text>
        
        <TouchableOpacity 
          style={[styles.selfieContainer, photoError && styles.selfieContainerError]} 
          onPress={handleTakeSelfie}
        >
          {coverPhotoUri ? (
            <View style={styles.selfiePreviewContainer}>
              <Image source={{ uri: coverPhotoUri }} style={styles.selfiePreview} />
              <TouchableOpacity style={styles.retakeSelfieButton} onPress={handleTakeSelfie}>
                <RotateCcw size={16} color="#fff" />
                <Text style={styles.retakeSelfieText}>{t('retake') || 'Retake'}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.selfiePrompt}>
              <View style={styles.selfieIconCircle}>
                <Camera size={40} color="#10B981" />
              </View>
              <Text style={styles.selfiePromptText}>{t('tapToTakeSelfie') || 'Tap to take a selfie'}</Text>
            </View>
          )}
        </TouchableOpacity>
        {photoError && (
          <Text style={styles.errorText}>{t('liveSessionPhotoRequired') || 'Please take a cover photo'}</Text>
        )}

        <Text style={styles.sectionTitle}>{t('liveSessionYourName')}</Text>
        <TextInput
          style={[styles.nameInput, nameError && styles.nameInputError]}
          placeholder={t('liveSessionNamePlaceholder')}
          placeholderTextColor="rgba(255,255,255,0.6)"
          value={celebrityName}
          onChangeText={(text) => {
            setCelebrityName(text);
            if (text.trim()) setNameError(false);
          }}
          maxLength={50}
        />
        {nameError && (
          <Text style={styles.errorText}>{t('liveSessionNameRequired') || 'Veuillez entrer votre nom'}</Text>
        )}

        <Text style={styles.sectionTitle}>{t('liveSessionDurationPerFan') || 'Durée par Fan'}</Text>
        <View style={styles.sliderContainer}>
          <View style={styles.sliderValueContainer}>
            <Clock size={18} color="#10B981" />
            <Text style={styles.sliderValue}>{formatDuration(durationPerFan)}</Text>
          </View>
          <Slider
            style={styles.slider}
            minimumValue={0.5}
            maximumValue={60}
            step={0.5}
            value={durationPerFan}
            onValueChange={handleDurationPerFanChange}
            minimumTrackTintColor="#10B981"
            maximumTrackTintColor="rgba(255,255,255,0.3)"
            thumbTintColor="#10B981"
          />
          <View style={styles.sliderLabels}>
            <Text style={styles.sliderLabel}>30 sec</Text>
            <Text style={styles.sliderLabel}>1h</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>{t('liveSessionTotalDuration') || 'Durée Totale'}</Text>
        <View style={styles.sliderContainer}>
          <View style={styles.sliderValueContainer}>
            <Clock size={18} color="#10B981" />
            <Text style={styles.sliderValue}>{formatDuration(totalDuration)}</Text>
          </View>
          <Slider
            style={styles.slider}
            minimumValue={minTotalDuration}
            maximumValue={60}
            step={1}
            value={totalDuration}
            onValueChange={handleTotalDurationChange}
            minimumTrackTintColor="#10B981"
            maximumTrackTintColor="rgba(255,255,255,0.3)"
            thumbTintColor="#10B981"
          />
          <View style={styles.sliderLabels}>
            <Text style={styles.sliderLabel}>{formatDuration(minTotalDuration)}</Text>
            <Text style={styles.sliderLabel}>1h</Text>
          </View>
        </View>

        <View style={styles.calculatedFansCard}>
          <Users size={20} color="#10B981" />
          <Text style={styles.calculatedFansText}>
            {t('liveSessionCalculatedFans') || 'Nombre de fans'}: <Text style={styles.calculatedFansNumber}>{calculatedMaxFans}</Text>
          </Text>
        </View>

        <Text style={styles.sectionTitle}>{t('liveSessionPrice')}</Text>
        <Text style={styles.sectionSubtitle}>{t('liveSessionPriceHint')}</Text>
        <View style={styles.optionsRow}>
          {PRICE_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.optionButton,
                !isCustomPrice && price === option.value && styles.optionButtonActive,
              ]}
              onPress={() => handlePriceSelect(option.value)}
            >
              <DollarSign size={16} color={!isCustomPrice && price === option.value ? '#10B981' : '#fff'} />
              <Text
                style={[
                  styles.optionText,
                  !isCustomPrice && price === option.value && styles.optionTextActive,
                ]}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={[
              styles.optionButton,
              isCustomPrice && styles.optionButtonActive,
            ]}
            onPress={() => setIsCustomPrice(true)}
          >
            <DollarSign size={16} color={isCustomPrice ? '#10B981' : '#fff'} />
            <Text
              style={[
                styles.optionText,
                isCustomPrice && styles.optionTextActive,
              ]}
            >
              {t('liveSessionCustomPrice') || 'Autre'}
            </Text>
          </TouchableOpacity>
        </View>
        {isCustomPrice && (
          <View style={styles.customPriceContainer}>
            <TextInput
              style={styles.customPriceInput}
              placeholder="Ex: 15"
              placeholderTextColor="rgba(255,255,255,0.6)"
              value={customPriceText}
              onChangeText={handleCustomPriceChange}
              keyboardType="numeric"
              maxLength={4}
            />
            <Text style={styles.customPriceLabel}>€ par signature</Text>
          </View>
        )}

        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>{t('yourEarnings') || 'Vos revenus'}</Text>
          {(() => {
            const grossCents = price * calculatedMaxFans;
            const storeFeesCents = grossCents * STORE_FEES;
            const signTouchFeesCents = grossCents * SIGNTOUCH_FEES;
            const beforeStripeCents = grossCents - storeFeesCents - signTouchFeesCents;
            const stripePercentCents = beforeStripeCents * STRIPE_PERCENT;
            const stripeFixedCents = STRIPE_FIXED * calculatedMaxFans;
            const stripeTotalCents = stripePercentCents + stripeFixedCents;
            const netCents = beforeStripeCents - stripeTotalCents;
            
            return (
              <Text style={styles.revenueAmount}>
                {(netCents / 100).toFixed(0)}€
              </Text>
            );
          })()}
          <Text style={styles.revenueExplanation}>
            {t('earningsExplanation') || 'Montant estimé si tous les fans complètent la session'}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.paymentInfoToggle}
          onPress={() => setShowPaymentInfo(!showPaymentInfo)}
        >
          <View style={styles.paymentInfoToggleLeft}>
            <Info size={18} color="#fbbf24" />
            <Text style={styles.paymentInfoToggleText}>{t('paymentDelaysTitle')}</Text>
          </View>
          {showPaymentInfo ? <ChevronUp size={18} color="rgba(255,255,255,0.6)" /> : <ChevronDown size={18} color="rgba(255,255,255,0.6)" />}
        </TouchableOpacity>

        {showPaymentInfo && (
          <View style={styles.paymentInfoCard}>
            <Text style={styles.paymentInfoIntro}>{t('paymentDelaysIntro')}</Text>

            <View style={styles.paymentPlatformCard}>
              <Text style={styles.paymentPlatformTitle}>🍎 {t('paymentAppleTitle')}</Text>
              <View style={styles.paymentDelayBadge}>
                <Clock size={14} color="#fbbf24" />
                <Text style={styles.paymentDelayText}>{t('paymentAppleDelay')}</Text>
              </View>
              <Text style={styles.paymentExampleText}>{t('paymentAppleExample')}</Text>
            </View>

            <View style={styles.paymentPlatformCard}>
              <Text style={styles.paymentPlatformTitle}>🤖 {t('paymentGoogleTitle')}</Text>
              <View style={styles.paymentDelayBadge}>
                <Clock size={14} color="#4ade80" />
                <Text style={styles.paymentDelayText}>{t('paymentGoogleDelay')}</Text>
              </View>
              <Text style={styles.paymentExampleText}>{t('paymentGoogleExample')}</Text>
            </View>

            <View style={styles.paymentNoteCard}>
              <Info size={14} color="rgba(255,255,255,0.5)" />
              <Text style={styles.paymentNoteText}>{t('paymentDelaysNote')}</Text>
            </View>
          </View>
        )}

        <TouchableOpacity
          style={[styles.createButton, isCreating && styles.createButtonDisabled]}
          onPress={handleCreateSession}
          disabled={isCreating}
        >
          {isCreating ? (
            <ActivityIndicator color="#10B981" />
          ) : (
            <>
              <Play size={24} color="#ffffff" fill="#ffffff" />
              <Text style={styles.createButtonText}>{t('liveSessionStart')}</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginTop: 20,
    marginBottom: 8,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    marginBottom: 8,
  },
  nameInput: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#fff',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  nameInputError: {
    borderColor: '#ef4444',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  errorText: {
    color: '#ef4444',
    fontSize: 14,
    marginTop: 8,
    fontWeight: '500',
  },
  sectionHint: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 12,
    textAlign: 'center',
  },
  selfieContainer: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderWidth: 3,
    borderColor: 'rgba(16, 185, 129, 0.5)',
    borderStyle: 'dashed',
    alignSelf: 'center',
    marginBottom: 16,
    overflow: 'hidden',
  },
  selfieContainerError: {
    borderColor: '#ef4444',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  selfiePreviewContainer: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  selfiePreview: {
    width: '100%',
    height: '100%',
    borderRadius: 80,
  },
  retakeSelfieButton: {
    position: 'absolute',
    bottom: 8,
    left: '50%',
    transform: [{ translateX: -40 }],
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  retakeSelfieText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  selfiePrompt: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  selfieIconCircle: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  selfiePromptText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    textAlign: 'center',
  },
  optionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 25,
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  optionButtonActive: {
    backgroundColor: '#fff',
    borderColor: '#fff',
  },
  optionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  sliderContainer: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 8,
  },
  sliderValueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sliderValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#10B981',
  },
  slider: {
    width: '100%',
    height: 40,
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  sliderLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
  },
  calculatedFansCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.5)',
  },
  calculatedFansText: {
    fontSize: 16,
    color: '#fff',
  },
  calculatedFansNumber: {
    fontWeight: '700',
    color: '#10B981',
    fontSize: 18,
  },
  customPriceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 8,
  },
  customPriceInput: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  customPriceLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  optionTextActive: {
    color: '#10B981',
  },
  summaryCard: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 16,
    padding: 20,
    marginTop: 24,
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 16,
    textAlign: 'center',
  },
  revenueAmount: {
    fontSize: 36,
    fontWeight: '700',
    color: '#4ade80',
    textAlign: 'center',
  },
  revenueExplanation: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 18,
  },
  feesBreakdown: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  feeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  feeRowTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.2)',
  },
  feeLabel: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
  },
  feeLabelTotal: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  feeValue: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
  },
  feeValueNegative: {
    fontSize: 13,
    color: '#f87171',
  },
  feeValueTotal: {
    fontSize: 14,
    fontWeight: '700',
    color: '#4ade80',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  summaryLabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  summaryValueHighlight: {
    fontSize: 16,
    fontWeight: '700',
    color: '#4ade80',
  },
  summaryDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginVertical: 12,
  },
  summaryLabelSmall: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
  },
  summaryValueSmall: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
  },
  summaryLabelHighlight: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4ade80',
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: '#188661',
    borderRadius: 30,
    paddingVertical: 18,
    marginTop: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  createButtonDisabled: {
    opacity: 0.7,
  },
  createButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
  },
  paymentInfoToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.2)',
  },
  paymentInfoToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  paymentInfoToggleText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fbbf24',
  },
  paymentInfoCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  paymentInfoIntro: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    lineHeight: 20,
    marginBottom: 16,
  },
  paymentPlatformCard: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  paymentPlatformTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  paymentDelayBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.2)',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    marginBottom: 8,
  },
  paymentDelayText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  paymentExampleText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.55)',
    lineHeight: 18,
  },
  paymentNoteCard: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
    padding: 12,
    marginTop: 4,
  },
  paymentNoteText: {
    flex: 1,
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    lineHeight: 18,
    fontStyle: 'italic',
  },
});
