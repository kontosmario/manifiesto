import { StyleSheet, View } from 'react-native'
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
  const gastosTrendColor =
    gastos.trendDirection === 'up' ? theme.colors.warning
      : gastos.trendDirection === 'down' ? theme.colors.success
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
        trend={fijos.upcomingCount > 0 ? `${fijos.upcomingCount} próximos` : ''}
        trendColor={theme.colors.text}
        chart={fijos.totalCount > 0 ? <PagoDots paid={fijos.paidCount} total={Math.min(fijos.totalCount, 14)} /> : null}
        onPress={onPressFijos}
        delay={260}
        accessibilityLabel="Ver gastos fijos"
      />
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10 },
})
