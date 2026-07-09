import { describe, it, expect } from 'vitest'
import { resolveControlMessage } from '@/components/control-hero-preview/control-hero-helpers'
import {
  CONTROL_HERO_STATES,
  type ControlHeroState,
} from '@/components/control-hero-preview/control-hero-states'

/**
 * `resolveControlMessage` elige la variante `_dynamic` de los secondaries
 * cuando `incomeMode === 'dynamic'` (no hay cobro → el marco es "fin de
 * ciclo"). Los asserts van contra el copy ES REAL de
 * mobile/lib/i18n/locales/es/control.json (el env de test fuerza 'es').
 */

function findState(id: string): ControlHeroState {
  const state = CONTROL_HERO_STATES.find((s) => s.id === id)
  if (!state) throw new Error(`estado de preview no encontrado: ${id}`)
  return state
}

describe('resolveControlMessage — marco dinámico vs fixed', () => {
  describe('exhausto (pasado del cupo total del ciclo)', () => {
    // Fixture real del preview: proximoSueldoEnDias 8, libreHoy -13.000.
    const exhausto = findState('exhausto')

    it("incomeMode 'dynamic' → secondary habla de cerrar el ciclo (key *Dynamic)", () => {
      const msg = resolveControlMessage({ ...exhausto, incomeMode: 'dynamic' })
      expect(msg.primary).toBe('Te pasaste del mes.')
      expect(msg.secondary).toBe(
        'Faltan 8 días para cerrar el ciclo. Cuida lo que queda.',
      )
      expect(msg.status).toBe('urgent')
      expect(msg.primaryLabel).toBe('POR ENCIMA')
      // exceso = |libreHoy| del fixture
      expect(msg.primaryNumber).toBe(13_000)
    })

    it("incomeMode omitido (default fixed) → secondary con marco 'al cobro'", () => {
      const msg = resolveControlMessage({ ...exhausto, incomeMode: undefined })
      expect(msg.secondary).toBe('Faltan 8 días al cobro. Cuida lo que queda.')
    })

    it("incomeMode 'fixed' explícito produce el mismo copy que el default", () => {
      const explicit = resolveControlMessage({ ...exhausto, incomeMode: 'fixed' })
      const implicit = resolveControlMessage({ ...exhausto, incomeMode: undefined })
      expect(explicit.secondary).toBe(implicit.secondary)
    })
  })

  describe('noAlcanza (proyección agota la plata antes del cobro)', () => {
    // Fixture real del preview: diaAgotamiento 24, diaActual 14 → 10 días.
    const noAlcanza = findState('no_alcanza')

    it("incomeMode 'dynamic' → secondary con marco 'fin del ciclo'", () => {
      const msg = resolveControlMessage({ ...noAlcanza, incomeMode: 'dynamic' })
      expect(msg.primary).toBe('Te quedas sin plata en 10 días.')
      expect(msg.secondary).toBe('Baja el ritmo o llegas justo al fin del ciclo.')
      expect(msg.status).toBe('urgent')
      expect(msg.primaryLabel).toBe('DÍAS HASTA AGOTAR')
      expect(msg.primaryNumber).toBe(10)
      expect(msg.primaryIsDays).toBe(true)
    })

    it("incomeMode omitido (default fixed) → secondary con marco 'al cobro'", () => {
      const msg = resolveControlMessage({ ...noAlcanza, incomeMode: undefined })
      expect(msg.secondary).toBe('Baja el ritmo o llegas justo al cobro.')
    })

    it('plural: 1 día restante usa la forma singular del primary', () => {
      const msg = resolveControlMessage({
        ...noAlcanza,
        diaActual: 23,
        diaAgotamiento: 24,
      })
      expect(msg.primary).toBe('Te quedas sin plata en 1 día.')
      expect(msg.primaryNumber).toBe(1)
    })
  })
})
