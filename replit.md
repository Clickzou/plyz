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
- **Gallery System**: Organizes user content into "Photos" (memories), "Stories", and "Collector Live" (dedications from live sessions) tabs, with separate storage for each.
- **Live Events System**: Enables "Star Mode" for celebrities to create events with their signature (generating unique codes and QR codes) and "Fan Mode" for fans to join events, scan QR codes, and receive celebrity signatures.
- **Event Sessions System**: Extends live events to support multi-celebrity sessions with configurable durations, real-time polling-based fan galleries, and a celebrity interface for publishing assets during an event.
- **Promotional Code System**: Allows for influencer-based free trial access via promotional codes, validated per device.
- **Video Calls System**: Integrates Daily.co for live video calls between celebrities and fans, featuring real-time audio/video, host/participant roles, and multi-participant views.
- **Scheduled Sessions**: Live video sessions can be started immediately (LIVE mode) or scheduled for a future date and time, with calendar and time pickers. Scheduled sessions use `status: 'scheduled'` and store the planned start in `scheduled_at` column.
- **Dynamic Queue System**: Manages real-time queues for live video sessions, including fan queuing, push notifications for turn alerts, and celebrity dashboards for queue management with automatic fan skipping and re-queueing.
- **Personalized Dedication System**: A hybrid system where celebrities provide a selfie and signature, which are then used to generate unique, personalized dedications for fans after video calls, featuring interactive signature manipulation and localization.
- **Legal Documents**: Multi-language support for CGV, CGU, Privacy Policy, and Legal Notices, dynamically displayed based on user's language with a French fallback.

## External Dependencies

### Backend Services
- **Supabase**: Primary backend for PostgreSQL database (e.g., `memories`, `live_events`, `session_queue`, `user_profiles` tables), user authentication, and file storage (`memories` bucket, `events` bucket).
  - **User Profiles** (`user_profiles` table): Links Supabase auth user ID with Stripe Connect account ID. Utility functions in `utils/userProfile.ts` handle upsert with AsyncStorage fallback/cache.
- **Daily.co**: For video call functionality, integrated via `@daily-co/react-native-daily-js` SDK.

### Payment Processing
- **Live Sessions (Stripe Checkout - Pre-Authorization)**: Direct CB payment via Stripe Checkout with manual capture, no Apple/Google commission.
  - **Pre-Authorization Flow**: Fan enters code → enters name → clicks "Join Queue" → redirected to `purchase-session.tsx` → Stripe Checkout (manual capture) → amount RESERVED on card → `payment-success.tsx` verifies authorization → fan auto-joins queue → video call happens → after call, `video-call.tsx` calls `/api/capture-payment` → amount actually charged → confirmation popup shown to fan. If call doesn't happen, authorization expires and fan is never charged.
  - **Express Backend** (`server/index.js`, port 5000 with proxy to Expo on 19006):
    - `POST /api/create-connect-account`: Creates Stripe Connect Express account for celebrity onboarding.
    - `POST /api/create-account-link`: Generates Stripe Connect onboarding link for celebrity.
    - `GET /api/connect-account-status`: Checks celebrity's Stripe Connect account status (charges_enabled, payouts_enabled).
    - `POST /api/create-checkout-session`: Creates Stripe Checkout Session with `capture_method: 'manual'` for pre-authorization (Connect support with application_fee_amount for SignTouch, transfer_data for celebrity).
    - `POST /api/capture-payment`: Captures a pre-authorized payment after successful video call (takes checkout_session_id, retrieves and captures the PaymentIntent).
    - `POST /api/cancel-payment`: Cancels a pre-authorized payment if the call doesn't happen (takes checkout_session_id).
    - `GET /api/verify-payment`: Verifies Checkout Session payment/authorization status (returns `authorized: true` when `requires_capture`).
    - `GET /api/session-earnings`: Returns real-time earnings for a live session (queries Stripe for captured payments, calculates celebrity's net share).
    - `GET /api/celebrity-earnings`: Returns full earnings history for a celebrity — all sessions, fan counts, duration, revenue per session, and estimated payout date.
    - `POST /api/launch-scheduled-session`: Transitions a scheduled live session to 'waiting' status and updates linked event_sessions to 'live'.
    - `POST /api/validate-promo-code`: Validates a promo code for a live video session (checks active, expiry, max_uses in `promo_code_live_video` table). Returns discount_percent if valid.
    - `POST /api/validate-event-promo-code`: Validates a promo code for a dedication event (checks active, expiry, max_uses in `promo_code_evenement_qr` table). Returns discount_percent if valid.
    - `POST /api/use-event-promo-code`: Increments used_count for an event promo code after successful gallery access (atomic with optimistic locking).
    - `POST /api/use-promo-code`: Increments used_count for a promo code after successful queue join (atomic with optimistic locking).
    - `POST /api/set-event-payment-config`: Stores event payment config (price, celebrity Stripe account) for a dedication event session.
    - `GET /api/get-event-payment-config`: Retrieves payment config for an event session (price, celebrity Stripe account).
    - `POST /api/create-event-checkout`: Creates Stripe Checkout session for dedication event payment with 15% platform fee and Connect transfer.
    - `GET /api/verify-event-payment`: Verifies Stripe Checkout payment status and records paid access server-side.
    - `GET /api/check-event-access`: Checks if a fan has paid for a specific event session (server-side verification).
    - `POST /api/stripe-webhook`: Handles Stripe webhook events for payment confirmation (also records dedication event payments).
    - `GET /api/health`: Health check endpoint.
  - **Stripe Connect**: Full automated onboarding via `StripeConnectModal` component. Server creates Express accounts, generates onboarding links, and verifies status. Celebrity's Stripe Connect account ID stored in AsyncStorage and in live session data (`celebrity_stripe_account_id`). Payments are automatically split: SignTouch fee (15%) via application_fee_amount, rest goes to celebrity's Stripe Connect account.
  - **Fee Structure**: SignTouch 15% + Stripe 2.9% + 0.30€ per transaction. No Apple/Google store fees.
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

### Marketplace Features (NEW)
- **Celebrity Discovery Wall**: `discover.tsx` - Search, sort, filter celebrities with pagination and badge system
- **Celebrity Detail**: `celebrity-detail.tsx` - Full profile with tabs (About/Pricing/Posts), booking and autograph actions
- **Activity Feed**: `activity.tsx` - News feed with posts and events from celebrities
- **My Space**: `my-space.tsx` - Fan's bookings and autograph requests
- **API Endpoints**: 15+ marketplace endpoints in `server/index.js` (GET /api/celebrities, GET /api/celebrity/:id, GET /api/feed, POST /api/posts, POST /api/report, POST /api/book-video, POST /api/autograph, etc.)
- **Wikidata Integration**: Server-side search, entity resolution, and celebrity profile sync
- **Badge System**: Official verified + Stripe Connect verified badges
- **Navigation**: BottomNav updated to 6 tabs (Home, Discover, Celebrity, Fan, My Space, Account)
- **Migration Required**: Marketplace tables must be created in Supabase SQL Editor using `server/migration.sql`. Tables needed: celebrity_profiles, celebrity_pricing, booking_requests, autograph_requests, posts, wikidata_entities, reports.

### Environment Variables
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_REVENUECAT_IOS_KEY`
- `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`
- `EXPO_PUBLIC_STRIPE_SERVER_URL` — URL of the Stripe backend API
- `STRIPE_SECRET_KEY` — Stripe secret API key (server-side only)
- `STRIPE_WEBHOOK_SECRET` — Stripe webhook signing secret (server-side only)
- `STRIPE_SERVER_PORT` — Port for Stripe Express server (default: 3001)