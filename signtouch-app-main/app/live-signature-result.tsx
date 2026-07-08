import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Share,
  Dimensions,
  Platform,
} from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as MediaLibrary from 'expo-media-library';
import { showAlert } from '@/utils/alertHelper';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Download,
  Share2,
  Home,
  Check,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useLanguage } from '@/contexts/LanguageContext';
import { getQueueEntry, QueueEntry } from '@/utils/liveSessionStorage';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CANVAS_SIZE = SCREEN_WIDTH - 80;

export default function LiveSignatureResultScreen() {
  const router = useRouter();
  const { entryId } = useLocalSearchParams<{ entryId: string }>();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();

  const [entry, setEntry] = useState<QueueEntry | null>(null);
  const [paths, setPaths] = useState<string[]>([]);
  const cardRef = useRef<View>(null);

  useEffect(() => {
    if (!entryId) return;

    const loadEntry = async () => {
      const e = await getQueueEntry(entryId);
      setEntry(e);

      if (e?.signature_svg) {
        const raw = e.signature_svg.trim();
        let pathStrings: string[];
        if (raw.startsWith('<svg')) {
          // Format <svg>…</svg> complet : on extrait les attributs d="…".
          pathStrings = [];
          const re = /\bd="([^"]+)"/g;
          let m: RegExpExecArray | null;
          while ((m = re.exec(raw)) !== null) {
            pathStrings.push(m[1]);
          }
        } else {
          pathStrings = raw.split('|||');
        }
        setPaths(pathStrings.filter((p) => p && p.length > 0));
      }
    };
    loadEntry();
  }, [entryId]);

  const handleShare = async () => {
    try {
      await Share.share({
        message: t('liveSessionShareMessage'),
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  const handleSave = async () => {
    try {
      // Capture réelle de la carte (photo + signature) → image.
      const uri = await captureRef(cardRef, { format: 'png', quality: 1 });
      if (Platform.OS === 'web') {
        if (typeof document !== 'undefined') {
          const a = document.createElement('a');
          a.href = uri;
          a.download = `plyz_signature_${Date.now()}.png`;
          a.click();
        }
      } else {
        const { status } = await MediaLibrary.requestPermissionsAsync();
        if (status !== 'granted') {
          showAlert(t('error') || 'Erreur', t('mediaPermissionNeeded' as any) || "Autorise l'accès à tes photos pour enregistrer l'image.");
          return;
        }
        await MediaLibrary.saveToLibraryAsync(uri);
      }
      showAlert(t('success'), t('liveSessionSignatureSaved'));
    } catch (e) {
      console.error('Error saving signature:', e);
      showAlert(t('error') || 'Erreur', t('downloadFailed' as any) || 'Enregistrement impossible.');
    }
  };

  if (!entry) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <Text style={styles.loadingText}>{t('loading')}...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient colors={['#10b981', '#059669']} style={StyleSheet.absoluteFill} />

      <View style={styles.header}>
        <View style={styles.successIcon}>
          <Check size={40} color="#fff" />
        </View>
        <Text style={styles.title}>{t('liveSessionSignatureReceived')}</Text>
        <Text style={styles.subtitle}>{t('liveSessionCongrats')}</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.signatureCard} ref={cardRef} collapsable={false}>
          {entry.photo_url && (
            <Image
              source={{ uri: entry.photo_url }}
              style={styles.photoBackground}
              resizeMode="cover"
            />
          )}
          <View style={styles.signatureOverlay}>
            <Svg width={CANVAS_SIZE} height={CANVAS_SIZE * 0.6}>
              {paths.map((p, i) => (
                <Path
                  key={i}
                  d={p}
                  stroke="#000"
                  strokeWidth={3}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}
            </Svg>
          </View>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity style={styles.actionButton} onPress={handleSave}>
            <Download size={24} color="#10b981" />
            <Text style={styles.actionButtonText}>{t('save')}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton} onPress={handleShare}>
            <Share2 size={24} color="#10b981" />
            <Text style={styles.actionButtonText}>{t('share')}</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.homeButton}
          onPress={() => router.replace('/')}
        >
          <Home size={20} color="#fff" />
          <Text style={styles.homeButtonText}>{t('backToHome')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#fff',
    fontSize: 18,
  },
  header: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  successIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    marginTop: 8,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  signatureCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
  photoBackground: {
    width: '100%',
    height: 200,
  },
  signatureOverlay: {
    padding: 20,
    alignItems: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 24,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#fff',
    paddingVertical: 16,
    borderRadius: 16,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#10b981',
  },
  homeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingVertical: 16,
    borderRadius: 30,
    marginTop: 24,
  },
  homeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
