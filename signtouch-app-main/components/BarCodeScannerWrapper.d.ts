import { ComponentType } from 'react';

export interface BarCodeScannerWrapperProps {
  onBarCodeScanned: (result: { type: string; data: string }) => void;
  style?: any;
}

export const requestCameraPermissionAsync: () => Promise<boolean>;
export const isBarCodeScannerAvailable: () => boolean;

declare const BarCodeScannerWrapper: ComponentType<BarCodeScannerWrapperProps>;
export default BarCodeScannerWrapper;
