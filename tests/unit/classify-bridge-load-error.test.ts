import { describe, expect, it } from 'vitest'
import { classifyBridgeLoadError } from '@/features/auth-flow/classify-bridge-load-error'

// Contexto: Apple Review rechazó 1.0(11) (2.1a) porque un blip transitorio
// post-login mostró "No internet connection" con la conexión ACTIVA del
// reviewer. La regla central: solo se acusa "sin conexión" cuando la
// verificación ACTIVA (round-trip real) confirmó que NO hay internet.

describe('classifyBridgeLoadError', () => {
  it('sin internet verificado → network, sin importar el mensaje', () => {
    expect(classifyBridgeLoadError('Network request failed', false)).toBe('network')
    expect(classifyBridgeLoadError('cualquier cosa', false)).toBe('network')
    expect(classifyBridgeLoadError(undefined, false)).toBe('network')
  })

  it('con internet verificado, un error de transporte es demora (timeout), NUNCA "sin conexión"', () => {
    // El caso exacto del rechazo de Apple: RN fetch tira TypeError
    // "Network request failed" aunque el usuario tenga internet.
    expect(classifyBridgeLoadError('Network request failed', true)).toBe('timeout')
    expect(classifyBridgeLoadError('fetch failed', true)).toBe('timeout')
    expect(classifyBridgeLoadError('The request timed out', true)).toBe('timeout')
    expect(classifyBridgeLoadError('Aborted', true)).toBe('timeout')
    expect(classifyBridgeLoadError('Software caused connection abort', true)).toBe('timeout')
    expect(classifyBridgeLoadError('Could not connect to the server.', true)).toBe('timeout')
  })

  it('con internet verificado y error no-transporte → unknown', () => {
    expect(classifyBridgeLoadError('JSON Parse error: Unexpected token', true)).toBe('unknown')
    expect(classifyBridgeLoadError('permission denied for table expenses', true)).toBe('unknown')
    expect(classifyBridgeLoadError(undefined, true)).toBe('unknown')
    expect(classifyBridgeLoadError('', true)).toBe('unknown')
  })
})
