import { memo, useMemo, type ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { SlideInView } from '@/components/home/animated/slide-in-view'
import { WhoPaidAvatar } from '@/components/home/who-paid-avatar'
import { formatMoneyWithSign } from '@/utils/money'
import { withAlpha } from '@/theme/color-utils'
import { useAppTheme } from '@/theme/theme-provider'

export interface ActivityRowV2Props {
  /**
   * Ícono del tile. Acepta un string (emoji — back-compat, p.ej. los
   * ingresos pasan un emoji por kind) que se rendea en un `<Text>`, o un
   * ReactNode ya construido (p.ej. `<CategoryIcon>` para los gastos, que
   * rendea el sticker PNG con fallback al emoji).
   */
  icon: ReactNode
  title: string
  category: string
  /** Color (hex) de la categoría — tinta el icon tile igual que en
   *  Gastos · Movimientos (GastoRow). Para ingresos se pasa el verde de
   *  crédito. */
  categoryColor: string
  whoName: string
  whoColor: string
  amount: number          // negative = expense, positive = credit
  delay?: number
}

function ActivityRowV2Impl({ icon, title, category, categoryColor, whoName, whoColor, amount, delay = 0 }: ActivityRowV2Props) {
  const { theme } = useAppTheme()
  const amountColor = amount < 0 ? theme.colors.text : theme.colors.success
  // Icon tile tinted por categoría — mismo patrón que GastoRow (bg 14% +
  // borde 22% del color de la categoría). Memoizado: el row vive en lista
  // y se re-renderea seguido; sin esto se parsea el hex en cada render.
  const iconTileStyle = useMemo(
    () => [
      styles.iconTile,
      {
        backgroundColor: withAlpha(categoryColor, 0.14),
        borderColor: withAlpha(categoryColor, 0.22),
      },
    ],
    [categoryColor],
  )
  return (
    <SlideInView delay={delay}>
      <View
        style={[
          styles.row,
          {
            // Theme-aware para matchear GastoRow en Gastos · Movimientos:
            // dark → surfaceMuted (verde near-black), light → creamCard.
            // Antes era creamCard fijo, que en dark se leía mucho más
            // claro que el row de gastos.
            backgroundColor: theme.isDark
              ? theme.colors.surfaceMuted
              : theme.colors.creamCard,
          },
        ]}
      >
        <View style={styles.iconWrap}>
          <View style={iconTileStyle}>
            {typeof icon === 'string' ? (
              <Text style={styles.iconText}>{icon}</Text>
            ) : (
              icon
            )}
          </View>
          <WhoPaidAvatar name={whoName} color={whoColor} />
        </View>
        <View style={styles.flex}>
          <Text style={[styles.title, { color: theme.colors.text }]} numberOfLines={1}>{title}</Text>
          <Text style={[styles.sub, { color: theme.colors.textMuted }]} numberOfLines={1}>
            {whoName} · {category}
          </Text>
        </View>
        <Text style={[styles.amount, { color: amountColor }]}>{formatMoneyWithSign(amount)}</Text>
      </View>
    </SlideInView>
  )
}

/**
 * Memo wrap. ActivityRowV2 se renderea en lista (hasta 6 rows en Home).
 * Sin memo, cada vez que HomeActivitySection re-renderea (cualquier
 * cambio del parent), TODAS las rows se re-rendereaban con sus
 * SlideInView entrance worklets. Con memo solo re-renderean las rows
 * cuyo prop cambió — primitivos comparados shallow, exact stability.
 */
export const ActivityRowV2 = memo(ActivityRowV2Impl)

const styles = StyleSheet.create({
  // Only round the LEFT corners. The outer SwipeableRow clip + border
  // render the rounded outline for all 4 corners (the widget's
  // "contorno"), and its overflow: hidden clips the right side of the
  // fill. During swipe the card's right edge stays straight so the
  // delete button meets it flush — no visible gap.
  row: {
    borderTopLeftRadius: 14,
    borderBottomLeftRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconWrap: { position: 'relative' },
  iconTile: { width: 36, height: 36, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  iconText: { fontSize: 18 },
  flex: { flex: 1 },
  title: { fontSize: 14, fontWeight: '700' },
  sub: { fontSize: 12 },
  amount: { fontSize: 14, fontWeight: '800' },
})
