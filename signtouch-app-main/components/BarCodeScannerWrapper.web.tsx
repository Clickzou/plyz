import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface BarCodeScannerWrapperProps {
  onBarCodeScanned: (result: { data: string }) => void;
  style?: any;
}

export const requestCameraPermissionAsync = async (): Promise<boolean> => {
  return false;
};

export const isBarCodeScannerAvailable = (): boolean => {
  return false;
};

export default function BarCodeScannerWrapper({ style }: BarCodeScannerWrapperProps) {
  return (
    <View style={[styles.container, style]}>
      <Text style={styles.text}>Scanner not available on web</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  text: {
    color: '#fff',
    fontSize: 16,
  },
});
