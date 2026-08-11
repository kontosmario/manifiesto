import { useMemo } from 'react'
import type { ViewStyle } from 'react-native'
import { SUPPORTS_INSET_SHADOW } from '@/components/wizard/inset-shadow-support'
import { neoInk, type NeoInk } from '@/theme/neo-ink'
import { neoTokens, type NeoTokens } from '@/theme/neo-tokens'
import type { ResolvedThemeMode } from '@/theme/palette'
import { useThemeTokens } from '@/theme/theme-provider'

/**
 * Escalón APAGADO que llega a AA sobre las superficies del rediseño.
 *
 * `neo.textMuted` es la tinta de labels y eyebrows, pero a 11-12px sobre la
 * hoja (`neo.sheet`) se queda en 3.89:1 — abajo de los 4.5:1 que pide AA para
 * texto normal. Este par es el mismo `d2` / `textSoft` que ya usan los specs
 * de Home, Gastos, Fijos y auth para exactamente ese caso: 6.60:1 en claro y
 * 8.46:1 en oscuro sobre la hoja.
 */
const SOFT_INK: Record<ResolvedThemeMode, string> = {
  light: '#3E5A44',
  dark: '#B9CCB2',
}

export interface ImportReviewNeo {
  mode: ResolvedThemeMode
  neo: NeoTokens
  ink: NeoInk
  /** Tinta apagada para textos de 11-13px (meta, hints, líneas de aviso). */
  softInk: string
  /**
   * Borde de emergencia para pozos. Android < API 29 descarta el `boxShadow`
   * inset EN SILENCIO: sin esto, un pozo queda del mismo material que su
   * contenedor y el control desaparece. Ver `SUPPORTS_INSET_SHADOW`.
   */
  wellFallback: ViewStyle | null
}

/** Tokens del rediseño que comparten las piezas del wizard de importación. */
export function useImportReviewNeo(): ImportReviewNeo {
  const theme = useThemeTokens()
  const mode = theme.mode
  return useMemo(() => {
    const neo = neoTokens(mode)
    return {
      mode,
      neo,
      ink: neoInk(mode),
      softInk: SOFT_INK[mode],
      wellFallback: SUPPORTS_INSET_SHADOW
        ? null
        : { borderWidth: 1, borderColor: neo.sheetDivider },
    }
  }, [mode])
}
