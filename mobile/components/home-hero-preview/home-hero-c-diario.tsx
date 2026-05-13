import { useEffect } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { formatMoney } from '@/utils/money'
import { deltaPctLabel, moneyShort, resolveHomeHeadline } from './home-hero-helpers'
import type { HomeHeroState } from './home-hero-states'
// theme not needed · Diario is print-style, paper/ink palette is fixed
// across light/dark (newsprint doesn't have a "dark mode" — it IS the
// dark mode of the screen). Leaving the import out keeps lint clean.

const CARD_W = 340

/**
 * Variant C · El Diario del Mes · editorial newspaper · radical
 *
 * Hero como portada de diario dedicada al mes en curso. Masthead
 * tipográfico arriba ("LA MENSUAL · MAY 2026 · Nº día/total"). Headline
 * grande state-aware. Stand-first con saldo + proyección como prose,
 * no numbers en tiles. Stock ticker animado corriendo de derecha a
 * izquierda con dailyBudget · variableTrend · fixedPaid.
 *
 * 0% gradient · 0% particles · 100% prose-grade typography.
 */
export function HomeHeroDiario({ state }: { state: HomeHeroState }) {
  const reduced = useReducedMotion()
  const headline = resolveHomeHeadline(state)
  const monthLabel = state.cycleMonth.toUpperCase()
  const issueNumber = `Nº ${state.cycleDay}/${state.cycleTotalDays}`

  // Ticker scroll · horizontal infinite from right to left
  const tickerX = useSharedValue(0)
  useEffect(() => {
    if (reduced) {
      tickerX.value = 0
      return
    }
    tickerX.value = withRepeat(
      withTiming(-CARD_W, { duration: 18000, easing: Easing.linear }),
      -1,
      false,
    )
    return () => cancelAnimation(tickerX)
  }, [reduced, tickerX])

  const tickerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tickerX.value }],
  }))

  // Newsprint palette · cream paper + ink black + a single accent
  // (peach o lime depending on state) used as a single rule + headline
  // emphasis. Theme-aware: stays on cream paper for both light/dark.
  const ink = '#1A1814'
  const paper = '#F4EFE3'
  const muted = '#5C544A'
  const accent =
    state.projectedClose < 0 || state.paydayPending ? '#A04D3C' : '#1F590D'
  const tickerColor = state.variableTrend != null && state.variableTrend > 0 ? '#A04D3C' : '#1F590D'

  return (
    <View style={[styles.card, { backgroundColor: paper }]}>
      {/* Masthead */}
      <View style={[styles.masthead, { borderBottomColor: ink }]}>
        <View style={[styles.mastheadInner, { borderTopColor: ink, borderBottomColor: ink }]}>
          <Text style={[styles.mastheadTitle, { color: ink }]}>LA MENSUAL</Text>
        </View>
        <View style={styles.mastheadMeta}>
          <Text style={[styles.mastheadMetaText, { color: muted }]}>
            {monthLabel}
          </Text>
          <Text style={[styles.mastheadMetaText, { color: muted }]}>·</Text>
          <Text style={[styles.mastheadMetaText, { color: muted }]}>
            {issueNumber}
          </Text>
          <Text style={[styles.mastheadMetaText, { color: muted }]}>·</Text>
          <Text style={[styles.mastheadMetaText, { color: muted }]}>
            {state.cycleStartLabel.toUpperCase()} → {state.cycleEndLabel.toUpperCase()}
          </Text>
        </View>
      </View>

      {/* Headline */}
      <View style={styles.body}>
        <Text style={[styles.headline, { color: ink }]}>{headline}</Text>
        <View style={[styles.rule, { backgroundColor: accent }]} />

        {/* Stand-first · saldo + proyección como prose */}
        <Text style={[styles.standfirst, { color: ink }]}>
          <Text style={styles.dropcap}>{state.incomeConfigured ? formatMoney(state.availableToday) : '—'}</Text>
          {state.incomeConfigured ? (
            <>
              {' en cuenta · '}
              {state.projectionReliable ? (
                <>
                  proyección cierra{' '}
                  <Text style={{ fontWeight: '800' }}>
                    {state.projectedClose >= 0 ? '+' : '−'}${moneyShort(state.projectedClose)}
                  </Text>
                  {state.projectedCloseTrend != null ? (
                    <>
                      , {deltaPctLabel(state.projectedCloseTrend)} sobre el ciclo anterior
                    </>
                  ) : null}
                  {' · podés gastar '}
                  <Text style={{ fontWeight: '800' }}>${moneyShort(state.dailyBudget)}/día</Text>
                  {' hasta cierre.'}
                </>
              ) : (
                <>aún calculando proyección · primeros días del ciclo.</>
              )}
            </>
          ) : (
            <> {'configurá tu ingreso para activar el seguimiento del ciclo.'}</>
          )}
        </Text>

        {/* Byline · daypart + day label */}
        <Text style={[styles.byline, { color: muted }]}>
          por la redacción · {state.diaLabel.toLowerCase()}
        </Text>
      </View>

      {/* Stock ticker · runs continuously */}
      <View
        style={[
          styles.tickerWrap,
          { borderTopColor: ink, borderBottomColor: ink, backgroundColor: paper },
        ]}
      >
        <Animated.View style={[styles.tickerInner, tickerStyle]}>
          {[0, 1].map((repeat) => (
            <View key={repeat} style={styles.tickerRow}>
              <TickerItem label="FIJOS" value={`${state.fixedPaid}/${state.fixedCount}`} ink={ink} />
              <TickerSep ink={muted} />
              <TickerItem
                label="VARIABLE"
                value={deltaPctLabel(state.variableTrend)}
                ink={state.variableTrend != null && state.variableTrend > 0 ? tickerColor : ink}
              />
              <TickerSep ink={muted} />
              <TickerItem
                label="CUPO"
                value={`$${moneyShort(state.dailyBudget)}/día`}
                ink={ink}
              />
              <TickerSep ink={muted} />
              <TickerItem
                label="RACHA"
                value={state.racha === 0 ? '—' : `${state.racha}d`}
                ink={ink}
              />
              <TickerSep ink={muted} />
              <TickerItem
                label="GANADORES"
                value={`${state.closedWinningDays}/${state.closedDays}`}
                ink={ink}
              />
              <TickerSep ink={muted} />
            </View>
          ))}
        </Animated.View>
      </View>
    </View>
  )
}

function TickerItem({ label, value, ink }: { label: string; value: string; ink: string }) {
  return (
    <View style={styles.tickerItem}>
      <Text style={[styles.tickerLabel, { color: ink }]}>{label}</Text>
      <Text style={[styles.tickerValue, { color: ink }]}>{value}</Text>
    </View>
  )
}

function TickerSep({ ink }: { ink: string }) {
  return <Text style={[styles.tickerSep, { color: ink }]}>▸ ▸ ▸</Text>
}

const styles = StyleSheet.create({
  card: {
    width: CARD_W,
    borderRadius: 6,
    overflow: 'hidden',
    paddingTop: 14,
    alignSelf: 'center',
  },
  masthead: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    borderBottomWidth: 2,
  },
  mastheadInner: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    paddingVertical: 4,
    alignItems: 'center',
  },
  mastheadTitle: {
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 2.4,
    fontFamily: 'Georgia',
  },
  mastheadMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 6,
    flexWrap: 'wrap',
  },
  mastheadMetaText: {
    fontSize: 9,
    letterSpacing: 1.4,
    fontFamily: 'Menlo',
    fontWeight: '700',
  },
  body: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 14,
  },
  headline: {
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: -0.6,
    lineHeight: 32,
    fontFamily: 'Georgia',
  },
  rule: {
    width: 32,
    height: 3,
    marginTop: 10,
    marginBottom: 10,
  },
  standfirst: {
    fontSize: 13.5,
    lineHeight: 19,
    fontFamily: 'Georgia',
    fontWeight: '400',
    letterSpacing: 0,
  },
  dropcap: {
    fontSize: 17,
    fontWeight: '800',
    fontFamily: 'Georgia',
  },
  byline: {
    fontSize: 10,
    letterSpacing: 0.6,
    marginTop: 12,
    fontStyle: 'italic',
    fontFamily: 'Georgia',
  },
  tickerWrap: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    paddingVertical: 6,
    overflow: 'hidden',
  },
  tickerInner: {
    flexDirection: 'row',
  },
  tickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 14,
  },
  tickerItem: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  tickerLabel: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.4,
    fontFamily: 'Menlo',
  },
  tickerValue: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
    fontFamily: 'Menlo',
  },
  tickerSep: {
    fontSize: 8,
    letterSpacing: 1.2,
    fontFamily: 'Menlo',
  },
})
