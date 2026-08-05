import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { RefreshControl, ScrollView, StyleSheet, View, type LayoutChangeEvent } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useFocusEffect, useIsFocused } from '@react-navigation/native'
import { useBranchLog, useScreenLifecycleLog } from '@/lib/dev/anim-log'
import { useOpenLayoutGate } from '@/hooks/use-layout-transition-gate'
import { Screen } from '@/components/ui/screen'
import { RiseView, RiseViewGate } from '@/components/home/animated/rise-view'
import { ControlV2Anchor } from '@/components/control-v2/control-v2-anchor'
import { ControlV2EmptyState } from '@/components/control-v2/control-v2-empty-state'
import { DailyGoalSheet } from '@/components/control-v2/daily-goal-sheet'
import { SavingsGoalQuickEditSheet } from '@/components/control-v2/savings-goal-quick-edit-sheet'
import { QuickAddSavingsSheet } from '@/components/home/quick-add-savings-sheet'
import { CreateSavingsGoalWizardSheet } from '@/components/savings-goals/create-savings-goal-wizard-sheet'
import {
  CONTROL_SPEC,
  ControlAlcancia,
  ControlComparativa,
  ControlHeader,
  ControlHero,
  ControlPatron,
  ControlReparto,
  ControlTendencia,
  SectionLabel,
  controlHeaderHeroSpacing,
  controlLabelCardSpacing,
  controlRiseDelays,
  controlSectionSpacing,
  type ControlMode,
} from '@/components/redesign/control/control-screen'
import {
  buildAlcanciaContent,
  buildComparativaContent,
  buildHeaderVm,
  buildHeroContent,
  buildPatronContent,
  buildRepartoContent,
  buildTendenciaContent,
  selectAlcanciaVariant,
  selectComparativaVariant,
  selectHeroVariant,
  selectPatronVariant,
  selectRepartoVariant,
  selectTendenciaVariant,
} from '@/features/insights/neo-control-view-model'
import type { ControlSectionAnchor } from '@/features/insights/control-action'
import { ControlAnchorsContext } from '@/features/insights/control-section-anchors'
import { markControlVisited } from '@/features/insights/control-visit-store'
import { useAdvisorNotificationSync } from '@/features/insights/use-advisor-notification-sync'
import { useControlV2Data } from '@/features/insights/use-control-v2-data'
import { useLaunchCycleWrapped } from '@/features/wrapped/use-launch-cycle-wrapped'
import {
  buildFamilyFinanceInput,
  useFamilyFinance,
  useUpsertFamilyFinance,
} from '@/features/finance/use-family-finance'
import { useHomeSnapshot } from '@/features/home/use-home-snapshot'
import { useAddSavingsContribution } from '@/features/savings-goals/use-add-savings-contribution'
import { useUpsertSavingsGoal } from '@/features/savings-goals/use-upsert-savings-goal'
import { useLatestSavingsGoal } from '@/features/savings-goals/use-latest-savings-goal'
import { useStreak } from '@/features/streaks/use-streak'
import { useMonthlyAccounting } from '@/hooks/use-monthly-accounting'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import {
  CONTROL_TOUR,
  CONTROL_TOUR_STEPS,
  TourTarget,
  useRegisterTourScrollView,
  useScreenTour,
} from '@/features/tours'
import { triggerHaptic } from '@/lib/haptics'
import { toast } from '@/lib/toast-bus'
import { useThemeMode } from '@/theme/theme-provider'
import { brand } from '@/theme/palette'

interface NeoControlScreenProps {
  userId: string
  familyId: string
  preview?: boolean
}

/**
 * CONTROL neo — cableado real de la vista del handoff
 * design_handoff_control (2026-08-03) sobre la orquestación existente:
 * `useControlV2Data` → `computeControlView` sigue siendo el embudo único
 * de números; este screen solo selecciona variantes y formatea vía
 * `neo-control-view-model` y monta el kit (`components/redesign/control`).
 *
 * Hereda de la pantalla vieja TODO el cableado no visual: tour (orders
 * re-secuenciados al layout nuevo), anchors + scroll-to-section del
 * dispatcher (deep-link `?section=`), sync de señales del asesor, replay
 * del wrapped (hook extraído `useLaunchCycleWrapped`), sheet de meta
 * diaria (entrada: el anillo del score — la score pill vieja ya no
 * existe), sheets de la alcancía y pull-to-refresh vía home_snapshot.
 *
 * Diferencias deliberadas vs la vista vieja (decisiones del handoff):
 *  · El hero FUSIONA "Hoy" + "Hasta cuándo te alcanza" (HC-A/B/C/D) —
 *    las anclas `hoy` y `alcanza` registran el MISMO offset (alias en
 *    `registerOffset`, los anchors no se pueden anidar porque miden `y`
 *    relativo al padre).
 *  · La card de ingresos extra del ciclo no existe en el handoff — el
 *    hero ya absorbe los income_events vía `ingresoMes` del adapter.
 *  · La rama vacía (sin ingreso configurado) conserva el
 *    `ControlV2EmptyState` funcional (guía de setup); re-skin pendiente.
 */
export function NeoControlScreen({ userId, familyId, preview = false }: NeoControlScreenProps) {
  useScreenLifecycleLog(preview ? 'Control·Neo·preview' : 'Control·Neo')
  const { t } = useTranslation()
  const router = useRouter()
  const mode = useThemeMode().resolvedMode as ControlMode
  const s = CONTROL_SPEC[mode]
  const isFocused = useIsFocused()
  const reduceMotion = useReducedMotion()
  const openLayoutGate = useOpenLayoutGate()
  useScreenTour(CONTROL_TOUR, { enabled: !preview })

  const {
    data,
    view,
    signals,
    isLoading,
    noConfig,
    dynamicNoIncome,
    dynamicIncomeHydrating,
    wrappedPayload,
    wrappedSummaryId,
    wrappedSeen,
  } = useControlV2Data(familyId, userId)

  useBranchLog(
    'control-neo',
    noConfig
      ? 'noConfig'
      : dynamicIncomeHydrating
        ? 'dynamicHydrating'
        : dynamicNoIncome
          ? 'dynamicNoIncome'
          : isLoading
            ? 'loading'
            : 'content',
  )

  const monthlyAccounting = useMonthlyAccounting(familyId)
  const financeQuery = useFamilyFinance(familyId)
  const savingsGoalQuery = useLatestSavingsGoal(familyId)
  const streakQuery = useStreak(familyId, userId)
  const upsertFamilyFinance = useUpsertFamilyFinance(familyId, userId)
  const goal = savingsGoalQuery.data ?? null
  const addContribution = useAddSavingsContribution(goal?.familyId ?? familyId, userId)
  const upsertGoal = useUpsertSavingsGoal(familyId, userId)

  const { launchWrapped, hasWrapped } = useLaunchCycleWrapped({
    familyId,
    userId,
    wrappedPayload,
    wrappedSummaryId,
    wrappedSeen,
  })

  // Pull-to-refresh: un solo refetch del home_snapshot re-seedea el
  // cluster de Control (expenses/finance/control-intelligence) en un
  // round-trip — mismo criterio que neo-fijos.
  const snapshot = useHomeSnapshot(userId)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true)
    try {
      await snapshot.refetch()
    } finally {
      setIsRefreshing(false)
    }
  }, [snapshot])

  // Señales del asesor → feed de notificaciones (dedupe 18h por señal;
  // en preview no — la pantalla vieja sigue montada en la tab y ya lo hace).
  useAdvisorNotificationSync({
    signals,
    familyId: preview ? undefined : familyId,
    userId,
  })

  useFocusEffect(
    useCallback(() => {
      if (!preview) markControlVisited()
    }, [preview]),
  )

  // ── Anchors del dispatcher (scroll-to-section + pulso) ──────────
  const scrollRef = useRef<ScrollView | null>(null)
  const { onScroll: onTourScroll, onContentSizeChange: onTourContentSizeChange } =
    useRegisterTourScrollView(CONTROL_TOUR, scrollRef)
  const offsetsRef = useRef<Map<ControlSectionAnchor, number>>(new Map())
  const [pulsingSection, setPulsingSection] = useState<ControlSectionAnchor | null>(null)

  const registerOffset = useCallback((section: ControlSectionAnchor, y: number) => {
    offsetsRef.current.set(section, y)
    // El hero fusionado responde por las dos secciones históricas del
    // dispatcher ("hoy" del estado del día + "alcanza" de la proyección).
    if (section === 'hoy') offsetsRef.current.set('alcanza', y)
  }, [])
  const scrollToSection = useCallback((section: ControlSectionAnchor) => {
    const y = offsetsRef.current.get(section)
    if (y == null) return
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 80), animated: true })
    setTimeout(() => {
      setPulsingSection(section)
      setTimeout(() => setPulsingSection(null), 1600)
    }, 450)
  }, [])
  const anchorsController = useMemo(
    () => ({ scrollRef, registerOffset, scrollToSection, pulsingSection }),
    [registerOffset, scrollToSection, pulsingSection],
  )
  // El offset REAL de cada sección se mide en su wrapper (hijo directo
  // del stack): los ControlV2Anchor van anidados dentro de TourTargets y
  // su onLayout mediría y≈0 relativo a ese wrapper — por eso registran
  // con register={false} (solo pulso) y esto registra el y correcto.
  const onSectionLayout = useCallback(
    (section: ControlSectionAnchor) => (e: LayoutChangeEvent) =>
      registerOffset(section, e.nativeEvent.layout.y),
    [registerOffset],
  )

  const params = useLocalSearchParams<{ section?: string }>()
  useEffect(() => {
    const incoming = params.section as ControlSectionAnchor | undefined
    if (!incoming) return
    const handle = setTimeout(() => scrollToSection(incoming), 200)
    return () => clearTimeout(handle)
  }, [params.section, scrollToSection])

  // ── Meta diaria (sheet) — entrada: el anillo del score ──────────
  const RECOVERY_GRACE_DAYS = 14
  const goalEditable = useMemo(() => {
    const streak = streakQuery.data
    if (!streak) return true
    const broken = streak.streakBrokenAt
    if (!broken || streak.currentStreak > 0) return true
    const brokenAt = new Date(broken).getTime()
    if (Number.isNaN(brokenAt)) return true
    const ageDays = (Date.now() - brokenAt) / (1000 * 60 * 60 * 24)
    return ageDays > RECOVERY_GRACE_DAYS
  }, [streakQuery.data])
  const [goalSheetVisible, setGoalSheetVisible] = useState(false)
  const handleGoalSubmit = useCallback(
    async ({ bufferMode, bufferPercent }: { bufferMode: 'none' | 'percent'; bufferPercent: number }) => {
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
        cycleType: 'monthly',
        cycleAnchorDate: null,
        cycleLengthDays: null,
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

  // ── Sheets de la meta/alcancía ──────────────────────────────────
  const [addSheetOpen, setAddSheetOpen] = useState(false)
  const [addSheetInitial, setAddSheetInitial] = useState<number | undefined>(undefined)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [quickEditOpen, setQuickEditOpen] = useState(false)

  const hasActiveGoal = goal != null && goal.isActive
  const openAddContribution = useCallback(
    (suggested?: number) => {
      void triggerHaptic('selection')
      if (hasActiveGoal) {
        setAddSheetInitial(suggested != null && suggested > 0 ? Math.round(suggested) : undefined)
        setAddSheetOpen(true)
      } else {
        setWizardOpen(true)
      }
    },
    [hasActiveGoal],
  )
  const handleAddSubmit = useCallback(
    (amount: number) => {
      if (!goal) return
      addContribution.mutate(
        { goalId: goal.id, amount },
        {
          onSuccess: () => {
            void triggerHaptic('success')
            setAddSheetOpen(false)
          },
          onError: (err) => {
            void triggerHaptic('error')
            // Un aviso de un solo botón no justifica un modal: el
            // vocabulario neo para esto es el toast del host global, que
            // además sobrevive si la mutación resuelve después de navegar
            // (el sheet in-tree se desmontaría con la pantalla).
            toast.error(
              `${t('control:alcancia.errorSumarTitle')} · ${
                err instanceof Error ? err.message : t('control:alcancia.errorRetry')
              }`,
            )
          },
        },
      )
    },
    [goal, addContribution, t],
  )
  const reactivateGoal = useCallback(() => {
    if (!goal) {
      setWizardOpen(true)
      return
    }
    void triggerHaptic('selection')
    upsertGoal.mutate({
      input: {
        title: goal.title,
        emoji: goal.emoji,
        goalAmount: goal.goalAmount,
        currentAmount: goal.currentAmount,
        targetMonths: goal.targetMonths,
        isActive: true,
      },
      existingId: goal.id,
    })
  }, [goal, upsertGoal])
  const handleQuickEditSubmit = useCallback(
    (input: { goalAmount: number; targetMonths: number | null }) => {
      if (!goal) return
      upsertGoal.mutate(
        {
          input: {
            title: goal.title,
            emoji: goal.emoji,
            goalAmount: input.goalAmount,
            currentAmount: goal.currentAmount,
            targetMonths: input.targetMonths,
            isActive: true,
          },
          existingId: goal.id,
        },
        { onSuccess: () => setQuickEditOpen(false) },
      )
    },
    [goal, upsertGoal],
  )

  // ── Derivación de variantes + contenidos (VM puro) ──────────────
  const ahorroMes = Math.max(0, data.ingresoMes - data.fijosMes - data.libreMes)
  const hasData = view.diasConGasto > 0
  const emptyBranch = noConfig || dynamicNoIncome || dynamicIncomeHydrating

  const headerVm = useMemo(
    () =>
      buildHeaderVm({
        cycleStart: monthlyAccounting.start,
        cycleEnd: monthlyAccounting.end,
        // En la rama vacía el adapter devuelve el CONTROL_MOCK (día 22
        // fabricado): el día del ciclo sale de la ventana contable real.
        diaActual: emptyBranch ? monthlyAccounting.daysIntoMonth : data.diaActual,
        score: view.score,
        hasData,
      }),
    [
      monthlyAccounting.start,
      monthlyAccounting.end,
      monthlyAccounting.daysIntoMonth,
      emptyBranch,
      data.diaActual,
      view.score,
      hasData,
    ],
  )

  const heroVariant = selectHeroVariant({
    hasReliableProjection: view.hasReliableProjection,
    alreadyExhausted: view.alreadyExhausted,
    sobrante: view.sobrantePresupuestadoMes,
    cupoDiario: data.cupoDiario,
  })
  const heroContent = useMemo(
    () => buildHeroContent({ variant: heroVariant, view, data }),
    [heroVariant, view, data],
  )
  const handleHeroCta = useCallback(() => {
    if (heroVariant === 'holgado') {
      openAddContribution(Math.max(0, view.sobrantePresupuestadoMes))
      return
    }
    void triggerHaptic('selection')
    router.push('/(app)/expense-categories')
  }, [heroVariant, openAddContribution, view.sobrantePresupuestadoMes, router])

  const comparativaVariant = selectComparativaVariant({
    hasPreviousMonth: data.hasPreviousMonth,
    mpTotal: view.mpTotal,
    vsMesAhorro: view.vsMesAhorro,
    hasReliableProjection: view.hasReliableProjection,
  })
  const comparativaContent = useMemo(
    () => buildComparativaContent({ variant: comparativaVariant, view, data, hasWrapped }),
    [comparativaVariant, view, data, hasWrapped],
  )
  // CV-D: "Ver mi mes en curso" navega a Gastos; con historia, el CTA
  // del cierre lanza el wrapped.
  const handleComparativaCta = useCallback(() => {
    if (comparativaVariant === 'primerMes') {
      void triggerHaptic('selection')
      router.push('/(app)/(tabs)/expenses')
      return
    }
    void launchWrapped()
  }, [comparativaVariant, router, launchWrapped])

  const todayDow = (new Date().getDay() + 6) % 7
  const tendenciaVariant = selectTendenciaVariant({ view, cupoDiario: data.cupoDiario })
  const tendenciaContent = useMemo(
    () => buildTendenciaContent({ variant: tendenciaVariant, view, data, todayDow }),
    [tendenciaVariant, view, data, todayDow],
  )
  const patronVariant = selectPatronVariant({ view })
  const patronContent = useMemo(
    () => buildPatronContent({ variant: patronVariant, view, data, todayDow }),
    [patronVariant, view, data, todayDow],
  )

  const repartoVariant = selectRepartoVariant({
    fijosMes: data.fijosMes,
    ahorroMes,
    ingresoMes: data.ingresoMes,
    incomeMode: data.incomeMode,
  })
  const repartoContent = useMemo(
    () => buildRepartoContent({ variant: repartoVariant, view, data, ahorroMes }),
    [repartoVariant, view, data, ahorroMes],
  )
  const handleRepartoCta = useCallback(() => {
    void triggerHaptic('selection')
    if (repartoVariant === 'sinFijos') {
      router.push('/(app)/add-fixed-expense')
      return
    }
    if (repartoVariant === 'fijosAltos') {
      router.push('/(app)/(tabs)/fixed-expenses')
      return
    }
    router.push('/(app)/settings')
  }, [repartoVariant, router])

  const alcanciaVariant = selectAlcanciaVariant({
    goal,
    vault: view.vault,
    diaActual: data.diaActual,
    diasConGasto: view.diasConGasto,
    closedDays: view.closedDays,
  })
  const alcanciaContent = useMemo(
    () =>
      buildAlcanciaContent({
        variant: alcanciaVariant,
        goal,
        vault: view.vault,
        monthlyIncome: data.monthlyIncome,
        diaActual: data.diaActual,
        diasMes: data.diasMes,
      }),
    [alcanciaVariant, goal, view.vault, data.monthlyIncome, data.diaActual, data.diasMes],
  )
  const handleAlcanciaPrimary = useCallback(() => {
    switch (alcanciaVariant) {
      case 'enMarcha':
        openAddContribution(view.vault > 0 ? view.vault : undefined)
        return
      case 'cumplida':
        void triggerHaptic('selection')
        router.push('/(app)/savings-goal')
        return
      case 'inactiva':
      case 'arrancando':
        reactivateGoal()
        return
      case 'vacia':
        void triggerHaptic('selection')
        router.push('/(app)/add-expense')
        return
      case 'sinAporte':
        void triggerHaptic('selection')
        router.push('/(app)/expense-categories')
        return
    }
  }, [alcanciaVariant, openAddContribution, view.vault, router, reactivateGoal])
  const handleAlcanciaSecondary = useCallback(() => {
    if (alcanciaVariant === 'enMarcha') {
      void triggerHaptic('selection')
      setQuickEditOpen(true)
      return
    }
    if (alcanciaVariant === 'cumplida') {
      // Con una meta ACTIVA cumplida el wizard de crear no está montado
      // (hasActiveGoal true) — gestionar el cierre/retiro/nueva meta
      // vive en la pantalla de la meta.
      void triggerHaptic('selection')
      router.push('/(app)/savings-goal')
    }
  }, [alcanciaVariant, router])

  const animated = !reduceMotion
  // La tab se pre-monta (lazy:false): sin foco los loops decorativos
  // (dots, knob, anillo) no deben correr. `animated` también gatea los
  // entering — que en el pre-mount igual quedan skippeados por el
  // RiseViewGate de la ruta, así que no se pierde nada.
  const cardsAnimated = animated && isFocused

  // ── Rama vacía: sin ingreso configurado (o dinámico sin ingresos) ──
  if (noConfig || dynamicNoIncome || dynamicIncomeHydrating) {
    return (
      <Screen backgroundColor={s.bg} contentContainerStyle={styles.body} scrollable>
        <View style={styles.stack}>
            <ControlHeader
              animated={animated}
              brotPose="wave"
              cycleLabel={headerVm.cycleLabel}
              mode={mode}
              score={0}
              scoreCaption={headerVm.scoreCaption}
              scoreText={t('control:neo.header.scorePending')}
              title={t('control:header.title')}
            />
            {dynamicIncomeHydrating && !noConfig ? null : (
              <View style={controlHeaderHeroSpacing}>
                <ControlV2EmptyState
                  missingIncome={noConfig}
                  missingExpenses={view.diasConGasto === 0}
                  dynamicNoIncome={dynamicNoIncome}
                  onPressSetupIncome={() => {
                    void triggerHaptic('selection')
                    router.push('/(app)/settings')
                  }}
                  onPressAddExpense={() => {
                    void triggerHaptic('selection')
                    router.push('/(app)/add-expense')
                  }}
                  onPressAddIncome={() => {
                    void triggerHaptic('selection')
                    router.push('/(app)/add-income')
                  }}
                />
              </View>
          )}
        </View>
      </Screen>
    )
  }

  return (
    <ControlAnchorsContext.Provider value={anchorsController}>
      <Screen
        backgroundColor={s.bg}
        contentContainerStyle={styles.body}
        onContentSizeChange={onTourContentSizeChange}
        onScroll={onTourScroll}
        onScrollBeginDrag={openLayoutGate}
        refreshControl={
          <RefreshControl
            colors={[brand.deep]}
            onRefresh={handleRefresh}
            refreshing={isRefreshing}
            tintColor={brand.bright}
          />
        }
        // 16ms = un evento por frame a 60fps: la Y trackeada alimenta el
        // auto-scroll del tour y el scroll-to-section del asesor.
        scrollEventThrottle={16}
        scrollRef={scrollRef}
        scrollable
      >
        {/* La ruta monta <RiseViewGate skip> para el primer attach de la
            tab; este gate interior lo re-habilita con el criterio ancho
            del proyecto (preferencia + SO + hardware) — mismo patrón que
            neo-gastos. */}
        <RiseViewGate skip={reduceMotion}>
          <View style={styles.stack}>
              <RiseView delay={controlRiseDelays.header}>
                <ControlHeader
                  animated={cardsAnimated}
                  brotPose={headerVm.brotPose}
                  cycleLabel={headerVm.cycleLabel}
                  mode={mode}
                  onPressCycle={hasWrapped ? () => void launchWrapped() : undefined}
                  onPressScore={goalEditable ? () => setGoalSheetVisible(true) : undefined}
                  score={headerVm.score}
                  scoreA11yLabel={t('control:neo.header.scoreA11y', { score: headerVm.score })}
                  scoreCaption={headerVm.scoreCaption}
                  scoreText={headerVm.scoreText}
                  title={t('control:header.title')}
                />
              </RiseView>

              <View onLayout={onSectionLayout('hoy')}>
                <RiseView delay={controlRiseDelays.hero}>
                  <TourTarget
                    tour={CONTROL_TOUR}
                    order={CONTROL_TOUR_STEPS.hoy.order}
                    text={CONTROL_TOUR_STEPS.hoy.text}
                  >
                    <TourTarget
                      tour={CONTROL_TOUR}
                      order={CONTROL_TOUR_STEPS.alcanza.order}
                      text={CONTROL_TOUR_STEPS.alcanza.text}
                    >
                      {/* Un solo anchor: `registerOffset` aliasa 'alcanza'
                          al offset de 'hoy' (hero fusionado). */}
                      <ControlV2Anchor register={false} section="hoy" style={controlHeaderHeroSpacing}>
                        <ControlHero
                          {...heroContent}
                          animated={cardsAnimated}
                          mode={mode}
                          onPressCta={heroVariant === 'primerCiclo' ? undefined : handleHeroCta}
                          paused={!isFocused}
                          variant={heroVariant}
                        />
                      </ControlV2Anchor>
                    </TourTarget>
                  </TourTarget>
                </RiseView>
              </View>

              <View onLayout={onSectionLayout('vsmes')}>
                <RiseView delay={controlRiseDelays.comparativa}>
                  <SectionLabel
                    label={t('control:neo.comparativa.section')}
                    spec={s}
                    style={controlSectionSpacing}
                  />
                  <TourTarget
                    tour={CONTROL_TOUR}
                    order={CONTROL_TOUR_STEPS.vsMes.order}
                    text={CONTROL_TOUR_STEPS.vsMes.text}
                  >
                    <ControlV2Anchor register={false} section="vsmes" style={controlLabelCardSpacing}>
                      <ControlComparativa
                        {...comparativaContent}
                        animated={cardsAnimated}
                        mode={mode}
                        onPressCierre={
                          comparativaVariant === 'primerMes' || hasWrapped
                            ? handleComparativaCta
                            : undefined
                        }
                        variant={comparativaVariant}
                      />
                    </ControlV2Anchor>
                  </TourTarget>
                </RiseView>
              </View>

              <View onLayout={onSectionLayout('semana')}>
                <RiseView delay={controlRiseDelays.tendencia}>
                  <SectionLabel
                    label={t('control:neo.tendencia.section')}
                    spec={s}
                    style={controlSectionSpacing}
                  />
                  <TourTarget
                    tour={CONTROL_TOUR}
                    order={CONTROL_TOUR_STEPS.semana.order}
                    text={CONTROL_TOUR_STEPS.semana.text}
                  >
                    <ControlV2Anchor register={false} section="semana" style={controlLabelCardSpacing}>
                      <ControlTendencia
                        {...tendenciaContent}
                        animated={cardsAnimated}
                        mode={mode}
                        variant={tendenciaVariant}
                      />
                    </ControlV2Anchor>
                  </TourTarget>
                </RiseView>
              </View>

              <View onLayout={onSectionLayout('patron')}>
                <RiseView delay={controlRiseDelays.patron}>
                  <SectionLabel
                    label={t('control:neo.patron.section')}
                    spec={s}
                    style={controlSectionSpacing}
                  />
                  <TourTarget
                    tour={CONTROL_TOUR}
                    order={CONTROL_TOUR_STEPS.patron.order}
                    text={CONTROL_TOUR_STEPS.patron.text}
                  >
                    <ControlV2Anchor register={false} section="patron" style={controlLabelCardSpacing}>
                      <ControlPatron
                        {...patronContent}
                        animated={cardsAnimated}
                        mode={mode}
                        variant={patronVariant}
                      />
                    </ControlV2Anchor>
                  </TourTarget>
                </RiseView>
              </View>

              <View onLayout={onSectionLayout('cobertura')}>
                <RiseView delay={controlRiseDelays.reparto}>
                  <SectionLabel
                    label={t('control:neo.reparto.section')}
                    spec={s}
                    style={controlSectionSpacing}
                  />
                  <TourTarget
                    tour={CONTROL_TOUR}
                    order={CONTROL_TOUR_STEPS.cobertura.order}
                    text={
                      data.incomeMode === 'dynamic'
                        ? t('states:tour.control.coberturaDynamic')
                        : CONTROL_TOUR_STEPS.cobertura.text
                    }
                  >
                    <ControlV2Anchor register={false} section="cobertura" style={controlLabelCardSpacing}>
                      <ControlReparto
                        {...repartoContent}
                        animated={cardsAnimated}
                        mode={mode}
                        onPressCta={handleRepartoCta}
                        variant={repartoVariant}
                      />
                    </ControlV2Anchor>
                  </TourTarget>
                </RiseView>
              </View>

              <View onLayout={onSectionLayout('alcancia')}>
                <RiseView delay={controlRiseDelays.meta}>
                  <SectionLabel
                    label={t('control:neo.meta.section')}
                    spec={s}
                    style={controlSectionSpacing}
                  />
                  <TourTarget
                    tour={CONTROL_TOUR}
                    order={CONTROL_TOUR_STEPS.alcancia.order}
                    text={
                      data.incomeMode === 'dynamic'
                        ? t('states:tour.control.alcanciaDynamic')
                        : CONTROL_TOUR_STEPS.alcancia.text
                    }
                  >
                    <ControlV2Anchor register={false} section="alcancia" style={controlLabelCardSpacing}>
                      <ControlAlcancia
                        {...alcanciaContent}
                        animated={cardsAnimated}
                        mode={mode}
                        onPressPrimary={handleAlcanciaPrimary}
                        onPressSecondary={handleAlcanciaSecondary}
                        variant={alcanciaVariant}
                      />
                    </ControlV2Anchor>
                  </TourTarget>
                </RiseView>
              </View>
          </View>
        </RiseViewGate>

        <DailyGoalSheet
          visible={goalSheetVisible}
          realDailyCupo={data.cupoDiario}
          remainingCycleDays={view.diasRestantes}
          initialBufferMode={financeQuery.data?.daily_budget_buffer_mode ?? 'none'}
          initialBufferPercent={financeQuery.data?.daily_budget_buffer_value ?? 0}
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
          incomeMode={data.incomeMode}
        />

        {hasActiveGoal && goal ? (
          <QuickAddSavingsSheet
            visible={addSheetOpen}
            goalTitle={goal.title}
            remaining={Math.max(0, goal.goalAmount - goal.currentAmount)}
            isSaving={addContribution.isPending}
            initialAmount={addSheetInitial}
            onClose={() => {
              if (addContribution.isPending) return
              setAddSheetOpen(false)
            }}
            onSubmit={handleAddSubmit}
          />
        ) : null}

        {!hasActiveGoal ? (
          <CreateSavingsGoalWizardSheet
            visible={wizardOpen}
            familyId={familyId}
            userId={userId}
            onCreated={() => setWizardOpen(false)}
            onClose={() => setWizardOpen(false)}
          />
        ) : null}

        {goal ? (
          <SavingsGoalQuickEditSheet
            visible={quickEditOpen}
            goalTitle={goal.title}
            goalEmoji={goal.emoji}
            initialGoalAmount={goal.goalAmount}
            initialTargetMonths={goal.targetMonths}
            currentAmount={goal.currentAmount}
            isSaving={upsertGoal.isPending}
            onClose={() => setQuickEditOpen(false)}
            onSubmit={handleQuickEditSubmit}
          />
        ) : null}
      </Screen>
    </ControlAnchorsContext.Provider>
  )
}

const styles = StyleSheet.create({
  // MISMO padding que Fijos/Gastos/Home neo (`paddingHorizontal: 20`,
  // el del `styles.content` del Screen). Antes esta pantalla montaba su
  // propio ScrollView DENTRO de un Screen no-scrollable y sumaba un
  // segundo padding de 20 → Control se veía 40px inset, mucho más
  // compacto que el resto de la app. El scroll del tour / del asesor
  // sigue funcionando porque el Screen expone `scrollRef`.
  body: { paddingHorizontal: 20, paddingTop: 10 },
  stack: {
    // El markup del layout final: página padding 10/20/0 — el Screen ya
    // aporta el horizontal; acá solo el ritmo interno (los saltos entre
    // secciones los ponen los spacing exports del kit, no un gap).
    position: 'relative',
  },
})
