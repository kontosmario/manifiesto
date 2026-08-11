// Píldora "REGISTRANDO PARA <día>" del alta de gasto.
//
// Vive a nivel del ORQUESTADOR, no adentro de un paso: si el usuario está
// cargando un gasto de ayer, esa condición no puede desaparecer al pasar al
// resumen —es justo donde confirma— así que la píldora acompaña los dos pasos.
// Sólo se monta cuando la fecha destino NO es hoy: en el caso normal no hay
// nada que aclarar.
import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useWizardSkin } from '@/components/wizard/wizard-skin'
import { useAppTheme } from '@/theme/theme-provider'
import { formatForDateLabel } from './for-date-label'
import { nunitoFamily } from '@/theme/typography'

export function BackdatePill({ date }: { date: Date }) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  const skin = useWizardSkin()
  const neo = skin.kind === 'neo' ? skin : null
  const label = formatForDateLabel(date)
  return (
    <View
      // `accessible` es LOAD-BEARING: una `View` no es elemento de
      // accesibilidad salvo que se lo pidas, así que sin él iOS nunca enfoca
      // el contenedor —enfoca el `<Text>` hijo— y la label de abajo no se lee
      // nunca. Lo que se anunciaba era el texto decorativo en MAYÚSCULAS con
      // letterSpacing ("REGISTRANDO PARA MARTES 12 AGO"), que VoiceOver tiende
      // a deletrear: la condición más importante del alta —que el gasto NO va
      // a hoy— quedaba sin canal claro para el lector en los dos pasos.
      accessible
      accessibilityRole="text"
      accessibilityLabel={t('gastos:addExpense.wizard.step1.backdatePillA11y', {
        date: label,
      })}
      style={[
        styles.pill,
        { backgroundColor: theme.colors.creamSoft, borderColor: theme.colors.line },
        // Mismo material que las cards del paso 2 (escalón chico de
        // profundidad): es un aviso apoyado sobre el fondo, no un campo donde
        // se escribe — por eso NO va como pozo.
        neo
          ? {
              borderWidth: 0,
              backgroundColor: neo.add.step2Card.background,
              experimental_backgroundImage: neo.add.step2Card.gradientCss,
              boxShadow: neo.add.step2Card.shadow,
            }
          : null,
      ]}
    >
      <Text
        style={[
          styles.text,
          { color: theme.colors.textMuted },
          neo
            ? {
                // La variante de TEXTO del clay, no el `accentClay` de bordes
                // y fills: a 10.5px sobre la superficie de la card
                // (`step2Card.background` == `#E9EBE0` en claro) aquel se
                // queda en 3.60:1, abajo de AA. Y esto no es decoración: es la
                // condición más importante del alta —que el gasto NO va a
                // hoy— y acompaña los DOS pasos. En oscuro `accentClayInk` es
                // el mismo color, así que el tema oscuro no se mueve. Mismo
                // criterio que los chips rápidos del alta de ingreso.
                color: neo.add.accentClayInk,
                fontFamily: neo.font('800'),
              }
            : null,
        ]}
        numberOfLines={1}
      >
        {t('gastos:addExpense.wizard.step1.backdatePill', { date: label })}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
  },
  text: {
    fontSize: 10.5,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
})
