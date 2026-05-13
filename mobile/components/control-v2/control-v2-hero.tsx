import { memo, useMemo } from 'react'
import type {
  ControlMockData,
  ControlView,
} from '@/features/insights/control-v2-mock'
import { ControlHeroTitular } from '@/components/control-hero-preview/control-hero-a-titular'
import type { ControlHeroState } from '@/components/control-hero-preview/control-hero-states'

interface ControlV2HeroProps {
  data: ControlMockData
  view: ControlView
  dailyGoalAmount: number | null
  dayLabel: string
}

/**
 * Production wrapper del nuevo hero card de Control. Adapta el output
 * del `useControlV2Data` (data + view) al shape `ControlHeroState` que
 * consume `ControlHeroTitular` — la variante A elegida por owner.
 *
 * Reemplaza al `ControlV2HoyCard` original. La HoyCard sigue en código
 * por si hay que rollback rápido (`mobile/components/control-v2/
 * control-v2-hoy-card.tsx`).
 */
function ControlV2HeroImpl({
  data,
  view,
  dailyGoalAmount,
  dayLabel,
}: ControlV2HeroProps) {
  const state = useMemo<ControlHeroState>(
    () => ({
      id: 'live',
      label: 'Live',
      description: 'Estado real del usuario',
      // Cupo del día
      cupoDiario: data.cupoDiario,
      gastoHoy: data.gastoHoy,
      libreHoy: view.libreHoy,
      delta: view.delta,
      estaOk: view.estaOk,
      alreadyExhausted: view.alreadyExhausted,
      // Tiempo
      diaLabel: dayLabel,
      diaActual: data.diaActual,
      diasMes: data.diasMes,
      diasRestantes: view.diasRestantes,
      proximoSueldoEnDias: data.proximoSueldoEnDias,
      horaActual: data.horaActual,
      minActual: data.minActual,
      horaF: data.horaActual + data.minActual / 60,
      // Proyección
      alcanzaElMes: view.alcanzaElMes,
      diaAgotamiento: view.diaAgotamiento,
      proyectadoMes: view.proyectadoMes,
      // Motivación
      racha: view.racha,
      diasGanadores: view.diasGanadores,
      closedDays: view.closedDays,
      momentum: view.momentum,
      noSpendCount: view.noSpendCount,
      // Optional · feed para futuras variantes
      dailyGoalAmount,
      score: view.score,
      scoreLabel: view.scoreLabel,
      // Summary signals · alimentan chips e insight line del hero,
      // pulled from las cards de detalle (Alcancía · VsMes · Patrón).
      vsMesDeltaPct: view.vsMesDeltaPct,
      vsMesMejor: view.vsMesMejor,
      vault: view.vault,
      mejorDowName: view.mejorDow?.name ?? null,
    }),
    [data, view, dailyGoalAmount, dayLabel],
  )

  return <ControlHeroTitular state={state} />
}

/**
 * Memo wrap. Hero card recibe el state object completo + se reevalúa
 * solo cuando uno de los campos cambia. La adapter useMemo arriba ya
 * estabiliza el state — esto cierra el cycle por si el parent re-
 * renderea por razones no relacionadas (e.g. tap del goal sheet,
 * pulse state change).
 */
export const ControlV2Hero = memo(ControlV2HeroImpl)
