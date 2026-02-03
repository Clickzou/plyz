import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Check, Trash2 } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Svg, { Path } from 'react-native-svg';
import ViewShot from 'react-native-view-shot';
import { useLanguage } from '@/contexts/LanguageContext';
import { addEventSigner } from '@/utils/eventSessionStorage';

export default function AddSignerScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();

  const sessionId = params.sessionId as string;

  const [displayName, setDisplayName] = useState('');
  const [paths, setPaths] = useState<string[]>([]);
  const [currentPath, setCurrentPath] = useState('');
  const [isDrawing, setIsDrawing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const viewShotRef = useRef<ViewShot>(null);

  const handleTouchStart = (event: any) => {
    const { locationX, locationY } = event.nativeEvent;
    setIsDrawing(true);
    setCurrentPath(`M${locationX},${locationY}`);
  };

  const handleTouchMove = (event: any) => {
    if (!isDrawing) return;
    const { locationX, locationY } = event.nativeEvent;
    setCurrentPath(prev => `${prev} L${locationX},${locationY}`);
  };

  const handleTouchEnd = () => {
    if (currentPath) {
      setPaths(prev => [...prev, currentPath]);
      setCurrentPath('');
    }
    setIsDrawing(false);
  };

  const handleClear = () => {
    setPaths([]);
    setCurrentPath('');
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const handleSave = async () => {
    if (!displayName.trim()) {
      Alert.alert('Erreur', 'Veuillez entrer un nom');
      return;
    }

    if (paths.length === 0) {
      Alert.alert('Erreur', 'Veuillez dessiner une signature');
      return;
    }

    try {
      setIsSaving(true);

      let signatureUri: string | undefined;

      if (viewShotRef.current) {
        signatureUri = await (viewShotRef.current as any).capture();
      }

      await addEventSigner(sessionId, displayName.trim(), signatureUri);

      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      router.back();
    } catch (error) {
      console.error('Error adding signer:', error);
      Alert.alert('Erreur', 'Impossible d\'ajouter le signataire');
    } finally {
      setIsSaving(false);
    }
  };

  const hasSignature = paths.length > 0 || currentPath.length > 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={['#1a1a2e', '#16213e']}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ArrowLeft size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Ajouter un signataire</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.content}>
        <View style={styles.inputSection}>
          <Text style={styles.label}>Nom du signataire</Text>
          <TextInput
            style={styles.input}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Ex: Jean Dupont"
            placeholderTextColor="rgba(255,255,255,0.4)"
          />
        </View>

        <View style={styles.signatureSection}>
          <View style={styles.signatureHeader}>
            <Text style={styles.label}>Signature</Text>
            {hasSignature && (
              <TouchableOpacity style={styles.clearBtn} onPress={handleClear}>
                <Trash2 size={18} color="#ef4444" />
                <Text style={styles.clearBtnText}>Effacer</Text>
              </TouchableOpacity>
            )}
          </View>
          
          <ViewShot
            ref={viewShotRef}
            options={{ format: 'png', quality: 1 }}
            style={styles.signatureCanvasContainer}
          >
            <View
              style={styles.signatureCanvas}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            >
              <Svg style={StyleSheet.absoluteFill}>
                {paths.map((path, index) => (
                  <Path
                    key={index}
                    d={path}
                    stroke="#10B981"
                    strokeWidth={3}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ))}
                {currentPath && (
                  <Path
                    d={currentPath}
                    stroke="#10B981"
                    strokeWidth={3}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}
              </Svg>
              {!hasSignature && (
                <Text style={styles.signaturePlaceholder}>
                  Dessinez la signature ici
                </Text>
              )}
            </View>
          </ViewShot>
        </View>

        <TouchableOpacity
          style={[
            styles.saveButton,
            (!displayName.trim() || !hasSignature) && styles.saveButtonDisabled
          ]}
          onPress={handleSave}
          disabled={!displayName.trim() || !hasSignature || isSaving}
        >
          {isSaving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Check size={20} color="#fff" />
              <Text style={styles.saveButtonText}>Enregistrer</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
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
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  inputSection: {
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 8,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  signatureSection: {
    flex: 1,
    marginBottom: 24,
  },
  signatureHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  clearBtnText: {
    fontSize: 14,
    color: '#ef4444',
    fontWeight: '500',
  },
  signatureCanvasContainer: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  signatureCanvas: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'rgba(16,185,129,0.3)',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  signaturePlaceholder: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.3)',
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#10B981',
    paddingVertical: 16,
    borderRadius: 12,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
});
