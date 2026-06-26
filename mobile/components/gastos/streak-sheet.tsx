import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Alert,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native'
import Animated, {
  cancelAnimation,
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
import { motionDurations, motionEasings, motionSprings } from '@/lib/motion'
import {
  deriveStreak,
  useMarkNoExpenseDay,
  useUnmarkNoExpenseDay,
  type StreakData,
} from '@/features/streaks/use-streak'
import { triggerHaptic } from '@/lib/haptics'
import { useAppTheme } from '@/theme/theme-provider'
import { getStatusTone } from './streak-sheet-parts/streak-sheet-tone'
import { SheetHero, ShieldChip } from './streak-sheet-parts/sheet-hero'
import { LevelProgress } from './streak-sheet-parts/level-progress'
import { WeekActivity } from './streak-sheet-parts/week-activity'
import {
  ConsequenceCard,
  FreezeInfo,
  MotivationalCard,
  PersonalStats,
  RecoveryCard,
  ShieldNotice,
} from './streak-sheet-parts/motivational-card'
import {
  CtaStack,
  PrimaryStatusCta,
  SecondaryCta,
} from './streak-sheet-parts/action-ctas'

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
 *
 * Refactor 2026-06-09 (D6 — split): hero, level progress, week activity
 * y las info-cards (motivational/consequence/recovery/stats/freeze)
 * viven en `streak-sheet-parts/`. El orchestrator queda con state,
 * gesture, mutations y composition.
 *
 * Sprint A fixes preservados (memory-load): panGesture `useMemo` +
 * `.enabled(visible)`, cleanup `cancelAnimation` on unmount, isMountedRef
 * guard contra `runOnJS(setMounted)(false)` tras unmount.
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
  const { t } = useTranslation()
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
  // Guard contra runOnJS(setMounted)(false) callbacks tras unmount.
  // El callback de withTiming corre en el UI thread; si el componente
  // se desmonta entre el inicio del fade-out y el callback, llamar
  // setState en un componente unmounted dispara warnings y, peor, puede
  // pisar state de un próximo mount de la misma instancia.
  const isMountedRef = useRef(true)
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const safeSetMounted = (value: boolean) => {
    if (!isMountedRef.current) return
    setMounted(value)
  }

  useEffect(() => {
    if (visible) {
      setMounted(true)
      translateY.value = withSpring(0, motionSprings.sheet)
      backdropOpacity.value = withTiming(1, { duration: motionDurations.standard })
      return () => {
        // Cleanup: cancelar animations en vuelo si el effect re-corre
        // (visible flipped) o el componente se desmonta. Sin esto, una
        // withSpring/withTiming pendiente sigue resolviendo en el UI
        // thread y puede llamar runOnJS(setMounted) en un componente
        // desmontado (warning + race).
        cancelAnimation(translateY)
        cancelAnimation(backdropOpacity)
      }
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
        if (finished) runOnJS(safeSetMounted)(false)
      },
    )
    return () => {
      cancelAnimation(translateY)
      cancelAnimation(backdropOpacity)
    }
  }, [visible, mounted, translateY, backdropOpacity])

  const handleMarkNoExpense = () => {
    if (markNoExpenseMutation.isPending) return
    Alert.alert(
      t('gastos:streakSheet.markAlert.title'),
      t('gastos:streakSheet.markAlert.message'),
      [
        { style: 'cancel', text: t('common:actions.cancel') },
        {
          text: t('gastos:streakSheet.markAlert.confirm'),
          onPress: () => {
            markNoExpenseMutation.mutate(undefined, {
              onSuccess: () => {
                void triggerHaptic('success')
              },
              onError: (error: unknown) => {
                void triggerHaptic('error')
                Alert.alert(
                  t('gastos:streakSheet.markAlert.errorTitle'),
                  error instanceof Error ? error.message : t('gastos:streakSheet.retryLater'),
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
      t('gastos:streakSheet.unmarkAlert.title'),
      t('gastos:streakSheet.unmarkAlert.message'),
      [
        { style: 'cancel', text: t('common:actions.cancel') },
        {
          style: 'destructive',
          text: t('gastos:streakSheet.unmarkAlert.confirm'),
          onPress: () => {
            unmarkNoExpenseMutation.mutate(undefined, {
              onSuccess: () => {
                void triggerHaptic('warning')
              },
              onError: (error: unknown) => {
                void triggerHaptic('error')
                Alert.alert(
                  t('gastos:streakSheet.unmarkAlert.errorTitle'),
                  error instanceof Error ? error.message : t('gastos:streakSheet.retryLater'),
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

  // Memoizar el Gesture descriptor — sin esto, cada render rebuildea el
  // objeto y GestureDetector tiene que re-attachearlo en el UI thread.
  // `.enabled(visible)` lo apaga durante el slide-out (mounted=true,
  // visible=false) y evita que un swipe en ese frame muerto re-arranque
  // animaciones contra un componente que está por desmontar.
  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(visible)
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
            event.translationY > DISMISS_DISTANCE ||
            event.velocityY > DISMISS_VELOCITY
          if (shouldDismiss) {
            translateY.value = withSpring(SCREEN_H, {
              ...motionSprings.sheetDismiss,
              velocity: Math.max(event.velocityY, 800),
            })
            backdropOpacity.value = withTiming(0, {
              duration: motionDurations.quick,
            })
            runOnJS(onClose)()
          } else {
            translateY.value = withSpring(0, motionSprings.sheet)
            backdropOpacity.value = withTiming(1, {
              duration: motionDurations.quick,
            })
          }
        }),
    [visible, translateY, backdropOpacity, onClose],
  )

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose}>
      <GestureHandlerRootView style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
          <Pressable
            accessibilityLabel={t('common:actions.close')}
            accessibilityRole="button"
            onPress={onClose}
            style={[
              styles.backdrop,
              { backgroundColor: theme.colors.overlay ?? 'rgba(0,0,0,0.55)' },
            ]}
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
              <CtaStack>
                <PrimaryStatusCta
                  status={derived.status}
                  onClose={onClose}
                  onPressAddExpense={onPressAddExpense}
                />
                {noExpenseButtonAvailable ? (
                  <SecondaryCta
                    tone={tone}
                    busy={markNoExpenseMutation.isPending}
                    iconName="event-available"
                    label={t('gastos:streakSheet.noExpenseToday')}
                    busyLabel={t('gastos:streakSheet.saving')}
                    accessibilityLabel={t('gastos:streakSheet.markNoSpendA11y')}
                    onPress={handleMarkNoExpense}
                  />
                ) : null}
              </CtaStack>
            ) : null}

            {derived.status === 'active' && data.hasMarkedNoExpenseToday ? (
              <SecondaryCta
                tone={tone}
                busy={unmarkNoExpenseMutation.isPending}
                iconName="undo"
                label={t('gastos:streakSheet.unmarkLabel')}
                busyLabel={t('gastos:streakSheet.reverting')}
                accessibilityLabel={t('gastos:streakSheet.unmarkNoSpendA11y')}
                onPress={handleUnmarkNoExpense}
              />
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
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 24,
    gap: 10,
  },
})
