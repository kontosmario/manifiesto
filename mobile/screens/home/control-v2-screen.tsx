import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import type { ControlSectionAnchor as ControlSectionAnchorType } from '@/features/insights/control-action'
import { AmbientBlobs } from '@/components/home/ambient-blobs'
import { ControlV2AlcanciaCard } from '@/components/control-v2/control-v2-alcancia-card'
import { ControlV2AlcanzaCard } from '@/components/control-v2/control-v2-alcanza-card'
import { ControlV2Anchor } from '@/components/control-v2/control-v2-anchor'
// ControlV2AsesorCard import removed — los signals del Asesor ahora
// son accesibles desde el icon de acceso rápido en Home. Ver doc
// REAL-VALUE-SUGGESTIONS/CONTROL-HERO-REFACTOR.md
import { ControlV2CoberturaCard } from '@/components/control-v2/control-v2-cobertura-card'
import { ControlV2EmptyState } from '@/components/control-v2/control-v2-empty-state'
import { ControlV2Header } from '@/components/control-v2/control-v2-header'
import { ControlV2Hero } from '@/components/control-v2/control-v2-hero'
// ControlV2HoyCard reemplazada por ControlV2Hero (variante A · El
// Titular). HoyCard sigue en código para rollback rápido si fuera
// necesario. Ver REAL-VALUE-SUGGESTIONS/CONTROL-HERO-REFACTOR.md
// import { ControlV2HoyCard } from '@/components/control-v2/control-v2-hoy-card'
import { ControlV2PatronCard } from '@/components/control-v2/control-v2-patron-card'
import { ControlV2SemanaCard } from '@/components/control-v2/control-v2-semana-card'
import { ControlV2VsMesCard } from '@/components/control-v2/control-v2-vsmes-card'
import { DailyGoalSheet } from '@/components/control-v2/daily-goal-sheet'
import { Screen } from '@/components/ui/screen'
import {
  buildFamilyFinanceInput,
  useFamilyFinance,
  useUpsertFamilyFinance,
} from '@/features/finance/use-family-finance'
import { useStreak } from '@/features/streaks/use-streak'
import { useExpenses } from '@/features/expenses/use-expenses'
import { useSavingsGoal } from '@/features/savings-goals/use-savings-goal'
import { useFamilyDashboard } from '@/hooks/use-family-dashboard'
import type { ControlSectionAnchor } from '@/features/insights/control-action'
import { ControlAnchorsContext } from '@/features/insights/control-section-anchors'
import { useAdvisorNotificationSync } from '@/features/insights/use-advisor-notification-sync'
import { markControlVisited } from '@/features/insights/control-visit-store'
import { useControlV2Data } from '@/features/insights/use-control-v2-data'
import {
  CONTROL_TOUR,
  CONTROL_TOUR_STEPS,
  TourTarget,
  useRegisterTourScrollView,
  useScreenTour,
} from '@/features/tours'
import { triggerHaptic } from '@/lib/haptics'

interface ControlV2ScreenProps {
  familyId: string
  userId: string
}

const DOW_FULL = [
  'DOMINGO',
  'LUNES',
  'MARTES',
  'MIÉRCOLES',
  'JUEVES',
  'VIERNES',
  'SÁBADO',
] as const

/**
 * Control v2 — real data + "Asistente Financiero" (local signals) +
 * CTA dispatcher wired to the full app.
 *
 * Scroll anchoring: we manage our own ScrollView so the dispatcher
 * can smooth-scroll to a named section (semana / patron / etc.) and
 * pulse it. The Screen component renders with `scrollable={false}`
 * and we stack everything ourselves.
 */
export function ControlV2Screen({ familyId, userId }: ControlV2ScreenProps) {
  const router = useRouter()
  // Auto-start the Control guided tour on first visit. No-op once seen.
  useScreenTour(CONTROL_TOUR)
  const { data, view, signals, noConfig } = useControlV2Data(familyId)
  const financeQuery = useFamilyFinance(familyId)
  const expensesQuery = useExpenses(familyId)
  const savingsGoalQuery = useSavingsGoal(familyId)
  const dashboard = useFamilyDashboard(familyId)
  const streakQuery = useStreak(familyId, userId)
  const upsertFamilyFinance = useUpsertFamilyFinance(familyId)
  const missingIncome = (financeQuery.data?.monthly_income ?? 0) <= 0
  const missingExpenses = (expensesQuery.data ?? []).length === 0

  // ── Daily-goal ("Mi meta diaria") wiring ────────────────────────
  // The header score pill doubles as the entry point into the
  // self-binding goal. The maths reuses the existing
  // `daily_budget_buffer_*` columns: a "goal at 80% of cupo real"
  // === bufferMode='percent' with 20% reserved.
  //
  // Guardrail #9: while the streak is server-canonically broken
  // (`current_streak === 0` after the cron processed the break) AND
  // within the 14-day recovery window, the editor is disabled.
  // Stacking a self-imposed restriction on top of a freshly-broken
  // streak compounds the emotional load.
  //
  // We deliberately gate on the server-canonical signal only, NOT on
  // `useStreak.isBroken` — the latter folds in a client-side heuristic
  // that flips to `true` when `last_logged_date` is 2+ days stale,
  // even if the server hasn't zeroed `current_streak` yet. That
  // heuristic catches "the cron is behind", not "the user is in a
  // fragile recovery window", so using it would silent-disable the
  // pill for any user with a slow cron run (including dev accounts
  // testing the feature).
  //
  // Canonical state we check: `streak_broken_at !== null` AND the row
  // shows `current_streak === 0`. We re-derive both fields directly
  // from the raw streak row instead of trusting `isBroken`.
  const RECOVERY_GRACE_DAYS = 14
  const goalEditable = useMemo(() => {
    const streak = streakQuery.data
    if (!streak) return true
    const broken = streak.streakBrokenAt
    // Server-canonical broken: streak_broken_at stamped AND
    // current_streak zeroed by the cron. If current_streak > 0 the
    // user has either recovered or never had the break processed —
    // either way, no reason to gate.
    if (!broken || streak.currentStreak > 0) return true
    const brokenAt = new Date(broken).getTime()
    if (Number.isNaN(brokenAt)) return true
    const ageDays = (Date.now() - brokenAt) / (1000 * 60 * 60 * 24)
    return ageDays > RECOVERY_GRACE_DAYS
  }, [streakQuery.data])

  // Real cupo before any goal/buffer is applied — `data.cupoDiario`
  // from the adapter is the pre-buffer value (it divides ingreso −
  // fijos − ahorro by the cycle days, no buffer subtraction). We use
  // the SAME number the user already sees on the HOY card so the
  // sheet reads as a self-consistent surface instead of presenting a
  // fresh figure pulled from a parallel pipeline.
  const realDailyCupo = data.cupoDiario
  const dailyGoalAmount = useMemo(() => {
    const finance = financeQuery.data
    if (!finance || finance.daily_budget_buffer_mode !== 'percent') return null
    const pct = finance.daily_budget_buffer_value
    if (!Number.isFinite(pct) || pct <= 0) return null
    const reduced = Math.max(0, Math.round(realDailyCupo * (1 - pct / 100)))
    return reduced > 0 && reduced < Math.round(realDailyCupo) ? reduced : null
  }, [financeQuery.data, realDailyCupo])

  const [goalSheetVisible, setGoalSheetVisible] = useState(false)
  const handleGoalSubmit = useCallback(
    async ({
      bufferMode,
      bufferPercent,
    }: {
      bufferMode: 'none' | 'percent'
      bufferPercent: number
    }) => {
      const finance = financeQuery.data
      if (!finance) return
      const input = buildFamilyFinanceInput({
        dailyBudgetBufferMode: bufferMode,
        dailyBudgetBufferValue: bufferMode === 'percent' ? bufferPercent : 0,
        dailyBudgetCheckinHour: finance.daily_budget_checkin_hour,
        dailyBudgetNudgesEnabled: finance.daily_budget_nudges_enabled,
        monthlyIncome: finance.monthly_income,
        savingsGoal: finance.savings_goal,
        savingsGoalPercent: finance.savings_goal_percent,
        usdExchangeRate: finance.usd_exchange_rate,
        salaryPaymentDay: finance.salary_payment_day,
        lastSalaryConfirmedAt: finance.last_salary_confirmed_at,
        currentCycleStartingBalance: finance.current_cycle_starting_balance,
        currentCycleAnchor: finance.current_cycle_anchor,
      })
      try {
        await upsertFamilyFinance.mutateAsync(input)
        void triggerHaptic('success')
        setGoalSheetVisible(false)
      } catch {
        void triggerHaptic('warning')
      }
    },
    [financeQuery.data, upsertFamilyFinance],
  )

  // Section anchor bookkeeping for the dispatcher's scroll-to-section.
  const scrollRef = useRef<ScrollView | null>(null)
  // Reuse that same ScrollView for the guided tour's auto-scroll.
  const {
    onScroll: onTourScroll,
    onContentSizeChange: onTourContentSizeChange,
  } = useRegisterTourScrollView(CONTROL_TOUR, scrollRef)
  const offsetsRef = useRef<Map<ControlSectionAnchor, number>>(new Map())
  const [pulsingSection, setPulsingSection] =
    useState<ControlSectionAnchor | null>(null)

  const registerOffset = useCallback(
    (section: ControlSectionAnchor, y: number) => {
      offsetsRef.current.set(section, y)
    },
    [],
  )
  const scrollToSection = useCallback((section: ControlSectionAnchor) => {
    const y = offsetsRef.current.get(section)
    if (y == null) return
    // Offset so the section sits ~120pt from the top, not flush.
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 80), animated: true })
    // Pulse shortly after the scroll animation completes (~400ms).
    setTimeout(() => {
      setPulsingSection(section)
      setTimeout(() => setPulsingSection(null), 1600)
    }, 450)
  }, [])

  const anchorsController = useMemo(
    () => ({ scrollRef, registerOffset, scrollToSection, pulsingSection }),
    [registerOffset, scrollToSection, pulsingSection],
  )

  // The dispatcher previously fired here when the asesor card had
  // per-row CTAs. The new compact card teases only — the full chat
  // screen owns the dispatcher now. Keep the variable name to avoid
  // breaking the closure shape that sub-renderers may inspect.
  // (Removed: useControlActionDispatcher hook is now mounted in
  // AsistenteScreen.)

  // Pipe high-priority advisor signals into the in-app notification
  // feed and (for ≥0.85 confidence) trigger a push. The hook is
  // de-duplicated per device with an 18h cool-down per signal id, so
  // mounting it here is safe even on every screen visit.
  useAdvisorNotificationSync({
    signals,
    familyId,
    userId,
  })

  // Stamp the visit so the Control tab badge clears.
  useEffect(() => {
    markControlVisited()
  }, [])

  // Honor `?section=...` deep-links from the Asistente screen — when
  // the user taps a CTA that resolves to `scroll-to-section`, the
  // chat pushes back to this tab with the section name and we scroll
  // + pulse the relevant anchor here.
  const params = useLocalSearchParams<{ section?: string }>()
  useEffect(() => {
    const incoming = params.section as ControlSectionAnchorType | undefined
    if (!incoming) return
    // Defer one tick so card mounts have registered their offsets.
    const handle = setTimeout(() => scrollToSection(incoming), 200)
    return () => clearTimeout(handle)
  }, [params.section, scrollToSection])

  // Perf · derived values memoized para que las cards memo'd no
  // re-rendereen por re-cómputos triviales del screen (e.g. cambio
  // de goalSheetVisible state). El `today.getDate()` cambia solo
  // a la medianoche — basta refrescar al day change vía la cache
  // key del Date object generado una vez por render del screen.
  const dayLabel = useMemo(() => {
    const t = new Date()
    return `HOY · ${DOW_FULL[t.getDay()]} ${t.getDate()}`
  }, [])
  const fijosRatioPct = useMemo(
    () => (data.ingresoMes > 0 ? (data.fijosMes / data.ingresoMes) * 100 : 0),
    [data.ingresoMes, data.fijosMes],
  )
  // Recover ahorro mensual from the adapter's identity:
  //   ingreso = fijos + ahorro + libre  ⇒  ahorro = ingreso - fijos - libre
  // No new query needed — the adapter already has it on `data`.
  const ahorroMes = useMemo(
    () => Math.max(0, data.ingresoMes - data.fijosMes - data.libreMes),
    [data.ingresoMes, data.fijosMes, data.libreMes],
  )

  if (noConfig) {
    // Onboarding inicial pendiente: sin `monthly_income` no podemos
    // calcular un cupo diario, así que la pantalla pinta el empty
    // state guiando a configurar el ingreso. Una vez configurado,
    // dejamos pasar aún sin gastos: el adapter calcula `cupoDiario`
    // y las cards que requieren historial muestran su propio
    // placeholder ("Día X de N").
    return (
      <Screen contentContainerStyle={styles.screen} scrollable={false}>
        {/* Mounted at the Screen level (outside the ScrollView) so the
            absolute-positioned blobs fill the full viewport and don't
            scroll with the content or get clipped to the stack View. */}
        <AmbientBlobs />
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.stack}>
            <ControlV2Header
              score={0}
              scoreLabel="Pronto"
              scoreTone={view.scoreToneDark}
            />
            <ControlV2EmptyState
              missingIncome={missingIncome}
              missingExpenses={missingExpenses}
              onPressSetupIncome={() => {
                void triggerHaptic('selection')
                router.push('/(app)/settings')
              }}
              onPressAddExpense={() => {
                void triggerHaptic('selection')
                router.push('/(app)/add-expense')
              }}
            />
          </View>
        </ScrollView>
      </Screen>
    )
  }

  return (
    <ControlAnchorsContext.Provider value={anchorsController}>
      <Screen contentContainerStyle={styles.screen} scrollable={false}>
        {/* Mounted at the Screen level (outside the ScrollView) so the
            absolute-positioned blobs fill the full viewport and don't
            scroll with the content or get clipped to the stack View. */}
        <AmbientBlobs />
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.scrollContent}
          onScroll={onTourScroll}
          onContentSizeChange={onTourContentSizeChange}
          // 16ms throttle = 1 evento/frame a 60fps · matchea Home,
          // Gastos y Fijos. Antes era 64ms (1 evento cada ~4 frames)
          // → el tour scroll-to-anchor lagueaba contra la posición
          // real, causando misses cuando el user scrollea rápido y
          // tap "scroll to section" del Asistente.
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.stack}>
            <ControlV2Header
              score={view.score}
              scoreLabel={view.scoreLabel}
              scoreTone={view.scoreToneDark}
              dailyGoalAmount={dailyGoalAmount}
              goalEditable={goalEditable}
              onPressGoal={() => setGoalSheetVisible(true)}
            />

            <TourTarget
              tour={CONTROL_TOUR}
              order={CONTROL_TOUR_STEPS.hoy.order}
              text={CONTROL_TOUR_STEPS.hoy.text}
            >
              <ControlV2Anchor section="hoy">
                {/* Hero card nueva · variante A · El Titular. Reemplaza
                    al ControlV2HoyCard original que era "0 comprensible
                    nada intuitivo" según owner. El nuevo hero comunica
                    state-aware "qué tenés que saber sin vueltas":
                    headline editorial + primary number + 3 mini stats
                    + particles + shine + breathe dot color-coded. */}
                <ControlV2Hero
                  data={data}
                  view={view}
                  dailyGoalAmount={dailyGoalAmount}
                  dayLabel={dayLabel}
                />
              </ControlV2Anchor>
            </TourTarget>

            {/* AsesorCard removido — los signals viven en el icon de
                acceso rápido en Home (entry point al chat completo).
                Mantenerlo acá duplicaba la surface. */}

            <TourTarget
              tour={CONTROL_TOUR}
              order={CONTROL_TOUR_STEPS.alcanza.order}
              text={CONTROL_TOUR_STEPS.alcanza.text}
            >
              <ControlV2Anchor section="alcanza">
                <ControlV2AlcanzaCard
                  alcanzaElMes={view.alcanzaElMes}
                  alreadyExhausted={view.alreadyExhausted}
                  hasReliableProjection={view.hasReliableProjection}
                  closedDays={view.closedDays}
                  diaAgotamiento={view.diaAgotamiento}
                  diaActual={data.diaActual}
                  diasMes={data.diasMes}
                  sobrantePresupuestadoMes={view.sobrantePresupuestadoMes}
                  cupoDiario={data.cupoDiario}
                  pacePromedio={view.promedioDiario}
                  restanteMes={view.restanteMes}
                  diasRestantes={view.diasRestantes}
                  cycleStartingBalanceOverride={dashboard.cycleStartingBalanceOverride}
                />
              </ControlV2Anchor>
            </TourTarget>

            <TourTarget
              tour={CONTROL_TOUR}
              order={CONTROL_TOUR_STEPS.alcancia.order}
              text={CONTROL_TOUR_STEPS.alcancia.text}
            >
              <ControlV2Anchor section="alcancia">
                <ControlV2AlcanciaCard
                  familyId={familyId}
                  userId={userId}
                  goal={savingsGoalQuery.data ?? null}
                  vault={view.vault}
                  closedDays={view.closedDays}
                  diasGanadores={view.diasGanadores}
                  rachaBajoCupo={view.racha}
                  noSpendCount={view.noSpendCount}
                  diaActual={data.diaActual}
                />
              </ControlV2Anchor>
            </TourTarget>

            <TourTarget
              tour={CONTROL_TOUR}
              order={CONTROL_TOUR_STEPS.semana.order}
              text={CONTROL_TOUR_STEPS.semana.text}
            >
              <ControlV2Anchor section="semana">
                <ControlV2SemanaCard
                  last7={view.last7}
                  cupoDiario={data.cupoDiario}
                  avgU7={view.avgU7}
                  avgP7={view.avgP7}
                  momentum={view.momentum}
                  diasRestantes={view.diasRestantes}
                  diaActual={data.diaActual}
                />
              </ControlV2Anchor>
            </TourTarget>

            <TourTarget
              tour={CONTROL_TOUR}
              order={CONTROL_TOUR_STEPS.vsMes.order}
              text={CONTROL_TOUR_STEPS.vsMes.text}
            >
              <ControlV2Anchor section="vsmes">
                <ControlV2VsMesCard
                  hasPreviousMonth={data.hasPreviousMonth}
                  mesPasadoNombre={data.mesPasado.nombre}
                  mesPasadoTotal={data.mesPasado.gastoTotal}
                  mesPasadoDiasBajoCupo={data.mesPasado.diasBajoCupo}
                  mesPasadoTopCatLabel={data.mesPasado.topCat.label}
                  mesPasadoTopCatAmount={data.mesPasado.topCat.amount}
                  mesPasadoMood={data.mesPasado.mood}
                  mesPasadoSavingsDelta={data.mesPasado.savingsDelta}
                  mesPasadoTopExpense={data.mesPasado.topExpense}
                  currentTopCatSpent={data.mesPasado.currentTopCatSpent}
                  mesPasadoCycleRangeLabel={data.mesPasado.cycleRangeLabel}
                  proyectadoMes={view.proyectadoMes}
                  vsMesAhorro={view.vsMesAhorro}
                  vsMesDeltaPct={view.vsMesDeltaPct}
                  vsMesMejor={view.vsMesMejor}
                  diasGanadores={view.diasGanadores}
                  diaActual={data.diaActual}
                />
              </ControlV2Anchor>
            </TourTarget>

            <TourTarget
              tour={CONTROL_TOUR}
              order={CONTROL_TOUR_STEPS.patron.order}
              text={CONTROL_TOUR_STEPS.patron.text}
            >
              <ControlV2Anchor section="patron">
                <ControlV2PatronCard
                  dows={view.porDowEnriched}
                  peorDow={view.peorDow}
                  mejorDow={view.mejorDow}
                  globalAvg={view.globalAvg}
                  diaActual={data.diaActual}
                />
              </ControlV2Anchor>
            </TourTarget>

            <TourTarget
              tour={CONTROL_TOUR}
              order={CONTROL_TOUR_STEPS.cobertura.order}
              text={CONTROL_TOUR_STEPS.cobertura.text}
            >
              <ControlV2Anchor section="cobertura">
                <ControlV2CoberturaCard
                  fijosMes={data.fijosMes}
                  ahorroMes={ahorroMes}
                  libreMes={data.libreMes}
                  ingresoMes={data.ingresoMes}
                  diasMes={data.diasMes}
                  fijosRatioPct={fijosRatioPct}
                  cycleStartingBalanceOverride={dashboard.cycleStartingBalanceOverride}
                />
              </ControlV2Anchor>
            </TourTarget>

          </View>
        </ScrollView>
        <DailyGoalSheet
          visible={goalSheetVisible}
          realDailyCupo={realDailyCupo}
          remainingCycleDays={view.diasRestantes}
          initialBufferMode={
            financeQuery.data?.daily_budget_buffer_mode ?? 'none'
          }
          initialBufferPercent={
            financeQuery.data?.daily_budget_buffer_value ?? 0
          }
          userStats={{
            racha: view.racha,
            closedDays: view.closedDays,
            diasGanadores: view.diasGanadores,
            momentum: view.momentum,
            noSpendCount: view.noSpendCount,
          }}
          isSaving={upsertFamilyFinance.isPending}
          onClose={() => setGoalSheetVisible(false)}
          onSubmit={handleGoalSubmit}
          // Native Modal mode (no `inline`): the sheet wraps in its
          // own UIViewController and covers the full screen
          // including the tab bar — same family as the Home
          // "agregar ahorro" sheet (`QuickAddSavingsSheet`). The
          // animated slide-down close that used to require inline
          // mode is now built into `ModalCard` for both modes, so
          // every dismiss path (backdrop tap, swipe-down, save)
          // plays the same polished exit.
        />
      </Screen>
    </ControlAnchorsContext.Provider>
  )
}

const styles = StyleSheet.create({
  screen: {
    // We own the ScrollView internally (needed for scroll-to-section
    // anchoring), so ask `Screen` NOT to reserve its usual tab-bar
    // padding — otherwise the outer View eats the bottom space and
    // leaves a visible gap between the end of the scroll region and
    // the tab bar. The inner ScrollView handles tab clearance via
    // `scrollContent.paddingBottom` below.
    paddingTop: 4,
    paddingBottom: 0,
    flex: 1,
  },
  scrollContent: {
    // Tab bar clearance — matches Screen's own math for tab screens:
    // spacing.xxl (48) + 96pt tab strip.
    paddingBottom: 144,
  },
  stack: {
    // Match the rhythm of Home/Gastos/Fijos which use 8-10pt gaps;
    // 12 keeps Control breathable but no longer reads as a separate
    // product layer.
    gap: 12,
    position: 'relative',
  },
})
