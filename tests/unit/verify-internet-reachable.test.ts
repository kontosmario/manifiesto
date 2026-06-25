import { afterEach, describe, expect, it, vi } from 'vitest'
import { verifyInternetReachable } from '@/lib/verify-internet-reachable'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

// Mock de fetch que decide la respuesta según la URL pedida.
function mockFetch(handler: (url: string) => { status: number } | Promise<never>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      const res = await handler(input) // si handler rechaza → fetch rechaza
      return res as unknown as Response
    }),
  )
}

describe('verifyInternetReachable', () => {
  it('todas las probes fallan (sin red) → false', async () => {
    mockFetch(() => Promise.reject(new Error('network')))
    expect(await verifyInternetReachable({ timeoutMs: 50 })).toBe(false)
  })

  it('un generate_204 responde 204 → true (hay internet real)', async () => {
    mockFetch((url) =>
      url.includes('gstatic.com/generate_204') ? { status: 204 } : Promise.reject(new Error('x')),
    )
    expect(await verifyInternetReachable({ timeoutMs: 50 })).toBe(true)
  })

  it('captive portal (intercepta los generate_204 con 200) → false', async () => {
    // Todos los probes son generate_204 con check 204-estricto; un portal que
    // responde 200 a todos NO confirma → se trata como sin internet real.
    mockFetch(() => ({ status: 200 }))
    expect(await verifyInternetReachable({ timeoutMs: 50 })).toBe(false)
  })

  it('Google bloqueado pero Cloudflare responde 204 → true (diversidad de proveedor)', async () => {
    mockFetch((url) =>
      url.includes('cp.cloudflare.com') ? { status: 204 } : Promise.reject(new Error('blocked')),
    )
    expect(await verifyInternetReachable({ timeoutMs: 50 })).toBe(true)
  })

  it('signal ya abortado → false sin pegar a la red', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const controller = new AbortController()
    controller.abort()
    expect(await verifyInternetReachable({ signal: controller.signal })).toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
