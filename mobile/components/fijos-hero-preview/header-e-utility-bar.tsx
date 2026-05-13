import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { MaterialIcons } from '@expo/vector-icons'
import Svg, { Path } from 'react-native-svg'
import { formatMoney } from '@/utils/money'
import { usePressScale } from '@/hooks/use-press-scale'
import { useAppTheme } from '@/theme/theme-provider'
import { RiseRow } from './smart-alerts-helpers'
import type { HeroState } from './hero-states'

interface HeaderEProps {
  state: HeroState
}

/**
 * Variant E · Compact + utility bar. Title 24pt (más chico que A/D
 * que usan 34pt) deja espacio a un row de utility icons a la derecha:
 * search · filter · add · more. Cada icon es un tap-target 36pt con
 * spacing 4pt entre ellos. Total footprint vertical mínimo.
 *
 * Útil cuando el usuario tiene muchas acciones contextuales o cuando
 * compartimos el header con otras nav (e.g. ediciones tab).
 */
export function HeaderUtilityBar({ state }: HeaderEProps) {
  const { theme } = useAppTheme()

  return (
    <View>
      <RiseRow delay={0}>
        <View style={styles.row}>
          <View style={styles.titleBlock}>
            <Text style={[styles.title, { color: theme.colors.text }]}>Fijos</Text>
            <Text
              style={[styles.subtitle, { color: theme.colors.textMuted }]}
              numberOfLines={1}
            >
              {resolveSub(state)}
            </Text>
          </View>

          <View style={styles.iconBar}>
            <UtilityIcon
              icon="search"
              label="Buscar fijo"
              color={theme.colors.text}
            />
            <UtilityIcon
              icon="tune"
              label="Filtros"
              color={theme.colors.text}
            />
            <UtilityIcon
              icon="add"
              label="Agregar fijo"
              color={theme.colors.text}
              primary
            />
          </View>
        </View>
      </RiseRow>
    </View>
  )
}

function UtilityIcon({
  icon,
  label,
  color,
  primary,
}: {
  icon: 'search' | 'tune' | 'add'
  label: string
  color: string
  primary?: boolean
}) {
  const { theme } = useAppTheme()
  const press = usePressScale({ pressedScale: 0.92 })
  return (
    <Pressable
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
    >
      <Animated.View
        style={[
          styles.iconBtn,
          primary
            ? {
                backgroundColor: theme.colors.text,
              }
            : {
                backgroundColor: 'transparent',
              },
          press.animatedStyle,
        ]}
      >
        {icon === 'add' ? (
          <PlusIcon color={primary ? theme.colors.creamCard : color} />
        ) : (
          <MaterialIcons name={icon} size={20} color={color} />
        )}
      </Animated.View>
    </Pressable>
  )
}

function resolveSub(state: HeroState): string {
  if (state.isEmpty) return 'Cargá tu primer fijo'
  if (state.cantidadVencidos > 0)
    return `${state.cantidadFijos} ítems · ${state.cantidadVencidos} vencidos`
  if (state.isAllPaid) return `${state.cantidadFijos} ítems · al día`
  return `${state.cantidadFijos} ítems · ${formatMoney(state.totalFijos)}`
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
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleBlock: { flex: 1 },
  title: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.8,
    lineHeight: 28,
  },
  subtitle: {
    fontSize: 12,
    marginTop: 3,
    fontWeight: '600',
  },
  iconBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
