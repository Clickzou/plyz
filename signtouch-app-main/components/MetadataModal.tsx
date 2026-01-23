import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Platform,
  Dimensions,
} from 'react-native';
import { X, User, MapPin, Calendar, Music, Trophy, Palette, Users, Star, Check } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { EventType, MemoryMetadata } from '@/utils/memoriesStorage';
import { useTranslation } from '@/contexts/LanguageContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface MetadataModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (metadata: MemoryMetadata) => void;
  onSkip: () => void;
}

const EVENT_TYPES: { type: EventType; icon: any; color: string }[] = [
  { type: 'concert', icon: Music, color: '#8b5cf6' },
  { type: 'match', icon: Trophy, color: '#22c55e' },
  { type: 'expo', icon: Palette, color: '#f59e0b' },
  { type: 'salon', icon: Users, color: '#3b82f6' },
  { type: 'dedicace', icon: Star, color: '#ec4899' },
  { type: 'rencontre', icon: User, color: '#14b8a6' },
  { type: 'autre', icon: Calendar, color: '#6b7280' },
];

export default function MetadataModal({ visible, onClose, onSave, onSkip }: MetadataModalProps) {
  const [personMet, setPersonMet] = useState('');
  const [eventLocation, setEventLocation] = useState('');
  const [eventDate, setEventDate] = useState(new Date().toISOString().split('T')[0]);
  const [eventType, setEventType] = useState<EventType>('rencontre');
  const { t } = useTranslation();

  const handleSave = () => {
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    onSave({
      personMet: personMet.trim() || undefined,
      eventLocation: eventLocation.trim() || undefined,
      eventDate,
      eventType,
    });
    resetForm();
  };

  const handleSkip = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onSkip();
    resetForm();
  };

  const resetForm = () => {
    setPersonMet('');
    setEventLocation('');
    setEventDate(new Date().toISOString().split('T')[0]);
    setEventType('rencontre');
  };

  const getEventTypeLabel = (type: EventType) => {
    const labels: Record<EventType, string> = {
      concert: t('eventConcert') || 'Concert',
      match: t('eventMatch') || 'Match',
      expo: t('eventExpo') || 'Expo',
      salon: t('eventSalon') || 'Salon',
      dedicace: t('eventDedicace') || 'Dédicace',
      rencontre: t('eventRencontre') || 'Rencontre',
      autre: t('eventAutre') || 'Autre',
    };
    return labels[type];
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>{t('addToNotebook') || 'Ajouter au carnet'}</Text>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <X size={24} color="#9ca3af" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <User size={18} color="#8b5cf6" />
                <Text style={styles.label}>{t('personMet') || 'Personne rencontrée'}</Text>
              </View>
              <TextInput
                style={styles.input}
                value={personMet}
                onChangeText={setPersonMet}
                placeholder={t('personMetPlaceholder') || 'Ex: Zinedine Zidane'}
                placeholderTextColor="#6b7280"
              />
            </View>

            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <MapPin size={18} color="#ec4899" />
                <Text style={styles.label}>{t('eventLocation') || 'Lieu'}</Text>
              </View>
              <TextInput
                style={styles.input}
                value={eventLocation}
                onChangeText={setEventLocation}
                placeholder={t('eventLocationPlaceholder') || 'Ex: Stade de France'}
                placeholderTextColor="#6b7280"
              />
            </View>

            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <Calendar size={18} color="#22c55e" />
                <Text style={styles.label}>{t('eventDate') || 'Date'}</Text>
              </View>
              <TextInput
                style={styles.input}
                value={eventDate}
                onChangeText={setEventDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#6b7280"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>{t('eventType') || 'Type d\'événement'}</Text>
              <View style={styles.eventTypesGrid}>
                {EVENT_TYPES.map(({ type, icon: Icon, color }) => (
                  <TouchableOpacity
                    key={type}
                    style={[
                      styles.eventTypeButton,
                      eventType === type && { backgroundColor: color },
                    ]}
                    onPress={() => {
                      if (Platform.OS !== 'web') {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }
                      setEventType(type);
                    }}
                  >
                    <Icon size={18} color={eventType === type ? '#ffffff' : color} />
                    <Text
                      style={[
                        styles.eventTypeText,
                        eventType === type ? { color: '#ffffff' } : { color },
                      ]}
                    >
                      {getEventTypeLabel(type)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
              <Text style={styles.skipButtonText}>{t('skipNotebook') || 'Passer'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
              <Check size={20} color="#ffffff" />
              <Text style={styles.saveButtonText}>{t('saveToNotebook') || 'Enregistrer'}</Text>
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
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    padding: 20,
  },
  inputGroup: {
    marginBottom: 20,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  input: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  eventTypesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  eventTypeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    gap: 6,
  },
  eventTypeText: {
    fontSize: 13,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    padding: 20,
    paddingBottom: 40,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  skipButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  skipButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#9ca3af',
  },
  saveButton: {
    flex: 2,
    flexDirection: 'row',
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#8b5cf6',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
});
