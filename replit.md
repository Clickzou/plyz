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
- **Template System**: 9 templates (3 categories × 3 styles)
  - Categories: Concert, Sport, Meetup
  - Styles: Minimal, Flashy (with confetti), Vintage (with grain effect)
- **Animation Preview**: Zoom effect on signature, transitions to full photo, text overlay appears
- **Export**: Static image export in 9:16 format with SignTouch watermark
- **Social Sharing**: Share to Instagram, TikTok via native sharing API
- **Access**: Available from result.tsx via Film icon button
- **i18n**: Fully internationalized with translation keys (storyTitle, storyCustomText, etc.)
- **Gallery Integration**: Stories are saved to a separate storage system (`storiesStorage.ts`) and displayed in the gallery under a dedicated "Stories" tab

### Gallery Tabs System (January 2026)
- **Photos Tab**: Displays all memories (photos with overlays) organized by timeline
- **Stories Tab**: Displays all exported stories in a grid layout (9:16 aspect ratio cards)
- **Separate Storage**: Stories are stored separately from memories using `storiesStorage.ts` (max 20 stories)
- **Story Actions**: View fullscreen, share via social modal, delete
- **i18n**: Translation keys: galleryPhotos, galleryStories, noStories, noStoriesHint

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