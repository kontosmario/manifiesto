import { Pressable, StyleSheet, Text, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { useAppTheme } from '@/theme/theme-provider'

interface HomeAssistantButtonProps {
  onPress?: () => void
  /** Number of pending assistant suggestions (drives the count badge). */
  pendingCount?: number
}

// Mint accent (matches the assistant's identity inside the sheet).
const ACCENT = '#C7EE9C'

/**
 * Header button that opens the Asistente sheet. Adopts the same chrome
 * as the bell + sliders (dark cream fill, 38×38, subtle shadow) so the
 * three buttons read as a set — but adds mint accents that distinguish
 * the assistant as the "AI feature":
 *  · 1px mint border at ~30% so the ring catches the eye
 *  · Mint sparkle glyph instead of the neutral text color
 *  · Mint-tinted soft shadow (vs. the dark shadow on the others)
 *
 * A numeric peach badge appears top-right when there are pending
 * suggestions.
 */
export function HomeAssistantButton({
  onPress,
  pendingCount = 0,
}: HomeAssistantButtonProps) {
  const { theme } = useAppTheme()
  const count = pendingCount > 9 ? '9+' : String(pendingCount)
  const showBadge = pendingCount > 0
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={
        pendingCount > 0
          ? `Abrir asistente — ${pendingCount} ${pendingCount === 1 ? 'sugerencia' : 'sugerencias'}`
          : 'Abrir asistente'
      }
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: theme.colors.creamCard,
          opacity: pressed ? 0.9 : 1,
        },
      ]}
    >
      {/* Inner mint ring — sits just inside the button edge so the
          chrome stays the same as siblings while telegraphing
          "different". 1.2px keeps it crisp without dominating. */}
      <View style={styles.ring} pointerEvents="none" />
      <View style={styles.iconWrap}>
        <MaterialIcons name="auto-awesome" size={18} color={ACCENT} />
      </View>
      {showBadge ? (
        <View
          style={[
            styles.badge,
            {
              backgroundColor: theme.colors.peach,
              borderColor: theme.colors.creamCard,
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
    // Mint-tinted shadow vs. the dark shadow on bell/sliders. Same
    // depth, different hue — subliminal cue.
    boxShadow: '0px 2px 8px rgba(199, 238, 156, 0.20)',
  },
  ring: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 999,
    borderWidth: 1.2,
    borderColor: 'rgba(199, 238, 156, 0.32)',
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
    color: '#0F2A1E',
    letterSpacing: -0.2,
  },
})
