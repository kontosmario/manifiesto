import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native'
import {
  AVATAR_LABELS,
  getAvatarComponent,
  type AvatarSlug,
} from '@/assets/avatars'
import { useAppTheme } from '@/theme/theme-provider'

export interface AvatarAnimalProps {
  slug: AvatarSlug
  size?: number
  /** @deprecated Kept for backward compatibility. The relief variant
   *  resolves its own tokens from theme; this prop is ignored. */
  tint?: string
  /** Circular background wash behind the silhouette. Defaults to the
   *  theme's `creamSoft` (light) / `creamCard` (dark). */
  backgroundTint?: string
  /** Optional ring around the circle (matches the initials Avatar API). */
  ringColor?: string
  style?: ViewStyle
}

// Theme tokens for the relief silhouette — mirrors the mint variant
// from the design preview (tmp/avatar-relief-preview.html). Light uses
// the primary mint scale anchored at primary-300/800 with a primary-900
// drop shadow; dark inverts the lightness so the figure pops against
// the forest-mid avatar ring.
const RELIEF_TOKENS = {
  light: {
    gradStart: '#F4FDF2', // primary-50 (top-left highlight)
    gradMid: '#A6EF8F',   // primary-300
    gradEnd: '#297811',   // primary-800 (bottom-right deep)
    stroke: '#1F590D',    // primary-900 (selective contour)
    shadow: '#1F590D',    // primary-900
    shadowOpacity: 0.42,
  },
  dark: {
    gradStart: '#D1F7C5', // primary-200
    gradMid: '#77E755',   // primary-400
    gradEnd: '#1F590D',   // primary-900
    stroke: '#0F2D06',    // primary-950
    shadow: '#0A140C',    // forest near-black
    shadowOpacity: 0.65,
  },
} as const

/**
 * Circular animal avatar built from the relief SVG pack at
 * mobile/assets/avatars/components/<slug>.tsx. Renders:
 *   - a tinted background circle (creamSoft / creamCard from theme),
 *   - the relief silhouette filling the full circle (the SVG carries
 *     its own internal padding via the adaptive transform baked into
 *     each component, so there's no need for the size×0.66 shrink the
 *     monochrome pack used).
 *   - an optional ring border (used by FamilyStrip overlap stacks).
 *
 * Light/dark variants are driven by theme tokens (RELIEF_TOKENS) passed
 * through as gradient/stroke/shadow color props.
 */
export function AvatarAnimal({
  slug,
  size = 64,
  tint,
  backgroundTint,
  ringColor,
  style,
}: AvatarAnimalProps) {
  const { theme } = useAppTheme()
  const Component = getAvatarComponent(slug)
  void tint
  const resolvedBackground =
    backgroundTint ??
    (theme.isDark ? theme.colors.creamCard : theme.colors.creamSoft)
  const reliefTokens = theme.isDark ? RELIEF_TOKENS.dark : RELIEF_TOKENS.light

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
      <Component size={size} {...reliefTokens} />
    </View>
  )
}

export interface AvatarAnimalRowProps {
  slug: AvatarSlug
  selected?: boolean
  onSelect?: (slug: AvatarSlug) => void
  label?: string
  actionLabel?: string
}

/**
 * Secondary variant used by the onboarding avatar picker: animal +
 * its Spanish label + a "Seleccionar" affordance on the right. When
 * `selected` is true the row adopts the primary accent border and the
 * button flips to an active state.
 */
export function AvatarAnimalRow({
  slug,
  selected = false,
  onSelect,
  label,
  actionLabel = 'Seleccionar',
}: AvatarAnimalRowProps) {
  const { theme } = useAppTheme()
  const resolvedLabel = label ?? AVATAR_LABELS[slug]

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Elegir avatar ${resolvedLabel}`}
      accessibilityState={{ selected }}
      onPress={() => onSelect?.(slug)}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: theme.colors.creamCard,
          borderColor: selected ? theme.colors.primary : theme.colors.line,
          borderWidth: selected ? 2 : 1,
          opacity: pressed ? 0.94 : 1,
        },
      ]}
    >
      <AvatarAnimal
        slug={slug}
        size={56}
        backgroundTint={theme.colors.creamSoft}
      />
      <Text style={[styles.rowLabel, { color: theme.colors.text }]} numberOfLines={1}>
        {resolvedLabel}
      </Text>
      <View
        style={[
          styles.action,
          {
            backgroundColor: selected
              ? theme.colors.primary
              : theme.colors.creamSoft,
            borderColor: selected ? theme.colors.primary : theme.colors.line,
          },
        ]}
      >
        <Text
          style={[
            styles.actionLabel,
            {
              color: selected
                ? theme.isDark
                  ? theme.colors.primaryStrong
                  : '#FFFFFF'
                : theme.colors.text,
            },
          ]}
        >
          {selected ? 'Elegido' : actionLabel}
        </Text>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
  },
  rowLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  action: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  actionLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
})
