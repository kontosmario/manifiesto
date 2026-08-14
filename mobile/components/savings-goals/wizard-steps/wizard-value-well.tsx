import { Pressable, StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui/app-text'
import { useTranslation } from 'react-i18next'
import { useWizardSkin } from '@/components/wizard/wizard-skin'
import { SUPPORTS_INSET_SHADOW } from '@/components/wizard/inset-shadow-support'
import { withAlpha } from '@/theme/color-utils'
import { neoRadii, neoTokens } from '@/theme/neo-tokens'
import { nunitoFamily } from '@/theme/typography'
import { useThemeTokens } from '@/theme/theme-provider'

export interface WizardValueWellProps {
  /** Eyebrow del campo. Va AFUERA del pozo, como el resto del kit. */
  label: string
  /** Valor ya formateado (monto o plazo). */
  value: string
  /** Sin dato todavía: la cifra baja a la tinta apagada. */
  placeholder?: boolean
  /** El numpad está abierto → se oculta el hint de "editar". */
  expanded?: boolean
  onPress: () => void
  accessibilityLabel: string
}

/**
 * Pozo de valor de los pasos del wizard de meta: eyebrow afuera, cifra en
 * 900 con tracking negativo adentro y el hint de edición alineado por
 * baseline con el número.
 *
 * Es la MISMA receta que la card de monto del alta de gasto y de ingreso:
 * los tokens salen de la piel del wizard (`add.well`, `add.sectionLabel`,
 * `ink.title`), así que los tres flujos dibujan el mismo pozo. Vive acá y
 * no en el kit porque el paso del plazo muestra "12 meses", no plata, y
 * `AmountCard` formatea moneda.
 *
 * La tinta del hint es el escalón apagado FUERTE (`mutedInkStrong`): el
 * `faintInk` que usa la card de monto da 2.32:1 sobre el pozo claro y acá
 * el hint es la única pista de que el bloque se toca.
 */
export function WizardValueWell({
  label,
  value,
  placeholder = false,
  expanded = false,
  onPress,
  accessibilityLabel,
}: WizardValueWellProps) {
  const theme = useThemeTokens()
  const neo = neoTokens(theme.mode)
  const skin = useWizardSkin()
  const wizard = skin.kind === 'neo' ? skin : null
  const { t } = useTranslation()

  const wellBackground = wizard?.add.well.background ?? neo.well
  const wellShadow = wizard?.add.well.shadow ?? neo.shadows.insetLg
  const wellRadius = wizard?.add.well.radius ?? neoRadii.input
  const titleInk = wizard?.ink.title ?? neo.text
  const mutedInk = wizard?.mutedInkStrong ?? neo.textMuted
  const labelInk = wizard?.add.sectionLabelInk ?? neo.textMuted

  return (
    <View>
      <Text style={[styles.eyebrow, { color: labelInk }]}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ expanded }}
        onPress={() => {
          if (!expanded) onPress()
        }}
        style={({ pressed }) => [
          styles.well,
          {
            backgroundColor: wellBackground,
            borderRadius: wellRadius,
            boxShadow: wellShadow,
            // El pozo se dibuja SOLO con sombra inset. Donde el sistema la
            // descarta queda un rectángulo casi del color del fondo y el
            // campo desaparece: ahí, y sólo ahí, hairline.
            borderWidth: SUPPORTS_INSET_SHADOW ? 0 : 1,
            borderColor: withAlpha(mutedInk, 0.4),
            opacity: pressed && !expanded ? 0.96 : 1,
          },
        ]}
      >
        <View style={styles.valueRow}>
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            allowFontScaling
            maxFontSizeMultiplier={1.2}
            style={[styles.value, { color: placeholder ? mutedInk : titleInk }]}
          >
            {value}
          </Text>
          {!expanded ? (
            <Text style={[styles.hint, { color: mutedInk }]}>
              {t('common:actions.edit')}
            </Text>
          ) : null}
        </View>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: 1.98,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  well: {
    paddingHorizontal: 17,
    paddingVertical: 14,
  },
  // Alineados por BASELINE: la cifra es 32px y el hint 11, y centrarlos
  // deja el hint flotando a media altura del número.
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 10,
  },
  value: {
    flexShrink: 1,
    fontSize: 32,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    letterSpacing: -0.64,
  },
  hint: {
    fontSize: 11,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
  },
})
