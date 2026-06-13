import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  Mail,
  MessageCircle,
  Send,
  Facebook,
  Instagram,
  Music,
  Copy,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { useLanguage } from '@/contexts/LanguageContext';

export default function ShareScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();

  const appName = 'Plyz';
  const appDescription = t('appDescriptionShare');
  const appUrl = 'https://plyz.app';
  const shareMessage = t('shareMessageTemplate')
    .replace('{{appName}}', appName)
    .replace('{{description}}', appDescription)
    .replace('{{url}}', appUrl);

  const handleBack = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.back();
  };

  const handleCopyLink = async () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    try {
      await Clipboard.setStringAsync(shareMessage);
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      alert(t('linkCopiedToClipboard'));
    } catch (error) {
      console.error('Erreur lors de la copie:', error);
      alert(t('errorCopyingLink'));
    }
  };

  const handleSMS = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    const smsUrl = Platform.select({
      ios: `sms:&body=${encodeURIComponent(shareMessage)}`,
      android: `sms:?body=${encodeURIComponent(shareMessage)}`,
      default: `sms:?body=${encodeURIComponent(shareMessage)}`,
    });

    Linking.openURL(smsUrl).catch(() => {
      if (Platform.OS === 'web') {
        alert(t('smsNotAvailableWeb'));
      }
    });
  };

  const handleEmail = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    const emailUrl = `mailto:?subject=${encodeURIComponent(appName)}&body=${encodeURIComponent(shareMessage)}`;

    Linking.openURL(emailUrl).catch(() => {
      if (Platform.OS === 'web') {
        alert(t('errorOpeningEmail'));
      }
    });
  };

  const handleWhatsApp = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    const whatsappUrl = `whatsapp://send?text=${encodeURIComponent(shareMessage)}`;

    Linking.canOpenURL(whatsappUrl).then((supported) => {
      if (supported) {
        Linking.openURL(whatsappUrl);
      } else {
        const webUrl = `https://wa.me/?text=${encodeURIComponent(shareMessage)}`;
        Linking.openURL(webUrl).catch(() => {
          if (Platform.OS === 'web') {
            alert(t('whatsappNotInstalled'));
          }
        });
      }
    });
  };

  const handleFacebook = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(appUrl)}`;

    Linking.openURL(facebookUrl).catch(() => {
      if (Platform.OS === 'web') {
        alert(t('errorOpeningFacebook'));
      }
    });
  };

  const handleInstagram = async () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    try {
      await Clipboard.setStringAsync(appUrl);
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      if (Platform.OS === 'web') {
        alert(t('linkCopiedInstagram'));
        Linking.openURL('https://www.instagram.com/').catch(() => {});
      } else {
        const instagramUrl = 'instagram://';
        const canOpen = await Linking.canOpenURL(instagramUrl);

        if (canOpen) {
          await Linking.openURL(instagramUrl);
        } else {
          await Linking.openURL('https://www.instagram.com/');
        }
        alert(t('linkCopiedInstagramPaste'));
      }
    } catch (error) {
      console.error('Erreur Instagram:', error);
      alert(t('errorOpeningInstagram'));
    }
  };

  const handleTikTok = async () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    try {
      await Clipboard.setStringAsync(appUrl);
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      if (Platform.OS === 'web') {
        alert(t('linkCopiedTikTok'));
        Linking.openURL('https://www.tiktok.com/').catch(() => {});
      } else {
        const tiktokUrl = 'snssdk1128://';
        const canOpen = await Linking.canOpenURL(tiktokUrl);

        if (canOpen) {
          await Linking.openURL(tiktokUrl);
        } else {
          await Linking.openURL('https://www.tiktok.com/');
        }
        alert(t('linkCopiedTikTokPaste'));
      }
    } catch (error) {
      console.error('Erreur TikTok:', error);
      alert(t('errorOpeningTikTok'));
    }
  };

  const handleTelegram = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    const telegramUrl = `https://t.me/share/url?url=${encodeURIComponent(appUrl)}&text=${encodeURIComponent(appDescription)}`;

    Linking.openURL(telegramUrl).catch(() => {
      if (Platform.OS === 'web') {
        alert(t('errorOpeningTelegram'));
      }
    });
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={handleBack}
          activeOpacity={0.7}>
          <ArrowLeft size={24} color="#ffffff" strokeWidth={2} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('shareAppTitle')}</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.introSection}>
          <Text style={styles.introTitle}>{t('shareAppIntro')}</Text>
          <Text style={styles.introText}>
            {t('shareAppDescription')}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('quickShare')}</Text>

          <TouchableOpacity
            style={styles.shareItem}
            onPress={handleCopyLink}
            activeOpacity={0.7}>
            <View style={[styles.shareIcon, { backgroundColor: '#8b5cf6' }]}>
              <Copy size={24} color="#ffffff" strokeWidth={2} />
            </View>
            <View style={styles.shareInfo}>
              <Text style={styles.shareTitle}>{t('copyLink')}</Text>
              <Text style={styles.shareDescription}>
                {t('copyToClipboard')}
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('byMessaging')}</Text>

          <TouchableOpacity
            style={styles.shareItem}
            onPress={handleSMS}
            activeOpacity={0.7}>
            <View style={[styles.shareIcon, { backgroundColor: '#22c55e' }]}>
              <MessageCircle size={24} color="#ffffff" strokeWidth={2} />
            </View>
            <View style={styles.shareInfo}>
              <Text style={styles.shareTitle}>{t('sms')}</Text>
              <Text style={styles.shareDescription}>
                {t('sendBySMS')}
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.shareItem}
            onPress={handleEmail}
            activeOpacity={0.7}>
            <View style={[styles.shareIcon, { backgroundColor: '#3b82f6' }]}>
              <Mail size={24} color="#ffffff" strokeWidth={2} />
            </View>
            <View style={styles.shareInfo}>
              <Text style={styles.shareTitle}>{t('email')}</Text>
              <Text style={styles.shareDescription}>
                {t('shareByEmail')}
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.shareItem}
            onPress={handleWhatsApp}
            activeOpacity={0.7}>
            <View style={[styles.shareIcon, { backgroundColor: '#25D366' }]}>
              <MessageCircle size={24} color="#ffffff" strokeWidth={2} />
            </View>
            <View style={styles.shareInfo}>
              <Text style={styles.shareTitle}>{t('whatsapp')}</Text>
              <Text style={styles.shareDescription}>
                {t('shareOnWhatsApp')}
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.shareItem}
            onPress={handleTelegram}
            activeOpacity={0.7}>
            <View style={[styles.shareIcon, { backgroundColor: '#0088cc' }]}>
              <Send size={24} color="#ffffff" strokeWidth={2} />
            </View>
            <View style={styles.shareInfo}>
              <Text style={styles.shareTitle}>{t('telegram')}</Text>
              <Text style={styles.shareDescription}>
                {t('shareOnTelegram')}
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('socialNetworks')}</Text>

          <TouchableOpacity
            style={styles.shareItem}
            onPress={handleFacebook}
            activeOpacity={0.7}>
            <View style={[styles.shareIcon, { backgroundColor: '#1877F2' }]}>
              <Facebook size={24} color="#ffffff" strokeWidth={2} />
            </View>
            <View style={styles.shareInfo}>
              <Text style={styles.shareTitle}>{t('facebook')}</Text>
              <Text style={styles.shareDescription}>
                {t('shareOnFacebook')}
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.shareItem}
            onPress={handleInstagram}
            activeOpacity={0.7}>
            <View
              style={[
                styles.shareIcon,
                {
                  backgroundColor: '#E4405F',
                },
              ]}>
              <Instagram size={24} color="#ffffff" strokeWidth={2} />
            </View>
            <View style={styles.shareInfo}>
              <Text style={styles.shareTitle}>{t('instagram')}</Text>
              <Text style={styles.shareDescription}>
                {t('openInstagramToShare')}
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.shareItem}
            onPress={handleTikTok}
            activeOpacity={0.7}>
            <View style={[styles.shareIcon, { backgroundColor: '#000000' }]}>
              <Music size={24} color="#ffffff" strokeWidth={2} />
            </View>
            <View style={styles.shareInfo}>
              <Text style={styles.shareTitle}>{t('tiktok')}</Text>
              <Text style={styles.shareDescription}>
                {t('openTikTokToShare')}
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.bottomPadding} />
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
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
  },
  introSection: {
    paddingHorizontal: 20,
    paddingVertical: 30,
    alignItems: 'center',
  },
  introTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 10,
    textAlign: 'center',
  },
  introText: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 20,
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 15,
  },
  shareItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingVertical: 16,
    paddingHorizontal: 15,
    borderRadius: 12,
    marginBottom: 10,
  },
  shareIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  shareInfo: {
    flex: 1,
  },
  shareTitle: {
    fontSize: 16,
    color: '#ffffff',
    fontWeight: '600',
    marginBottom: 2,
  },
  shareDescription: {
    fontSize: 14,
    color: '#888',
  },
  bottomPadding: {
    height: 40,
  },
});
