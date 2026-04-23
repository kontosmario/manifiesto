import type { ViewStyle } from 'react-native'
import type { AppTheme } from '@/theme/palette'

export type ElevationVariant =
  | 'card'
  | 'cardElevated'
  | 'panel'
  | 'panelHero'
  | 'floatingNav'
  | 'segmentedActive'

export function buildElevationStyle(
  theme: AppTheme,
  variant: ElevationVariant,
): ViewStyle {
  switch (variant) {
    case 'cardElevated':
      return {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 16 },
        shadowOpacity: theme.isDark ? 0.26 : 0.09,
        shadowRadius: 24,
        elevation: 9,
      }
    case 'panel':
      return theme.isDark
        ? {}
        : {
            shadowColor: '#4E685A',
            shadowOffset: { width: 0, height: 12 },
            shadowOpacity: 0.08,
            shadowRadius: 20,
            elevation: 6,
          }
    case 'panelHero':
      return theme.isDark
        ? {}
        : {
            shadowColor: '#5F8A70',
            shadowOffset: { width: 0, height: 18 },
            shadowOpacity: 0.12,
            shadowRadius: 28,
            elevation: 10,
          }
    case 'floatingNav':
      return {
        shadowColor: theme.isDark ? '#000000' : '#526F5F',
        shadowOffset: { width: 0, height: 22 },
        shadowOpacity: theme.isDark ? 0.32 : 0.12,
        shadowRadius: 30,
        elevation: 16,
      }
    case 'segmentedActive':
      return {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 6,
        elevation: 1,
      }
    default:
      return {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: theme.isDark ? 0.14 : 0.04,
        shadowRadius: 16,
        elevation: 3,
      }
  }
}

export function buildFloatingTabBarStyle(theme: AppTheme): ViewStyle {
  return {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 14,
    height: 88,
    paddingTop: 10,
    paddingBottom: 14,
    paddingHorizontal: 6,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: theme.isDark ? 'rgba(125, 222, 160, 0.14)' : 'rgba(17, 17, 17, 0.08)',
    borderRadius: 32,
    overflow: 'visible',
    ...buildElevationStyle(theme, 'floatingNav'),
  }
}
