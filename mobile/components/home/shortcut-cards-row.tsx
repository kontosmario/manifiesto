import { StyleSheet, Text, View } from 'react-native'
import { ShortcutCard } from '@/components/home/shortcut-card'
import { MiniBars } from '@/components/home/mini-bars'
import { PagoDots } from '@/components/home/pago-dots'
import { formatMoney } from '@/utils/money'
import { useAppTheme } from '@/theme/theme-provider'

interface ShortcutCardsRowProps {
  gastos: {
    total: number
    count: number
    trendLabel: string | null   // e.g. "+12% vs marzo"
    trendDirection: 'up' | 'down' | 'flat' | null
    miniBars: number[]          // 7 values 0..1
  }
  fijos: {
    monthlyTotal: number
    paidCount: number
    totalCount: number
    upcomingCount: number       // due in next 7 days
  }
  onPressGastos?: () => void
  onPressFijos?: () => void
}

export function ShortcutCardsRow({ gastos, fijos, onPressGastos, onPressFijos }: ShortcutCardsRowProps) {
  const { theme } = useAppTheme()
  // For Gastos: "up" (spending more) is a negative signal, "down" is positive.
  // The clay tone (#C25A3E) is the designated alert color for expense trends
  // in the V1 Cuaderno mock — it contrasts well on both cream and dark cards.
  const gastosTrendColor =
    gastos.trendDirection === 'up'
      ? '#C25A3E'
      : gastos.trendDirection === 'down'
        ? theme.colors.success
        : theme.colors.textSoft
  return (
    <View style={styles.row}>
      <ShortcutCard
        label="GASTOS"
        value={formatMoney(gastos.total)}
        sub={`este mes · ${gastos.count} ${gastos.count === 1 ? 'mov' : 'movs'}`}
        trend={gastos.trendLabel ?? ''}
        trendColor={gastosTrendColor}
        chart={<MiniBars values={gastos.miniBars} color={theme.colors.text} />}
        onPress={onPressGastos}
        delay={200}
        accessibilityLabel="Ver gastos del mes"
      />
      <ShortcutCard
        label="FIJOS"
        value={formatMoney(fijos.monthlyTotal)}
        sub={
          fijos.totalCount === 0
            ? 'sin fijos'
            : `${fijos.paidCount} de ${fijos.totalCount} pagados`
        }
        trend={
          fijos.upcomingCount > 0 ? (
            <View>
              <Text style={[styles.fijosBigNumber, { color: theme.colors.text }]}>
                {fijos.upcomingCount}
              </Text>
              <Text style={[styles.fijosBigSub, { color: theme.colors.text }]}>próximos</Text>
            </View>
          ) : null
        }
        chart={
          fijos.totalCount > 0 ? (
            <PagoDots paid={fijos.paidCount} total={Math.min(fijos.totalCount, 14)} />
          ) : null
        }
        onPress={onPressFijos}
        delay={260}
        accessibilityLabel="Ver gastos fijos"
      />
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10 },
  fijosBigNumber: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3, lineHeight: 20 },
  fijosBigSub: { fontSize: 11, fontWeight: '700', marginTop: 2 },
})
