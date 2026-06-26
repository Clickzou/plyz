const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// --- Fix @daily-co/react-native-webrtc + Expo SDK 54 ---
// react-native-webrtc depend de event-target-shim@6.0.2, dont le champ "exports"
// pousse Metro a charger la variante ESM (index.mjs). L'interop CJS rend alors
// l'export EventTarget "undefined" -> erreur "Super expression must either be null
// or a function" au chargement du SDK video natif (createCallObject).
// On desactive les "package exports" UNIQUEMENT pour event-target-shim, ce qui
// force la resolution CJS classique (champ "main"). Aucun autre module n'est impacte.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'event-target-shim' || moduleName.startsWith('event-target-shim/')) {
    return context.resolveRequest(
      { ...context, unstable_enablePackageExports: false },
      moduleName,
      platform
    );
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
