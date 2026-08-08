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
    expect(resolveCategoryForMerchant(history, 'STARBUCKS COFFEE')).not.toBe('salidas')
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
})
