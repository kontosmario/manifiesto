import { StyleSheet, Text, View } from 'react-native'
import Svg, { Circle, Path } from 'react-native-svg'
import { nunitoFamily } from '@/theme/typography'

interface AvatarProps {
  name: string
  color: string
  size?: number
  ringColor?: string
}

/**
 * Pick at most two alphanumeric initials from the name. Filters out
 * em dashes, hyphens, dots and any other non-letter sentinels that
 * the data layer uses as fallback when `display_name` is missing —
 * those characters used to render as the visible "initial" and made
 * the avatar look broken (a green circle with a horizontal line).
 */
function deriveInitials(name: string): string {
  const tokens = name
    .split(/\s+/)
    .map((token) => {
      // Find the first ALPHANUMERIC character in each whitespace-
      // separated token (skips punctuation/symbols at the start).
      for (const ch of token) {
        if (/[\p{L}\p{N}]/u.test(ch)) return ch
      }
      return ''
    })
    .filter(Boolean)
  return tokens.slice(0, 2).join('').toUpperCase()
}

export function Avatar({ name, color, size = 28, ringColor }: AvatarProps) {
  const initials = deriveInitials(name)
  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          borderColor: ringColor ?? 'transparent',
          borderWidth: ringColor ? 2 : 0,
        },
      ]}
    >
      {initials ? (
        <Text style={[styles.initials, { fontSize: size * 0.42, color: '#fff' }]}>
          {initials}
        </Text>
      ) : (
        // Person silhouette fallback — used when the name has no
        // alphanumeric characters (empty string, em dash placeholder,
        // unicode-only handles). Keeps the avatar legible instead of
        // rendering a stranded dash that looks like a broken icon.
        <PersonGlyph size={Math.round(size * 0.55)} color="#fff" />
      )}
    </View>
  )
}

function PersonGlyph({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={8} r={4} fill={color} />
      <Path d="M4 20c0-4.4 3.6-8 8-8s8 3.6 8 8v1H4v-1z" fill={color} />
    </Svg>
  )
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center' },
  initials: { fontFamily: nunitoFamily('700'), fontWeight: '700', letterSpacing: 0.2 },
})
