import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { InAppNumpad } from '@/components/ui/in-app-numpad'
import { triggerHaptic } from '@/lib/haptics'
import { useAppTheme } from '@/theme/theme-provider'

interface CodeInputProps {
  value: string
  onChangeText: (value: string) => void
  /** Cantidad de dígitos (casilleros). Default 6 (largo del OTP de Supabase). */
  length?: number
  disabled?: boolean
  /** Se dispara cuando se completan los `length` dígitos. */
  onComplete?: (value: string) => void
}

/**
 * Input de código segmentado (un casillero por dígito). El display son los
 * casilleros; el ingreso usa el numpad propio de la app (`InAppNumpad`, el
 * mismo de agregar gastos) en modo `integerOnly`. Tap = abre el numpad;
 * long-press = pega desde el portapapeles. Auto-submit al completar.
 */
export function CodeInput({
  value,
  onChangeText,
  length = 6,
  disabled,
  onComplete,
}: CodeInputProps) {
  const { theme } = useAppTheme()
  const [numpadVisible, setNumpadVisible] = useState(false)

  const handleChange = (next: string) => {
    const digits = next.replace(/\D/gu, '').slice(0, length)
    onChangeText(digits)
    if (digits.length === length) {
      setNumpadVisible(false)
      onComplete?.(digits)
    }
  }

  // Long-press = pegar. Extrae los dígitos del portapapeles (sirve aunque hayas
  // copiado "Tu código: 123456" entero).
  const handlePaste = async () => {
    const text = await Clipboard.getStringAsync()
    const digits = text.replace(/\D/gu, '').slice(0, length)
    if (!digits) return
    void triggerHaptic('light')
    handleChange(digits)
  }

  const cells = Array.from({ length }, (_, i) => value[i] ?? '')
  // El casillero "activo" es el próximo a llenar (resaltado solo con el numpad abierto).
  const activeIndex = Math.min(value.length, length - 1)
  const surface = theme.isDark ? theme.colors.surfaceMuted : theme.colors.creamCard

  return (
    <View>
      <Pressable
        accessibilityHint="Tocá para abrir el teclado, mantené apretado para pegar"
        accessibilityLabel={`Código de ${length} dígitos`}
        accessibilityRole="button"
        disabled={disabled}
        onLongPress={() => void handlePaste()}
        onPress={() => setNumpadVisible(true)}
        style={styles.row}
      >
        {cells.map((char, i) => {
          const isActive = numpadVisible && i === activeIndex && value.length < length
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
      </Pressable>

      <InAppNumpad
        visible={numpadVisible}
        rawValue={value}
        onChangeRawValue={handleChange}
        onDismiss={() => setNumpadVisible(false)}
        integerOnly
        maxIntegerDigits={length}
        doneLabel="Listo"
      />
    </View>
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
})
