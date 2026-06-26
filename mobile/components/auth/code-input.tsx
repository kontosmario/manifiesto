import { Pressable, StyleSheet, Text, View } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { useTranslation } from 'react-i18next'
import { triggerHaptic } from '@/lib/haptics'
import { useAppTheme } from '@/theme/theme-provider'

interface CodeInputProps {
  value: string
  /** Recibe el valor pegado (long-press). El ingreso por teclas lo maneja el
   *  numpad que monta el screen (para poder scrollear detrás). */
  onChange: (value: string) => void
  /** Cantidad de dígitos (casilleros). Default 6 (largo del OTP de Supabase). */
  length?: number
  disabled?: boolean
  /** Tocar los casilleros abre el numpad (montado por el screen). */
  onPressCells: () => void
  /** Resalta el casillero activo (cuando el numpad está abierto). */
  active?: boolean
}

/**
 * Display segmentado del código (un casillero por dígito). NO monta el numpad:
 * el screen lo monta a nivel raíz (InAppNumpad embedded) para permitir scroll
 * por detrás. Tap = abre el numpad (onPressCells); long-press = pega.
 */
export function CodeInput({
  value,
  onChange,
  length = 6,
  disabled,
  onPressCells,
  active,
}: CodeInputProps) {
  const { t } = useTranslation()
  const { theme } = useAppTheme()

  // Long-press = pegar. Extrae los dígitos del portapapeles (sirve aunque hayas
  // copiado "Tu código: 123456" entero).
  const handlePaste = async () => {
    const text = await Clipboard.getStringAsync()
    const digits = text.replace(/\D/gu, '').slice(0, length)
    if (!digits) return
    void triggerHaptic('light')
    onChange(digits)
  }

  const cells = Array.from({ length }, (_, i) => value[i] ?? '')
  const activeIndex = Math.min(value.length, length - 1)
  const surface = theme.isDark ? theme.colors.surfaceMuted : theme.colors.creamCard

  return (
    <Pressable
      accessibilityHint={t('auth:codeInput.hint')}
      accessibilityLabel={t('auth:codeInput.label', { count: length })}
      accessibilityRole="button"
      disabled={disabled}
      onLongPress={() => void handlePaste()}
      onPress={onPressCells}
      style={styles.row}
    >
      {cells.map((char, i) => {
        const isActive = active && i === activeIndex && value.length < length
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
