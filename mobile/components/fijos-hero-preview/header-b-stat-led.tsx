import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated from 'react-native-reanimated'
import Svg, { Path } from 'react-native-svg'
import { CountUpText } from '@/components/home/animated/count-up-text'
import { formatMoney } from '@/utils/money'
import { usePressScale } from '@/hooks/use-press-scale'
import { useAppTheme } from '@/theme/theme-provider'
import { buildProximosPalette } from './proximos-colors'
import { RiseRow } from './smart-alerts-helpers'
import type { HeroState } from './hero-states'

interface HeaderBProps {
  state: HeroState
}

/**
 * Variant B · Stat-led. Eyebrow tiny "FIJOS" + dato monetario big
 * (32pt 900) como héroe del header. Es una jerarquía invertida: el
 * dato es lo primero que ves, el label es contexto. Funciona porque
 * Fijos es una vista de "cuánto comprometido tengo cada mes" —
 * el monto es la respuesta principal.
 *
 * Add button FAB chico al lado derecho.
 */
export function HeaderStatLed({ state }: HeaderBProps) {
  const { theme } = useAppTheme()
  const palette = buildProximosPalette(theme)
  const press = usePressScale({ pressedScale: 0.94 })

  return (
    <View style={styles.row}>
      <View style={styles.titleBlock}>
        <RiseRow delay={0}>
          <Text style={[styles.eyebrow, { color: theme.colors.textMuted }]}>
            FIJOS · {state.monthLong.toUpperCase()}
          </Text>
        </RiseRow>
        <RiseRow delay={80}>
          <CountUpText
            value={state.totalFijos}
            duration={900}
            format={(n) => formatMoney(Math.round(n))}
            style={[styles.bigStat, { color: theme.colors.text }]}
          />
        </RiseRow>
        <RiseRow delay={160}>
          <Text
            style={[
              styles.subStat,
              { color: resolveSubColor(state, palette, theme.colors.textMuted) },
            ]}
          >
            {resolveSubLabel(state)}
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
                backgroundColor: theme.colors.text,
              },
              press.animatedStyle,
            ]}
          >
            <PlusIcon color={theme.colors.creamCard} />
          </Animated.View>
        </Pressable>
      </RiseRow>
    </View>
  )
}

function resolveSubLabel(state: HeroState): string {
  if (state.isEmpty) return 'Cargá tu primer fijo para empezar'
  if (state.cantidadVencidos > 0)
    return `${state.cantidadFijos} ítems · ${state.cantidadVencidos} vencidos`
  if (state.isAllPaid) return `${state.cantidadFijos} ítems · todo pagado`
  return `${state.cantidadFijos} ítems · ${state.cantidadPagados} pagados`
}

function resolveSubColor(
  state: HeroState,
  palette: ReturnType<typeof buildProximosPalette>,
  defaultColor: string,
): string {
  if (state.cantidadVencidos > 0) return palette.urgency
  if (state.isAllPaid) return palette.success
  return defaultColor
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
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingTop: 2,
  },
  titleBlock: { flex: 1 },
  eyebrow: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.8,
    marginBottom: 6,
  },
  bigStat: {
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -1.4,
    lineHeight: 34,
    fontVariant: ['tabular-nums'],
  },
  subStat: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
    marginBottom: 4,
  },
})
