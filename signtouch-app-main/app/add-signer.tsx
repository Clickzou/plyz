import React, { useState, useRef, useCallback } from 'react';
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
  const pathRef = useRef<string>('');
  const pathsRef = useRef<string[]>([]);
  const canvasLayoutRef = useRef({ width: 300, height: 200 });
  const isDrawingRef = useRef(false);

  const getScaledPosition = useCallback((nativeEvent: any) => {
    const { locationX, locationY, offsetX, offsetY } = nativeEvent;
    const x = locationX ?? offsetX ?? 0;
    const y = locationY ?? offsetY ?? 0;
    const scaleX = 300 / canvasLayoutRef.current.width;
    const scaleY = 200 / canvasLayoutRef.current.height;
    return {
      x: Math.max(0, Math.min(300, x * scaleX)),
      y: Math.max(0, Math.min(200, y * scaleY)),
    };
  }, []);

  const handleTouchStart = useCallback((event: any) => {
    const nativeEvent = event.nativeEvent || event;
    const { x, y } = getScaledPosition(nativeEvent);
    pathRef.current = `M${x.toFixed(1)},${y.toFixed(1)}`;
    setCurrentPath(pathRef.current);
    isDrawingRef.current = true;
    setIsDrawing(true);
  }, [getScaledPosition]);

  const handleTouchMove = useCallback((event: any) => {
    if (!isDrawingRef.current) return;
    const nativeEvent = event.nativeEvent || event;
    const { x, y } = getScaledPosition(nativeEvent);
    pathRef.current = `${pathRef.current} L${x.toFixed(1)},${y.toFixed(1)}`;
    setCurrentPath(pathRef.current);
  }, [getScaledPosition]);

  const handleTouchEnd = useCallback(() => {
    if (pathRef.current && isDrawingRef.current) {
      pathsRef.current = [...pathsRef.current, pathRef.current];
      setPaths([...pathsRef.current]);
      pathRef.current = '';
      setCurrentPath('');
    }
    isDrawingRef.current = false;
    setIsDrawing(false);
  }, []);

  const handleClear = () => {
    setPaths([]);
    setCurrentPath('');
    pathRef.current = '';
    pathsRef.current = [];
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
      console.log('[AddSigner] Starting save, sessionId:', sessionId);

      let signatureUri: string | undefined;

      if (viewShotRef.current) {
        console.log('[AddSigner] Capturing signature...');
        signatureUri = await (viewShotRef.current as any).capture();
        console.log('[AddSigner] Captured URI length:', signatureUri?.length);
      }

      console.log('[AddSigner] Calling addEventSigner...');
      await addEventSigner(sessionId, displayName.trim(), signatureUri);
      console.log('[AddSigner] Signer added successfully');

      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      router.back();
    } catch (error: any) {
      console.error('Error adding signer:', error?.message || error);
      Alert.alert('Erreur', error?.message || 'Impossible d\'ajouter le signataire');
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
              onLayout={(e) => {
                canvasLayoutRef.current = {
                  width: e.nativeEvent.layout.width,
                  height: e.nativeEvent.layout.height,
                };
              }}
              onStartShouldSetResponder={() => true}
              onMoveShouldSetResponder={() => true}
              onResponderGrant={handleTouchStart}
              onResponderMove={handleTouchMove}
              onResponderRelease={handleTouchEnd}
              onResponderTerminate={handleTouchEnd}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              onTouchCancel={handleTouchEnd}
              // @ts-ignore - mouse events for web
              onMouseDown={handleTouchStart}
              onMouseMove={(e: any) => isDrawingRef.current && handleTouchMove(e)}
              onMouseUp={handleTouchEnd}
              onMouseLeave={handleTouchEnd}
            >
              <Svg width="100%" height="100%" viewBox="0 0 300 200" style={styles.signatureSvg}>
                {paths.map((path, index) => (
                  <Path
                    key={index}
                    d={path}
                    stroke="#FFFFFF"
                    strokeWidth={3}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ))}
                {currentPath && (
                  <Path
                    d={currentPath}
                    stroke="#FFFFFF"
                    strokeWidth={3}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}
              </Svg>
              {!hasSignature && (
                <View style={styles.signaturePlaceholder}>
                  <Text style={styles.signaturePlaceholderText}>
                    Dessinez votre signature ici
                  </Text>
                </View>
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
    backgroundColor: '#000000',
    borderRadius: 16,
    overflow: 'hidden',
    height: 200,
  },
  signatureCanvas: {
    width: '100%',
    height: '100%',
    backgroundColor: '#000000',
  },
  signatureSvg: {
    flex: 1,
  },
  signaturePlaceholder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    pointerEvents: 'none',
  },
  signaturePlaceholderText: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.4)',
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
