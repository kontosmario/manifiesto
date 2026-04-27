import { useEffect, useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { NumericEditSheet } from '@/components/ui/numeric-edit-sheet'
import type { BufferMode } from '@/features/settings/settings-form.model'
import {
  currencyFormatter,
  formatPriceInputValue,
  parsePrice,
  serializePrice,
} from '@/utils/money'
import { triggerHaptic } from '@/lib/haptics'
import { useAppTheme } from '@/theme/theme-provider'
import { radii } from '@/theme/palette'

interface EditBufferSheetProps {
  visible: boolean
  currentMode: BufferMode
  currentValue: number
  isSaving: boolean
  onClose: () => void
  onSave: (nextMode: BufferMode, nextValue: number) => void
}

const MODE_OPTIONS: Array<{ key: BufferMode; label: string; hint: string }> = [
  { key: 'none', label: 'Sin colchón', hint: 'No reservar' },
  { key: 'fixed', label: 'Monto fijo', hint: 'En ARS por día' },
  { key: 'percent', label: 'Porcentaje', hint: '% del presupuesto' },
]

export function EditBufferSheet({
  visible,
  currentMode,
  currentValue,
  isSaving,
  onClose,
  onSave,
}: EditBufferSheetProps) {
  const { theme } = useAppTheme()
  const [mode, setMode] = useState<BufferMode>(currentMode)
  const [draft, setDraft] = useState(() => serializePrice(currentValue))

  useEffect(() => {
    if (visible) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Hydrate draft when sheet opens
      setMode(currentMode)
      setDraft(serializePrice(currentValue))
    }
  }, [visible, currentMode, currentValue])

  const parsed = useMemo(() => {
    if (mode === 'none') return 0
    if (mode === 'percent') {
      const numeric = Number(draft.replace(/[^\d]/g, ''))
      return Number.isFinite(numeric) ? numeric : Number.NaN
    }
    return parsePrice(draft)
  }, [mode, draft])

  const isValid =
    mode === 'none'
      ? true
      : Number.isFinite(parsed) &&
        parsed >= 0 &&
        (mode !== 'percent' || parsed <= 100)

  const hasChanged = mode !== currentMode || (isValid && parsed !== currentValue)
  const canSave = isValid && hasChanged

  const helper = useMemo(() => {
    if (mode === 'none') return 'No se reservará dinero para imprevistos.'
    if (!isValid) {
      return mode === 'percent'
        ? 'Ingresá un porcentaje entre 0 y 100.'
        : 'Ingresá un monto válido.'
    }
    if (mode === 'percent') return `Reservaremos ${parsed}% del presupuesto diario.`
    return `Reservaremos ${currencyFormatter.format(parsed)} por día.`
  }, [mode, isValid, parsed])

  const showError = mode !== 'none' && !isValid && draft.length > 0
  const errorText =
    showError && mode === 'percent'
      ? 'Debe estar entre 0 y 100.'
      : showError
        ? 'Monto inválido.'
        : undefined

  const handleMode = (next: BufferMode) => {
    void triggerHaptic('selection')
    setMode(next)
  }

  return (
    <NumericEditSheet
      visible={visible}
      title="Buffer diario"
      subtitle="Dinero que querés reservar antes de proyectar tu presupuesto variable."
      rawValue={mode === 'none' ? '' : draft}
      onChangeRawValue={setDraft}
      formatDisplay={(raw) => {
        if (mode === 'none') return 'Sin colchón'
        if (mode === 'percent') return raw ? `${raw}%` : ''
        return formatPriceInputValue(raw, false)
      }}
      displayEyebrow={
        mode === 'none'
          ? 'SIN COLCHÓN'
          : mode === 'percent'
            ? '% DIARIO'
            : 'MONTO DIARIO'
      }
      displayPlaceholder={mode === 'percent' ? '0%' : '$ 0'}
      helper={helper}
      errorText={errorText}
      maxIntegerDigits={mode === 'percent' ? 3 : undefined}
      maxDecimalDigits={mode === 'percent' ? 0 : undefined}
      numpadDisabled={mode === 'none'}
      saveLabel="Guardar colchón"
      saveDisabled={!canSave}
      isSaving={isSaving}
      onSave={() => {
        if (!canSave || !isValid) return
        onSave(mode, mode === 'none' ? 0 : parsed)
      }}
      onClose={onClose}
      headerExtra={
        <View style={styles.modeGrid}>
          {MODE_OPTIONS.map((option) => {
            const isOn = option.key === mode
            return (
              <Pressable
                key={option.key}
                accessibilityRole="button"
                accessibilityState={{ selected: isOn }}
                onPress={() => handleMode(option.key)}
                style={[
                  styles.modeCard,
                  {
                    backgroundColor: isOn ? theme.colors.primary : theme.colors.creamCard,
                    borderColor: isOn ? theme.colors.primary : theme.colors.line,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.modeLabel,
                    { color: isOn ? '#FFFFFF' : theme.colors.text },
                  ]}
                >
                  {option.label}
                </Text>
                <Text
                  numberOfLines={1}
                  style={[
                    styles.modeHint,
                    { color: isOn ? '#FFFFFF' : theme.colors.textMuted },
                  ]}
                >
                  {option.hint}
                </Text>
              </Pressable>
            )
          })}
        </View>
      }
    />
  )
}

const styles = StyleSheet.create({
  modeGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  modeCard: {
    flex: 1,
    borderRadius: radii.md,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 2,
  },
  modeLabel: { fontSize: 13, fontWeight: '800' },
  modeHint: { fontSize: 11 },
})
