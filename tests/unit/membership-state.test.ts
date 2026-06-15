import { describe, expect, it } from 'vitest'
import {
  membershipVariant,
  formatDate,
} from '@/features/billing/membership-state'

const base = {
  source: 'family' as const,
  subscriptionStatus: 'active',
  autoRenew: true,
  expiresAt: '2027-06-14T12:00:00Z',
  graceExpiresAt: null as string | null,
  isPurchaser: true,
}

describe('formatDate', () => {
  it('formatea es-AR corto en UTC', () => {
    expect(formatDate('2027-06-14T12:00:00Z')).toBe('14 jun 2027')
  })
  it('null → guion', () => {
    expect(formatDate(null)).toBe('—')
    expect(formatDate('no-date')).toBe('—')
  })
})

describe('membershipVariant', () => {
  it('activa con auto-renovación (comprador) → ACTIVA / Se renueva / change / canManage', () => {
    const v = membershipVariant(base)
    expect(v.tone).toBe('active')
    expect(v.statusLabel).toBe('ACTIVA')
    expect(v.heroLine).toBe('Se renueva el 14 jun 2027')
    expect(v.primaryAction).toBe('change')
    expect(v.canManage).toBe(true)
  })

  it('miembro CUBIERTO por el hogar (family, !isPurchaser) → MIEMBRO / sin acción / !canManage', () => {
    const v = membershipVariant({ ...base, isPurchaser: false })
    expect(v.tone).toBe('active')
    expect(v.statusLabel).toBe('MIEMBRO DEL HOGAR')
    expect(v.heroLine).toBe('Tu hogar cubre tu acceso')
    expect(v.primaryAction).toBeNull()
    expect(v.canManage).toBe(false)
  })

  it('miembro cubierto NO ve el warning de gracia del comprador', () => {
    // Aunque la sub del hogar esté en gracia, el miembro cubierto ve su acceso,
    // no el estado de pago ajeno (que no puede accionar).
    const v = membershipVariant({
      ...base,
      isPurchaser: false,
      subscriptionStatus: 'grace',
      graceExpiresAt: '2026-06-18T00:00:00Z',
    })
    expect(v.statusLabel).toBe('MIEMBRO DEL HOGAR')
    expect(v.primaryAction).toBeNull()
  })

  it('auto-renovación off → NO SE RENOVARÁ / Habilitado hasta / reactivate', () => {
    const v = membershipVariant({ ...base, autoRenew: false })
    expect(v.tone).toBe('warn')
    expect(v.statusLabel).toBe('NO SE RENOVARÁ')
    expect(v.heroLine).toBe('Habilitado hasta 14 jun 2027')
    expect(v.primaryAction).toBe('reactivate')
  })

  it('gracia → PROBLEMA DE PAGO / Reintentando hasta / fixPayment', () => {
    const v = membershipVariant({
      ...base,
      subscriptionStatus: 'grace',
      graceExpiresAt: '2026-06-18T00:00:00Z',
    })
    expect(v.tone).toBe('warn')
    expect(v.statusLabel).toBe('PROBLEMA DE PAGO')
    expect(v.heroLine).toBe('Reintentando hasta 18 jun 2026')
    expect(v.primaryAction).toBe('fixPayment')
  })

  it('comped → CORTESÍA / sin acción / !canManage', () => {
    const v = membershipVariant({ ...base, source: 'comped' })
    expect(v.tone).toBe('comped')
    expect(v.statusLabel).toBe('CORTESÍA')
    expect(v.primaryAction).toBeNull()
    expect(v.canManage).toBe(false)
  })

  it('mvp → MVP / acceso total de por vida / sin acción / !canManage', () => {
    const v = membershipVariant({ ...base, source: 'mvp' })
    expect(v.statusLabel).toBe('MVP')
    expect(v.heroLine).toBe('Acceso total de por vida')
    expect(v.primaryAction).toBeNull()
    expect(v.canManage).toBe(false)
  })
})
