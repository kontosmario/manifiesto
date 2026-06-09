import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Keyboard,
  Modal,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native'
import Animated, {
  FadeIn,
  LinearTransition,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
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
import { AppButton } from '@/components/ui/button'
import { useUpsertSavingsGoal } from '@/features/savings-goals/use-upsert-savings-goal'
import type { SavingsGoal } from '@/features/savings-goals/savings-goal.model'
import { triggerHaptic } from '@/lib/haptics'
import { motionDurations, motionEasings, motionSprings } from '@/lib/motion'
import { useKeyboardOffset } from '@/lib/use-keyboard-offset'
import { radii } from '@/theme/palette'
import { useAppTheme } from '@/theme/theme-provider'
import { formatMoney, formatMoneyShort } from '@/utils/money'
import { Step1Title, MAX_TITLE } from './wizard-steps/step-1-title-emoji'
import { Step2Amount } from './wizard-steps/step-2-amount'
import {
  Step3Months,
  DEFAULT_MONTHS,
  MAX_CUSTOM_MONTHS,
} from './wizard-steps/step-3-months'
import { StepSummary } from './wizard-steps/step-4-summary'
import { WizardStepHeader } from './wizard-steps/wizard-step-header'

export interface CreateSavingsGoalWizardSheetProps {
  visible: boolean
  familyId: string
  /** userId del owner — propagado a `useUpsertSavingsGoal` para que
   *  `syncAllAfterMutation` invalide el `home_snapshot` (gated por
   *  userId). Sin esto, la MetaCard del Home podía no aparecer
   *  inmediatamente después del create hasta expirar el staleTime. */
  userId?: string
  /** Pre-fill amount sugerido — usado cuando el user vino de "aportar X
   *  a meta", para que después del create la app pueda hacer el aporte
   *  automáticamente. El callback `onCreated` recibe el goal RAW del
   *  upsert para que el parent dispare la mutación de aporte con el id. */
  suggestedInitialAmount?: number
  /** Disparado en success — recibe el SavingsGoal recién creado. El
   *  parent decide qué hacer (e.g., aplicar reserva al nuevo goal). */
  onCreated: (goal: SavingsGoal) => void
  onClose: () => void
}

const STEP_COUNT = 4
const DEFAULT_EMOJI = '🎯'

const DISMISS_DISTANCE = 100
const DISMISS_VELOCITY = 650
// CR Sprint D Minor #2: reuso del token central `motionEasings.enterSmooth`
// (misma curva). Antes se redeclaraba aquí + en 3 step files.
const EXPO_OUT = motionEasings.enterSmooth

const STEP_EYEBROWS: Record<number, string> = {
  1: 'PASO 1 DE 4',
  2: 'PASO 2 DE 4',
  3: 'PASO 3 DE 4',
  4: 'RESUMEN',
}

const STEP_TITLES: Record<number, string> = {
  1: '¿Cómo se llama tu meta?',
  2: '¿Cuánto necesitás juntar?',
  3: '¿En cuánto tiempo querés llegar?',
  4: 'Revisá los detalles',
}

/**
 * Wizard guiado para crear una meta de ahorro inline desde cualquier
 * surface — alcancía CTA, ReserveBlock "A una meta", o cualquier otro
 * punto donde antes aparecía un Alert genérico "Aún no tienes meta".
 *
 * 4 pasos (cada uno en `wizard-steps/`):
 *   1. Título + emoji picker (12 opciones, default 🎯)
 *   2. Monto objetivo (display tappable + NumpadGrid on-demand)
 *   3. Plazo (chips quick-select 3/6/12/24 + custom)
 *   4. Summary + submit (Crear meta / Crear y aportar $N)
 *
 * Chrome compartido (todos los steps):
 *   • Bottom-sheet Modal con drag handle + drag-to-dismiss
 *   • Header (`WizardStepHeader`): chevron-back (icono en step 1) + eyebrow + título
 *   • Footer: AppButton primary full-width (Continuar / Crear meta)
 *
 * Estado interno se resetea cuando `visible` pasa de false → true
 * (igual que NumericEditSheet) — así el wizard arranca limpio cada vez.
 *
 * Refactor 2026-06-09 (D3 — split): los 4 step renderers + el header
 * se movieron a `wizard-steps/`. El keyboard offset effect vive en
 * `lib/use-keyboard-offset.ts` para reusar el patrón en otros sheets.
 */
export function CreateSavingsGoalWizardSheet({
  visible,
  familyId,
  userId,
  suggestedInitialAmount,
  onCreated,
  onClose,
}: CreateSavingsGoalWizardSheetProps) {
  const { theme } = useAppTheme()
  const insets = useSafeAreaInsets()
  const { height: screenHeight } = useWindowDimensions()
  const reduceMotion = useReducedMotion()

  const upsertMutation = useUpsertSavingsGoal(familyId, userId)

  const [step, setStep] = useState(1)
  const [direction, setDirection] = useState<1 | -1>(1)
  const [title, setTitle] = useState('')
  const [emoji, setEmoji] = useState<string>(DEFAULT_EMOJI)
  const [goalAmountRaw, setGoalAmountRaw] = useState('')
  const [numpadExpanded, setNumpadExpanded] = useState(false)
  const [targetMonths, setTargetMonths] = useState<number>(DEFAULT_MONTHS)
  const [customMonthsActive, setCustomMonthsActive] = useState(false)
  const [customMonthsText, setCustomMonthsText] = useState('')
  const [customMonthsNumpadExpanded, setCustomMonthsNumpadExpanded] =
    useState(false)

  // Reset state on visible false→true (match NumericEditSheet pattern):
  // don't reset while closing so the user sees continuous content while
  // it slides down.
  useEffect(() => {
    if (!visible) return
    setStep(1)
    setDirection(1)
    setTitle('')
    setEmoji(DEFAULT_EMOJI)
    setGoalAmountRaw('')
    setNumpadExpanded(false)
    setTargetMonths(DEFAULT_MONTHS)
    setCustomMonthsActive(false)
    setCustomMonthsText('')
    setCustomMonthsNumpadExpanded(false)
  }, [visible])

  // Colapsar numpad al cambiar de step (no dismiss kbd acá — el dismiss
  // vive en goNext/goBack que se disparan por interacción explícita).
  useEffect(() => {
    if (step !== 2) setNumpadExpanded(false)
  }, [step])

  const goalAmount = useMemo(() => {
    const digits = goalAmountRaw.replace(/[^\d]/g, '')
    return digits === '' ? 0 : parseInt(digits, 10)
  }, [goalAmountRaw])

  const customMonths = useMemo(() => {
    const digits = customMonthsText.replace(/[^\d]/g, '')
    if (digits === '') return null
    const value = parseInt(digits, 10)
    if (!Number.isFinite(value) || value <= 0) return null
    return Math.min(MAX_CUSTOM_MONTHS, value)
  }, [customMonthsText])

  const effectiveMonths = customMonthsActive ? customMonths : targetMonths

  const monthlyEstimate =
    effectiveMonths != null && effectiveMonths > 0
      ? Math.ceil(goalAmount / effectiveMonths)
      : 0

  const titleTrimmed = title.trim()
  const canContinueStep1 = titleTrimmed.length > 0 && titleTrimmed.length <= MAX_TITLE
  const canContinueStep2 = goalAmount > 0
  const canContinueStep3 = effectiveMonths != null && effectiveMonths > 0

  const suggestedApply = suggestedInitialAmount && suggestedInitialAmount > 0
    ? suggestedInitialAmount
    : null

  const submitLabel = suggestedApply
    ? `Crear y aportar ${formatMoneyShort(suggestedApply)}`
    : 'Crear meta'

  const ctaLabel = step < STEP_COUNT ? 'Continuar' : submitLabel
  const ctaDisabled =
    (step === 1 && !canContinueStep1) ||
    (step === 2 && !canContinueStep2) ||
    (step === 3 && !canContinueStep3)

  const goNext = useCallback(() => {
    void triggerHaptic('selection')
    // Dismiss explícito al avanzar — el teclado se cierra antes del
    // cambio de step para no tapar el numpad del step 2.
    Keyboard.dismiss()
    setDirection(1)
    setStep((s) => Math.min(STEP_COUNT, s + 1))
  }, [])
  const goBack = useCallback(() => {
    void triggerHaptic('selection')
    Keyboard.dismiss()
    setDirection(-1)
    setStep((s) => Math.max(1, s - 1))
  }, [])

  const handleSubmit = useCallback(() => {
    if (!canContinueStep1 || !canContinueStep2 || !canContinueStep3) return
    // Dismiss teclado pre-submit — sino queda flotando durante loading
    // + el flash de transición al cerrar el sheet.
    Keyboard.dismiss()
    upsertMutation.mutate(
      {
        input: {
          title: titleTrimmed,
          emoji,
          goalAmount,
          currentAmount: 0,
          targetMonths: effectiveMonths ?? null,
          isActive: true,
        },
        existingId: null,
      },
      {
        onSuccess: (goal) => {
          void triggerHaptic('success')
          onCreated(goal)
        },
        onError: (err) => {
          void triggerHaptic('error')
          Alert.alert(
            'No pudimos crear la meta',
            err instanceof Error ? err.message : 'Reintenta en un momento.',
          )
        },
      },
    )
  }, [
    canContinueStep1,
    canContinueStep2,
    canContinueStep3,
    upsertMutation,
    titleTrimmed,
    emoji,
    goalAmount,
    effectiveMonths,
    onCreated,
  ])

  const handlePrimaryPress = useCallback(() => {
    if (step < STEP_COUNT) {
      if (ctaDisabled) return
      goNext()
      return
    }
    handleSubmit()
  }, [step, ctaDisabled, goNext, handleSubmit])

  // ─── Sheet animation (mismo pattern que NumericEditSheet) ──────────
  const translateY = useSharedValue(screenHeight)
  const backdropOpacity = useSharedValue(0)
  const keyboardOffset = useKeyboardOffset(visible)
  const [mounted, setMounted] = useState(visible)

  useEffect(() => {
    if (visible) {
      setMounted(true)
      translateY.value = reduceMotion ? 0 : withSpring(0, motionSprings.sheet)
      backdropOpacity.value = reduceMotion
        ? 1
        : withTiming(1, { duration: motionDurations.standard })
      return
    }
    if (!mounted) return
    if (reduceMotion) {
      translateY.value = screenHeight
      backdropOpacity.value = 0
      setMounted(false)
      return
    }
    backdropOpacity.value = withTiming(0, { duration: motionDurations.standard })
    translateY.value = withTiming(
      screenHeight,
      {
        duration: motionDurations.deliberate,
        easing: motionEasings.accelerate,
      },
      (finished) => {
        if (finished) runOnJS(setMounted)(false)
      },
    )
  }, [visible, mounted, reduceMotion, screenHeight, translateY, backdropOpacity])

  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value + keyboardOffset.value }],
  }))

  const backdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }))

  const handleDismiss = useCallback(() => {
    if (upsertMutation.isPending) return
    onClose()
  }, [upsertMutation.isPending, onClose])

  const handleDragDismissed = useCallback(() => {
    setMounted(false)
    onClose()
  }, [onClose])

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!upsertMutation.isPending)
        // activeOffsetY garantiza que el gesture solo arranca cuando el
        // user mueve ≥10px verticalmente — sino dispara en CUALQUIER
        // touch (incluido tap al input) → race con el focus → crash.
        .activeOffsetY(10)
        .onUpdate((event) => {
          'worklet'
          if (event.translationY > 0) {
            translateY.value = event.translationY
            backdropOpacity.value = Math.max(
              0.2,
              1 - event.translationY / screenHeight,
            )
          }
        })
        .onEnd((event) => {
          'worklet'
          const shouldDismiss =
            event.translationY > DISMISS_DISTANCE ||
            event.velocityY > DISMISS_VELOCITY
          if (shouldDismiss) {
            backdropOpacity.value = withTiming(0, {
              duration: motionDurations.quick,
            })
            translateY.value = withSpring(
              screenHeight,
              {
                ...motionSprings.sheetDismiss,
                velocity: Math.max(event.velocityY, 800),
              },
              (finished) => {
                if (finished) runOnJS(handleDragDismissed)()
              },
            )
          } else {
            translateY.value = withSpring(0, motionSprings.sheet)
            backdropOpacity.value = withTiming(1, {
              duration: motionDurations.quick,
            })
          }
        }),
    [
      translateY,
      backdropOpacity,
      screenHeight,
      handleDragDismissed,
      upsertMutation.isPending,
    ],
  )

  const renderStepBody = () => {
    switch (step) {
      case 1:
        return (
          <Step1Title
            title={title}
            onChangeTitle={setTitle}
            selectedEmoji={emoji}
            onSelectEmoji={(next) => {
              void triggerHaptic('selection')
              setEmoji(next)
            }}
          />
        )
      case 2:
        return (
          <Step2Amount
            goalAmount={goalAmount}
            goalAmountRaw={goalAmountRaw}
            onChangeRawValue={setGoalAmountRaw}
            numpadExpanded={numpadExpanded}
            onExpandNumpad={() => setNumpadExpanded(true)}
            reduceMotion={reduceMotion}
            onDone={() => {
              if (canContinueStep2) goNext()
              else setNumpadExpanded(false)
            }}
          />
        )
      case 3:
        return (
          <Step3Months
            targetMonths={targetMonths}
            customMonthsActive={customMonthsActive}
            customMonthsText={customMonthsText}
            customMonthsNumpadExpanded={customMonthsNumpadExpanded}
            reduceMotion={reduceMotion}
            onSelectPreset={(m) => {
              void triggerHaptic('selection')
              setCustomMonthsActive(false)
              setCustomMonthsNumpadExpanded(false)
              setTargetMonths(m)
            }}
            onToggleCustom={() => {
              void triggerHaptic('selection')
              setCustomMonthsActive(true)
              // Auto-expandir numpad al elegir custom — el flow natural
              // es "tap custom → tipear monto", sin step extra.
              setCustomMonthsNumpadExpanded(true)
            }}
            onExpandCustomNumpad={() => {
              void triggerHaptic('selection')
              setCustomMonthsNumpadExpanded(true)
            }}
            onChangeCustomText={setCustomMonthsText}
            onCustomDone={() => setCustomMonthsNumpadExpanded(false)}
          />
        )
      case 4:
        return (
          <StepSummary
            emoji={emoji}
            title={titleTrimmed}
            goalAmount={goalAmount}
            months={effectiveMonths ?? 0}
            monthlyEstimate={monthlyEstimate}
            suggestedApply={suggestedApply}
          />
        )
      default:
        return null
    }
  }

  const stepEntering = useMemo(() => {
    if (reduceMotion) return FadeIn.duration(120)
    return FadeIn.duration(280)
      .easing(EXPO_OUT)
      .withInitialValues({
        opacity: 0,
        transform: [{ translateX: direction === 1 ? 12 : -12 }],
      })
  }, [reduceMotion, direction])

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={handleDismiss}
    >
      <GestureHandlerRootView style={styles.root}>
        <Animated.View
          style={[StyleSheet.absoluteFill, backdropAnimatedStyle]}
        >
          <Pressable
            accessibilityLabel="Cerrar wizard"
            accessibilityRole="button"
            onPress={handleDismiss}
            style={[styles.backdrop, { backgroundColor: theme.colors.overlay }]}
          />
        </Animated.View>

        <GestureDetector gesture={panGesture}>
          <Animated.View
            layout={
              reduceMotion
                ? undefined
                : LinearTransition.duration(280).easing(EXPO_OUT)
            }
            style={[
              styles.sheet,
              sheetAnimatedStyle,
              {
                backgroundColor: theme.colors.surface,
                paddingBottom: insets.bottom + 16,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <View style={styles.handleArea}>
              <View
                style={[
                  styles.handle,
                  { backgroundColor: theme.colors.borderStrong },
                ]}
              />
            </View>

            <WizardStepHeader
              step={step}
              stepCount={STEP_COUNT}
              eyebrow={STEP_EYEBROWS[step]}
              title={STEP_TITLES[step]}
              busy={upsertMutation.isPending}
              onGoBack={goBack}
            />

            <Animated.View
              key={`step-${step}`}
              entering={stepEntering}
              style={styles.stepBodyWrap}
            >
              {renderStepBody()}
            </Animated.View>

            <View style={styles.ctaWrap}>
              <AppButton
                variant="primary"
                label={ctaLabel}
                onPress={handlePrimaryPress}
                disabled={ctaDisabled}
                loading={upsertMutation.isPending}
                accessibilityLabel={
                  step < STEP_COUNT
                    ? `Continuar al paso ${step + 1} de ${STEP_COUNT}`
                    : suggestedApply
                      ? `Crear meta y aportar ${formatMoney(suggestedApply)}`
                      : `Crear meta ${titleTrimmed || ''}`.trim()
                }
              />
            </View>
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    flex: 1,
  },
  sheet: {
    borderTopLeftRadius: radii['2xl'],
    borderTopRightRadius: radii['2xl'],
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 0,
  },
  handleArea: {
    paddingTop: 10,
    paddingBottom: 8,
    alignItems: 'center',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: radii.pill,
  },
  stepBodyWrap: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  ctaWrap: {
    paddingHorizontal: 16,
    marginTop: 4,
  },
})
