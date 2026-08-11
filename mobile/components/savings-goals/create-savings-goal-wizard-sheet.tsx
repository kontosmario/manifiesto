import { useCallback, useEffect, useMemo, useState } from 'react'
import {
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
import { useTranslation } from 'react-i18next'
import { NeoButton } from '@/components/ui/neo-button'
import { WizardSkinProvider } from '@/components/wizard/wizard-skin'
import { useUpsertSavingsGoal } from '@/features/savings-goals/use-upsert-savings-goal'
import type { SavingsGoal } from '@/features/savings-goals/savings-goal.model'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { triggerHaptic } from '@/lib/haptics'
import { motionDurations, motionEasings, motionSprings } from '@/lib/motion'
import { useKeyboardOffset } from '@/lib/use-keyboard-offset'
import { withAlpha } from '@/theme/color-utils'
import { neoRadii, neoTokens } from '@/theme/neo-tokens'
import { useThemeTokens } from '@/theme/theme-provider'
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
import { useModalVisibilityBeacon } from '@/lib/modal-visibility'

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
// Default = sticker "objetivo" (antes 🎯). GoalIcon lo rendea como sticker.
const DEFAULT_EMOJI = 'metas/objetivo'

const DISMISS_DISTANCE = 100
const DISMISS_VELOCITY = 650

/**
 * El handoff dibuja el scrim SÓLIDO porque en la maqueta el fondo ya
 * viene lavado detrás de la hoja; en el dispositivo hay una pantalla
 * real atrás, así que se aplica el mismo tono con alfa. Mismo valor y
 * misma razón que `ModalCard` (`NEO_SCRIM_ALPHA`), para que las dos
 * carcasas de hoja de la app se oscurezcan igual.
 */
const NEO_SCRIM_ALPHA = 0.84
// CR Sprint D Minor #2: reuso del token central `motionEasings.enterSmooth`
// (misma curva). Antes se redeclaraba aquí + en 3 step files.
const EXPO_OUT = motionEasings.enterSmooth

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
 *   • Footer: NeoButton primary full-width (Continuar / Crear meta)
 *
 * Rediseño 2026-07 (cáscara): hoja `neo.sheet` con esquinas superiores
 * en `neoRadii.sheet`, sombra HACIA ARRIBA (`neo.shadows.sheet`), sin
 * borde, píldora de arrastre 44×5 en `neo.sheetHandle` y scrim del tema.
 * Es la misma receta que `ModalCard skin="neo"` — este sheet no la monta
 * porque su gesto, su offset de teclado y su transición de paso son
 * propios (ver notas del handoff sobre extraer un `NeoSheet` común).
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
  const theme = useThemeTokens()
  const neo = neoTokens(theme.mode)
  const { t } = useTranslation()
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

  // Colapsar numpad al cambiar de step (no dismiss kbd aquí — el dismiss
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
    ? t('settings:savingsWizard.createAndContribute', { amount: formatMoneyShort(suggestedApply) })
    : t('settings:savingsWizard.createGoal')

  const ctaLabel = step < STEP_COUNT ? t('common:actions.continue') : submitLabel
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
        // NO se emite un segundo aviso de error acá. `useUpsertSavingsGoal`
        // ya publica `toast.error(settings:savingsGoalValidation.saveFailed)`
        // CON acción "Reintentar" en su propio `onError`, y el host de
        // toasts muestra UNA sola a la vez: un toast emitido desde este
        // callback (que corre DESPUÉS del de la mutación) reemplazaría al
        // de la mutación y se llevaría puesto el reintento. Antes del
        // rediseño esto era un `Alert.alert` nativo, así que el usuario
        // veía el alert del SO **y** el toast por el mismo fallo.
        onError: () => {
          void triggerHaptic('error')
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
  // Avisa al resto de la app que hay una ventana nativa arriba (el
  // ToastHost la necesita para no quedar tapado). Ver `modal-visibility`.
  useModalVisibilityBeacon(mounted)

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
    if (reduceMotion) return FadeIn.duration(motionDurations.micro)
    return FadeIn.duration(motionDurations.enterStack)
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
      <WizardSkinProvider mode={theme.mode}>
      <GestureHandlerRootView style={styles.root}>
        <Animated.View
          style={[StyleSheet.absoluteFill, backdropAnimatedStyle]}
        >
          <Pressable
            accessibilityLabel={t('settings:savingsWizard.closeA11y')}
            accessibilityRole="button"
            onPress={handleDismiss}
            style={[
              styles.backdrop,
              { backgroundColor: withAlpha(neo.scrim, NEO_SCRIM_ALPHA) },
            ]}
          />
        </Animated.View>

        <GestureDetector gesture={panGesture}>
          <Animated.View
            layout={
              reduceMotion
                ? undefined
                : LinearTransition.duration(motionDurations.enterStack).easing(EXPO_OUT)
            }
            style={[
              styles.sheet,
              sheetAnimatedStyle,
              {
                backgroundColor: neo.sheet,
                // En neo el límite de la hoja lo da la sombra (hacia
                // ARRIBA, que es su único borde libre), nunca un borde.
                boxShadow: neo.shadows.sheet,
                paddingBottom: insets.bottom + 16,
              },
            ]}
          >
            <View style={styles.handleArea}>
              <View
                style={[styles.handle, { backgroundColor: neo.sheetHandle }]}
              />
            </View>

            <WizardStepHeader
              step={step}
              stepCount={STEP_COUNT}
              eyebrow={t(`settings:savingsWizard.eyebrow.${step}`)}
              title={t(`settings:savingsWizard.title.${step}`)}
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
              <NeoButton
                variant="primary"
                block
                label={ctaLabel}
                onPress={handlePrimaryPress}
                disabled={ctaDisabled}
                busy={upsertMutation.isPending}
                accessibilityHint={
                  step < STEP_COUNT
                    ? t('settings:savingsWizard.continueA11y', { next: step + 1, total: STEP_COUNT })
                    : suggestedApply
                      ? t('settings:savingsWizard.createAndContributeA11y', { amount: formatMoney(suggestedApply) })
                      : t('settings:savingsWizard.createGoalA11y', { title: titleTrimmed || '' }).trim()
                }
              />
            </View>
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
      </WizardSkinProvider>
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
    // Sólo las esquinas SUPERIORES: la hoja llega al borde inferior y
    // ahí las recorta la pantalla (handoff `screens/3c.html`).
    borderTopLeftRadius: neoRadii.sheet,
    borderTopRightRadius: neoRadii.sheet,
    paddingTop: 0,
  },
  handleArea: {
    paddingTop: 10,
    paddingBottom: 8,
    alignItems: 'center',
  },
  // Píldora de arrastre del handoff: 44×5, radio 3.
  handle: {
    width: 44,
    height: 5,
    borderRadius: 3,
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
