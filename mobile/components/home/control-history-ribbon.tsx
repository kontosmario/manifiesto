import { StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui/app-text'
import { formatCompactMoney } from '@/components/home/control-visual-utils'
import { radii } from '@/theme/palette'
import { useAppTheme } from '@/theme/theme-provider'
import { nunitoFamily } from '@/theme/typography'

interface ControlHistoryRibbonItem {
  balance: number
  label: string
  spent: number
}

interface ControlHistoryRibbonProps {
  items: ControlHistoryRibbonItem[]
}

export function ControlHistoryRibbon({ items }: ControlHistoryRibbonProps) {
  const { theme } = useAppTheme()

  if (items.length === 0) {
    return null
  }

  const maxSpent = items.reduce((max, item) => Math.max(max, item.spent), 0) || 1

  return (
    <View style={styles.historyRow}>
      {items.map((item) => {
        const fillHeight = Math.max(14, (item.spent / maxSpent) * 100)
        const balanceTone = item.balance >= 0 ? theme.colors.success : theme.colors.warning

        return (
          <View
            key={item.label}
            style={[
              styles.historyCard,
              {
                backgroundColor: theme.colors.surfaceMuted,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <Text style={[styles.historyBalance, { color: balanceTone }]}>
              {formatCompactMoney(item.balance)}
            </Text>

            <View style={[styles.historyTrack, { backgroundColor: theme.colors.surfaceStrong }]}>
              <View
                style={[
                  styles.historyFill,
                  {
                    backgroundColor: item.balance >= 0 ? theme.colors.primary : theme.colors.warning,
                    height: fillHeight,
                  },
                ]}
              />
            </View>

            <Text numberOfLines={1} style={[styles.historyLabel, { color: theme.colors.textSoft }]}>
              {item.label}
            </Text>
          </View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  historyRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
  },
  historyCard: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
    borderRadius: radii.xl,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  historyBalance: {
    fontSize: 11,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
  },
  historyTrack: {
    flex: 1,
    width: '100%',
    minHeight: 108,
    borderRadius: radii.lg,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    padding: 4,
  },
  historyFill: {
    width: '100%',
    borderRadius: radii.md,
    minHeight: 8,
  },
  historyLabel: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
  },
})
