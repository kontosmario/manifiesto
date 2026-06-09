import { StyleSheet, Text, View } from 'react-native'
import { RiseView } from '@/components/home/animated/rise-view'
import type { StreakDerived } from '@/features/streaks/use-streak'
import type { StatusTone } from './streak-sheet-tone'

interface LevelProgressProps {
  derived: StreakDerived
  tone: StatusTone
}

/**
 * The linear progress bar has been removed: the level dial (DrawRing
 * around the flame in SheetHero) now carries the visual progress
 * signal. We keep only the textual detail copy so the numbers stay.
 */
export function LevelProgress({ derived, tone }: LevelProgressProps) {
  return (
    <RiseView delay={80} style={{ marginTop: 14 }}>
      <View style={styles.progressHead}>
        <Text style={[styles.progressLabel, { color: tone.soft }]}>
          {derived.levelLabel}
        </Text>
        <Text style={[styles.progressLabel, { color: tone.fg }]}>
          {derived.daysIntoLevel} / {derived.levelTotalDays} días →{' '}
          {derived.nextLevelLabel}
        </Text>
      </View>
      {derived.daysToNextLevel > 0 ? (
        <Text style={[styles.progressSub, { color: tone.soft }]}>
          {derived.daysToNextLevel} días más para subir a {derived.nextLevelLabel}
        </Text>
      ) : null}
    </RiseView>
  )
}

const styles = StyleSheet.create({
  progressHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  progressLabel: { fontSize: 11, fontWeight: '600' },
  progressSub: { fontSize: 11, marginTop: 5 },
})
