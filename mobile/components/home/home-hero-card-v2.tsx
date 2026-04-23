// mobile/components/home/home-hero-card-v2.tsx
import { StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { CountUpText } from '@/components/home/animated/count-up-text'
import { BreatheDot } from '@/components/home/animated/breathe-dot'
import { RiseView } from '@/components/home/animated/rise-view'
import { ShineOverlay } from '@/components/home/animated/shine-overlay'
import { HeroAurora } from '@/components/home/hero-aurora'
import { HeroStat } from '@/components/home/hero-stat'
import { HeroSparkline } from '@/components/home/hero-sparkline'
import { formatMoney, formatMoneyShort, formatMoneyWithSign } from '@/utils/money'
import { useAppTheme } from '@/theme/theme-provider'
import type { HeroStatsTrio } from '@/features/home/home-aggregates.model'
import type { MonthlyComparison } from '@/features/home/home-aggregates.model'

interface HomeHeroCardV2Props {
  availableToday: number
  projectedMargin: number
  monthlyComparison: MonthlyComparison | null
  sparkline: number[] | null
  heroStats: HeroStatsTrio
  cycleDayLabel: string | null   // e.g., "Abril · día 22/30"
}

export function HomeHeroCardV2({
  availableToday,
  projectedMargin,
  monthlyComparison,
  sparkline,
  heroStats,
  cycleDayLabel,
}: HomeHeroCardV2Props) {
  const { theme } = useAppTheme()
  const delta = monthlyComparison?.deltaPercent
  const deltaTxt = delta == null ? null : `${delta > 0 ? '▲' : '▼'} ${Math.abs(Math.round(delta))}%`

  return (
    <RiseView delay={150}>
      <LinearGradient
        colors={[...theme.colors.heroGradient] as unknown as readonly [string, string, ...string[]]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={[styles.card, { borderColor: 'rgba(199,238,156,0.12)' }]}
      >
        <HeroAurora radius={28} />
        <ShineOverlay width={430} height={240} tint={theme.colors.shineOverlay} delayMs={1000} periodMs={4200} />

        <View style={styles.topRow}>
          <View style={styles.topLeft}>
            <BreatheDot size={10} color={theme.colors.heroAccent} glow={theme.colors.heroAccent} />
            <Text style={[styles.topLabel, { color: theme.colors.heroAccent }]}>DISPONIBLE HOY</Text>
          </View>
          {cycleDayLabel ? (
            <View style={[styles.datePill, { borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(255,255,255,0.08)' }]}>
              <Text style={[styles.datePillText, { color: theme.colors.heroMuted }]}>{cycleDayLabel}</Text>
            </View>
          ) : null}
        </View>

        <CountUpText
          value={availableToday}
          format={(n) => formatMoney(n, { zeroAsDash: false })}
          style={[styles.amount, { color: theme.colors.heroText }]}
        />

        <View style={styles.marginRow}>
          <Text style={[styles.marginText, { color: theme.colors.heroMuted }]}>Margen del mes</Text>
          <Text style={[styles.marginValue, { color: theme.colors.heroAccent }]}>
            {formatMoneyWithSign(projectedMargin)}
          </Text>
          {deltaTxt ? (
            <View style={[styles.deltaPill, { borderColor: 'rgba(199,238,156,0.3)' }]}>
              <Text style={[styles.deltaText, { color: theme.colors.heroAccent }]}>{deltaTxt}</Text>
            </View>
          ) : null}
        </View>

        {sparkline && sparkline.length > 1 ? (
          <View style={styles.sparkWrap}>
            <HeroSparkline
              data={sparkline}
              width={320}
              height={58}
              color={theme.colors.heroAccent}
              fillColor={theme.colors.heroAccent}
              delayMs={400}
            />
          </View>
        ) : null}

        <View style={[styles.trio, { borderTopColor: 'rgba(255,255,255,0.12)' }]}>
          <HeroStat
            label="Hoy"
            value={heroStats.todayRemaining == null ? '—' : formatMoney(heroStats.todayRemaining)}
            sub="disponible"
          />
          <View style={[styles.trioDivider, { backgroundColor: 'rgba(255,255,255,0.1)' }]} />
          <HeroStat
            label="Gastado"
            value={formatMoney(heroStats.spentToday)}
            sub={`${heroStats.movementsToday} ${heroStats.movementsToday === 1 ? 'mov' : 'movs'}`}
          />
          <View style={[styles.trioDivider, { backgroundColor: 'rgba(255,255,255,0.1)' }]} />
          <HeroStat
            label="Alcancía"
            value={heroStats.piggy == null ? '—' : (heroStats.piggy >= 0 ? '+' : '') + formatMoneyShort(heroStats.piggy)}
            sub={heroStats.piggyState === 'excess' ? 'excedido' : 'ahorrado'}
            accent={heroStats.piggyState !== 'excess'}
          />
        </View>
      </LinearGradient>
    </RiseView>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 28,
    padding: 18,
    paddingBottom: 18,
    overflow: 'hidden',
    borderWidth: 1,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', zIndex: 2 },
  topLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  topLabel: { fontSize: 11, letterSpacing: 1.8, fontWeight: '800' },
  datePill: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
  datePillText: { fontSize: 10, fontWeight: '600' },
  amount: { fontSize: 48, fontWeight: '800', letterSpacing: -2.2, marginTop: 10, lineHeight: 50 },
  marginRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 8 },
  marginText: { fontSize: 13 },
  marginValue: { fontSize: 13, fontWeight: '800' },
  deltaPill: { paddingHorizontal: 9, paddingVertical: 2, borderRadius: 999, borderWidth: 1 },
  deltaText: { fontSize: 11, fontWeight: '800' },
  sparkWrap: { marginTop: 12, marginLeft: -4 },
  trio: { marginTop: 12, paddingTop: 10, flexDirection: 'row', borderTopWidth: 1 },
  trioDivider: { width: 1, alignSelf: 'stretch' },
})
