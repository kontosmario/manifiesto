import { StyleSheet, Text, View } from 'react-native'
import { radii } from '@/theme/palette'
import { useAppTheme } from '@/theme/theme-provider'

interface MiniBarItem {
  label: string
  value: number
  tone?: 'primary' | 'success' | 'warning'
}

interface MiniBarsProps {
  items: MiniBarItem[]
}

export function MiniBars({ items }: MiniBarsProps) {
  const { theme } = useAppTheme()
  const maxValue = items.reduce((max, item) => Math.max(max, item.value), 0) || 1

  return (
    <View style={styles.container}>
      {items.map((item) => {
        const toneColor =
          item.tone === 'success'
            ? theme.colors.success
            : item.tone === 'warning'
              ? theme.colors.warning
              : theme.colors.primary

        return (
          <View key={item.label} style={styles.item}>
            <View style={[styles.barTrack, { backgroundColor: theme.colors.surfaceStrong }]}>
              <View
                style={[
                  styles.barFill,
                  {
                    backgroundColor: toneColor,
                    height: `${Math.max(14, (item.value / maxValue) * 100)}%`,
                  },
                ]}
              />
            </View>
            <Text numberOfLines={1} style={[styles.label, { color: theme.colors.textSoft }]}>
              {item.label}
            </Text>
          </View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
    height: 118,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
  },
  barTrack: {
    flex: 1,
    width: '100%',
    borderRadius: radii.pill,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    padding: 4,
  },
  barFill: {
    width: '100%',
    borderRadius: radii.pill,
    minHeight: 8,
  },
  label: {
    fontSize: 11, // no exact preset — fieldLabel(11,700,uppercase) adds unwanted uppercase; caption(11,500) wrong weight; flagged
    fontWeight: '700',
  },
})
