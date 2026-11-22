import type { CapacitorConfig } from '@capacitor/cli';

// webDir pointe vers le build statique du client React Router (agent-native build
// génère build/client). Si votre pipeline sort ailleurs, ajustez cette valeur —
// le workflow GitHub Actions vérifie ce dossier avant `cap sync`.
const config: CapacitorConfig = {
  appId: 'ma.safi.hsely',
  appName: 'HSELY',
  webDir: 'build/client',
  android: {
    allowMixedContent: false,
  },
  server: {
    androidScheme: 'https',
  },
};

export default config;
