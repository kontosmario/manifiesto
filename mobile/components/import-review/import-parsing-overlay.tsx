import { ActivityIndicator, StyleSheet, Text } from 'react-native'
import { useTranslation } from 'react-i18next'
import Animated, { Easing, FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated'
import { NeoSurface } from '@/components/ui/neo-surface'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { withAlpha } from '@/theme/color-utils'
import { neoRadii, neoTokens } from '@/theme/neo-tokens'
import { nunitoFamily } from '@/theme/typography'
import { useThemeTokens } from '@/theme/theme-provider'

/**
 * Estado de lectura entre la captura y el wizard: el OCR + parseo tarda
 * segundos y sin nada en pantalla el flujo se siente colgado.
 *
 * Las DOS entradas al wizard (share-to-import y el picker del FAB) lo montan,
 * así que el mismo tiempo de espera se ve igual venga de donde venga.
 */
const EASE_IOS = Easing.bezier(0.32, 0.72, 0, 1)

/**
 * El handoff pinta el scrim como un sólido porque en la maqueta el fondo ya
 * viene lavado. Acá hay una pantalla real atrás, así que se aplica el MISMO
 * tono con alfa — misma decisión (y mismo valor) que la carcasa neo de
 * `ModalCard`.
 */
const NEO_SCRIM_ALPHA = 0.84

export function ImportParsingOverlay() {
  const theme = useThemeTokens()
  const neo = neoTokens(theme.mode)
  const { t } = useTranslation()
  const reduced = useReducedMotion()

  return (
    <Animated.View
      entering={reduced ? undefined : FadeIn.duration(180).easing(EASE_IOS)}
      exiting={reduced ? undefined : FadeOut.duration(160).easing(EASE_IOS)}
      style={[styles.overlay, { backgroundColor: withAlpha(neo.scrim, NEO_SCRIM_ALPHA) }]}
      pointerEvents="auto"
    >
      <Animated.View
        entering={reduced ? undefined : FadeInDown.duration(220).easing(EASE_IOS)}
      >
        {/* La card tiene fill propio (gradiente `raised` del tema), así que
            sobrevive a un Android < API 28 que descarta el boxShadow outset:
            pierde el relieve, no la lectura. */}
        <NeoSurface variant="raisedLg" radius={neoRadii.cardSm} style={styles.card}>
          <ActivityIndicator color={neo.green} />
          <Text style={[styles.label, { color: neo.text }]}>
            {t('gastos:shareImport.reading')}
          </Text>
        </NeoSurface>
      </Animated.View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  // El `fontFamily` viaja con el peso: cada peso de Nunito es un face
  // estático propio, así que sin él el 800 se renderiza como regular.
  label: {
    fontSize: 14,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
  },
})
