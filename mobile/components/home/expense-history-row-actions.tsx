import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { triggerHaptic } from '@/lib/haptics'
import { withAlpha } from '@/theme/color-utils'
import { DEFAULT_HIT_SLOP, DEFAULT_PRESS_RETENTION_OFFSET, MIN_TOUCH_TARGET } from '@/theme/interaction'
import { radii } from '@/theme/palette'
import { useThemeTokens } from '@/theme/theme-provider'

interface ExpenseHistoryRowActionsProps {
  onDelete: () => void
  onEdit: () => void
}

export function ExpenseHistoryRowActions({
  onDelete,
  onEdit,
}: ExpenseHistoryRowActionsProps) {
  const { t } = useTranslation()
  return (
    <View style={styles.rowActions}>
      <SwipeActionButton
        label={t('home:historyRowActions.edit')}
        tone="default"
        onPress={() => {
          void triggerHaptic('selection')
          onEdit()
        }}
      />
      <SwipeActionButton
        label={t('home:historyRowActions.delete')}
        tone="danger"
        onPress={() => {
          void triggerHaptic('warning')
          onDelete()
        }}
      />
    </View>
  )
}

function SwipeActionButton({
  label,
  tone,
  onPress,
}: {
  label: string
  tone: 'default' | 'danger'
  onPress: () => void
}) {
  const theme = useThemeTokens()
  const palette =
    tone === 'danger'
      ? {
          backgroundColor: theme.colors.danger,
          borderColor: theme.colors.danger,
          textColor: '#FFFFFF',
        }
      : {
          backgroundColor: theme.colors.primary,
          borderColor: theme.colors.primary,
          textColor: '#FFFFFF',
        }

  return (
    <Pressable
      accessibilityRole="button"
      android_ripple={{
        borderless: false,
        color: withAlpha('#FFFFFF', 0.16),
      }}
      hitSlop={DEFAULT_HIT_SLOP}
      onPress={onPress}
      pressRetentionOffset={DEFAULT_PRESS_RETENTION_OFFSET}
      style={({ pressed }) => [
        styles.actionButton,
        {
          backgroundColor: palette.backgroundColor,
          borderColor: palette.borderColor,
          opacity: pressed ? 0.86 : 1,
        },
      ]}
    >
      <Text style={[styles.actionLabel, { color: palette.textColor }]}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  rowActions: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
    paddingLeft: 10,
  },
  actionButton: {
    minWidth: 78,
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radii.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  actionLabel: {
    fontSize: 13,
    fontWeight: '800',
  },
})
