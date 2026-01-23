import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  Platform,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, QrCode, Search, Check, Download, Camera } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
const { BarCodeScanner } = require('expo-barcode-scanner');
import { useLanguage } from '@/contexts/LanguageContext';
import { getEventByCode, LiveEvent } from '@/utils/liveEventStorage';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SAVED_SIGNATURES_KEY = '@signtouch_event_signatures';

export default function JoinEventScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();

  const [code, setCode] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [foundEvent, setFoundEvent] = useState<LiveEvent | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [showScanner, setShowScanner] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);

  useEffect(() => {
    if (params.code) {
      setCode(String(params.code));
      handleSearch(String(params.code));
    }
  }, [params.code]);

  const handleSearch = async (searchCode?: string) => {
    const codeToSearch = (searchCode || code).trim().toUpperCase();
    
    if (codeToSearch.length < 4) {
      Alert.alert(t('error') || 'Error', t('invalidCode') || 'Please enter a valid code');
      return;
    }

    setIsSearching(true);
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    try {
      const event = await getEventByCode(codeToSearch);
      
      if (event) {
        setFoundEvent(event);
        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      } else {
        Alert.alert(
          t('eventNotFound') || 'Event Not Found',
          t('eventNotFoundMessage') || 'This event does not exist or has expired'
        );
      }
    } catch (error) {
      console.error('Error searching event:', error);
      Alert.alert(t('error') || 'Error', t('searchFailed') || 'Failed to search for event');
    } finally {
      setIsSearching(false);
    }
  };

  const requestCameraPermission = async () => {
    if (Platform.OS === 'web') {
      Alert.alert(
        t('notAvailable') || 'Not Available',
        t('scannerNotOnWeb') || 'QR scanner is not available on web. Please enter the code manually.'
      );
      return;
    }
    
    const { status } = await BarCodeScanner.requestPermissionsAsync();
    setHasPermission(status === 'granted');
    if (status === 'granted') {
      setShowScanner(true);
    } else {
      Alert.alert(
        t('permissionRequired') || 'Permission Required',
        t('cameraPermissionMessage') || 'Camera permission is required to scan QR codes'
      );
    }
  };

  const handleBarCodeScanned = ({ data }: { data: string }) => {
    setShowScanner(false);
    
    const match = data.match(/signtouch:\/\/event\/([A-Z0-9]+)/i);
    if (match) {
      const eventCode = match[1].toUpperCase();
      setCode(eventCode);
      handleSearch(eventCode);
    } else if (data.match(/^[A-Z0-9]{4,8}$/i)) {
      setCode(data.toUpperCase());
      handleSearch(data);
    } else {
      Alert.alert(t('invalidQR') || 'Invalid QR', t('invalidQRMessage') || 'This QR code is not valid');
    }
  };

  const saveSignature = async () => {
    if (!foundEvent?.signature_url) return;

    setIsSaving(true);
    try {
      const savedSignatures = await AsyncStorage.getItem(SAVED_SIGNATURES_KEY);
      const signatures = savedSignatures ? JSON.parse(savedSignatures) : [];
      
      const newSignature = {
        id: `event_${foundEvent.id}_${Date.now()}`,
        url: foundEvent.signature_url,
        eventName: foundEvent.name,
        eventCode: foundEvent.code,
        savedAt: Date.now(),
      };

      const exists = signatures.some((s: any) => s.url === foundEvent.signature_url);
      if (!exists) {
        signatures.unshift(newSignature);
        await AsyncStorage.setItem(SAVED_SIGNATURES_KEY, JSON.stringify(signatures.slice(0, 50)));
      }

      setSaved(true);
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      setTimeout(() => {
        router.push('/gallery');
      }, 1500);
    } catch (error) {
      console.error('Error saving signature:', error);
      Alert.alert(t('error') || 'Error', t('saveFailed') || 'Failed to save signature');
    } finally {
      setIsSaving(false);
    }
  };

  const useSignatureNow = () => {
    if (foundEvent?.signature_url) {
      router.push({
        pathname: '/camera',
        params: { eventSignature: foundEvent.signature_url, eventName: foundEvent.name }
      });
    }
  };

  if (showScanner) {
    return (
      <View style={styles.scannerContainer}>
        <BarCodeScanner
          onBarCodeScanned={handleBarCodeScanned}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={[styles.scannerOverlay, { paddingTop: insets.top }]}>
          <TouchableOpacity
            style={styles.closeScannerButton}
            onPress={() => setShowScanner(false)}
          >
            <Text style={styles.closeScannerText}>{t('close') || 'Close'}</Text>
          </TouchableOpacity>
          <View style={styles.scanFrame} />
          <Text style={styles.scannerHint}>{t('scanQRHint') || 'Point at the QR code'}</Text>
        </View>
      </View>
    );
  }

  return (
    <LinearGradient colors={['#1a1a2e', '#16213e', '#0f3460']} style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <ArrowLeft size={24} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('joinEvent') || 'Join Event'}</Text>
        <View style={styles.headerRight} />
      </View>

      <View style={styles.content}>
        {!foundEvent ? (
          <>
            <Text style={styles.instructions}>
              {t('enterEventCode') || 'Enter the event code or scan the QR code to get the signature'}
            </Text>

            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder="ABC123"
                placeholderTextColor="rgba(255,255,255,0.3)"
                value={code}
                onChangeText={(text) => setCode(text.toUpperCase())}
                maxLength={8}
                autoCapitalize="characters"
                autoCorrect={false}
              />
            </View>

            <View style={styles.actionsRow}>
              <TouchableOpacity
                style={[styles.searchButton, isSearching && styles.buttonDisabled]}
                onPress={() => handleSearch()}
                disabled={isSearching}
                activeOpacity={0.8}
              >
                {isSearching ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <>
                    <Search size={20} color="#ffffff" />
                    <Text style={styles.buttonText}>{t('search') || 'Search'}</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.scanButton}
                onPress={requestCameraPermission}
                activeOpacity={0.8}
              >
                <QrCode size={20} color="#ffffff" />
                <Text style={styles.buttonText}>{t('scan') || 'Scan'}</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <View style={styles.eventFoundContainer}>
            <View style={styles.successIcon}>
              <Check size={40} color="#10B981" />
            </View>

            <Text style={styles.eventFoundTitle}>{t('signatureFound') || 'Signature Found!'}</Text>
            <Text style={styles.eventName}>{foundEvent.name}</Text>

            {foundEvent.signature_url && (
              <View style={styles.signaturePreview}>
                <Image
                  source={{ uri: foundEvent.signature_url }}
                  style={styles.signatureImage}
                  resizeMode="contain"
                />
              </View>
            )}

            <View style={styles.eventActions}>
              <TouchableOpacity
                style={[styles.saveButton, (isSaving || saved) && styles.buttonDisabled]}
                onPress={saveSignature}
                disabled={isSaving || saved}
                activeOpacity={0.8}
              >
                {isSaving ? (
                  <ActivityIndicator color="#ffffff" />
                ) : saved ? (
                  <>
                    <Check size={20} color="#ffffff" />
                    <Text style={styles.buttonText}>{t('saved') || 'Saved!'}</Text>
                  </>
                ) : (
                  <>
                    <Download size={20} color="#ffffff" />
                    <Text style={styles.buttonText}>{t('saveSignature') || 'Save'}</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.useNowButton}
                onPress={useSignatureNow}
                activeOpacity={0.8}
              >
                <Camera size={20} color="#ffffff" />
                <Text style={styles.buttonText}>{t('useNow') || 'Use Now'}</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.searchAnotherButton}
              onPress={() => {
                setFoundEvent(null);
                setCode('');
                setSaved(false);
              }}
            >
              <Text style={styles.searchAnotherText}>{t('searchAnother') || 'Search another event'}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </LinearGradient>
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
    paddingHorizontal: 20,
    paddingBottom: 15,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
  },
  headerRight: {
    width: 44,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  instructions: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'center',
    marginBottom: 30,
    lineHeight: 24,
  },
  inputContainer: {
    marginBottom: 24,
  },
  input: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 16,
    padding: 20,
    fontSize: 28,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
    letterSpacing: 8,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 16,
  },
  searchButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6366f1',
    borderRadius: 16,
    padding: 18,
    gap: 10,
  },
  scanButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    borderRadius: 16,
    padding: 18,
    gap: 10,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  scannerContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  scannerOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeScannerButton: {
    position: 'absolute',
    top: 60,
    right: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  closeScannerText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  scanFrame: {
    width: 250,
    height: 250,
    borderWidth: 3,
    borderColor: '#ffffff',
    borderRadius: 20,
  },
  scannerHint: {
    marginTop: 30,
    fontSize: 16,
    color: '#ffffff',
    textAlign: 'center',
  },
  eventFoundContainer: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 40,
  },
  successIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  eventFoundTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 8,
  },
  eventName: {
    fontSize: 18,
    color: 'rgba(255, 255, 255, 0.7)',
    marginBottom: 30,
  },
  signaturePreview: {
    width: '100%',
    height: 150,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    marginBottom: 30,
    overflow: 'hidden',
  },
  signatureImage: {
    width: '100%',
    height: '100%',
  },
  eventActions: {
    flexDirection: 'row',
    gap: 16,
    width: '100%',
  },
  saveButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6366f1',
    borderRadius: 16,
    padding: 18,
    gap: 10,
  },
  useNowButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    borderRadius: 16,
    padding: 18,
    gap: 10,
  },
  searchAnotherButton: {
    marginTop: 24,
    padding: 12,
  },
  searchAnotherText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 14,
  },
});
