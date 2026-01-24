import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

let BarCodeScanner: any = null;
let isScannerAvailable = false;

try {
  const module = require('expo-barcode-scanner');
  BarCodeScanner = module.BarCodeScanner;
  isScannerAvailable = true;
} catch (e) {
  isScannerAvailable = false;
}

interface BarCodeScannerWrapperProps {
  onBarCodeScanned: (result: { data: string }) => void;
  style?: any;
}

export const requestCameraPermissionAsync = async (): Promise<boolean> => {
  if (!isScannerAvailable || !BarCodeScanner) {
    return false;
  }
  try {
    const { status } = await BarCodeScanner.requestPermissionsAsync();
    return status === 'granted';
  } catch (e) {
    return false;
  }
};

export const isBarCodeScannerAvailable = (): boolean => {
  return isScannerAvailable;
};

export default function BarCodeScannerWrapper({ onBarCodeScanned, style }: BarCodeScannerWrapperProps) {
  if (!isScannerAvailable || !BarCodeScanner) {
    return (
      <View style={[styles.container, style]}>
        <Text style={styles.text}>Scanner non disponible</Text>
        <Text style={styles.subtext}>Utilisez le code manuel</Text>
      </View>
    );
  }

  return (
    <BarCodeScanner
      onBarCodeScanned={onBarCodeScanned}
      style={style}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
  },
  text: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  subtext: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    marginTop: 8,
  },
});
