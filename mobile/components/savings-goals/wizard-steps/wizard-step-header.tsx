import { Pressable, StyleSheet, Text, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { SUPPORTS_INSET_SHADOW } from '@/components/wizard/inset-shadow-support'
import { neoInk } from '@/theme/neo-ink'
import { neoTokens } from '@/theme/neo-tokens'
import { nunitoFamily } from '@/theme/typography'
import { useThemeTokens } from '@/theme/theme-provider'

export interface WizardStepHeaderProps {
  step: number
  stepCount: number
  eyebrow: string
  title: string
  busy: boolean
  onGoBack: () => void
}

/**
 * Header del wizard: control de volver + bloque (eyebrow + título) en una
 * sola fila. En step 1 el control se reemplaza por un tile decorativo del
 * mismo tamaño para preservar el rhythm visual.
 *
 * Los dos slots usan el par del vocabulario: volver es un POZO (`well` +
 * `insetSm`) porque es un control que se hunde al tocarlo, y el tile del
 * primer paso es `raisedSm` — extruido, no accionable. Donde el sistema
 * descarta el `boxShadow` inset (`SUPPORTS_INSET_SHADOW`) el pozo pierde
 * su único límite, así que ahí cae a un hairline.
 */
export function WizardStepHeader({
  step,
  stepCount,
  eyebrow,
  title,
  busy,
  onGoBack,
}: WizardStepHeaderProps) {
  const theme = useThemeTokens()
  const neo = neoTokens(theme.mode)
  const ink = neoInk(theme.mode)
  const { t } = useTranslation()
  return (
    <View style={styles.row}>
      {step > 1 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('settings:savingsWizard.backA11y', { prev: step - 1, total: stepCount })}
          onPress={onGoBack}
          disabled={busy}
          hitSlop={10}
          style={({ pressed }) => [
            styles.slot,
            {
              backgroundColor: neo.well,
              boxShadow: neo.shadows.insetSm,
              borderWidth: SUPPORTS_INSET_SHADOW ? 0 : 1,
              borderColor: neo.sheetDivider,
              opacity: busy ? 0.4 : pressed ? 0.7 : 1,
            },
          ]}
        >
          <MaterialIcons name="chevron-left" size={22} color={neo.text} />
        </Pressable>
      ) : (
        <View
          style={[
            styles.slot,
            { backgroundColor: neo.surface, boxShadow: neo.shadows.raisedSm },
          ]}
          accessibilityRole="image"
          accessibilityLabel={t('settings:savingsWizard.createGoalA11yImage')}
        >
          <MaterialIcons name="flag" size={20} color={ink.accent} />
        </View>
      )}

      <View style={styles.textCol}>
        <Text style={[styles.eyebrow, { color: neo.textMuted }]}>{eyebrow}</Text>
        <Text style={[styles.title, { color: neo.text }]}>{title}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    marginTop: 8,
    marginBottom: 14,
  },
  slot: {
    width: 40,
    height: 40,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: {
    flex: 1,
    gap: 4,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    letterSpacing: -0.6,
  },
})
