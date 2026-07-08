import { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Image,
} from 'react-native';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { Camera, X, SwitchCamera, Image as ImageIcon, Check, RotateCcw } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function CameraScreen() {
  const [facing, setFacing] = useState<CameraType>('back');
  const [permission, requestPermission] = useCameraPermissions();
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const cameraRef = useRef<any>(null);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  if (!permission) {
    return (
      <View style={styles.container} />
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <View style={styles.permissionContainer}>
          <Text style={styles.permissionText}>
            Nous avons besoin de votre permission pour accéder à la caméra
          </Text>
          <TouchableOpacity
            style={styles.permissionButton}
            onPress={requestPermission}>
            <Text style={styles.permissionButtonText}>Autoriser</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const goToHomeFromCamera = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/activity' as any);
    }
  };

  const toggleCameraFacing = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setIsCameraReady(false);
    setFacing(current => (current === 'back' ? 'front' : 'back'));
  };

  const pickImageFromGallery = async () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 1,
    });

    if (!result.canceled && result.assets[0]) {
      router.push({
        pathname: '/signature',
        params: { photoUri: result.assets[0].uri }
      });
    }
  };

  const takePicture = async () => {
    // NB: on ne bloque PLUS sur `isCameraReady` : sous New Architecture (iOS),
    // le callback onCameraReady de <CameraView> ne se déclenche pas de façon
    // fiable quand des enfants sont montés dans la vue -> le bouton semblait
    // « mort ». On se fie à la présence de la ref ; takePictureAsync gère l'attente.
    if (!cameraRef.current) {
      return;
    }

    try {
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
        base64: false,
      });

      let photoUri = photo.uri;

      if (facing === 'front') {
        const manipulatedImage = await ImageManipulator.manipulateAsync(
          photo.uri,
          [{ flip: ImageManipulator.FlipType.Horizontal }],
          { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
        );
        photoUri = manipulatedImage.uri;
      }

      setPreviewUri(photoUri);
    } catch (error) {
      console.error('Error taking picture:', error);
    }
  };

  const goToSignature = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    if (previewUri) {
      router.push({
        pathname: '/signature',
        params: { photoUri: previewUri }
      });
    }
  };

  const retakePhoto = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setPreviewUri(null);
  };

  if (previewUri) {
    return (
      <View style={styles.container}>
        <Image source={{ uri: previewUri }} style={styles.previewImage} resizeMode="cover" />

        <TouchableOpacity
          style={[styles.closeButton, { top: insets.top + 20 }]}
          onPress={goToHomeFromCamera}
          activeOpacity={0.8}>
          <X size={24} color="#ffffff" strokeWidth={2} />
        </TouchableOpacity>

        <View style={[styles.previewOptions, { paddingBottom: insets.bottom + 20 }]}>
          <TouchableOpacity
            style={styles.retakeButtonBottom}
            onPress={retakePhoto}
            activeOpacity={0.8}>
            <RotateCcw size={28} color="#ffffff" strokeWidth={2} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.optionButton}
            onPress={goToSignature}
            activeOpacity={0.8}>
            <Check size={32} color="#ffffff" strokeWidth={2.5} />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* La caméra est rendue SANS enfants : sinon onCameraReady ne part pas
          sous New Architecture (iOS). Les contrôles sont superposés en overlay. */}
      <CameraView
        style={StyleSheet.absoluteFill}
        facing={facing}
        ref={cameraRef}
        onCameraReady={() => setIsCameraReady(true)}
      />
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <TouchableOpacity
          style={[styles.closeButton, { top: insets.top + 20 }]}
          onPress={goToHomeFromCamera}
          activeOpacity={0.8}>
          <X size={24} color="#ffffff" strokeWidth={2} />
        </TouchableOpacity>

        <View style={[styles.cameraControls, { paddingBottom: insets.bottom + 20 }]}>
          <TouchableOpacity
            style={styles.galleryButton}
            onPress={pickImageFromGallery}
            activeOpacity={0.8}>
            <ImageIcon size={28} color="#ffffff" strokeWidth={2} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.captureButton}
            onPress={takePicture}
            activeOpacity={0.8}>
            <Camera size={36} color="#ffffff" strokeWidth={2.5} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.flipButton}
            onPress={toggleCameraFacing}
            activeOpacity={0.8}>
            <SwitchCamera size={28} color="#ffffff" strokeWidth={2} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  permissionText: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
    color: '#ffffff',
  },
  permissionButton: {
    backgroundColor: '#10b981',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 25,
  },
  permissionButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  camera: {
    flex: 1,
  },
  closeButton: {
    position: 'absolute',
    right: 20,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraControls: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: 20,
  },
  galleryButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  flipButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#10b981',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  previewOptions: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  optionsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    gap: 32,
  },
  optionButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#10b981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  retakeButtonBottom: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconWithBadge: {
    position: 'relative',
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  plusBadge: {
    position: 'absolute',
    top: -4,
    right: -6,
    backgroundColor: '#10b981',
    borderRadius: 8,
    width: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  plusBadgeText: {
    position: 'absolute',
    top: 2,
    right: -10,
    width: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
