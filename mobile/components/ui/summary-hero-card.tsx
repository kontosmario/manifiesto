import type { ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { BrandedPanel } from '@/components/ui/branded-panel'
import { typography } from '@/theme/typography'
import { useAppTheme } from '@/theme/theme-provider'

interface SummaryHeroCardProps {
  eyebrow: string
  value: string
  subtitle: string
  meta?: string
  rightSlot?: ReactNode
}

export function SummaryHeroCard({
  eyebrow,
  value,
  subtitle,
  meta,
  rightSlot,
}: SummaryHeroCardProps) {
  const { theme } = useAppTheme()

  return (
    <BrandedPanel elevated style={styles.card} variant="hero">
      <View style={styles.topRow}>
        <View style={styles.copy}>
          <Text style={[styles.eyebrow, { color: theme.colors.primaryStrong }]}>{eyebrow}</Text>
          <Text style={[styles.value, { color: theme.colors.text }]}>{value}</Text>
          <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>{subtitle}</Text>
        </View>
        {rightSlot ? <View style={styles.rightSlot}>{rightSlot}</View> : null}
      </View>
      {meta ? <Text style={[styles.meta, { color: theme.colors.textSoft }]}>{meta}</Text> : null}
    </BrandedPanel>
  )
}

const styles = StyleSheet.create({
  card: {
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  copy: {
    flex: 1,
    gap: 6,
  },
  rightSlot: {
    alignItems: 'flex-end',
  },
  eyebrow: {
    fontSize: 12, // no exact preset — eyebrow(11,800,uppercase,ls:1.2) differs in size+ls; flagged
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  value: {
    fontSize: 33, // no exact preset — hero(54) and displayLarge(40) are larger; flagged
    fontWeight: '900',
    letterSpacing: -1,
  },
  subtitle: {
    ...typography.body, // fontSize:14, fontWeight:'400', lineHeight:20
  },
  meta: {
    ...typography.bodySmall, // fontSize:13, fontWeight:'400', lineHeight:18
  },
})
