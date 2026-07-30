import { useEffect, type ReactNode } from 'react'
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import Animated, {
  Easing,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  useReducedMotion,
  interpolateColor,
} from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'
import { formatAnimatedAmount } from '@/components/ui/animated-amount-format'
import { triggerHaptic } from '@/lib/haptics'
import { motionDurations, motionSprings } from '@/lib/motion'
import { radii } from '@/theme/palette'
import { typography } from '@/theme/typography'
import { useFijosSkin } from '@/components/fijos/fijos-skin'
import { useAppTheme } from '@/theme/theme-provider'

interface AmountCardProps {
  amount: number
  isActive: boolean
  onPress: () => void
  /** Eyebrow text rendered inside the card. Defaults to "Monto". Use
   *  to repurpose the card for income / goal amount onboarding steps
   *  while keeping the focus animation + visual format consistent. */
  label?: string
  /** "default" keeps the add-expense hero presentation (54px font,
   *  generous padding). "compact" trims to a wizard-friendly size where
   *  the AmountCard shares a screen with five other inputs. */
  size?: 'default' | 'compact'
  /** Mirrors the same prop on `TextField`. When true, the active
   *  border color resolves to `theme.colors.warning` instead of
   *  `primary` so the card reads as "amount required and currently
   *  empty" without painting the whole import-review card red. */
  warning?: boolean
}

export function AmountCard({
  amount,
  isActive,
  onPress,
  label,
  size = 'default',
  warning = false,
}: AmountCardProps) {
  const { theme } = useAppTheme()
  // COMPARTIDO con add-gasto y add-ingreso: el skin solo resuelve a `neo`
  // dentro del wizard de fijos, que es el único que monta el provider. Las
  // otras dos pantallas siguen recibiendo `classic` y no cambian.
  const skin = useFijosSkin()
  const neo = skin.kind === 'neo' ? skin : null
  const { t } = useTranslation()
  const reduceMotion = useReducedMotion()
  const resolvedLabel = label ?? t('home:amountCard.label')
  const scale = useSharedValue(1)
  const activeProgress = useSharedValue(isActive ? 1 : 0)
  const warningProgress = useSharedValue(warning ? 1 : 0)

  useEffect(() => {
    const target = isActive ? 1 : 0
    activeProgress.value = reduceMotion
      ? target
      : withTiming(target, { duration: motionDurations.standard })
  }, [isActive, reduceMotion, activeProgress])

  // Soft glide into/out of warning — iOS-cubic ease at standard duration
  // so the tint slides in instead of snapping. Same curve the focus
  // animation uses for visual continuity.
  useEffect(() => {
    warningProgress.value = reduceMotion
      ? (warning ? 1 : 0)
      : withTiming(warning ? 1 : 0, {
          duration: motionDurations.standard,
          easing: Easing.bezier(0.32, 0.72, 0, 1),
        })
  }, [warning, reduceMotion, warningProgress])

  const scaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: reduceMotion ? 1 : scale.value }],
  }))

  // `borderWidth` ONLY follows focus (1 → 2 active). Warning never
  // resizes the card — the user pushed back on layout shifts during
  // the validation state. The border color blends via nested
  // `interpolateColor`: focus picks between line/primary in normal
  // mode, focus picks between warning/warning in warning mode, then
  // `warningProgress` lerps between the two results.
  const borderStyle = useAnimatedStyle(() => {
    'worklet'
    const normalColor = interpolateColor(
      activeProgress.value,
      [0, 1],
      [theme.colors.border, theme.colors.primary],
    )
    const warnColor = interpolateColor(
      activeProgress.value,
      [0, 1],
      [theme.colors.warning, theme.colors.warning],
    )
    return {
      borderColor: interpolateColor(
        warningProgress.value,
        [0, 1],
        [normalColor, warnColor],
      ),
      borderWidth: 1 + activeProgress.value,
    }
  })

  const hintStyle = useAnimatedStyle(() => ({
    opacity: 1 - activeProgress.value,
  }))

  const displayText = formatAnimatedAmount(amount)

  // El handoff saca el label AFUERA del pozo, con el mismo tratamiento que
  // NOMBRE / CATEGORÍA / FRECUENCIA y el pozo 8px abajo. Adentro queda UNA
  // sola fila: la cifra y el hint alineados por baseline. Dejarlo adentro
  // rompía la simetría con los otros tres campos del paso.
  const neoEyebrow = neo ? (
    // `typography.eyebrow` primero: de ahí sale el `textTransform` que pone
    // el label en mayúsculas, igual que los de `Field`.
    <Text
      style={[
        typography.eyebrow,
        { ...neo.add.sectionLabel, color: neo.mutedInk },
        styles.neoEyebrow,
      ]}
    >
      {resolvedLabel}
    </Text>
  ) : null

  return (
    <Animated.View style={scaleStyle}>
      {neoEyebrow}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('home:amountCard.amountAccessibility', {
          amount: displayText,
        })}
        accessibilityHint={t('home:amountCard.editHint')}
        onPress={() => {
          void triggerHaptic('light')
          onPress()
        }}
        onPressIn={() => {
          if (reduceMotion) return
           
          scale.value = withSpring(0.98, motionSprings.press)
        }}
        onPressOut={() => {
           
          scale.value = withSpring(1, motionSprings.press)
        }}
        style={({ pressed }) => [
          styles.cardPressable,
          {
            opacity: pressed ? 0.96 : 1,
          },
        ]}
      >
        <Animated.View
          style={[
            size === 'compact' ? styles.cardCompact : styles.card,
            neo ? null : borderStyle,
            { backgroundColor: theme.colors.surface },
            // Handoff: POZO, no card elevada.
            neo
              ? {
                  backgroundColor: neo.add.well.background,
                  borderRadius: neo.add.well.radius,
                  borderWidth: 0,
                  boxShadow: neo.add.well.shadow,
                  paddingHorizontal: 17,
                  paddingVertical: 12,
                  gap: 0,
                }
              : null,
          ]}
        >
          {neo ? null : (
            <View style={styles.topRow}>
              <Text style={[typography.eyebrow, { color: theme.colors.textMuted }]}>
                {resolvedLabel}
              </Text>
              <Animated.Text
                pointerEvents="none"
                style={[typography.caption, hintStyle, { color: theme.colors.textSoft }]}
              >
                {t('home:amountCard.tapToEdit')}
              </Animated.Text>
            </View>
          )}
          {/* El wrapper de fila existe SOLO en neo. En classic el `<Text>`
              vuelve a ser hijo directo de la card, sin View de por medio:
              este componente también lo montan add-gasto y add-ingreso. */}
          <MaybeRow enabled={neo != null} style={styles.neoValueRow}>
            <Text
              style={[
                size === 'compact' ? typography.metricLarge : typography.hero,
                size === 'compact' ? styles.valueCompact : styles.value,
                { color: theme.colors.text },
                // 32px, no los 54 de `typography.hero`: con la hero el pozo
                // quedaba casi al doble de alto que el del nombre y el paso
                // dejaba de entrar sin scroll.
                neo
                  ? {
                      fontSize: 32,
                      fontWeight: '900',
                      fontFamily: neo.font('900'),
                      letterSpacing: -0.64,
                      color: neo.ink.title,
                      flexShrink: 1,
                    }
                  : null,
              ]}
              numberOfLines={1}
              adjustsFontSizeToFit
              allowFontScaling
              maxFontSizeMultiplier={1.2}
            >
              {displayText}
            </Text>
            {neo ? (
              <Animated.Text
                pointerEvents="none"
                style={[
                  hintStyle,
                  // `textSoft` en oscuro es #77E755 — verde flúor.
                  {
                    color: neo.faintInk,
                    fontSize: 11,
                    fontWeight: '800',
                    fontFamily: neo.font('800'),
                  },
                ]}
              >
                {t('home:amountCard.tapToEdit')}
              </Animated.Text>
            ) : null}
          </MaybeRow>
        </Animated.View>
      </Pressable>
    </Animated.View>
  )
}

/** Envuelve en una fila sólo si `enabled`; si no, deja a los hijos donde
 *  estaban. Existe para que la rama `classic` de `AmountCard` conserve su
 *  árbol EXACTO — este componente lo comparten add-gasto y add-ingreso, y un
 *  `<View>` de más ahí es un cambio silencioso en producción. */
function MaybeRow({
  enabled,
  style,
  children,
}: {
  enabled: boolean
  style: StyleProp<ViewStyle>
  children: ReactNode
}) {
  if (!enabled) return <>{children}</>
  return <View style={style}>{children}</View>
}

const styles = StyleSheet.create({
  cardPressable: {
    borderRadius: radii['2xl'],
  },
  card: {
    borderRadius: radii['2xl'],
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 4,
  },
  cardCompact: {
    borderRadius: radii.xl,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 2,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  neoEyebrow: { marginBottom: 8 },
  // Alineados por BASELINE, no por centro: la cifra es 32px y el hint 11, y
  // centrarlos deja el hint flotando a media altura del número.
  neoValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 10,
  },
  value: {
    letterSpacing: -2,
  },
  valueCompact: {
    letterSpacing: -0.8,
  },
})
