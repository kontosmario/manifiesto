import { useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { useAppTheme } from '@/theme/theme-provider'

interface CodeInputProps {
  value: string
  onChangeText: (value: string) => void
  /** Cantidad de dígitos (casilleros). Default 6. */
  length?: number
  autoFocus?: boolean
  disabled?: boolean
  /** Se dispara cuando se completan los `length` dígitos. */
  onComplete?: (value: string) => void
}

/**
 * Input de código segmentado (un casillero por dígito) — el clásico de los
 * códigos de verificación. Patrón: un `Pressable` que enfoca un `TextInput`
 * real (fuera de pantalla, no como overlay opaco) — tap en cualquier casillero
 * = foco + teclado. Evita el bug del overlay `opacity:0` que no recibe taps.
 * Solo dígitos, autofill de OTP (`oneTimeCode`).
 */
export function CodeInput({
  value,
  onChangeText,
  length = 6,
  autoFocus,
  disabled,
  onComplete,
}: CodeInputProps) {
  const { theme } = useAppTheme()
  const inputRef = useRef<TextInput>(null)
  const [focused, setFocused] = useState(false)

  const handleChange = (raw: string) => {
    const digits = raw.replace(/\D/gu, '').slice(0, length)
    onChangeText(digits)
    if (digits.length === length) {
      onComplete?.(digits)
    }
  }

  const cells = Array.from({ length }, (_, i) => value[i] ?? '')
  // El casillero "activo" es el próximo a llenar (o el último cuando está full).
  const activeIndex = Math.min(value.length, length - 1)
  const surface = theme.isDark ? theme.colors.surfaceMuted : theme.colors.creamCard

  return (
    <Pressable
      accessibilityLabel={`Código de ${length} dígitos`}
      accessibilityRole="button"
      disabled={disabled}
      onPress={() => inputRef.current?.focus()}
      style={styles.row}
    >
      {cells.map((char, i) => {
        const isActive = focused && i === activeIndex && value.length < length
        const filled = char !== ''
        return (
          <View
            key={i}
            pointerEvents="none"
            style={[
              styles.cell,
              {
                backgroundColor: isActive ? theme.colors.primarySurface : surface,
                borderColor: isActive
                  ? theme.colors.primary
                  : filled
                    ? theme.colors.textSoft
                    : theme.colors.line,
                borderWidth: isActive ? 2 : StyleSheet.hairlineWidth + 1,
              },
            ]}
          >
            <Text style={[styles.cellText, { color: theme.colors.text }]}>{char}</Text>
          </View>
        )
      })}
      {/* Input real, fuera de pantalla. El foco se dispara desde el Pressable;
          el teclado + el autofill funcionan sin importar su posición. */}
      <TextInput
        ref={inputRef}
        accessible={false}
        autoComplete="one-time-code"
        autoFocus={autoFocus}
        caretHidden
        editable={!disabled}
        keyboardType="number-pad"
        maxLength={length}
        onBlur={() => setFocused(false)}
        onChangeText={handleChange}
        onFocus={() => setFocused(true)}
        style={styles.hiddenInput}
        textContentType="oneTimeCode"
        value={value}
      />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  cell: {
    flex: 1,
    height: 58,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellText: {
    fontSize: 24,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  // Fuera de pantalla pero montado + enfocable. 1×1 para no afectar el layout.
  hiddenInput: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 1,
    height: 1,
    opacity: 0,
  },
})
