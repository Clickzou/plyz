# SignTouch App

## Overview

SignTouch is a mobile-first photo editing application built with React Native and Expo. The app allows users to capture photos, add custom signatures and text overlays, apply image adjustments (brightness, contrast, saturation), and share their creations. It features a freemium subscription model with RevenueCat integration planned for in-app purchases.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Framework
- **Expo/React Native**: Cross-platform mobile development targeting iOS, Android, and Web
- **Expo Router**: File-based routing system for navigation
- **React Native Gesture Handler + Reanimated**: For touch gestures and smooth animations on signature/text manipulation

### State Management
- **React Context API**: Three main contexts handle global state:
  - `AuthContext`: User authentication state via Supabase
  - `SubscriptionContext`: Premium subscription status tracking
  - `LanguageContext`: Multi-language support (15 languages)

### Backend Services
- **Supabase**: Authentication (magic link email flow) and data storage
  - `memories` table stores user photos with metadata
  - `memories` storage bucket for image files
  - Row Level Security ensures users only access their own data

### Image Processing
- **expo-image-manipulator**: Image cropping and manipulation
- **react-native-view-shot**: Capturing composed views as images
- **Fabric.js** (Web only): Canvas-based photo editing for filters/adjustments
- **react-native-svg**: Rendering signature paths as SVG overlays

### Overlay System
The app uses a unified overlay architecture where signatures and text are stored as `OverlayElement` objects with properties for position, rotation, scale, and color. This replaced an earlier dual-array system that caused synchronization bugs.

### Subscription/Monetization
- **RevenueCat** (planned): In-app purchases for premium features
- Current implementation uses local storage simulation
- 7-day free trial flow with post-purchase account creation modal

### Storage Strategy
- **AsyncStorage**: Local persistence for preferences, subscription status, and offline data
- **Supabase Storage**: Cloud storage for authenticated users' photos
- Hybrid approach: Local-first with cloud sync when logged in

### Key Design Decisions
1. **Magic Link Authentication**: Passwordless login via email reduces friction
2. **Unified Overlay System**: Single array manages both text and signature elements to prevent state conflicts
3. **Platform-Specific Rendering**: Fabric.js for web canvas editing, native gesture handlers for mobile
4. **Separation of Base Image and Overlays**: `baseUri` stores the filtered photo separately from overlay data, preventing loss during filter changes

## External Dependencies

### Core Services
- **Supabase** (required): Authentication and database
  - Project ID: `wwuxaoggbvgmyzcjlgfx`
  - Environment variables: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`

### Planned Integrations
- **RevenueCat**: In-app purchases (requires native builds, not Expo Go)
- **Apple App Store / Google Play**: For subscription billing

### Key NPM Packages
- `expo-camera`: Photo capture
- `expo-media-library`: Saving to device gallery
- `expo-sharing`: Native share sheet integration
- `@react-native-community/slider`: Adjustment controls
- `react-native-webview`: Mobile photo editor fallback
- Multiple `@expo-google-fonts/*` packages: Typography options for text overlays

### Build Configuration
- **EAS Build**: Configured in `eas.json` for development, preview, and production builds
- Deep linking scheme: `signtouch://`