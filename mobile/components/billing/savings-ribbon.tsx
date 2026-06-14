import { memo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useAppTheme } from '@/theme/theme-provider'
import { hexAlpha } from '@/theme/state-tokens'

/**
 * Banda de ahorro anual del ciclo yearly. Tinte mint sobre crema/forest
 * con borde mint — replica `.rb` del mockup 03-paywall-AC-fireflies-v2.
 * Texto en forest (claro) / mint (oscuro). Si no hay ahorro real
 * (`savingsUsd <= 0`) no renderea nada.
 */
export interface SavingsRibbonProps {
  /** Monto ahorrado al año en USD (el delta mensual×12 − anual). */
  savingsUsd: number
  /** Porcentaje de descuento del plan anual, p. ej. 33 → "−33%". */
  savingsPercent: number
}

/** Formatea con 2 decimales solo si el monto los tiene (19 → "19", 19.89 → "19.89"). */
function formatUsd(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2)
}

export const SavingsRibbon = memo(function SavingsRibbon({
  savingsUsd,
  savingsPercent,
}: SavingsRibbonProps) {
  const { theme } = useAppTheme()

  // Sin ahorro → sin banda. La vista no debe insinuar un beneficio inexistente.
  if (savingsUsd <= 0) return null

  // Tinte mint keyed por tema: claro .20 / oscuro .13 (mockup .rb).
  const fill = hexAlpha(theme.colors.heroAccent, theme.isDark ? 0.13 : 0.2)
  const border = hexAlpha(theme.colors.heroAccent, theme.isDark ? 0.28 : 0.4)
  // Texto forest sobre crema, mint sobre forest.
  const fg = theme.isDark ? theme.colors.heroAccent : theme.colors.primaryStrong

  return (
    <View style={[styles.ribbon, { backgroundColor: fill, borderColor: border }]}>
      <Text style={[styles.text, { color: fg }]}>
        {`Ahorrás $${formatUsd(savingsUsd)} al año · −${savingsPercent}%`}
      </Text>
    </View>
  )
})

const styles = StyleSheet.create({
  ribbon: {
    marginTop: 11,
    borderRadius: 13,
    borderWidth: 1,
    paddingVertical: 9,
    paddingHorizontal: 11,
  },
  text: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
})
