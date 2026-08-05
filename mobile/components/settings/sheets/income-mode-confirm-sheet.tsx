import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { MaterialIcons } from '@expo/vector-icons'
import type { ComponentProps } from 'react'
import { AppButton } from '@/components/ui/button'
import { ModalCard } from '@/components/ui/modal-card'
import { useAppTheme } from '@/theme/theme-provider'
import { neoInk } from '@/theme/neo-ink'
import { neoTokens } from '@/theme/neo-tokens'

type IconName = ComponentProps<typeof MaterialIcons>['name']

interface IncomeModeConfirmSheetProps {
  visible: boolean
  /** Modo al que se cambiaría si el usuario confirma. */
  nextMode: 'fixed' | 'dynamic'
  isSaving: boolean
  onConfirm: () => void
  onClose: () => void
}

// Efectos concretos del cambio, uno por fila — el Alert nativo solo
// mostraba un párrafo; acá el usuario ve QUÉ cambia antes de confirmar.
const EFFECTS: Record<'fixed' | 'dynamic', ReadonlyArray<{ icon: IconName; key: string }>> = {
  dynamic: [
    { icon: 'bolt', key: 'toDynamicBudget' },
    { icon: 'savings', key: 'toDynamicSavings' },
    { icon: 'event-repeat', key: 'toDynamicCycle' },
  ],
  fixed: [
    { icon: 'payments', key: 'toFixedSalary' },
    { icon: 'event', key: 'toFixedPayday' },
    { icon: 'savings', key: 'toFixedSavings' },
  ],
}

/**
 * Confirmación del switch de régimen de ingreso (fijo ↔ variable).
 *
 * Reemplaza al `Alert.alert` nativo: mismo patrón ModalCard que los
 * demás sheets de Settings (EditCycleConfigSheet y familia), con los
 * efectos del cambio como filas explícitas y CTA inline. El switch de
 * la fila NO es optimista — sigue atado al valor persistido, así que
 * cerrar/cancelar lo deja donde estaba sin trabajo extra.
 */
export function IncomeModeConfirmSheet({
  visible,
  nextMode,
  isSaving,
  onConfirm,
  onClose,
}: IncomeModeConfirmSheetProps) {
  const { t } = useTranslation()
  const { theme } = useAppTheme()
  const neo = neoTokens(theme.isDark ? 'dark' : 'light')
  const ink = neoInk(theme.isDark ? 'dark' : 'light')

  return (
    <ModalCard
      skin="neo"
      onClose={onClose}
      title={t(`settings:household.incomeModeConfirmTitle_${nextMode}`)}
      subtitle={t(`settings:household.incomeModeConfirmBody_${nextMode}`)}
      visible={visible}
    >
      <View style={styles.stack}>
        <View
          style={[
            styles.effects,
            {
              backgroundColor: neo.well,
              boxShadow: neo.shadows.insetSm,
              borderColor: neo.sheetDivider,
            },
          ]}
        >
          {EFFECTS[nextMode].map(({ icon, key }) => (
            <View key={key} style={styles.effectRow}>
              <MaterialIcons
                name={icon}
                size={18}
                color={ink.accent}
                style={styles.effectIcon}
              />
              <Text style={[styles.effectText, { color: neo.textMuted }]}>
                {t(`settings:household.incomeModeSheet.${key}`)}
              </Text>
            </View>
          ))}
        </View>
        <AppButton
          label={t('settings:household.incomeModeConfirmCta')}
          loading={isSaving}
          onPress={onConfirm}
        />
        <AppButton
          label={t('common:actions.cancel')}
          variant="ghost"
          disabled={isSaving}
          onPress={onClose}
        />
      </View>
    </ModalCard>
  )
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  effects: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  effectRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  effectIcon: { marginTop: 1 },
  effectText: { flex: 1, fontSize: 13, lineHeight: 19 },
})
