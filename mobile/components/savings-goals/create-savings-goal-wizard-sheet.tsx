import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native'
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  LinearTransition,
  runOnJS,
  SlideInDown,
  SlideOutDown,
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
import { MaterialIcons } from '@expo/vector-icons'
import { AppButton } from '@/components/ui/button'
import { NumpadGrid } from '@/components/ui/numpad-grid'
import { TextField } from '@/components/ui/text-field'
import { useUpsertSavingsGoal } from '@/features/savings-goals/use-upsert-savings-goal'
import type { SavingsGoal } from '@/features/savings-goals/savings-goal.model'
import { triggerHaptic } from '@/lib/haptics'
import { motionDurations, motionEasings, motionSprings } from '@/lib/motion'
import { radii } from '@/theme/palette'
import { typography } from '@/theme/typography'
import { useAppTheme } from '@/theme/theme-provider'
import { formatMoney, formatMoneyShort } from '@/utils/money'

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
const MAX_TITLE = 40

const EMOJI_PALETTE = [
  '🎯', '✈️', '🏠', '🚗',
  '🎓', '💍', '🌅', '💻',
  '🎁', '🏖️', '📱', '💰',
] as const

const MONTH_OPTIONS = [3, 6, 12, 24] as const
const DEFAULT_MONTHS = 12
// 240 = 20 años. Más que eso → la meta deja de ser "objetivo a 20
// años" y entra territorio de retirement planning, no del flow.
const MAX_CUSTOM_MONTHS = 240

const DISMISS_DISTANCE = 100
const DISMISS_VELOCITY = 650
const EXPO_OUT = Easing.bezier(0.16, 1, 0.30, 1)

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
 * 4 pasos:
 *   1. Título + emoji picker (12 opciones, default 🎯)
 *   2. Monto objetivo (display tappable + NumpadGrid on-demand)
 *   3. Plazo (chips quick-select 3/6/12/24 + custom)
 *   4. Summary + submit (Crear meta / Crear y aportar $N)
 *
 * Chrome compartido (todos los steps):
 *   • Bottom-sheet Modal con drag handle + drag-to-dismiss
 *   • Header: chevron-back (oculto en step 1) + progress dots + X close
 *   • Footer: AppButton primary full-width (Continuar / Crear meta)
 *
 * Estado interno se resetea cuando `visible` pasa de false → true
 * (igual que NumericEditSheet) — así el wizard arranca limpio cada vez
 * sin que el caller tenga que pasar `key={...}`.
 *
 * Rediseño 2026-06-08: alinea el wizard con los patterns del app
 *   • NumericEditSheet-style bottom sheet (no más ModalCard)
 *   • Numpad on-demand en step 2 (mismo pattern que CycleBalancePromptSheet)
 *   • Full-width primary CTA — "Atrás" se mueve al header como chevron
 *   • Emoji picker grid en step 1
 *   • Parallax fade entre steps (translateX 12 → 0, mismo curve que el wrapped)
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

  // Reset state on visible false→true transition. Match NumericEditSheet's
  // pattern: don't reset while the sheet is closing (so the user sees
  // continuous content while it slides down).
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

  // Reset numpadExpanded al cambiar de step para que step 2 vuelva a
  // arrancar colapsado si el user navega back-and-forth.
  // NO dismisseamos el teclado acá — el dismiss vive en goNext/goBack
  // que se disparan por interacción explícita del user (no en el
  // mount inicial donde step=1 by default).
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
    // Dismiss explícito al avanzar — si el user estaba escribiendo
    // en el TextField, el teclado se cierra antes del cambio de step
    // para no tapar el numpad del step 2.
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
    // Dismiss teclado antes del submit — sino queda flotando durante
    // el loading state y el flash de transición al cerrar el sheet.
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
  // Keyboard offset — cuando el teclado nativo aparece (tap al
  // TextField del título), translate el sheet hacia arriba por la
  // altura del teclado para que el input siga visible. Sin esto la
  // KeyboardAvoidingView rompía el sizing del sheet (flex:1 colapsaba
  // el sheet a content-based sin bounds → invisible).
  const keyboardOffset = useSharedValue(0)
  const [mounted, setMounted] = useState(visible)

  useEffect(() => {
    // CRITICAL: resetear el offset en CADA transición de visible —
    // si el modal se cierra con el teclado abierto, el listener hide
    // se desuscribe antes de que dispare → offset queda persistido.
    // Al reabrir, el sheet renderea translateado por el offset viejo
    // y aparece flotando en mitad de la pantalla (bug reportado).
    keyboardOffset.value = 0
    if (!visible) {
      // Asegurar que el teclado no quede flotando si el user cierra
      // con foco activo en el TextField. Dismiss explícito en JS thread.
      Keyboard.dismiss()
      return
    }
    const showSub = Keyboard.addListener('keyboardWillShow', (e) => {
      keyboardOffset.value = withTiming(-(e.endCoordinates.height ?? 0), {
        duration: e.duration ?? 250,
        easing: motionEasings.decelerate,
      })
    })
    const hideSub = Keyboard.addListener('keyboardWillHide', (e) => {
      keyboardOffset.value = withTiming(0, {
        duration: e.duration ?? 200,
        easing: motionEasings.decelerate,
      })
    })
    return () => {
      showSub.remove()
      hideSub.remove()
    }
  }, [visible, keyboardOffset])

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
        // activeOffsetY garantiza que el gesture solo arranca cuando
        // el user mueve ≥10px verticalmente. Sin esto, onBegin
        // disparaba en CUALQUIER touch (incluido tap al input del
        // título) → race entre dismiss + focus del TextField → crash.
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

  // ─── Step body — keyed Animated.View para parallax + fade ──────────
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
              // Auto-expandir numpad al elegir custom — el flow
              // natural es "tap custom → tipear monto", sin step extra.
              setCustomMonthsNumpadExpanded(true)
            }}
            onExpandCustomNumpad={() => {
              void triggerHaptic('selection')
              setCustomMonthsNumpadExpanded(true)
            }}
            onChangeCustomText={setCustomMonthsText}
            onCustomDone={() => {
              setCustomMonthsNumpadExpanded(false)
            }}
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

            {/* Chevron back + eyebrow/title en UNA SOLA FILA — a pedido
                del owner. Chevron a la izquierda (vertically centered
                con el bloque de texto), columna a la derecha con
                eyebrow (PASO X DE X) arriba y título debajo. */}
            <View style={styles.stepHeaderRow}>
              {step > 1 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Volver al paso ${step - 1} de ${STEP_COUNT}`}
                  onPress={goBack}
                  disabled={upsertMutation.isPending}
                  hitSlop={10}
                  style={({ pressed }) => [
                    styles.stepHeaderBack,
                    {
                      backgroundColor: theme.colors.surfaceMuted,
                      opacity: upsertMutation.isPending
                        ? 0.4
                        : pressed
                          ? 0.7
                          : 1,
                    },
                  ]}
                >
                  <MaterialIcons
                    name="chevron-left"
                    size={22}
                    color={theme.colors.text}
                  />
                </Pressable>
              ) : (
                // Step 1: el slot del chevron lo ocupa un icono que
                // representa la acción — bandera de meta. Comunica
                // "estás creando una meta" desde el primer paso sin
                // texto extra. Reusa el surfaceMuted bg para mantener
                // el ritmo visual con el chevron de steps 2-4.
                <View
                  style={[
                    styles.stepHeaderIcon,
                    {
                      backgroundColor: theme.colors.primarySurface,
                      borderColor: theme.colors.primary,
                    },
                  ]}
                  accessibilityRole="image"
                  accessibilityLabel="Crear meta de ahorro"
                >
                  <MaterialIcons
                    name="flag"
                    size={20}
                    color={theme.colors.primary}
                  />
                </View>
              )}

              <View style={styles.stepHeaderTextCol}>
                <Text
                  style={[
                    typography.eyebrow,
                    { color: theme.colors.textMuted },
                  ]}
                >
                  {STEP_EYEBROWS[step]}
                </Text>
                <Text
                  style={[
                    typography.titleMedium,
                    { color: theme.colors.text },
                  ]}
                >
                  {STEP_TITLES[step]}
                </Text>
              </View>
            </View>

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

// WizardHeader removido: el chevron back se integró en la fila del
// eyebrow + título (ver styles.stepHeaderRow arriba). Header chrome
// minimal — solo el drag handle persiste. Dismiss vía swipe.

// ── Step 1 — Title + emoji picker ────────────────────────────────────
interface Step1TitleProps {
  title: string
  onChangeTitle: (v: string) => void
  selectedEmoji: string
  onSelectEmoji: (emoji: string) => void
}

function Step1Title({
  title,
  onChangeTitle,
  selectedEmoji,
  onSelectEmoji,
}: Step1TitleProps) {
  const { theme } = useAppTheme()
  return (
    <View style={styles.step1Body}>
      <TextField
        label="Nombre de la meta"
        value={title}
        onChangeText={(v) => onChangeTitle(v.slice(0, MAX_TITLE))}
        placeholder="Ej: Viaje a Bariloche"
        autoCapitalize="sentences"
        // autoFocus removido a propósito: el teclado nativo en iOS
        // empujaba el sheet entero. Con KeyboardAvoidingView wrap +
        // tap-to-focus el flow se siente más controlado y no flashea.
        accessibilityLabel="Nombre de la meta"
        helper={`${title.length}/${MAX_TITLE}`}
      />

      <View
        style={[styles.divider, { backgroundColor: theme.colors.line }]}
      />

      <View style={styles.emojiSection}>
        <Text
          style={[typography.eyebrow, { color: theme.colors.textMuted }]}
        >
          ELEGÍ UN ÍCONO
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.emojiScroll}
          contentContainerStyle={styles.emojiScrollContent}
          accessibilityLabel="Seleccionar ícono — desliza para ver más"
        >
          {EMOJI_PALETTE.map((glyph) => {
            const isActive = glyph === selectedEmoji
            return (
              <Pressable
                key={glyph}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
                accessibilityLabel={`Ícono ${glyph}`}
                onPress={() => onSelectEmoji(glyph)}
                style={({ pressed }) => [
                  styles.emojiCard,
                  {
                    backgroundColor: isActive
                      ? theme.colors.primarySurface
                      : theme.isDark
                        ? 'rgba(255,255,255,0.04)'
                        : 'rgba(15,42,30,0.04)',
                    borderColor: isActive
                      ? theme.colors.primary
                      : theme.colors.line,
                    borderWidth: isActive ? 2 : 1,
                    opacity: pressed ? 0.78 : 1,
                  },
                ]}
              >
                <Text style={styles.emojiGlyph}>{glyph}</Text>
              </Pressable>
            )
          })}
        </ScrollView>
      </View>
    </View>
  )
}

// ── Step 2 — Amount (display + numpad on-demand) ─────────────────────
interface Step2AmountProps {
  goalAmount: number
  goalAmountRaw: string
  onChangeRawValue: (v: string) => void
  numpadExpanded: boolean
  onExpandNumpad: () => void
  reduceMotion: boolean
  onDone: () => void
}

function Step2Amount({
  goalAmount,
  goalAmountRaw,
  onChangeRawValue,
  numpadExpanded,
  onExpandNumpad,
  reduceMotion,
  onDone,
}: Step2AmountProps) {
  const { theme } = useAppTheme()
  const isPlaceholder = goalAmount <= 0
  return (
    <View style={styles.step2Body}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          numpadExpanded
            ? `Editar monto. Valor actual ${
                goalAmount > 0 ? formatMoney(goalAmount) : 'sin definir'
              }`
            : `Tocá para editar el monto. Valor actual ${
                goalAmount > 0 ? formatMoney(goalAmount) : 'sin definir'
              }`
        }
        accessibilityState={{ expanded: numpadExpanded }}
        onPress={() => {
          if (!numpadExpanded) onExpandNumpad()
        }}
        style={({ pressed }) => [
          styles.displayCard,
          {
            backgroundColor: theme.colors.surfaceMuted,
            borderColor: theme.colors.border,
            opacity: pressed && !numpadExpanded ? 0.85 : 1,
          },
        ]}
      >
        <Text
          style={[
            typography.eyebrow,
            styles.displayEyebrow,
            { color: theme.colors.textMuted },
          ]}
        >
          MONTO OBJETIVO
        </Text>
        <View style={styles.displayValueRow}>
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            allowFontScaling
            maxFontSizeMultiplier={1.2}
            style={[
              typography.displayLarge,
              styles.displayValue,
              {
                color: isPlaceholder
                  ? theme.colors.textSoft
                  : theme.colors.text,
              },
            ]}
          >
            {goalAmount > 0 ? formatMoney(goalAmount) : '$ 0'}
          </Text>
          {!numpadExpanded ? (
            <View
              style={[
                styles.displayEditChip,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                },
              ]}
            >
              <MaterialIcons
                name="edit"
                size={14}
                color={theme.colors.textMuted}
              />
              <Text
                style={[
                  styles.displayEditChipText,
                  { color: theme.colors.textMuted },
                ]}
              >
                Editar
              </Text>
            </View>
          ) : null}
        </View>
      </Pressable>

      {!numpadExpanded ? (
        <Text
          style={[
            styles.amountHelper,
            { color: theme.colors.textMuted },
          ]}
        >
          Tocá el monto para editarlo. Solo números enteros — sin centavos.
        </Text>
      ) : null}

      {numpadExpanded ? (
        <Animated.View
          entering={
            reduceMotion
              ? FadeIn.duration(120)
              : SlideInDown.duration(320).easing(EXPO_OUT)
          }
          exiting={
            reduceMotion
              ? FadeOut.duration(120)
              : SlideOutDown.duration(220).easing(EXPO_OUT)
          }
        >
          <NumpadGrid
            rawValue={goalAmountRaw}
            onChangeRawValue={onChangeRawValue}
            onDone={onDone}
            hideDoneButton
            maxIntegerDigits={11}
          />
        </Animated.View>
      ) : null}
    </View>
  )
}

// ── Step 3 — Months ──────────────────────────────────────────────────
interface Step3MonthsProps {
  targetMonths: number
  customMonthsActive: boolean
  customMonthsText: string
  customMonthsNumpadExpanded: boolean
  reduceMotion: boolean
  onSelectPreset: (months: number) => void
  onToggleCustom: () => void
  onExpandCustomNumpad: () => void
  onChangeCustomText: (v: string) => void
  onCustomDone: () => void
}

function Step3Months({
  targetMonths,
  customMonthsActive,
  customMonthsText,
  customMonthsNumpadExpanded,
  reduceMotion,
  onSelectPreset,
  onToggleCustom,
  onExpandCustomNumpad,
  onChangeCustomText,
  onCustomDone,
}: Step3MonthsProps) {
  const { theme } = useAppTheme()
  const customDigits = customMonthsText.replace(/[^\d]/g, '')
  const customMonthsParsed = customDigits === '' ? 0 : parseInt(customDigits, 10)
  const customPlaceholder = customMonthsParsed <= 0
  return (
    <View style={styles.step3Body}>
      <View style={styles.monthsGrid}>
        {MONTH_OPTIONS.map((m) => {
          const isActive = !customMonthsActive && targetMonths === m
          return (
            <MonthChip
              key={m}
              label={`${m} meses`}
              isActive={isActive}
              onPress={() => onSelectPreset(m)}
              accessibilityLabel={`${m} meses`}
              theme={theme}
              style={styles.monthsGridItem}
            />
          )
        })}
        <MonthChip
          label="Personalizado"
          isActive={customMonthsActive}
          onPress={onToggleCustom}
          accessibilityLabel="Plazo personalizado"
          theme={theme}
          style={styles.monthsGridFullRow}
        />
      </View>

      {customMonthsActive ? (
        <>
          {/* Display tappable — mismo pattern que el monto del step 2.
              El user ve el plazo elegido y abre el numpad al tap.
              Usamos el numpad custom de la app (no teclado nativo). */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              customMonthsNumpadExpanded
                ? `Plazo personalizado. Valor actual ${customMonthsParsed} meses`
                : `Tocá para editar plazo personalizado. Valor actual ${customMonthsParsed} meses`
            }
            accessibilityState={{ expanded: customMonthsNumpadExpanded }}
            onPress={() => {
              if (!customMonthsNumpadExpanded) {
                onExpandCustomNumpad()
              }
            }}
            style={({ pressed }) => [
              styles.displayCard,
              {
                backgroundColor: theme.colors.surfaceMuted,
                borderColor: theme.colors.border,
                opacity: pressed && !customMonthsNumpadExpanded ? 0.85 : 1,
              },
            ]}
          >
            <Text
              style={[
                typography.eyebrow,
                styles.displayEyebrow,
                { color: theme.colors.textMuted },
              ]}
            >
              PLAZO PERSONALIZADO
            </Text>
            <View style={styles.displayValueRow}>
              <Text
                numberOfLines={1}
                style={[
                  typography.metricLarge,
                  styles.displayValue,
                  {
                    color: customPlaceholder
                      ? theme.colors.textSoft
                      : theme.colors.text,
                  },
                ]}
              >
                {customPlaceholder
                  ? 'Tocá para tipear'
                  : `${customMonthsParsed} ${customMonthsParsed === 1 ? 'mes' : 'meses'}`}
              </Text>
              {!customMonthsNumpadExpanded ? (
                <View
                  style={[
                    styles.displayEditChip,
                    {
                      backgroundColor: theme.colors.surface,
                      borderColor: theme.colors.border,
                    },
                  ]}
                >
                  <MaterialIcons
                    name="edit"
                    size={14}
                    color={theme.colors.textMuted}
                  />
                  <Text
                    style={[
                      styles.displayEditChipText,
                      { color: theme.colors.textMuted },
                    ]}
                  >
                    Editar
                  </Text>
                </View>
              ) : null}
            </View>
          </Pressable>

          {customMonthsNumpadExpanded ? (
            <Animated.View
              entering={
                reduceMotion
                  ? FadeIn.duration(120)
                  : SlideInDown.duration(320).easing(EXPO_OUT)
              }
              exiting={
                reduceMotion
                  ? FadeOut.duration(120)
                  : SlideOutDown.duration(220).easing(EXPO_OUT)
              }
            >
              <NumpadGrid
                rawValue={customMonthsText}
                onChangeRawValue={onChangeCustomText}
                onDone={onCustomDone}
                hideDoneButton
                maxIntegerDigits={3}
                maxDecimalDigits={0}
              />
            </Animated.View>
          ) : null}

          {/* Helper text bajo el numpad. Antes el clamp a 240 era silencioso
              (el `Math.min(240, value)` en el parent recortaba sin avisar)
              → el user tipeaba 999 y veía 240 sin entender por qué. Ahora
              mostramos la razón explícita y, en rango, una guía de copy. */}
          <Text
            style={[
              typography.caption,
              styles.customMonthsHelper,
              { color: theme.colors.textMuted },
            ]}
          >
            {customMonthsParsed > MAX_CUSTOM_MONTHS
              ? `Máximo ${MAX_CUSTOM_MONTHS} meses (20 años) — valor ajustado.`
              : 'Cuántos meses hasta llegar a la meta.'}
          </Text>
        </>
      ) : null}
    </View>
  )
}

interface MonthChipProps {
  label: string
  isActive: boolean
  onPress: () => void
  accessibilityLabel: string
  theme: ReturnType<typeof useAppTheme>['theme']
  style?: object
}

function MonthChip({
  label,
  isActive,
  onPress,
  accessibilityLabel,
  theme,
  style,
}: MonthChipProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: isActive }}
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.monthChip,
        style,
        {
          backgroundColor: isActive
            ? theme.colors.primary
            : theme.isDark
              ? 'rgba(255,255,255,0.05)'
              : 'rgba(15,42,30,0.04)',
          borderColor: isActive ? theme.colors.primary : theme.colors.line,
          opacity: pressed ? 0.78 : 1,
        },
      ]}
    >
      <Text
        style={[
          styles.monthChipText,
          {
            color: isActive
              ? theme.isDark
                ? theme.colors.background
                : '#FFFFFF'
              : theme.colors.text,
          },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  )
}

// ── Step 4 — Summary ─────────────────────────────────────────────────
interface StepSummaryProps {
  emoji: string
  title: string
  goalAmount: number
  months: number
  monthlyEstimate: number
  suggestedApply: number | null
}

function StepSummary({
  emoji,
  title,
  goalAmount,
  months,
  monthlyEstimate,
  suggestedApply,
}: StepSummaryProps) {
  const { theme } = useAppTheme()
  const cardBg = theme.isDark
    ? theme.colors.surfaceMuted
    : theme.colors.creamCard
  return (
    <View style={styles.step4Body}>
      <View
        style={[
          styles.summaryCard,
          { backgroundColor: cardBg, borderColor: theme.colors.line },
        ]}
      >
        <Text style={styles.summaryEmoji}>{emoji}</Text>
        <Text
          style={[
            typography.sectionTitle,
            styles.summaryTitle,
            { color: theme.colors.text },
          ]}
          numberOfLines={2}
        >
          {title || 'Mi meta de ahorro'}
        </Text>
        <Text
          style={[
            typography.displayLarge,
            styles.summaryAmount,
            { color: theme.colors.text },
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {formatMoney(goalAmount)}
        </Text>
        <Text
          style={[styles.summarySub, { color: theme.colors.textMuted }]}
        >
          Aportes mensuales de ~{formatMoney(monthlyEstimate)} · {months}{' '}
          {months === 1 ? 'mes' : 'meses'}
        </Text>
      </View>

      {suggestedApply ? (
        <View
          style={[
            styles.summaryApply,
            {
              backgroundColor: theme.isDark
                ? 'rgba(122,216,163,0.16)'
                : 'rgba(28,126,58,0.10)',
              borderColor: theme.isDark
                ? 'rgba(122,216,163,0.32)'
                : 'rgba(28,126,58,0.26)',
            },
          ]}
        >
          <MaterialIcons
            name="bolt"
            size={16}
            color={theme.colors.success}
          />
          <Text
            style={[
              styles.summaryApplyText,
              { color: theme.colors.success },
            ]}
          >
            Aportaremos {formatMoney(suggestedApply)} apenas se cree.
          </Text>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  // ── Sheet chrome ──
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

  // ── Step header row — chevron back + bloque (eyebrow + título)
  //    integrados en una sola fila horizontal.
  stepHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    marginTop: 8,
    marginBottom: 14,
  },
  stepHeaderBack: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Spacer cuando step=1 (no hay chevron) — preserva el alignment
  // del bloque de texto a la derecha; sin esto el texto saltaría
  // hacia la izquierda cuando aparece/desaparece el chevron.
  stepHeaderBackSpacer: {
    width: 36,
    height: 36,
  },
  // Icon "meta" (bandera) en step 1 — mismas dimensiones que el
  // chevron back, pero con border + tinte primary para destacarlo
  // como elemento decorativo/contextual (no actionable).
  stepHeaderIcon: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  stepHeaderTextCol: {
    flex: 1,
    gap: 4,
  },

  // ── Step body wrap (animated parallax) ──
  stepBodyWrap: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },

  // ── Step 1 — title + emoji picker ──
  step1Body: {
    gap: 16,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  emojiSection: {
    gap: 10,
  },
  // Single-row horizontal scroll — pedido del owner. 12 emojis no
  // entran en ancho de pantalla; ScrollView horizontal mantiene
  // todos visibles deslizando lateral.
  emojiScroll: {
    flexGrow: 0,
  },
  emojiScrollContent: {
    gap: 10,
    paddingVertical: 2,
    paddingHorizontal: 2,
  },
  emojiCard: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiGlyph: {
    fontSize: 26,
    lineHeight: 32,
  },

  // ── Step 2 — display + numpad ──
  step2Body: {
    gap: 12,
  },
  displayCard: {
    borderRadius: radii['2xl'],
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 16,
    gap: 6,
  },
  displayEyebrow: {
    letterSpacing: 1.4,
  },
  displayValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  displayValue: {
    flex: 1,
    letterSpacing: -1.2,
  },
  displayEditChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  displayEditChipText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  customMonthsHelper: {
    paddingHorizontal: 4,
    marginTop: 10,
    textAlign: 'center',
  },
  amountHelper: {
    paddingHorizontal: 4,
    fontSize: 12,
    fontWeight: '500',
  },

  // ── Step 3 — months grid ──
  step3Body: {
    gap: 12,
  },
  monthsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  monthsGridItem: {
    flexBasis: '48%',
    flexGrow: 1,
  },
  monthsGridFullRow: {
    flexBasis: '100%',
  },
  monthChip: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    minHeight: 56,
    borderRadius: radii.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthChipText: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
  },

  // ── Step 4 — summary ──
  step4Body: {
    gap: 12,
  },
  summaryCard: {
    borderRadius: radii['2xl'],
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 20,
    alignItems: 'center',
    gap: 6,
  },
  summaryEmoji: {
    fontSize: 48,
    lineHeight: 56,
    marginBottom: 4,
  },
  summaryTitle: {
    textAlign: 'center',
  },
  summaryAmount: {
    marginTop: 4,
  },
  summarySub: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 4,
  },
  summaryApply: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: radii.lg,
    borderWidth: 1,
  },
  summaryApplyText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.1,
  },

  // ── CTA ──
  ctaWrap: {
    paddingHorizontal: 16,
    marginTop: 4,
  },
})
