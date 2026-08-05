import { useEffect, useRef, useState } from 'react'
import {
  Dimensions,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import Animated, {
  Easing,
  Extrapolation,
  FadeInDown,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { MaterialIcons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { SUPPORTS_INSET_SHADOW } from '@/components/wizard/inset-shadow-support'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { triggerHaptic } from '@/lib/haptics'
import {
  motionDurations,
  motionEasings,
  motionSprings,
} from '@/lib/motion/tokens'
import { withAlpha } from '@/theme/color-utils'
import {
  cssGradient,
  neoCategoryPastels,
  neoRadii,
  neoTokens,
  pastelDark,
  type NeoTokens,
} from '@/theme/neo-tokens'
import { useThemeTokens } from '@/theme/theme-provider'
import { nunitoFamily } from '@/theme/typography'
import { AddQuickActionIcon, type ActionKey } from './add-quick-action-icon'
import { useModalVisibilityBeacon } from '@/lib/modal-visibility'

export interface QuickAction {
  key: ActionKey
  label: string
  icon: keyof typeof MaterialIcons.glyphMap
  onPress: () => void
  /** Optional visual override. 'marked' tints the tile in a paler
   *  green to communicate "ya está hecho hoy" without removing it
   *  from the menu (so the user can toggle it off). */
  visualState?: 'default' | 'marked'
  /**
   * @deprecated Sin efecto desde la migración al material neumórfico.
   * El rediseño (`screens/3c.html` L44-62) le da a cada fila un TILE
   * PASTEL de categoría, no un ícono teñido con un accent propio: la
   * identidad la lleva el pastel (`ACTION_PASTEL` acá abajo) y el glifo
   * va siempre en la tinta principal del tema. Se mantiene en el tipo
   * para no romper a los callers; se ignora al pintar.
   */
  accentColor?: string
  /** `'primary'` renders as the full-width top tile with brand fill;
   *  `'secondary'` (default) renders in the vertical list below. */
  tier?: 'primary' | 'secondary'
  /** Optional one-line context shown under the primary label (e.g.
   *  "lo más cargado"). Ignored on secondary rows. */
  subtitle?: string
}

interface AddQuickActionsOverlayProps {
  visible: boolean
  onDismiss: () => void
  actions: QuickAction[]
}

const EASE_IOS = Easing.bezier(0.32, 0.72, 0, 1)
const CARD_BOTTOM_OFFSET = 122
const CARD_HORIZONTAL_MARGIN = 16
const PRIMARY_TILE_HEIGHT = 84
const SECONDARY_ROW_HEIGHT = 60
const SECONDARY_TILE_SIZE = 42

/**
 * El handoff dibuja el scrim como un sólido (`#B9BEAC` claro / `#0A130D`
 * oscuro) porque en la maqueta el fondo ya viene lavado detrás de la
 * hoja. En el dispositivo hay una pantalla real atrás, así que a
 * opacidad plena la borraría: se aplica el MISMO tono con alfa. Mismo
 * valor que `ModalCard` con `skin="neo"`, para que las dos superficies
 * de hoja de la app laven el fondo igual.
 */
const NEO_SCRIM_ALPHA = 0.84

/**
 * Pastel de categoría por acción — transcripción literal de los tiles de
 * `screens/3c.html` L44-62: 📸 sobre `#E6E0F4` (ocio), 🌿 sobre `#DDEBDD`
 * (hogar), 📈 sobre `#D6E4F0` (cuotas), 🗓️ sobre `#EDE6D4` (ropa). En
 * oscuro el mismo pastel va translúcido al 14% (`pastelDark`), como en
 * L102-118 del mismo archivo.
 */
const ACTION_PASTEL: Record<ActionKey, string> = {
  expense: neoCategoryPastels.mercado,
  import: neoCategoryPastels.ocio,
  'no-spend': neoCategoryPastels.hogar,
  income: neoCategoryPastels.cuotas,
  fixed: neoCategoryPastels.ropa,
}

/**
 * Hierarchical FAB action menu. Replaces the legacy 5-petal radial
 * fan + (briefly) a 2×2 card grid, both of which read as "identical
 * card grid" once we had five actions. New composition:
 *
 *   [eyebrow]
 *   [PRIMARY full-width tile — CTA radial verde, pulsing icon]
 *   [vertical list of secondary rows — tile pastel + chevron]
 *
 * Material: pantalla 3c del handoff neumórfico
 * (`design/rediseno-2026-07/screens/3c.html` L31-62 claro / L87-118
 * oscuro). La GEOMETRÍA flotante anclada al FAB (card centrada a
 * `CARD_BOTTOM_OFFSET` del borde, no pegada abajo) es una decisión de
 * producto aprobada por el owner y NO sale del handoff: acá sólo se
 * transcribe el material dentro de esa geometría.
 *
 * Each row carries a signature entrance animation via `AddQuickActionIcon`
 * so individual actions announce themselves (the "+" rotates in, the
 * scanner pass sweeps, the trending-up arrow climbs, the leaf wiggles,
 * the loop rotates). Combined with the tile-level FadeInDown stagger,
 * opening the overlay becomes a tiny choreography moment instead of a
 * generic "five buttons appear".
 *
 * Card bloom enters anchored to the FAB (spring scale 0.85→1,
 * translateY 40→0, opacity 0→1) so it reads as the FAB unfurling.
 * Exit uses timing (not a spring) to keep the Modal's touch-capture
 * window short — the rest threshold on a critically-damped spring
 * left the Modal grabbing taps long after the card was visually gone.
 */
export function AddQuickActionsOverlay({
  visible,
  onDismiss,
  actions,
}: AddQuickActionsOverlayProps) {
  const theme = useThemeTokens()
  const neo = neoTokens(theme.mode)
  const isDark = theme.mode === 'dark'
  const { t } = useTranslation()
  const reduced = useReducedMotion()
  const progress = useSharedValue(0)
  const [mounted, setMounted] = useState(false)
  // Avisa al resto de la app que hay una ventana nativa arriba (el
  // ToastHost la necesita para no quedar tapado). Ver `modal-visibility`.
  useModalVisibilityBeacon(mounted)
  const skipNextExitRef = useRef(false)

  const primary = actions.find((a) => a.tier === 'primary') ?? null
  const secondaries = actions.filter((a) => a.tier !== 'primary')

  useEffect(() => {
    if (reduced) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional sync of mount state when visible toggles
      setMounted(visible)
      progress.value = visible ? 1 : 0
      return
    }
    if (visible) {
      setMounted(true)
      progress.value = withSpring(1, motionSprings.radialEnter)
    } else if (skipNextExitRef.current) {
      skipNextExitRef.current = false
      progress.value = 0
      setMounted(false)
    } else {
      progress.value = withTiming(
        0,
        {
          duration: motionDurations.exitTab,
          easing: motionEasings.exitStandard,
        },
        (finished) => {
          if (finished) {
            runOnJS(setMounted)(false)
          }
        },
      )
    }
  }, [visible, progress, reduced])

  const scrimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0, 1], Extrapolation.CLAMP),
  }))

  const cardStyle = useAnimatedStyle(() => {
    const t = progress.value
    return {
      opacity: interpolate(t, [0, 0.4, 1], [0, 0.9, 1], Extrapolation.CLAMP),
      transform: [
        { translateY: interpolate(t, [0, 1], [40, 0], Extrapolation.CLAMP) },
        { scale: interpolate(t, [0, 1], [0.85, 1], Extrapolation.CLAMP) },
      ],
    }
  })

  const handleTileSelect = (action: QuickAction) => {
    void triggerHaptic('selection')
    skipNextExitRef.current = true
    onDismiss()
    action.onPress()
  }

  // Choreography timing: primary tile enters at 80ms, then each
  // secondary at +70ms. The ActionIcon's signature animation runs
  // with the SAME delay (offset from mount) so the icon's identity
  // play lands just as the row's tile fade-in completes.
  const PRIMARY_DELAY = 80
  const SECONDARY_STAGGER = 70
  const SECONDARY_BASE_DELAY = 180

  return (
    <Modal
      transparent
      visible={mounted}
      onRequestClose={onDismiss}
      statusBarTranslucent
      animationType="none"
    >
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onDismiss}
        accessibilityLabel={t('states:quickActions.closeLabel')}
        accessibilityRole="button"
      >
        {/* Scrim SÓLIDO del rediseño. El BlurView V1
            (`systemChromeMaterialDark`) apagaba el relieve neumórfico de
            las cuatro vistas que quedan atrás: el material difuminado no
            existe en el vocabulario del handoff, que lava el fondo con
            un tono plano del tema. */}
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            scrimStyle,
            { backgroundColor: withAlpha(neo.scrim, NEO_SCRIM_ALPHA) },
          ]}
        />
      </Pressable>

      <View style={styles.cardWrap} pointerEvents="box-none">
        <Animated.View
          style={[
            styles.card,
            cardStyle,
            {
              backgroundColor: neo.sheet,
              // Hoja del handoff: sin borde, la separación del scrim la
              // da la sombra difusa (`0 -20px 50px`). El fill sólido ya
              // contrasta con el scrim, así que en Android < API 28
              // —donde el boxShadow outset se descarta en silencio— la
              // card sigue siendo visible sin fallback.
              boxShadow: neo.shadows.sheet,
            },
          ]}
        >
          <Text style={[styles.eyebrow, { color: neo.textMuted }]}>
            {t('states:quickActions.eyebrow')}
          </Text>

          {primary ? (
            <Animated.View
              entering={
                reduced
                  ? undefined
                  : FadeInDown.duration(motionDurations.standard)
                      .delay(PRIMARY_DELAY)
                      .easing(EASE_IOS)
              }
            >
              <PrimaryTile
                action={primary}
                active={mounted}
                signatureDelay={PRIMARY_DELAY + 60}
                onSelect={handleTileSelect}
                neo={neo}
                isDark={isDark}
              />
            </Animated.View>
          ) : null}

          {secondaries.length > 0 ? (
            <View>
              {secondaries.map((action, idx) => {
                const rowDelay = SECONDARY_BASE_DELAY + idx * SECONDARY_STAGGER
                return (
                  <Animated.View
                    key={action.key}
                    entering={
                      reduced
                        ? undefined
                        : FadeInDown.duration(motionDurations.standard)
                            .delay(rowDelay)
                            .easing(EASE_IOS)
                    }
                  >
                    <SecondaryRow
                      action={action}
                      active={mounted}
                      signatureDelay={rowDelay + 40}
                      isFirst={idx === 0}
                      onSelect={handleTileSelect}
                      neo={neo}
                      isDark={isDark}
                    />
                  </Animated.View>
                )
              })}
            </View>
          ) : null}
        </Animated.View>
      </View>
    </Modal>
  )
}

// ─── Tiles ──────────────────────────────────────────────────────

interface PrimaryTileProps {
  action: QuickAction
  active: boolean
  signatureDelay: number
  onSelect: (a: QuickAction) => void
  neo: NeoTokens
  isDark: boolean
}

function PrimaryTile({
  action,
  active,
  signatureDelay,
  onSelect,
  neo,
  isDark,
}: PrimaryTileProps) {
  const pressScale = useSharedValue(1)
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value }],
  }))

  const isMarked = action.visualState === 'marked'

  // CTA del handoff (`screens/3c.html` L34 / L90): fill radial
  // `circle at 32% 28%` sobre el par `ctaGradient` del tema + la receta
  // `shadows.cta` (que en oscuro incluye el glow verde).
  //
  // El estado 'marked' ("ya está hecho hoy") NO es un CTA atenuado: en
  // el vocabulario neo es el estado SELECCIONADO — tinte verde sobre la
  // hoja + anillo. Por eso también cambia la tinta: `ctaText` (#F5F2E1)
  // sobre `selectedTint` translúcido encima de `sheet` daría ~1.1:1.
  const fill = isMarked
    ? { backgroundColor: neo.selectedTint }
    : cssGradient(
        `radial-gradient(circle at 32% 28%, ${neo.ctaGradient[0]}, ${neo.ctaGradient[1]} 85%)`,
        neo.ctaGradient[1],
      )
  const shadow = isMarked ? neo.shadows.ringSelected : neo.shadows.cta
  const fg = isMarked ? neo.text : neo.ctaText
  // Disco del ícono: 44×44 (el wrap de `AddQuickActionIcon` mide
  // `size + 16`), con el velo del handoff — blanco al 22% en claro,
  // tinta al 25% en oscuro.
  const iconBg = isMarked
    ? neo.well
    : isDark
      ? 'rgba(15,30,20,0.25)'
      : 'rgba(255,255,255,0.22)'

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        accessibilityLabel={action.label}
        accessibilityHint={action.subtitle}
        accessibilityRole="button"
        onPress={() => onSelect(action)}
        onPressIn={() => {
          pressScale.value = withTiming(0.97, {
            duration: motionDurations.micro,
            easing: EASE_IOS,
          })
        }}
        onPressOut={() => {
          pressScale.value = withTiming(1, {
            duration: motionDurations.micro,
            easing: EASE_IOS,
          })
        }}
        style={({ pressed }) => [
          styles.primaryTile,
          fill,
          {
            opacity: pressed ? 0.94 : 1,
            boxShadow: shadow,
            // El 'marked' se dibuja SOLO con relieve hundido + anillo, y
            // Android < API 29 descarta el inset en silencio: sin
            // fallback quedaría un tinte casi invisible sobre la hoja.
            borderWidth: isMarked && !SUPPORTS_INSET_SHADOW ? 1.5 : 0,
            borderColor: neo.green,
          },
        ]}
      >
        <AddQuickActionIcon
          actionKey={action.key}
          icon={action.icon}
          size={28}
          color={fg}
          bgColor={iconBg}
          delay={signatureDelay}
          active={active}
        />
        <View style={styles.primaryLabelCol}>
          <Text style={[styles.primaryLabel, { color: fg }]} numberOfLines={1}>
            {action.label}
          </Text>
          {action.subtitle ? (
            <Text
              // A 0.7 el subtítulo de 12px caía a ~4.1:1 sobre el fill
              // radial; 0.85 lo devuelve por encima de AA.
              style={[styles.primarySubtitle, { color: withAlpha(fg, 0.85) }]}
              numberOfLines={1}
            >
              {action.subtitle}
            </Text>
          ) : null}
        </View>
        <MaterialIcons name="arrow-forward" size={22} color={fg} />
      </Pressable>
    </Animated.View>
  )
}

interface SecondaryRowProps {
  action: QuickAction
  active: boolean
  signatureDelay: number
  isFirst: boolean
  onSelect: (a: QuickAction) => void
  neo: NeoTokens
  isDark: boolean
}

function SecondaryRow({
  action,
  active,
  signatureDelay,
  isFirst,
  onSelect,
  neo,
  isDark,
}: SecondaryRowProps) {
  const pressScale = useSharedValue(1)
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value }],
  }))

  const pastel = ACTION_PASTEL[action.key]
  const tileBg = isDark ? pastelDark(pastel) : pastel
  const isMarked = action.visualState === 'marked'

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        accessibilityLabel={action.label}
        accessibilityRole="button"
        onPress={() => onSelect(action)}
        onPressIn={() => {
          pressScale.value = withTiming(0.98, {
            duration: motionDurations.micro,
            easing: EASE_IOS,
          })
        }}
        onPressOut={() => {
          pressScale.value = withTiming(1, {
            duration: motionDurations.micro,
            easing: EASE_IOS,
          })
        }}
        style={({ pressed }) => [
          styles.secondaryRow,
          {
            backgroundColor: isMarked
              ? neo.selectedTint
              : pressed
                ? neo.well
                : 'transparent',
            // Único hairline del vocabulario neo: la línea de 1.5px
            // entre ítems de una MISMA lista (`screens/3c.html` L49).
            borderTopColor: neo.sheetDivider,
            borderTopWidth: isFirst ? 0 : 1.5,
          },
        ]}
      >
        {/* Tile pastel 42×42 radio 14 del handoff. El ícono va sin su
            disco propio (`bgColor` transparente) para que el pastel sea
            la única superficie: el wrap circular de `AddQuickActionIcon`
            (36px) queda centrado dentro del cuadrado. */}
        <View
          style={[
            styles.secondaryTile,
            { backgroundColor: tileBg },
          ]}
        >
          <AddQuickActionIcon
            actionKey={action.key}
            icon={action.icon}
            size={20}
            color={neo.text}
            bgColor="transparent"
            delay={signatureDelay}
            active={active}
          />
        </View>
        <Text
          style={[styles.secondaryLabel, { color: neo.text }]}
          numberOfLines={1}
        >
          {action.label}
        </Text>
        <MaterialIcons
          name="chevron-right"
          size={20}
          color={neo.textTertiary}
        />
      </Pressable>
    </Animated.View>
  )
}

// ─── Styles ─────────────────────────────────────────────────────

const SCREEN_WIDTH = Dimensions.get('window').width

const styles = StyleSheet.create({
  cardWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: CARD_BOTTOM_OFFSET,
    alignItems: 'center',
  },
  card: {
    width: Math.min(SCREEN_WIDTH - CARD_HORIZONTAL_MARGIN * 2, 480),
    borderRadius: neoRadii.cardSm,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
    gap: 12,
  },
  eyebrow: {
    // 11.5 / 800 / 0.16em del handoff (0.16em × 11.5 ≈ 1.84).
    fontSize: 11.5,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: 1.84,
    textTransform: 'uppercase',
    paddingLeft: 4,
  },
  primaryTile: {
    minHeight: PRIMARY_TILE_HEIGHT,
    borderRadius: neoRadii.cardSm,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  primaryLabelCol: {
    flex: 1,
    gap: 2,
  },
  primaryLabel: {
    fontSize: 19,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    letterSpacing: -0.4,
  },
  primarySubtitle: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    letterSpacing: 0.2,
  },
  secondaryRow: {
    minHeight: SECONDARY_ROW_HEIGHT,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  secondaryTile: {
    width: SECONDARY_TILE_SIZE,
    height: SECONDARY_TILE_SIZE,
    borderRadius: neoRadii.chip,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  secondaryLabel: {
    flex: 1,
    fontSize: 15.5,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    letterSpacing: -0.2,
  },
})
