import { describe, expect, it } from 'vitest'

const { neoConfirm, subscribeConfirm } = await import('@/lib/confirm-bus')
const { toast, subscribeToast } = await import('@/lib/toast-bus')

/**
 * Los dos buses de overlay (confirmación y toast) entregan al host MÁS
 * INTERNO, no a todos los suscriptos.
 *
 * Por qué es un invariante y no un detalle: un `<Modal>` nativo de iOS es
 * una presentación por encima de TODO el árbol React de la app. Un host
 * montado en la raíz (app-stack-shell) dibuja debajo de esa presentación,
 * y iOS descarta en silencio un segundo `<Modal>` presentado desde el
 * mismo view controller — sin error, sin log. Por eso una toma de
 * pantalla modal (el gate de suscripción, la baja de cuenta anidada)
 * monta su propio par de hosts: el que está adentro de la ventana nativa
 * es el único que el usuario puede ver.
 *
 * Con broadcast a todos los listeners, ese host interno no alcanzaba:
 * el host de la raíz también abría su hoja y `neoConfirm` quedaba con dos
 * preguntas vivas para la misma promesa. Entregar sólo al último
 * suscripto (= el más profundo, porque monta después) reproduce lo que
 * daba gratis `Alert.alert`: el diálogo aparece sobre lo que esté arriba.
 */
describe('confirm-bus — entrega al host más interno', () => {
  it('con dos hosts montados, sólo el interno recibe el pedido', async () => {
    const outer: string[] = []
    const inner: string[] = []

    const unsubOuter = subscribeConfirm((r) => {
      outer.push(r.title)
      r.resolve(false)
    })
    const unsubInner = subscribeConfirm((r) => {
      inner.push(r.title)
      r.resolve(true)
    })

    const confirmed = await neoConfirm('¿Cerrar sesión?')

    expect(inner).toEqual(['¿Cerrar sesión?'])
    expect(outer).toEqual([])
    expect(confirmed).toBe(true)

    unsubInner()
    unsubOuter()
  })

  it('cuando el host interno se desmonta, vuelve a mandar el de la raíz', async () => {
    const outer: string[] = []

    const unsubOuter = subscribeConfirm((r) => {
      outer.push(r.title)
      r.resolve(true)
    })
    const unsubInner = subscribeConfirm((r) => {
      r.resolve(false)
    })

    await neoConfirm('adentro')
    unsubInner()
    const confirmed = await neoConfirm('afuera')

    expect(outer).toEqual(['afuera'])
    expect(confirmed).toBe(true)

    unsubOuter()
  })

  it('sin ningún host resuelve false en vez de colgarse', async () => {
    await expect(neoConfirm('nadie escucha')).resolves.toBe(false)
  })
})

describe('toast-bus — entrega al host más interno', () => {
  it('con dos hosts montados, sólo el interno recibe el aviso', () => {
    const outer: string[] = []
    const inner: string[] = []

    const unsubOuter = subscribeToast((p) => outer.push(p.message))
    const unsubInner = subscribeToast((p) => inner.push(p.message))

    toast.error('no pudimos cerrar sesión')

    expect(inner).toEqual(['no pudimos cerrar sesión'])
    expect(outer).toEqual([])

    unsubInner()
    unsubOuter()
  })

  it('cuando el host interno se desmonta, vuelve a mandar el de la raíz', () => {
    const outer: string[] = []

    const unsubOuter = subscribeToast((p) => outer.push(p.message))
    const unsubInner = subscribeToast(() => {})

    toast.info('adentro')
    unsubInner()
    toast.info('afuera')

    expect(outer).toEqual(['afuera'])

    unsubOuter()
  })
})
