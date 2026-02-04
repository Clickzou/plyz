import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Clock, Users, DollarSign, Play, Star } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Slider from '@react-native-community/slider';
import { useLanguage } from '@/contexts/LanguageContext';
import { createLiveSession } from '@/utils/liveSessionStorage';

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

const SIGNTOUCH_COMMISSION = 0.10; // 10% commission

export default function CreateLiveSessionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();

  const [celebrityName, setCelebrityName] = useState('');
  const [durationPerFan, setDurationPerFan] = useState(5);
  const [totalDuration, setTotalDuration] = useState(30);
  const [price, setPrice] = useState(200); // Prix minimum 2€
  const [isCustomPrice, setIsCustomPrice] = useState(false);
  const [customPriceText, setCustomPriceText] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [nameError, setNameError] = useState(false);

  const calculatedMaxFans = Math.floor(totalDuration / durationPerFan);
  
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
    if (!celebrityName.trim()) {
      setNameError(true);
      Alert.alert(t('error') || 'Erreur', t('liveSessionNameRequired') || 'Veuillez entrer votre nom');
      return;
    }
    setNameError(false);

    setIsCreating(true);
    console.log('Starting session creation...');
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

      const createLocalSession = () => {
        const now = new Date();
        const expiresAt = new Date(now.getTime() + totalDuration * 60 * 1000);
        return {
          id: `local_session_${Date.now()}`,
          code: generateCode(),
          celebrity_id: celebrityId,
          celebrity_name: celebrityName.trim(),
          duration_minutes: totalDuration,
          max_slots: calculatedMaxFans,
          price_cents: price,
          status: 'active',
          current_fan_id: null,
          queue: [],
          created_at: now.toISOString(),
          expires_at: expiresAt.toISOString(),
        };
      };
      
      try {
        session = await createLiveSession(
          celebrityId,
          celebrityName.trim(),
          totalDuration,
          calculatedMaxFans,
          price
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
      Alert.alert(t('error'), t('liveSessionCreateError'));
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
        <View style={styles.iconContainer}>
          <Star size={60} color="#fff" fill="#fff" />
        </View>

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
            onValueChange={setDurationPerFan}
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
            minimumValue={10}
            maximumValue={300}
            step={5}
            value={totalDuration}
            onValueChange={setTotalDuration}
            minimumTrackTintColor="#10B981"
            maximumTrackTintColor="rgba(255,255,255,0.3)"
            thumbTintColor="#10B981"
          />
          <View style={styles.sliderLabels}>
            <Text style={styles.sliderLabel}>10 min</Text>
            <Text style={styles.sliderLabel}>5h</Text>
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
          <Text style={styles.summaryTitle}>{t('liveSessionSummary')}</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>{t('liveSessionDurationPerFan') || 'Durée par Fan'}:</Text>
            <Text style={styles.summaryValue}>{durationPerFan} min</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>{t('liveSessionTotalDuration') || 'Durée Totale'}:</Text>
            <Text style={styles.summaryValue}>{totalDuration} min</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>{t('liveSessionMaxSlots')}:</Text>
            <Text style={styles.summaryValue}>{calculatedMaxFans} fans</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>{t('liveSessionPrice')}:</Text>
            <Text style={styles.summaryValue}>{price / 100}€ par fan</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Revenu total potentiel:</Text>
            <Text style={styles.summaryValue}>{(price * calculatedMaxFans / 100).toFixed(0)}€</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabelSmall}>Frais de fonctionnement (10%):</Text>
            <Text style={styles.summaryValueSmall}>-{(price * calculatedMaxFans * SIGNTOUCH_COMMISSION / 100).toFixed(0)}€</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabelHighlight}>{t('liveSessionYourRevenue')}:</Text>
            <Text style={styles.summaryValueHighlight}>
              {(price * calculatedMaxFans * (1 - SIGNTOUCH_COMMISSION) / 100).toFixed(0)}€ max
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.createButton, isCreating && styles.createButtonDisabled]}
          onPress={handleCreateSession}
          disabled={isCreating}
        >
          {isCreating ? (
            <ActivityIndicator color="#10B981" />
          ) : (
            <>
              <Play size={24} color="#10B981" fill="#10B981" />
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
    backgroundColor: '#fff',
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
    color: '#10B981',
  },
});
