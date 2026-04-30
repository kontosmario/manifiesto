import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import type { ControlSectionAnchor as ControlSectionAnchorType } from '@/features/insights/control-action'
import { AmbientBlobs } from '@/components/home/ambient-blobs'
import { ControlV2AlcanciaCard } from '@/components/control-v2/control-v2-alcancia-card'
import { ControlV2AlcanzaCard } from '@/components/control-v2/control-v2-alcanza-card'
import { ControlV2Anchor } from '@/components/control-v2/control-v2-anchor'
import { ControlV2AsesorCard } from '@/components/control-v2/control-v2-asesor-card'
import { ControlV2CoberturaCard } from '@/components/control-v2/control-v2-cobertura-card'
import { ControlV2EmptyState } from '@/components/control-v2/control-v2-empty-state'
import { ControlV2Header } from '@/components/control-v2/control-v2-header'
import { ControlV2HoyCard } from '@/components/control-v2/control-v2-hoy-card'
import { ControlV2PatronCard } from '@/components/control-v2/control-v2-patron-card'
import { ControlV2SemanaCard } from '@/components/control-v2/control-v2-semana-card'
import { ControlV2VsMesCard } from '@/components/control-v2/control-v2-vsmes-card'
import { Screen } from '@/components/ui/screen'
import { useFamilyFinance } from '@/features/finance/use-family-finance'
import { useExpenses } from '@/features/expenses/use-expenses'
import { useSavingsGoal } from '@/features/savings-goals/use-savings-goal'
import { useFamilyDashboard } from '@/hooks/use-family-dashboard'
import type { ControlSectionAnchor } from '@/features/insights/control-action'
import { ControlAnchorsContext } from '@/features/insights/control-section-anchors'
import { useAdvisorNotificationSync } from '@/features/insights/use-advisor-notification-sync'
import { markControlVisited } from '@/features/insights/control-visit-store'
import { useControlV2Data } from '@/features/insights/use-control-v2-data'
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
  const { data, view, signals, usingMock } = useControlV2Data(familyId)
  const financeQuery = useFamilyFinance(familyId)
  const expensesQuery = useExpenses(familyId)
  const savingsGoalQuery = useSavingsGoal(familyId)
  const dashboard = useFamilyDashboard(familyId)
  const missingIncome = (financeQuery.data?.monthly_income ?? 0) <= 0
  const missingExpenses = (expensesQuery.data ?? []).length === 0

  // Section anchor bookkeeping for the dispatcher's scroll-to-section.
  const scrollRef = useRef<ScrollView | null>(null)
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

  const today = new Date()
  const dayLabel = `HOY · ${DOW_FULL[today.getDay()]} ${today.getDate()}`
  const fijosRatioPct =
    data.ingresoMes > 0 ? (data.fijosMes / data.ingresoMes) * 100 : 0
  // Recover ahorro mensual from the adapter's identity:
  //   ingreso = fijos + ahorro + libre  ⇒  ahorro = ingreso - fijos - libre
  // No new query needed — the adapter already has it on `data`.
  const ahorroMes = Math.max(
    0,
    data.ingresoMes - data.fijosMes - data.libreMes,
  )

  if (usingMock) {
    // Cuenta nueva o configuración a medio hacer: el mock dataset
    // pintaría números de otro usuario. Renderizamos un empty state
    // que explica por qué no hay datos y guía al próximo paso.
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
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.stack}>
            <ControlV2Header
              score={view.score}
              scoreLabel={view.scoreLabel}
              scoreTone={view.scoreToneDark}
            />

            <ControlV2Anchor section="hoy">
              <ControlV2HoyCard
                cupoDiario={data.cupoDiario}
                gastoHoy={data.gastoHoy}
                libreHoy={view.libreHoy}
                delta={view.delta}
                estaOk={view.estaOk}
                horaF={view.horaF}
                horaActual={data.horaActual}
                minActual={data.minActual}
                diaLabel={dayLabel}
                racha={view.racha}
                diasGanadores={view.diasGanadores}
                closedDays={view.closedDays}
                diasRestantes={view.diasRestantes}
                proximoSueldoEnDias={data.proximoSueldoEnDias}
                momentum={view.momentum}
                noSpendCount={view.noSpendCount}
                alreadyExhausted={view.alreadyExhausted}
              />
            </ControlV2Anchor>

            {signals.length > 0 ? (
              <ControlV2AsesorCard tareas={signals} />
            ) : null}

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
                vsMesDiasBajoCupo={view.vsMesDiasBajoCupo}
                vsMesMejor={view.vsMesMejor}
                diasGanadores={view.diasGanadores}
                diaActual={data.diaActual}
              />
            </ControlV2Anchor>

            <ControlV2Anchor section="patron">
              <ControlV2PatronCard
                dows={view.porDowEnriched}
                peorDow={view.peorDow}
                mejorDow={view.mejorDow}
                globalAvg={view.globalAvg}
                diaActual={data.diaActual}
              />
            </ControlV2Anchor>

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

          </View>
        </ScrollView>
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
