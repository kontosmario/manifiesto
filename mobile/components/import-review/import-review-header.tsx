import { Image, StyleSheet, Text, View } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { useAppTheme } from '@/theme/theme-provider'

interface Props {
  /** 1-indexed position of the wizard, or the total when in summary. */
  stepIndex: number
  /** Total number of submittable + skipped rows. */
  total: number
  imageUri: string
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
  const { theme } = useAppTheme()
  const reduced = useReducedMotion()
  const headingEnter = reduced ? undefined : FadeIn.duration(200)

  const eyebrow = mode === 'summary' ? 'Casi terminás' : 'Captura importada'
  const title = (() => {
    if (mode === 'summary') return 'Resumen final'
    if (total <= 1) return 'Revisá el movimiento'
    return `Movimiento ${stepIndex} de ${total}`
  })()

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
          {eyebrow}
        </Text>
        <Text style={[styles.title, { color: theme.colors.text }]}>
          {title}
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
