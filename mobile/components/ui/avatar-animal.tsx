import { memo } from 'react'
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import {
  AVATAR_LABELS,
  getAvatarComponent,
  type AvatarSlug,
} from '@/assets/avatars'
import { useAppTheme } from '@/theme/theme-provider'

export interface AvatarAnimalProps {
  slug: AvatarSlug
  size?: number
  /** Silhouette tint override. Falls back to the theme default
   *  (primary-800 in light, cream in dark) when omitted. */
  tint?: string
  /** Circular background wash behind the silhouette. Defaults to the
   *  theme's `creamSoft` (light) / `creamCard` (dark). */
  backgroundTint?: string
  /** Optional ring around the circle (matches the initials Avatar API). */
  ringColor?: string
  style?: ViewStyle
}

// Silhouette tint — single color per theme mode. The SVG body is
// flattened to a unified silhouette (no gradient, no filter, no drop
// shadow) so each avatar render is essentially one `fillPath` call
// per path. That's a fraction of the cost of the previous relief
// stack on older Android hardware and keeps the visual identity
// "simple" — which matches the user's design preference.
const SILHOUETTE_TINTS = {
  light: '#297811', // primary-800 — deep forest silhouette on cream
  dark: '#F2EAD3', // cream — light silhouette on the dark forest ring
} as const

// Glyph occupies ~72% of the avatar diameter — gives the figure
// natural breathing room inside the circular ring without needing
// any per-svg transform (the svgrepo sources already have their own
// internal padding).
const GLYPH_RATIO = 0.72

/**
 * Circular animal avatar built from the monochrome SVG pack at
 * mobile/assets/avatars/components/<slug>.tsx. Renders:
 *   - a tinted background circle (creamSoft / creamCard from theme),
 *   - the silhouette centered at size × GLYPH_RATIO so the animal
 *     sits comfortably inside the ring,
 *   - an optional ring border (used by FamilyStrip overlap stacks).
 *
 * Both light and dark mode are supported via theme-driven tint.
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
  const Component = getAvatarComponent(slug)
  const resolvedBackground =
    backgroundTint ??
    (theme.isDark ? theme.colors.creamCard : theme.colors.creamSoft)
  const resolvedTint =
    tint ?? (theme.isDark ? SILHOUETTE_TINTS.dark : SILHOUETTE_TINTS.light)
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
function AvatarAnimalRowImpl({
  slug,
  selected = false,
  onSelect,
  label,
  actionLabel,
}: AvatarAnimalRowProps) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  const resolvedLabel = label ?? AVATAR_LABELS[slug]
  const resolvedActionLabel = actionLabel ?? t('common:avatar.selectAction')

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('common:avatar.pickA11y', { name: resolvedLabel })}
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
          {selected ? t('common:avatar.selected') : resolvedActionLabel}
        </Text>
      </View>
    </Pressable>
  )
}

/**
 * Memoized for the same reasons as AvatarAnimal. Onboarding's avatar
 * picker renders 8 of these simultaneously; without memo, any
 * unrelated parent re-render (e.g., theme tick, animation frame from
 * Reanimated's LinearTransition) reruns all 8 silhouettes. Note:
 * `onSelect` must be stable from the caller for memo to take effect —
 * step-avatar.tsx passes a `setDraft` from useState, which IS stable.
 */
export const AvatarAnimalRow = memo(AvatarAnimalRowImpl)

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
