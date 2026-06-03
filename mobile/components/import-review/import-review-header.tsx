import { Image, StyleSheet, Text, View } from 'react-native'
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { useAppTheme } from '@/theme/theme-provider'

interface Props {
  transactionsCount: number
  breakdown: { expenses: number; incomes: number }
  skipCount: number
  imageUri: string
}

export function ImportReviewHeader({
  transactionsCount,
  breakdown,
  skipCount,
  imageUri,
}: Props) {
  const { theme } = useAppTheme()
  const reduced = useReducedMotion()

  const movementsWord = transactionsCount === 1 ? 'movimiento' : 'movimientos'
  const breakdownText = buildBreakdownText(breakdown, skipCount)

  const headingEnter = reduced ? undefined : FadeIn.duration(240)
  const breakdownEnter = reduced ? undefined : FadeInDown.duration(220).delay(80)
  const thumbEnter = reduced ? undefined : FadeIn.duration(280).delay(60)

  return (
    <View style={styles.row}>
      <View style={styles.textCol}>
        <Animated.View entering={headingEnter}>
          <Text style={[styles.heading, { color: theme.colors.text }]}>
            <Text style={styles.headingMuted}>Detecté </Text>
            <Text style={styles.headingNumber}>
              {transactionsCount} {movementsWord}
            </Text>
            {'\n'}
            <Text style={styles.headingMuted}>en tu captura</Text>
          </Text>
        </Animated.View>
        {breakdownText !== '' ? (
          <Animated.Text
            entering={breakdownEnter}
            style={[styles.breakdown, { color: theme.colors.textMuted }]}
          >
            {breakdownText}
          </Animated.Text>
        ) : null}
      </View>

      {imageUri !== '' ? (
        <Animated.View entering={thumbEnter}>
          <Image
            source={{ uri: imageUri }}
            style={[
              styles.thumb,
              { borderColor: theme.colors.line, backgroundColor: theme.colors.surfaceMuted },
            ]}
            resizeMode="cover"
            accessible
            accessibilityLabel="Miniatura de la captura importada"
          />
        </Animated.View>
      ) : null}
    </View>
  )
}

function buildBreakdownText(
  b: { expenses: number; incomes: number },
  skip: number,
): string {
  const parts: string[] = []
  if (b.expenses > 0) parts.push(`${b.expenses} ${b.expenses === 1 ? 'gasto' : 'gastos'}`)
  if (b.incomes > 0) parts.push(`${b.incomes} ${b.incomes === 1 ? 'ingreso' : 'ingresos'}`)
  if (skip > 0) parts.push(`${skip} a saltear`)
  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0]
  return parts.join(', ')
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    paddingTop: 24,
    paddingBottom: 16,
  },
  textCol: {
    flex: 1,
    gap: 8,
  },
  heading: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.4,
    lineHeight: 28,
  },
  headingNumber: {
    fontWeight: '900',
  },
  headingMuted: {
    fontWeight: '700',
  },
  breakdown: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: 12,
    borderWidth: 1,
    opacity: 0.55,
  },
})
