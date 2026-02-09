# SignTouch

## Overview

SignTouch is a mobile-first photo memory application that enables users to capture photos, add personalized signatures and text overlays, apply visual adjustments (brightness, contrast, saturation), and organize memories with rich metadata. It supports a freemium subscription model with multi-language capabilities across 15 languages. The project aims to provide a unique way for users to personalize and share their visual memories, and for celebrities to interact with fans through live events, video calls, and personalized dedications.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Core Technologies
- **Frontend**: Expo SDK with React Native for cross-platform development (iOS, Android, Web).
- **Navigation**: Expo Router for file-based routing.
- **State Management**: React Context API manages global state for authentication, subscriptions, and internationalization.
- **UI/UX**: React Native Gesture Handler and Reanimated for smooth animations and interactive elements.

### Key Features
- **Photo Editing**: A unified `OverlayElement` system for text and signature overlays, image adjustments via sliders, and SVG-based signature drawing. Final image compositing is handled by `react-native-view-shot`.
- **Storage**: Dual-mode storage with AsyncStorage for local data and Supabase for cloud-synced memories and user authentication.
- **Authentication**: Passwordless magic link authentication via Supabase Auth, supporting deep linking for callbacks. Post-purchase account creation is also integrated.
- **Subscription Model**: Currently disabled (app is 100% free except live sessions). Controlled by `SUBSCRIPTION_ENABLED` flag in `contexts/SubscriptionContext.tsx` — set to `true` to re-enable freemium tiers, 7-day free trial, paywall, and promo codes. RevenueCat integration preserved for native builds.
- **Story Mode**: Allows users to create animated stories from their photos using Ken Burns, Sequential Zoom, and Parallax effects. Features interactive overlay customization (pan, pinch, rotate) and export with social sharing.
- **Gallery System**: Organizes user content into "Photos" (memories) and "Stories" tabs, with separate storage for each.
- **Live Events System**: Enables "Star Mode" for celebrities to create events with their signature (generating unique codes and QR codes) and "Fan Mode" for fans to join events, scan QR codes, and receive celebrity signatures.
- **Event Sessions System**: Extends live events to support multi-celebrity sessions with configurable durations, real-time polling-based fan galleries, and a celebrity interface for publishing assets during an event.
- **Promotional Code System**: Allows for influencer-based free trial access via promotional codes, validated per device.
- **Video Calls System**: Integrates Daily.co for live video calls between celebrities and fans, featuring real-time audio/video, host/participant roles, and multi-participant views.
- **Dynamic Queue System**: Manages real-time queues for live video sessions, including fan queuing, push notifications for turn alerts, and celebrity dashboards for queue management with automatic fan skipping and re-queueing.
- **Personalized Dedication System**: A hybrid system where celebrities provide a selfie and signature, which are then used to generate unique, personalized dedications for fans after video calls, featuring interactive signature manipulation and localization.
- **Legal Documents**: Multi-language support for CGV, CGU, Privacy Policy, and Legal Notices, dynamically displayed based on user's language with a French fallback.

## External Dependencies

### Backend Services
- **Supabase**: Primary backend for PostgreSQL database (e.g., `memories`, `live_events`, `session_queue` tables), user authentication, and file storage (`memories` bucket, `events` bucket).
- **Daily.co**: For video call functionality, integrated via `@daily-co/react-native-daily-js` SDK.

### Payment Processing
- **Live Sessions (Stripe Checkout - Option A)**: Direct CB payment via Stripe Checkout, no Apple/Google commission (like Betclic model).
  - **Purchase Flow**: Fan → `purchase-session.tsx` → Express backend creates Stripe Checkout Session → Fan redirected to Stripe payment page → Payment completed → `payment-success.tsx` verifies payment → Fan enters video call queue.
  - **Express Backend** (`server/index.js`, port 3001):
    - `POST /api/create-checkout-session`: Creates Stripe Checkout Session with Connect support (application_fee_amount for SignTouch, transfer_data for celebrity).
    - `POST /api/stripe-webhook`: Handles Stripe webhook events for payment confirmation.
    - `GET /api/verify-payment`: Verifies Checkout Session payment status.
    - `GET /api/health`: Health check endpoint.
  - **Stripe Connect**: Celebrities onboard via `StripeConnectModal` component. Connect account ID stored in AsyncStorage (to be migrated to Supabase user profile). Payments are split: SignTouch fee (15%) via application_fee_amount, rest goes to celebrity's Stripe Connect account.
  - **Fee Structure**: SignTouch 15% + Stripe 2.9% + 0.30€ per transaction. No Apple/Google store fees (30%).
- **Subscriptions (RevenueCat)**: In-app purchases and subscription management for iOS and Android (requires native build). SDK initialized in `_layout.tsx`, user ID synced via `AuthContext` on login.
- **Revenue Calculation**: Displayed in `create-live-session.tsx` — gross revenue minus SignTouch 15% minus Stripe fees.
- **Admin Access**: Payment management is done exclusively via Supabase Dashboard (Table Editor / SQL Editor), not exposed in the app.

### Build & Deployment
- **EAS (Expo Application Services)**: Used for building and submitting the application to app stores.

### Key NPM Packages
- `expo-camera`, `expo-image-picker`, `expo-image-manipulator`: For camera, gallery, and image processing.
- `react-native-view-shot`, `react-native-svg`: For compositing and rendering graphics.
- `@react-native-community/slider`: UI controls.
- `expo-font` + Google Fonts: Custom typography.
- `react-native-qrcode-svg`, `expo-barcode-scanner`: For QR code generation and scanning in live events.
- `@daily-co/react-native-daily-js`: For video calls.

### Environment Variables
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_REVENUECAT_IOS_KEY`
- `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`
- `EXPO_PUBLIC_STRIPE_SERVER_URL` — URL of the Stripe backend API
- `STRIPE_SECRET_KEY` — Stripe secret API key (server-side only)
- `STRIPE_WEBHOOK_SECRET` — Stripe webhook signing secret (server-side only)
- `STRIPE_SERVER_PORT` — Port for Stripe Express server (default: 3001)