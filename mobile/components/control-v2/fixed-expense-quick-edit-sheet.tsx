import { useEffect, useMemo, useState } from 'react'
import { StyleSheet } from 'react-native'
import { Text } from '@/components/ui/app-text'
import { useTranslation } from 'react-i18next'
import { ModalCard } from '@/components/ui/modal-card'
import { NeoButton } from '@/components/ui/neo-button'
import { NeoSurface } from '@/components/ui/neo-surface'
import { NeoField } from '@/components/control-v2/neo-field'
import { SUPPORTS_INSET_SHADOW } from '@/components/wizard/inset-shadow-support'
import { neoRadii, neoTokens } from '@/theme/neo-tokens'
import { nunitoFamily } from '@/theme/typography'
import { useThemeTokens } from '@/theme/theme-provider'
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

/**
 * Rediseño 2026-07: la carcasa la pinta `ModalCard skin="neo"` (hoja
 * `neo.sheet`, esquinas 34, sombra hacia arriba, píldora 44×5 y scrim del
 * tema — en las DOS ramas de render, `inline` y `<Modal>` nativo). Este
 * archivo sólo aporta el CONTENIDO.
 */
export function FixedExpenseQuickEditSheet({
  visible,
  initialName,
  initialAmount,
  isSaving,
  onClose,
  onSubmit,
  inline,
}: FixedExpenseQuickEditSheetProps) {
  const theme = useThemeTokens()
  const neo = neoTokens(theme.mode)
  const { t } = useTranslation()
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
        ? t('control:fixedEdit.deltaBaja', {
            amount: formatMoneyShort(Math.abs(delta)),
          })
        : t('control:fixedEdit.deltaSube', { amount: formatMoneyShort(delta) })
      : t('control:fixedEdit.deltaIgual')
  // El delta es semántico: bajar un fijo es la dirección buena del sistema
  // (verde), subirlo es la alerta (terracota). "Igual" no dice nada → neutro.
  const deltaTone =
    parsedAmount > 0 && delta !== 0
      ? delta < 0
        ? ('positive' as const)
        : ('warn' as const)
      : ('muted' as const)

  // Android < API 29 descarta el boxShadow inset EN SILENCIO y el pozo
  // (`neo.well` sobre `neo.sheet`, ~4% de delta en claro) desaparece.
  const flatFallback = SUPPORTS_INSET_SHADOW
    ? null
    : { borderWidth: 1, borderColor: neo.sheetDivider }

  return (
    <ModalCard
      visible={visible}
      onClose={onClose}
      inline={inline}
      skin="neo"
      title={t('control:fixedEdit.title')}
      subtitle={t('control:fixedEdit.subtitle')}
    >
      {/* El display del último monto es un POZO, no una card elevada: es
          lectura, no acción. */}
      <NeoSurface
        variant="insetLg"
        radius={neoRadii.card}
        backgroundColor={neo.well}
        style={[styles.snapshotCard, flatFallback]}
      >
        <Text style={[styles.snapshotEyebrow, { color: neo.textMuted }]}>
          {t('control:fixedEdit.ultimoMonto')}
        </Text>
        <Text style={[styles.snapshotValue, { color: neo.text }]}>
          {currencyFormatter.format(initialAmount)}
        </Text>
      </NeoSurface>

      <NeoField
        label={t('control:fixedEdit.labelNombre')}
        value={name}
        onChangeText={setName}
        placeholder={t('control:fixedEdit.placeholderNombre')}
        accessibilityLabel={t('control:fixedEdit.a11yNombre')}
        maxLength={60}
      />

      <NeoField
        label={t('control:fixedEdit.labelMonto')}
        depth="insetLg"
        value={amountText}
        onChangeText={setAmountText}
        keyboardType="number-pad"
        inputMode="numeric"
        placeholder={t('control:fixedEdit.placeholderMonto')}
        accessibilityLabel={t('control:fixedEdit.a11yMonto')}
        helper={deltaHint}
        helperTone={deltaTone}
      />

      <NeoButton
        variant="primary"
        block
        label={t('control:fixedEdit.cta')}
        busy={isSaving}
        disabled={!isValid}
        onPress={() => {
          if (!isValid) return
          onSubmit({ name: trimmedName, amount: parsedAmount })
        }}
      />
    </ModalCard>
  )
}

const styles = StyleSheet.create({
  snapshotCard: {
    // El radio lo pone `NeoSurface` (neoRadii.card). Sin borde: la
    // profundidad la da `shadows.insetLg`.
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: 'flex-start',
  },
  snapshotEyebrow: {
    fontSize: 11,
    letterSpacing: 1.76,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    marginBottom: 4,
  },
  snapshotValue: {
    fontSize: 22,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    letterSpacing: -0.4,
  },
})
