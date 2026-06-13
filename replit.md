# Plyz

## Overview

Plyz is a mobile-first photo memory application designed for users to capture, personalize, and organize visual memories. It allows adding personalized signatures, text overlays, and applying visual adjustments to photos. The platform supports a freemium model and multi-language capabilities. Beyond personal use, Plyz facilitates unique interactions between celebrities and fans through live events, video calls, and personalized dedications, aiming to create a new way for public figures to engage with their audience.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Core Technologies
- **Frontend**: Expo SDK with React Native for cross-platform development (iOS, Android, Web).
- **Navigation**: Expo Router for file-based routing.
- **State Management**: React Context API.
- **UI/UX**: React Native Gesture Handler and Reanimated for animations and interactive elements.

### Key Features
- **Photo Editing**: Unified `OverlayElement` system for text/signature overlays, image adjustments via sliders, SVG signature drawing, and image compositing using `react-native-view-shot`.
- **Storage**: Dual-mode storage with AsyncStorage for local data and Supabase for cloud-synced memories and user authentication.
- **Authentication**: Passwordless magic link authentication via Supabase Auth, with deep linking.
- **Subscription Model**: Integrates RevenueCat for freemium tiers, free trials, and paywall management (currently disabled but configurable).
- **Story Mode**: Enables creation of animated photo stories with Ken Burns, Sequential Zoom, and Parallax effects, supporting interactive overlay customization and export.
- **Gallery System**: Organizes content into "Photos," "Stories," and "Collector Live" with separate storage.
- **Live Events System**: "Star Mode" for celebrities to create events with unique signatures (generating codes/QR codes) and "Fan Mode" for joining events and receiving personalized signatures.
- **Event Sessions System**: Supports multi-celebrity sessions with configurable durations, real-time fan galleries, and celebrity tools for asset publishing during events.
- **Promotional Code System**: Allows influencer-based free trial access for live video sessions and dedication events.
- **Video Calls System**: Integrates Daily.co for live video calls between celebrities and fans, supporting real-time audio/video, host/participant roles, and multi-participant views.
- **Scheduled Sessions**: Supports immediate or scheduled video sessions with calendar and time pickers.
- **Dynamic Queue System**: Manages real-time queues for live video sessions, including fan queuing, push notifications, and celebrity dashboards for queue management.
- **Personalized Dedication System**: Hybrid system where celebrities provide selfies and signatures for unique, personalized dedications for fans after video calls, featuring interactive signature manipulation.
- **Content Moderation**: Server-side AI-powered image moderation using NSFW.js to analyze uploaded images for inappropriate content before publication.
- **Legal Documents**: Multi-language support for legal documents, dynamically displayed based on user's language.

### Marketplace Features
- **Celebrity Discovery**: Search, sort, and filter celebrities with pagination and a badge system.
- **Celebrity Detail Pages**: Full profiles with sections for information, pricing, posts, and booking/autograph actions.
- **Activity Feed**: A news feed displaying posts and events from followed celebrities.
- **My Space Dashboard**: Dual-mode dashboard for fans (bookings, autograph requests) and celebrities (incoming bookings, autograph requests, earnings, post publishing).
- **Verification Systems**:
    - **Wikidata Auto-Verification**: Automatic verification for celebrities recognized by Wikidata.
    - **Creator Verification**: For streamers, YouTubers, TikTokers, and influencers based on social media links and follower counts (auto-approved if >= 10,000 followers, otherwise manual review).
    - **Organization Verification**: For non-individual accounts (e.g., sports clubs, brands) requiring manual admin review.

### Security
- **Mock Mode Protection**: `MOCK_MODE` environment variable ensures mock data is only used in development and is rejected in production.
- **JWT Authentication**: Payment-related API endpoints (`/api/book-video`, `/api/autograph`) require valid Supabase JWT for fan authentication and authorization.
- **Server-Side Price Calculation**: Prices for celebrities are computed server-side and not trusted from the client.

## External Dependencies

### Backend Services
- **Supabase**: Primary backend for PostgreSQL database (e.g., `memories`, `live_events`, `session_queue`, `user_profiles` tables), user authentication, and file storage (`memories` bucket, `events` bucket).
- **Daily.co**: Integrated for video call functionality via `@daily-co/react-native-daily-js` SDK.

### Payment Processing
- **Stripe Checkout (Live Sessions)**: Direct credit card payments for live sessions using manual capture.
  - **Stripe Connect**: Used for celebrity onboarding, creating Express accounts, generating onboarding links, and facilitating automatic payment splitting (Plyz fee + celebrity payout).
  - **Express Backend**: Custom Node.js Express server (`server/index.js`) handles Stripe API interactions for creating Connect accounts, managing checkout sessions, capturing/canceling payments, verifying payments, calculating earnings, launching scheduled sessions, and validating/using promo codes.
- **RevenueCat (Subscriptions)**: Integrated for in-app purchases and subscription management on iOS and Android.

### Build & Deployment
- **EAS (Expo Application Services)**: Used for building and submitting the application to app stores.