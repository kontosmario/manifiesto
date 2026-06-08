import type { ReactNode } from 'react'
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { AppCard } from '@/components/ui/card'
import { withAlpha } from '@/theme/color-utils'
import { buildElevationStyle } from '@/theme/elevation'
import { radii } from '@/theme/palette'
import { useAppTheme } from '@/theme/theme-provider'

interface BrandedPanelProps {
  children: ReactNode
  style?: StyleProp<ViewStyle>
  elevated?: boolean
  variant?: 'hero' | 'section' | 'accent'
}

export function BrandedPanel({
  children,
  style,
  elevated = false,
  variant = 'section',
}: BrandedPanelProps) {
  const { theme } = useAppTheme()

  const gradientColors: readonly [string, string, string] =
    variant === 'hero'
      ? theme.isDark
        ? [
            withAlpha(theme.colors.primarySurface, 0.98),
            withAlpha(theme.colors.surfaceMuted, 0.98),
            withAlpha(theme.colors.surface, 0.98),
          ]
        : [theme.colors.primarySurface, theme.colors.backgroundElevated, theme.colors.surfaceMuted]
      : variant === 'accent'
        ? theme.isDark
          ? [
              withAlpha(theme.colors.surfaceStrong, 0.98),
              withAlpha(theme.colors.surfaceMuted, 0.98),
              withAlpha(theme.colors.surface, 0.98),
            ]
          : [
              withAlpha(theme.colors.warning, 0.08),
              theme.colors.backgroundElevated,
              theme.colors.surfaceMuted,
            ]
        : theme.isDark
          ? [
              withAlpha(theme.colors.surfaceStrong, 0.98),
              withAlpha(theme.colors.surfaceMuted, 0.98),
              withAlpha(theme.colors.surface, 0.98),
            ]
          : [theme.colors.backgroundElevated, theme.colors.surfaceMuted, theme.colors.background]

  const borderColor =
    variant === 'hero'
      ? theme.isDark
        ? withAlpha(theme.colors.primaryStrong, 0.16)
        : withAlpha(theme.colors.primary, 0.16)
      : variant === 'accent'
        ? theme.isDark
          ? withAlpha(theme.colors.warning, 0.18)
          : withAlpha(theme.colors.warning, 0.2)
        : theme.isDark
          ? theme.colors.border
          : withAlpha(theme.colors.text, 0.08)

  const panelBackgroundColor =
    variant === 'hero'
      ? theme.isDark
        ? theme.colors.primarySurface
        : withAlpha(theme.colors.primarySurface, 0.72)
      : variant === 'accent'
        ? theme.isDark
          ? theme.colors.surface
          : withAlpha(theme.colors.warning, 0.06)
        : theme.isDark
          ? theme.colors.surface
          : withAlpha(theme.colors.backgroundElevated, 0.92)

  return (
    <AppCard
      elevated={elevated}
      style={[
        styles.panelCard,
        {
          backgroundColor: panelBackgroundColor,
          borderColor,
        },
        buildElevationStyle(theme, variant === 'hero' ? 'panelHero' : 'panel'),
        style,
      ]}
    >
      <LinearGradient colors={gradientColors} end={{ x: 1, y: 1 }} start={{ x: 0, y: 0 }} style={StyleSheet.absoluteFill} />
      <View pointerEvents="none" style={styles.panelDecor}>
        <View
          style={[
            styles.panelGlow,
            theme.isDark
              ? variant === 'hero'
                ? styles.panelGlowHero
                : styles.panelGlowSection
              : variant === 'hero'
                ? styles.panelGlowHeroLight
                : variant === 'accent'
                  ? styles.panelGlowAccentLight
                  : styles.panelGlowSectionLight,
          ]}
        />
        {variant === 'hero' ? (
          <View
            style={[
              styles.panelGlow,
              theme.isDark ? styles.panelGlowSecondary : styles.panelGlowSecondaryLight,
            ]}
          />
        ) : null}
        {!theme.isDark ? <View style={[styles.panelGlow, styles.panelGlowSoftLight]} /> : null}
        <View
          style={[
            styles.panelShine,
            {
              backgroundColor: theme.isDark
                ? variant === 'accent'
                  ? withAlpha(theme.colors.warning, 0.24)
                  : withAlpha(theme.colors.text, 0.08)
                : variant === 'accent'
                  ? withAlpha(theme.colors.warning, 0.28)
                  : withAlpha(theme.colors.backgroundElevated, 0.74),
            },
          ]}
        />
      </View>
      {children}
    </AppCard>
  )
}

const styles = StyleSheet.create({
  panelCard: {
    position: 'relative',
  },
  panelDecor: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  panelGlow: {
    position: 'absolute',
    borderRadius: radii.pill,
  },
  panelGlowHero: {
    width: 220,
    height: 220,
    top: -126,
    right: -42,
    backgroundColor: withAlpha('#6FC786', 0.16),
  },
  panelGlowSection: {
    width: 150,
    height: 150,
    top: -92,
    right: -52,
    backgroundColor: withAlpha('#6FC786', 0.08),
  },
  panelGlowSecondary: {
    width: 170,
    height: 170,
    left: -74,
    bottom: -116,
    backgroundColor: withAlpha('#6FC786', 0.08),
  },
  panelGlowHeroLight: {
    width: 184,
    height: 184,
    top: -84,
    right: -46,
    backgroundColor: withAlpha('#19B66B', 0.07),
  },
  panelGlowSectionLight: {
    width: 126,
    height: 126,
    top: -58,
    right: -34,
    backgroundColor: withAlpha('#19B66B', 0.05),
  },
  panelGlowAccentLight: {
    width: 126,
    height: 126,
    top: -58,
    right: -34,
    backgroundColor: withAlpha('#FF9F0A', 0.06),
  },
  panelGlowSecondaryLight: {
    width: 154,
    height: 154,
    left: -46,
    bottom: -92,
    backgroundColor: withAlpha('#19B66B', 0.045),
  },
  panelGlowSoftLight: {
    width: 220,
    height: 220,
    left: 36,
    bottom: -176,
    backgroundColor: withAlpha('#FFFFFF', 0.28),
  },
  panelShine: {
    position: 'absolute',
    top: -18,
    left: 22,
    width: 132,
    height: 58,
    borderRadius: radii.pill,
    opacity: 0.8,
  },
})
