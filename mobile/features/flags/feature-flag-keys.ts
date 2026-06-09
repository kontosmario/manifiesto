// mobile/features/flags/feature-flag-keys.ts
//
// Sprint C · C9 — Feature flag registry
//
// Source of truth para los flags reconocidos por el cliente. Mantener
// alineado con los rows insertados en la tabla `feature_flags` por la
// migración correspondiente (20260609110000_feature_flags.sql).
//
// `default` es el fallback usado si:
//   • El RPC `get_user_flags` falla (red caída, env viejo sin la
//     migración aplicada, etc).
//   • El flag no existe en la tabla todavía (ej: agregaste la key
//     localmente pero no corriste la migración).
//
// `payload` es para configuración asociada — ej: si `ai_coach` tiene
// `{model: 'claude-opus-4', max_tokens: 2000}`, el cliente lo lee desde
// el flag y no necesita variables de entorno separadas.

export interface FeatureFlagDefinition {
  default: boolean
  description?: string
}

export const FEATURE_FLAGS = {
  wrapped_v2: {
    default: false,
    description: 'Nueva versión del cycle wrapped con scenes refactoreadas',
  },
  ai_coach: {
    default: false,
    description: 'Reemplaza el control-advisor heurístico con Claude LLM',
  },
} as const satisfies Record<string, FeatureFlagDefinition>

export type FeatureFlagKey = keyof typeof FEATURE_FLAGS

export function getFeatureFlagDefault(key: FeatureFlagKey): boolean {
  return FEATURE_FLAGS[key].default
}
