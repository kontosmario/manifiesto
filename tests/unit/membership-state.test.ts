import { describe, expect, it } from 'vitest'
import {
  membershipVariant,
  formatDate,
} from '@/features/billing/membership-state'

const base = {
  source: 'subscription' as const,
  subscriptionStatus: 'active',
  autoRenew: true,
  expiresAt: '2027-06-14T12:00:00Z',
  graceExpiresAt: null as string | null,
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
  it('activa con auto-renovación → ACTIVA / Se renueva / change', () => {
    const v = membershipVariant(base)
    expect(v.tone).toBe('active')
    expect(v.statusLabel).toBe('ACTIVA')
    expect(v.heroLine).toBe('Se renueva el 14 jun 2027')
    expect(v.primaryAction).toBe('change')
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

  it('comped → CORTESÍA / sin acción', () => {
    const v = membershipVariant({ ...base, source: 'comped' })
    expect(v.tone).toBe('comped')
    expect(v.statusLabel).toBe('CORTESÍA')
    expect(v.primaryAction).toBeNull()
  })
})
