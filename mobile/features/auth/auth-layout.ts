import type { AuthMode } from '@/features/auth/auth-flow'

export type FocusedAuthField = 'name' | 'email' | 'password'
export type AuthLayoutPlatform = 'android' | 'ios'

export interface AuthViewportMetrics {
  containerMinHeight: number
  contentGap: number
  isCompact: boolean
  panelGap: number
  panelPadding: number
  panelWidth: number
  scrollBottomPadding: number
  scrollTopPadding: number
}

export function buildAuthViewportMetrics({
  availableContentHeight,
  screenHeight,
  width,
}: {
  availableContentHeight: number
  screenHeight: number
  width: number
}): AuthViewportMetrics {
  const isCompact = screenHeight < 780 || width < 390

  return {
    containerMinHeight: Math.max(0, availableContentHeight || screenHeight - 12),
    contentGap: isCompact ? 12 : 16,
    isCompact,
    panelGap: 10,
    panelPadding: isCompact ? 16 : 17,
    panelWidth: Math.min(width - 32, 396),
    scrollBottomPadding: isCompact ? 10 : 14,
    scrollTopPadding: isCompact ? 0 : 6,
  }
}

export function computeAuthKeyboardShiftTarget({
  baseFieldBottom,
  focusedField,
  keyboardTopLimit,
  mode,
  platform,
}: {
  baseFieldBottom: number
  focusedField: FocusedAuthField
  keyboardTopLimit: number
  mode: AuthMode
  platform: AuthLayoutPlatform
}): number {
  const trailingContext =
    focusedField === 'password'
      ? mode === 'sign-in'
        ? 96
        : platform === 'ios'
          ? 132
          : 118
      : focusedField === 'email'
        ? mode === 'sign-up'
          ? platform === 'ios'
            ? 72
            : 56
          : 28
        : 22

  const rawTarget = Math.max(0, baseFieldBottom + trailingContext - keyboardTopLimit)
  const maxLift =
    focusedField === 'password'
      ? mode === 'sign-in'
        ? 88
        : platform === 'ios'
          ? 216
          : 164
      : focusedField === 'email' && mode === 'sign-up'
        ? platform === 'ios'
          ? 118
          : 96
        : mode === 'sign-in'
          ? 40
          : 72

  return Math.min(rawTarget, maxLift)
}
