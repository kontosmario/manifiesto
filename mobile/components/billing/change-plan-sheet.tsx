import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, Text, View } from 'react-native'
import { ModalCard } from '@/components/ui/modal-card'
import { AppButton } from '@/components/ui/button'
import { PlanTiles } from '@/components/billing/plan-tiles'
import { type BillingPlanId } from '@/features/billing/billing-plans'
import { useAppTheme } from '@/theme/theme-provider'

/**
 * Selector de plan para "Cambiar de plan" (Estado B). Reemplaza el toggle
 * binario: el usuario elige el plan destino, lo que permite también
 * **cancelar un downgrade pendiente** volviendo a elegir el plan al que renueva.
 *
 * Controlado: el `selected` lo maneja el host (billing-screen), que lo
 * inicializa al `scheduledPlanId` al abrir. Confirmar solo tiene efecto si
 * eliges algo distinto a lo que ya va a renovar.
 */
export interface ChangePlanSheetProps {
  visible: boolean
  selected: BillingPlanId
  onSelect: (id: BillingPlanId) => void
  /** Plan al que renovaría hoy (pending si hay, si no el actual). */
  scheduledPlanId: BillingPlanId
  isPurchasing: boolean
  onConfirm: (planId: BillingPlanId) => void
  onClose: () => void
}

export const ChangePlanSheet = memo(function ChangePlanSheet({
  visible,
  selected,
  onSelect,
  scheduledPlanId,
  isPurchasing,
  onConfirm,
  onClose,
}: ChangePlanSheetProps) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  const noChange = selected === scheduledPlanId

  const footer = (
    <AppButton
      label={t('billing:changePlan.confirm')}
      variant="primary"
      fullWidth
      lookDisabled={noChange}
      disabled={isPurchasing}
      loading={isPurchasing}
      onPress={() => {
        if (!noChange) onConfirm(selected)
      }}
    />
  )

  return (
    <ModalCard
      visible={visible}
      title={t('billing:changePlan.title')}
      subtitle={t('billing:changePlan.subtitle')}
      onClose={onClose}
      footer={footer}
    >
      <View style={styles.body}>
        <PlanTiles selected={selected} onSelect={onSelect} />
        {noChange ? (
          <Text
            style={[
              theme.typography.caption,
              styles.hint,
              { color: theme.colors.textMuted },
            ]}
          >
            {t('billing:changePlan.noChangeHint')}
          </Text>
        ) : null}
      </View>
    </ModalCard>
  )
})

const styles = StyleSheet.create({
  body: { gap: 10, paddingBottom: 4 },
  hint: { textAlign: 'center' },
})
