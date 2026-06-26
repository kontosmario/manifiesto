import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useThemeTokens } from '@/theme/theme-provider'

/**
 * Badge de variación de precio. Dos variantes:
 *   - 'price'    → "+12%" en tono peach (default — aumento normal del
 *                   servicio entre pagos).
 *   - 'arrears'  → "+12% int." en tono rojo más fuerte cuando el último
 *                   pago se cobró con mora. Hace explícito que la suba
 *                   incluye intereses, no aumento real del servicio.
 * Para deltas negativos no hay distinción (no hay "bajó por mora").
 */
export function TrendBadge({
  deltaPct,
  variant = 'price',
}: {
  deltaPct: number
  variant?: 'price' | 'arrears'
}) {
  const theme = useThemeTokens()
  const { t } = useTranslation()
  const up = deltaPct > 0
  const isArrears = up && variant === 'arrears'
  // Bg alpha-based para que funcione sobre cualquier canvas (card en
  // dark, cream en light, tinted en hover).
  //   price up    → peach soft
  //   arrears up  → rojo soft (más urgente que peach)
  //   down        → lime soft (mismo en ambas variantes)
  const bg = !up
    ? 'rgba(166,239,143,0.16)'
    : isArrears
      ? 'rgba(231,76,60,0.18)'
      : 'rgba(242,167,140,0.18)'
  const fg = !up
    ? theme.isDark
      ? '#A6EF8F'
      : '#297811'
    : isArrears
      ? theme.isDark
        ? '#F18C8C'
        : '#A8211B'
      : theme.isDark
        ? '#F2A78C'
        : '#B84014'
  // "int." suffix cuando es arrears para que el chip se lea como
  // "incremento con intereses" sin alargar mucho la pill.
  const valueStr = `${up ? '+' : ''}${deltaPct}`
  const label = isArrears
    ? t('fijos:trendBadge.labelArrears', { value: valueStr })
    : t('fijos:trendBadge.label', { value: valueStr })
  return (
    <View
      style={[styles.trendBadge, { backgroundColor: bg }]}
      accessibilityRole="text"
      accessibilityLabel={
        isArrears
          ? t('fijos:trendBadge.arrearsAccessibility', { deltaPct })
          : up
            ? t('fijos:trendBadge.trendUpAccessibility', { pct: Math.abs(deltaPct) })
            : t('fijos:trendBadge.trendDownAccessibility', { pct: Math.abs(deltaPct) })
      }
    >
      <Text style={[styles.trendBadgeText, { color: fg }]}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  trendBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  trendBadgeText: { fontSize: 10, fontWeight: '700', letterSpacing: -0.2 },
})
