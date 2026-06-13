import React from 'react';
import { CameraView, Camera } from 'expo-camera';

interface BarCodeScannerWrapperProps {
  onBarCodeScanned: (result: { type: string; data: string }) => void;
  style?: any;
}

export const requestCameraPermissionAsync = async (): Promise<boolean> => {
  try {
    const { status } = await Camera.requestCameraPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
};

export const isBarCodeScannerAvailable = (): boolean => {
  return true;
};

export default function BarCodeScannerWrapper({ onBarCodeScanned, style }: BarCodeScannerWrapperProps) {
  return (
    <CameraView
      onBarcodeScanned={onBarCodeScanned}
      barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
      style={style}
    />
  );
}
