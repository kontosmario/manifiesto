import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated from 'react-native-reanimated'
import Svg, { Path } from 'react-native-svg'
import { formatMoney } from '@/utils/money'
import { usePressScale } from '@/hooks/use-press-scale'
import { useAppTheme } from '@/theme/theme-provider'
import { RiseRow } from './smart-alerts-helpers'
import type { HeroState } from './hero-states'

interface HeaderAProps {
  state: HeroState
}

/**
 * Variant A · Editorial título + dato vivo. Title big 34pt + sub-line
 * state-aware con dato útil (count + suma del ciclo / pendientes /
 * vencidos / cobrás mañana / etc). Reemplaza el subtitle genérico
 * "Todo lo recurrente en un solo lugar" del header viejo. Add button
 * circular minimalista sin halo — restraint editorial.
 */
export function HeaderEditorial({ state }: HeaderAProps) {
  const { theme } = useAppTheme()
  const press = usePressScale({ pressedScale: 0.94 })

  return (
    <View style={styles.row}>
      <View style={styles.titleBlock}>
        <RiseRow delay={0}>
          <Text style={[styles.title, { color: theme.colors.text }]}>Fijos</Text>
        </RiseRow>
        <RiseRow delay={80}>
          <Text
            style={[styles.subtitle, { color: theme.colors.textMuted }]}
            numberOfLines={2}
          >
            {resolveSub(state)}
          </Text>
        </RiseRow>
      </View>

      <RiseRow delay={140}>
        <Pressable
          onPressIn={press.onPressIn}
          onPressOut={press.onPressOut}
          accessibilityRole="button"
          accessibilityLabel="Agregar fijo"
        >
          <Animated.View
            style={[
              styles.addButton,
              {
                backgroundColor: theme.colors.creamCard,
                borderColor: theme.colors.line,
              },
              press.animatedStyle,
            ]}
          >
            <PlusIcon color={theme.colors.text} />
          </Animated.View>
        </Pressable>
      </RiseRow>
    </View>
  )
}

function resolveSub(state: HeroState): string {
  if (state.isEmpty) return 'Cargá tu primer fijo para empezar.'
  if (state.cantidadVencidos > 0)
    return `${state.cantidadFijos} ítems · ${state.cantidadVencidos} ${state.cantidadVencidos === 1 ? 'vencido' : 'vencidos'}`
  if (state.isAllPaid && state.daysRemaining <= 1)
    return `${state.cantidadFijos} ítems · cobrás mañana`
  if (state.isAllPaid)
    return `${state.cantidadFijos} ítems · todo pagado este ciclo`
  if (state.cycleDayIndex <= 3 && state.cantidadPagados === 0)
    return `${state.cantidadFijos} ítems · ${formatMoney(state.totalFijos)} este ciclo`
  return `${state.cantidadFijos} ítems · ${formatMoney(state.totalFijos)}/mes`
}

const PlusIcon = ({ color }: { color: string }) => (
  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
    <Path
      d="M12 5v14M5 12h14"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
    />
  </Svg>
)

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingTop: 2,
  },
  titleBlock: { flex: 1 },
  title: {
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -1.2,
    lineHeight: 34,
  },
  subtitle: {
    fontSize: 13,
    marginTop: 6,
    lineHeight: 18,
    maxWidth: 260,
    fontWeight: '500',
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginLeft: 8,
    borderWidth: 1,
  },
})
