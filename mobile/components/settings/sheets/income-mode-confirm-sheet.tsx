import { StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui/app-text'
import { useTranslation } from 'react-i18next'
import { MaterialIcons } from '@expo/vector-icons'
import type { ComponentProps } from 'react'
import { ModalCard } from '@/components/ui/modal-card'
import { NeoButton } from '@/components/ui/neo-button'
import { SUPPORTS_INSET_SHADOW } from '@/components/wizard/inset-shadow-support'
import { useAppTheme } from '@/theme/theme-provider'
import { neoInk } from '@/theme/neo-ink'
import { neoRadii, neoTokens } from '@/theme/neo-tokens'
import { nunitoFamily } from '@/theme/typography'

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
            { backgroundColor: neo.well, boxShadow: neo.shadows.insetSm },
            // Android < API 29 descarta el boxShadow INSET en silencio: sin él
            // el pozo queda del material de la hoja y el bloque desaparece.
            SUPPORTS_INSET_SHADOW ? null : { borderWidth: 1, borderColor: neo.sheetDivider },
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
        <NeoButton
          block
          haptic="light"
          label={t('settings:household.incomeModeConfirmCta')}
          loading={isSaving}
          onPress={onConfirm}
        />
        <NeoButton
          block
          haptic="none"
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
    borderRadius: neoRadii.tile,
    padding: 14,
    gap: 12,
  },
  effectRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  effectIcon: { marginTop: 1 },
  effectText: { flex: 1, fontSize: 13, fontFamily: nunitoFamily('400'), lineHeight: 19 },
})
