import { useEffect, useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { AppButton } from '@/components/ui/button'
import { ModalCard } from '@/components/ui/modal-card'
import { TextField } from '@/components/ui/text-field'
import { useAppTheme } from '@/theme/theme-provider'
import { currencyFormatter, formatMoneyShort } from '@/utils/money'

interface FixedExpenseQuickEditSheetProps {
  visible: boolean
  initialName: string
  initialAmount: number
  isSaving: boolean
  onClose: () => void
  onSubmit: (input: { name: string; amount: number }) => void
  inline?: boolean
}

export function FixedExpenseQuickEditSheet({
  visible,
  initialName,
  initialAmount,
  isSaving,
  onClose,
  onSubmit,
  inline,
}: FixedExpenseQuickEditSheetProps) {
  const { theme } = useAppTheme()
  const [name, setName] = useState(initialName)
  const [amountText, setAmountText] = useState(
    String(Math.max(0, Math.round(initialAmount))),
  )

  useEffect(() => {
    if (!visible) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate draft fields when sheet opens
    setName(initialName)
    setAmountText(String(Math.max(0, Math.round(initialAmount))))
  }, [visible, initialName, initialAmount])

  const trimmedName = name.trim()
  const parsedAmount = useMemo(() => {
    const digits = amountText.replace(/[^\d]/g, '')
    return digits === '' ? 0 : parseInt(digits, 10)
  }, [amountText])

  const isValid = trimmedName.length > 0 && parsedAmount > 0
  const delta = parsedAmount - Math.round(initialAmount)
  const deltaHint =
    parsedAmount > 0 && delta !== 0
      ? delta < 0
        ? `Bajas ${formatMoneyShort(Math.abs(delta))} respecto del último monto.`
        : `Subes ${formatMoneyShort(delta)} respecto del último monto.`
      : 'Si lo dejas igual no se registra ningún cambio.'

  return (
    <ModalCard
      visible={visible}
      onClose={onClose}
      inline={inline}
      title="Ajustar gasto fijo"
      subtitle="Cambia el nombre o el monto. El resto de la configuración (frecuencia, día de pago, categoría) se mantiene."
    >
      <View style={styles.body}>
        <View
          style={[
            styles.snapshotCard,
            {
              backgroundColor: theme.colors.surfaceMuted,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <Text style={[styles.snapshotEyebrow, { color: theme.colors.textMuted }]}>
            ÚLTIMO MONTO
          </Text>
          <Text style={[styles.snapshotValue, { color: theme.colors.text }]}>
            {currencyFormatter.format(initialAmount)}
          </Text>
        </View>

        <TextField
          label="Nombre"
          value={name}
          onChangeText={setName}
          placeholder="Edenor, Netflix…"
          accessibilityLabel="Nombre del gasto fijo"
          maxLength={60}
        />

        <TextField
          label="Monto mensual"
          value={amountText}
          onChangeText={setAmountText}
          keyboardType="number-pad"
          inputMode="numeric"
          placeholder="0"
          accessibilityLabel="Monto del gasto fijo"
          helper={deltaHint}
        />

        <AppButton
          variant="primary"
          label="Guardar cambios"
          loading={isSaving}
          disabled={!isValid}
          onPress={() => {
            if (!isValid) return
            onSubmit({ name: trimmedName, amount: parsedAmount })
          }}
        />
      </View>
    </ModalCard>
  )
}

const styles = StyleSheet.create({
  body: {
    gap: 14,
  },
  snapshotCard: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: 'flex-start',
  },
  snapshotEyebrow: {
    fontSize: 10,
    letterSpacing: 1.4,
    fontWeight: '800',
    marginBottom: 4,
  },
  snapshotValue: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
})
