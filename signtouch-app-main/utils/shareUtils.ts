import { Platform, Linking, Share } from 'react-native';

export interface ShareConfig {
  appName: string;
  appDescription: string;
  appUrl: string;
}

export const getShareMessage = (config: ShareConfig): string => {
  return `Découvre ${config.appName} - ${config.appDescription}\n${config.appUrl}`;
};

export const shareViaMethod = async (
  method: 'native' | 'sms' | 'email' | 'whatsapp' | 'facebook' | 'messenger' | 'instagram' | 'tiktok' | 'telegram',
  config: ShareConfig
): Promise<void> => {
  const message = getShareMessage(config);

  switch (method) {
    case 'native':
      await handleNativeShare(config.appName, message);
      break;
    case 'sms':
      await handleSMS(message);
      break;
    case 'email':
      await handleEmail(config.appName, message);
      break;
    case 'whatsapp':
      await handleWhatsApp(message);
      break;
    case 'facebook':
      await handleFacebook(config.appUrl);
      break;
    case 'messenger':
      await handleMessenger(config.appUrl);
      break;
    case 'instagram':
      await handleInstagram(config.appUrl);
      break;
    case 'tiktok':
      await handleTikTok(config.appUrl);
      break;
    case 'telegram':
      await handleTelegram(config.appUrl, config.appDescription);
      break;
    default:
      throw new Error('Méthode de partage non supportée');
  }
};

const handleNativeShare = async (title: string, message: string): Promise<void> => {
  try {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && (navigator as any).share) {
      await (navigator as any).share({
        title,
        text: message,
      });
    } else if (Platform.OS === 'web') {
      throw new Error('Le partage natif n\'est pas disponible sur votre navigateur');
    } else {
      const result = await Share.share({
        message,
        title,
      });

      if (result.action === Share.dismissedAction) {
        console.log('Partage annulé par l\'utilisateur');
      }
    }
  } catch (error) {
    console.error('Erreur lors du partage:', error);
    throw error;
  }
};

const handleSMS = async (message: string): Promise<void> => {
  const smsUrl = Platform.select({
    ios: `sms:&body=${encodeURIComponent(message)}`,
    android: `sms:?body=${encodeURIComponent(message)}`,
    default: `sms:?body=${encodeURIComponent(message)}`,
  });

  try {
    await Linking.openURL(smsUrl);
  } catch (error) {
    console.error('Erreur SMS:', error);
    throw new Error('Le partage par SMS n\'est pas disponible');
  }
};

const handleEmail = async (subject: string, body: string): Promise<void> => {
  const emailUrl = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  try {
    await Linking.openURL(emailUrl);
  } catch (error) {
    console.error('Erreur Email:', error);
    throw new Error('Erreur lors de l\'ouverture de l\'application email');
  }
};

const handleWhatsApp = async (message: string): Promise<void> => {
  const whatsappUrl = `whatsapp://send?text=${encodeURIComponent(message)}`;

  try {
    const supported = await Linking.canOpenURL(whatsappUrl);
    if (supported) {
      await Linking.openURL(whatsappUrl);
    } else {
      const webUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
      await Linking.openURL(webUrl);
    }
  } catch (error) {
    console.error('Erreur WhatsApp:', error);
    throw new Error('WhatsApp n\'est pas installé');
  }
};

const handleFacebook = async (url: string): Promise<void> => {
  const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;

  try {
    await Linking.openURL(facebookUrl);
  } catch (error) {
    console.error('Erreur Facebook:', error);
    throw new Error('Erreur lors de l\'ouverture de Facebook');
  }
};

const handleMessenger = async (url: string): Promise<void> => {
  const messengerUrl = `fb-messenger://share/?link=${encodeURIComponent(url)}`;

  try {
    const supported = await Linking.canOpenURL(messengerUrl);
    if (supported) {
      await Linking.openURL(messengerUrl);
    } else {
      const webUrl = `https://www.facebook.com/dialog/send?link=${encodeURIComponent(url)}&redirect_uri=${encodeURIComponent(url)}`;
      await Linking.openURL(webUrl);
    }
  } catch (error) {
    console.error('Erreur Messenger:', error);
    throw new Error('Messenger n\'est pas disponible');
  }
};

const handleInstagram = async (url: string): Promise<void> => {
  const instagramUrl = 'instagram://';

  try {
    const supported = await Linking.canOpenURL(instagramUrl);
    if (supported) {
      await Linking.openURL(instagramUrl);
    } else {
      await Linking.openURL('https://www.instagram.com/');
    }
  } catch (error) {
    console.error('Erreur Instagram:', error);
    throw new Error('Instagram n\'est pas installé');
  }
};

const handleTikTok = async (url: string): Promise<void> => {
  const tiktokUrl = 'snssdk1128://';

  try {
    const supported = await Linking.canOpenURL(tiktokUrl);
    if (supported) {
      await Linking.openURL(tiktokUrl);
    } else {
      await Linking.openURL('https://www.tiktok.com/');
    }
  } catch (error) {
    console.error('Erreur TikTok:', error);
    throw new Error('TikTok n\'est pas installé');
  }
};

const handleTelegram = async (url: string, text: string): Promise<void> => {
  const telegramUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;

  try {
    await Linking.openURL(telegramUrl);
  } catch (error) {
    console.error('Erreur Telegram:', error);
    throw new Error('Erreur lors de l\'ouverture de Telegram');
  }
};
