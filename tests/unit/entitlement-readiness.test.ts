import { describe, expect, it } from 'vitest'

const { isEntitlementResolved, BLOCKED_ENTITLEMENT } = await import(
  '@/features/billing/entitlement-snapshot'
)
type EntitlementQueryState = Parameters<typeof isEntitlementResolved>[0]

/**
 * `app-stack-shell` retiene el árbol de la app detrás del splash hasta que
 * este predicado dice que sí. Dos formas de romperlo, las dos caras:
 *  · demasiado permisivo → una cuenta con el acceso pausado pinta su Home
 *    real y recién después la tapa el gate (o peor: quien acaba de pagar
 *    ve un parpadeo del paywall servido desde el disco);
 *  · demasiado estricto → el splash se clava para siempre esperando un
 *    refetch que React Query no va a hacer porque el dato está fresco.
 */
const PENDING: EntitlementQueryState = {
  data: undefined,
  isError: false,
  isFetchedAfterMount: false,
  isStale: false,
}

describe('isEntitlementResolved', () => {
  it('espera mientras la primera respuesta del server no llegó', () => {
    expect(isEntitlementResolved({ ...PENDING, isStale: true })).toBe(false)
  })

  it('resuelve cuando la respuesta llegó en ESTA sesión', () => {
    expect(
      isEntitlementResolved({
        ...PENDING,
        data: BLOCKED_ENTITLEMENT,
        isFetchedAfterMount: true,
      }),
    ).toBe(true)
  })

  it('acepta el dato restaurado del disco mientras siga fresco', () => {
    // Sin esta rama el splash quedaría esperando un refetch que React
    // Query no dispara: dentro del staleTime el dato se considera vigente.
    expect(
      isEntitlementResolved({
        ...PENDING,
        data: BLOCKED_ENTITLEMENT,
        isStale: false,
      }),
    ).toBe(true)
  })

  it('NO acepta el dato del disco cuando ya está stale', () => {
    // Es el caso de quien acaba de pagar: el valor viejo diría "pausado".
    // Hay que esperar la palabra fresca del server.
    expect(
      isEntitlementResolved({
        ...PENDING,
        data: BLOCKED_ENTITLEMENT,
        isStale: true,
      }),
    ).toBe(false)
  })

  it('deja pasar si el RPC falló — el gate ya falla abierto sin dato', () => {
    expect(
      isEntitlementResolved({ ...PENDING, isError: true, isStale: true }),
    ).toBe(true)
  })

  it('el error gana aunque no haya dato ninguno', () => {
    expect(
      isEntitlementResolved({
        data: null,
        isError: true,
        isFetchedAfterMount: false,
        isStale: true,
      }),
    ).toBe(true)
  })
})
