import { describe, expect, it } from 'vitest'
import { normalizeMerchant } from '../../mobile/features/apple-pay-capture/normalize-merchant'
import { resolveCategoryForMerchant } from '../../mobile/features/apple-pay-capture/resolve-category-for-merchant'

describe('normalizeMerchant', () => {
  it('pasa a mayúsculas y saca acentos', () => {
    expect(normalizeMerchant('Almacén Doña Rosa')).toBe('ALMACEN DONA ROSA')
  })

  it('saca el número de sucursal', () => {
    expect(normalizeMerchant('STARBUCKS COFFEE #4521')).toBe('STARBUCKS COFFEE')
  })

  it('saca tokens puramente numéricos', () => {
    expect(normalizeMerchant('COTO 1234 CABA')).toBe('COTO CABA')
  })

  it('colapsa espacios y puntuación', () => {
    expect(normalizeMerchant('  MC.DONALDS   S.A.  ')).toBe('MC DONALDS S A')
  })

  it('devuelve cadena vacía cuando no queda nada', () => {
    expect(normalizeMerchant('   ')).toBe('')
    expect(normalizeMerchant('#123')).toBe('')
  })
})

describe('resolveCategoryForMerchant', () => {
  const history = [
    { description: 'Starbucks', categoryId: 'cafe', createdAt: '2026-08-01T12:00:00Z' },
    { description: 'Coto', categoryId: 'super', createdAt: '2026-08-05T12:00:00Z' },
    { description: 'Starbucks Palermo', categoryId: 'salidas', createdAt: '2026-08-07T12:00:00Z' },
  ]

  it('hereda la categoría de la entrada cuyos tokens están contenidos', () => {
    // "STARBUCKS COFFEE" contiene a "Starbucks" → matchea.
    // NO matchea "Starbucks Palermo", aunque sea más reciente: COFFEE no
    // está ahí. El match es por subconjunto, a propósito.
    expect(resolveCategoryForMerchant(history, 'STARBUCKS COFFEE #4521')).toBe('cafe')
  })

  it('el sufijo distinto NO alcanza para matchear', () => {
    // Semántica conservadora: relajarla a "comparten el primer token"
    // haría matchear BANCO NACION con BANCO GALICIA. Preferimos no
    // sugerir antes que sugerir mal.
    // Hereda de "Starbucks" (contenido) y NO de "Starbucks Palermo".
    expect(resolveCategoryForMerchant(history, 'STARBUCKS COFFEE')).toBe('cafe')
  })

  it('gana el más reciente entre los que sí matchean', () => {
    // "Starbucks" está contenido tanto en "Starbucks" como en
    // "Starbucks Palermo" → desempata la recencia.
    expect(resolveCategoryForMerchant(history, 'Starbucks')).toBe('salidas')
  })

  it('matchea exacto ignorando acentos y mayúsculas', () => {
    expect(resolveCategoryForMerchant(history, 'coto')).toBe('super')
  })

  it('devuelve null cuando no hay match', () => {
    expect(resolveCategoryForMerchant(history, 'FARMACITY')).toBeNull()
  })

  it('devuelve null con historial vacío', () => {
    expect(resolveCategoryForMerchant([], 'Starbucks')).toBeNull()
  })

  it('devuelve null con comercio vacío', () => {
    expect(resolveCategoryForMerchant(history, '   ')).toBeNull()
  })

  it('no matchea por un token genérico compartido', () => {
    const noisy = [
      { description: 'Kiosco de la esquina', categoryId: 'varios', createdAt: '2026-08-01T12:00:00Z' },
    ]
    expect(resolveCategoryForMerchant(noisy, 'Bar de la esquina')).toBeNull()
  })

  it('matchea comercios cuyo nombre es un sustantivo común', () => {
    // "La Esquina" es un nombre de bar comunísimo. Con ESQUINA en las
    // stopwords se quedaba sin tokens significativos y la sugerencia moría
    // para siempre en ese comercio. Lo que separa "Bar de la esquina" de
    // "Kiosco de la esquina" son DE/LA, que sí siguen siendo stopwords.
    const bar = [
      { description: 'La Esquina', categoryId: 'salidas', createdAt: '2026-08-01T12:00:00Z' },
    ]
    expect(resolveCategoryForMerchant(bar, 'LA ESQUINA')).toBe('salidas')
  })

  it('desempata por el instante real, no por el string de la fecha', () => {
    // `2026-08-07T23:00:00-03:00` (= 08-08 02:00Z) es POSTERIOR a
    // `2026-08-08T01:00:00Z`, aunque textualmente parezca anterior.
    const mixedOffsets = [
      { description: 'Coto', categoryId: 'super', createdAt: '2026-08-08T01:00:00Z' },
      { description: 'Coto', categoryId: 'varios', createdAt: '2026-08-07T23:00:00-03:00' },
    ]
    expect(resolveCategoryForMerchant(mixedOffsets, 'COTO')).toBe('varios')
  })
})
