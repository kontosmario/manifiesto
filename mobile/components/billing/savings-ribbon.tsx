import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, Text, View } from 'react-native'
import { useAppTheme } from '@/theme/theme-provider'

/**
 * Banda de ahorro anual del ciclo yearly. Paleta CALMA alineada con Settings
 * (superficie `primarySurface` + borde estándar + texto verde primary); el
 * acento mint queda reservado para el hero y los tiles. Si no hay ahorro real
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
  const { t } = useTranslation()

  // Sin ahorro → sin banda. La vista no debe insinuar un beneficio inexistente.
  if (savingsUsd <= 0) return null

  // Superficie calma (mismos tokens que Settings): tinte primarySurface + borde
  // estándar + texto verde primaryStrong (claro) / primary (oscuro).
  const fill = theme.colors.primarySurface
  const border = theme.colors.border
  const fg = theme.isDark ? theme.colors.primary : theme.colors.primaryStrong

  return (
    <View style={[styles.ribbon, { backgroundColor: fill, borderColor: border }]}>
      <Text style={[styles.text, { color: fg }]}>
        {t('billing:savingsRibbon.text', {
          amount: formatUsd(savingsUsd),
          percent: savingsPercent,
        })}
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
