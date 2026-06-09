import { describe, expect, it } from 'vitest'
import { resolveFlag, type FeatureFlagsMap } from '@/features/flags/resolve-flag'
import { FEATURE_FLAGS } from '@/features/flags/feature-flag-keys'

describe('feature-flags · resolveFlag', () => {
  it('devuelve default cuando el map es undefined', () => {
    const r = resolveFlag('wrapped_v2', undefined)
    expect(r.enabled).toBe(FEATURE_FLAGS.wrapped_v2.default)
    expect(r.payload).toEqual({})
  })

  it('devuelve default cuando el flag no está en el map', () => {
    const map: FeatureFlagsMap = {}
    const r = resolveFlag('ai_coach', map)
    expect(r.enabled).toBe(FEATURE_FLAGS.ai_coach.default)
    expect(r.payload).toEqual({})
  })

  it('devuelve el valor del map cuando existe el flag', () => {
    const map: FeatureFlagsMap = {
      wrapped_v2: { enabled: true, payload: { variant: 'A' } },
    }
    const r = resolveFlag('wrapped_v2', map)
    expect(r.enabled).toBe(true)
    expect(r.payload).toEqual({ variant: 'A' })
  })

  it('devuelve enabled=false si el server lo desactivó aunque default sea true', () => {
    const map: FeatureFlagsMap = {
      wrapped_v2: { enabled: false, payload: {} },
    }
    const r = resolveFlag('wrapped_v2', map)
    expect(r.enabled).toBe(false)
  })
})
