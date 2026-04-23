import { getErrorMessage } from '@/utils/error-message'

type FilamentModule = typeof import('react-native-filament')

let filamentModule: FilamentModule | null = null
let filamentModuleError: unknown = null

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  filamentModule = require('react-native-filament') as FilamentModule
} catch (error) {
  filamentModuleError = error
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
export const walletModel = require('../../../assets/brand/wallet-cartoon.glb') as number
// eslint-disable-next-line @typescript-eslint/no-require-imports
export const walletFallback = require('../../../assets/brand/wallet-cartoon-fallback.png') as number

export const MODEL_BASE_PITCH = 0.12
export const MODEL_BASE_YAW = -0.44
export const MODEL_AUTO_ROTATION_SPEED = 0.34
export const MODEL_AUTO_ROTATION_FRAME_MS = 40

export type RotationVector = [number, number, number]

export function getFilamentUnavailableDetail(error: unknown) {
  const fallbackMessage =
    'No se pudo cargar react-native-filament. Probá con un build nativo limpio.'
  const message = getErrorMessage(error, fallbackMessage)

  if (
    message.includes('TurboModuleRegistry.getEnforcing') &&
    message.includes("'Worklets' could not be found")
  ) {
    return `${message}\n\nEl build instalado no trae react-native-worklets-core en el binario nativo. Reinstalá la app después de correr \`npx expo run:ios\` o regenerar el build.`
  }

  return message
}

export function getFilamentRuntime() {
  return {
    filamentModule,
    filamentModuleError,
  }
}
