import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Modal,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native'
import { Text } from '@/components/ui/app-text'
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  LinearTransition,
  runOnJS,
  SlideInDown,
  SlideOutDown,
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
import { MaterialIcons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { NeoButton } from '@/components/ui/neo-button'
import { NeoSurface } from '@/components/ui/neo-surface'
import { NumpadGrid } from '@/components/ui/numpad-grid'
import { SUPPORTS_INSET_SHADOW } from '@/components/wizard/inset-shadow-support'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { motionDurations, motionEasings, motionSprings } from '@/lib/motion'
import { withAlpha } from '@/theme/color-utils'
import { neoInk } from '@/theme/neo-ink'
import { neoRadii, neoTokens } from '@/theme/neo-tokens'
import { nunitoFamily } from '@/theme/typography'
import { useThemeTokens } from '@/theme/theme-provider'
import { useModalVisibilityBeacon } from '@/lib/modal-visibility'

interface NumericEditSheetProps {
  visible: boolean
  title: string
  subtitle?: string

  rawValue: string
  onChangeRawValue: (value: string) => void
  formatDisplay?: (raw: string) => string
  displayEyebrow?: string
  displayPlaceholder?: string

  helper?: string
  errorText?: string

  /** Optional content rendered between subtitle and display — use for
   *  a mode picker, segmented control, or extra context. */
  headerExtra?: ReactNode
  /** When true, the numpad grid is rendered non-interactive (dimmed).
   *  Useful for modes that don't need numeric input (e.g. "none"). */
  numpadDisabled?: boolean
  /**
   * Cuando true, el numpad arranca colapsado (no se muestra) y solo
   * aparece cuando el user tap-ea el display card. La idea es que el
   * sheet primero invite al user a tomar una decisión (CTA del header),
   * y el keypad de ajuste fino esté disponible bajo demanda — no
   * compite por atención. Para flujos donde el usuario VIENE a editar
   * un número específico (settings finance), default false.
   */
  numpadCollapsedByDefault?: boolean

  maxIntegerDigits?: number
  maxDecimalDigits?: number

  saveLabel?: string
  saveDisabled?: boolean
  isSaving?: boolean
  onSave: () => void
  onClose: () => void
  /**
   * Optional ghost/secondary action rendered below the primary save
   * button. Useful for "skip with default" flows where the user can
   * confirm without changing the amount.
   */
  secondaryAction?: {
    label: string
    onPress: () => void
    disabled?: boolean
  }
}

const DISMISS_DISTANCE = 100
const DISMISS_VELOCITY = 650

/**
 * El handoff dibuja el scrim como un sólido (`#B9BEAC` claro / `#0A130D`
 * oscuro) porque en la maqueta el fondo ya viene lavado detrás de la
 * hoja. En el dispositivo hay una pantalla real atrás: a opacidad plena
 * el sólido la borraría y el drag-to-dismiss (que baja el scrim a 0.2
 * para dejar ver lo de atrás) perdería su sentido. Se aplica el MISMO
 * tono con alfa — misma decisión y mismo valor que la piel neo de
 * `ModalCard`.
 */
const NEO_SCRIM_ALPHA = 0.84

/**
 * Single-field numeric editor sheet. A single Modal with a bottom
 * sheet that bundles: header (title/subtitle) + big tappable display
 * (AmountCard-style) + the shared numpad grid + primary save button.
 *
 * Replaces the old pattern of ModalCard + separate InAppNumpad Modal
 * (which caused the numpad to cover the input). Everything is in the
 * same sheet so the user always sees what they're editing.
 */
export function NumericEditSheet({
  visible,
  title,
  subtitle,
  rawValue,
  onChangeRawValue,
  formatDisplay,
  displayEyebrow,
  displayPlaceholder = '0',
  helper,
  errorText,
  headerExtra,
  numpadDisabled = false,
  numpadCollapsedByDefault = false,
  maxIntegerDigits,
  maxDecimalDigits,
  saveLabel,
  saveDisabled = false,
  isSaving = false,
  onSave,
  onClose,
  secondaryAction,
}: NumericEditSheetProps) {
  const { t } = useTranslation()
  const resolvedSaveLabel = saveLabel ?? t('common:actions.save')
  const theme = useThemeTokens()
  const neo = neoTokens(theme.mode)
  const insets = useSafeAreaInsets()
  const { height: screenHeight } = useWindowDimensions()
  const reduceMotion = useReducedMotion()
  // Spec B (2026-06-07): numpad opcional bajo demanda. Cuando
  // collapsedByDefault está activo, el sheet abre con el numpad oculto
  // — la prop forza el comportamiento "primero la decisión CTA del
  // header, después el ajuste fino". Tap al display lo expande.
  // Reset cada vez que el sheet abre/cierra para no preservar
  // expanded state entre sesiones.
  const [numpadExpanded, setNumpadExpanded] = useState(
    !numpadCollapsedByDefault,
  )
  useEffect(() => {
    if (visible) {
      // reset al abrir
      setNumpadExpanded(!numpadCollapsedByDefault)
    }
  }, [visible, numpadCollapsedByDefault])

  const translateY = useSharedValue(screenHeight)
  const backdropOpacity = useSharedValue(0)
  // Defer unmount of the native <Modal> until our exit animation
  // finishes — otherwise saving a value snaps the sheet shut because
  // the parent flips `visible` to false the same frame the mutation
  // resolves.
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
    transform: [{ translateY: translateY.value }],
  }))

  const backdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }))

  const handleDismiss = useCallback(() => {
    onClose()
  }, [onClose])

  const handleDragDismissed = useCallback(() => {
    setMounted(false)
    onClose()
  }, [onClose])

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .onUpdate((event) => {
          'worklet'
          if (event.translationY > 0) {
            translateY.value = event.translationY
            backdropOpacity.value = Math.max(0.2, 1 - event.translationY / screenHeight)
          }
        })
        .onEnd((event) => {
          'worklet'
          const shouldDismiss =
            event.translationY > DISMISS_DISTANCE || event.velocityY > DISMISS_VELOCITY
          if (shouldDismiss) {
            backdropOpacity.value = withTiming(0, { duration: motionDurations.quick })
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
            backdropOpacity.value = withTiming(1, { duration: motionDurations.quick })
          }
        }),
    [translateY, backdropOpacity, screenHeight, handleDragDismissed],
  )

  const displayText =
    rawValue.length > 0
      ? (formatDisplay ? formatDisplay(rawValue) : rawValue)
      : displayPlaceholder
  const isPlaceholder = rawValue.length === 0

  // El error NO se dibuja con un `borderWidth: 1`: en el vocabulario neo
  // el estado viaja en el relieve, así que es el mismo pozo con el anillo
  // de `shadows.ringSelected` teñido de `danger`.
  const displayShadow = errorText
    ? `${neo.shadows.insetLg}, 0 0 0 2.5px ${neo.danger}`
    : neo.shadows.insetLg

  // `neo.danger` es el color del ANILLO (a un borde le alcanza 3:1). Como
  // tinta de 12px sobre la hoja clara no llega al 4.5:1 de AA, así que el
  // texto del error va por la tinta semántica del sistema (4.93:1 sobre
  // `neo.sheet` en claro, 5.3:1 en oscuro).
  const errorInk = neoInk(theme.mode).danger

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={handleDismiss}
    >
      <GestureHandlerRootView style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, backdropAnimatedStyle]}>
          <Pressable
            accessibilityLabel={t('states:numericEditor.closeLabel')}
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
            // layout: cuando aparece/desaparece el numpad por demand, la
            // altura intrínseca del sheet cambia. LinearTransition con
            // ease-out-expo smoothea ese resize en vez de saltar de golpe.
            layout={
              reduceMotion
                ? undefined
                : LinearTransition.duration(280).easing(
                    Easing.bezier(0.16, 1, 0.30, 1),
                  )
            }
            style={[
              styles.sheet,
              sheetAnimatedStyle,
              {
                // Carcasa del handoff: sólido `neo.sheet` + sombra hacia
                // arriba, sin hairline (el relieve es el límite).
                backgroundColor: neo.sheet,
                boxShadow: neo.shadows.sheet,
                paddingBottom: insets.bottom + 16,
              },
            ]}
          >
            <View style={styles.handleArea}>
              <View style={[styles.handle, { backgroundColor: neo.sheetHandle }]} />
            </View>

            <View style={styles.header}>
              <Text style={[styles.title, { color: neo.text }]}>{title}</Text>
              {subtitle ? (
                <Text style={[styles.subtitle, { color: neo.textMuted }]}>
                  {subtitle}
                </Text>
              ) : null}
            </View>

            {headerExtra ? (
              <View style={styles.headerExtra}>{headerExtra}</View>
            ) : null}

            <View style={styles.displayWrap}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  numpadExpanded
                    ? t('states:numericEditor.editAmount', { value: displayText })
                    : t('states:numericEditor.editAmountTap', { value: displayText })
                }
                accessibilityState={{ expanded: numpadExpanded }}
                disabled={numpadDisabled}
                onPress={() => {
                  if (!numpadExpanded) {
                    setNumpadExpanded(true)
                  }
                }}
                style={({ pressed }) => ({
                  opacity: pressed && !numpadExpanded ? 0.85 : 1,
                })}
              >
                <NeoSurface
                  variant="insetLg"
                  radius={neoRadii.input}
                  backgroundColor={neo.well}
                  style={[
                    styles.displayCard,
                    {
                      boxShadow: displayShadow,
                      // Android < API 29 descarta el inset EN SILENCIO y el
                      // pozo (#E9EBE0) sobre la hoja (#F0EFE3) es ~1.06:1:
                      // sin este límite el display desaparece.
                      borderWidth: SUPPORTS_INSET_SHADOW ? 0 : 1,
                      borderColor: errorText ? neo.danger : neo.sheetDivider,
                    },
                  ]}
                >
                  {displayEyebrow ? (
                    <Text style={[styles.displayEyebrow, { color: neo.textMuted }]}>
                      {displayEyebrow}
                    </Text>
                  ) : null}
                  <View style={styles.displayValueRow}>
                    <Text
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      allowFontScaling
                      maxFontSizeMultiplier={1.2}
                      style={[
                        styles.displayValue,
                        // Placeholder en `textMuted`, no en `textTertiary`:
                        // ese último sobre el pozo claro da 2.1:1 — ni
                        // siquiera el 3:1 que AA pide para texto grande.
                        { color: isPlaceholder ? neo.textMuted : neo.text },
                      ]}
                    >
                      {displayText}
                    </Text>
                    {!numpadExpanded && !numpadDisabled ? (
                      <NeoSurface
                        variant="raisedSm"
                        radius={neoRadii.pill}
                        style={styles.displayEditChip}
                      >
                        <MaterialIcons
                          name="edit"
                          size={14}
                          color={neo.textMuted}
                        />
                        <Text
                          style={[
                            styles.displayEditChipText,
                            { color: neo.textMuted },
                          ]}
                        >
                          {t('states:numericEditor.editChip')}
                        </Text>
                      </NeoSurface>
                    ) : null}
                  </View>
                </NeoSurface>
              </Pressable>
              {errorText ? (
                <Text style={[styles.helperText, { color: errorInk }]}>
                  {errorText}
                </Text>
              ) : helper ? (
                <Text style={[styles.helperText, { color: neo.textMuted }]}>
                  {helper}
                </Text>
              ) : null}
            </View>

            <View style={styles.saveButton}>
              <NeoButton
                variant="primary"
                block
                label={resolvedSaveLabel}
                onPress={onSave}
                disabled={saveDisabled}
                busy={isSaving}
              />
              {secondaryAction ? (
                <View style={styles.secondaryButton}>
                  <NeoButton
                    variant="ghost"
                    block
                    label={secondaryAction.label}
                    onPress={secondaryAction.onPress}
                    disabled={secondaryAction.disabled || isSaving}
                  />
                </View>
              ) : null}
            </View>

            {numpadExpanded ? (
              <Animated.View
                // Slide-up suave desde abajo + fade. Matchea el feel de
                // un keyboard apareciendo. Curve ease-out-expo (la misma
                // que usa el cycle wrapped) — natural y sin bounce.
                entering={
                  reduceMotion
                    ? FadeIn.duration(120)
                    : SlideInDown.duration(320)
                        .easing(Easing.bezier(0.16, 1, 0.30, 1))
                }
                exiting={
                  reduceMotion
                    ? FadeOut.duration(120)
                    : SlideOutDown.duration(220)
                        .easing(Easing.bezier(0.16, 1, 0.30, 1))
                }
                pointerEvents={numpadDisabled ? 'none' : 'auto'}
                style={numpadDisabled ? styles.numpadDimmed : undefined}
              >
                <NumpadGrid
                  rawValue={rawValue}
                  onChangeRawValue={onChangeRawValue}
                  onDone={onSave}
                  hideDoneButton
                  maxIntegerDigits={maxIntegerDigits}
                  maxDecimalDigits={maxDecimalDigits}
                />
              </Animated.View>
            ) : null}
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
    borderTopLeftRadius: neoRadii.sheet,
    borderTopRightRadius: neoRadii.sheet,
    paddingTop: 0,
  },
  handleArea: {
    paddingTop: 12,
    paddingBottom: 12,
    alignItems: 'center',
  },
  // Píldora 44×5 radio 3 del handoff — la misma que dibujan la piel neo
  // de `ModalCard`, `InAppNumpad` y `ModalGrabHandle`.
  handle: {
    width: 44,
    height: 5,
    borderRadius: 3,
  },
  // Padding lateral de hoja del handoff (22), igual que la piel neo de
  // `ModalCard` y que el keypad — así el display, el CTA y las teclas
  // comparten una única columna.
  header: {
    paddingHorizontal: 22,
    gap: 4,
    marginBottom: 12,
  },
  // El `fontFamily` viaja con el peso: cada peso de Nunito es un face
  // estático propio, así que sin él el 900 se renderiza regular.
  title: {
    fontSize: 20,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: nunitoFamily('600'),
    lineHeight: 18,
  },
  displayWrap: {
    paddingHorizontal: 22,
    marginBottom: 14,
    gap: 6,
  },
  displayCard: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 4,
  },
  displayEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  displayValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  displayValue: {
    flex: 1,
    fontSize: 40,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    letterSpacing: -1,
  },
  displayEditChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  displayEditChipText: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    letterSpacing: 0.4,
  },
  helperText: {
    paddingHorizontal: 4,
    fontSize: 12,
    fontWeight: '600',
    fontFamily: nunitoFamily('600'),
  },
  headerExtra: {
    paddingHorizontal: 22,
    marginBottom: 12,
  },
  saveButton: {
    paddingHorizontal: 22,
    marginBottom: 12,
  },
  secondaryButton: {
    marginTop: 8,
  },
  numpadDimmed: {
    opacity: 0.4,
  },
})
