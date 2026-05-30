import { memo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { SlideInView } from '@/components/home/animated/slide-in-view'
import { WhoPaidAvatar } from '@/components/home/who-paid-avatar'
import { formatMoneyWithSign } from '@/utils/money'
import { useAppTheme } from '@/theme/theme-provider'

export interface ActivityRowV2Props {
  icon: string
  title: string
  category: string
  whoName: string
  whoColor: string
  amount: number          // negative = expense, positive = credit
  delay?: number
}

function ActivityRowV2Impl({ icon, title, category, whoName, whoColor, amount, delay = 0 }: ActivityRowV2Props) {
  const { theme } = useAppTheme()
  const amountColor = amount < 0 ? theme.colors.text : theme.colors.success
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
          <View style={[styles.iconTile, { backgroundColor: theme.colors.peachBand }]}>
            <Text style={styles.iconText}>{icon}</Text>
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
  iconTile: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  iconText: { fontSize: 18 },
  flex: { flex: 1 },
  title: { fontSize: 14, fontWeight: '700' },
  sub: { fontSize: 12 },
  amount: { fontSize: 14, fontWeight: '800' },
})
