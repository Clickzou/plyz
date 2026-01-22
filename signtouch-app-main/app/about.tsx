import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { router } from 'expo-router';
import { ArrowLeft, Pencil, Camera, Image as ImageIcon, Shield } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '@/contexts/LanguageContext';

export default function AboutScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <ArrowLeft size={24} color="#ffffff" strokeWidth={2} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('aboutTitle')}</Text>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <View style={styles.logoContainer}>
          <View style={styles.logo}>
            <Pencil size={48} color="#10b981" strokeWidth={2} />
          </View>
          <Text style={styles.appName}>{t('appName')}</Text>
          <Text style={styles.version}>{t('appVersion')}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('aboutApp')}</Text>
          <Text style={styles.description}>
            {t('appDescription')}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('mainFeatures')}</Text>

          <View style={styles.featureItem}>
            <View style={[styles.featureIcon, { backgroundColor: 'rgba(16, 185, 129, 0.1)' }]}>
              <Camera size={24} color="#10b981" strokeWidth={2} />
            </View>
            <View style={styles.featureText}>
              <Text style={styles.featureTitle}>{t('photoCapture')}</Text>
              <Text style={styles.featureDescription}>
                {t('photoCaptureDesc')}
              </Text>
            </View>
          </View>

          <View style={styles.featureItem}>
            <View style={[styles.featureIcon, { backgroundColor: 'rgba(16, 185, 129, 0.1)' }]}>
              <ImageIcon size={24} color="#10b981" strokeWidth={2} />
            </View>
            <View style={styles.featureText}>
              <Text style={styles.featureTitle}>{t('photoImport')}</Text>
              <Text style={styles.featureDescription}>
                {t('photoImportDesc')}
              </Text>
            </View>
          </View>

          <View style={styles.featureItem}>
            <View style={[styles.featureIcon, { backgroundColor: 'rgba(16, 185, 129, 0.1)' }]}>
              <Pencil size={24} color="#10b981" strokeWidth={2} />
            </View>
            <View style={styles.featureText}>
              <Text style={styles.featureTitle}>{t('customSignature')}</Text>
              <Text style={styles.featureDescription}>
                {t('customSignatureDesc')}
              </Text>
            </View>
          </View>

          <View style={styles.featureItem}>
            <View style={[styles.featureIcon, { backgroundColor: 'rgba(16, 185, 129, 0.1)' }]}>
              <Shield size={24} color="#10b981" strokeWidth={2} />
            </View>
            <View style={styles.featureText}>
              <Text style={styles.featureTitle}>{t('offlineMode')}</Text>
              <Text style={styles.featureDescription}>
                {t('offlineModeDesc')}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('privacyTitle')}</Text>
          <Text style={styles.description}>
            {t('privacyDesc')}
          </Text>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>{t('copyright')}</Text>
          <View style={styles.madeByContainer}>
            <Text style={styles.footerSubtext}>
              {t('madeWithLove')}{' '}
            </Text>
            <TouchableOpacity
              onPress={() => Linking.openURL('https://clickzou.fr')}
              activeOpacity={0.7}
            >
              <Text style={[styles.footerSubtext, styles.link]}>
                clickzou.fr
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#ffffff',
    marginLeft: 15,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 40,
  },
  logoContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  logo: {
    width: 100,
    height: 100,
    borderRadius: 25,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  appName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 5,
  },
  version: {
    fontSize: 16,
    color: '#888',
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 15,
  },
  description: {
    fontSize: 15,
    color: '#ccc',
    lineHeight: 22,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  featureIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  featureText: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 3,
  },
  featureDescription: {
    fontSize: 14,
    color: '#888',
    lineHeight: 20,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 20,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5,
  },
  footerSubtext: {
    fontSize: 13,
    color: '#444',
  },
  madeByContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  link: {
    color: '#10b981',
    textDecorationLine: 'underline',
  },
});
