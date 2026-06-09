import { StyleSheet, Text, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { AnimatedFlame } from '@/components/gastos/animated-flame'
import { AuroraBloom } from '@/components/ui/aurora-bloom'
import { DrawRing } from '@/components/ui/draw-ring'
import { RiseView } from '@/components/home/animated/rise-view'
import { useAppTheme } from '@/theme/theme-provider'
import type { StreakData, StreakDerived } from '@/features/streaks/use-streak'
import type { StatusTone } from './streak-sheet-tone'

interface SheetHeroProps {
  data: StreakData
  derived: StreakDerived
  tone: StatusTone
}

export function SheetHero({ data, derived, tone }: SheetHeroProps) {
  const { theme } = useAppTheme()
  const isBroken = derived.status === 'broken'
  // Level dial: the ring draws to the fraction of progress into the
  // current level. Broken shows an empty grey dial (no celebration).
  const ringProgress = isBroken ? 0 : Math.min(Math.max(derived.progressPct, 0), 1)
  return (
    <RiseView>
      <View style={styles.heroRow}>
        <View style={{ flex: 1 }}>
          <View style={styles.heroNumberRow}>
            {/* Focal: flame centered inside a self-drawing level dial,
                with a soft breathing aurora behind. The aurora is
                hidden for a broken streak (nothing to celebrate). */}
            <View style={styles.flameDial}>
              {!isBroken ? (
                <AuroraBloom color={tone.fg} size={84} intensity={0.32} />
              ) : null}
              <View style={styles.flameDialRing} pointerEvents="none">
                <DrawRing
                  size={64}
                  strokeWidth={3.5}
                  color={tone.fg}
                  progress={ringProgress}
                  trackColor={`${tone.fg}22`}
                />
              </View>
              <AnimatedFlame status={derived.status} size={40} />
            </View>
            <Text style={[styles.heroDays, { color: tone.fg }]}>
              {isBroken ? '0' : data.currentStreak}
            </Text>
            <Text style={[styles.heroDaysLabel, { color: tone.soft }]}>días</Text>
          </View>
          <Text style={[styles.heroHeadline, { color: theme.colors.text }]}>
            {derived.copyHeadline}
          </Text>
        </View>
        <View
          style={[
            styles.levelBadge,
            { backgroundColor: `${tone.fg}1F`, borderColor: `${tone.fg}55` },
          ]}
        >
          <Text style={[styles.levelBadgeSuper, { color: tone.soft }]}>NIVEL</Text>
          <Text style={[styles.levelBadgeText, { color: tone.fg }]}>
            {derived.levelLabel}
          </Text>
        </View>
      </View>
    </RiseView>
  )
}

interface ShieldChipProps {
  tokens: number
  tone: StatusTone
}

/**
 * Always-visible inventory of the user's freeze tokens. Two slots
 * mirror the spec cap (max 2 earned). Filled = available, hollow = empty.
 */
export function ShieldChip({ tokens, tone }: ShieldChipProps) {
  const filled = Math.min(2, Math.max(0, tokens))
  const slots: Array<'filled' | 'empty'> = [
    filled >= 1 ? 'filled' : 'empty',
    filled >= 2 ? 'filled' : 'empty',
  ]
  return (
    <RiseView delay={40} style={{ marginTop: 12 }}>
      <View
        style={[
          styles.shieldChip,
          { backgroundColor: tone.cardBg, borderColor: tone.cardBorder },
        ]}
        accessibilityLabel={`Escudos disponibles: ${tokens} de 2`}
      >
        <View style={styles.shieldDots}>
          {slots.map((slot, idx) => (
            <View
              key={idx}
              style={[
                styles.shieldDot,
                slot === 'filled'
                  ? { backgroundColor: tone.fg, borderColor: tone.fg }
                  : { backgroundColor: 'transparent', borderColor: `${tone.fg}55` },
              ]}
            >
              <MaterialIcons
                name="shield"
                size={11}
                color={slot === 'filled' ? '#FFFFFF' : `${tone.fg}88`}
              />
            </View>
          ))}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.shieldChipLabel, { color: tone.fg }]}>
            {tokens === 0
              ? 'Sin escudos disponibles'
              : tokens === 1
                ? '1 escudo disponible'
                : '2 escudos disponibles'}
          </Text>
          <Text style={[styles.shieldChipHint, { color: tone.soft }]}>
            {tokens === 2
              ? 'Stock al máximo. Cubren un día perdido cada uno.'
              : tokens === 1
                ? 'Te queda 1. Cubrirá un día sin registrar.'
                : 'Ganas uno cada 7 días seguidos de racha.'}
          </Text>
        </View>
      </View>
    </RiseView>
  )
}

const styles = StyleSheet.create({
  heroRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  heroNumberRow: {
    flexDirection: 'row',
    // Center the focal dial, the big day number, and the "días" label on
    // a common axis so the flame (centered in its 84px dial) lines up
    // with the number's optical center rather than floating above it.
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  // Focal dial wrapping the flame: sized to the aurora's footprint so
  // the breath has room; the flame + ring center within.
  flameDial: {
    width: 84,
    height: 84,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -8,
  },
  flameDialRing: {
    position: 'absolute',
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroDays: {
    fontSize: 44,
    fontWeight: '800',
    letterSpacing: -2,
    lineHeight: 48,
  },
  heroDaysLabel: { fontSize: 15, fontWeight: '600' },
  heroHeadline: { fontSize: 13, fontWeight: '700', marginTop: 2 },
  levelBadge: {
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  levelBadgeSuper: { fontSize: 9, fontWeight: '700', letterSpacing: 0.8 },
  levelBadgeText: { fontSize: 14, fontWeight: '800', marginTop: 2 },
  shieldChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  shieldDots: {
    flexDirection: 'row',
    gap: 6,
  },
  shieldDot: {
    width: 26,
    height: 26,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shieldChipLabel: { fontSize: 12, fontWeight: '800' },
  shieldChipHint: { fontSize: 11, marginTop: 2, lineHeight: 14 },
})
