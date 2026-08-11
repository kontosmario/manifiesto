import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { RiseView } from '@/components/home/animated/rise-view'
import type { StreakDerived } from '@/features/streaks/use-streak'
import type { StatusTone } from './streak-sheet-tone'
import { nunitoFamily } from '@/theme/typography'

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
  const { t } = useTranslation()
  return (
    <RiseView delay={80} style={{ marginTop: 14 }}>
      <View style={styles.progressHead}>
        <Text style={[styles.progressLabel, { color: tone.soft }]}>
          {derived.levelLabel}
        </Text>
        <Text style={[styles.progressLabel, { color: tone.fg }]}>
          {t('gastos:levelProgress.daysIntoLevel', {
            into: derived.daysIntoLevel,
            total: derived.levelTotalDays,
            nextLevel: derived.nextLevelLabel,
          })}
        </Text>
      </View>
      {derived.daysToNextLevel > 0 ? (
        <Text style={[styles.progressSub, { color: tone.soft }]}>
          {t('gastos:levelProgress.daysToNext', {
            count: derived.daysToNextLevel,
            nextLevel: derived.nextLevelLabel,
          })}
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
  progressLabel: { fontSize: 11, fontWeight: '600', fontFamily: nunitoFamily('600') },
  progressSub: { fontSize: 11, marginTop: 5 },
})
