// mobile/features/home/use-month-close-orchestration.ts
//
// FASE 0 del cableado del rediseño: orquestación del cierre de mes
// (wrapped + decisión del sobrante) extraída LITERAL de
// home-dashboard.tsx para que la Home vieja y la nueva (neo) consuman
// exactamente el mismo comportamiento. Cero cambios de lógica.
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { TFunction } from 'i18next'
import { useQueryClient } from '@tanstack/react-query'
import {
  monthCloseDecisionQueryKey,
  useApplyMonthCloseDecision,
  useMonthCloseDecisionPending,
  type ApplyDecisionInput,
} from '@/features/month-close/use-month-close-decision'
import { computeSobranteFromSummary } from '@/features/month-close/sobrante'
import {
  controlIntelligenceQueryKey,
  useControlIntelligence,
} from '@/features/insights/use-control-v2-data'
import type { MonthlySummaryHistory } from '@/features/insights/control-v2-adapter'
import { buildWrappedPayloadFromSummary } from '@/features/wrapped/build-wrapped-payload'
import { useMarkCycleWrappedSeen } from '@/features/wrapped/use-mark-cycle-wrapped-seen'
import { triggerCycleWrapped } from '@/lib/cycle-wrapped-emitter'
import { supabase } from '@/lib/supabase'
import { toast } from '@/lib/toast-bus'

/**
 * Tiempo de espera entre confirm-cobro y wrapped fire. El trigger DB
 * `trg_family_finance_salary_confirm` corre `try_close_previous_cycle`
 * que crea el `monthly_summaries` row al confirmar el cobro. 700ms
 * cubren: roundtrip al confirm + ejecución del trigger + propagación
 * del refetch de `controlIntelligenceQueryKey` y `pendingDecision`.
 * Si la red está particularmente lenta y el refetch trae stale, el
 * código hace fallback al sheet standalone (ver `setWrappedInFlight`
 * release paths abajo).
 */
const WRAPPED_TRIGGER_WAIT_MS = 700

interface UseMonthCloseOrchestrationParams {
  familyId: string
  /** userId via auth session — necesario para que `syncAllAfterMutation`
   *  invalide home_snapshot / control snapshot / streaks tras la
   *  decisión (Code review H1, sprint A 2026-06-08). */
  sessionUserId: string | undefined
  isOnboardingFlow: boolean
  isDynamicIncome: boolean
  /** Payday llegó y el cobro no está confirmado (`isPaydayPending`). */
  pending: boolean
  /** Gate compartido: ningún sheet aparece con el overlay de transición visible. */
  splashIsHidden: boolean
  categoryNameById: Map<string, string>
  activeGoalForSheet: { id: string; title: string; emoji: string } | null
  t: TFunction
  /**
   * `false` en la ruta dev de preview de la Home neo (`preview`): con la
   * Home vieja live montada en paralelo (freezeOnBlur:false), este hook
   * corre en DOS instancias y sus efectos auto-side-effectful colisionan
   * (doble auto-open del MonthCloseDecisionSheet — Modals nativos apilados
   * — y doble auto-fire del wrapped con doble mark-seen). Gateando en
   * `enabled` la instancia de preview no dispara ninguno de los dos
   * efectos; los handlers manuales (apply/skip/fireWrapped tras confirmar
   * en el sheet) siguen operativos. Default `true` (live intacto).
   */
  enabled?: boolean
}

export function useMonthCloseOrchestration({
  familyId,
  sessionUserId,
  isOnboardingFlow,
  isDynamicIncome,
  pending,
  splashIsHidden,
  categoryNameById,
  activeGoalForSheet,
  t,
  enabled = true,
}: UseMonthCloseOrchestrationParams) {
  const queryClient = useQueryClient()
  const [decisionSheetOpen, setDecisionSheetOpen] = useState(false)
  // Lock para evitar race entre standalone sheet y wrapped tras confirm
  // cobro: el confirm flippea pending → false → el useEffect del
  // standalone correría con pending=false, pero el wrapped tarda 700ms
  // en dispararse y ahí la decisión va integrada. Mantenemos lockeado el
  // standalone durante esa ventana.
  const [wrappedInFlight, setWrappedInFlight] = useState(false)

  // Spec B — month-close leftover decision. Detecta sobrante del mes
  // pasado y abre el sheet automáticamente cuando hay decisión pendiente.
  const pendingDecision = useMonthCloseDecisionPending(familyId)
  const applyDecision = useApplyMonthCloseDecision(familyId, sessionUserId)

  // Dinámico: el Wrapped del ciclo recién cerrado se auto-dispara desde
  // el Home (el path fixed lo dispara al confirmar el cobro, acción que
  // no existe en este modo). La query solo se enciende en dinámico ('' la
  // apaga); el flag también frena el sheet standalone de decisión para
  // que la decisión viaje DENTRO del wrapped (Spec B) y no se pisen.
  const intelligenceForWrapped = useControlIntelligence(
    isDynamicIncome ? familyId : '',
  )
  const dynamicWrappedPending = useMemo(() => {
    if (!isDynamicIncome) return false
    const latest = intelligenceForWrapped.data?.summaries?.[0]
    if (!latest?.id) return false
    if (latest.wrapped_seen_at) return false
    return (latest.expenses_count ?? 0) > 0
  }, [isDynamicIncome, intelligenceForWrapped.data])

  // Auto-open del MonthCloseDecisionSheet cuando hay sobrante del mes
  // pasado sin decidir. Track del último summary id "mostrado" en este
  // mount para que NO se reabra apenas el user cierra. Cuando el
  // componente se re-monta (vuelve a Home tras navegar fuera), el ref
  // se resetea y la sheet vuelve a aparecer si el pending sigue ahí.
  //
  // Gate adicional: esperamos a que el auth-transition splash (el fern
  // entrance ~2.4s + idle breath) termine. Sin esto el sheet aparece
  // sobre el splash y se ve mal — el user todavía está mirando la
  // animación de "entrando a Manifiesto".
  const lastShownDecisionIdRef = useRef<string | null>(null)
  useEffect(() => {
    // Preview (Home neo dev-route): no auto-abrimos el sheet standalone —
    // la Home vieja live ya orquesta el cierre de mes.
    if (!enabled) return
    if (!splashIsHidden) return
    // Gate clave (2026-06-05): la decisión sobre el saldo a favor es
    // parte del flujo POST-confirm-cobro. Si el user todavía no
    // confirmó el cobro del cycle activo, NO disparamos el sheet
    // standalone — primero tiene que pasar por "Ya cobré". Después
    // de confirmar, el camino principal es el wrapped integrado
    // (`fireWrappedForClosedCycle` → closing scene). Si wrapped no
    // arranca (e.g., expenses_count=0), este sheet standalone es el
    // fallback que aparece para que el user igual pueda decidir.
    if (pending) return
    // Lock activo durante los 700ms post-confirm-cobro: el wrapped está
    // por dispararse con la decisión integrada. NO abrimos el sheet
    // standalone hasta saber si wrapped arrancó o si terminó haciendo
    // early-return (caso expenses_count=0, en el que el standalone SÍ es
    // el fallback correcto).
    if (wrappedInFlight) return
    // Dinámico: la decisión de abrir el sheet standalone depende de si
    // hay un wrapped sin ver (dynamicWrappedPending), y eso recién se
    // sabe cuando intelligence hidrata. Sin este gate, en cold start el
    // sheet (Modal NATIVO) se abría primero y el wrapped (overlay View)
    // quedaba reproduciéndose INVISIBLE detrás, ya marcado como visto.
    // Si la query falla, isError destraba y el sheet opera como siempre.
    if (
      isDynamicIncome &&
      intelligenceForWrapped.data === undefined &&
      !intelligenceForWrapped.isError
    )
      return
    // Dinámico con wrapped sin ver: el auto-fire del wrapped (efecto de
    // más abajo) va a llevar la decisión integrada en la closing scene —
    // abrir el sheet standalone acá lo pisaría. Si el user saltea la
    // decisión dentro del wrapped, el pending sigue en DB y este sheet
    // reaparece en el próximo mount (ya sin dynamicWrappedPending).
    if (dynamicWrappedPending) return
    if (
      pendingDecision &&
      lastShownDecisionIdRef.current !== pendingDecision.monthlySummaryId
    ) {
      lastShownDecisionIdRef.current = pendingDecision.monthlySummaryId
      // eslint-disable-next-line react-hooks/set-state-in-effect -- abre el sheet de decisión cuando hay pending; guard por ref evita re-disparos
      setDecisionSheetOpen(true)
    }
  }, [
    enabled,
    pendingDecision,
    splashIsHidden,
    pending,
    wrappedInFlight,
    dynamicWrappedPending,
    isDynamicIncome,
    intelligenceForWrapped.data,
    intelligenceForWrapped.isError,
  ])

  // `.mutateAsync`/`.mutate` son estables por contrato de React Query;
  // el objeto de useMutation NO (identidad nueva por render). Depender
  // del objeto anulaba los useCallback de abajo y re-corría el efecto
  // de auto-fire del wrapped en cada render (review 2026-07-08).
  const applyDecisionMutateAsync = applyDecision.mutateAsync
  const handleApplyDecision = useCallback(
    async (input: ApplyDecisionInput) => {
      // Sin catch esto era un unhandled rejection: el RPC puede fallar
      // (rate limit, anchor guard, red) y el sheet quedaba colgado con
      // un "Uncaught (in promise)" en consola. El sheet queda abierto
      // para reintentar.
      try {
        await applyDecisionMutateAsync(input)
        setDecisionSheetOpen(false)
      } catch {
        toast.error(t('home:dashboard.saveDecisionError'))
      }
    },
    [applyDecisionMutateAsync],
  )

  // "Decidir más tarde" cierra el sheet pero NO persiste una decisión
  // 'skip' en DB. La query sigue devolviendo el row pendiente y la
  // sheet vuelve a aparecer en el próximo mount de Home. Solo
  // meta/acumular/reserva la hacen desaparecer realmente.
  // (V1 persistía 'skip' aquí; UX confuso — el copy dice "después" pero
  // el comportamiento era "nunca más". Removido.)
  const handleSkipDecision = useCallback(() => {
    setDecisionSheetOpen(false)
  }, [])

  const handleDecisionSheetClose = useCallback(() => {
    if (applyDecision.isPending) return
    setDecisionSheetOpen(false)
  }, [applyDecision.isPending])

  // Declarado ANTES de fireWrappedForClosedCycle: el flujo de auto-fire
  // dinámico stampa como visto el summary REALMENTE reproducido.
  const markWrappedSeenHome = useMarkCycleWrappedSeen(familyId)
  const markWrappedSeenMutate = markWrappedSeenHome.mutate
  // Dispara el "Manifiesto Wrapped" del ciclo recién cerrado. Gating:
  //   - Solo en flow recurrente (NO en onboarding — el primer cobro
  //     no cierra nada).
  //   - Skip si no hay summary (race / primer cobro / familia nueva).
  //   - Skip si la summary no tiene gastos (ciclo vacío, no hay
  //     historia que contar).
  // El DB trigger `trg_family_finance_salary_confirm` cierra el ciclo
  // sync con el upsert. Por eso esperamos un wait corto post-haptic y
  // luego invalidamos la cache + refetch para leer la summary fresca.
  const fireWrappedForClosedCycle = useCallback(async (opts?: {
    /** Auto-fire dinámico: stampa wrapped_seen_at del summary que
     *  realmente se reproduce (el más nuevo por query directa) — marcar
     *  el [0] del cache de intelligence podía divergir si un cierre
     *  nuevo aterrizó entre el warm del cache y este fire. */
    markSeenAfterPlay?: boolean
  }) => {
    if (isOnboardingFlow) return
    // Lock SINCRONO: evita que el sheet standalone se abra durante el
    // wait + refetch. Se libera en TODOS los early-return y al final
    // del flujo, garantizando que el standalone funcione como fallback
    // cuando wrapped no arranca.
    setWrappedInFlight(true)
    await new Promise<void>((resolve) => setTimeout(resolve, WRAPPED_TRIGGER_WAIT_MS))
    await Promise.all([
      queryClient.refetchQueries({
        queryKey: controlIntelligenceQueryKey(familyId),
        type: 'active',
      }),
      queryClient.invalidateQueries({
        queryKey: monthCloseDecisionQueryKey(familyId),
      }),
    ])
    // BUG FIX v2 (2026-06-22): traemos la edición RECIÉN CERRADA con una query
    // DIRECTA — la summary de mayor `period_start` (el ciclo más nuevo). NO la
    // sacamos del cache (llegaba stale → reproducía la edición anterior) ni vía
    // `dashboard.monthlyAccounting.start`, que JUSTO post-confirm queda con el
    // anchor VIEJO del ciclo recién cerrado (Mayo, 2026-05-20) → matcheaba la
    // edición ANTERIOR (Abril, cuyo period_end es 2026-05-20). El ciclo recién
    // cerrado es SIEMPRE el de mayor period_start. Reintento corto por la
    // latencia/commit del trigger de cierre.
    let latest: MonthlySummaryHistory | null = null
    for (let i = 0; i < 5 && !latest; i++) {
      if (i > 0) await new Promise<void>((r) => setTimeout(r, 300))
      const { data } = await supabase
        .from('monthly_summaries')
        .select(
          'id, period_start, period_end, period_label, total_variable_spent, total_spent, expenses_count, monthly_income, savings_delta, extra_income, savings_goal_amount, category_breakdown, daily_totals, by_member, top_expense, delta_vs_previous_percent, mood, wrapped_seen_at',
        )
        .eq('family_id', familyId)
        .order('period_start', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (data) latest = data as MonthlySummaryHistory
    }
    if (!latest) {
      setWrappedInFlight(false)
      return
    }
    if ((latest.expenses_count ?? 0) === 0) {
      // Wrapped no arranca (sin historia). Liberamos el lock para que
      // el standalone se abra como fallback con la decisión pendiente.
      setWrappedInFlight(false)
      return
    }

    // Spec B integration — si el summary recién cerrado matchea con la
    // decisión pendiente y el sobrante supera umbral, lo pasamos al
    // payload para que la closing scene del wrapped maneje la decisión
    // inline en vez del MonthCloseDecisionSheet standalone.
    const summaryId = (latest as { id?: string }).id ?? null
    // Fórmula canónica (sobrante.ts) — antes restaba `savings_delta`
    // (el sobrante mismo según el server) y daba 0 siempre: la sección
    // "Y TE SOBRARON" del wrapped no aparecía para nadie.
    const sobranteFromSummary = computeSobranteFromSummary(
      latest as {
        monthly_income?: number | string
        total_spent?: number | string
        savings_goal_amount?: number | string
      },
    )
    // Query DB fresca (no React state) — el `pendingDecision` del
    // closure es stale: este callback se arma antes del refetch y no
    // ve el nuevo row pendiente. Vamos directo a la tabla para
    // chequear si HAY una decisión ya tomada para este summary.
    let pendingForWrapped: { monthlySummaryId: string; sobrante: number } | undefined
    let pastForWrapped:
      | import('@/lib/cycle-wrapped-emitter').CycleWrappedPayload['pastLeftoverDecision']
      | undefined
    if (summaryId != null) {
      const { data: existing } = await supabase
        .from('month_close_decisions')
        .select('id, decision, sobrante, decided_at, meta_goal_id')
        .eq('monthly_summary_id', summaryId)
        .maybeSingle()
      if (existing) {
        // Decisión persistida → modo read-only en la closing scene.
        const dec = existing as {
          decision: 'meta' | 'acumular' | 'reserva' | 'skip'
          sobrante: number | string
          decided_at: string
          meta_goal_id: string | null
        }
        let metaGoalTitle: string | null = null
        if (dec.decision === 'meta' && dec.meta_goal_id) {
          const { data: goal } = await supabase
            .from('savings_goals')
            .select('title')
            .eq('id', dec.meta_goal_id)
            .maybeSingle()
          metaGoalTitle = (goal as { title?: string } | null)?.title ?? null
        }
        pastForWrapped = {
          decision: dec.decision,
          sobrante: Number(dec.sobrante),
          metaGoalTitle,
          decidedAt: dec.decided_at,
        }
      } else if (sobranteFromSummary >= 1000) {
        pendingForWrapped = { monthlySummaryId: summaryId, sobrante: sobranteFromSummary }
      }
    }

    // Si la integramos en el wrapped, marcamos esa summary id como "ya
    // mostrada" en el ref del sheet standalone para evitar que se abra
    // detrás/encima del modal cuando el query se invalide.
    if (pendingForWrapped) {
      lastShownDecisionIdRef.current = pendingForWrapped.monthlySummaryId
    }

    triggerCycleWrapped(
      buildWrappedPayloadFromSummary({
        summary: latest,
        categoryNameById,
        achievementsEarnedAt: [],
        pendingLeftoverDecision: pendingForWrapped,
        pastLeftoverDecision: pastForWrapped,
        activeGoal: activeGoalForSheet,
        // El inicio del nuevo ciclo == period_end del recién cerrado (exclusivo).
        nextCycleAnchor: latest.period_end,
        onApplyLeftoverDecision: pendingForWrapped
          ? async (input) => {
              // El catch de la CTA solo resetea su spinner — el
              // feedback al user sale de aquí. Re-throw para que la
              // CTA NO dispare confetti en el path de error.
              try {
                await applyDecisionMutateAsync(input)
              } catch (err) {
                toast.error(t('home:dashboard.saveDecisionError'))
                throw err
              }
            }
          : undefined,
      }),
    )
    // Auto-fire dinámico: visto = el row que ACABAMOS de reproducir.
    if (opts?.markSeenAfterPlay && summaryId) {
      markWrappedSeenMutate(summaryId)
    }
    // Wrapped lanzado. `lastShownDecisionIdRef` ya quedó seteado más
    // arriba si correspondía → el standalone NO se abre detrás. Podemos
    // liberar el lock para que el useEffect vuelva a operar normalmente
    // (será no-op por el ref).
    setWrappedInFlight(false)
  }, [
    isOnboardingFlow,
    queryClient,
    familyId,
    categoryNameById,
    activeGoalForSheet,
    applyDecisionMutateAsync,
    markWrappedSeenMutate,
  ])

  // Auto-fire del Wrapped en modo DINÁMICO: el ciclo cierra solo (cron
  // nocturno), nadie confirma cobro → sin este efecto el recap quedaba
  // enterrado como entrada manual en Control. Ref por summary id evita
  // re-fires en el mismo mount; el mark-seen (dentro del flujo, sobre el
  // summary realmente reproducido) evita que se re-dispare en cada
  // vuelta al Home (y deja el replay en Control).
  const lastAutoWrappedIdRef = useRef<string | null>(null)
  useEffect(() => {
    // Preview (Home neo dev-route): no auto-disparamos el wrapped — la
    // Home vieja live ya lo dispara (evita doble replay + doble mark-seen).
    if (!enabled) return
    if (!dynamicWrappedPending || !splashIsHidden || wrappedInFlight) return
    const latest = intelligenceForWrapped.data?.summaries?.[0]
    if (!latest?.id) return
    if (lastAutoWrappedIdRef.current === latest.id) return
    lastAutoWrappedIdRef.current = latest.id
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fireWrapped setea el lock wrappedInFlight (sync) igual que el path fixed; guard por ref evita re-disparos
    void fireWrappedForClosedCycle({ markSeenAfterPlay: true })
  }, [
    enabled,
    dynamicWrappedPending,
    splashIsHidden,
    wrappedInFlight,
    intelligenceForWrapped.data,
    fireWrappedForClosedCycle,
  ])

  return {
    pendingDecision,
    decisionSheetOpen,
    applyDecision,
    handleApplyDecision,
    handleSkipDecision,
    handleDecisionSheetClose,
    fireWrappedForClosedCycle,
  }
}
