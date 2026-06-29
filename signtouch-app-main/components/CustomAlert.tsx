import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Animated,
  Dimensions,
  Platform,
} from 'react-native';
import { AlertTriangle, CheckCircle } from 'lucide-react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type Tone = 'danger' | 'error' | 'success';

const TONE_COLORS: Record<Tone, string> = {
  danger: '#f59e0b',
  error: '#ef4444',
  success: '#10b981',
};

type AlertButton = {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
};

type AlertData = {
  title: string;
  message: string;
  buttons?: AlertButton[];
};

let globalShowAlert: ((data: AlertData) => void) | null = null;

export function triggerAlert(title: string, message: string, buttons?: AlertButton[]) {
  if (globalShowAlert) {
    globalShowAlert({ title, message, buttons });
  }
}

export default function CustomAlert() {
  const [visible, setVisible] = useState(false);
  const [alertData, setAlertData] = useState<AlertData | null>(null);
  const fadeAnim = useState(new Animated.Value(0))[0];
  const scaleAnim = useState(new Animated.Value(0.85))[0];

  const show = useCallback((data: AlertData) => {
    setAlertData(data);
    setVisible(true);
    fadeAnim.setValue(0);
    scaleAnim.setValue(0.85);
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 8,
        tension: 100,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, scaleAnim]);

  useEffect(() => {
    globalShowAlert = show;
    return () => {
      globalShowAlert = null;
    };
  }, [show]);

  const dismiss = useCallback((onPress?: () => void) => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 0.85,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setVisible(false);
      setAlertData(null);
      if (onPress) onPress();
    });
  }, [fadeAnim, scaleAnim]);

  if (!visible || !alertData) return null;

  const buttons = alertData.buttons || [{ text: 'OK', style: 'default' as const }];

  const hasDestructive = buttons.some(b => b.style === 'destructive');
  const titleLower = alertData.title.toLowerCase();
  const isError =
    titleLower.includes('erreur') ||
    titleLower.includes('error') ||
    titleLower.includes('échou') ||
    titleLower.includes('echou') ||
    titleLower.includes('failed');
  const tone: Tone = hasDestructive ? 'danger' : isError ? 'error' : 'success';
  const toneColor = TONE_COLORS[tone];
  const ToneIcon = tone === 'success' ? CheckCircle : AlertTriangle;

  return (
    <Modal transparent visible={visible} animationType="none" statusBarTranslucent>
      <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
        <TouchableOpacity
          style={styles.overlayTouch}
          activeOpacity={1}
          onPress={() => {
            const cancelBtn = buttons.find(b => b.style === 'cancel');
            dismiss(cancelBtn?.onPress);
          }}
        />
        <Animated.View
          style={[
            styles.container,
            {
              opacity: fadeAnim,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          <View style={styles.iconRow}>
            <View
              style={[
                styles.iconCircle,
                {
                  backgroundColor: toneColor + '26',
                  borderColor: toneColor,
                },
              ]}
            >
              <ToneIcon size={28} color={toneColor} strokeWidth={2.5} />
            </View>
          </View>

          <Text style={styles.title}>{alertData.title}</Text>
          <Text style={styles.message}>{alertData.message}</Text>

          <View style={[styles.buttonRow, buttons.length > 1 && styles.buttonRowMulti]}>
            {buttons.map((btn, idx) => {
              const isDestructive = btn.style === 'destructive';
              const isCancel = btn.style === 'cancel';
              return (
                <TouchableOpacity
                  key={idx}
                  style={[
                    styles.button,
                    buttons.length > 1 && styles.buttonMulti,
                    isDestructive && styles.buttonDestructive,
                    isCancel && styles.buttonCancel,
                    !isDestructive && !isCancel && styles.buttonDefault,
                  ]}
                  activeOpacity={0.8}
                  onPress={() => dismiss(btn.onPress)}
                >
                  <Text
                    style={[
                      styles.buttonText,
                      isDestructive && styles.buttonTextDestructive,
                      isCancel && styles.buttonTextCancel,
                    ]}
                  >
                    {btn.text}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  overlayTouch: {
    ...StyleSheet.absoluteFillObject,
  },
  container: {
    backgroundColor: '#1a1a2e',
    borderRadius: 20,
    padding: 28,
    width: Math.min(SCREEN_WIDTH - 48, 360),
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.3)',
    ...(Platform.OS === 'web'
      ? { boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5), 0 0 40px rgba(139, 92, 246, 0.15)' }
      : {
          shadowColor: '#8b5cf6',
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 0.3,
          shadowRadius: 20,
          elevation: 20,
        }),
  },
  iconRow: {
    marginBottom: 16,
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 10,
    letterSpacing: 0.3,
  },
  message: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.75)',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  buttonRow: {
    width: '100%',
  },
  buttonRowMulti: {
    flexDirection: 'row',
    gap: 10,
  },
  button: {
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonMulti: {
    flex: 1,
  },
  buttonDefault: {
    backgroundColor: '#8b5cf6',
  },
  buttonDestructive: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.4)',
  },
  buttonCancel: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    textAlign: 'center',
  },
  buttonTextDestructive: {
    color: '#ef4444',
  },
  buttonTextCancel: {
    color: 'rgba(255, 255, 255, 0.7)',
  },
});
