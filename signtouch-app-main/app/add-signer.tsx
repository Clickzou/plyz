import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { showAlert } from '@/utils/alertHelper';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Check, Trash2 } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Svg, { Path } from 'react-native-svg';
import {
  GestureDetector,
  Gesture,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import ViewShot from 'react-native-view-shot';
import { useLanguage } from '@/contexts/LanguageContext';
import { addEventSigner } from '@/utils/eventSessionStorage';

interface DrawingPath {
  path: string;
}

export default function AddSignerScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();

  const sessionId = params.sessionId as string;

  const [displayName, setDisplayName] = useState('');
  const [paths, setPaths] = useState<DrawingPath[]>([]);
  const [currentPath, setCurrentPath] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const viewShotRef = useRef<ViewShot>(null);
  const currentPathRef = useRef<string>('');
  const startPointRef = useRef<{ x: number; y: number } | null>(null);

  const onDrawStart = useCallback((x: number, y: number) => {
    startPointRef.current = { x, y };
    const newPath = `M ${x} ${y}`;
    currentPathRef.current = newPath;
    setCurrentPath(newPath);
  }, []);

  const onDrawUpdate = useCallback((x: number, y: number) => {
    currentPathRef.current = currentPathRef.current + ` L ${x} ${y}`;
    setCurrentPath(currentPathRef.current);
  }, []);

  const onDrawEnd = useCallback((endX: number, endY: number) => {
    const startPoint = startPointRef.current;
    if (currentPathRef.current && startPoint) {
      const dx = Math.abs(endX - startPoint.x);
      const dy = Math.abs(endY - startPoint.y);
      const distance = Math.sqrt(dx * dx + dy * dy);

      let finalPath = currentPathRef.current;
      if (distance < 5) {
        finalPath = `M ${startPoint.x - 2} ${startPoint.y} L ${startPoint.x + 2} ${startPoint.y} L ${startPoint.x} ${startPoint.y - 2} L ${startPoint.x} ${startPoint.y + 2}`;
      }

      setPaths((prev) => [...prev, { path: finalPath }]);
      setCurrentPath('');
      currentPathRef.current = '';
      startPointRef.current = null;
    }
  }, []);

  const panDraw = Gesture.Pan()
    .onStart((event) => {
      runOnJS(onDrawStart)(event.x, event.y);
    })
    .onUpdate((event) => {
      runOnJS(onDrawUpdate)(event.x, event.y);
    })
    .onEnd((event) => {
      runOnJS(onDrawEnd)(event.x, event.y);
    });

  const handleClear = () => {
    setPaths([]);
    setCurrentPath('');
    currentPathRef.current = '';
    startPointRef.current = null;
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const convertSvgToDataUri = useCallback((): string => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    paths.forEach((item) => {
      const pathData = item.path;
      const commands = pathData.split(/(?=[ML])/);

      commands.forEach((command) => {
        const parts = command.trim().split(/\s+/);
        const type = parts[0];

        if (type === 'M' || type === 'L') {
          const x = parseFloat(parts[1]);
          const y = parseFloat(parts[2]);
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      });
    });

    const padding = 20;

    if (minX === Infinity || minY === Infinity || maxX === -Infinity || maxY === -Infinity) {
      throw new Error('Invalid path bounds');
    }

    const normalizedPaths = paths.map(item => {
      const pathData = item.path;
      const commands = pathData.split(/(?=[ML])/);
      let d = '';
      commands.forEach(command => {
        const parts = command.trim().split(/\s+/);
        const type = parts[0];
        if (type === 'M' || type === 'L') {
          const x = parseFloat(parts[1]) - minX + padding;
          const y = parseFloat(parts[2]) - minY + padding;
          d += `${type} ${x} ${y} `;
        }
      });
      return d.trim();
    });

    const boundingWidth = maxX - minX + padding * 2;
    const boundingHeight = maxY - minY + padding * 2;

    const svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="${boundingWidth}" height="${boundingHeight}" viewBox="0 0 ${boundingWidth} ${boundingHeight}">
  ${normalizedPaths.map(pathData => `<path d="${pathData}" stroke="#ffffff" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round" />`).join('\n  ')}
</svg>`;

    const svgBase64 = btoa(unescape(encodeURIComponent(svgString)));
    return `data:image/svg+xml;base64,${svgBase64}`;
  }, [paths]);

  const handleSave = async () => {
    if (!displayName.trim()) {
      showAlert(t('error'), t('pleaseEnterName'));
      return;
    }

    if (paths.length === 0) {
      showAlert(t('error'), t('pleaseDrawSignature'));
      return;
    }

    try {
      setIsSaving(true);
      console.log('[AddSigner] Starting save, sessionId:', sessionId);

      let signatureUri: string | undefined;

      if (Platform.OS === 'web') {
        console.log('[AddSigner] Web: Converting SVG to data URI...');
        signatureUri = convertSvgToDataUri();
        console.log('[AddSigner] SVG Data URI created, length:', signatureUri?.length);
      } else {
        if (viewShotRef.current) {
          console.log('[AddSigner] Mobile: Capturing signature...');
          signatureUri = await (viewShotRef.current as any).capture();
          console.log('[AddSigner] Captured URI length:', signatureUri?.length);
        }
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
      showAlert(t('error'), error?.message || t('cannotAddSigner'));
    } finally {
      setIsSaving(false);
    }
  };

  const hasSignature = paths.length > 0 || currentPath.length > 0;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
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
              <GestureDetector gesture={panDraw}>
                <View style={styles.signatureCanvas}>
                  <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
                    {paths.map((item, index) => (
                      <Path
                        key={index}
                        d={item.path}
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
              </GestureDetector>
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
    </GestureHandlerRootView>
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
    flex: 1,
  },
  signatureCanvas: {
    flex: 1,
    backgroundColor: '#000000',
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
