import { Image, Pressable, StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui/app-text'
import { useTranslation } from 'react-i18next'
import Animated, { FadeIn } from 'react-native-reanimated'
import { MaterialIcons } from '@expo/vector-icons'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { motionDurations } from '@/lib/motion/tokens'
import { neoRadii } from '@/theme/neo-tokens'
import { nunitoFamily } from '@/theme/typography'
import {
  displayDescription,
  formatCaptureTime,
} from '@/features/import-review/format'
import type { ReviewRow } from '@/features/import-review/types'
import { useImportReviewNeo } from './import-review-neo'

interface Props {
  row: ReviewRow
  /** Posición 1-indexada dentro de la bandeja; ausente si el flujo es de 1. */
  position?: { index: number; total: number }
  /** `true` cuando la fila tiene campos requeridos sin completar. */
  incomplete: boolean
  imageUri?: string
  /** Vuelve a la bandeja. Ausente cuando no hay bandeja a la que volver. */
  onBack?: () => void
}

/**
 * Encabezado de la vista de EDICIÓN.
 *
 * Además de ubicar (posición dentro de la bandeja + botón de volver), dice
 * DE DÓNDE salió el dato. Antes el título era "Movimiento N de M" y nada
 * más: el usuario abría un formulario lleno de campos que no tipeó y la app
 * no se hacía cargo de ninguno. El origen ya vivía en `row.source` —una
 * unión discriminada con la captura o la transacción original— y no se
 * rendía en ninguna parte.
 */
export function ImportReviewHeader({
  row,
  position,
  incomplete,
  imageUri,
  onBack,
}: Props) {
  const { neo, softInk, wellFallback } = useImportReviewNeo()
  const { t } = useTranslation()
  const reduced = useReducedMotion()

  const isApplePay = row.source.origin === 'apple-pay'
  // Se discrimina la unión ACÁ y no vía `isApplePay`: TS no propaga el
  // narrowing de `row.source` a través de una variable booleana.
  const capturedTime =
    row.source.origin === 'apple-pay'
      ? formatCaptureTime(row.source.capture.capturedAt)
      : null

  const eyebrowParts: string[] = []
  if (position) {
    eyebrowParts.push(
      t('gastos:import.header.movementOf', {
        current: position.index,
        total: position.total,
      }),
    )
  } else {
    eyebrowParts.push(
      isApplePay
        ? t('gastos:import.origin.applePayEyebrow', { time: capturedTime ?? '' }).trim()
        : t('gastos:import.origin.captureEyebrow'),
    )
  }
  if (incomplete) eyebrowParts.push(t('gastos:import.list.rowMissing'))

  return (
    <Animated.View
      entering={reduced ? undefined : FadeIn.duration(motionDurations.quick)}
      style={styles.row}
    >
      {onBack ? (
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel={t('gastos:import.footer.backToList')}
          hitSlop={10}
          style={({ pressed }) => [
            styles.back,
            {
              backgroundColor: neo.surface,
              boxShadow: neo.shadows.raisedSm,
            },
            pressed ? { opacity: 0.6 } : null,
          ]}
        >
          <MaterialIcons name="chevron-left" size={22} color={neo.text} />
        </Pressable>
      ) : imageUri !== undefined && imageUri !== '' ? (
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
      ) : (
        <View
          style={[
            styles.back,
            { backgroundColor: neo.well, boxShadow: neo.shadows.insetSm },
            wellFallback,
          ]}
        >
          <MaterialIcons
            name={isApplePay ? 'contactless' : 'receipt-long'}
            size={19}
            color={softInk}
          />
        </View>
      )}

      <View style={styles.textCol}>
        <Text
          style={[styles.eyebrow, { color: incomplete ? neo.warm : neo.textMuted }]}
          numberOfLines={1}
        >
          {eyebrowParts.join(' · ')}
        </Text>
        <Text style={[styles.title, { color: neo.text }]} numberOfLines={1}>
          {displayDescription(row.description)}
        </Text>
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
  back: {
    width: 40,
    height: 40,
    borderRadius: neoRadii.chip,
    alignItems: 'center',
    justifyContent: 'center',
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
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    letterSpacing: -0.4,
    marginTop: 2,
  },
})
