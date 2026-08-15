import { describe, it, expect } from 'vitest'
import { buildMovRowVM } from '@/features/gastos/build-mov-row-vm'
import type { MovementItem } from '@/features/gastos/gastos-helpers'
import i18n from '@/lib/i18n'

// Fixture de expense con las columnas reales de `public.expenses`
// (baseline 20260413154000 + alters). Cast final porque el tipo
// `Expense` del cliente puede declarar campos derivados extra.
const expense = {
  id: 'exp-1',
  family_id: 'fam-1',
  category_id: 'cat-super',
  description: 'Verdulería',
  price: 12500,
  created_by: 'user-1',
  created_at: '2026-06-05T14:30:00Z',
  commitment_id: null,
  archived_at: null,
  notes: null,
  paid_in_arrears: false,
}

const income = {
  id: 'inc-1',
  family_id: 'fam-1',
  created_by: 'user-1',
  amount: 50000,
  kind: 'freelance' as const,
  description: 'Laburo suelto',
  event_date: '2026-06-05',
  created_at: '2026-06-05T09:00:00Z',
}

describe('buildMovRowVM', () => {
  it('gasto → VM con title, monto formateado y catName resuelto', () => {
    const item = { kind: 'expense', iso: '2026-06-05', expense } as MovementItem
    // Las SHAPES exactas de los values de ambos mapas salen del Step 1;
    // este es el mínimo que el builder consume — ampliar si usa más campos.
    const vm = buildMovRowVM({
      item,
      categoriesById: new Map([['cat-super', { id: 'cat-super', name: 'Supermercado', color: '#7BB662' }]]) as never,
      memberById: new Map([['user-1', { id: 'user-1', name: 'Mario', color: '#000' }]]),
      t: i18n.t,
    })
    expect(vm.kind).toBe('expense')
    expect(vm.emoji).toBe('🧾')
    expect(vm.tile).toBe('mint')
    expect(vm.title).toBe('Verdulería')
    expect(vm.catName).toBe('Supermercado')
    expect(vm.amount).toContain('12.500')
    // Signo menos "real" (U+2212), no el guion ASCII.
    expect(vm.amount.startsWith('−')).toBe(true)
    expect(vm.sub).toContain('Mario')
    expect(vm.sub).toContain('Supermercado')
  })

  it('gasto → catName usa rawName crudo cuando la categoría lo declara', () => {
    const item = { kind: 'expense', iso: '2026-06-05', expense } as MovementItem
    const vm = buildMovRowVM({
      item,
      categoriesById: new Map([
        ['cat-super', { id: 'cat-super', name: 'Supermercado', rawName: 'supermercado', color: '#7BB662' }],
      ]) as never,
      memberById: new Map([['user-1', { id: 'user-1', name: 'Mario', color: '#000' }]]),
      t: i18n.t,
    })
    // `rawName` es la fuente para resolver ícono/color por nombre — el sticker
    // real necesita el crudo, no el localizado.
    expect(vm.catName).toBe('supermercado')
  })

  it('gasto sin descripción → title cae al nombre de categoría', () => {
    const item = {
      kind: 'expense',
      iso: '2026-06-05',
      expense: { ...expense, description: '' },
    } as MovementItem
    const vm = buildMovRowVM({
      item,
      categoriesById: new Map([['cat-super', { id: 'cat-super', name: 'Supermercado', color: '#7BB662' }]]) as never,
      memberById: new Map([['user-1', { id: 'user-1', name: 'Mario', color: '#000' }]]),
      t: i18n.t,
    })
    expect(vm.title).toBe('Supermercado')
  })

  it('gasto sin categoría ni miembro conocidos → cae a los fallbacks de i18n', () => {
    const item = {
      kind: 'expense',
      iso: '2026-06-05',
      expense: { ...expense, description: '' },
    } as MovementItem
    const vm = buildMovRowVM({
      item,
      categoriesById: new Map(),
      memberById: new Map(),
      t: i18n.t,
    })
    expect(vm.sub).toBe('Alguien · Sin categoría')
    expect(vm.catName).toBeUndefined()
  })

  it('ingreso → VM con emoji del kind, monto con signo + y sin catName', () => {
    const item = { kind: 'income', iso: '2026-06-05', income } as MovementItem
    const vm = buildMovRowVM({
      item,
      categoriesById: new Map(),
      memberById: new Map([['user-1', { id: 'user-1', name: 'Mario', color: '#000' }]]),
      t: i18n.t,
    })
    expect(vm.kind).toBe('income')
    expect(vm.emoji).toBe('💻')
    expect(vm.title).toBe('Laburo suelto')
    expect(vm.amount).toBe('+$50.000')
    expect(vm.catName).toBeUndefined()
    expect(vm.sub).toContain('Mario')
  })
})
