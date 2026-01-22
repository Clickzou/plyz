import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { useTranslation } from '@/contexts/LanguageContext';

export default function PrivacyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity
          style={styles.closeButton}
          onPress={() => router.back()}
          activeOpacity={0.8}
        >
          <X size={24} color="#ffffff" strokeWidth={2} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('privacyScreenTitle')}</Text>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <Text style={styles.title}>{t('privacyPolicyTitle')}</Text>
        <Text style={styles.date}>{t('lastUpdated')}</Text>

        <Text style={styles.sectionTitle}>{t('privacySection1Title')}</Text>
        <Text style={styles.text}>
          {t('privacySection1Text')}
        </Text>

        <Text style={styles.sectionTitle}>{t('privacySection2Title')}</Text>
        <Text style={styles.text}>
          {t('privacySection2Text')}
        </Text>

        <Text style={styles.sectionTitle}>{t('privacySection3Title')}</Text>
        <Text style={styles.text}>
          {t('privacySection3Text')}
        </Text>

        <Text style={styles.sectionTitle}>{t('privacySection4Title')}</Text>
        <Text style={styles.text}>
          {t('privacySection4Text')}
        </Text>

        <Text style={styles.sectionTitle}>{t('privacySection5Title')}</Text>
        <Text style={styles.text}>
          {t('privacySection5Text')}
        </Text>

        <Text style={styles.sectionTitle}>{t('privacySection6Title')}</Text>
        <Text style={styles.text}>
          {t('privacySection6Text')}
        </Text>

        <Text style={styles.sectionTitle}>{t('privacySection7Title')}</Text>
        <Text style={styles.text}>
          {t('privacySection7Text')}
        </Text>

        <Text style={styles.sectionTitle}>{t('privacySection8Title')}</Text>
        <Text style={styles.text}>
          {t('privacySection8Text')}
        </Text>

        <Text style={styles.sectionTitle}>{t('privacySection9Title')}</Text>
        <Text style={styles.text}>
          {t('privacySection9Text')}
        </Text>

        <Text style={styles.sectionTitle}>{t('privacySection10Title')}</Text>
        <Text style={styles.text}>
          {t('privacySection10Text')}
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#ffffff',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 8,
  },
  date: {
    fontSize: 14,
    color: '#888888',
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
    marginTop: 20,
    marginBottom: 10,
  },
  text: {
    fontSize: 15,
    color: '#cccccc',
    lineHeight: 24,
    marginBottom: 15,
  },
});
