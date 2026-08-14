import { Image, StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui/app-text'
import { useTranslation } from 'react-i18next'
import Animated, { FadeIn } from 'react-native-reanimated'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { neoRadii } from '@/theme/neo-tokens'
import { nunitoFamily } from '@/theme/typography'
import { useImportReviewNeo } from './import-review-neo'

interface Props {
  /** 1-indexed position of the wizard, or the total when in summary. */
  stepIndex: number
  /** Total number of submittable + skipped rows. */
  total: number
  imageUri?: string
  mode?: 'edit' | 'summary'
}

/**
 * Slim wizard header. Reads "Movimiento 2 de 5" while editing and flips
 * to "Resumen final" copy on the summary step so the user never has to
 * guess what surface they're on.
 */
export function ImportReviewHeader({
  stepIndex,
  total,
  imageUri,
  mode = 'edit',
}: Props) {
  const { neo } = useImportReviewNeo()
  const { t } = useTranslation()
  const reduced = useReducedMotion()
  const headingEnter = reduced ? undefined : FadeIn.duration(200)

  const title = (() => {
    if (mode === 'summary') return t('gastos:import.header.summaryTitle')
    if (total <= 1) return t('gastos:import.header.reviewMovement')
    return t('gastos:import.header.movementOf', { current: stepIndex, total })
  })()

  return (
    <Animated.View entering={headingEnter} style={styles.row}>
      {imageUri !== undefined && imageUri !== '' ? (
        // La miniatura es un tile ELEVADO: la sombra va en el wrapper y no en
        // la Image, así el recorte del radio no le come el relieve.
        <View
          style={[
            styles.thumbWrap,
            { backgroundColor: neo.surface, boxShadow: neo.shadows.raisedSm },
          ]}
        >
          <Image
            source={{ uri: imageUri }}
            style={styles.thumb}
            resizeMode="cover"
            accessible
            accessibilityLabel={t('gastos:import.header.thumbnailA11y')}
          />
        </View>
      ) : null}
      <View style={styles.textCol}>
        <Text style={[styles.title, { color: neo.text }]}>{title}</Text>
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 10,
    paddingBottom: 4,
  },
  thumbWrap: {
    width: 46,
    height: 46,
    borderRadius: neoRadii.chip,
    padding: 3,
  },
  thumb: {
    flex: 1,
    borderRadius: neoRadii.chip - 3,
  },
  textCol: {
    flex: 1,
  },
  // El `fontFamily` viaja con el peso: cada peso de Nunito es un face
  // estático propio, así que sin él el 900 se renderiza como regular.
  title: {
    fontSize: 18,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    letterSpacing: -0.4,
  },
})
