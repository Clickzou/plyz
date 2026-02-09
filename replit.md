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
- **Subscription Model**: Freemium tiers with a 7-day free trial, managed through RevenueCat integration (for native builds). Paywall screen at `app/paywall.tsx` with real RevenueCat connection, restore purchases, and promo codes.
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

### Payment Processing (Stratégie B)
- **RevenueCat**: Handles in-app purchases and subscription management for iOS and Android (requires native build). SDK initialized in `_layout.tsx`, user ID synced via `AuthContext` on login.
- **Purchase Flow**: Fan → `purchase-session.tsx` → RevenueCat purchase → Edge Function `create_paid_session_intent` (creates transaction as 'created') → RevenueCat webhook `rc_webhook` (confirms to 'store_confirmed') → Fan enters video call.
- **Edge Functions** (Supabase Deno, deployed):
  - `create_paid_session_intent`: validates auth, verifies RC transaction, creates session + transaction. Verify JWT: ON (requires user auth token).
  - `rc_webhook`: processes INITIAL_PURCHASE, NON_RENEWING_PURCHASE, CANCELLATION, REFUND events. Verify JWT: OFF (public webhook endpoint).
- **Webhook URL** (configured in RevenueCat Dashboard, working 200): `https://qoitixdpcqlzgyusbgdx.functions.supabase.co/rc_webhook?token=rc_wh_9f83c7a2_signtouch` — NOT `/functions/v1/` (avoids JWT/header issues).
- **Edge Function Secrets** (configured in Supabase Dashboard > Edge Functions > Secrets): `REVENUECAT_SECRET_API_KEY` ✅, `REVENUECAT_WEBHOOK_SECRET` ✅
- **Payment Tracking**: Comprehensive Supabase-based system (SQL in `signtouch-app-main/sql/payment_system_strategy_b.sql` + `revenuecat_additions.sql`):
  - `fan_transactions`: Records each fan purchase with status lifecycle (created → store_confirmed → settled → included_in_payout → paid_out), includes `rc_transaction_id`, `store_transaction_id`, `rc_event_id` columns
  - `webhook_events`: Stores RevenueCat webhook payloads with idempotency (unique event_id), RLS restricted to service_role only
  - `store_settlements`: Imports Apple/Google financial reports with net proceeds
  - `celebrity_earnings`: Computes celebrity share from net proceeds (configurable revshare via `celebrity_revshare_bps`, default 52%)
  - `payout_batches` / `payout_batch_items`: Groups earnings into periodic payouts
  - SQL functions: `apply_settlement()`, `compute_celebrity_earnings()`, `create_payout_batch()`, `mark_payout_paid()`
  - Admin view: `admin_payment_dashboard` (SQL view in Supabase, not in-app)
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