import { memo } from 'react'
import { StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui/app-text'
import { useTranslation } from 'react-i18next'
import Animated, { LinearTransition } from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import { CountUpText } from '@/components/home/animated/count-up-text'
import { RiseView } from '@/components/home/animated/rise-view'
import { CategoryWeightsList, type CategoryWeight } from '@/components/gastos/category-weights-list'
import { GastosAverageBars } from '@/components/gastos/gastos-average-bars'
import { CardParticles } from '@/components/ui/card-particles'
import { useGatedLayout } from '@/hooks/use-layout-transition-gate'
import { formatMoney } from '@/utils/money'
import { authTokens } from '@/theme/palette'
import { useAppTheme } from '@/theme/theme-provider'
import { nunitoFamily } from '@/theme/typography'

interface GastosHeroCardProps {
  totalVisible?: number
  summaryChip?: string // e.g. "47 mov · abril · Todas"
  topCategories?: CategoryWeight[] // top 3
  averageDaily?: number
  averageDailyBars?: number[]
  averageWindowDays?: number
  /**
   * When `true`, the hero is showing data for a single day (the user
   * tapped a calendar cell). In that mode the "PROMEDIO DÍA" row is
   * hidden — the per-day average isn't meaningful when a single day
   * IS the period — and the top label switches to "TOTAL DEL DÍA"
   * so the user reads the value as "what you spent on this day".
   */
  daySelected?: boolean
  /**
   * Empty / preview mode (first-run onboarding). Renders the SAME card
   * shell — gradient, top label, the PROMEDIO DÍA / MÁS PESO labels —
   * but with neutral "—" / muted dash placeholders instead of any
   * numbers, bars or categories. NO fabricated data. The data props
   * become optional and are never read in this mode (we early-return
   * before touching them). Backwards-compatible: default `false` keeps
   * the original behavior untouched.
   */
  empty?: boolean
}

/**
 * Hero card of the Gastos screen — dark green gradient showing the
 * total visible, a summary chip (mov count · period · filter), and the
 * top 3 categories ranked by spend with animated progress bars.
 */
function GastosHeroCardImpl({
  totalVisible = 0,
  summaryChip = '',
  topCategories = [],
  averageDaily = 0,
  averageDailyBars = [],
  averageWindowDays = 22,
  daySelected = false,
  empty = false,
}: GastosHeroCardProps) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  // Gateado: el primer attach del tab (pre-mounted + detached) NO debe
  // disparar la layout transition del hero — sino la card warpea. Se
  // habilita después del idle para los cambios reales (filtro de día, etc).
  const heroLayout = useGatedLayout(LinearTransition.duration(260))

  // ── Empty / preview mode ─────────────────────────────────────────
  // Same gradient shell + section labels as the real hero, but every
  // value slot is a neutral muted dash ("—" / placeholder bar). We
  // early-return before touching any data prop so an empty account
  // never fabricates a total, an average or a category. The shine /
  // particles are dropped here so it reads as an inert preview, not a
  // live card.
  if (empty) {
    return <GastosHeroCardEmpty />
  }

  // Pass through whatever the controller computed — including all
  // zeros — so the bars truthfully reflect "no spend in window".
  // Earlier this used a hardcoded fake-data fallback that misled
  // users into thinking there had been activity. The bars component
  // already renders a flat dash for zero values.
  const barsData =
    averageDailyBars.length > 0 ? averageDailyBars : new Array(7).fill(0)
  return (
    <RiseView delay={100}>
      {/*
        Animated wrapper with LinearTransition — when the top-categories
        list changes length (e.g. switching day filter in the calendar),
        the hero's height animates smoothly instead of snapping to the
        new size. The weights block itself also fades each row in/out.
      */}
      <Animated.View layout={heroLayout}>
        <LinearGradient
          colors={[...theme.colors.heroGradient] as unknown as readonly [string, string, ...string[]]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={styles.card}
        >
          {/* Twinkling firefly field, layered over background, under
              the content. See `card-particles.tsx` for the
              shared-wave + per-particle-phase technique. */}
          <CardParticles count={9} accentColor={authTokens.peach} />

          <View style={styles.topRow}>
            <Text style={[styles.topLabel, { color: theme.colors.heroAccent }]}>
              {daySelected
                ? t('gastos:hero.totalDay')
                : t('gastos:hero.totalVisible')}
            </Text>
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
            flourish
            glowColor={theme.colors.heroAccent}
            format={(n) => formatMoney(n)}
            style={[styles.amount, { color: theme.colors.heroText }]}
          />

          {daySelected ? null : (
            <View style={styles.avgRow}>
              <View style={styles.avgText}>
                <Text style={[styles.avgLabel, { color: theme.colors.heroMuted }]}>
                  {t('gastos:hero.dailyAverage')}
                </Text>
                <View style={styles.avgValueRow}>
                  <CountUpText
                    value={averageDaily}
                    duration={1000}
                    format={(n) => formatMoney(n)}
                    style={[styles.avgValue, { color: theme.colors.heroText }]}
                  />
                  <Text style={[styles.avgSub, { color: theme.colors.heroMuted }]}>
                    {t('gastos:hero.lastDays', { days: averageWindowDays })}
                  </Text>
                </View>
              </View>
              <View style={styles.avgBars}>
                <GastosAverageBars values={barsData} color={theme.colors.heroAccent} totalHeight={24} />
              </View>
            </View>
          )}

          {topCategories.length > 0 ? (
            <Animated.View
              key="weights"
              style={styles.weightsBlock}
              layout={heroLayout}
            >
              <Text style={[styles.weightsLabel, { color: theme.colors.heroMuted }]}>
                {t('gastos:hero.topCategories')}
              </Text>
              <View style={{ marginTop: 6 }}>
                <CategoryWeightsList
                  items={topCategories}
                  textColor={theme.colors.heroText}
                  mutedColor={theme.colors.heroMuted}
                  trackColor="rgba(242,234,211,0.12)"
                />
              </View>
            </Animated.View>
          ) : null}
        </LinearGradient>
      </Animated.View>
    </RiseView>
  )
}

/**
 * Empty-state twin of the real hero. Identical gradient shell, radii,
 * paddings and section labels (TOTAL VISIBLE · PROMEDIO DÍA · MÁS PESO
 * POR CATEGORÍA) — but every value is a neutral muted dash. No
 * fabricated numbers, no bars, no categories. Shine + particles are
 * intentionally omitted so it reads as a still preview.
 */
function GastosHeroCardEmpty() {
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  // Neutral placeholder over the dark gradient — a faint cream wash, so
  // it reads as "value goes here", never as a real bar or shimmer.
  const ph = 'rgba(242,234,211,0.14)'
  return (
    <LinearGradient
      colors={[...theme.colors.heroGradient] as unknown as readonly [string, string, ...string[]]}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={[styles.card, styles.emptyCard]}
    >
      <View style={styles.topRow}>
        <Text style={[styles.topLabel, { color: theme.colors.heroAccent }]}>
          {t('gastos:hero.totalVisible')}
        </Text>
        <View
          style={[
            styles.chip,
            { backgroundColor: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.12)' },
          ]}
        >
          <View style={[styles.emptyBar, { width: 64, height: 8, backgroundColor: ph }]} />
        </View>
      </View>

      <Text style={[styles.amount, { color: theme.colors.heroText }]}>—</Text>

      <View style={styles.avgRow}>
        <View style={styles.avgText}>
          <Text style={[styles.avgLabel, { color: theme.colors.heroMuted }]}>
            {t('gastos:hero.dailyAverage')}
          </Text>
          <View style={styles.avgValueRow}>
            <Text style={[styles.avgValue, { color: theme.colors.heroText }]}>—</Text>
          </View>
        </View>
        <View style={styles.avgBars}>
          <View style={[styles.emptyBar, { width: 90, height: 2, backgroundColor: ph }]} />
        </View>
      </View>

      <View style={styles.weightsBlock}>
        <Text style={[styles.weightsLabel, { color: theme.colors.heroMuted }]}>
          {t('gastos:hero.topCategories')}
        </Text>
        <View style={{ marginTop: 10, gap: 10 }}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.emptyWeightRow}>
              <View style={[styles.emptyBar, { width: i === 1 ? '46%' : '62%', height: 8, backgroundColor: ph }]} />
              <View style={[styles.emptyBar, { width: 28, height: 8, backgroundColor: ph }]} />
            </View>
          ))}
        </View>
      </View>
    </LinearGradient>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(166,239,143,0.12)',
  },
  // Empty preview: real heroGradient shell but slightly recessed so it
  // reads as a sample, not a live card. No animated shine/particles.
  emptyCard: {
    opacity: 0.86,
  },
  emptyBar: { borderRadius: 4 },
  emptyWeightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topLabel: { fontSize: 11, letterSpacing: 1.6, fontWeight: '700', fontFamily: nunitoFamily('700') },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    maxWidth: '60%',
  },
  chipText: { fontSize: 10, fontWeight: '600', fontFamily: nunitoFamily('600') },
  amount: {
    fontSize: 40,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: -1.8,
    lineHeight: 42,
    marginTop: 8,
  },
  weightsBlock: { marginTop: 12 },
  weightsLabel: { fontSize: 10, letterSpacing: 1.2, fontWeight: '600', fontFamily: nunitoFamily('600') },
  avgRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 10,
  },
  avgText: { flex: 1 },
  avgLabel: { fontSize: 10, letterSpacing: 1.2, fontWeight: '600', fontFamily: nunitoFamily('600') },
  avgValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginTop: 2,
  },
  avgValue: { fontSize: 15, fontWeight: '800', fontFamily: nunitoFamily('800'), letterSpacing: -0.4 },
  avgSub: { fontSize: 11, fontWeight: '600', fontFamily: nunitoFamily('600') },
  avgBars: {
    minWidth: 90,
    height: 24,
    justifyContent: 'flex-end',
  },
})

/**
 * Memo wrap. GastosHeroCard es el componente más pesado de Gastos
 * (LinearGradient + ShineOverlay + CardParticles + CountUpText x2 +
 * CategoryWeightsList + GastosAverageBars). Sin memo se re-rendereaba
 * en cada parent render del screen (scroll, tap, filter change),
 * disparando re-evaluation de todas las animations internas.
 *
 * Props pasados son primitives o stable references via useMemo
 * upstream (topCategories de useGastosController, averageDailyBars
 * memoized). Shallow compare exacto.
 */
export const GastosHeroCard = memo(GastosHeroCardImpl)
