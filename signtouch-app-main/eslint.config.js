// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    // Fichiers hors application Expo : ils ont leur propre environnement
    // (serveur Node, scripts de build Node, Edge Functions Deno) et ne doivent
    // pas être analysés avec les règles d'une app React Native.
    ignores: [
      "dist/*",
      "scripts/**",
      "email-server.js",
      "supabase/functions/**",
    ],
  },
  {
    rules: {
      // Beaucoup de textes de l'app (français) contiennent des apostrophes ;
      // cette règle est purement cosmétique et génère trop de faux positifs.
      "react/no-unescaped-entities": "off",
      // findDOMNode n'est utilisé qu'en dernier recours pour la capture d'écran
      // web, à l'intérieur de blocs try/catch défensifs (sans effet sur React 19).
      "react/no-find-dom-node": "off",
    },
  },
]);
