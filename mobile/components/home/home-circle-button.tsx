import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native'
import { useAppTheme } from '@/theme/theme-provider'
import { nunitoFamily } from '@/theme/typography'

interface HomeCircleButtonProps {
  accessibilityLabel: string
  onPress?: () => void
  /** Show a small dot badge (legacy, when count isn't available). */
  showBadge?: boolean
  /** Show a count badge with the actual unread number. Takes precedence
   *  over `showBadge`. Hidden when 0 or undefined. */
  badgeCount?: number
  badgeColor?: string
  children: React.ReactNode
  style?: ViewStyle
}

/**
 * 38×38 circular button used in the Home header (bell + settings).
 * Cream fill + lifted shadow + optional notification badge.
 *
 * Two badge modes:
 *  - `badgeCount` (preferred): renders a count chip with cream text on
 *    a dark coral surface — same chrome the assistant button uses, so
 *    the two badge variants visually rhyme.
 *  - `showBadge` (legacy): renders a small dot. Kept for any consumer
 *    that doesn't have a numeric count handy.
 */
export function HomeCircleButton({
  accessibilityLabel,
  onPress,
  showBadge = false,
  badgeCount,
  badgeColor,
  children,
  style,
}: HomeCircleButtonProps) {
  const { theme } = useAppTheme()
  // Dark mode: match the Home cards' muted surface (surfaceMuted)
  // instead of the brighter creamCard, so the header buttons sit in
  // the same calm green family on the near-black canvas. Light mode
  // keeps creamCard. The badge "cut-out" border tracks the same value
  // so the badge keeps reading as punched out of the button.
  const buttonSurface = theme.isDark
    ? theme.colors.surfaceMuted
    : theme.colors.creamCard
  // V1 accent-700 — burgundy/burnt-coral (h=16 l=33%). Reads as deep
  // warm rather than fire-red. Cream text on top hits 6.07:1 AA in
  // both modes — light number, not dark, no warning vibe.
  const dotColor = badgeColor ?? '#973511'
  const showCount = badgeCount != null && badgeCount > 0
  const countLabel = showCount
    ? badgeCount > 99
      ? '99+'
      : String(badgeCount)
    : null
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: buttonSurface,
          opacity: pressed ? 0.9 : 1,
        },
        style,
      ]}
    >
      <View style={styles.iconWrap}>{children}</View>
      {showCount ? (
        <View
          style={[
            styles.countBadge,
            {
              backgroundColor: dotColor,
              borderColor: buttonSurface,
            },
          ]}
        >
          <Text style={styles.countText}>{countLabel}</Text>
        </View>
      ) : showBadge ? (
        <View
          style={[
            styles.dotBadge,
            {
              backgroundColor: dotColor,
              borderColor: buttonSurface,
            },
          ]}
        />
      ) : null}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  button: {
    width: 38,
    height: 38,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    // Lifted shadow so the button reads as a floating chip on both
    // creamy light bg and forest dark bg.
    boxShadow: '0px 3px 10px rgba(15, 42, 30, 0.16)',
  },
  iconWrap: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Count badge — same chrome as the assistant button so the two
  // badge variants in the header visually match.
  countBadge: {
    position: 'absolute',
    top: -2,
    right: -3,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 999,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: {
    fontSize: 9,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    color: '#FFFBF2',  // V1 cream — AA on accent-700 burgundy (6.07:1)
    letterSpacing: -0.2,
  },
  // Legacy dot — kept for consumers without a numeric count.
  dotBadge: {
    position: 'absolute',
    top: 8,
    right: 10,
    width: 7,
    height: 7,
    borderRadius: 4,
    borderWidth: 2,
  },
})
