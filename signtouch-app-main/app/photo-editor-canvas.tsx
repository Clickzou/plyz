import { useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Platform, View, ActivityIndicator, StyleSheet } from 'react-native';
import { showAlert } from '@/utils/alertHelper';
import * as Haptics from 'expo-haptics';
import * as FileSystem from 'expo-file-system/legacy';
import { Memory } from '@/utils/memoriesStorage';
import * as StorageService from '@/utils/storageService';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/contexts/LanguageContext';
import { WebView } from 'react-native-webview';
import { PHOTO_EDITOR_HTML } from '@/utils/photoEditorHtml';

// ⚠️ Fabric.js ne fonctionne QUE sur Web (nécessite un DOM)
// Import conditionnel pour éviter les erreurs sur mobile
let fabric: any = null;
if (Platform.OS === 'web') {
  // @ts-ignore
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  fabric = require('fabric').fabric;
}

export default function PhotoEditorCanvas() {
  const { imageUri, memoryId, returnTo } = useLocalSearchParams<{
    imageUri?: string;
    memoryId?: string;
    returnTo?: string;
  }>();
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricCanvasRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [memory, setMemory] = useState<Memory | null>(null);
  const originalImageRef = useRef<any>(null);
  const [brightness, setBrightness] = useState(0);
  const [contrast, setContrast] = useState(0);
  const [saturation, setSaturation] = useState(0);

  // Pour la version mobile WebView
  const webViewRef = useRef<WebView>(null);
  const [webViewReady, setWebViewReady] = useState(false);

  // Wrapper function for updateMemory
  const updateMemory = async (updatedMemory: Memory) => {
    if (!memory) return;
    const updates: any = {};
    if (updatedMemory.adjustments) updates.adjustments = updatedMemory.adjustments;
    if (updatedMemory.signatureOverlays) updates.signatureOverlays = updatedMemory.signatureOverlays;
    if (updatedMemory.isEdited !== undefined) updates.isEdited = updatedMemory.isEdited;
    if (updatedMemory.baseUri && updatedMemory.baseUri !== memory.baseUri) {
      updates.imageUri = updatedMemory.baseUri;
    }
    return await StorageService.updateMemory(memory, user?.id || null, updates);
  };

  // Charger la memory si on édite une photo existante
  useEffect(() => {
    console.log('🔍 useEffect memoryId:', memoryId, 'imageUri:', imageUri);
    if (memoryId) {
      loadMemory();
    }
  }, [memoryId]);

  const loadMemory = async () => {
    if (memoryId) {
      try {
        console.log('📂 Chargement de la memory:', memoryId);
        const memories = await StorageService.getAllMemories(user?.id || null);
        const found = memories.find(m => m.id === memoryId);
        if (found) {
          setMemory(found);
          console.log('✅ Memory chargée:', found.id, 'URI:', found.uri?.substring(0, 50) + '...');
        } else {
          console.warn('⚠️ Memory non trouvée:', memoryId);
        }
      } catch (error) {
        console.error('❌ Erreur chargement memory:', error);
      }
    }
  };

  // Envoyer l'image à la WebView quand elle est prête ET que la memory est chargée
  useEffect(() => {
    if (Platform.OS !== 'web' && webViewReady && memory) {
      console.log('📤 Envoi de l\'image à la WebView:', memory.uri?.substring(0, 50) + '...');
      let uri = memory.uri || imageUri;

      if (!uri || typeof uri !== 'string') {
        console.error('❌ Aucune URI d\'image disponible!');
        showAlert(t('error'), t('noImageToLoad'));
        return;
      }

      // Convertir file:// en base64 pour la WebView
      (async () => {
        try {
          // Conversion file:// vers base64
          if (uri.startsWith('file://')) {
            console.log('🔄 Conversion file:// vers base64...');
            const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
            uri = `data:image/jpeg;base64,${base64}`;
            console.log('✅ Conversion base64 terminée:', uri.substring(0, 50) + '...');
          }

          // Validation finale : l'URI DOIT être data: ou http(s):
          if (!uri.startsWith('data:image/') && !uri.startsWith('http://') && !uri.startsWith('https://')) {
            console.error('❌ URI invalide après conversion:', uri.substring(0, 100));
            showAlert(t('error'), t('unsupportedImageFormat'));
            return;
          }

          console.log('✅ URI valide, envoi à la WebView:', uri.substring(0, 50) + '...');

          webViewRef.current?.postMessage(
            JSON.stringify({
              action: 'loadImage',
              imageUri: uri,
            })
          );
          console.log('✅ Message loadImage envoyé à la WebView');
        } catch (error) {
          console.error('❌ Erreur conversion base64:', error);
          showAlert(t('error'), t('cannotLoadImage'));
        }
      })();
    }
  }, [webViewReady, memory, imageUri]);


  useEffect(() => {
    // Vérifier qu'on est sur web
    if (Platform.OS !== 'web') {
      alert('Cet éditeur ne fonctionne que sur Web');
      router.back();
      return;
    }

    // Attendre que fabric soit chargé
    const checkFabric = setInterval(() => {
      if (fabric && canvasRef.current) {
        clearInterval(checkFabric);
        initCanvas();
      }
    }, 100);

    return () => {
      clearInterval(checkFabric);
      if (fabricCanvasRef.current) {
        fabricCanvasRef.current.dispose();
      }
    };
  }, []);

  useEffect(() => {
    if (fabricCanvasRef.current && (memory || imageUri)) {
      loadImage();
    }
  }, [memory, imageUri]);

  useEffect(() => {
    if (!loading && memory && memory.adjustments) {
      console.log('🎨 Application des réglages sauvegardés:', memory.adjustments);
      setBrightness(memory.adjustments.brightness || 0);
      setContrast(memory.adjustments.contrast || 0);
      setSaturation(memory.adjustments.saturation || 0);
    }
  }, [loading, memory]);

  useEffect(() => {
    if (!loading && originalImageRef.current) {
      applyAdjustments();
    }
  }, [brightness, contrast, saturation, loading]);

  const initCanvas = () => {
    if (!canvasRef.current || !fabric) return;

    // Créer le canvas Fabric.js
    const canvas = new fabric.Canvas(canvasRef.current, {
      selection: false,
      backgroundColor: '#000',
    });

    fabricCanvasRef.current = canvas;

    // Adapter la taille du canvas à l'écran
    const resizeCanvas = () => {
      // Utiliser la taille de la fenêtre entière
      const canvasWidth = window.innerWidth;
      const canvasHeight = window.innerHeight;
      console.log('📏 [React Web] Resize canvas to:', canvasWidth, 'x', canvasHeight);
      canvas.setWidth(canvasWidth);
      canvas.setHeight(canvasHeight);
      canvas.renderAll();
    };

    // Attendre que le DOM soit complètement rendu avant de redimensionner
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        resizeCanvas();
        // Charger l'image après le redimensionnement
        loadImage();
      });
    });

    window.addEventListener('resize', resizeCanvas);
  };

  const loadImage = () => {
    if (!fabric || !fabricCanvasRef.current) return;

    // Utiliser soit l'URI de la memory, soit l'URI directe
    const uri = memory ? (memory.baseUri || memory.uri) : (typeof imageUri === 'string' ? imageUri : '');

    console.log('📸 Chargement image:', uri.substring(0, 100) + '...');

    if (!uri) {
      console.error('❌ Aucune URI fournie');
      setLoading(false);
      alert('Aucune image à charger');
      return;
    }

    // Validation : l'URI DOIT être data:image/ ou http(s)://
    if (!uri.startsWith('data:image/') && !uri.startsWith('http://') && !uri.startsWith('https://')) {
      console.error('❌ URI invalide:', uri.substring(0, 100));
      setLoading(false);
      alert('Format d\'image non supporté. L\'URI doit être data:image/ ou http(s)://');
      return;
    }

    // Ne pas utiliser crossOrigin pour les data URLs
    const isDataURL = uri.startsWith('data:');
    const options = isDataURL ? {} : { crossOrigin: 'anonymous' };

    fabric.Image.fromURL(
      uri,
      (img: any) => {
        // Validation stricte de l'image chargée
        if (!img) {
          console.error('❌ Impossible de charger l\'image (objet nul)');
          setLoading(false);
          alert('Impossible de charger l\'image (objet nul)');
          return;
        }

        if (!img.width || !img.height || img.width === 0 || img.height === 0) {
          console.error('❌ Impossible de charger l\'image (largeur/hauteur nulles):', img.width, 'x', img.height);
          setLoading(false);
          alert('Impossible de charger l\'image (largeur/hauteur nulles)');
          return;
        }

        // Centrer et adapter l'image au canvas
        const canvas = fabricCanvasRef.current;
        if (!canvas) {
          console.error('❌ Canvas non disponible');
          setLoading(false);
          return;
        }

        // Calcul du facteur d'échelle en mode COVER (remplir l'espace)
        const canvasWidth = canvas.getWidth ? canvas.getWidth() : canvas.width;
        const canvasHeight = canvas.getHeight ? canvas.getHeight() : canvas.height;

        const scaleX = canvasWidth / img.width;
        const scaleY = canvasHeight / img.height;
        let scale = Math.max(scaleX, scaleY); // COVER au lieu de FIT

        if (!isFinite(scale) || scale <= 0) {
          console.warn('⚠️ Scale invalide, utilisation de 1:', scale);
          scale = 1;
        }

        console.log('📐 [React Web] Canvas:', canvasWidth, 'x', canvasHeight, '- Image:', img.width, 'x', img.height, '- Scale:', scale);

        // Calculer les dimensions de l'image après scaling
        const scaledWidth = img.width * scale;
        const scaledHeight = img.height * scale;

        // Calculer la position pour centrer l'image
        const left = (canvasWidth - scaledWidth) / 2;
        const top = (canvasHeight - scaledHeight) / 2;

        console.log('📍 [React Web] Position - left:', left, 'top:', top, 'scaledSize:', scaledWidth, 'x', scaledHeight);

        // Scale et centrage simple avec left/top
        img.scale(scale);
        img.set({
          left: left,
          top: top,
          originX: 'left',
          originY: 'top',
          selectable: false,
          evented: false,
          hasControls: false,
          hasBorders: false,
          lockMovementX: true,
          lockMovementY: true,
          lockScalingX: true,
          lockScalingY: true,
          lockRotation: true,
        });

        // Nettoyer le canvas et ajouter l'image
        canvas.clear();
        canvas.add(img);
        canvas.setActiveObject(img);
        canvas.selection = false;
        canvas.renderAll();

        console.log('✅ [React Web] Image chargée et affichée:', img.width, 'x', img.height);

        originalImageRef.current = img;
        setLoading(false);
      },
      options,
      (error: any) => {
        console.error('❌ Erreur chargement Fabric.js:', error);
        setLoading(false);
        alert('Impossible de charger l\'image. Vérifiez le format: ' + error);
      }
    );
  };

  const applyAdjustments = () => {
    if (!fabricCanvasRef.current || !originalImageRef.current) {
      console.warn('⚠️ Canvas ou image non disponible');
      return;
    }

    const img = originalImageRef.current;

    if (!img._element) {
      console.error('❌ Image element manquant');
      return;
    }

    const imageElement = img._element;
    if (!imageElement.naturalWidth && !imageElement.width) {
      console.error('❌ Image non chargée correctement');
      return;
    }

    img.filters = [];

    if (brightness !== 0) {
      img.filters.push(new fabric.Image.filters.Brightness({ brightness: brightness / 100 }));
    }

    if (contrast !== 0) {
      img.filters.push(new fabric.Image.filters.Contrast({ contrast: contrast / 100 }));
    }

    if (saturation !== 0) {
      img.filters.push(new fabric.Image.filters.Saturation({ saturation: saturation / 100 }));
    }

    try {
      img.applyFilters();
      fabricCanvasRef.current.renderAll();
      console.log('✅ Réglages appliqués - B:', brightness, 'C:', contrast, 'S:', saturation);
    } catch (error) {
      console.error('❌ Erreur application réglages:', error);
      img.filters = [];
      img.applyFilters();
      fabricCanvasRef.current.renderAll();
    }
  };

  const handleReset = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setBrightness(0);
    setContrast(0);
    setSaturation(0);
  };

  const handleValidate = async () => {
    if (!fabricCanvasRef.current || !memory) {
      console.warn('⚠️ Pas de canvas ou pas de memory');
      return;
    }

    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    setSaving(true);

    try {
      const dataURL = fabricCanvasRef.current.toDataURL({
        format: 'jpeg',
        quality: 0.9,
      });

      console.log('✅ Image exportée (', (dataURL.length / 1024).toFixed(0), 'Ko)');

      const hasAdjustments = brightness !== 0 || contrast !== 0 || saturation !== 0;

      const updatedMemory: Memory = {
        ...memory,
        baseUri: dataURL,
        adjustments: hasAdjustments ? { brightness, contrast, saturation } : undefined,
        filter: undefined,
        isEdited: true,
        signatureOverlays: memory.signatureOverlays,
      };

      await updateMemory(updatedMemory);
      console.log('✅ Memory sauvegardée avec réglages:', hasAdjustments ? { brightness, contrast, saturation } : 'aucun');
      console.log('✅ Overlays préservés - signatures:', memory.signatureOverlays?.length || 0);

      if (returnTo === 'result') {
        console.log('🔙 Retour vers edit pour régénérer l\'image composite');
        router.replace({
          pathname: '/edit',
          params: { memoryId: updatedMemory.id, autoSave: 'true' },
        });
      } else {
        console.log('🔙 Retour vers compose avec memoryId:', updatedMemory.id);
        router.push({
          pathname: '/compose',
          params: { memoryId: updatedMemory.id },
        });
      }
    } catch (error) {
      console.error('❌ Erreur sauvegarde:', error);

      const errorMsg = t('imageSaveError');
      showAlert(t('error'), errorMsg);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    router.back();
  };

  // ========================================
  // VERSION MOBILE (WebView)
  // ========================================
  if (Platform.OS !== 'web') {
    const handleWebViewMessage = async (event: any) => {
      try {
        const message = JSON.parse(event.nativeEvent.data);
        console.log('📨 Message de la WebView:', message.action);

        switch (message.action) {
          case 'ready':
            console.log('✅ WebView prête, activation de webViewReady');
            setWebViewReady(true);
            // L'envoi de l'image est géré par le useEffect ci-dessus
            break;

          case 'cancel':
            console.log('❌ Annulation');
            router.back();
            break;

          case 'validate':
            if (!memory) {
              console.warn('⚠️ Pas de memory');
              return;
            }

            console.log('✅ Validation en cours...');
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

            try {
              const hasAdjustments = message.brightness !== 0 || message.contrast !== 0 || message.saturation !== 0;

              const updatedMemory: Memory = {
                ...memory,
                baseUri: message.imageData,
                adjustments: hasAdjustments ? {
                  brightness: message.brightness,
                  contrast: message.contrast,
                  saturation: message.saturation
                } : undefined,
                filter: undefined,
                isEdited: true,
                signatureOverlays: memory.signatureOverlays,
              };

              await updateMemory(updatedMemory);
              console.log('✅ Memory sauvegardée avec réglages:', hasAdjustments ? message : 'aucun');
              console.log('✅ Overlays préservés - signatures:', memory.signatureOverlays?.length || 0);

              if (returnTo === 'result') {
                console.log('🔙 Retour vers edit pour régénérer l\'image composite');
                router.replace({
                  pathname: '/edit',
                  params: { memoryId: updatedMemory.id, autoSave: 'true' },
                });
              } else {
                console.log('🔙 Retour vers compose avec memoryId:', updatedMemory.id);
                router.push({
                  pathname: '/compose',
                  params: { memoryId: updatedMemory.id },
                });
              }
            } catch (error) {
              console.error('❌ Erreur sauvegarde:', error);
              showAlert(t('error'), t('imageSaveError'));
            }
            break;
        }
      } catch (error) {
        console.error('❌ Erreur lecture message WebView:', error);
      }
    };

    return (
      <View style={mobileStyles.container}>
        {!webViewReady && (
          <View style={mobileStyles.loading}>
            <ActivityIndicator size="large" color="#10b981" />
          </View>
        )}
        <WebView
          ref={webViewRef}
          source={{ html: PHOTO_EDITOR_HTML }}
          onMessage={handleWebViewMessage}
          onError={(error) => {
            console.error('❌ Erreur WebView:', error);
            showAlert(t('error'), t('cannotLoadPhotoEditor'));
          }}
          onLoadEnd={() => console.log('✅ WebView HTML chargé (onLoadEnd)')}
          style={{ flex: 1, backgroundColor: '#000' }}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          allowFileAccess={true}
          originWhitelist={['*']}
        />
      </View>
    );
  }

  // ========================================
  // VERSION WEB (Fabric.js direct)
  // ========================================
  return (
    <>
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>

      <div style={styles.container}>
        {(loading || saving) && (
          <div style={styles.loading}>
            <div style={styles.spinner} />
            {saving && (
              <div style={styles.loadingText}>
                Sauvegarde en cours...
              </div>
            )}
          </div>
        )}

      <div style={styles.topActions}>
        <button
          onClick={handleCancel}
          style={{ ...styles.btn, ...styles.btnCancel }}
          disabled={saving}
        >
          ✕
        </button>
        <button
          onClick={handleReset}
          style={{ ...styles.btn, ...styles.btnReset }}
          disabled={saving}
        >
          ↻
        </button>
        <button
          onClick={handleValidate}
          style={{ ...styles.btn, ...styles.btnValidate }}
          disabled={saving}
        >
          ✓
        </button>
      </div>

      <div id="canvas-container" style={styles.canvasContainer}>
        <canvas ref={canvasRef} />
      </div>

      <div style={styles.adjustmentsBar}>
        <div style={styles.adjustmentRow}>
          <label style={styles.adjustmentLabel}>{t('brightness')}</label>
          <div style={styles.adjustmentControls}>
            <button
              onClick={() => setBrightness(Math.max(-100, brightness - 5))}
              disabled={loading || saving}
              style={styles.adjustmentBtn}
            >
              −
            </button>
            <input
              type="range"
              min="-100"
              max="100"
              value={brightness}
              onChange={(e) => setBrightness(Number(e.target.value))}
              disabled={loading || saving}
              style={styles.slider}
            />
            <button
              onClick={() => setBrightness(Math.min(100, brightness + 5))}
              disabled={loading || saving}
              style={styles.adjustmentBtn}
            >
              +
            </button>
            <span style={styles.adjustmentValue}>{brightness}</span>
          </div>
        </div>

        <div style={styles.adjustmentRow}>
          <label style={styles.adjustmentLabel}>{t('contrast')}</label>
          <div style={styles.adjustmentControls}>
            <button
              onClick={() => setContrast(Math.max(-100, contrast - 5))}
              disabled={loading || saving}
              style={styles.adjustmentBtn}
            >
              −
            </button>
            <input
              type="range"
              min="-100"
              max="100"
              value={contrast}
              onChange={(e) => setContrast(Number(e.target.value))}
              disabled={loading || saving}
              style={styles.slider}
            />
            <button
              onClick={() => setContrast(Math.min(100, contrast + 5))}
              disabled={loading || saving}
              style={styles.adjustmentBtn}
            >
              +
            </button>
            <span style={styles.adjustmentValue}>{contrast}</span>
          </div>
        </div>

        <div style={styles.adjustmentRow}>
          <label style={styles.adjustmentLabel}>{t('saturation')}</label>
          <div style={styles.adjustmentControls}>
            <button
              onClick={() => setSaturation(Math.max(-100, saturation - 5))}
              disabled={loading || saving}
              style={styles.adjustmentBtn}
            >
              −
            </button>
            <input
              type="range"
              min="-100"
              max="100"
              value={saturation}
              onChange={(e) => setSaturation(Number(e.target.value))}
              disabled={loading || saving}
              style={styles.slider}
            />
            <button
              onClick={() => setSaturation(Math.min(100, saturation + 5))}
              disabled={loading || saving}
              style={styles.adjustmentBtn}
            >
              +
            </button>
            <span style={styles.adjustmentValue}>{saturation}</span>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100vw',
    height: '100vh',
    background: '#000',
    position: 'fixed',
    top: 0,
    left: 0,
    overflow: 'hidden',
  },
  loading: {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    zIndex: 2000,
  },
  spinner: {
    width: '50px',
    height: '50px',
    border: '4px solid rgba(16, 185, 129, 0.2)',
    borderTopColor: '#10b981',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  loadingText: {
    marginTop: '20px',
    color: '#10b981',
    fontSize: '16px',
    fontWeight: '600',
  },
  topActions: {
    position: 'fixed',
    top: '20px',
    left: '0',
    right: '0',
    display: 'flex',
    justifyContent: 'space-between',
    padding: '0 20px',
    zIndex: 2000,
  },
  btn: {
    width: '56px',
    height: '56px',
    borderRadius: '28px',
    border: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    fontSize: '24px',
    color: 'white',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
  },
  btnCancel: {
    background: '#ef4444',
  },
  btnReset: {
    background: '#f59e0b',
  },
  btnValidate: {
    background: '#10b981',
  },
  canvasContainer: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
  },
  adjustmentsBar: {
    position: 'fixed',
    bottom: '20px',
    left: '20px',
    right: '20px',
    zIndex: 2000,
    background: 'rgba(0, 0, 0, 0.9)',
    borderRadius: '20px',
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  adjustmentRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  adjustmentLabel: {
    color: '#fff',
    fontSize: '14px',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  adjustmentControls: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  adjustmentBtn: {
    width: '40px',
    height: '40px',
    borderRadius: '20px',
    background: 'rgba(255, 255, 255, 0.1)',
    border: '2px solid rgba(255, 255, 255, 0.2)',
    color: '#fff',
    fontSize: '20px',
    fontWeight: '600',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s',
  },
  slider: {
    flex: 1,
    height: '6px',
    borderRadius: '3px',
    background: 'rgba(255, 255, 255, 0.2)',
    outline: 'none',
    cursor: 'pointer',
    WebkitAppearance: 'none',
  },
  adjustmentValue: {
    color: '#10b981',
    fontSize: '16px',
    fontWeight: '600',
    minWidth: '45px',
    textAlign: 'right',
  },
};

// Styles pour la version mobile (React Native)
const mobileStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  loading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    zIndex: 1000,
  },
});
