// Fila auxiliar del footer de los wizards del rediseño: la ÚNICA línea que
// habla debajo del CTA, compartida por las tres cosas que pueden ocuparla.
//
// Vivía duplicada casi byte a byte en el alta de gasto y en la de ingreso
// —misma precedencia, mismos iconos, mismas medidas, mismo `minHeight`—, que
// es la forma exacta en la que dos superficies hermanas se separan en
// silencio: el día que una suma un estado o corrige una tipografía, la otra se
// queda atrás y nadie se entera hasta verlas una al lado de la otra.
//
// Tres constraints que NO son evidentes:
//
//  · La PRECEDENCIA es error → faltantes → eslogan, y no es arbitraria. El
//    error de guardado gana porque es lo ÚLTIMO que pasó: pisarlo con "te
//    falta el monto" le diría al usuario que el problema es suyo cuando fue
//    del servidor. Y el eslogan es la rama del camino feliz, así que cede
//    contra cualquiera de las otras dos.
//
//  · El alto va RESERVADO (`minHeight`) aunque no haya NADA que decir. Sin eso
//    el footer cambiaba de alto al completar el último campo y el CTA saltaba
//    verticalmente justo cuando el usuario lo iba a tocar.
//
//  · El render es UNA sola rama, no tres bloques JSX. Con tres bloques (como
//    estaba duplicado) cualquier ajuste de tamaño de icono, de `numberOfLines`
//    o de peso había que aplicarlo seis veces, y bastaba olvidarse de una para
//    que un estado se viera de otra familia.
import type { ComponentProps } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { formatMissingFields } from '@/lib/form-missing-fields'
import { useAppTheme } from '@/theme/theme-provider'
import { nunitoFamily } from '@/theme/typography'

interface HelperLine {
  icon: ComponentProps<typeof MaterialIcons>['name']
  color: string
  text: string
}

export interface WizardFooterHelperProps {
  /** Último error de guardado, ya localizado. Gana sobre todo lo demás. */
  error?: string | null
  /** Campos requeridos que faltan, ya localizados. Los une acá adentro
   *  `formatMissingFields` para que las dos altas los enumeren igual. */
  missingLabels?: readonly string[]
  /** Eslogan del camino feliz. El caller decide cuándo aplica (en los dos
   *  wizards, sólo en el paso 1): `null` == esta rama no habla. */
  tagline?: string | null
}

export function WizardFooterHelper({
  error = null,
  missingLabels,
  tagline = null,
}: WizardFooterHelperProps) {
  const { theme } = useAppTheme()

  const line: HelperLine | null =
    error !== null && error.length > 0
      ? { icon: 'error-outline', color: theme.colors.danger, text: error }
      : missingLabels != null && missingLabels.length > 0
        ? {
            icon: 'error-outline',
            color: theme.colors.warning,
            text: formatMissingFields(missingLabels),
          }
        : tagline !== null && tagline.length > 0
          ? { icon: 'eco', color: theme.colors.textMuted, text: tagline }
          : null

  return (
    <View style={styles.row}>
      {line !== null ? (
        <>
          <MaterialIcons name={line.icon} size={14} color={line.color} />
          <Text style={[styles.text, { color: line.color }]} numberOfLines={2}>
            {line.text}
          </Text>
        </>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
    // Alto de una línea de `text` (12 × ~1.35): reservado SIEMPRE, también
    // cuando la fila no dibuja nada, para que el CTA no se mueva.
    minHeight: 16,
  },
  text: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    letterSpacing: -0.1,
    textAlign: 'center',
    flexShrink: 1,
  },
})
