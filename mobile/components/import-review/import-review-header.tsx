import { Image, StyleSheet, Text, View } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { useAppTheme } from '@/theme/theme-provider'

interface Props {
  /** 1-indexed position of the wizard. */
  stepIndex: number
  /** Total number of submittable + skipped rows. */
  total: number
  imageUri: string
}

/**
 * Slim wizard header — replaces the cinematic "Detecté N movimientos"
 * heading with a compact row designed to live above the step indicator.
 * The progress dots already say "5 movements detected"; this row's job
 * is just to anchor the user inside the flow ("Movimiento 2 de 5") and
 * keep the screenshot context visible while editing.
 */
export function ImportReviewHeader({ stepIndex, total, imageUri }: Props) {
  const { theme } = useAppTheme()
  const reduced = useReducedMotion()
  const headingEnter = reduced ? undefined : FadeIn.duration(200)

  return (
    <Animated.View entering={headingEnter} style={styles.row}>
      {imageUri !== '' ? (
        <Image
          source={{ uri: imageUri }}
          style={[
            styles.thumb,
            {
              borderColor: theme.colors.line,
              backgroundColor: theme.colors.surfaceMuted,
            },
          ]}
          resizeMode="cover"
          accessible
          accessibilityLabel="Miniatura de la captura importada"
        />
      ) : null}
      <View style={styles.textCol}>
        <Text
          style={[styles.eyebrow, { color: theme.colors.textMuted }]}
          numberOfLines={1}
        >
          Captura importada
        </Text>
        <Text style={[styles.title, { color: theme.colors.text }]}>
          {total <= 1
            ? 'Revisá el movimiento'
            : `Movimiento ${stepIndex} de ${total}`}
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
  thumb: {
    width: 44,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    opacity: 0.85,
  },
  textCol: {
    flex: 1,
    gap: 2,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
})
