import { memo } from 'react'
import { StyleSheet, View, type ViewStyle } from 'react-native'
import {
  AVATAR_LABELS,
  getAvatarComponent,
  type AvatarSlug,
} from '@/assets/avatars'
import { neoTokens } from '@/theme/neo-tokens'
import { useAppTheme } from '@/theme/theme-provider'

export interface AvatarAnimalProps {
  slug: AvatarSlug
  size?: number
  /** Silhouette tint override. Falls back to the theme default
   *  (`greenDeep` in light, `text` in dark) when omitted. */
  tint?: string
  /** Circular background wash behind the silhouette. Defaults to the
   *  neutral neo surface; callers pass a category pastel, `well` or
   *  `selectedTint` when the disc has to carry state. */
  backgroundTint?: string
  /** Optional ring around the circle (matches the initials Avatar API). */
  ringColor?: string
  style?: ViewStyle
}

// Glyph occupies ~72% of the avatar diameter — gives the figure
// natural breathing room inside the circular ring without needing
// any per-svg transform (the svgrepo sources already have their own
// internal padding).
const GLYPH_RATIO = 0.72

/**
 * Circular animal avatar built from the monochrome SVG pack at
 * mobile/assets/avatars/components/<slug>.tsx. Renders:
 *   - a tinted background circle (neo surface by default),
 *   - the silhouette centered at size × GLYPH_RATIO so the animal
 *     sits comfortably inside the ring,
 *   - an optional ring border (used by FamilyStrip overlap stacks).
 *
 * The silhouette is a SINGLE color per mode: the SVG body is flattened
 * (no gradient, no filter, no drop shadow) so each render is one
 * `fillPath` call per path — a fraction of the cost of the old relief
 * stack on low-end Android.
 *
 * Defaults come from the neo vocabulary: `surface` disc, `greenDeep`
 * silhouette in light (7.39:1) / `text` in dark (11.46:1). Over the
 * category pastels the same pair gives 6.68:1 in light and ≥ 7.6:1 in
 * dark through `pastelDarkSolid()`.
 */
function AvatarAnimalImpl({
  slug,
  size = 64,
  tint,
  backgroundTint,
  ringColor,
  style,
}: AvatarAnimalProps) {
  const { theme } = useAppTheme()
  const neo = neoTokens(theme.mode)
  const Component = getAvatarComponent(slug)
  const resolvedBackground = backgroundTint ?? neo.surface
  const resolvedTint = tint ?? (theme.isDark ? neo.text : neo.greenDeep)
  const glyphSize = Math.round(size * GLYPH_RATIO)

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={AVATAR_LABELS[slug]}
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: resolvedBackground,
          borderColor: ringColor ?? 'transparent',
          borderWidth: ringColor ? 2 : 0,
        },
        style,
      ]}
    >
      {/* eslint-disable-next-line react-hooks/static-components -- Component is a stable lookup from a frozen registry, not a created component */}
      <Component size={glyphSize} color={resolvedTint} />
    </View>
  )
}

/**
 * Memoized. Parents re-rendering for unrelated reasons (data refresh,
 * theme toggle in a sibling subtree, etc.) no longer re-render the
 * silhouette SVG. Shallow prop compare is enough since `slug`/`size`/
 * `tint`/`ringColor`/`backgroundTint` are primitives; only `style`
 * (optional ViewStyle) can be unstable from callers. Callers passing
 * inline `style={{...}}` will defeat memoization for that one Avatar —
 * acceptable because in practice almost every callsite either omits
 * `style` or passes a constant.
 */
export const AvatarAnimal = memo(AvatarAnimalImpl)

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
})
