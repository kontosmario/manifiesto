import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollView,
} from 'react-native'
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Path } from 'react-native-svg'
import { usePressScale } from '@/hooks/use-press-scale'
import { triggerHaptic } from '@/lib/haptics'
import { motionDurations } from '@/lib/motion/tokens'
import { nunitoFamily } from '@/theme/typography'
import { type OnbMode } from './onb-spec'

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

/** Tope del monto: 9 nueves (999.999.999). Montos son enteros en pesos. */
const MAX_MONTO = 999_999_999
/** Distancia (px) que la hoja recorre al deslizar — sobra para taparla. */
const SHEET_TRAVEL = 560

/**
 * Tratamiento de la card de monto "en edición" (4j top): mientras el
 * numpad está abierto la screen eleva la card con estos valores (anillo
 * + fondo). Literal de 4j (claro) / 4jo (oscuro). Lo aplican las screens;
 * el label/monto/caret los dibuja la propia card, no este archivo.
 */
export const ONB_MONTO_EDITING = {
  light: {
    background: '#F0EFE3',
    shadow: '0 0 0 3px #2E7C39, 0 14px 30px rgba(20,30,18,0.25)',
  },
  dark: {
    background: '#1B2F22',
    shadow: '0 0 0 3px #A4E3A6, 0 14px 30px rgba(0,0,0,0.5)',
  },
} as const

// ─── Keyboard-avoidance del numpad ───────────────────────────────────

/**
 * Alto aproximado de la hoja del numpad SIN el safe-area inferior (el
 * hook le suma insets.bottom en runtime). Derivado del layout de 4j:
 * paddingTop 12 + grabber 5 + botón "Listo" ~68 + grid marginTop 16 +
 * 4 filas de teclas (~67 c/u) + 3 gaps de 12 + paddingBottom base 12
 * ≈ 417 → redondeado con un pelín de margen. Sobreestimar es seguro:
 * la card sólo sube de más, nunca queda tapada por la hoja.
 */
export const ONB_NUMPAD_SHEET_HEIGHT = 420

/** Aire visible entre el fondo de la card y el tope de la hoja. */
const NUMPAD_AVOID_MARGIN = 24
/** Reintentos del scroll (la card puede no haber medido en el 1er frame). */
const AVOID_RETRIES = [0, 60, 160] as const

/**
 * Keyboard-avoidance del numpad. Al abrir, sube la card `targetRef` por
 * encima del tope de la hoja — como el avoidance del teclado del SO.
 *
 * Devuelve `{ onScroll, extraBottomPad }` que la screen cablea a su
 * OnbScrollBody:
 *  - `onScroll` trackea el offset actual (para el scrollTo absoluto).
 *  - `extraBottomPad` (> 0 mientras el numpad está abierto) agrega
 *    espacio al fondo del contenido — SIN esto, una card baja ya cerca
 *    del tope de scroll no puede subir (scrollTo se clampa) y queda
 *    tapada. Este era el bug: "el input queda por debajo del numpad".
 *
 * Robusto en Fabric: mide la card con `measureInWindow` (coords de
 * ventana, sin getInnerViewRef/measureLayout que fallaban en silencio),
 * calcula el solape con la hoja y hace scrollTo. Worklet-free (JS).
 */
export function useNumpadScrollAvoid({
  scrollRef,
  targetRef,
  open,
}: {
  scrollRef: RefObject<ScrollView | null>
  targetRef: RefObject<View | null>
  open: boolean
}): {
  onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void
  extraBottomPad: number
} {
  const { height: windowHeight } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const scrollY = useRef(0)

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollY.current = e.nativeEvent.contentOffset.y
  }, [])

  useEffect(() => {
    if (!open) return
    const scroll = scrollRef.current
    const target = targetRef.current
    if (!scroll || !target) return

    // Tope de la hoja en coords de ventana: anclada al fondo físico, su
    // alto real incluye el safe-area inferior.
    const sheetTop = windowHeight - (ONB_NUMPAD_SHEET_HEIGHT + insets.bottom)

    const timers = AVOID_RETRIES.map((delay) =>
      setTimeout(() => {
        const t = targetRef.current
        const sc = scrollRef.current
        if (!t || !sc) return
        t.measureInWindow((_x, cardWindowY, _w, cardHeight) => {
          if (!cardHeight) return
          // Cuánto se mete el fondo de la card (con margen) debajo de la
          // hoja. Positivo → hay que subir ese tanto.
          const overlap = cardWindowY + cardHeight + NUMPAD_AVOID_MARGIN - sheetTop
          if (overlap > 1) {
            sc.scrollTo({ y: scrollY.current + overlap, animated: true })
          }
        })
      }, delay),
    )
    return () => timers.forEach(clearTimeout)
  }, [open, windowHeight, insets.bottom, scrollRef, targetRef])

  return {
    onScroll,
    // El +insets.bottom acompaña al alto real de la hoja para dejar
    // margen de scroll suficiente incluso con la card al final.
    extraBottomPad: open ? ONB_NUMPAD_SHEET_HEIGHT + insets.bottom : 0,
  }
}

// ─── Tokens del numpad (valores LITERALES de 4j / 4jo) ───────────────

interface NumpadTheme {
  sheetBg: string
  sheetShadow: string
  grabber: string
  doneText: string
  doneGradientCss: string
  doneFallback: string
  doneShadow: string
  digitText: string
  digitGradientCss: string
  digitFallback: string
  digitShadow: string
  /** Tecla hundida ("," + backspace). */
  insetText: string
  insetBg: string
  insetShadow: string
  backspaceStroke: string
}

const NUMPAD: Record<OnbMode, NumpadTheme> = {
  light: {
    sheetBg: '#EDECDF',
    sheetShadow: '0 -20px 50px rgba(20,30,18,0.35)',
    grabber: '#C6CAB8',
    doneText: '#F5F2E1',
    doneGradientCss: 'radial-gradient(circle at 32% 28%, #63B168, #2E7434 85%)',
    doneFallback: '#2E7434',
    doneShadow: '0 12px 24px rgba(46,116,52,0.4), inset 0 2px 3px rgba(255,255,255,0.3)',
    digitText: '#24382A',
    digitGradientCss: 'linear-gradient(145deg, #F3F4E9, #E1E4D6)',
    digitFallback: '#E9EBE0',
    digitShadow: '5px 5px 11px rgba(151,160,136,0.4), -5px -5px 11px rgba(255,255,255,0.9)',
    insetText: '#6C7B67',
    // Fallback SÓLIDO, no `undefined`. Las teclas "," y backspace se dibujaban
    // sólo con la sombra inset, y RN la descarta EN SILENCIO en Android < API
    // 29 (ver `SUPPORTS_INSET_SHADOW`): ahí las dos teclas se quedaban sin
    // ningún límite visible contra la hoja `#EDECDF` y el backspace —la única
    // forma de corregir un dígito mal tipeado del monto— quedaba como un glifo
    // flotando. Con el sólido la cápsula existe aunque el relieve no se pinte,
    // y donde sí se pinta el inset va encima y manda igual. En oscuro esto ya
    // estaba resuelto (`#142519`).
    insetBg: '#E4E3D5',
    insetShadow:
      'inset 4px 4px 8px rgba(151,160,136,0.32), inset -4px -4px 8px rgba(255,255,255,0.88)',
    backspaceStroke: '#2E7C39',
  },
  dark: {
    sheetBg: '#192B1E',
    sheetShadow: '0 -20px 50px rgba(0,0,0,0.6)',
    grabber: '#3A5241',
    doneText: '#0F1E14',
    doneGradientCss: 'radial-gradient(circle at 32% 28%, #9FDC9F, #3E7D46 85%)',
    doneFallback: '#3E7D46',
    doneShadow: '0 0 26px rgba(140,225,150,0.3), inset 0 2px 3px rgba(255,255,255,0.35)',
    digitText: '#F1EEDD',
    digitGradientCss: 'linear-gradient(145deg, #21382A, #16281C)',
    digitFallback: '#1D3426',
    digitShadow: '5px 5px 11px rgba(0,0,0,0.5), -5px -5px 11px rgba(101,152,113,0.08)',
    insetText: '#93A78F',
    insetBg: '#142519',
    insetShadow: 'inset 4px 4px 8px rgba(0,0,0,0.45), inset -4px -4px 8px rgba(101,152,113,0.07)',
    backspaceStroke: '#A4E3A6',
  },
}

// Filas del keypad (markup 4j): 1-9, luego "," 0 backspace.
type Key = { kind: 'digit'; digit: number } | { kind: 'comma' } | { kind: 'backspace' }

const KEY_ROWS: readonly (readonly Key[])[] = [
  [{ kind: 'digit', digit: 1 }, { kind: 'digit', digit: 2 }, { kind: 'digit', digit: 3 }],
  [{ kind: 'digit', digit: 4 }, { kind: 'digit', digit: 5 }, { kind: 'digit', digit: 6 }],
  [{ kind: 'digit', digit: 7 }, { kind: 'digit', digit: 8 }, { kind: 'digit', digit: 9 }],
  [{ kind: 'comma' }, { kind: 'digit', digit: 0 }, { kind: 'backspace' }],
]

function keyId(k: Key): string {
  return k.kind === 'digit' ? `d${k.digit}` : k.kind
}

// ─── Teclas ──────────────────────────────────────────────────────────

/** Tecla de dígito extruida (0-9) con feedback de press. */
function DigitKey({
  mode,
  digit,
  onPress,
}: {
  mode: OnbMode
  digit: number
  onPress: (digit: number) => void
}) {
  const t = NUMPAD[mode]
  const press = usePressScale({ pressedScale: 0.94 })
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={String(digit)}
      onPress={() => onPress(digit)}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={[
        styles.key,
        {
          experimental_backgroundImage: t.digitGradientCss,
          backgroundColor: t.digitFallback,
          boxShadow: t.digitShadow,
        },
        press.animatedStyle,
      ]}
    >
      <Text style={[styles.digitText, { color: t.digitText }]}>{digit}</Text>
    </AnimatedPressable>
  )
}

/**
 * Tecla "," hundida. Montos son enteros → INERTE: se renderiza por
 * fidelidad del markup pero su onPress no hace nada.
 */
function CommaKey({ mode }: { mode: OnbMode }) {
  const t = NUMPAD[mode]
  return (
    <View style={[styles.key, { backgroundColor: t.insetBg, boxShadow: t.insetShadow }]}>
      <Text style={[styles.digitText, { color: t.insetText }]}>,</Text>
    </View>
  )
}

/** Tecla backspace hundida (SVG del markup). */
function BackspaceKey({ mode, onPress }: { mode: OnbMode; onPress: () => void }) {
  const t = NUMPAD[mode]
  const { t: translate } = useTranslation()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={translate('onboarding:numpad.backspace')}
      onPress={onPress}
      style={[styles.key, { backgroundColor: t.insetBg, boxShadow: t.insetShadow }]}
    >
      <Svg width={26} height={22} viewBox="0 0 24 24">
        <Path
          d="M9 5h11a1.5 1.5 0 0 1 1.5 1.5v11A1.5 1.5 0 0 1 20 19H9l-6.5-7z"
          stroke={t.backspaceStroke}
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <Path
          d="M12.5 9.5l5 5M17.5 9.5l-5 5"
          stroke={t.backspaceStroke}
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </Svg>
    </Pressable>
  )
}

// ─── Numpad ──────────────────────────────────────────────────────────

/**
 * 4j / 4jo · teclado numérico del monto. Se monta en un <Modal>
 * transparente para cubrir la pantalla FÍSICA completa (escapa el
 * padding del host → la hoja queda al ras del borde inferior, respetando
 * el safe-area, como el mockup). La hoja entra deslizando hacia arriba y
 * sale deslizando hacia abajo; el Modal se mantiene montado durante la
 * salida (translateY por shared value → nada de snap al cerrar).
 */
export function OnbNumpad({
  mode,
  visible,
  value,
  onChange,
  onDone,
}: {
  mode: OnbMode
  visible: boolean
  value: number
  onChange: (next: number) => void
  onDone: () => void
}) {
  const t = NUMPAD[mode]
  const { t: translate } = useTranslation()
  const insets = useSafeAreaInsets()
  // `rendered` mantiene el Modal montado mientras la hoja se desliza
  // hacia afuera; se apaga recién cuando termina la animación de salida.
  const [rendered, setRendered] = useState(visible)
  const translateY = useSharedValue(SHEET_TRAVEL)

  useEffect(() => {
    if (visible) {
      setRendered(true)
      translateY.value = SHEET_TRAVEL
      translateY.value = withTiming(0, { duration: motionDurations.standard })
    } else if (rendered) {
      translateY.value = withTiming(SHEET_TRAVEL, { duration: motionDurations.quick }, (fin) => {
        if (fin) runOnJS(setRendered)(false)
      })
    }
    // rendered fuera de deps a propósito: sólo reaccionamos a `visible`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }))

  if (!rendered) {
    return null
  }

  // value===0 → 0*10+digit ya da el dígito (sin ceros a la izquierda).
  const pushDigit = (digit: number) => {
    void triggerHaptic('light')
    onChange(Math.min(value * 10 + digit, MAX_MONTO))
  }

  const popDigit = () => {
    void triggerHaptic('light')
    onChange(Math.floor(value / 10))
  }

  return (
    <Modal
      transparent
      visible={rendered}
      animationType="none"
      statusBarTranslucent
      onRequestClose={onDone}
    >
      <View style={styles.overlay}>
        {/* Tap fuera de la hoja = cerrar. Transparente: la card de monto
            elevada detrás queda visible (no la tapamos con un scrim). */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={translate('onboarding:numpad.close')}
          style={styles.gap}
          onPress={onDone}
        />
        <Animated.View
          style={[
            styles.sheet,
            sheetStyle,
            {
              paddingBottom: insets.bottom + 12,
              backgroundColor: t.sheetBg,
              boxShadow: t.sheetShadow,
            },
          ]}
        >
          <View style={[styles.grabber, { backgroundColor: t.grabber }]} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={translate('common:actions.done')}
            onPress={onDone}
            style={[
              styles.done,
              {
                experimental_backgroundImage: t.doneGradientCss,
                backgroundColor: t.doneFallback,
                boxShadow: t.doneShadow,
              },
            ]}
          >
            <Text style={[styles.doneText, { color: t.doneText }]}>
              {translate('common:actions.done')}
            </Text>
          </Pressable>
          <View style={styles.grid}>
            {KEY_ROWS.map((row) => (
              <View key={row.map(keyId).join('-')} style={styles.row}>
                {row.map((k) => {
                  if (k.kind === 'digit') {
                    return <DigitKey key={keyId(k)} mode={mode} digit={k.digit} onPress={pushDigit} />
                  }
                  if (k.kind === 'backspace') {
                    return <BackspaceKey key={keyId(k)} mode={mode} onPress={popDigit} />
                  }
                  return <CommaKey key={keyId(k)} mode={mode} />
                })}
              </View>
            ))}
          </View>
        </Animated.View>
      </View>
    </Modal>
  )
}

// ─── Estilos (geometría literal de 4j / 4jo) ─────────────────────────

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
  },
  gap: {
    flex: 1,
  },
  // Al ras del borde inferior físico (el Modal cubre toda la pantalla):
  // esquinas superiores redondeadas, inferior recta contra el borde.
  sheet: {
    borderTopLeftRadius: 34,
    borderTopRightRadius: 34,
    paddingHorizontal: 22,
    paddingTop: 12,
  },
  grabber: {
    width: 44,
    height: 5,
    borderRadius: 3,
    alignSelf: 'center',
  },
  done: {
    marginTop: 14,
    borderRadius: 24,
    padding: 16,
    alignItems: 'center',
  },
  doneText: {
    fontSize: 16,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    textAlign: 'center',
  },
  grid: {
    marginTop: 16,
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  key: {
    flex: 1,
    borderRadius: 20,
    paddingVertical: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  digitText: {
    fontSize: 24,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    textAlign: 'center',
  },
})
