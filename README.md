# SignTouch - Commandes de demarrage

## 1. Prerequis

- Node.js 20+
- npm 10+
- 2 terminaux ouverts (un pour Expo, un pour le serveur)

## 2. Installer les dependances

```powershell
# Frontend Expo
cd .\signtouch-app-main
npm install

# Backend API/Stripe
cd ..\server
npm install
```

## 3. Configurer les variables d'environnement

Creer un fichier `./.env.local` a la racine du repo (`signtouch/.env.local`), puis mettre au minimum:

```bash
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

STRIPE_TEST_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx

EXPO_PUBLIC_STRIPE_SERVER_URL=http://localhost:5000
EXPO_PUBLIC_DAILY_API_KEY=your-daily-api-key

EXPO_PUBLIC_REVENUECAT_IOS_KEY=your-ios-key
EXPO_PUBLIC_REVENUECAT_ANDROID_KEY=your-android-key

MOCK_MODE=false
ENABLE_MOCK_CELEBS=false
```

Note: les scripts `sync-root-env.cjs` copient automatiquement ce `.env.local` vers `signtouch-app-main/.env.local` et `server/.env.local`.

## 4. Demarrer le projet complet (web + API)

Terminal 1 (Expo web sur le port 19006):
PARTIE FRONTEND

```powershell
cd .\signtouch-app-main
npx expo start --clear --web --port 19006
```

Terminal 2 (serveur Express/Stripe sur le port 5000):
PARTIE BACKEND

```powershell
cd .\server
npm run dev
```

Acces local:

- Application + proxy API: `http://localhost:5000`
- API healthcheck: `http://localhost:5000/api/health`

## 5. Lancer l'app sur mobile (Expo Go, tunnel recommande)

Windows PowerShell:

```powershell
cd .\signtouch-app-main
npm run tunnel
```

WSL/macOS/Linux:

```bash
cd ./signtouch-app-main
npm run tunnel
```

Puis dans Expo Go:

1. Scanner le QR code dans le terminal.
2. Si le QR ne passe pas, recuperer l'URL tunnel locale:

```powershell
(Invoke-WebRequest -UseBasicParsing http://127.0.0.1:4040/api/tunnels).Content
```

3. Prendre `public_url` (https) et l'ouvrir en remplacant `https://` par `exp://`.

Exemple:

- `https://xxxx.exp.direct` -> `exp://xxxx.exp.direct`

Note: le script `npm run tunnel` applique automatiquement un patch de timeout ngrok (60s) pour ameliorer la stabilite.

## 6. Demarrer Expo seul (mobile/dev client, sans tunnel)

macOS/Linux:

```bash
cd ./signtouch-app-main
npm run dev
```

Windows PowerShell:

```powershell
cd .\signtouch-app-main
node .\scripts\sync-root-env.cjs
$env:EXPO_NO_TELEMETRY='1'
npx expo start --clear
```

## 7. Verification rapide

```powershell
curl http://localhost:5000/api/ping
curl http://localhost:5000/api/health
```

## 8. Commandes utiles

```powershell
# Lint frontend
cd .\signtouch-app-main
npm run lint

# Typecheck frontend
npm run typecheck

# Build web Expo
npm run build:web
```
