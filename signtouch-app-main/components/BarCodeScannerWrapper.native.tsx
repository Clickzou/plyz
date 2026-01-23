import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { BarCodeScanner } from 'expo-barcode-scanner';

interface BarCodeScannerWrapperProps {
  onBarCodeScanned: (result: { data: string }) => void;
  style?: any;
}

export const requestCameraPermissionAsync = async (): Promise<boolean> => {
  const { status } = await BarCodeScanner.requestPermissionsAsync();
  return status === 'granted';
};

export const isBarCodeScannerAvailable = (): boolean => {
  return true;
};

export default function BarCodeScannerWrapper({ onBarCodeScanned, style }: BarCodeScannerWrapperProps) {
  return (
    <BarCodeScanner
      onBarCodeScanned={onBarCodeScanned}
      style={style}
    />
  );
}
