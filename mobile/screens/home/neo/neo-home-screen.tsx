// mobile/screens/home/neo/neo-home-screen.tsx
//
// HOME LIVE del rediseño (FASE 3 del cableado — plan
// design/home-final-2026-07/PLAN-CABLEADO.md §F3). Presenta el kit
// aprobado (`components/redesign/home/home-screen.tsx`, gate
// 'home-final': aprobada) sobre LA MISMA orquestación de negocio que la
// Home vigente (`screens/home/home-screen.tsx` + `components/home/
// home-dashboard.tsx`, que siguen live hasta el swap de F4).
//
// ESTRUCTURA (espejo EXACTO del par home-screen/home-dashboard viejo):
//   · `NeoHomeScreen` (outer) = shell. Sostiene solo lo que la Home vieja
//     tenía ARRIBA del gate: <Screen>+RefreshControl+ScrollView,
//     useHomeSnapshot + useSignalDestinationReady, telemetría de sesión,
//     dashboard/categorías/feed/confirmación de ciclo, banners
//     (deletion > nudge) y PushPermissionPrompt, y el gate de render
//     `error → !snapshot.data → null → <NeoHomeDashboard/>`.
//   · `NeoHomeDashboard` (inner) = TODO lo que la Home vieja tenía DENTRO
//     de <HomeDashboard> (montado recién con snapshot.data): los hooks de
//     datos que seedCaches siembra (useFamilyMembers, useHomeMetrics +
//     sub-queries, useSavingsGoal, useGarden, useStreak, useControlV2Data
//     del vault, useMyFamilyRole/useMonthCloseDecisionPending/
//     useControlIntelligence vía los hooks F0), las derivaciones F2 y la
//     orquestación F0. Diferir su MONTAJE hasta seedCaches evita ~7 fetches
//     duplicados en cold start (RIESGO 7 / G11): el gate de la vieja era
//     de MONTAJE, no solo de render — replicado acá con el split.
//
// GATE seedCaches (G11): `!snapshot.data ? null : <NeoHomeDashboard/>`; el
// null lo tapa el overlay del bridge (sin skeleton). Como los hooks de
// datos viven en el inner, no montan hasta que home_snapshot pobló los
// caches.
//
// PREVIEW (prop `preview`, la pasa la ruta dev app/(app)/settings/dev/
// neo-home.tsx): en la ruta dev la Home vieja sigue montada en la tab
// (freezeOnBlur:false → efectos vivos) y correr la orquestación en
// paralelo colisiona. Con `preview=true` se DESACTIVA todo lo
// side-effectful/global que pisa a la vieja, dejando los sheets montados
// (para poder verlos) pero SIN auto-fire:
//   1. Tour: no registra HOME_TOUR (NeoTourStep rinde solo children) ni el
//      ScrollView (HomeTourScrollBinding no monta) ni auto-start
//      (useScreenTour enabled:!preview) — evita clobbear los registros
//      (por (tour,order)) de la Home vieja live y borrarlos al salir.
//   2. Realtime: useHomeRealtime(undefined) no suscribe el canal compartido
//      `family-realtime:{familyId}:home` (evita que el removeChannel del
//      unmount deje a la vieja sin realtime).
//   3. Orquestación F0: useCycleSheetAutoOpen + useMonthCloseOrchestration
//      con enabled:!preview → sus useEffect (silent-anchor, auto-open del
//      cycle sheet, auto-open del decision sheet, auto-fire del wrapped)
//      hacen early-return; los handlers manuales siguen operativos.
//   4. Telemetría: useHomeTelemetry(undefined) no emite eventos de sesión;
//      trackTap/scrolled_to_bottom/refreshed/useTrackElement gateados por
//      preview → cero telemetría desde el preview.
// El swap real (F4) usa preview=false (default) y todo corre.
//
// Chrome: canvas plano `s.bg` del spec (sin AmbientBlobs/backdrop —
// retiro deliberado), insets reales vía <Screen>; la nav sigue siendo la
// tab bar del navigator (F5). Nada de status bar dibujada.
//
// DECISIONES DE F3 (documentadas — contrato del kit congelado, no se
// modifica el kit en esta fase):
//   · Saldo del pozo = string formateado (formatMoney) — el kit no expone
//     slot para CountUpText; recuperar el count-up exige evolucionar el
//     contrato del kit (pase aparte, flag al owner).
//   · Cobro PENDIENTE (o cobro es HOY) → chip 'pending' del kit =
//     "¿Ya cobraste?" (dot naranja de atención); la entrada al confirm es
//     el tap del chip + el auto-open del sheet (gates F0 intactos). Copy
//     definitivo = pase F3.5.
//   · "Cobrado hoy ✓" = last_salary_confirmed_at es HOY (día local).
//   · Saludo: BANDAS horarias de getGreeting (vía deriveHomeMoment), pero
//     el COPY + emoji salen de HOME_MOMENTS (mockup aprobado: minúscula +
//     coma), NO del string i18n de getGreeting. Pase i18n F3.5.
//   · variant 'adjusted' SOLO con override DOWN (cycleBalanceDiff ≤ 0) —
//     espejo del chip peach viejo; override UP queda 'steady' + chip
//     "Sumaste $X al mes" (así lo dibuja el mockup principal).
//   · Filas del resumen: 1 tap-region por fila (contrato del kit); los
//     deep-links por banda (categoryId / focusFixedExpenseId) quedan para
//     la evolución del contrato. Impresiones top_category_chip /
//     next_fixed_chip se conservan.
//   · Links de sección ("Ver detalle"/"Ver todos") = Pressable alrededor
//     del HomeSectionHeader (el kit no expone onPress del link).
//   · Meta: tap abre QuickAddSavingsSheet (default G15) con suggestedAmount
//     = cycleVault, como la MetaCard vieja; meta COMPLETA (remaining ≤ 0) →
//     tap navega al detalle (el quick-add caería al piso 100000 sin
//     advertir sobre-aporte — espejo del gate enableQuickAdd && !isComplete
//     de la MetaCard vieja); sin meta → CTA "Crear" → /(app)/savings-goal.
//   · Usuario NUEVO (criterio documentado): hero en variant 'empty'
//     (setup pendiente) Y sin gastos manuales → saludo "¡bienvenido!",
//     meta dashed y BR-E de actividad con CTA.
//   · Avatares del chip Miembros: SVG reales del pack (AvatarAnimal por
//     avatarSlug) o iniciales (Avatar) como fallback; el kit los envuelve
//     en el círculo con ring de separación (membersBackground).
//   · Tiles de actividad: sticker REAL de categoría (CategoryIcon, gastos)
//     sobre tinte del color de categoría (alpha 0.18 claro / 0.14 oscuro,
//     README:33); ingresos = emoji (paridad con la vieja) y el monto va con
//     "+" (el kit no tinta verde).
//   · Racha: 'Semana perfecta' se deriva de la tira VIVA (weekStrip todo
//     'logged'), NO de weekClose (semana pasada, quedaba pegado 7 días).
//     Título: broken > perfecta > at-risk > activa (broken con precedencia
//     robusta). at_risk solo con racha activa (currentStreak > 0): el
//     zero-state cae a 'none' (pose del momento), no worried/idle.
//   · Tour re-cableado 1:1 (auto-start gateado !isOnboardingFlow, 4
//     variantes de copy, radios 32/24/22). variables+fixed comparten la
//     card del resumen (TourTargets anidados — el kit no expone refs por
//     fila). El paso fab lo registra la tab bar real.
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
  type RefObject,
} from 'react'
import {
  RefreshControl,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollView,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'expo-router'
import { useScrollToTop } from '@react-navigation/native'
import { useScreenLifecycleLog } from '@/lib/dev/anim-log'
import { useSignalDestinationReady } from '@/features/auth-flow/use-signal-destination-ready'
import { useIsAuthOverlayVisible } from '@/features/auth-flow/use-auth-flow'
import { useAuthSession } from '@/features/auth/use-auth-session'
import { CancelDeletionBanner } from '@/components/common/cancel-deletion-banner'
import { FreePeriodNudge } from '@/components/billing/free-period-nudge'
import { PushPermissionPrompt } from '@/components/permissions/push-permission-prompt'
import { NeoStateBlock } from '@/components/ui/neo-state-block'
import { ListRowSkeleton } from '@/components/ui/skeleton-layouts'
import { Screen } from '@/components/ui/screen'
import { SwipeRow, type SwipeAction } from '@/components/ui/swipe-row'
import { HomeDashboardSheets } from '@/components/home/home-dashboard-sheets'
import { MonthCloseDecisionSheet } from '@/components/home/sheets/month-close-decision-sheet'
import { QuickAddSavingsSheet } from '@/components/home/quick-add-savings-sheet'
import { RiseView } from '@/components/home/animated/rise-view'
import { computeSavingsHeroChip } from '@/components/home/home-hero-savings-helpers'
import {
  computeTopCategory,
  formatTopCategoryShare,
} from '@/components/home/home-top-category-helpers'
import {
  computeNextFixed,
  formatDaysUntilDue,
} from '@/components/home/home-next-fixed-helpers'
import {
  HomeActivityRows,
  HomeChipsRow,
  HomeCycleSummary,
  HomeGoalCard,
  HomeHeader,
  HomeHero,
  HomeSectionHeader,
  HomeStreakCard,
  type HomeActivityItem,
  type HomeCycleFijosVM,
  type HomeCycleVariablesVM,
  type HomeGaugeVM,
  type HomeGoalVM,
  type HomeGreeting,
  type HomeHeroVariant,
  type HomeMembersChipVM,
  type HomePaydayChipVM,
  type HomePipState,
} from '@/components/redesign/home/home-screen'
import { HOME_MOMENTS, HOME_SPEC, type HomeMode } from '@/components/redesign/home/home-spec'
import { useCategories } from '@/features/categories/use-categories'
import { useDeleteExpense, useRecentExpenses, type Expense } from '@/features/expenses/use-expenses'
import {
  useDeleteIncomeEvent,
  useIncomeEvents,
  type IncomeEvent,
} from '@/features/income/use-income-events'
import { INCOME_KIND_BY_KEY } from '@/features/income/income-kinds'
import { CategoryIcon } from '@/components/category/category-icon'
import { AvatarAnimal } from '@/components/ui/avatar-animal'
import { Avatar } from '@/components/ui/avatar'
import { useIsSolo } from '@/features/family/use-is-solo'
import {
  activeFamilyMembers,
  useFamilyMembers,
} from '@/features/family/use-family-members'
import {
  useCycleConfirmation,
  useCycleSheetAutoOpen,
} from '@/features/home/use-cycle-confirmation'
import { useMonthCloseOrchestration } from '@/features/home/use-month-close-orchestration'
import { useHomeSnapshot } from '@/features/home/use-home-snapshot'
import { useHomeRealtime } from '@/features/home/use-home-realtime'
import { useHomeTelemetry } from '@/features/home/use-home-telemetry'
import { useTrackElement } from '@/features/home/use-track-element'
import {
  logHomeEvent,
  type HomeElementId,
  type HomeSlot,
} from '@/features/home/log-home-event'
import { useHomeMetrics } from '@/features/home/use-home-metrics'
import {
  classifyDashboardError,
  daysUntilPayday,
  getGreetingName,
  isPaydayPending,
  type DashboardErrorKind,
} from '@/features/home/home-dashboard-model'
import {
  deriveHomeBrotPose,
  deriveHomeMoment,
  type HomeBrotAtRiskLevel,
} from '@/features/home/derive-brot-pose'
import { deriveGaugeState } from '@/features/home/derive-gauge-state'
import {
  selectFixedChip,
  selectHeroEventChip,
  selectReservaChip,
} from '@/features/home/select-hero-event-chip'
import { selectHeroVariant } from '@/features/home/select-hero-variant'
import { useMyProfile } from '@/features/profile/use-profile'
import { useUnreadNotificationsCount } from '@/features/notifications/use-notifications'
import { useColdStartBiometricCheck } from '@/features/auth/use-cold-start-biometric-check'
import { usePinLockCheck } from '@/features/auth/use-pin-lock-check'
import { useProtectionPrompt } from '@/features/auth/use-protection-prompt'
import { useControlV2Data } from '@/features/insights/use-control-v2-data'
import { useSavingsGoal } from '@/features/savings-goals/use-savings-goal'
import { useAddSavingsContribution } from '@/features/savings-goals/use-add-savings-contribution'
import { useGarden } from '@/features/garden/use-garden'
import type { WeekDayState } from '@/features/garden/garden-model'
import { deriveStreak, useStreak } from '@/features/streaks/use-streak'
import { useEntitlement } from '@/features/billing/use-entitlement'
import { useUsdRate } from '@/features/finance/use-usd-rate'
import {
  HOME_TOUR,
  HOME_TOUR_STEPS,
  TourTarget,
  useRegisterTourScrollView,
  useScreenTour,
  type HighlightStyle,
} from '@/features/tours'
import { useFamilyDashboard, type FamilyDashboard } from '@/hooks/use-family-dashboard'
import { useCurrentDate } from '@/hooks/use-current-date'
import { usePayCycle } from '@/hooks/use-pay-cycle'
import { triggerHaptic } from '@/lib/haptics'
import { toast } from '@/lib/toast-bus'
import { useThemeMode } from '@/theme/theme-provider'
import { formatLocalDateKey } from '@/utils/pay-cycle'
import {
  formatMoney,
  formatMoneyShort,
  formatMoneyWithSign,
  formatUsdWithSign,
} from '@/utils/money'
import { getErrorMessage } from '@/utils/error-message'

// ─── Helpers puros locales ───────────────────────────────────────────

/** Tinte pastel del tile de actividad: color de categoría al 18% (claro)
 *  / 14% (oscuro) — README:33 del handoff (G12). */
function tintTile(hex: string, mode: HomeMode): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim())
  if (!m) return hex
  const n = parseInt(m[1], 16)
  const alpha = mode === 'dark' ? 0.14 : 0.18
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`
}

/** Pips del catálogo §9 ← estados reales de `deriveWeekStrip`. Mapeo
 *  documentado (metrics-model §12): recovered (escudo) → 'seedling'. */
const PIP_BY_WEEK_STATE: Record<WeekDayState, HomePipState> = {
  logged: 'done',
  pending: 'today',
  future: 'idle',
  missed: 'missed',
  recovered: 'seedling',
}

/** ISO cronológico de un income — COPIA LITERAL de la regla del feed
 *  vigente (`home-activity-section.tsx:51-55`): ancla a T12:00 del
 *  event_date para que un backdate ordene por su día real. */
function incomeChronologicalIso(income: IncomeEvent): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(income.event_date)
  if (m) return `${income.event_date}T12:00:00.000Z`
  return income.created_at
}

type MovementItem =
  | { kind: 'expense'; iso: string; expense: Expense }
  | { kind: 'income'; iso: string; income: IncomeEvent }

// Mismos literales que el feed vigente (`home-activity-section.tsx`).
const INCOME_TILE_COLOR = '#329315'
const NO_CATEGORY_COLOR = '#888888'
const ACTIVITY_LIMIT = 6
/** Techo del gate del conteo del saldo — ver `balanceCountReady`. No es
 *  una animación (el guard de motion-tokens sólo mira withTiming/withSpring):
 *  es el corte que evita que un `balanceHydrating` colgado congele el monto. */
const HERO_COUNT_GATE_CEILING_MS = 2500

type TourScrollHandlers = {
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void
  onContentSizeChange: (width: number, height: number) => void
}

/**
 * Registra el ScrollView de la Home al tour como componente aparte para
 * poder GATEARLO en preview (hook rules): en la ruta dev la Home vieja
 * sigue montada y comparte la key HOME_TOUR en el registro de scroll
 * (module-level). Reporta los handlers vía ref (patrón `configRef` de
 * TourTarget) para que el <Screen> del outer los use sin re-render.
 */
function HomeTourScrollBinding({
  scrollRef,
  bindingRef,
}: {
  scrollRef: RefObject<ScrollView | null>
  bindingRef: MutableRefObject<TourScrollHandlers | null>
}) {
  const handlers = useRegisterTourScrollView(HOME_TOUR, scrollRef)
  bindingRef.current = handlers
  return null
}

/** TourTarget gateado: en preview rinde solo los children (sin registrar
 *  el paso, que clobbearía los registros de la Home vieja live). */
function NeoTourStep({
  preview,
  order,
  text,
  highlight,
  children,
}: {
  preview: boolean
  order: number
  text: string
  highlight?: HighlightStyle
  children: ReactNode
}) {
  if (preview) return <>{children}</>
  return (
    <TourTarget tour={HOME_TOUR} order={order} text={text} highlight={highlight}>
      {children}
    </TourTarget>
  )
}

interface NeoHomeScreenProps {
  userId: string
  familyId: string
  /** `true` desde la ruta dev de preview (app/(app)/settings/dev/
   *  neo-home.tsx): desactiva todo lo que colisiona con la Home vieja
   *  live (tour, realtime, orquestación F0, telemetría). Ver header. */
  preview?: boolean
}

export function NeoHomeScreen({ userId, familyId, preview = false }: NeoHomeScreenProps) {
  useScreenLifecycleLog('Inicio')
  const router = useRouter()
  const { t } = useTranslation()
  const mode = useThemeMode().resolvedMode as HomeMode
  const s = HOME_SPEC[mode]
  const [isRefreshing, setIsRefreshing] = useState(false)

  // ── Registro del ScrollView al tour (auto-scroll de pasos) ─────────
  // Vía HomeTourScrollBinding (gateado en preview). Los handlers llegan
  // por ref para no forzar re-render del outer.
  const tourScrollRef = useRef<ScrollView | null>(null)
  const tourScrollBindingRef = useRef<TourScrollHandlers | null>(null)

  /**
   * Tocar la tab YA activa vuelve al principio (convención de iOS y Android).
   * Antes ese toque vibraba y no hacía nada: la barra emite `tabPress` siempre
   * —hace falta para el `preventDefault()` del tour— pero nadie lo escuchaba,
   * así que había confirmación táctil de una acción inexistente.
   *
   * Se usa el hook de React Navigation y no un bus propio (había uno,
   * `lib/tab-focus-pulse`, sin un solo suscriptor y con el productor roto —se
   * borró): ya resuelve los tres bordes que importan — actúa SÓLO con la
   * pantalla enfocada, respeta el `defaultPrevented` del tour, y no se dispara
   * al volver de un modal (un pop no emite `tabPress`), así que la posición de
   * scroll sobrevive a add-expense/jardín/ajustes.
   */
  useScrollToTop(tourScrollRef)

  // AppStackShell ya dispara y seedea el snapshot; acá solo necesitamos
  // el refetch handle (pull-to-refresh) + el gate de render.
  const snapshot = useHomeSnapshot(userId)
  useSignalDestinationReady(Boolean(snapshot.data))

  // Nudge del período libre (G2) — gate literal de la vieja.
  const freeEnt = useEntitlement(userId).data
  const showFreeNudge =
    freeEnt?.source === 'trial' &&
    freeEnt.daysLeft != null &&
    freeEnt.daysLeft <= 7

  // Telemetría de sesión: en preview la apagamos pasando familyId
  // undefined (useHomeTelemetry no emite open/close). sessionId sigue
  // disponible para correlacionar, pero nada se loguea.
  const telemetry = useHomeTelemetry(preview ? undefined : familyId)

  // scrolled_to_bottom una vez por sesión, buffer 40pt (G6, literal).
  const reachedBottomRef = useRef(false)
  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      tourScrollBindingRef.current?.onScroll(event)
      if (preview) return
      if (reachedBottomRef.current) return
      if (!familyId) return
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent
      const distanceFromBottom =
        contentSize.height - (contentOffset.y + layoutMeasurement.height)
      if (distanceFromBottom <= 40 && contentSize.height > layoutMeasurement.height) {
        reachedBottomRef.current = true
        void logHomeEvent({
          familyId,
          event: 'home.scrolled_to_bottom',
          context: { session_id: telemetry.sessionId },
        })
      }
    },
    [preview, familyId, telemetry.sessionId],
  )
  const handleContentSizeChange = useCallback((width: number, height: number) => {
    tourScrollBindingRef.current?.onContentSizeChange(width, height)
  }, [])

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true)
    if (!preview && familyId) {
      void logHomeEvent({
        familyId,
        event: 'home.refreshed',
        context: { session_id: telemetry.sessionId },
      })
    }
    // Re-arma la detección de scroll-to-bottom (el contenido puede
    // reflowear tras el refresh) — literal de la vieja.
    reachedBottomRef.current = false
    try {
      await snapshot.refetch()
    } finally {
      setIsRefreshing(false)
    }
  }, [snapshot, preview, familyId, telemetry.sessionId])

  const { data: profile } = useMyProfile(userId)

  // Dot del engranaje (G7) — Sprint R-3: señal ambient, no banner.
  const biometricCheck = useColdStartBiometricCheck(userId)
  const pinCheck = usePinLockCheck(userId)
  const protectionPrompt = useProtectionPrompt({
    userId,
    hasSession: Boolean(userId),
    hasBiometricCredentials: biometricCheck.shouldUseBiometric,
    pinIsSet: pinCheck.isSet,
    onboardingCompleted: Boolean(profile?.onboarding_completed_at),
  })
  const isSolo = useIsSolo(userId)
  const dashboard = useFamilyDashboard(familyId)
  const categoriesQuery = useCategories(familyId)
  const recentExpensesQuery = useRecentExpenses(familyId, 6)
  const incomeEventsQuery = useIncomeEvents(familyId)
  const recentIncome = useMemo(
    () => incomeEventsQuery.data ?? [],
    [incomeEventsQuery.data],
  )
  const { confirmCycleStartingBalance, salaryErrorMessage, isSavingSalary } =
    useCycleConfirmation({ dashboard, familyId, userId, t })
  const unreadNotificationsCount =
    useUnreadNotificationsCount(familyId, userId).data ?? 0

  // Realtime: en preview no suscribe (familyId undefined) para no compartir
  // ni destruir el canal `family-realtime:{familyId}:home` de la vieja.
  useHomeRealtime(preview ? undefined : familyId)

  // Badge del asistente — mismo source/filtrado que la pantalla del
  // asistente; defer para no competir con el first-paint (literal).
  const { signals: assistantSignals, signalsReady: assistantReady } = useControlV2Data(
    familyId,
    userId,
    { defer: true },
  )
  const assistantPendingCount = assistantReady ? assistantSignals.length : 0

  // Mapas de categorías con referencia estable (sostienen memos abajo).
  const categoryNameById = useMemo(
    () =>
      new Map(
        (categoriesQuery.data ?? []).map(
          (category) => [category.id, category.displayName] as const,
        ),
      ),
    [categoriesQuery.data],
  )
  const categoryRawNameById = useMemo(
    () =>
      new Map(
        (categoriesQuery.data ?? []).map(
          (category) => [category.id, category.name] as const,
        ),
      ),
    [categoriesQuery.data],
  )
  const categoryColorById = useMemo(
    () =>
      new Map(
        (categoriesQuery.data ?? []).map((category) => [category.id, category.color] as const),
      ),
    [categoriesQuery.data],
  )
  // Feed = solo gastos manuales (los commitment_id viven en Fijos).
  const recentExpenses = useMemo(
    () => (recentExpensesQuery.data ?? []).filter((e) => !e.commitment_id),
    [recentExpensesQuery.data],
  )

  const shouldShowDashboardError =
    (dashboard.familyFinanceQuery.error && !dashboard.familyFinanceQuery.data) ||
    (dashboard.fixedExpensesQuery.error && !dashboard.fixedExpensesQuery.data) ||
    (dashboard.expensesQuery.error && !dashboard.expensesQuery.data)

  const activityError =
    recentExpensesQuery.isError && recentExpenses.length === 0
      ? recentExpensesQuery.error
      : categoriesQuery.isError && recentExpenses.length === 0
        ? categoriesQuery.error
        : undefined
  const activityErrorKind: DashboardErrorKind | undefined = activityError
    ? classifyDashboardError(activityError)
    : undefined

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <Screen
      backgroundColor={s.bg}
      contentContainerStyle={styles.screenContent}
      onScroll={handleScroll}
      // 16ms = una vez por frame: el tour lee scrollYRef y con throttle
      // mayor el highlight cae off-target (gotcha 15 del plan).
      scrollEventThrottle={16}
      scrollRef={tourScrollRef}
      onContentSizeChange={handleContentSizeChange}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={handleRefresh}
          tintColor={s.sectionLink}
          colors={[s.sectionLink]}
        />
      }
    >
      {/* Registro del ScrollView al tour — gateado en preview (no clobbea
          el registro de la Home vieja live). */}
      {preview ? null : (
        <HomeTourScrollBinding
          scrollRef={tourScrollRef}
          bindingRef={tourScrollBindingRef}
        />
      )}
      {shouldShowDashboardError ? (
        <NeoStateBlock
          icon="error-outline"
          description={getErrorMessage(
            dashboard.dashboardError,
            t('states:error.server'),
          )}
          title={t('home:homeScreen.dashboardError')}
          actionLabel={t('states:errorState.action')}
          tone="error"
          onAction={() => {
            void dashboard.refetchAll()
          }}
        />
      ) : !snapshot.data ? (
        // Gate seedCaches (G11): el dashboard NO monta hasta que
        // home_snapshot pobló los caches — el null lo tapa el overlay
        // del bridge. Sin skeleton inventado.
        null
      ) : (
        <>
          {/* Banners ARRIBA del header — precedencia deletion > nudge
              (G1/G2, componentes actuales tal cual; re-skin = pase aparte). */}
          {profile?.deletion_scheduled_at ? (
            <CancelDeletionBanner
              userId={userId}
              scheduledAt={profile.deletion_scheduled_at}
            />
          ) : null}
          {showFreeNudge ? (
            <FreePeriodNudge
              daysLeft={freeEnt?.daysLeft ?? 0}
              onSeePlans={() => router.push('/(app)/settings/plan')}
            />
          ) : null}

          {/* Dashboard: montado SOLO con snapshot.data → sus hooks de
              datos (los que seedCaches siembra) se difieren hasta el seed. */}
          <NeoHomeDashboard
            userId={userId}
            familyId={familyId}
            preview={preview}
            mode={mode}
            dashboard={dashboard}
            displayName={profile?.display_name}
            settingsNudge={protectionPrompt.visible}
            isSolo={isSolo}
            categoryNameById={categoryNameById}
            categoryRawNameById={categoryRawNameById}
            categoryColorById={categoryColorById}
            recentExpenses={recentExpenses}
            recentIncome={recentIncome}
            unreadNotificationsCount={unreadNotificationsCount}
            assistantPendingCount={assistantPendingCount}
            confirmCycleStartingBalance={confirmCycleStartingBalance}
            salaryErrorMessage={salaryErrorMessage}
            isSavingSalary={isSavingSalary}
            telemetry={telemetry}
            isLoadingActivity={recentExpensesQuery.isLoading}
            activityErrorKind={activityErrorKind}
          />

          {/* Re-prompt de push (G3) — self-gateado, mismo ready. */}
          <PushPermissionPrompt
            userId={userId}
            familyId={familyId}
            ready={Boolean(snapshot.data)}
          />
        </>
      )}
    </Screen>
  )
}

interface NeoHomeDashboardProps {
  userId: string
  familyId: string
  preview: boolean
  mode: HomeMode
  dashboard: FamilyDashboard
  /** `profile.display_name` crudo (el header aplica getGreetingName). */
  displayName: string | null | undefined
  settingsNudge: boolean
  isSolo: boolean
  categoryNameById: Map<string, string>
  categoryRawNameById: Map<string, string>
  categoryColorById: Map<string, string>
  recentExpenses: Expense[]
  recentIncome: IncomeEvent[]
  unreadNotificationsCount: number
  assistantPendingCount: number
  confirmCycleStartingBalance: (startingBalance: number | null) => void
  salaryErrorMessage: string | null
  isSavingSalary: boolean
  telemetry: { sessionId: string; markTapped: () => void }
  isLoadingActivity: boolean
  activityErrorKind: DashboardErrorKind | undefined
}

/**
 * Espejo del <HomeDashboard> viejo: monta TODOS los hooks de datos que
 * seedCaches siembra + las derivaciones F2 + la orquestación F0. Al vivir
 * dentro de la rama `snapshot.data`, esos hooks no montan hasta que
 * home_snapshot pobló los caches (gate de MONTAJE, no solo de render).
 */
function NeoHomeDashboard({
  userId,
  familyId,
  preview,
  mode,
  dashboard,
  displayName,
  settingsNudge,
  isSolo,
  categoryNameById,
  categoryRawNameById,
  categoryColorById,
  recentExpenses,
  recentIncome,
  unreadNotificationsCount,
  assistantPendingCount,
  confirmCycleStartingBalance,
  salaryErrorMessage,
  isSavingSalary,
  telemetry,
  isLoadingActivity,
  activityErrorKind,
}: NeoHomeDashboardProps) {
  const router = useRouter()
  const { t } = useTranslation()
  const today = useCurrentDate()
  const [isCycleBalanceSheetOpen, setCycleBalanceSheetOpen] = useState(false)
  const [goalSheetOpen, setGoalSheetOpen] = useState(false)

  const deleteExpenseMutation = useDeleteExpense(familyId, userId)
  const deleteIncomeMutation = useDeleteIncomeEvent(userId)

  // ── Orquestación de negocio (idéntica a home-dashboard.tsx) ────────
  const sessionUserId = useAuthSession().data?.user?.id
  const splashIsHidden = !useIsAuthOverlayVisible()

  const lastConfirmedAt = dashboard.familyFinanceQuery.data?.last_salary_confirmed_at ?? null
  const payCycle = dashboard.payCycle
  // Ciclo REAL (freeze:false) solo para OBLIGACIONES (próximo fijo) —
  // el saldo sigue en el plano frozen (RIESGO 1: no mezclar).
  const { cycle: realCycle } = usePayCycle(familyId, { freeze: false })
  const isDynamicIncome = dashboard.incomeMode === 'dynamic'
  const pending = useMemo(
    () =>
      isDynamicIncome
        ? false
        : isPaydayPending({ cycle: payCycle, lastConfirmedAt }, today),
    [isDynamicIncome, payCycle, lastConfirmedAt, today],
  )
  const days = useMemo(
    () => (isDynamicIncome ? null : daysUntilPayday(payCycle, today)),
    [isDynamicIncome, payCycle, today],
  )

  const membersQuery = useFamilyMembers(familyId)
  const homeMetrics = useHomeMetrics(familyId)
  const savingsGoalQuery = useSavingsGoal(familyId)
  const garden = useGarden(familyId, sessionUserId)
  const streakQuery = useStreak(familyId, sessionUserId)

  const familyMembers = useMemo(
    () => membersQuery.data ?? [],
    [membersQuery.data],
  )
  // El roster crudo incluye a los BLOQUEADOS (siguen resolviendo el avatar de
  // un gasto viejo suyo, ver `familyMembers` más abajo). La píldora de
  // miembros habla del hogar ACTUAL: si cuenta bloqueados dice "Miembros · 3"
  // donde Ajustes dice "2 activos · 1 bloqueado".
  const activeMembers = useMemo(
    () => activeFamilyMembers(membersQuery.data),
    [membersQuery.data],
  )
  // Income acotado a la ventana del ciclo por event_date (el arrastre
  // "Sobrante de X" no flota a ciclos siguientes — regla literal).
  const cycleIncome = useMemo(() => {
    const startKey = formatLocalDateKey(payCycle.start)
    const endKey = formatLocalDateKey(payCycle.end)
    return recentIncome.filter(
      (e) => e.event_date >= startKey && e.event_date < endKey,
    )
  }, [recentIncome, payCycle.start, payCycle.end])
  const expensesData = useMemo(
    () => dashboard.expensesQuery.data ?? [],
    [dashboard.expensesQuery.data],
  )
  const fixedExpensesData = useMemo(
    () => dashboard.fixedExpensesQuery.data ?? [],
    [dashboard.fixedExpensesQuery.data],
  )
  // Alcancía del ciclo (slider del quick-add de Meta) — literal.
  const controlData = useControlV2Data(familyId)
  const cycleVault = controlData.usingMock ? 0 : controlData.view.vault

  // ── Gating del cycle prompt (literal de la vieja) ──────────────────
  const storedCycleAnchor =
    dashboard.familyFinanceQuery.data?.current_cycle_anchor ?? null
  const hasManualExpense = useMemo(
    () => expensesData.some((e) => !e.commitment_id),
    [expensesData],
  )
  const onboardingSkippedViaExpense =
    !isDynamicIncome && storedCycleAnchor == null && hasManualExpense
  const isOnboardingFlow = !isDynamicIncome && storedCycleAnchor == null
  // Auto-start del tour gateado a !isOnboardingFlow (evita doble Modal iOS)
  // y a !preview (no arranca el tour de la vieja desde el dev-route).
  useScreenTour(HOME_TOUR, { enabled: !isOnboardingFlow && !preview })

  useCycleSheetAutoOpen({
    dashboard,
    familyId,
    sessionUserId,
    isOnboardingFlow,
    onboardingSkippedViaExpense,
    pending,
    splashIsHidden,
    onConfirmCycleStartingBalance: confirmCycleStartingBalance,
    setCycleBalanceSheetOpen,
    enabled: !preview,
  })

  const handleChipConfirm = useCallback(() => {
    if (
      !pending &&
      !dashboard.isCycleStartingBalancePromptPending &&
      days !== 0
    ) {
      return
    }
    setCycleBalanceSheetOpen(true)
  }, [pending, dashboard.isCycleStartingBalancePromptPending, days])
  const handleCycleSheetClose = useCallback(() => {
    if (isSavingSalary) return
    setCycleBalanceSheetOpen(false)
  }, [isSavingSalary])

  const activeGoalForSheet = useMemo(() => {
    const g = savingsGoalQuery.data
    if (!g) return null
    if (g.isActive === false) return null
    // Montos incluidos: la barra de progreso de la opción "Destinar a mi
    // meta" del wrapped (pantalla 06) los necesita.
    return {
      id: g.id,
      title: g.title,
      emoji: g.emoji,
      currentAmount: g.currentAmount,
      goalAmount: g.goalAmount,
    }
  }, [savingsGoalQuery.data])

  const {
    pendingDecision,
    decisionSheetOpen,
    applyDecision,
    handleApplyDecision,
    handleSkipDecision,
    handleDecisionSheetClose,
    fireWrappedForClosedCycle,
  } = useMonthCloseOrchestration({
    familyId,
    sessionUserId,
    isOnboardingFlow,
    isDynamicIncome,
    pending,
    splashIsHidden,
    categoryNameById,
    activeGoalForSheet,
    t,
    enabled: !preview,
  })

  const handleCycleSheetSave = useCallback((amount: number) => {
    confirmCycleStartingBalance(amount)
    setCycleBalanceSheetOpen(false)
    void fireWrappedForClosedCycle()
  }, [confirmCycleStartingBalance, fireWrappedForClosedCycle])
  const handleCycleSheetKeepDefault = useCallback(() => {
    confirmCycleStartingBalance(null)
    setCycleBalanceSheetOpen(false)
    void fireWrappedForClosedCycle()
  }, [confirmCycleStartingBalance, fireWrappedForClosedCycle])
  const remainingDaysInCycle = Math.max(1, dashboard.remainingUntilPayday)

  // ── Telemetría central ─────────────────────────────────────────────
  const trackTap = useCallback(
    (
      elementId: HomeElementId,
      slot: HomeSlot,
      destinationRoute?: string,
    ) => {
      if (preview) return
      telemetry.markTapped()
      void logHomeEvent({
        familyId,
        event: 'home.element_tapped',
        elementId,
        slot,
        context: {
          session_id: telemetry.sessionId,
          destination_route: destinationRoute ?? null,
        },
      })
    },
    [preview, familyId, telemetry],
  )

  // ── Handlers de navegación (rutas de la vieja, tabla §11) ──────────
  //
  // El háptico va en los TRES: cambiar de vista principal se siente igual se
  // haya tocado la barra de tabs (que lo dispara en su `tabPress`) o una card
  // que lleva al mismo lado. Sin esto, "Ver todos" saltaba a Gastos en silencio
  // mientras la tab de al lado vibraba — el mismo destino con dos sensaciones.
  const handleViewGastos = useCallback(() => {
    void triggerHaptic('selection')
    trackTap('month_summary_variables', 'S5', '/(app)/(tabs)/expenses')
    router.push('/(app)/(tabs)/expenses')
  }, [router, trackTap])
  const handleViewFijos = useCallback(() => {
    void triggerHaptic('selection')
    trackTap('month_summary_fixed', 'S5', '/(app)/(tabs)/fixed-expenses')
    router.push('/(app)/(tabs)/fixed-expenses')
  }, [router, trackTap])
  const handleViewAllActivity = useCallback(() => {
    void triggerHaptic('selection')
    trackTap('activity_view_all', 'S7', '/(app)/(tabs)/expenses')
    router.push('/(app)/(tabs)/expenses')
  }, [router, trackTap])
  const handleActivityRetry = useCallback(() => {
    void dashboard.refetchAll()
  }, [dashboard])
  const handlePressNotifications = useCallback(() => {
    trackTap('header_bell', 'S1', '/(app)/notifications')
    router.push('/(app)/notifications')
  }, [trackTap, router])
  const handlePressSettings = useCallback(() => {
    trackTap('header_settings', 'S1', '/(app)/settings')
    router.push('/(app)/settings')
  }, [trackTap, router])
  const handlePressAssistant = useCallback(() => {
    trackTap('header_assistant', 'S1', '/(app)/asistente')
    void triggerHaptic('selection')
    router.push('/(app)/asistente')
  }, [trackTap, router])
  const handlePressMembers = useCallback(() => {
    trackTap('family_avatar', 'S2', '/(app)/household')
    void triggerHaptic('selection')
    router.push('/(app)/household')
  }, [trackTap, router])
  const handlePressConfigureIncome = useCallback(() => {
    trackTap('hero_setup_cta', 'S3', '/(app)/settings')
    void triggerHaptic('selection')
    router.push('/(app)/settings')
  }, [trackTap, router])
  const handlePressAddIncome = useCallback(() => {
    trackTap('hero_add_income_cta', 'S3', '/(app)/add-income')
    void triggerHaptic('selection')
    router.push('/(app)/add-income')
  }, [trackTap, router])
  const handleChipConfirmTracked = useCallback(() => {
    trackTap('payday_pill', 'S2')
    handleChipConfirm()
  }, [trackTap, handleChipConfirm])
  // Saldo inicial del ciclo: abre el sheet DIRECTO. handleChipConfirm no sirve
  // acá — su guarda pide cobro pendiente / prompt pendiente / payday hoy, y en
  // el arranque del ciclo ninguna de las tres tiene por qué darse.
  const handleConfirmStartingBalance = useCallback(() => {
    trackTap('payday_pill', 'S2')
    void triggerHaptic('selection')
    setCycleBalanceSheetOpen(true)
  }, [trackTap])

  // ── Deletes del feed (haptics + aviso neo) ─────────────────────────
  // El fallo es un aviso sin decisión: va al toast del host global, que
  // además sobrevive al desmontaje de la Home si el delete resuelve
  // después de navegar (el diálogo del SO sobrevivía por ser del SO).
  const handleDeleteExpense = useCallback((expenseId: string) => {
    trackTap('activity_row', 'S7')
    void triggerHaptic('warning')
    deleteExpenseMutation.mutate(expenseId, {
      onError: (error: unknown) => {
        void triggerHaptic('error')
        toast.error(
          `${t('home:homeScreen.deleteError')} · ${getErrorMessage(error, t('states:error.server'))}`,
        )
      },
      onSuccess: () => {
        void triggerHaptic('success')
      },
    })
  }, [deleteExpenseMutation, trackTap, t])
  const handleDeleteIncome = useCallback(
    (incomeId: string) => {
      if (!familyId) return
      void triggerHaptic('warning')
      deleteIncomeMutation.mutate(
        { id: incomeId, familyId },
        {
          onError: (error: unknown) => {
            void triggerHaptic('error')
            toast.error(
              `${t('home:homeScreen.deleteError')} · ${getErrorMessage(error, t('states:error.server'))}`,
            )
          },
          onSuccess: () => {
            void triggerHaptic('success')
          },
        },
      )
    },
    [deleteIncomeMutation, familyId, t],
  )
  const pendingDeleteExpenseId = deleteExpenseMutation.isPending
    ? (deleteExpenseMutation.variables ?? null)
    : null
  const pendingDeleteIncomeId = deleteIncomeMutation.isPending
    ? (deleteIncomeMutation.variables?.id ?? null)
    : null

  // ── Números del hero (fuentes canónicas, tabla NÚMEROS del plan) ───
  const hero = homeMetrics.hero

  // ── Gate del conteo del saldo del hero ──────────────────────────────
  // El conteo arrancaba en el MOUNT del árbol de tabs, o sea DETRÁS del
  // splash de post-login: con `Easing.out(cubic)` la mayor parte del
  // recorrido se consume en el primer tercio, así que para cuando la card
  // se veía el número ya estaba prácticamente en su valor final y el
  // usuario nunca lo veía trepar. Ahora espera DOS cosas: que el splash se
  // haya ido y que el saldo esté ASENTADO (`home_snapshot` no siembra la
  // suma de income-events del ciclo, así que el primer valor puede ser
  // provisorio y gastaría el reveal contra un número que todavía cambia).
  //
  // El techo es obligatorio: `balanceHydrating` incluye
  // `cycleIncomeQuery.isError` (use-home-metrics.ts:493), así que offline
  // puede quedar en `true` PARA SIEMPRE — sin techo el monto se congelaría
  // en "$0", una regresión peor que la que estamos arreglando. En un boot
  // sano no se alcanza nunca.
  const [countGateCeiling, setCountGateCeiling] = useState(false)
  useEffect(() => {
    const id = setTimeout(() => setCountGateCeiling(true), HERO_COUNT_GATE_CEILING_MS)
    return () => clearTimeout(id)
  }, [])
  const balanceCountReady =
    splashIsHidden && (!hero.balanceHydrating || countGateCeiling)
  // El promedio lineal del ciclo ya NO se calcula acá: era el numerador del
  // medidor y lo dejaba clavado. La proyección de cierre, que sí lo necesita,
  // lo deriva en `use-home-metrics` y llega por `hero.projectedClose`.

  // Estado vacío del hero: fijo sin sueldo configurado, o dinámico sin
  // ingresos del ciclo (gates anti-flash: cycleIncomeHydrating +
  // !cycleAdjusted — espejo de home-hero-card:80-86).
  // Vive ACÁ (antes del usdLine) porque la línea USD sigue al mismo saldo que
  // muestra el hero, y ese saldo depende de la variante.
  const dynamicSetup =
    isDynamicIncome &&
    !hero.hasCycleIncome &&
    !hero.cycleAdjusted &&
    !hero.cycleIncomeHydrating
  const heroVariant: HomeHeroVariant = selectHeroVariant({
    incomeConfigured: hero.incomeConfigured,
    isDynamicIncome,
    dynamicSetup,
    rawCycleBalance: hero.rawCycleBalance,
    balanceHydrating: hero.balanceHydrating,
    cycleAdjusted: hero.cycleAdjusted,
    cycleBalanceDiff: hero.cycleBalanceDiff,
  })
  // El saldo que el hero MUESTRA: crudo (negativo) solo en 'over'; clampeado
  // en el resto — incluida la hidratación, donde el crudo puede ser un
  // negativo transitorio que la variante ya decidió no mostrar.
  const heroDisplayBalance =
    heroVariant === 'over' ? hero.rawCycleBalance : hero.availableToday

  // USD susurro — gate literal (usd_rate_enabled + moneda ≠ USD + rate OK).
  const usdRateCurrency = dashboard.familyFinanceQuery.data?.local_currency ?? null
  const usdRateEnabled =
    (dashboard.familyFinanceQuery.data?.usd_rate_enabled ?? false) &&
    !!usdRateCurrency &&
    usdRateCurrency !== 'USD'
  const usdRateQuery = useUsdRate(
    usdRateEnabled && usdRateCurrency ? usdRateCurrency : undefined,
  )
  const usdLine = useMemo(() => {
    const rate = usdRateQuery.data
    if (!usdRateEnabled || !rate || !hero.incomeConfigured) return null
    if (!Number.isFinite(rate.ratePerUsd) || rate.ratePerUsd <= 0) return null
    // El MISMO saldo que muestra el hero: crudo con signo en 'over' (un
    // déficit en dólares debe contar la misma historia; `formatUsd` aplica
    // Math.abs), clampeado en el resto — sin esto la línea USD podía quedar
    // negativa sobre un hero verde durante la hidratación.
    return `≈ ${formatUsdWithSign(heroDisplayBalance / rate.ratePerUsd)}`
  }, [usdRateEnabled, usdRateQuery.data, heroDisplayBalance, hero.incomeConfigured])

  // Chip de ahorro (apagado en dinámico — gate explícito, literal).
  const savingsChip = useMemo(
    () =>
      isDynamicIncome
        ? null
        : computeSavingsHeroChip({
            savingsGoal: dashboard.savingsGoal,
            savingsRemaining: dashboard.savingsRemaining,
            savingsGoalPercent: dashboard.savingsGoalPercent,
            incomeConfigured: hero.incomeConfigured,
          }),
    [
      isDynamicIncome,
      dashboard.savingsGoal,
      dashboard.savingsRemaining,
      dashboard.savingsGoalPercent,
      hero.incomeConfigured,
    ],
  )

  // Selector "uno por vez" (F2) + chip de fijos aparte.
  const eventChipVM = useMemo(
    () =>
      selectHeroEventChip({
        acumulado: hero.acumulado,
        cycleAdjusted: hero.cycleAdjusted,
        cycleBalanceDiff: hero.cycleBalanceDiff,
        savingsChip,
        incomeMode: hero.incomeMode,
      }),
    [hero.acumulado, hero.cycleAdjusted, hero.cycleBalanceDiff, savingsChip, hero.incomeMode],
  )
  const fixedChipLabel = selectFixedChip(hero.fixedPendingReserved)
  // Chip gold "Reserva $X" acoplado del hero viejo (decisión owner): que la
  // reserva del ciclo no desaparezca visualmente. Informativo, junto a fijos.
  const reservaChipLabel = selectReservaChip(hero.monthlyReserveAmount)

  // Cupo diario (F2): pastilla "CUPO HOY" + bar GASTADO/DISPONIBLE; oculto si
  // cupo ≤ 0. spentRatio = fillRatio (clamp 0-1) de deriveGaugeState.
  // El medidor mide el DÍA, no el promedio del ciclo: `deriveGaugeState`
  // resuelve adentro la rama donde el cupo ya descontó el gasto, y devuelve
  // los tres números ya conciliados entre sí (apertura / gastado / queda).
  const gaugeVM = useMemo<HomeGaugeVM | null>(() => {
    const state = deriveGaugeState({
      spentToday: hero.spentToday,
      dailyBudget: hero.dailyBudget,
      cupoNetsSpend: hero.cupoNetsSpend,
      budgetDays: dashboard.effectiveCycleDays,
      discretionaryRaw: hero.discretionaryRaw,
    })
    if (!state) return null
    return {
      // El ticket muestra lo que TE QUEDA hoy (decisión owner 2026-08-08):
      // baja con cada gasto y sube si lo borrás. La barra al lado rotula
      // contra QUÉ se mide —"GASTADO $X DE $Y"— así ningún número se repite.
      cupoAmount: formatMoneyShort(state.remainingToday),
      spentLabel: formatMoneyShort(state.spentToday),
      availableLabel: formatMoneyShort(state.openingBudget),
      spentRatio: state.fillRatio,
      status: state.status,
    }
  }, [
    hero.spentToday,
    dashboard.effectiveCycleDays,
    hero.dailyBudget,
    hero.cupoNetsSpend,
  ])

  // Pill del día: warning de cobro pendiente (keys existentes) o "día N de M".
  const dayPill = hero.paydayPending
    ? hero.paydayDaysOverdue === 0
      ? t('home:hero.payToday')
      : t('home:hero.daysOverdue', { count: hero.paydayDaysOverdue })
    : t('home:hero.cycleDay', { day: hero.cycleDay, total: hero.cycleTotalDays })

  // Impresiones del hero (S3): chip de evento + link de proyección. En
  // preview no se emiten (isVisible false).
  useTrackElement({
    familyId,
    sessionId: telemetry.sessionId,
    elementId: 'hero_event_chip',
    slot: 'S3',
    isVisible: !preview && heroVariant !== 'empty' && eventChipVM != null,
  })
  const projectionTracker = useTrackElement({
    familyId,
    sessionId: telemetry.sessionId,
    elementId: 'hero_projection_link',
    slot: 'S3',
    // Espejo de la condición REAL de render del link: en 'over' se dibuja
    // siempre (fila Brot del cupo, que reemplaza al medidor y suele venir
    // con gaugeVM null); en el resto solo existe con medidor visible.
    isVisible:
      !preview && (heroVariant === 'over' || (heroVariant !== 'empty' && gaugeVM != null)),
  })
  const handlePressProjection = useCallback(() => {
    void triggerHaptic('selection')
    // Telemetría gateada por preview — invariante "cero telemetría desde el
    // preview" (review de convergencia): el único onTap que no pasaba por
    // trackTap. markTapped incluido por consistencia.
    if (!preview) {
      telemetry.markTapped()
      projectionTracker.onTap('/(app)/(tabs)/insights')
    }
    router.push('/(app)/(tabs)/insights')
  }, [preview, telemetry, projectionTracker, router])

  // ── Header: saludo + pose (F2) ─────────────────────────────────────
  // Hora local del render (no worklet). Bandas = getGreeting vía
  // deriveHomeMoment (decisión F2); el copy + emoji salen de HOME_MOMENTS
  // (mockup aprobado: minúscula + coma), NO del string de getGreeting.
  const hour = new Date().getHours()
  const moment = deriveHomeMoment(hour)
  const streakData = streakQuery.data
  const streakDerived = streakData ? deriveStreak(streakData) : null
  // Zero-state: deriveStreak reporta 'at_risk' para todo el que no
  // registró hoy, incluido el usuario nuevo sin racha (currentStreak 0).
  // El docstring de derive-brot-pose define 'none' para ese caso → cae a
  // la pose del momento en vez de worried/idle. Gate en racha activa
  // (espejo del guard n>0 de la streak card).
  const hasActiveStreak = (streakData?.currentStreak ?? 0) > 0
  const atRiskLevel: HomeBrotAtRiskLevel =
    hasActiveStreak && streakDerived?.status === 'at_risk'
      ? (streakDerived.atRiskIntensity ?? 'calm')
      : 'none'
  // Semana perfecta 7/7 de la tira VIVA (weekStrip todo 'logged',
  // orgánico — el escudo no fabrica floración). NO usamos weekClose: es el
  // cierre de la semana PASADA y quedaba pegado los 7 días siguientes,
  // pisando broken/at-risk en la card y en la pose (F2 §13 + review adv.).
  const isPerfectWeek = garden.data
    ? garden.data.weekStrip.every((d) => d.state === 'logged')
    : false
  const brotPose = deriveHomeBrotPose({
    hasLoggedToday: streakData?.hasLoggedToday ?? false,
    isPerfectWeek,
    isBroken: streakData?.isBroken ?? false,
    atRiskLevel,
    hour,
  })
  const greeting: HomeGreeting = {
    emoji: HOME_MOMENTS[moment].emoji,
    label: HOME_MOMENTS[moment].greeting,
    pose: brotPose,
  }
  // Usuario NUEVO (criterio F3 documentado): setup del hero pendiente y
  // sin gastos manuales → "¡bienvenido!", meta dashed, BR-E de actividad.
  const isNewUser = heroVariant === 'empty' && !hasManualExpense

  // ── Chips: miembros + sueldo ───────────────────────────────────────
  const membersChip: HomeMembersChipVM | null = useMemo(() => {
    if (activeMembers.length === 0) return null
    // Avatares REALES: SVG del pack (avatarSlug) o iniciales (fallback).
    // El ring pinta el color del chip para separar el overlap del stack.
    const ring = HOME_SPEC[mode].membersBackground
    return {
      avatars: activeMembers.slice(0, 2).map((m, index) =>
        m.avatarSlug ? (
          <AvatarAnimal
            key={m.id}
            slug={m.avatarSlug}
            size={26}
            ringColor={ring}
            backgroundTint={index === 0 ? HOME_SPEC[mode].memberAvatarA : HOME_SPEC[mode].memberAvatarB}
          />
        ) : (
          <Avatar key={m.id} name={m.name} color={m.color} size={26} ringColor={ring} />
        ),
      ),
      // Solitaria: el chip muestra al propio usuario, sin conteo (pedido
      // owner). Tappable en los dos casos desde 2026-08-17: lleva a "Mi
      // hogar", que en modo solo también tiene contenido propio (tu ingreso,
      // tu ciclo, crecer a hogar compartido).
      count: isSolo ? null : activeMembers.length,
    }
  }, [isSolo, activeMembers, mode])

  const confirmedToday = useMemo(() => {
    if (!lastConfirmedAt) return false
    const d = new Date(lastConfirmedAt)
    return (
      d.getFullYear() === today.getFullYear() &&
      d.getMonth() === today.getMonth() &&
      d.getDate() === today.getDate()
    )
  }, [lastConfirmedAt, today])

  // El ciclo todavía no arrancó con un saldo inicial confirmado.
  const needsStartingBalance =
    isOnboardingFlow && !onboardingSkippedViaExpense && dashboard.monthlyIncome > 0

  const paydayChip: HomePaydayChipVM | null = useMemo(() => {
    if (isDynamicIncome) return null
    if (!hero.incomeConfigured)
      return { kind: 'configure', label: t('home:paydayPill.configureSalary') }
    // Confirmar el saldo inicial MANDA sobre el countdown y sobre el resto de
    // los estados: hasta que el ciclo arranca con un saldo, "Sueldo en N días"
    // es ruido (pedido owner — este chip absorbió la banda de saldo inicial).
    if (needsStartingBalance)
      return {
        kind: 'confirmBalance',
        label: t('home:paydayPill.confirmStartingBalance'),
        a11yLabel: t('home:startingBalanceCta.accessibility'),
      }
    if (confirmedToday) return { kind: 'paidToday', label: t('home:paydayPill.gotPaidToday') }
    // Cobró pero falta confirmar (o el cobro es HOY) → "¿Ya cobraste?".
    // pending y confirmedToday son mutuamente excluyentes (va después de
    // paidToday, antes del daysUntil que dibujaría "Sueldo en 0 días").
    if (pending || days === 0) return { kind: 'pending', label: t('home:paydayPill.didYouGetPaid') }
    if (days == null) return null
    return { kind: 'daysUntil', days, label: t('home:paydayPill.payInDays', { count: days }) }
  }, [
    isDynamicIncome,
    hero.incomeConfigured,
    needsStartingBalance,
    confirmedToday,
    pending,
    days,
    t,
  ])
  // Interactivo solo cuando hay acción: configurar sueldo, o confirmar
  // cobro (pending / prompt pendiente / payday hoy) — semántica vieja.
  const paydayActionable =
    paydayChip?.kind === 'configure' ||
    pending ||
    days === 0 ||
    dashboard.isCycleStartingBalancePromptPending
  const handlePressPayday =
    paydayChip == null
      ? undefined
      : paydayChip.kind === 'configure'
        ? handlePressConfigureIncome
        : paydayChip.kind === 'confirmBalance'
          ? handleConfirmStartingBalance
          : paydayActionable && paydayChip.kind !== 'paidToday'
            ? handleChipConfirmTracked
            : undefined

  // ── Resumen del ciclo ──────────────────────────────────────────────
  const topCategory = useMemo(
    () =>
      computeTopCategory({
        expenses: expensesData,
        // Ventana UNIFICADA con variableTotal/variableCount
        // (monthlyAccounting — metrics-model §9). Antes usaba payCycle
        // (frozen) → en ciclos semanales/quincenales el share nombraba una
        // categoría/% de una ventana distinta al monto+conteo del lado.
        cycleStart: dashboard.monthlyAccounting.start,
        cycleEnd: dashboard.monthlyAccounting.end,
        categoryNameById,
        categoryRawNameById,
      }),
    [
      expensesData,
      dashboard.monthlyAccounting.start,
      dashboard.monthlyAccounting.end,
      categoryNameById,
      categoryRawNameById,
    ],
  )
  useTrackElement({
    familyId,
    sessionId: telemetry.sessionId,
    elementId: 'top_category_chip',
    slot: 'S5',
    isVisible: !preview && topCategory != null,
  })
  const nextFixed = useMemo(
    () =>
      computeNextFixed({
        fixedExpenses: fixedExpensesData,
        // Ciclo REAL (no frozen): obligaciones en tiempo real (RIESGO 1).
        cycleEnd: realCycle.end,
      }),
    [fixedExpensesData, realCycle.end],
  )
  useTrackElement({
    familyId,
    sessionId: telemetry.sessionId,
    elementId: 'next_fixed_chip',
    slot: 'S5',
    isVisible: !preview && nextFixed != null,
  })

  const monthSummary = homeMetrics.monthSummary
  const variablesVM: HomeCycleVariablesVM = useMemo(() => {
    const count = monthSummary.variableCount
    const movs = t('home:monthSummary.movements', { count })
    return {
      amount: formatMoneyShort(monthSummary.variableTotal),
      sub: topCategory
        ? `${movs} · ${topCategory.name} ${formatTopCategoryShare(topCategory.share)}`
        : count > 0
          ? movs
          : t('home:cycleSummary.noMovements'),
      muted: count === 0 && monthSummary.variableTotal === 0,
    }
  }, [monthSummary.variableCount, monthSummary.variableTotal, topCategory, t])

  const fijosVM: HomeCycleFijosVM = useMemo(() => {
    const amount = formatMoneyShort(monthSummary.fixedTotal)
    if (monthSummary.fixedCount === 0) {
      return {
        amount,
        sub: t('home:cycleSummary.addFirstFixed'),
        subAlert: null,
        tone: 'normal',
        muted: true,
      }
    }
    // Sin los pagos del ciclo, el reparto pagado/vencido es una AFIRMACIÓN
    // FALSA (todo lo que ya pasó su fecha se clasifica como vencido), no un
    // dato incompleto: en un arranque en frío la fila decía "0 de 16" y podía
    // anunciar vencidos inexistentes, y ~300 ms después se corregía sola. Hasta
    // que resuelvan, la fila muestra el monto y el próximo fijo —lo que SÍ
    // sabemos— y el ratio aparece cuando existe de verdad.
    if (!monthSummary.fixedPaymentsReady) {
      return {
        amount,
        sub: nextFixed
          ? `${nextFixed.name} ${formatDaysUntilDue(nextFixed.daysUntil).toLowerCase()}`
          : '',
        subAlert: null,
        tone: 'normal',
      }
    }
    const paidOf = `${monthSummary.fixedPaid}/${monthSummary.fixedCount}`
    if (monthSummary.fixedOverdue > 0) {
      const n = monthSummary.fixedOverdue
      return {
        amount,
        sub: `${paidOf} · `,
        subAlert: t('home:cycleSummary.overdue', { count: n }),
        tone: 'overdue',
      }
    }
    if (nextFixed) {
      const due = formatDaysUntilDue(nextFixed.daysUntil).toLowerCase()
      if (nextFixed.daysUntil <= 1) {
        return {
          amount,
          sub: `${paidOf} · `,
          subAlert: `${nextFixed.name} ${due}`,
          tone: 'normal',
        }
      }
      return {
        amount,
        sub: `${paidOf} · ${nextFixed.name} ${due}`,
        subAlert: null,
        tone: 'normal',
      }
    }
    return {
      amount,
      sub: `${paidOf} · ✓ ${t('home:monthSummary.allPaid')}`,
      subAlert: null,
      tone: 'normal',
    }
  }, [
    monthSummary.fixedTotal,
    monthSummary.fixedCount,
    monthSummary.fixedPaid,
    monthSummary.fixedOverdue,
    monthSummary.fixedPaymentsReady,
    nextFixed,
    t,
  ])

  // ── Meta (quick-add vía tap — default G15) ─────────────────────────
  const goalData = savingsGoalQuery.data
  const goalRemaining = goalData
    ? Math.max(0, goalData.goalAmount - goalData.currentAmount)
    : 0
  const goalVM: HomeGoalVM | null = useMemo(() => {
    if (!goalData) return null
    const target = goalData.goalAmount
    const current = goalData.currentAmount
    const ratio = target > 0 ? Math.min(1, current / target) : 0
    const pct = Math.round(ratio * 100)
    const amounts = t('home:goal.amountsOf', {
      current: formatMoneyShort(current),
      target: formatMoneyShort(target),
    })
    return {
      emoji: goalData.emoji,
      title: goalData.title,
      sub:
        goalRemaining > 0
          ? `${amounts} · ${t('home:goal.stillNeed', { amount: formatMoneyShort(goalRemaining) })}`
          : `${amounts} · ${t('home:metaCard.complete')}`,
      percent: `${pct}%`,
      fillRatio: ratio,
    }
  }, [goalData, goalRemaining, t])

  const addSavingsMutation = useAddSavingsContribution(familyId, sessionUserId)
  const handlePressGoal = useCallback(() => {
    // Meta COMPLETA (remaining ≤ 0): el quick-add caería al piso 100000
    // (sin advertir sobre-aporte) → navegamos al detalle, espejo del gate
    // de la MetaCard vieja (enableQuickAdd && !isComplete ocultaba aportar).
    if (goalRemaining <= 0) {
      trackTap('meta_quick_add', 'S6', '/(app)/savings-goal')
      void triggerHaptic('selection')
      router.push('/(app)/savings-goal')
      return
    }
    trackTap('meta_quick_add', 'S6')
    void triggerHaptic('selection')
    setGoalSheetOpen(true)
  }, [trackTap, goalRemaining, router])
  const handleGoalSheetSubmit = useCallback(
    (amount: number) => {
      if (!goalData) return
      addSavingsMutation.mutate(
        { goalId: goalData.id, amount },
        {
          onSuccess: () => {
            void triggerHaptic('success')
            setGoalSheetOpen(false)
          },
          onError: (err: unknown) => {
            void triggerHaptic('error')
            // El sheet de la meta sigue ABIERTO acá (el monto tipeado no se
            // pierde): el aviso NO puede ser hijo del sheet ni un modal
            // encima — sale por el toast del host global.
            toast.error(
              `${t('home:metaCard.addError')} · ${
                err instanceof Error ? err.message : t('home:metaCard.retrySoon')
              }`,
            )
          },
        },
      )
    },
    [addSavingsMutation, goalData, t],
  )
  const handleGoalSheetClose = useCallback(() => {
    if (addSavingsMutation.isPending) return
    setGoalSheetOpen(false)
  }, [addSavingsMutation.isPending])
  const handleCreateGoal = useCallback(() => {
    trackTap('meta_empty_card', 'S6', '/(app)/savings-goal')
    void triggerHaptic('selection')
    router.push('/(app)/savings-goal')
  }, [trackTap, router])

  // ── Racha (catálogo §8-9; título CON número — decisión owner) ──────
  const streakVM = useMemo(() => {
    const data = garden.data
    if (!data) return null
    const n = data.currentStreak
    const pips = data.weekStrip.map((d) => PIP_BY_WEEK_STATE[d.state])
    const broken = streakData?.isBroken ?? false
    const atRiskHot = atRiskLevel === 'urgent' || atRiskLevel === 'critical'
    // Precedencia del TÍTULO: broken > perfecta > at-risk > 0 > activa. La
    // precedencia cheer>sad del plan aplica a la POSE del Brot, no al
    // título de la card, y el catálogo §8 define 'Racha cortada' como
    // estado propio → broken primero (con isPerfectWeek ya derivado de la
    // tira viva, un roto no tiene 7/7 esta semana; el orden lo blinda igual).
    const linkGarden = t('home:streak.linkGarden')
    if (broken) {
      return { title: t('home:streak.broken'), subLine: null, pips, linkLabel: linkGarden, chevronMuted: false }
    }
    if (isPerfectWeek) {
      return { title: t('home:streak.perfectWeek'), subLine: null, pips, linkLabel: t('home:streak.linkView'), chevronMuted: false }
    }
    if (atRiskHot && n > 0) {
      return { title: t('home:streak.dontLose'), subLine: null, pips, linkLabel: linkGarden, chevronMuted: false }
    }
    if (n === 0) {
      // Día-cero (catálogo §8/§20): chevron del link 'Jardín' MUTED, texto
      // verde (review finding #20).
      return {
        title: t('home:streak.dayZero'),
        subLine: t('home:streak.dayZeroSub'),
        pips,
        linkLabel: linkGarden,
        chevronMuted: true,
      }
    }
    return {
      title: t('home:streak.count', { count: n }),
      subLine: null,
      pips,
      linkLabel: linkGarden,
      chevronMuted: false,
    }
  }, [garden.data, streakData?.isBroken, atRiskLevel, isPerfectWeek, t])
  const handlePressStreak = useCallback(() => {
    trackTap('streak_garden_link', 'S6', '/(app)/garden')
    void triggerHaptic('selection')
    router.push('/(app)/garden')
  }, [trackTap, router])

  // ── Actividad (merge + orden + cap 6, reglas literales del feed) ───
  const memberById = useMemo(() => {
    const map = new Map<string, (typeof familyMembers)[number]>()
    for (const m of familyMembers) map.set(m.id, m)
    return map
  }, [familyMembers])
  const movements = useMemo<MovementItem[]>(() => {
    const merged: MovementItem[] = [
      ...recentExpenses.map<MovementItem>((e) => ({
        kind: 'expense',
        iso: e.created_at,
        expense: e,
      })),
      ...cycleIncome.map<MovementItem>((i) => ({
        kind: 'income',
        iso: incomeChronologicalIso(i),
        income: i,
      })),
    ]
    merged.sort((a, b) => (a.iso < b.iso ? 1 : a.iso > b.iso ? -1 : 0))
    return merged.slice(0, ACTIVITY_LIMIT)
  }, [recentExpenses, cycleIncome])

  const activityItemVM = useCallback(
    (m: MovementItem): HomeActivityItem => {
      if (m.kind === 'income') {
        const income = m.income
        const meta = INCOME_KIND_BY_KEY[income.kind]
        const kindLabel = t(meta.labelKey)
        const who =
          memberById.get(income.created_by)?.name ?? t('home:activitySection.someone')
        return {
          // Ingresos = emoji (paridad con la Home vieja: sticker solo gastos).
          icon: meta.emoji,
          tileColor: tintTile(INCOME_TILE_COLOR, mode),
          title: income.description?.trim() || kindLabel,
          sub: `${who} · ${t('home:activitySection.incomeCategory', { kind: kindLabel })}`,
          amount: `+${formatMoney(Number(income.amount ?? 0))}`,
        }
      }
      const expense = m.expense
      const categoryName =
        categoryNameById.get(expense.category_id) ?? t('home:activitySection.noCategory')
      const rawName = categoryRawNameById.get(expense.category_id) ?? categoryName
      const who =
        memberById.get(expense.created_by)?.name ?? t('home:activitySection.someone')
      return {
        // Sticker REAL de categoría (nombre CRUDO; onLightSurface = el tile
        // ya es el pastel claro del hue, sin placa en dark).
        icon: <CategoryIcon name={rawName} scope="expense" size={24} onLightSurface />,
        tileColor: tintTile(
          categoryColorById.get(expense.category_id) ?? NO_CATEGORY_COLOR,
          mode,
        ),
        title: expense.description || categoryName,
        sub: `${who} · ${categoryName}`,
        amount: `−${formatMoney(Number(expense.price ?? 0))}`,
      }
    },
    [memberById, categoryNameById, categoryRawNameById, categoryColorById, mode, t],
  )

  const handleActivityEmptyCta = useCallback(() => {
    trackTap('activity_empty_cta', 'S7', '/(app)/add-expense')
    void triggerHaptic('selection')
    // Push directo al modal (misma razón que el fallback de la vieja:
    // saltear el redirect de (tabs)/add para no doble-navegar).
    router.push('/(app)/add-expense')
  }, [trackTap, router])

  const hasMovements = movements.length > 0
  const name = getGreetingName(displayName)

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <>
      {/* ⓿ Header — el highlight cubre la fila completa (el kit no
          expone ref de la fila de botones; deviation documentada).
          RiseView: entrada escalonada al montar (pedido owner 2026-07-21). */}
      <RiseView delay={0}>
      <NeoTourStep
        preview={preview}
        order={HOME_TOUR_STEPS.headerActions.order}
        text={HOME_TOUR_STEPS.headerActions.text}
        highlight={{ borderRadius: 24, padding: 8 }}
      >
        <HomeHeader
          mode={mode}
          greeting={greeting}
          name={name}
          welcome={isNewUser}
          welcomeLabel={t('home:header.welcome')}
          unreadCount={unreadNotificationsCount}
          assistantPendingCount={assistantPendingCount}
          settingsNudge={settingsNudge}
          onPressAssistant={handlePressAssistant}
          onPressBell={handlePressNotifications}
          onPressSettings={handlePressSettings}
        />
      </NeoTourStep>
      </RiseView>

      {/* Chips — paso familyStrip con las 4 ramas (modo, solo). */}
      <RiseView delay={60}>
      {(() => {
        const chipsNode = (
          <HomeChipsRow
            mode={mode}
            members={membersChip}
            payday={paydayChip}
            membersLabel={
              isSolo
                ? t('home:familyStrip.soloLabel')
                : t('home:familyStrip.membersLabel')
            }
            membersA11yLabel={t('home:familyStrip.openHouseholdA11y')}
            onPressMembers={handlePressMembers}
            onPressPayday={handlePressPayday}
          />
        )
        // Sin ningún chip la fila colapsa: el paso apuntaría a un target de
        // altura 0. Dinámico+solo queda afuera aunque el chip de miembros ya
        // se muestre: el copy disponible habla del grupo familiar o del
        // próximo cobro, y en esa combinación no aplica ninguno.
        if (!membersChip && !paydayChip) return chipsNode
        if (isDynamicIncome && isSolo) return chipsNode
        return (
          <NeoTourStep
            preview={preview}
            order={HOME_TOUR_STEPS.familyStrip.order}
            text={
              isDynamicIncome
                ? t('states:tour.home.familyStripDynamic')
                : isSolo
                  ? t('states:tour.home.familyStripSolo')
                  : HOME_TOUR_STEPS.familyStrip.text
            }
            highlight={{ borderRadius: 22, padding: 4 }}
          >
            {chipsNode}
          </NeoTourStep>
        )
      })()}
      </RiseView>

      {/* ① Hero */}
      <RiseView delay={100}>
      <NeoTourStep
        preview={preview}
        order={HOME_TOUR_STEPS.hero.order}
        text={
          isDynamicIncome
            ? t('states:tour.home.heroDynamic')
            : HOME_TOUR_STEPS.hero.text
        }
        highlight={{ borderRadius: 32, padding: 4 }}
      >
        <HomeHero
          mode={mode}
          variant={heroVariant}
          balanceLabel={t('home:hero.balanceLabel')}
          // En `over` el hero muestra el saldo CRUDO (negativo) con su signo;
          // en el resto de los estados el crudo y el clampeado coinciden.
          // `heroDisplayBalance` es la fuente única (la comparte la línea USD).
          balance={
            heroVariant === 'over'
              ? formatMoneyWithSign(heroDisplayBalance)
              : formatMoney(heroDisplayBalance)
          }
          // Conteo fluido del saldo (misma animación que la home vigente).
          balanceValue={heroDisplayBalance}
          formatBalance={heroVariant === 'over' ? formatMoneyWithSign : formatMoney}
          // Escala de la gradación de la tinta: UN CUPO DIARIO. Es la
          // unidad con la que el hogar ya piensa ("te queda menos de un día
          // de cupo") y la que ya manda el medidor.
          balanceScale={hero.dailyBudget}
          balanceCountReady={balanceCountReady}
          overSub={t('home:hero.overPlan')}
          overCupoHint={t('home:hero.overCupoHint')}
          usdLine={usdLine}
          dayPill={dayPill}
          eventChip={eventChipVM}
          reservaChip={reservaChipLabel}
          fixedChip={fixedChipLabel}
          gauge={gaugeVM}
          gaugeHeadingLabel={t('home:gauge.canSpendToday')}
          gaugeCupoLabel={t('home:gauge.leftToday')}
          gaugeSpentLabel={t('home:gauge.spent')}
          gaugeAvailableLabel={t('home:gauge.ofTarget')}
          projectionLabel={t('home:gauge.projectionLink')}
          projectionA11yLabel={t('home:gauge.projectionA11y')}
          emptyCopy={t('home:hero.emptyProjectionHint')}
          // Setup: fijo usa el sueldo mensual; dinámico, el primer ingreso.
          emptySub={
            heroVariant === 'empty'
              ? isDynamicIncome
                ? t('home:hero.dynamicSetupTitle')
                : t('home:hero.setupTitle')
              : undefined
          }
          emptyCtaLabel={
            heroVariant === 'empty'
              ? isDynamicIncome
                ? t('home:hero.addFirstIncome')
                : t('home:hero.configureNow')
              : undefined
          }
          onPressEmptyCta={
            isDynamicIncome ? handlePressAddIncome : handlePressConfigureIncome
          }
          onPressProjection={handlePressProjection}
        />
      </NeoTourStep>
      </RiseView>

      {/* ② Resumen del ciclo — variables+fixed comparten la card
          (TourTargets anidados: el kit no expone refs por fila).
          "Ver detalle" removido (pedido owner 2026-07-21): las 2 filas ya
          son tappables a su detalle (Gastos / Fijos). */}
      <RiseView delay={140}>
      <HomeSectionHeader mode={mode} label={t('home:sections.cycleSummary')} />
      {/* UN SOLO paso para las dos mitades. Antes eran dos TourTarget ANIDADOS
          sobre la MISMA card: los dos median el mismo rect, asi que tocar
          "Siguiente" no movia el resaltado ni un pixel y el tour se leia como
          colgado. El copy nuevo cuenta las dos mitades. */}
      <NeoTourStep
        preview={preview}
        order={HOME_TOUR_STEPS.cycleSummary.order}
        text={HOME_TOUR_STEPS.cycleSummary.text}
        highlight={{ borderRadius: 24, padding: 4 }}
      >
        <HomeCycleSummary
          mode={mode}
          variables={variablesVM}
          fijos={fijosVM}
          onPressVariables={handleViewGastos}
          onPressFijos={handleViewFijos}
        />
      </NeoTourStep>
      </RiseView>

      {/* ③ Meta — paso del tour solo con meta activa (como la vieja). */}
      <RiseView delay={170}>
      <HomeSectionHeader mode={mode} label={t('home:sections.progress')} />
      {goalVM ? (
        <NeoTourStep
          preview={preview}
          order={HOME_TOUR_STEPS.meta.order}
          text={HOME_TOUR_STEPS.meta.text}
          highlight={{ borderRadius: 22, padding: 4 }}
        >
          <HomeGoalCard mode={mode} goal={goalVM} onPress={handlePressGoal} />
        </NeoTourStep>
      ) : (
        <HomeGoalCard
          mode={mode}
          goal={null}
          emptyStyle={isNewUser ? 'dashed' : 'raise'}
          emptyTitle={t('home:goal.emptyTitle')}
          emptySub={isNewUser ? t('home:goal.emptyDashedSub') : t('home:goal.emptyRaiseSub')}
          emptyCtaLabel={isNewUser ? t('home:goal.createGoal') : t('home:goal.createShort')}
          onPressCreate={handleCreateGoal}
        />
      )}
      </RiseView>

      {/* ④ Racha — solo con datos del jardín (paso del tour igual). */}
      <RiseView delay={190}>
      {streakVM ? (
        <NeoTourStep
          preview={preview}
          order={HOME_TOUR_STEPS.streak.order}
          text={HOME_TOUR_STEPS.streak.text}
          highlight={{ borderRadius: 22, padding: 4 }}
        >
          <HomeStreakCard
            mode={mode}
            title={streakVM.title}
            subLine={streakVM.subLine}
            brotPose={brotPose}
            pips={streakVM.pips}
            linkLabel={streakVM.linkLabel}
            linkChevronMuted={streakVM.chevronMuted}
            onPress={handlePressStreak}
          />
        </NeoTourStep>
      ) : null}
      </RiseView>

      {/* ⑤ Actividad — onPressLink del kit (a11y, finding #16). */}
      <RiseView delay={220}>
      {hasMovements ? (
        <HomeSectionHeader
          mode={mode}
          label={t('home:dashboard.activity')}
          link={t('home:dashboard.viewAll')}
          linkSize={13}
          onPressLink={handleViewAllActivity}
        />
      ) : (
        <HomeSectionHeader mode={mode} label={t('home:dashboard.activity')} />
      )}
      <NeoTourStep
        preview={preview}
        order={HOME_TOUR_STEPS.activity.order}
        text={HOME_TOUR_STEPS.activity.text}
        highlight={{ borderRadius: 22, padding: 4 }}
      >
        {isLoadingActivity ? (
          <View style={styles.activitySkeleton}>
            <ListRowSkeleton rows={3} skin="neo" />
          </View>
        ) : activityErrorKind ? (
          <NeoStateBlock
            icon="error-outline"
            description={
              activityErrorKind === 'network'
                ? t('states:error.network')
                : t('states:error.server')
            }
            title={t('states:errorState.title')}
            actionLabel={t('states:errorState.action')}
            tone="error"
            onAction={handleActivityRetry}
          />
        ) : !hasMovements ? (
          <HomeActivityRows
            mode={mode}
            items={[]}
            empty={{ kind: isNewUser ? 'newUser' : 'today' }}
            emptyTitle={t('home:activity.emptyToday')}
            emptySubtitle={t('home:activity.emptySub')}
            emptyCtaLabel={t('home:activity.addExpense')}
            onPressEmptyCta={handleActivityEmptyCta}
          />
        ) : (
          // Rhythm del mockup: el contenedor pone marginTop 12 + gap
          // 10 y cada fila anula el marginTop interno del kit (-12),
          // así el SwipeRow envuelve la fila sin margen colado.
          <View style={styles.activityList}>
            {movements.map((m) => {
              const vm = activityItemVM(m)
              const isIncome = m.kind === 'income'
              const id = isIncome ? m.income.id : m.expense.id
              const dangerAction: SwipeAction = {
                label: t('home:activitySection.delete'),
                tone: 'danger',
                icon: 'delete',
                onPress: () =>
                  isIncome ? handleDeleteIncome(id) : handleDeleteExpense(id),
              }
              return (
                // Wrapper externo (SIN overflow) que lleva la sombra: el
                // SwipeRow tiene overflow:hidden y clipaba la sombra de la
                // fila (pedido owner 2026-07-21). radius 22 = el de la card,
                // así el clip del SwipeRow matchea las esquinas. El kit va
                // `flat` (sin sombra propia) porque la pone este wrapper.
                <View
                  key={`${m.kind}-${id}`}
                  style={[
                    styles.activityShadowWrap,
                    { backgroundColor: HOME_SPEC[mode].activityBackground, boxShadow: HOME_SPEC[mode].activityShadow },
                  ]}
                >
                  <SwipeRow
                    accessibilityHint={t('home:activitySection.swipeDeleteHint')}
                    rightActions={[dangerAction]}
                    borderRadius={22}
                    skin="neo"
                    isProcessing={
                      isIncome
                        ? pendingDeleteIncomeId === id
                        : pendingDeleteExpenseId === id
                    }
                  >
                    <View style={styles.activityRowUnmargin}>
                      <HomeActivityRows mode={mode} items={[vm]} flat />
                    </View>
                  </SwipeRow>
                </View>
              )
            })}
          </View>
        )}
      </NeoTourStep>
      </RiseView>

      {/* Sheets (lógica invisible F0 — sin restyle en esta fase). */}
      <HomeDashboardSheets
        isOpen={isCycleBalanceSheetOpen}
        isOnboardingFlow={isOnboardingFlow}
        monthlyIncome={dashboard.monthlyIncome}
        remainingDaysInCycle={remainingDaysInCycle}
        isSaving={isSavingSalary}
        errorMessage={salaryErrorMessage}
        onClose={handleCycleSheetClose}
        onSaveBalance={handleCycleSheetSave}
        onKeepDefault={handleCycleSheetKeepDefault}
      />
      {pendingDecision ? (
        <MonthCloseDecisionSheet
          visible={decisionSheetOpen}
          pending={pendingDecision}
          activeGoal={activeGoalForSheet}
          nextCycleAnchor={formatLocalDateKey(dashboard.monthlyAccounting.start)}
          onApply={handleApplyDecision}
          onSkip={handleSkipDecision}
          onClose={handleDecisionSheetClose}
          isApplying={applyDecision.isPending}
        />
      ) : null}
      {goalData ? (
        <QuickAddSavingsSheet
          visible={goalSheetOpen}
          goalTitle={goalData.title}
          remaining={goalRemaining}
          isSaving={addSavingsMutation.isPending}
          initialAmount={cycleVault > 0 ? cycleVault : undefined}
          onClose={handleGoalSheetClose}
          onSubmit={handleGoalSheetSubmit}
        />
      ) : null}
    </>
  )
}

const styles = StyleSheet.create({
  screenContent: {
    // Mismo offset top que la Home vigente (safe area + 14pt).
    paddingTop: 14,
  },
  activitySkeleton: { marginTop: 12, gap: 6 },
  activityList: { marginTop: 12, gap: 10 },
  // Wrapper de sombra por fila (radius = card): la sombra vive acá (sin
  // overflow) para que el SwipeRow no la clipe.
  activityShadowWrap: { borderRadius: 22 },
  // Anula el marginTop:12 del activityList interno del kit (fila única
  // dentro del SwipeRow) — el rhythm lo pone el contenedor de arriba.
  activityRowUnmargin: { marginTop: -12 },
})
