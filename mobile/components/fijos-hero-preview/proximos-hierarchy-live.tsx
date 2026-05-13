import { useEffect } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'
import { MaterialIcons } from '@expo/vector-icons'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { formatMoney } from '@/utils/money'
import { motionEasings } from '@/lib/motion/tokens'
import { usePressScale } from '@/hooks/use-press-scale'
import { useAppTheme } from '@/theme/theme-provider'
import { buildProximosPalette } from './proximos-colors'
import type { HeroState } from './hero-states'

const ENTER = motionEasings.enterSmooth

interface ProximosHierarchyLiveProps {
  state: HeroState
}

/**
 * Variant D · Hierarchy. Editorial asimétrico — el ítem MÁS próximo
 * (o vencido más viejo) recibe todo el peso: label big + name 26pt +
 * amount big. Los otros 2 se muestran abajo como rows compactos con
 * "luego:" lead-in.
 *
 * Matches "siempre vamos a entrar a ver qué pagamos próximo" — el ojo
 * aterriza primero en lo más urgente, el resto es referencia.
 *
 * Animations:
 *   eyebrow + rule cascade (0/80ms)
 *   hero row entrance (240ms) con rise 14pt
 *   "luego:" label entrance (440ms)
 *   2 secondary rows entrance (520/600ms)
 *
 * Theme-aware con paleta urgency/success que ajusta en dark mode.
 */
export function ProximosHierarchyLive({ state }: ProximosHierarchyLiveProps) {
  const { theme } = useAppTheme()
  const palette = buildProximosPalette(theme)

  if (state.isEmpty) {
    return (
      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.colors.creamCard,
            borderColor: theme.colors.line,
          },
        ]}
      >
        <RiseRow delay={0}>
          <Text style={[styles.eyebrow, { color: theme.colors.textMuted }]}>
            PRÓXIMO
          </Text>
        </RiseRow>
        <RuleScale color={theme.colors.text} delay={80} />
        <RiseRow delay={160}>
          <Text style={[styles.emptyLine1, { color: theme.colors.text }]}>
            Cargá tus fijos.
          </Text>
          <Text style={[styles.emptyLine2, { color: theme.colors.textMuted }]}>
            Esta sección te avisa qué se viene primero y deja como
            referencia los próximos dos.
          </Text>
        </RiseRow>
      </View>
    )
  }

  if (state.isAllPaid) {
    return (
      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.colors.creamCard,
            borderColor: theme.colors.line,
          },
        ]}
      >
        <RiseRow delay={0}>
          <Text style={[styles.eyebrow, { color: theme.colors.textMuted }]}>
            PRÓXIMO
          </Text>
        </RiseRow>
        <RuleScale color={theme.colors.text} delay={80} />
        <RiseRow delay={160}>
          <View style={styles.allPaidRow}>
            <MaterialIcons name="check-circle" size={22} color={palette.success} />
            <Text style={[styles.allPaidText, { color: theme.colors.text }]}>
              Ningún fijo pendiente.
            </Text>
          </View>
          <Text style={[styles.allPaidSub, { color: theme.colors.textMuted }]}>
            {state.daysRemaining <= 2
              ? `El ciclo cierra en ${state.daysRemaining === 0 ? 'horas' : `${state.daysRemaining} ${state.daysRemaining === 1 ? 'día' : 'días'}`}.`
              : `Te quedan ${state.daysRemaining} días tranquilos hasta el cobro.`}
          </Text>
        </RiseRow>
      </View>
    )
  }

  const items = state.upcoming.slice(0, 3)
  const hero = items[0]
  const rest = items.slice(1)

  if (!hero) return null

  // Hero treatment depends on urgency
  const heroLabelColor = hero.isOverdue
    ? palette.urgencyStrong
    : hero.days <= 2
    ? palette.urgency
    : theme.colors.textMuted

  const heroAmountColor = hero.isOverdue || hero.days <= 2
    ? palette.urgency
    : theme.colors.text

  const heroLabel = hero.isOverdue
    ? `VENCIÓ HACE ${Math.abs(hero.days)} ${Math.abs(hero.days) === 1 ? 'DÍA' : 'DÍAS'}`
    : hero.days === 0
    ? 'HOY'
    : hero.days === 1
    ? 'MAÑANA'
    : `EN ${hero.days} DÍAS`

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.creamCard,
          borderColor: theme.colors.line,
        },
      ]}
    >
      <RiseRow delay={0}>
        <View style={styles.headerRow}>
          <Text style={[styles.eyebrow, { color: theme.colors.textMuted }]}>
            PRÓXIMO
          </Text>
          <Text style={[styles.headerCount, { color: theme.colors.textMuted }]}>
            {state.cantidadPorPagarTotal} {state.cantidadPorPagarTotal === 1 ? 'ítem' : 'ítems'} este ciclo
          </Text>
        </View>
      </RiseRow>

      <RuleScale color={theme.colors.text} delay={80} />

      {/* Hero row — full editorial weight */}
      <RiseRow delay={240}>
        <View style={styles.heroBlock}>
          <Text style={[styles.heroLabel, { color: heroLabelColor }]}>
            {heroLabel}
          </Text>
          <View style={styles.heroNameRow}>
            <View
              style={[
                styles.heroCatDot,
                { backgroundColor: hero.categoryColor },
              ]}
            />
            <Text
              style={[styles.heroName, { color: theme.colors.text }]}
              numberOfLines={1}
            >
              {hero.name}
            </Text>
            {hero.hikeDeltaPct ? (
              <View
                style={[
                  styles.heroHikeBadge,
                  {
                    borderColor: palette.urgencyBadgeBorder,
                    backgroundColor: palette.urgencyBadgeBg,
                  },
                ]}
              >
                <MaterialIcons
                  name="trending-up"
                  size={11}
                  color={palette.urgency}
                />
                <Text style={[styles.heroHikeText, { color: palette.urgency }]}>
                  +{hero.hikeDeltaPct}%
                </Text>
              </View>
            ) : null}
          </View>
          <Text style={[styles.heroAmount, { color: heroAmountColor }]}>
            {formatMoney(hero.amount)}
          </Text>
        </View>
      </RiseRow>

      {rest.length > 0 ? (
        <>
          <RiseRow delay={440}>
            <View style={styles.luegoRow}>
              <Text style={[styles.luegoLabel, { color: theme.colors.textMuted }]}>
                LUEGO
              </Text>
              <View
                style={[styles.luegoLine, { backgroundColor: theme.colors.line }]}
              />
            </View>
          </RiseRow>

          <View style={styles.restList}>
            {rest.map((item, idx) => (
              <CompactRow
                key={item.id}
                item={item}
                delay={520 + idx * 80}
                palette={palette}
                textColor={theme.colors.text}
                textMuted={theme.colors.textMuted}
              />
            ))}
          </View>
        </>
      ) : null}
    </View>
  )
}

function CompactRow({
  item,
  delay,
  palette,
  textColor,
  textMuted,
}: {
  item: HeroState['upcoming'][number]
  delay: number
  palette: ReturnType<typeof buildProximosPalette>
  textColor: string
  textMuted: string
}) {
  const press = usePressScale({ pressedScale: 0.98 })
  const labelText = item.isOverdue
    ? `VENCIÓ ${Math.abs(item.days)}D`
    : item.days === 0
    ? 'HOY'
    : item.days === 1
    ? 'MAÑANA'
    : `EN ${item.days}D`
  const labelColor = item.isOverdue
    ? palette.urgencyStrong
    : item.days <= 2
    ? palette.urgency
    : textMuted

  return (
    <RiseRow delay={delay}>
      <Pressable
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        accessibilityRole="button"
        accessibilityLabel={`${item.name}, ${labelText}, ${formatMoney(item.amount)}`}
      >
        <Animated.View style={[styles.compactRow, press.animatedStyle]}>
          <View
            style={[
              styles.compactCatDot,
              { backgroundColor: item.categoryColor },
            ]}
          />
          <Text style={[styles.compactName, { color: textColor }]} numberOfLines={1}>
            {item.name}
          </Text>
          {item.hikeDeltaPct ? (
            <View
              style={[
                styles.compactHike,
                {
                  borderColor: palette.urgencyBadgeBorder,
                  backgroundColor: palette.urgencyBadgeBg,
                },
              ]}
            >
              <Text style={[styles.compactHikeText, { color: palette.urgency }]}>
                ↑{item.hikeDeltaPct}%
              </Text>
            </View>
          ) : null}
          <Text style={[styles.compactLabel, { color: labelColor }]}>
            {labelText}
          </Text>
          <Text style={[styles.compactAmount, { color: textColor }]}>
            {formatMoney(item.amount)}
          </Text>
        </Animated.View>
      </Pressable>
    </RiseRow>
  )
}

function RiseRow({ delay, children }: { delay: number; children: React.ReactNode }) {
  const reduced = useReducedMotion()
  const y = useSharedValue(reduced ? 0 : 12)
  const opacity = useSharedValue(reduced ? 1 : 0)
  useEffect(() => {
    if (reduced) return
    y.value = withDelay(delay, withTiming(0, { duration: 460, easing: ENTER }))
    opacity.value = withDelay(delay, withTiming(1, { duration: 460, easing: ENTER }))
    return () => {
      cancelAnimation(y)
      cancelAnimation(opacity)
    }
  }, [delay, reduced, y, opacity])
  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: y.value }],
  }))
  return <Animated.View style={style}>{children}</Animated.View>
}

function RuleScale({ color, delay }: { color: string; delay: number }) {
  const reduced = useReducedMotion()
  const scale = useSharedValue(reduced ? 1 : 0)
  const opacity = useSharedValue(reduced ? 1 : 0)
  useEffect(() => {
    if (reduced) return
    scale.value = withDelay(delay, withTiming(1, { duration: 540, easing: ENTER }))
    opacity.value = withDelay(delay, withTiming(1, { duration: 320, easing: ENTER }))
    return () => {
      cancelAnimation(scale)
      cancelAnimation(opacity)
    }
  }, [delay, reduced, scale, opacity])
  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scaleX: scale.value }],
  }))
  return (
    <Animated.View
      style={[
        styles.rule,
        { backgroundColor: color, transformOrigin: 'left' },
        animStyle,
      ]}
    />
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 18,
    borderWidth: 1,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.8,
  },
  headerCount: {
    fontSize: 11,
    fontWeight: '600',
  },
  rule: {
    width: 28,
    height: 2,
    marginTop: 10,
    marginBottom: 16,
    opacity: 0.55,
  },
  heroBlock: {
    marginBottom: 18,
  },
  heroLabel: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.6,
    marginBottom: 6,
  },
  heroNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
    flexWrap: 'wrap',
  },
  heroCatDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  heroName: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.6,
    lineHeight: 28,
    flexShrink: 1,
  },
  heroHikeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
  },
  heroHikeText: {
    fontSize: 10,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  heroAmount: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
    lineHeight: 26,
    fontVariant: ['tabular-nums'],
  },
  luegoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  luegoLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  luegoLine: {
    flex: 1,
    height: 1,
    opacity: 0.6,
  },
  restList: {
    gap: 4,
  },
  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  compactCatDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  compactName: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  compactHike: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 999,
    borderWidth: 1,
  },
  compactHikeText: {
    fontSize: 9,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  compactLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  compactAmount: {
    fontSize: 13,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.2,
  },
  emptyLine1: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
    marginBottom: 6,
  },
  emptyLine2: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  allPaidRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  allPaidText: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
    flex: 1,
  },
  allPaidSub: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
    marginLeft: 34,
  },
})
