import type { ExpoConfig } from 'expo/config'

const config: ExpoConfig = {
  name: 'Manifiesto',
  slug: 'manifiesto',
  version: '1.0.0',
  icon: './assets/brand/wallet-cartoon-app-icon.png',
  orientation: 'portrait',
  scheme: 'manifiesto',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  plugins: [
    'expo-router',
    'expo-notifications',
    'expo-sqlite',
    'expo-asset',
    'expo-secure-store',
    [
      'expo-local-authentication',
      {
        faceIDPermission: 'Permití Face ID para desbloquear tu acceso guardado en Manifiesto.',
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.manifiesto.mobile',
    icon: './assets/brand/wallet-cartoon-app-icon.png',
  },
  android: {
    package: 'com.manifiesto.mobile',
  },
  extra: {
    eas: {
      projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID,
    },
  },
}

export default config
