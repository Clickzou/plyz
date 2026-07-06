import { TouchableOpacity, Text, StyleSheet, View, Platform } from 'react-native';
import { Share2 } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { shareViaMethod, ShareConfig } from '@/utils/shareUtils';

interface ShareButtonProps {
  config?: ShareConfig;
  style?: object;
  variant?: 'primary' | 'secondary' | 'outline';
  size?: 'small' | 'medium' | 'large';
  showIcon?: boolean;
}

const defaultConfig: ShareConfig = {
  appName: 'Plyz',
  appDescription: 'Créez vos souvenirs avec des signatures personnalisées',
  appUrl: 'https://plyz.io',
};

export default function ShareButton({
  config = defaultConfig,
  style,
  variant = 'primary',
  size = 'medium',
  showIcon = true,
}: ShareButtonProps) {
  const handleShare = async () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    try {
      await shareViaMethod('native', config);
    } catch (error) {
      console.error('Erreur lors du partage:', error);
    }
  };

  const getButtonStyle = () => {
    const variantStyle =
      variant === 'primary'
        ? styles.primaryButton
        : variant === 'secondary'
        ? styles.secondaryButton
        : styles.outlineButton;

    const sizeStyle =
      size === 'small'
        ? styles.smallButton
        : size === 'medium'
        ? styles.mediumButton
        : styles.largeButton;

    return [styles.button, variantStyle, sizeStyle];
  };

  const getTextStyle = () => {
    const variantStyle =
      variant === 'primary'
        ? styles.primaryText
        : variant === 'secondary'
        ? styles.secondaryText
        : styles.outlineText;

    const sizeStyle =
      size === 'small'
        ? styles.smallText
        : size === 'medium'
        ? styles.mediumText
        : styles.largeText;

    return [styles.text, variantStyle, sizeStyle];
  };

  const getIconSize = () => {
    switch (size) {
      case 'small':
        return 16;
      case 'medium':
        return 20;
      case 'large':
        return 24;
      default:
        return 20;
    }
  };

  const getIconColor = () => {
    switch (variant) {
      case 'primary':
        return '#ffffff';
      case 'secondary':
        return '#10b981';
      case 'outline':
        return '#10b981';
      default:
        return '#ffffff';
    }
  };

  return (
    <TouchableOpacity
      style={[...getButtonStyle(), style]}
      onPress={handleShare}
      activeOpacity={0.7}>
      <View style={styles.content}>
        {showIcon && (
          <Share2 size={getIconSize()} color={getIconColor()} strokeWidth={2} />
        )}
        <Text style={getTextStyle()}>Partager</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryButton: {
    backgroundColor: '#10b981',
  },
  secondaryButton: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
  },
  outlineButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#10b981',
  },
  smallButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  mediumButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  largeButton: {
    paddingVertical: 16,
    paddingHorizontal: 32,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  text: {
    fontWeight: '600',
  },
  primaryText: {
    color: '#ffffff',
  },
  secondaryText: {
    color: '#10b981',
  },
  outlineText: {
    color: '#10b981',
  },
  smallText: {
    fontSize: 14,
  },
  mediumText: {
    fontSize: 16,
  },
  largeText: {
    fontSize: 18,
  },
});
