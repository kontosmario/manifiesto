import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, Text, View } from 'react-native'
import { ModalCard } from '@/components/ui/modal-card'
import { NeoButton } from '@/components/ui/neo-button'
import { PlanTiles } from '@/components/billing/plan-tiles'
import { type BillingPlanId } from '@/features/billing/billing-plans'
import { neoTokens } from '@/theme/neo-tokens'
import { nunitoFamily } from '@/theme/typography'
import { useThemeTokens } from '@/theme/theme-provider'

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
  const neo = neoTokens(useThemeTokens().mode)
  const { t } = useTranslation()
  const noChange = selected === scheduledPlanId

  const footer = (
    <NeoButton
      disabled={isPurchasing}
      fullWidth
      label={t('billing:changePlan.confirm')}
      loading={isPurchasing}
      lookDisabled={noChange}
      onPress={() => {
        if (!noChange) onConfirm(selected)
      }}
      variant="primary"
    />
  )

  return (
    <ModalCard
      footer={footer}
      onClose={onClose}
      skin="neo"
      subtitle={t('billing:changePlan.subtitle')}
      title={t('billing:changePlan.title')}
      visible={visible}
    >
      <View style={styles.body}>
        <PlanTiles onSelect={onSelect} selected={selected} />
        {noChange ? (
          <Text style={[styles.hint, { color: neo.text }]}>
            {t('billing:changePlan.noChangeHint')}
          </Text>
        ) : null}
      </View>
    </ModalCard>
  )
})

const styles = StyleSheet.create({
  body: { gap: 12, paddingBottom: 4 },
  hint: {
    fontSize: 12.5,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    lineHeight: 17,
    textAlign: 'center',
  },
})
