# SignTouch

## Overview

SignTouch is a mobile-first photo memory application built with Expo and React Native. Users can capture photos, add personalized signatures and text overlays, apply visual adjustments (brightness, contrast, saturation), and organize their memories with metadata like event type, location, and date. The app supports a freemium subscription model with premium features and includes multi-language support for 15 languages.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Framework
- **Expo SDK with React Native**: Cross-platform mobile development targeting iOS, Android, and Web
- **Expo Router**: File-based routing system for navigation between screens
- **React Native Gesture Handler + Reanimated**: For signature drawing, overlay manipulation, and smooth animations

### State Management
- **React Context API**: Three primary contexts manage global state:
  - `AuthContext`: Supabase authentication with magic link email login
  - `SubscriptionContext`: Freemium/premium subscription status
  - `LanguageContext`: Multi-language internationalization (15 languages)

### Photo Editing Pipeline
- **Overlay System**: Unified `OverlayElement` type combines text and signature overlays into a single manageable structure
- **Image Adjustments**: Brightness, contrast, and saturation sliders using CSS filters (web) and SVG filters (mobile)
- **Signature Drawing**: SVG-based path drawing with gesture recognition
- **Compositing**: Uses `react-native-view-shot` to capture the final edited image

### Storage Architecture
- **Local Storage**: AsyncStorage for preferences, subscription status, and temporary data
- **Cloud Storage**: Supabase for user authentication and cloud-synced memories
- **Dual Mode**: App works offline with local storage and syncs to Supabase when user is authenticated

### Authentication Flow
- **Magic Link Authentication**: Passwordless login via email using Supabase Auth
- **Deep Linking**: Custom URL scheme (`signtouch://`) handles auth callbacks
- **Post-Purchase Account Creation**: Modal prompts users to create accounts after subscription purchase

### Subscription Model
- **RevenueCat Integration** (prepared but requires native build): Handles in-app purchases for iOS and Android
- **Freemium Tiers**: Free tier with ads, premium tier with full features
- **Trial System**: 7-day free trial with automatic billing

### Story Mode (January 2026)
- **Animation System**: 3 animation types replacing previous category/style system
  - **Ken Burns**: 15s zoom progression with subtle breathing effect
  - **Sequential Zoom (Reveal)**: 8s signature zoom then full photo reveal
  - **Parallax**: 7s 3D depth effect with glow overlay
- **Animation Preview**: Play button to preview selected animation before export
- **Interactive Overlay Customization**: Touch gestures for direct manipulation of elements on the preview
  - **Signature**: Pan to move, pinch to resize, two-finger rotate
  - **Text**: Pan to move vertically, pinch to resize
  - **Color Pickers**: 10 preset colors for signature and text
- **Export**: Static image export in 9:16 format with SignTouch watermark
- **Social Sharing**: Share to Instagram, TikTok via native sharing API
- **Access**: Available from result.tsx via Film icon button
- **i18n**: Fully internationalized (storyAnimation, animKenBurns, animSequentialZoom, animParallax)
- **Gallery Integration**: Stories saved to `storiesStorage.ts` and displayed in gallery "Stories" tab

### Gallery Tabs System (January 2026)
- **Photos Tab**: Displays all memories (photos with overlays) organized by timeline
- **Stories Tab**: Displays all exported stories in a grid layout (9:16 aspect ratio cards)
- **Separate Storage**: Stories are stored separately from memories using `storiesStorage.ts` (max 20 stories)
- **Story Actions**: View fullscreen, share via social modal, delete
- **i18n**: Translation keys: galleryPhotos, galleryStories, noStories, noStoriesHint

### Live Events System (January 2026)
- **Star Mode**: Celebrities/stars can create events with their signature
  - Draw signature directly on screen
  - Generates 6-character unique event code (e.g., ABC123)
  - QR code generation for easy sharing
  - Events expire after 24 hours
- **Fan Mode**: Fans can join events to get celebrity signatures
  - Scan QR code (mobile only) or enter manual code
  - Preview signature before saving
  - Save to local collection or use immediately
- **Storage**: Uses `live_events` table in Supabase and `events` bucket for signature SVG files
- **Screens**: `create-event.tsx` (star), `join-event.tsx` (fan)
- **Utility**: `liveEventStorage.ts` for event CRUD operations and signature upload
- **i18n**: Fully internationalized with 35+ new translation keys across all 15 languages
- **Dependencies**: `react-native-qrcode-svg` for QR generation, `expo-barcode-scanner` for scanning

## External Dependencies

### Backend Services
- **Supabase**: PostgreSQL database, authentication, and file storage
  - Project ID: `wwuxaoggbvgmyzcjlgfx`
  - Tables: `memories` with RLS policies
  - Storage: `memories` bucket for images
  - Auth: Magic link email authentication

### Payment Processing
- **RevenueCat** (integration ready, requires native build): In-app purchase management for App Store and Google Play
  - Requires `react-native-purchases` package
  - Environment variables: `EXPO_PUBLIC_REVENUECAT_IOS_KEY`, `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`

### Build & Deployment
- **EAS (Expo Application Services)**: Build and submit to app stores
  - Development, preview, and production build profiles configured in `eas.json`

### Key NPM Packages
- `expo-camera`: Photo capture
- `expo-image-picker`: Gallery access
- `expo-image-manipulator`: Image processing
- `react-native-view-shot`: Canvas capture for compositing
- `react-native-svg`: Signature and overlay rendering
- `@react-native-community/slider`: Adjustment controls
- `expo-font` + Google Fonts packages: Custom typography for signatures
- `fabric` (web only): Advanced photo editing canvas

### Environment Variables Required
```
EXPO_PUBLIC_SUPABASE_URL=your-supabase-url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
EXPO_PUBLIC_REVENUECAT_IOS_KEY=your-revenuecat-ios-key
EXPO_PUBLIC_REVENUECAT_ANDROID_KEY=your-revenuecat-android-key
```