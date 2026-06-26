import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { MaterialIcons } from '@expo/vector-icons'
import { useAppTheme } from '@/theme/theme-provider'

interface HomeAssistantButtonProps {
  onPress?: () => void
  /** Number of pending assistant suggestions (drives the count badge). */
  pendingCount?: number
}

// V1 mint sparkle — mode-aware so the "AI" glyph is legible on both
// cream creamCard (light) and forest creamCard (dark). Mint identity
// preserved in both via the same hue at different lightness.
const ICON_MINT_LIGHT = '#297811'  // primary-800 (5.37:1 on creamCard light)
const ICON_MINT_DARK = '#A6EF8F'   // primary-300 (5.73:1 on creamCard dark)
// V1 accent-700 — burgundy/burnt-coral. Same hue as accent-600 but
// at l=33% reads as deep warm, not fire-red. Cream text on top hits
// 6.07:1 AA in both modes. Same hex as the bell badge.
const BADGE_BG = '#973511'

/**
 * Header button that opens the Asistente sheet. Adopts the same chrome
 * as the bell + sliders (cream fill, 38×38, lifted shadow) so the
 * three buttons read as a set — but adds peach accents that
 * distinguish the assistant as the "AI feature":
 *  · 1.2px peach pulse ring at ~38% so the button telegraphs
 *    "different / important" at a glance.
 *  · Peach-tinted lifted shadow so the button doesn't get lost on
 *    busy bgs (was a too-subtle mint glow before).
 *  · Mint sparkle glyph as the "AI" mark; the chrome around it is
 *    peach-keyed.
 *
 * A numeric coral badge appears top-right when there are pending
 * suggestions — cream text on solid #B84014.
 */
export function HomeAssistantButton({
  onPress,
  pendingCount = 0,
}: HomeAssistantButtonProps) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  // Dark mode: match the Home cards' muted surface (surfaceMuted)
  // instead of creamCard, so the assistant button joins the same calm
  // green family on the near-black canvas. Light mode keeps creamCard.
  const buttonSurface = theme.isDark
    ? theme.colors.surfaceMuted
    : theme.colors.creamCard
  const count = pendingCount > 9 ? '9+' : String(pendingCount)
  const showBadge = pendingCount > 0
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={
        pendingCount > 0
          ? t('home:assistantButton.openWithCount', { count: pendingCount })
          : t('home:assistantButton.open')
      }
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: buttonSurface,
          opacity: pressed ? 0.9 : 1,
        },
      ]}
    >
      {/* Inner mint ring — sits just inside the button edge so the
          chrome stays the same as siblings while telegraphing
          "different". 1.2px keeps it crisp without dominating. */}
      <View style={styles.ring} pointerEvents="none" />
      <View style={styles.iconWrap}>
        <MaterialIcons
          name="auto-awesome"
          size={18}
          color={theme.isDark ? ICON_MINT_DARK : ICON_MINT_LIGHT}
        />
      </View>
      {showBadge ? (
        <View
          style={[
            styles.badge,
            {
              backgroundColor: BADGE_BG,
              borderColor: buttonSurface,
            },
          ]}
        >
          <Text style={styles.badgeText}>{count}</Text>
        </View>
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
    // Soft peach (accent-300) lifted shadow — gives the assistant
    // button real presence on cream bg AND on dark forest bg, without
    // looking like a fire/warning button. Same family as the badge.
    boxShadow: '0px 4px 14px rgba(242, 167, 140, 0.40)',
  },
  ring: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 999,
    borderWidth: 1.4,
    borderColor: 'rgba(242, 167, 140, 0.50)',
  },
  iconWrap: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -3,
    minWidth: 15,
    height: 15,
    paddingHorizontal: 3,
    borderRadius: 999,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#FFFBF2',  // V1 cream — AA on accent-700 burgundy (6.07:1)
    letterSpacing: -0.2,
  },
})
