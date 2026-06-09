// mobile/features/flags/resolve-flag.ts
//
// Pure helper para resolver un flag contra un map en memoria. Separado
// del hook (`use-feature-flags.ts`) para poder testearlo sin tirar la
// dep de supabase + react-query, que vitest no tiene cargadas en el
// runtime de node.

import {
  getFeatureFlagDefault,
  type FeatureFlagKey,
} from '@/features/flags/feature-flag-keys'

export interface ResolvedFeatureFlag {
  enabled: boolean
  payload: Record<string, unknown>
}

export type FeatureFlagsMap = Record<string, ResolvedFeatureFlag>

export function resolveFlag(
  key: FeatureFlagKey,
  map: FeatureFlagsMap | undefined,
): ResolvedFeatureFlag {
  const def = getFeatureFlagDefault(key)
  if (!map) return { enabled: def, payload: {} }
  const row = map[key]
  if (!row) return { enabled: def, payload: {} }
  return row
}
