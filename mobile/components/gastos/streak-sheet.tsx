import { useEffect, useState } from 'react'
import {
  Alert,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { MaterialIcons } from '@expo/vector-icons'
import { AnimatedFlame } from '@/components/gastos/animated-flame'
import { RiseView } from '@/components/home/animated/rise-view'
import { motionDurations, motionEasings, motionSprings } from '@/lib/motion'
import {
  deriveStreak,
  useMarkNoExpenseDay,
  useUnmarkNoExpenseDay,
  type AtRiskIntensity,
  type StreakData,
  type StreakDerived,
  type StreakStatus,
} from '@/features/streaks/use-streak'
import { triggerHaptic } from '@/lib/haptics'
import { useAppTheme } from '@/theme/theme-provider'

const { height: SCREEN_H } = Dimensions.get('window')
const DISMISS_DISTANCE = 120
const DISMISS_VELOCITY = 650

interface StreakSheetProps {
  familyId: string
  userId: string
  visible: boolean
  data: StreakData
  onClose: () => void
  onPressAddExpense: () => void
}

/**
 * Streak bottom sheet summoned by the flame icon in the Gastos header.
 * Uses GestureDetector + Reanimated springs (same pattern as
 * InAppNumpad) for a smooth swipe-to-dismiss. A single canvas
 * background runs edge-to-edge; the hero tint fades into it via a top
 * LinearGradient so there's no visible seam at the drag handle.
 */
export function StreakSheet({
  familyId,
  userId,
  visible,
  data,
  onClose,
  onPressAddExpense,
}: StreakSheetProps) {
  const { theme } = useAppTheme()
  const insets = useSafeAreaInsets()
  const derived = deriveStreak(data)
  const tone = getStatusTone(derived.status, derived.atRiskIntensity, theme.isDark)
  const markNoExpenseMutation = useMarkNoExpenseDay(familyId, userId)
  const unmarkNoExpenseMutation = useUnmarkNoExpenseDay(familyId, userId)
  const noExpenseButtonAvailable =
    derived.status === 'at_risk' &&
    (derived.atRiskIntensity === 'urgent' || derived.atRiskIntensity === 'critical')

  const translateY = useSharedValue(SCREEN_H)
  const backdropOpacity = useSharedValue(0)
  // Defer unmount until the slide-down + backdrop fade complete, so
  // closing after a successful "marked no-expense" mutation doesn't
  // snap-shut the sheet (RN <Modal> unmounts the moment its `visible`
  // prop flips to false).
  const [mounted, setMounted] = useState(visible)

  useEffect(() => {
    if (visible) {
      setMounted(true)
      translateY.value = withSpring(0, motionSprings.sheet)
      backdropOpacity.value = withTiming(1, { duration: motionDurations.standard })
      return
    }
    if (!mounted) return
    backdropOpacity.value = withTiming(0, { duration: motionDurations.standard })
    translateY.value = withTiming(
      SCREEN_H,
      {
        duration: motionDurations.deliberate,
        easing: motionEasings.accelerate,
      },
      (finished) => {
        if (finished) runOnJS(setMounted)(false)
      },
    )
  }, [visible, mounted, translateY, backdropOpacity])

  const handleMarkNoExpense = () => {
    if (markNoExpenseMutation.isPending) return
    Alert.alert(
      'Marcar día sin gastos',
      'Confirmás que hoy no tuviste gastos? La racha avanza igual y sumás un día a tu progreso. Podés revertirlo si después aparece algún gasto.',
      [
        { style: 'cancel', text: 'Cancelar' },
        {
          text: 'Sí, hoy no gasté',
          onPress: () => {
            markNoExpenseMutation.mutate(undefined, {
              onSuccess: () => {
                void triggerHaptic('success')
              },
              onError: (error: unknown) => {
                void triggerHaptic('error')
                Alert.alert(
                  'No se pudo marcar el día',
                  error instanceof Error ? error.message : 'Reintentá en un momento.',
                )
              },
            })
          },
        },
      ],
    )
  }

  const handleUnmarkNoExpense = () => {
    if (unmarkNoExpenseMutation.isPending) return
    Alert.alert(
      'Revertir día sin gastos',
      '¿Apareció un gasto y querés volver atrás la marca de hoy? La racha vuelve a depender de que registres antes de medianoche.',
      [
        { style: 'cancel', text: 'Cancelar' },
        {
          style: 'destructive',
          text: 'Revertir marca',
          onPress: () => {
            unmarkNoExpenseMutation.mutate(undefined, {
              onSuccess: () => {
                void triggerHaptic('warning')
              },
              onError: (error: unknown) => {
                void triggerHaptic('error')
                Alert.alert(
                  'No se pudo revertir',
                  error instanceof Error ? error.message : 'Reintentá en un momento.',
                )
              },
            })
          },
        },
      ],
    )
  }

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }))
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }))

  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      'worklet'
      if (event.translationY > 0) {
        translateY.value = event.translationY
        backdropOpacity.value = Math.max(
          0.2,
          1 - event.translationY / SCREEN_H,
        )
      }
    })
    .onEnd((event) => {
      'worklet'
      const shouldDismiss =
        event.translationY > DISMISS_DISTANCE || event.velocityY > DISMISS_VELOCITY
      if (shouldDismiss) {
        translateY.value = withSpring(SCREEN_H, {
          ...motionSprings.sheetDismiss,
          velocity: Math.max(event.velocityY, 800),
        })
        backdropOpacity.value = withTiming(0, { duration: motionDurations.quick })
        runOnJS(onClose)()
      } else {
        translateY.value = withSpring(0, motionSprings.sheet)
        backdropOpacity.value = withTiming(1, { duration: motionDurations.quick })
      }
    })

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose}>
      <GestureHandlerRootView style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
          <Pressable
            accessibilityLabel="Cerrar"
            accessibilityRole="button"
            onPress={onClose}
            style={[styles.backdrop, { backgroundColor: theme.colors.overlay ?? 'rgba(0,0,0,0.55)' }]}
          />
        </Animated.View>

        <Animated.View
          style={[
            styles.sheet,
            sheetStyle,
            {
              backgroundColor: theme.colors.canvas,
              paddingBottom: insets.bottom + 16,
              maxHeight: SCREEN_H * 0.9,
            },
          ]}
        >
          {/* Top wash fades the status tint into the canvas so the drag
              handle + hero share a single continuous surface. */}
          <LinearGradient
            colors={[tone.heroWash, 'transparent'] as unknown as readonly [string, string, ...string[]]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={styles.heroWash}
            pointerEvents="none"
          />

          <GestureDetector gesture={panGesture}>
            <Animated.View style={styles.handleArea}>
              <View
                style={[
                  styles.handle,
                  {
                    backgroundColor: theme.isDark
                      ? 'rgba(255,255,255,0.22)'
                      : 'rgba(15,42,30,0.18)',
                  },
                ]}
              />
            </Animated.View>
          </GestureDetector>

          <View style={styles.hero}>
            <SheetHero data={data} derived={derived} tone={tone} />
            <ShieldChip tokens={data.freezeTokens} tone={tone} />
            <LevelProgress derived={derived} tone={tone} />
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <WeekActivity weekActivity={data.weekActivity} tone={tone} />

            {derived.status === 'at_risk' && data.freezeTokens > 0 ? (
              <ShieldNotice
                tokens={data.freezeTokens}
                intensity={derived.atRiskIntensity}
              />
            ) : null}

            {derived.status === 'at_risk' && data.freezeTokens === 0 ? (
              <ConsequenceCard data={data} derived={derived} />
            ) : null}

            {derived.status === 'broken' ? <RecoveryCard derived={derived} /> : null}

            {derived.status === 'at_risk' || derived.status === 'broken' ? (
              <View style={styles.ctaStack}>
                <Pressable
                  style={[styles.cta, { backgroundColor: theme.colors.text }]}
                  onPress={() => {
                    void triggerHaptic('success')
                    onClose()
                    onPressAddExpense()
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={
                    derived.status === 'broken'
                      ? 'Empezar la racha hoy'
                      : 'Registrar un gasto ahora'
                  }
                >
                  <Text style={[styles.ctaText, { color: theme.colors.creamCard }]}>
                    {derived.status === 'broken'
                      ? 'Empezar la racha hoy'
                      : 'Registrar un gasto ahora'}
                  </Text>
                </Pressable>

                {noExpenseButtonAvailable ? (
                  <Pressable
                    style={[
                      styles.secondaryCta,
                      {
                        borderColor: tone.cardBorder,
                        backgroundColor: tone.cardBg,
                        opacity: markNoExpenseMutation.isPending ? 0.5 : 1,
                      },
                    ]}
                    onPress={handleMarkNoExpense}
                    disabled={markNoExpenseMutation.isPending}
                    accessibilityRole="button"
                    accessibilityLabel="Marcar el día como sin gastos"
                  >
                    <MaterialIcons
                      name="event-available"
                      size={16}
                      color={tone.fg}
                      style={styles.secondaryCtaIcon}
                    />
                    <Text style={[styles.secondaryCtaText, { color: tone.fg }]}>
                      {markNoExpenseMutation.isPending
                        ? 'Guardando…'
                        : 'Hoy no tuve gastos'}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            {derived.status === 'active' && data.hasMarkedNoExpenseToday ? (
              <Pressable
                style={[
                  styles.secondaryCta,
                  {
                    borderColor: tone.cardBorder,
                    backgroundColor: tone.cardBg,
                    opacity: unmarkNoExpenseMutation.isPending ? 0.5 : 1,
                  },
                ]}
                onPress={handleUnmarkNoExpense}
                disabled={unmarkNoExpenseMutation.isPending}
                accessibilityRole="button"
                accessibilityLabel="Revertir marca de día sin gastos"
              >
                <MaterialIcons
                  name="undo"
                  size={16}
                  color={tone.fg}
                  style={styles.secondaryCtaIcon}
                />
                <Text style={[styles.secondaryCtaText, { color: tone.fg }]}>
                  {unmarkNoExpenseMutation.isPending
                    ? 'Revirtiendo…'
                    : 'Revertir "hoy sin gastos"'}
                </Text>
              </Pressable>
            ) : null}

            {derived.status === 'active' ? (
              <MotivationalCard data={data} derived={derived} />
            ) : null}

            <PersonalStats data={data} />
            <FreezeInfo tokens={data.freezeTokens} />
          </ScrollView>
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────────
// Status tone helper — generates theme-aware palette with a gentle
// top wash so the hero reads distinct without a hard background block.
// ─────────────────────────────────────────────────────────────
interface StatusTone {
  fg: string
  soft: string
  /** Top-of-sheet gradient color that fades into the canvas. */
  heroWash: string
  cardBg: string
  cardBorder: string
}

function getStatusTone(
  status: StreakStatus,
  intensity: AtRiskIntensity | null,
  isDark: boolean,
): StatusTone {
  switch (status) {
    case 'active':
      return {
        fg: isDark ? '#A6EF8F' : '#297811',
        soft: isDark ? 'rgba(166,239,143,0.72)' : 'rgba(41,120,17,0.72)',
        heroWash: isDark ? 'rgba(73,214,31,0.22)' : 'rgba(73,214,31,0.18)',
        cardBg: isDark ? 'rgba(73,214,31,0.10)' : 'rgba(73,214,31,0.08)',
        cardBorder: isDark ? 'rgba(73,214,31,0.28)' : 'rgba(73,214,31,0.24)',
      }
    case 'at_risk':
      return getAtRiskTone(intensity ?? 'calm', isDark)
    case 'broken':
      return {
        fg: isDark ? '#D4E8DF' : '#3B6D57',
        soft: isDark ? 'rgba(184,201,190,0.72)' : 'rgba(107,117,102,0.72)',
        heroWash: isDark ? 'rgba(138,138,138,0.18)' : 'rgba(138,138,138,0.12)',
        cardBg: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
        cardBorder: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
      }
  }
}

/**
 * Progressive at-risk palette: green → yellow → orange → red as the
 * day advances in the user's local timezone. The progression is the
 * primary visual signal of urgency (paired with the time-aware copy
 * built in `use-streak.ts`). Each band keeps the same channel layout
 * (fg / soft / heroWash / cardBg / cardBorder) so the rest of the
 * sheet only needs to swap the four numbers — no conditional layout.
 */
function getAtRiskTone(intensity: AtRiskIntensity, isDark: boolean): StatusTone {
  switch (intensity) {
    case 'calm':
      // Green — passes WCAG AA on cream/canvas in both themes.
      return {
        fg: isDark ? '#A6EF8F' : '#297811',
        soft: isDark ? 'rgba(166,239,143,0.72)' : 'rgba(41,120,17,0.72)',
        heroWash: isDark ? 'rgba(73,214,31,0.22)' : 'rgba(73,214,31,0.18)',
        cardBg: isDark ? 'rgba(73,214,31,0.10)' : 'rgba(73,214,31,0.08)',
        cardBorder: isDark ? 'rgba(73,214,31,0.28)' : 'rgba(73,214,31,0.24)',
      }
    case 'gentle':
      // Amber/yellow — desaturated in dark mode so it doesn't glow.
      return {
        fg: isDark ? '#F3BA57' : '#9A5E04',
        soft: isDark ? 'rgba(243,186,87,0.72)' : 'rgba(154,94,4,0.72)',
        heroWash: isDark ? 'rgba(243,186,87,0.22)' : 'rgba(243,186,87,0.20)',
        cardBg: isDark ? 'rgba(243,186,87,0.12)' : 'rgba(243,186,87,0.14)',
        cardBorder: isDark ? 'rgba(243,186,87,0.32)' : 'rgba(243,186,87,0.36)',
      }
    case 'urgent':
      // Orange — original at_risk tone; afternoon/evening alert.
      return {
        fg: isDark ? '#F8D1C3' : '#B84014',
        soft: isDark ? 'rgba(248,209,195,0.72)' : 'rgba(184,64,20,0.72)',
        heroWash: isDark ? 'rgba(242,167,140,0.28)' : 'rgba(242,167,140,0.22)',
        cardBg: isDark ? 'rgba(242,167,140,0.12)' : 'rgba(242,167,140,0.10)',
        cardBorder: isDark ? 'rgba(242,167,140,0.35)' : 'rgba(242,167,140,0.32)',
      }
    case 'critical':
      // Red — final stretch before midnight. Higher saturation in
      // dark mode so the hero wash reads as alarmed rather than dull.
      return {
        fg: isDark ? '#E88A70' : '#C03A2A',
        soft: isDark ? 'rgba(232,138,112,0.78)' : 'rgba(192,58,42,0.78)',
        heroWash: isDark ? 'rgba(224,85,85,0.34)' : 'rgba(224,85,85,0.24)',
        cardBg: isDark ? 'rgba(224,85,85,0.16)' : 'rgba(224,85,85,0.10)',
        cardBorder: isDark ? 'rgba(224,85,85,0.42)' : 'rgba(224,85,85,0.32)',
      }
  }
}

function SheetHero({
  data,
  derived,
  tone,
}: {
  data: StreakData
  derived: StreakDerived
  tone: StatusTone
}) {
  const { theme } = useAppTheme()
  return (
    <RiseView>
      <View style={styles.heroRow}>
        <View style={{ flex: 1 }}>
          <View style={styles.heroNumberRow}>
            <AnimatedFlame status={derived.status} size={40} />
            <Text style={[styles.heroDays, { color: tone.fg }]}>
              {derived.status === 'broken' ? '0' : data.currentStreak}
            </Text>
            <Text style={[styles.heroDaysLabel, { color: tone.soft }]}>días</Text>
          </View>
          <Text style={[styles.heroHeadline, { color: theme.colors.text }]}>
            {derived.copyHeadline}
          </Text>
        </View>
        <View
          style={[
            styles.levelBadge,
            { backgroundColor: `${tone.fg}1F`, borderColor: `${tone.fg}55` },
          ]}
        >
          <Text style={[styles.levelBadgeSuper, { color: tone.soft }]}>NIVEL</Text>
          <Text style={[styles.levelBadgeText, { color: tone.fg }]}>{derived.levelLabel}</Text>
        </View>
      </View>
    </RiseView>
  )
}

function ShieldChip({ tokens, tone }: { tokens: number; tone: StatusTone }) {
  // Always-visible inventory of the user's freeze tokens. Three slots
  // mirror the spec cap (max 2 earned + a placeholder hint at the next
  // grant). Filled = available, hollow = empty/locked.
  const filled = Math.min(2, Math.max(0, tokens))
  const slots: Array<'filled' | 'empty'> = [
    filled >= 1 ? 'filled' : 'empty',
    filled >= 2 ? 'filled' : 'empty',
  ]
  return (
    <RiseView delay={40} style={{ marginTop: 12 }}>
      <View
        style={[
          styles.shieldChip,
          {
            backgroundColor: tone.cardBg,
            borderColor: tone.cardBorder,
          },
        ]}
        accessibilityLabel={`Escudos disponibles: ${tokens} de 2`}
      >
        <View style={styles.shieldDots}>
          {slots.map((slot, idx) => (
            <View
              key={idx}
              style={[
                styles.shieldDot,
                slot === 'filled'
                  ? { backgroundColor: tone.fg, borderColor: tone.fg }
                  : { backgroundColor: 'transparent', borderColor: `${tone.fg}55` },
              ]}
            >
              <MaterialIcons
                name="shield"
                size={11}
                color={slot === 'filled' ? '#FFFFFF' : `${tone.fg}88`}
              />
            </View>
          ))}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.shieldChipLabel, { color: tone.fg }]}>
            {tokens === 0
              ? 'Sin escudos disponibles'
              : tokens === 1
                ? '1 escudo disponible'
                : '2 escudos disponibles'}
          </Text>
          <Text style={[styles.shieldChipHint, { color: tone.soft }]}>
            {tokens === 2
              ? 'Stock al máximo. Cubren un día perdido cada uno.'
              : tokens === 1
                ? 'Te queda 1. Cubrirá un día sin registrar.'
                : 'Ganás uno cada 7 días seguidos de racha.'}
          </Text>
        </View>
      </View>
    </RiseView>
  )
}

function LevelProgress({ derived, tone }: { derived: StreakDerived; tone: StatusTone }) {
  const { theme } = useAppTheme()
  const progress = useSharedValue(0)
  useEffect(() => {
    // @motion-allow: 900ms one-shot level-progress fill; deliberately faster than pulse (1200) to feel responsive after sheet open
    progress.value = withTiming(Math.min(Math.max(derived.progressPct, 0), 1), {
      duration: 900,
      easing: motionEasings.decelerate,
    })
  }, [derived.progressPct, progress])
  // scaleX on a full-width fill avoids JS-thread width interpolation.
  const fillStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: progress.value }],
  }))

  return (
    <RiseView delay={80} style={{ marginTop: 14 }}>
      <View style={styles.progressHead}>
        <Text style={[styles.progressLabel, { color: tone.soft }]}>{derived.levelLabel}</Text>
        <Text style={[styles.progressLabel, { color: tone.fg }]}>
          {derived.daysIntoLevel} / {derived.levelTotalDays} días → {derived.nextLevelLabel}
        </Text>
      </View>
      <View
        style={[
          styles.progressTrack,
          {
            backgroundColor: theme.isDark
              ? 'rgba(255,255,255,0.08)'
              : 'rgba(15,42,30,0.08)',
          },
        ]}
      >
        <Animated.View
          style={[styles.progressFill, { backgroundColor: tone.fg }, fillStyle]}
        />
      </View>
      {derived.daysToNextLevel > 0 ? (
        <Text style={[styles.progressSub, { color: tone.soft }]}>
          {derived.daysToNextLevel} días más para subir a {derived.nextLevelLabel}
        </Text>
      ) : null}
    </RiseView>
  )
}

function WeekActivity({
  weekActivity,
  tone,
}: {
  weekActivity: boolean[]
  tone: StatusTone
}) {
  const { theme } = useAppTheme()
  const labels = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
  const emptyDotBg = theme.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,42,30,0.04)'
  return (
    <RiseView delay={120}>
      <View
        style={[
          styles.card,
          { backgroundColor: theme.colors.creamCard, borderColor: theme.colors.line },
        ]}
      >
        <Text style={[styles.cardLabel, { color: theme.colors.textMuted }]}>Últimos 7 días</Text>
        <View style={styles.weekRow}>
          {weekActivity.map((logged, i) => {
            const isToday = i === weekActivity.length - 1
            return (
              <View key={i} style={styles.dayCol}>
                <View
                  style={[
                    styles.dayDot,
                    {
                      backgroundColor: logged ? tone.fg : emptyDotBg,
                      borderColor: logged
                        ? tone.fg
                        : isToday
                          ? tone.fg
                          : theme.colors.line,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.dayDotText,
                      {
                        color: logged
                          ? theme.isDark
                            ? '#0A1410'
                            : '#F2EAD3'
                          : isToday
                            ? tone.fg
                            : theme.colors.textMuted,
                      },
                    ]}
                  >
                    {logged ? '✓' : isToday ? '?' : '·'}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.dayLabel,
                    {
                      color: isToday && !logged ? tone.fg : theme.colors.textMuted,
                      fontWeight: isToday ? '800' : '600',
                    },
                  ]}
                >
                  {labels[i]}
                </Text>
              </View>
            )
          })}
        </View>
      </View>
    </RiseView>
  )
}

function ShieldNotice({
  tokens,
  intensity,
}: {
  tokens: number
  intensity: AtRiskIntensity | null
}) {
  const { theme } = useAppTheme()
  const tone = getAtRiskTone(intensity ?? 'urgent', theme.isDark)
  return (
    <RiseView delay={180}>
      <View
        style={[
          styles.card,
          { backgroundColor: tone.cardBg, borderColor: tone.cardBorder },
        ]}
      >
        <View style={styles.cardRow}>
          <View style={[styles.cardIcon, { backgroundColor: `${tone.fg}2A` }]}>
            <Text style={styles.cardIconEmoji}>🛡️</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardTitle, { color: tone.fg }]}>
              Tenés {tokens} {tokens === 1 ? 'escudo disponible' : 'escudos disponibles'}
            </Text>
            <Text style={[styles.cardBody, { color: tone.soft }]}>
              Si no registrás hoy, el escudo protege tu racha automáticamente a las 23:59.
            </Text>
          </View>
        </View>
      </View>
    </RiseView>
  )
}

function ConsequenceCard({
  data,
  derived,
}: {
  data: StreakData
  derived: StreakDerived
}) {
  const { theme } = useAppTheme()
  const danger = theme.isDark
    ? { fg: '#E88A70', bg: 'rgba(224,85,85,0.12)', border: 'rgba(224,85,85,0.32)' }
    : { fg: '#C03A2A', bg: 'rgba(224,85,85,0.08)', border: 'rgba(224,85,85,0.24)' }
  const lost = Math.max(0, data.currentStreak - derived.regressionDay)
  const rows = [
    `Volvés al día ${derived.regressionDay} (inicio de ${derived.levelLabel})`,
    `Perdés ${lost} ${lost === 1 ? 'día' : 'días'} de progreso ganados`,
    `Necesitarías ${derived.daysToNextLevel + lost} días más para llegar a ${derived.nextLevelLabel}`,
  ]
  return (
    <RiseView delay={180}>
      <View
        style={[
          styles.card,
          { backgroundColor: danger.bg, borderColor: danger.border },
        ]}
      >
        <Text style={[styles.cardTitle, { color: danger.fg, marginBottom: 10 }]}>
          Si no registrás hoy
        </Text>
        {rows.map((text, i) => (
          <View key={i} style={styles.consequenceRow}>
            <View style={[styles.consequenceDot, { backgroundColor: danger.fg }]} />
            <Text style={[styles.cardBody, { color: `${danger.fg}B8` }]}>{text}</Text>
          </View>
        ))}
      </View>
    </RiseView>
  )
}

function RecoveryCard({ derived }: { derived: StreakDerived }) {
  const { theme } = useAppTheme()
  return (
    <RiseView delay={180}>
      <View
        style={[
          styles.card,
          { backgroundColor: theme.colors.creamCard, borderColor: theme.colors.line },
        ]}
      >
        <Text style={[styles.cardTitle, { color: theme.colors.text, marginBottom: 6 }]}>
          Podés volver
        </Text>
        <Text style={[styles.cardBody, { color: theme.colors.textMuted }]}>
          {derived.copyMessage}
        </Text>
      </View>
    </RiseView>
  )
}

function MotivationalCard({
  data,
  derived,
}: {
  data: StreakData
  derived: StreakDerived
}) {
  const { theme } = useAppTheme()
  const tone = getStatusTone('active', null, theme.isDark)
  return (
    <RiseView delay={180}>
      <View
        style={[
          styles.card,
          { backgroundColor: tone.cardBg, borderColor: tone.cardBorder },
        ]}
      >
        <Text style={[styles.cardBody, { color: tone.fg, lineHeight: 20 }]}>
          {derived.copyMessage}
        </Text>
        {data.currentStreak > data.longestStreak - 5 &&
        data.currentStreak < data.longestStreak ? (
          <Text style={[styles.cardBody, { color: tone.fg, marginTop: 8 }]}>
            A {data.longestStreak - data.currentStreak} días de tu récord personal de {data.longestStreak} días.
          </Text>
        ) : null}
        {data.currentStreak >= data.longestStreak && data.longestStreak > 0 ? (
          <Text
            style={[
              styles.cardBody,
              { color: tone.fg, fontWeight: '800', marginTop: 8 },
            ]}
          >
            🏆 Estás en tu récord personal. ¡Seguí!
          </Text>
        ) : null}
      </View>
    </RiseView>
  )
}

function PersonalStats({ data }: { data: StreakData }) {
  const { theme } = useAppTheme()
  return (
    <RiseView delay={240}>
      <View style={styles.statsGrid}>
        <View
          style={[
            styles.statCard,
            { backgroundColor: theme.colors.creamCard, borderColor: theme.colors.line },
          ]}
        >
          <Text style={[styles.statLabel, { color: theme.colors.textMuted }]}>
            Récord personal
          </Text>
          <Text style={[styles.statValue, { color: theme.colors.text }]}>
            {data.longestStreak} {data.longestStreak === 1 ? 'día' : 'días'}
          </Text>
        </View>
        <View
          style={[
            styles.statCard,
            { backgroundColor: theme.colors.creamCard, borderColor: theme.colors.line },
          ]}
        >
          <Text style={[styles.statLabel, { color: theme.colors.textMuted }]}>
            Total registrado
          </Text>
          <Text style={[styles.statValue, { color: theme.colors.text }]}>
            {data.totalDaysLogged} {data.totalDaysLogged === 1 ? 'día' : 'días'}
          </Text>
        </View>
      </View>
    </RiseView>
  )
}

function FreezeInfo({ tokens }: { tokens: number }) {
  const { theme } = useAppTheme()
  return (
    <Text style={[styles.freezeInfo, { color: theme.colors.textMuted }]}>
      Ganás un escudo cada 7 días seguidos de racha.{'\n'}
      Tenés {tokens} · Podés acumular hasta 2.
    </Text>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { flex: 1 },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
  },
  heroWash: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 240,
  },
  handleArea: {
    paddingTop: 10,
    paddingBottom: 8,
    alignItems: 'center',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  hero: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 18,
  },
  heroRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  heroNumberRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    marginBottom: 4,
  },
  heroDays: {
    fontSize: 44,
    fontWeight: '800',
    letterSpacing: -2,
    lineHeight: 48,
  },
  heroDaysLabel: { fontSize: 15, fontWeight: '600', marginBottom: 8 },
  heroHeadline: { fontSize: 13, fontWeight: '700', marginTop: 2 },
  levelBadge: {
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  levelBadgeSuper: { fontSize: 9, fontWeight: '700', letterSpacing: 0.8 },
  levelBadgeText: { fontSize: 14, fontWeight: '800', marginTop: 2 },
  progressHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  progressLabel: { fontSize: 11, fontWeight: '600' },
  progressTrack: {
    height: 7,
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    width: '100%',
    borderRadius: 999,
    transformOrigin: 'left' as const,
  },
  progressSub: { fontSize: 11, marginTop: 5 },
  shieldChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  shieldDots: {
    flexDirection: 'row',
    gap: 6,
  },
  shieldDot: {
    width: 26,
    height: 26,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shieldChipLabel: { fontSize: 12, fontWeight: '800' },
  shieldChipHint: { fontSize: 11, marginTop: 2, lineHeight: 14 },
  ctaStack: { gap: 10 },
  secondaryCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    paddingVertical: 13,
    borderWidth: 1,
  },
  secondaryCtaIcon: { marginRight: 0 },
  secondaryCtaText: { fontSize: 14, fontWeight: '800' },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 24,
    gap: 10,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 10,
    letterSpacing: 0.6,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  cardIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  cardIconEmoji: { fontSize: 16, lineHeight: 20 },
  cardTitle: { fontSize: 13, fontWeight: '800', marginBottom: 4 },
  cardBody: { fontSize: 12, lineHeight: 18 },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dayCol: { alignItems: 'center', gap: 5, flex: 1 },
  dayDot: {
    width: 30,
    height: 30,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayDotText: { fontSize: 12, fontWeight: '700' },
  dayLabel: { fontSize: 10 },
  consequenceRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 5,
  },
  consequenceDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    marginTop: 6,
  },
  cta: {
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { fontSize: 15, fontWeight: '800' },
  statsGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  statCard: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    alignItems: 'center',
  },
  statLabel: { fontSize: 10, marginBottom: 4, fontWeight: '600' },
  statValue: { fontSize: 18, fontWeight: '800' },
  freezeInfo: {
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 17,
    marginTop: 4,
  },
})
