import { describe, expect, it } from 'vitest'
import { buildAuthViewportMetrics, computeAuthKeyboardShiftTarget } from '@/features/auth/auth-layout'

describe('auth-layout helpers', () => {
  it('deriva métricas compactas según viewport mobile', () => {
    const metrics = buildAuthViewportMetrics({
      availableContentHeight: 640,
      screenHeight: 760,
      width: 380,
    })

    expect(metrics.isCompact).toBe(true)
    expect(metrics.contentGap).toBe(12)
    expect(metrics.panelPadding).toBe(16)
    expect(metrics.panelWidth).toBe(348)
    expect(metrics.containerMinHeight).toBe(640)
  })

  it('limita el lift del teclado para password en sign-in', () => {
    const target = computeAuthKeyboardShiftTarget({
      baseFieldBottom: 760,
      focusedField: 'password',
      keyboardTopLimit: 520,
      mode: 'sign-in',
      platform: 'ios',
    })

    expect(target).toBe(88)
  })
})
