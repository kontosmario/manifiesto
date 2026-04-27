import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import type { MaterialIcons } from '@expo/vector-icons'
import { AppSymbol } from './app-symbol'
import { useCategoryHue } from '@/theme/theme-provider'
import { radii } from '@/theme/palette'

export type CategoryBadgeSize = 'sm' | 'md' | 'lg'
export type CategoryBadgeTone = 'soft' | 'filled'

interface CategoryBadgeProps {
  categoryId: string
  emoji?: string
  iconName?: string
  fallbackIconName?: keyof typeof MaterialIcons.glyphMap
  size?: CategoryBadgeSize
  tone?: CategoryBadgeTone
  style?: StyleProp<ViewStyle>
  accessibilityLabel?: string
}

const SIZE_CONFIG: Record<CategoryBadgeSize, { box: number; icon: number; emoji: number }> = {
  sm: { box: 28, icon: 14, emoji: 16 },
  md: { box: 36, icon: 18, emoji: 20 },
  lg: { box: 48, icon: 22, emoji: 26 },
}

export function CategoryBadge({
  categoryId,
  emoji,
  iconName = 'folder.fill',
  fallbackIconName = 'folder',
  size = 'md',
  tone = 'soft',
  style,
  accessibilityLabel,
}: CategoryBadgeProps) {
  const hue = useCategoryHue(categoryId)
  const { box, icon, emoji: emojiSize } = SIZE_CONFIG[size]

  const surfaceColor = tone === 'filled' ? hue.ink : hue.surface
  const iconColor = tone === 'filled' ? hue.surface : hue.ink

  return (
    <View
      accessibilityElementsHidden={!accessibilityLabel}
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.box,
        {
          width: box,
          height: box,
          borderRadius: radii.md,
          backgroundColor: surfaceColor,
        },
        style,
      ]}
    >
      {emoji ? (
        <Text
          allowFontScaling={false}
          style={[styles.emoji, { fontSize: emojiSize, lineHeight: emojiSize + 2 }]}
        >
          {emoji}
        </Text>
      ) : (
        <AppSymbol
          name={iconName}
          fallback={fallbackIconName}
          size={icon}
          color={iconColor}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: {
    textAlign: 'center',
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
})
