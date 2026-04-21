/**
 * Minimal stub for react-native used in vitest (Node environment).
 * Only mocks what is needed for skeleton layout descriptor tests.
 */

export const StyleSheet = {
  create: <T extends object>(styles: T): T => styles,
  flatten: (style: unknown) => style,
  hairlineWidth: 1,
  absoluteFill: {},
  absoluteFillObject: { top: 0, left: 0, bottom: 0, right: 0 },
}

export const View = 'View'
export const Text = 'Text'
export const Animated = {
  View: 'Animated.View',
  Text: 'Animated.Text',
  createAnimatedComponent: <T,>(component: T): T => component,
}

export function useColorScheme() {
  return 'light'
}

export const Platform = {
  OS: 'ios',
  Version: 16,
  select: <T extends object>(obj: T): T[keyof T] => {
    const key = 'ios' as keyof T
    return obj[key] ?? (obj as Record<string, unknown>)['default'] as T[keyof T]
  },
}
