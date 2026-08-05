import { useEffect, useMemo, useState } from 'react'
import { StyleSheet, Text } from 'react-native'
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
import { goalEmojiText } from '@/features/savings-goals/goal-icon'

interface SavingsGoalQuickEditSheetProps {
  visible: boolean
  goalTitle: string
  goalEmoji: string
  initialGoalAmount: number
  initialTargetMonths: number | null
  currentAmount: number
  isSaving: boolean
  onClose: () => void
  onSubmit: (input: { goalAmount: number; targetMonths: number | null }) => void
  inline?: boolean
}

const MAX_MONTHS = 240

/**
 * Rediseño 2026-07: la carcasa la pinta `ModalCard skin="neo"` (hoja
 * `neo.sheet`, esquinas 34, sombra hacia arriba, píldora 44×5 y scrim del
 * tema — en las DOS ramas de render, `inline` y `<Modal>` nativo). Este
 * archivo sólo aporta el CONTENIDO. Gemelo estructural de
 * `fixed-expense-quick-edit-sheet`: mismo pozo de snapshot, mismos campos.
 */
export function SavingsGoalQuickEditSheet({
  visible,
  goalTitle,
  goalEmoji,
  initialGoalAmount,
  initialTargetMonths,
  currentAmount,
  isSaving,
  onClose,
  onSubmit,
  inline,
}: SavingsGoalQuickEditSheetProps) {
  const theme = useThemeTokens()
  const neo = neoTokens(theme.mode)
  const { t } = useTranslation()
  const [goalAmountText, setGoalAmountText] = useState(
    String(Math.max(0, Math.round(initialGoalAmount))),
  )
  const [monthsText, setMonthsText] = useState(
    initialTargetMonths != null ? String(initialTargetMonths) : '',
  )

  useEffect(() => {
    if (!visible) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate draft fields when sheet opens
    setGoalAmountText(String(Math.max(0, Math.round(initialGoalAmount))))
    setMonthsText(initialTargetMonths != null ? String(initialTargetMonths) : '')
  }, [visible, initialGoalAmount, initialTargetMonths])

  const parsedAmount = useMemo(() => {
    const digits = goalAmountText.replace(/[^\d]/g, '')
    return digits === '' ? 0 : parseInt(digits, 10)
  }, [goalAmountText])

  const parsedMonths = useMemo(() => {
    const digits = monthsText.replace(/[^\d]/g, '')
    if (digits === '') return null
    const value = parseInt(digits, 10)
    if (!Number.isFinite(value) || value <= 0) return null
    return Math.min(MAX_MONTHS, value)
  }, [monthsText])

  const isValid = parsedAmount > 0 && parsedAmount >= currentAmount
  const exceedsCurrent = parsedAmount > 0 && parsedAmount < currentAmount
  const monthlyHint =
    parsedMonths != null && parsedAmount > currentAmount
      ? t('control:goalEdit.monthlyHint', {
          count: parsedMonths,
          amount: formatMoneyShort(
            Math.ceil((parsedAmount - currentAmount) / parsedMonths),
          ),
        })
      : t('control:goalEdit.monthlyHintEmpty')

  // Android < API 29 descarta el boxShadow inset EN SILENCIO y el pozo
  // (`neo.well` sobre `neo.sheet`, ~4% de delta en claro) desaparece.
  const flatFallback = SUPPORTS_INSET_SHADOW
    ? null
    : { borderWidth: 1, borderColor: theme.colors.border }

  return (
    <ModalCard
      visible={visible}
      onClose={onClose}
      inline={inline}
      skin="neo"
      title={t('control:goalEdit.title', { emoji: goalEmojiText(goalEmoji), title: goalTitle }).replace(/\s{2,}/g, ' ').trim()}
      subtitle={t('control:goalEdit.subtitle')}
    >
      {/* El avance ya ahorrado es lectura, no acción: pozo, no card. */}
      <NeoSurface
        variant="insetLg"
        radius={neoRadii.card}
        backgroundColor={neo.well}
        style={[styles.snapshotCard, flatFallback]}
      >
        <Text style={[styles.snapshotEyebrow, { color: neo.textMuted }]}>
          {t('control:goalEdit.yaAhorrado')}
        </Text>
        <Text style={[styles.snapshotValue, { color: neo.text }]}>
          {currencyFormatter.format(currentAmount)}
        </Text>
      </NeoSurface>

      <NeoField
        label={t('control:goalEdit.labelMonto')}
        depth="insetLg"
        value={goalAmountText}
        onChangeText={setGoalAmountText}
        keyboardType="number-pad"
        inputMode="numeric"
        placeholder={t('control:goalEdit.placeholderMonto')}
        accessibilityLabel={t('control:goalEdit.a11yMonto')}
        helper={
          exceedsCurrent
            ? t('control:goalEdit.exceedsCurrent', {
                amount: formatMoneyShort(currentAmount),
              })
            : undefined
        }
        // `exceedsCurrent` es un estado de ERROR real (bloquea el CTA), no una
        // pista: sale con la tinta de error del sistema.
        helperTone="danger"
      />

      <NeoField
        label={t('control:goalEdit.labelPlazo')}
        value={monthsText}
        onChangeText={setMonthsText}
        keyboardType="number-pad"
        inputMode="numeric"
        placeholder={t('control:goalEdit.placeholderPlazo')}
        accessibilityLabel={t('control:goalEdit.a11yPlazo')}
        helper={monthlyHint}
      />

      <NeoButton
        variant="primary"
        block
        label={t('control:goalEdit.cta')}
        busy={isSaving}
        disabled={!isValid}
        onPress={() => {
          if (!isValid) return
          onSubmit({ goalAmount: parsedAmount, targetMonths: parsedMonths })
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
