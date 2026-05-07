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
  /** Drives SVG currentColor. Defaults to `theme.colors.text`. */
  tint?: string
  /** Circular background wash behind the silhouette. */
  backgroundTint?: string
  /** Optional ring around the circle (matches the initials Avatar API). */
  ringColor?: string
  style?: ViewStyle
}

/**
 * Circular animal avatar built from the monochrome SVG pack at
 * mobile/assets/avatars/components/<slug>.tsx. Renders:
 *   - a soft tinted background circle (≈ diameter = size),
 *   - the silhouette centered at size * 0.66 (so the animal stays
 *     visually inside the circle without kissing the edge),
 *   - an optional ring border (used by FamilyStrip overlap stacks).
 *
 * Both light and dark mode are supported via theme tokens.
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
  const resolvedTint = tint ?? theme.colors.text
  const resolvedBackground =
    backgroundTint ??
    (theme.isDark ? theme.colors.creamCard : theme.colors.creamSoft)
  const glyphSize = Math.round(size * 0.66)

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
