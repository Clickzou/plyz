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
import { useLanguage } from '@/contexts/LanguageContext';
import { createLiveSession } from '@/utils/liveSessionStorage';

const DURATION_OPTIONS = [
  { label: '15 min', value: 15 },
  { label: '30 min', value: 30 },
  { label: '45 min', value: 45 },
  { label: '1h', value: 60 },
];

const SLOTS_OPTIONS = [
  { label: '25', value: 25 },
  { label: '50', value: 50 },
  { label: '75', value: 75 },
  { label: '100', value: 100 },
];

const PRICE_OPTIONS = [
  { label: 'Free', value: 0 },
  { label: '2€', value: 200 },
  { label: '3€', value: 300 },
  { label: '5€', value: 500 },
];

export default function CreateLiveSessionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();

  const [celebrityName, setCelebrityName] = useState('');
  const [duration, setDuration] = useState(30);
  const [maxSlots, setMaxSlots] = useState(50);
  const [price, setPrice] = useState(0);
  const [isCreating, setIsCreating] = useState(false);

  const handleCreateSession = async () => {
    if (!celebrityName.trim()) {
      Alert.alert(t('error'), t('liveSessionNameRequired'));
      return;
    }

    setIsCreating(true);
    try {
      const celebrityId = `celebrity_${Date.now()}`;
      const session = await createLiveSession(
        celebrityId,
        celebrityName.trim(),
        duration,
        maxSlots,
        price
      );

      if (session) {
        router.replace({
          pathname: '/live-session-dashboard',
          params: { sessionId: session.id },
        });
      } else {
        Alert.alert(t('error'), t('liveSessionCreateError'));
      }
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
        colors={['#49516F', '#3a4259']}
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
          style={styles.nameInput}
          placeholder={t('liveSessionNamePlaceholder')}
          placeholderTextColor="rgba(255,255,255,0.6)"
          value={celebrityName}
          onChangeText={setCelebrityName}
          maxLength={50}
        />

        <Text style={styles.sectionTitle}>{t('liveSessionDuration')}</Text>
        <View style={styles.optionsRow}>
          {DURATION_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.optionButton,
                duration === option.value && styles.optionButtonActive,
              ]}
              onPress={() => setDuration(option.value)}
            >
              <Clock size={16} color={duration === option.value ? '#f59e0b' : '#fff'} />
              <Text
                style={[
                  styles.optionText,
                  duration === option.value && styles.optionTextActive,
                ]}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionTitle}>{t('liveSessionMaxSlots')}</Text>
        <View style={styles.optionsRow}>
          {SLOTS_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.optionButton,
                maxSlots === option.value && styles.optionButtonActive,
              ]}
              onPress={() => setMaxSlots(option.value)}
            >
              <Users size={16} color={maxSlots === option.value ? '#f59e0b' : '#fff'} />
              <Text
                style={[
                  styles.optionText,
                  maxSlots === option.value && styles.optionTextActive,
                ]}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionTitle}>{t('liveSessionPrice')}</Text>
        <Text style={styles.sectionSubtitle}>{t('liveSessionPriceHint')}</Text>
        <View style={styles.optionsRow}>
          {PRICE_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.optionButton,
                price === option.value && styles.optionButtonActive,
              ]}
              onPress={() => setPrice(option.value)}
            >
              <DollarSign size={16} color={price === option.value ? '#f59e0b' : '#fff'} />
              <Text
                style={[
                  styles.optionText,
                  price === option.value && styles.optionTextActive,
                ]}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>{t('liveSessionSummary')}</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>{t('liveSessionDuration')}:</Text>
            <Text style={styles.summaryValue}>{duration} min</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>{t('liveSessionMaxSlots')}:</Text>
            <Text style={styles.summaryValue}>{maxSlots} fans</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>{t('liveSessionPrice')}:</Text>
            <Text style={styles.summaryValue}>
              {price === 0 ? t('liveSessionFree') : `${price / 100}€`}
            </Text>
          </View>
          {price > 0 && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>{t('liveSessionYourRevenue')}:</Text>
              <Text style={styles.summaryValueHighlight}>
                {((price * maxSlots * 0.9) / 100).toFixed(0)}€ max
              </Text>
            </View>
          )}
        </View>

        <TouchableOpacity
          style={[styles.createButton, isCreating && styles.createButtonDisabled]}
          onPress={handleCreateSession}
          disabled={isCreating}
        >
          {isCreating ? (
            <ActivityIndicator color="#f59e0b" />
          ) : (
            <>
              <Play size={24} color="#f59e0b" fill="#f59e0b" />
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
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
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
  optionTextActive: {
    color: '#f59e0b',
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
    fontSize: 14,
    fontWeight: '700',
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
    color: '#f59e0b',
  },
});
