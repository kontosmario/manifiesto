import { StyleSheet, Text, View } from 'react-native'
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import { CountUpText } from '@/components/home/animated/count-up-text'
import { RiseView } from '@/components/home/animated/rise-view'
import { ShineOverlay } from '@/components/home/animated/shine-overlay'
import { CategoryWeightsList, type CategoryWeight } from '@/components/gastos/category-weights-list'
import { formatMoney } from '@/utils/money'
import { useAppTheme } from '@/theme/theme-provider'

interface GastosHeroCardProps {
  totalVisible: number
  summaryChip: string // e.g. "47 mov · abril · Todas"
  topCategories: CategoryWeight[] // top 3
}

/**
 * Hero card of the Gastos screen — dark green gradient showing the
 * total visible, a summary chip (mov count · period · filter), and the
 * top 3 categories ranked by spend with animated progress bars.
 */
export function GastosHeroCard({
  totalVisible,
  summaryChip,
  topCategories,
}: GastosHeroCardProps) {
  const { theme } = useAppTheme()
  return (
    <RiseView delay={100}>
      {/*
        Animated wrapper with LinearTransition — when the top-categories
        list changes length (e.g. switching day filter in the calendar),
        the hero's height animates smoothly instead of snapping to the
        new size. The weights block itself also fades each row in/out.
      */}
      <Animated.View layout={LinearTransition.duration(260)}>
        <LinearGradient
          colors={[...theme.colors.heroGradient] as unknown as readonly [string, string, ...string[]]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={styles.card}
        >
          <ShineOverlay
            width={430}
            height={260}
            tint={theme.colors.shineOverlay}
            delayMs={1000}
            periodMs={4200}
          />

          <View style={styles.topRow}>
            <Text style={[styles.topLabel, { color: theme.colors.heroAccent }]}>TOTAL VISIBLE</Text>
            <View
              style={[
                styles.chip,
                { backgroundColor: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.12)' },
              ]}
            >
              <Text style={[styles.chipText, { color: theme.colors.heroMuted }]}>{summaryChip}</Text>
            </View>
          </View>

          <CountUpText
            value={totalVisible}
            duration={1200}
            format={(n) => formatMoney(n)}
            style={[styles.amount, { color: theme.colors.heroText }]}
          />

          {topCategories.length > 0 ? (
            <Animated.View
              key="weights"
              style={styles.weightsBlock}
              entering={FadeIn.duration(220)}
              exiting={FadeOut.duration(160)}
              layout={LinearTransition.duration(260)}
            >
              <Text style={[styles.weightsLabel, { color: theme.colors.heroMuted2 }]}>
                MÁS PESO POR CATEGORÍA
              </Text>
              <View style={{ marginTop: 6 }}>
                <CategoryWeightsList
                  items={topCategories}
                  textColor={theme.colors.heroText}
                  mutedColor={theme.colors.heroMuted2}
                  trackColor="rgba(246,251,239,0.12)"
                />
              </View>
            </Animated.View>
          ) : null}
        </LinearGradient>
      </Animated.View>
    </RiseView>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(199,238,156,0.12)',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topLabel: { fontSize: 11, letterSpacing: 1.6, fontWeight: '700' },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    maxWidth: '60%',
  },
  chipText: { fontSize: 10, fontWeight: '600' },
  amount: {
    fontSize: 40,
    fontWeight: '800',
    letterSpacing: -1.8,
    lineHeight: 42,
    marginTop: 8,
  },
  weightsBlock: { marginTop: 12 },
  weightsLabel: { fontSize: 10, letterSpacing: 1.2, fontWeight: '600' },
})
