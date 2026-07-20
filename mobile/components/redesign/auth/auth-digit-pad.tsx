import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated from 'react-native-reanimated'
import Svg, { Path } from 'react-native-svg'
import { useTranslation } from 'react-i18next'
import { usePressScale } from '@/hooks/use-press-scale'
import { triggerHaptic } from '@/lib/haptics'
import { nunitoFamily } from '@/theme/typography'
import type { AuthMode } from './auth-spec'

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

/**
 * Pad de dígitos INLINE para códigos y PIN (forgot-password, pin-lock,
 * pin-setup). NO existe mockup propio: reusa la receta visual de las
 * teclas del numpad 4j/4jo (misma grilla, gradientes y sombras — ver
 * onb-numpad.tsx), pero sin la hoja modal ni el "Listo": los códigos se
 * emiten dígito a dígito (string, los ceros a la izquierda IMPORTAN,
 * por eso no reusa el OnbNumpad basado en number) y el caller decide
 * cuándo está completo.
 *
 * La tecla "," del markup 4j se mantiene como slot hundido INERTE y
 * VACÍO — conserva la geometría de la grilla sin ofrecer un carácter
 * que un código nunca acepta.
 */

interface PadTheme {
  digitText: string
  digitGradientCss: string
  digitFallback: string
  digitShadow: string
  insetBg: string | undefined
  insetShadow: string
  backspaceStroke: string
}

// Valores LITERALES de 4j (claro) / 4jo (oscuro) — mismos que NUMPAD en
// onb-numpad.tsx (se transcriben acá para no acoplar los turnos).
const PAD: Record<AuthMode, PadTheme> = {
  light: {
    digitText: '#24382A',
    digitGradientCss: 'linear-gradient(145deg, #F3F4E9, #E1E4D6)',
    digitFallback: '#E9EBE0',
    digitShadow: '5px 5px 11px rgba(151,160,136,0.4), -5px -5px 11px rgba(255,255,255,0.9)',
    insetBg: undefined,
    insetShadow:
      'inset 4px 4px 8px rgba(151,160,136,0.32), inset -4px -4px 8px rgba(255,255,255,0.88)',
    backspaceStroke: '#2E7C39',
  },
  dark: {
    digitText: '#F1EEDD',
    digitGradientCss: 'linear-gradient(145deg, #21382A, #16281C)',
    digitFallback: '#1D3426',
    digitShadow: '5px 5px 11px rgba(0,0,0,0.5), -5px -5px 11px rgba(101,152,113,0.08)',
    insetBg: '#142519',
    insetShadow: 'inset 4px 4px 8px rgba(0,0,0,0.45), inset -4px -4px 8px rgba(101,152,113,0.07)',
    backspaceStroke: '#A4E3A6',
  },
}

const DIGIT_ROWS: readonly (readonly number[])[] = [
  [1, 2, 3],
  [4, 5, 6],
  [7, 8, 9],
]

export function AuthDigitPad({
  mode,
  onDigit,
  onBackspace,
  disabled = false,
  digitsDisabled = false,
}: {
  mode: AuthMode
  onDigit: (digit: string) => void
  onBackspace: () => void
  /** Lockout del PIN: teclas inertes y atenuadas. */
  disabled?: boolean
  /** Código completo: solo los dígitos quedan inertes y atenuados;
   *  backspace sigue vivo para corregir. */
  digitsDisabled?: boolean
}) {
  const { t } = useTranslation()
  const pad = PAD[mode]
  // Pressable disabled suprime onPress/onPressIn/Out juntos y deja el
  // accessibilityState honesto. dimmed atenúa SOLO los dígitos; el
  // `&& !disabled` evita componer opacidades con el lockout del PIN
  // (que ya atenúa la grilla entera).
  const digitOff = disabled || digitsDisabled
  const digitDimmed = digitsDisabled && !disabled
  return (
    <View style={[styles.grid, disabled ? styles.gridDisabled : null]}>
      {DIGIT_ROWS.map((row) => (
        <View key={row.join('-')} style={styles.row}>
          {row.map((d) => (
            <DigitKey
              key={d}
              mode={mode}
              digit={d}
              disabled={digitOff}
              dimmed={digitDimmed}
              onPress={onDigit}
            />
          ))}
        </View>
      ))}
      <View style={styles.row}>
        {/* Slot hundido inerte (geometría de la tecla "," de 4j). */}
        <View style={[styles.key, { backgroundColor: pad.insetBg, boxShadow: pad.insetShadow }]} />
        <DigitKey mode={mode} digit={0} disabled={digitOff} dimmed={digitDimmed} onPress={onDigit} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('auth:pinPad.deleteA11y')}
          disabled={disabled}
          onPress={() => {
            void triggerHaptic('light')
            onBackspace()
          }}
          style={[styles.key, { backgroundColor: pad.insetBg, boxShadow: pad.insetShadow }]}
        >
          <Svg width={26} height={22} viewBox="0 0 24 24">
            <Path
              d="M9 5h11a1.5 1.5 0 0 1 1.5 1.5v11A1.5 1.5 0 0 1 20 19H9l-6.5-7z"
              stroke={pad.backspaceStroke}
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
            <Path
              d="M12.5 9.5l5 5M17.5 9.5l-5 5"
              stroke={pad.backspaceStroke}
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </Svg>
        </Pressable>
      </View>
    </View>
  )
}

function DigitKey({
  mode,
  digit,
  disabled,
  dimmed = false,
  onPress,
}: {
  mode: AuthMode
  digit: number
  disabled: boolean
  /** Atenuación de "código completo" (solo dígitos, no la grilla). */
  dimmed?: boolean
  onPress: (digit: string) => void
}) {
  const t = PAD[mode]
  const press = usePressScale({ pressedScale: 0.94 })
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={String(digit)}
      disabled={disabled}
      onPress={() => {
        void triggerHaptic('light')
        onPress(String(digit))
      }}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={[
        styles.key,
        {
          experimental_backgroundImage: t.digitGradientCss,
          backgroundColor: t.digitFallback,
          boxShadow: t.digitShadow,
        },
        dimmed ? styles.keyDimmed : null,
        press.animatedStyle,
      ]}
    >
      <Text style={[styles.digitText, { color: t.digitText }]}>{digit}</Text>
    </AnimatedPressable>
  )
}

const styles = StyleSheet.create({
  grid: {
    gap: 12,
  },
  gridDisabled: {
    opacity: 0.45,
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
  // Dígito inerte por "código completo" (misma atenuación que el lockout).
  keyDimmed: {
    opacity: 0.45,
  },
  digitText: {
    fontSize: 24,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    textAlign: 'center',
  },
})
