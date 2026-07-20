import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, StyleSheet, View } from 'react-native'
import Animated, { FadeInLeft, FadeInRight } from 'react-native-reanimated'
import { StatusBar } from 'expo-status-bar'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { isAvatarSlug, type AvatarSlug } from '@/assets/avatars'
import { Onb5aNombre } from '@/components/redesign/onboarding/onb-5a-nombre'
import { Onb5bAvatar } from '@/components/redesign/onboarding/onb-5b-avatar'
import { Onb5cHogar, type OnbHogar, type OnbHogarPanel } from '@/components/redesign/onboarding/onb-5c-hogar'
import { Onb5dIngresos, type Onb5dIngresosState } from '@/components/redesign/onboarding/onb-5d-ingresos'
import { Onb5eAhorro } from '@/components/redesign/onboarding/onb-5e-ahorro'
import { Onb5e2Meta, type OnbMetaValue } from '@/components/redesign/onboarding/onb-5e2-meta'
import { Onb5gAporte } from '@/components/redesign/onboarding/onb-5g-aporte'
import { Onb5hConfirmar, type Onb5hMember } from '@/components/redesign/onboarding/onb-5h-confirmar'
import { monthlyFromIncome } from '@/components/redesign/onboarding/onb-flow-state'
import { ONB_SPEC } from '@/components/redesign/onboarding/onb-spec'
import { useCompleteOnboarding } from '@/features/onboarding/use-complete-onboarding'
import { useOnboardingState } from '@/features/onboarding/use-onboarding-state'
import {
  buildFamilyFinanceInput,
  useFamilyFinance,
  useUpsertFamilyFinance,
} from '@/features/finance/use-family-finance'
import {
  useBootstrapFamily,
  useConsumeFamilyInvite,
  usePeekFamilyInvite,
  useSetFamilyKind,
} from '@/features/family/use-family-actions'
import { useUpsertSavingsGoal } from '@/features/savings-goals/use-upsert-savings-goal'
import {
  profileQueryKey,
  useMyProfile,
  useUpdateAvatarAnimal,
  useUpdateDisplayName,
} from '@/features/profile/use-profile'
import { logoutSession } from '@/features/auth/logout'
import { authQueryKeys } from '@/features/auth/use-auth-session'
import { supabase } from '@/lib/supabase'
import type { Session } from '@supabase/supabase-js'
import { motionDurations } from '@/lib/motion/tokens'
import { triggerHaptic } from '@/lib/haptics'
import { getErrorMessage } from '@/utils/error-message'
import type { FinanceCycleConfig } from '@/utils/finance-cycle-config'
import { parsePrice } from '@/utils/money'
import { formatLocalDateKey } from '@/utils/pay-cycle'
import { sanitizeDisplayName } from '@/utils/sanitize-name'
import { useThemeMode } from '@/theme/theme-provider'

/**
 * Onboarding LIVE del rediseño (Turno 5 · cableado 2026-07-17).
 *
 * Presenta las réplicas aprobadas del flujo (5a…5h) sobre la MISMA
 * orquestación que el wizard anterior (onboarding-screen.tsx, que queda
 * intacto como referencia): mismo reducer (useOnboardingState), mismas
 * mutations por paso y misma semántica de handlePrimary/handleFinish.
 * La navegación post-finish NO es imperativa: la maneja el Redirect del
 * gate de la ruta (onboarding_completed_at flipea en cache → success).
 *
 * MAPEO pasos rediseño ↔ reducer real:
 *   · 5a Tu nombre    → step 1 (displayName; save en background al avanzar)
 *   · 5b Tu avatar    → step 2 (avatarSlug; save en background al avanzar)
 *   · 5c Tu hogar     → step 3 (paneles internos de 5c ↔ sub-flujo de
 *       step-family: solo → bootstrap+kind 'solo' · crear → bootstrap ·
 *       unirse → peek del invite; las transiciones a los paneles de
 *       cierre se gatean con las mutations vía onConfirm*)
 *   · 5d Tus ingresos → step 4 creador (tipo↔incomeMode, ciclo+día↔
 *       cycleConfig, monto POR PERÍODO → mensual vía monthlyFromIncome)
 *   · 5g Tu aporte    → step 4 joiner (contributesIncome + contribución;
 *       se salta hacia hogar dynamic — skipsContributionStep del reducer)
 *   · 5e Tu ahorro    → step 5 creador (savingsGoalPercent; "Terminar y
 *       empezar" = handleFinish sin meta)
 *   · 5e2 Meta        → sub-paso de step 5 creador (createFirstGoal +
 *       firstGoal*; ambas salidas = handleFinish)
 *   · 5h La familia   → step 5 joiner ("Confirmar y unirme" = consume
 *       del invite + completeOnboarding)
 *   · 5f/5i (resumen) → NO viven acá: son la pantalla de éxito
 *       post-finish (neo-onboarding-success-screen.tsx, ruta
 *       /(app)/onboarding-success vía el Redirect del gate).
 *
 * NO espejado (documentado en el informe): variantes de copy
 * rejoin/closedByOwner (el rediseño no tiene estado aprobado para eso;
 * previously_onboarded se conserva solo para priorizar el nombre) y la
 * hidratación del ciclo desde family_finance existente (el revelado
 * secuencial de 5d arranca vacío por decisión owner 2026-07-15).
 */

interface NeoOnboardingScreenProps {
  userId: string
}

/**
 * Mejor display name desde un blob `user_metadata` de Supabase (misma
 * función que el orquestador anterior — Google full_name/name, Apple
 * display_name parcheado en social-sign-in, fallback compuesto).
 */
function readOAuthName(meta: Record<string, unknown> | undefined): string {
  if (!meta) return ''
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const direct = str(meta.display_name) || str(meta.full_name) || str(meta.name)
  if (direct) return direct
  return [str(meta.given_name), str(meta.family_name)].filter(Boolean).join(' ')
}

// ─── Ciclo: picks del 5d → FinanceCycleConfig real ───────────────────
//
// El 5d pide día-del-mes (mensual/quincenal/custom) o día-de-semana
// (semanal); el modelo rolling ancla en una FECHA (cycle_anchor_date).
// Para quincenal/custom anclamos en la ocurrencia del día en el MES
// ACTUAL (no en el mes siguiente). getCurrentPayCycle es rolling y
// soporta anchor pasado O futuro. La caption "próximo cobro" del 5d
// (onb-5d-ingresos.proximoCobro) replica EXACTO ese mismo modelo rolling
// (fin del período que contiene hoy), así que la promesa del onboarding y
// el ciclo que se guarda coinciden siempre. Anclar en el mes siguiente
// corría los ciclos hasta ~13 días, porque los 30/31 días del mes no son
// múltiplo de 14/N (review r2/r3).

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

/** Ocurrencia del día `day` en el MES ACTUAL (clampeada) → ISO local. */
function currentMonthDayAnchor(day: number, today: Date = new Date()): string {
  const safeDay = Math.min(Math.max(1, Math.round(day)), 31)
  const y = today.getFullYear()
  const m = today.getMonth()
  // Mediodía local: el paso de días sobrevive cambios de DST.
  const anchor = new Date(y, m, Math.min(safeDay, daysInMonth(y, m)), 12)
  return formatLocalDateKey(anchor)
}

/** Próxima ocurrencia (hoy inclusive) del día de semana 0=L…6=D → ISO local. */
function nextWeekdayAnchor(diaSemana: number, today: Date = new Date()): string {
  // 0=L…6=D del rediseño → getDay() JS (0=domingo).
  const jsTarget = (diaSemana + 1) % 7
  const delta = (jsTarget - today.getDay() + 7) % 7
  const anchor = new Date(today.getFullYear(), today.getMonth(), today.getDate() + delta, 12)
  return formatLocalDateKey(anchor)
}

/** Config de ciclo real derivado del estado del 5d (defaults defensivos). */
function cycleConfigFromIncome(income: Onb5dIngresosState): FinanceCycleConfig {
  switch (income.cicloTipo) {
    case 'quincenal':
      return {
        cycle_type: 'biweekly',
        cycle_anchor_date: currentMonthDayAnchor(income.diaCobro ?? 1),
        cycle_length_days: 14,
      }
    case 'semanal':
      return {
        cycle_type: 'weekly',
        cycle_anchor_date: nextWeekdayAnchor(income.diaSemana ?? 0),
        cycle_length_days: 7,
      }
    case 'custom':
      return {
        cycle_type: 'custom',
        cycle_anchor_date: currentMonthDayAnchor(income.diaCobro ?? 1),
        cycle_length_days: Math.min(Math.max(1, Math.round(income.cicloN)), 90),
      }
    default:
      return { cycle_type: 'monthly', salary_payment_day: income.diaCobro ?? 1 }
  }
}

/** 5d arranca VACÍO (revelado secuencial — decisión owner 2026-07-15). */
const EMPTY_INCOME: Onb5dIngresosState = {
  tipo: null,
  cicloTipo: null,
  cicloN: 10,
  monto: 0,
  diaCobro: null,
  diaSemana: null,
}

// Clave de pantalla renderizada + orden monotónico → dirección de la
// transición (adelante: desde la derecha; atrás: desde la izquierda),
// mismo criterio que el flow screen dev.
type StepKey =
  | 'nombre'
  | 'avatar'
  | 'hogar'
  | 'ingresos'
  | 'aporte'
  | 'ahorro'
  | 'meta'
  | 'confirmar'

const STEP_ORDINAL: Record<StepKey, number> = {
  nombre: 0,
  avatar: 1,
  hogar: 2,
  ingresos: 3,
  aporte: 3,
  ahorro: 4,
  confirmar: 4,
  meta: 5,
}

export function NeoOnboardingScreen({ userId }: NeoOnboardingScreenProps) {
  const router = useRouter()
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const mode = useThemeMode().resolvedMode
  const queryClient = useQueryClient()
  const profileQuery = useMyProfile(userId)

  // El home_snapshot RPC siembra el cache del profile con menos columnas
  // (falta previously_onboarded). Invalidar al montar para que isRejoin
  // resuelva bien en el primer paint (igual que el wizard anterior).
  useEffect(() => {
    if (!userId) return
    queryClient.invalidateQueries({ queryKey: profileQueryKey(userId) })
  }, [userId, queryClient])

  const seedAvatar: AvatarSlug | undefined =
    profileQuery.data?.avatar_animal && isAvatarSlug(profileQuery.data.avatar_animal)
      ? profileQuery.data.avatar_animal
      : undefined

  const { state, actions } = useOnboardingState({
    ...(seedAvatar ? { avatarSlug: seedAvatar } : null),
    // Default del rediseño (5e: chip 10% con badge SUGERIDO) — el
    // reducer traía 20 del wizard anterior.
    savingsGoalPercent: 10,
  })

  // Nombre del provider (Google/Apple) desde la sesión cacheada — misma
  // query key que la root (no duplica listener).
  const { data: session } = useQuery<Session | null>({
    queryKey: authQueryKeys.session,
    queryFn: async () => (await supabase.auth.getSession()).data.session,
    staleTime: Infinity,
    gcTime: Infinity,
  })
  const oauthName = readOAuthName(
    session?.user?.user_metadata as Record<string, unknown> | undefined,
  )

  // Hidratar displayName una vez (cuenta nueva → nombre del provider;
  // re-ingreso previously_onboarded → el guardado en el profile).
  const [hydratedName, setHydratedName] = useState(false)
  useEffect(() => {
    if (hydratedName) return
    const profileName = profileQuery.data?.display_name ?? ''
    const isRejoinName = profileQuery.data?.previously_onboarded === true
    const best = isRejoinName ? profileName || oauthName : oauthName || profileName
    if (best) {
      actions.setDisplayName(sanitizeDisplayName(best))
      setHydratedName(true)
    }
  }, [
    profileQuery.data?.display_name,
    profileQuery.data?.previously_onboarded,
    oauthName,
    hydratedName,
    actions,
  ])

  const familyQuery = useFamilyFinance(state.familyId ?? undefined)
  const existingFinance = familyQuery.data

  // Mutations (mismo set que el wizard anterior + las del sub-flujo de
  // hogar que antes vivían dentro de StepFamily).
  const updateDisplayName = useUpdateDisplayName(userId, state.familyId ?? undefined)
  const updateAvatar = useUpdateAvatarAnimal(userId, state.familyId ?? undefined)
  const bootstrap = useBootstrapFamily(userId)
  const setKind = useSetFamilyKind(userId)
  const peek = usePeekFamilyInvite()
  const upsertFinance = useUpsertFamilyFinance(state.familyId ?? undefined, userId)
  const upsertSavingsGoal = useUpsertSavingsGoal(state.familyId ?? '', userId)
  const consumeInvite = useConsumeFamilyInvite(userId)
  const completeOnboarding = useCompleteOnboarding(userId)

  // ── Estado local (equivalente al cycleConfig local del anterior) ────
  // Ingresos con la forma del 5d; el monto es POR PERÍODO. En cada
  // cambio se espeja al draft (incomeMode + monthlyIncomeRaw MENSUAL
  // vía monthlyFromIncome + salaryDay) para que el finish transcrito
  // lea las mismas variables que el orquestador anterior.
  const [income, setIncome] = useState<Onb5dIngresosState>(EMPTY_INCOME)
  // Sub-paso del step 5 creador: 5e (ahorro) ↔ 5e2 (meta).
  const [goalPanel, setGoalPanel] = useState<'ahorro' | 'meta'>('ahorro')
  const [meta, setMeta] = useState<OnbMetaValue | null>(null)
  // Toggle del panel 'mode' de 5c (el mockup arranca en "Yo solo").
  const [hogarChoice, setHogarChoice] = useState<OnbHogar>('solo')
  // Errores user-facing en el vocabulario del rediseño.
  const [hogarError, setHogarError] = useState<string | null>(null)
  const [hogarSubmitting, setHogarSubmitting] = useState(false)
  const [finishError, setFinishError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const step = state.step
  const isJoiner = state.familyMode === 'joined'
  const trimmedName = state.displayName.trim()
  const monthlyIncome = (() => {
    const parsed = parsePrice(state.monthlyIncomeRaw)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
  })()
  const cycleConfig = useMemo(() => cycleConfigFromIncome(income), [income])

  // Volver al step 5 creador siempre re-entra por 5e (la meta se reabre
  // con "Agregar una meta").
  useEffect(() => {
    if (step !== 5 && goalPanel !== 'ahorro') setGoalPanel('ahorro')
  }, [step, goalPanel])

  // ── 5d: cambio de ingresos + espejo al draft ────────────────────────
  const handleIncomeChange = useCallback(
    (patch: Partial<Onb5dIngresosState>) => {
      const next = { ...income, ...patch }
      setIncome(next)
      if (patch.tipo !== undefined) {
        actions.setIncomeMode(next.tipo === 'variable' ? 'dynamic' : 'fixed')
      }
      // setIncomeMode('dynamic') limpia el raw — el espejo va después.
      actions.setMonthlyIncome(String(monthlyFromIncome(next)))
      if (next.cicloTipo === 'mensual' && next.diaCobro != null) {
        actions.setSalaryDay(next.diaCobro)
      }
    },
    [income, actions],
  )

  // ── 5c: gates async (bootstrap / kind / peek — antes en StepFamily) ─
  const confirmSolo = useCallback(async (): Promise<boolean> => {
    setHogarError(null)
    setHogarSubmitting(true)
    try {
      const result = await bootstrap.mutateAsync()
      await setKind.mutateAsync('solo')
      actions.setAccountKind('solo')
      actions.setFamily('created', result.family_id)
      return true
    } catch (error) {
      void triggerHaptic('error')
      setHogarError(getErrorMessage(error, t('states:error.server')))
      return false
    } finally {
      setHogarSubmitting(false)
    }
  }, [bootstrap, setKind, actions, t])

  const confirmCreate = useCallback(async (): Promise<boolean> => {
    setHogarError(null)
    setHogarSubmitting(true)
    try {
      const result = await bootstrap.mutateAsync()
      // La UI del rediseño permite volver a elegir: si antes confirmó
      // "solo", el kind del server quedó 'solo' — corregirlo a 'shared'.
      if (state.accountKind === 'solo') {
        await setKind.mutateAsync('shared')
      }
      actions.setAccountKind('shared')
      actions.setFamily('created', result.family_id)
      return true
    } catch (error) {
      void triggerHaptic('error')
      setHogarError(getErrorMessage(error, t('states:error.server')))
      return false
    } finally {
      setHogarSubmitting(false)
    }
  }, [bootstrap, setKind, actions, state.accountKind, t])

  const confirmJoin = useCallback(
    async (code: string): Promise<boolean> => {
      setHogarError(null)
      // Gate `alreadyDone` del wizard anterior (review r2): la UI del
      // rediseño deja volver desde los paneles de cierre y re-elegir
      // "Unirme" DESPUÉS de haber creado un hogar (bootstrap_family ya
      // insertó la membresía owner). Si se dejara pasar, consume_family_invite
      // haría NOOP SILENCIOSO (ya hay membresía no-blocked → devuelve la
      // family_id existente sin unir al hogar del invite ni registrar el
      // aporte) y el usuario terminaría el onboarding creyendo que se unió.
      if (state.familyMode === 'created' && state.familyId) {
        void triggerHaptic('error')
        setHogarError(t('onboarding:family.alreadyCreatedCantJoin'))
        return false
      }
      setHogarSubmitting(true)
      try {
        // Peek SIN insertar la membresía — el join real (consume) pasa
        // en 5h al confirmar (mismo diseño que el wizard anterior).
        const result = await peek.mutateAsync(code)
        actions.setPendingFamily(result)
        return true
      } catch (error) {
        void triggerHaptic('error')
        setHogarError(getErrorMessage(error, t('states:error.server')))
        return false
      } finally {
        setHogarSubmitting(false)
      }
    },
    [peek, actions, state.familyMode, state.familyId, t],
  )

  // Volver al paso 3 con el hogar ya resuelto: sembrar el panel de
  // cierre correspondiente (equivalente del confirm card `alreadyDone`).
  const hogarInitialPanel: OnbHogarPanel =
    state.familyMode === 'joined' && state.pendingFamily
      ? 'joined'
      : state.familyMode === 'created' && state.familyId
        ? state.accountKind === 'solo'
          ? 'soloReady'
          : 'created'
        : 'mode'

  // ── Back / logout (transcrito del wizard anterior) ──────────────────
  const handleLogout = useCallback(() => {
    void logoutSession({
      onError: (error) => {
        void triggerHaptic('error')
        Alert.alert(
          t('onboarding:errors.logoutTitle'),
          getErrorMessage(error, t('states:error.server')),
        )
      },
      onSuccess: () => {
        router.replace('/(auth)/welcome')
      },
    })
  }, [router, t])

  const handleBackFromFirst = useCallback(() => {
    // En el paso 1 el back es "salir del flujo": quedarse o cerrar sesión.
    Alert.alert(t('onboarding:exitDialog.title'), t('onboarding:exitDialog.message'), [
      { text: t('onboarding:exitDialog.stay'), style: 'cancel' },
      {
        text: t('onboarding:exitDialog.logout'),
        style: 'destructive',
        onPress: handleLogout,
      },
    ])
  }, [handleLogout, t])

  // ── Avance por paso (semántica handlePrimary del wizard anterior:
  // avance optimista, save en background con Alert en el error) ───────
  const handleNameNext = useCallback(() => {
    if (trimmedName.length < 2) return
    void triggerHaptic('selection')
    actions.next()
    updateDisplayName.mutate(trimmedName, {
      onError: (error: unknown) => {
        void triggerHaptic('error')
        Alert.alert(
          t('onboarding:errors.saveNameTitle'),
          getErrorMessage(error, t('states:error.server')),
        )
      },
    })
  }, [trimmedName, actions, updateDisplayName, t])

  const handleAvatarNext = useCallback(() => {
    void triggerHaptic('selection')
    actions.next()
    updateAvatar.mutate(state.avatarSlug, {
      onError: (error: unknown) => {
        void triggerHaptic('error')
        Alert.alert(
          t('onboarding:errors.saveAvatarTitle'),
          getErrorMessage(error, t('states:error.server')),
        )
      },
    })
  }, [actions, updateAvatar, state.avatarSlug, t])

  // "Seguir" desde los cierres de 5c. El reducer maneja el desvío del
  // joiner (skipsContributionStep: hogar dynamic salta el paso 4).
  const handleHogarNext = useCallback(() => {
    void triggerHaptic('selection')
    actions.next()
  }, [actions])

  const handleStepNext = useCallback(() => {
    void triggerHaptic('selection')
    actions.next()
  }, [actions])

  // ── Finish (transcripción de handleFinish del wizard anterior; el
  // goal llega explícito para no leer estado recién seteado) ──────────
  const handleFinish = useCallback(
    async (goal: OnbMetaValue | null) => {
      if (submitting) return
      if (!state.familyId) {
        setFinishError(t('onboarding:errors.missingFamilyMessage'))
        return
      }
      setFinishError(null)
      setSubmitting(true)
      try {
        // Joiner: consume del invite (inserta la membresía + registra la
        // contribución + marca el código usado) y complete. Finance /
        // savings_goal NO se tocan — ya existen en el hogar.
        if (state.familyMode === 'joined' && state.pendingFamily) {
          // Hogar destino DINÁMICO: el paso de contribución se saltó — 0
          // explícito (el server igual fuerza monthly_income = 0).
          const contribution =
            state.pendingFamily.income_mode !== 'dynamic' &&
            state.contributesIncome === true
              ? monthlyIncome
              : 0
          await consumeInvite.mutateAsync({
            code: state.pendingFamily.family_code,
            monthlyIncomeContribution: contribution,
          })
          await completeOnboarding.mutateAsync()
          void triggerHaptic('success')
          // Navegación: la maneja el Redirect del gate de la ruta (el
          // setQueryData síncrono de completeOnboarding flipea el cache
          // antes de que este await resuelva). Sin replace imperativo.
          return
        }

        // Creador. Ingreso DINÁMICO: sin sueldo fijo — presupuesto por
        // income_events, contribución del dueño 0.
        const isDynamicIncome = state.incomeMode === 'dynamic'
        const baseSnapshot = {
          dailyBudgetBufferMode: existingFinance?.daily_budget_buffer_mode ?? 'none',
          dailyBudgetBufferValue: existingFinance?.daily_budget_buffer_value ?? 0,
          dailyBudgetCheckinHour: existingFinance?.daily_budget_checkin_hour ?? 9,
          dailyBudgetNudgesEnabled: existingFinance?.daily_budget_nudges_enabled ?? true,
          monthlyIncome: isDynamicIncome ? 0 : monthlyIncome,
          savingsGoal: 0, // derivado por el modelo de percent × income.
          savingsGoalPercent: isDynamicIncome ? 0 : state.savingsGoalPercent,
          usdExchangeRate: existingFinance?.usd_exchange_rate ?? 1000,
          incomeMode: state.incomeMode,
          salaryPaymentDay:
            cycleConfig.cycle_type === 'monthly' ? cycleConfig.salary_payment_day : 1,
          // Stamp de confirmación de sueldo al terminar: sin esto el
          // freeze del pay-cycle empuja la cuenta nueva a un ciclo del
          // pasado (ver nota del wizard anterior).
          lastSalaryConfirmedAt:
            existingFinance?.last_salary_confirmed_at ?? new Date().toISOString(),
          currentCycleStartingBalance:
            existingFinance?.current_cycle_starting_balance ?? null,
          currentCycleAnchor: existingFinance?.current_cycle_anchor ?? null,
          cycleType: cycleConfig.cycle_type,
          cycleAnchorDate:
            cycleConfig.cycle_type === 'monthly' ? null : cycleConfig.cycle_anchor_date,
          cycleLengthDays:
            cycleConfig.cycle_type === 'monthly' ? null : cycleConfig.cycle_length_days,
        } as const
        await upsertFinance.mutateAsync(buildFamilyFinanceInput(baseSnapshot))

        // El ingreso del dueño vive como su monthly_income_contribution
        // (el total del hogar es DERIVADO por el trigger recompute).
        const { error: ownerIncomeError } = await supabase.rpc(
          'update_my_income_contribution',
          { p_amount: isDynamicIncome ? 0 : monthlyIncome },
        )
        // supabase.rpc NO tira: sin chequear, un fallo dejaría al dueño
        // con contribución 0 (ingreso del hogar 0).
        if (ownerIncomeError) throw ownerIncomeError

        if (goal) {
          await upsertSavingsGoal.mutateAsync({
            existingId: null,
            input: {
              title: goal.title.trim(),
              emoji: goal.icon,
              goalAmount: goal.monto,
              currentAmount: 0,
              targetMonths: goal.meses,
              isActive: true,
            },
          })
        }

        await completeOnboarding.mutateAsync()
        void triggerHaptic('success')
        // Navegación: Redirect del gate (ver nota en el branch joiner).
      } catch (error) {
        void triggerHaptic('error')
        setFinishError(getErrorMessage(error, t('states:error.server')))
      } finally {
        setSubmitting(false)
      }
    },
    [
      submitting,
      state.familyId,
      state.familyMode,
      state.pendingFamily,
      state.contributesIncome,
      state.savingsGoalPercent,
      state.incomeMode,
      cycleConfig,
      monthlyIncome,
      existingFinance,
      upsertFinance,
      upsertSavingsGoal,
      consumeInvite,
      completeOnboarding,
      t,
    ],
  )

  // ── Render por paso ─────────────────────────────────────────────────
  const stepKey: StepKey = (() => {
    switch (step) {
      case 1:
        return 'nombre'
      case 2:
        return 'avatar'
      case 3:
        return 'hogar'
      case 4:
        return isJoiner ? 'aporte' : 'ingresos'
      default:
        return isJoiner ? 'confirmar' : goalPanel === 'meta' ? 'meta' : 'ahorro'
    }
  })()
  const prevStepKeyRef = useRef(stepKey)
  const navDir: 'fwd' | 'back' =
    STEP_ORDINAL[stepKey] >= STEP_ORDINAL[prevStepKeyRef.current] ? 'fwd' : 'back'
  useEffect(() => {
    prevStepKeyRef.current = stepKey
  })

  const screen = (() => {
    switch (stepKey) {
      case 'nombre':
        return (
          <Onb5aNombre
            mode={mode}
            name={state.displayName}
            onChangeName={(name) => actions.setDisplayName(sanitizeDisplayName(name))}
            onBack={handleBackFromFirst}
            onNext={handleNameNext}
          />
        )
      case 'avatar':
        return (
          <Onb5bAvatar
            mode={mode}
            avatar={state.avatarSlug}
            onSelectAvatar={actions.setAvatar}
            onBack={actions.back}
            onNext={handleAvatarNext}
          />
        )
      case 'hogar':
        return (
          <Onb5cHogar
            mode={mode}
            hogar={hogarChoice}
            onChangeHogar={setHogarChoice}
            initialPanel={hogarInitialPanel}
            onConfirmSolo={confirmSolo}
            onConfirmCreate={confirmCreate}
            onConfirmJoin={confirmJoin}
            submitting={hogarSubmitting}
            serverError={hogarError}
            onBack={actions.back}
            onNext={handleHogarNext}
            onJoin={handleHogarNext}
          />
        )
      case 'ingresos':
        return (
          <Onb5dIngresos
            mode={mode}
            state={income}
            onChange={handleIncomeChange}
            onBack={actions.back}
            onNext={handleStepNext}
          />
        )
      case 'aporte':
        return (
          <Onb5gAporte
            mode={mode}
            contributesIncome={state.contributesIncome}
            contribution={monthlyIncome}
            onChange={(patch) => {
              if (patch.contributesIncome !== undefined) {
                actions.setContributesIncome(patch.contributesIncome)
              }
              if (patch.contribution !== undefined) {
                actions.setMonthlyIncome(String(patch.contribution))
              }
            }}
            onBack={actions.back}
            onNext={handleStepNext}
          />
        )
      case 'ahorro':
        return (
          <Onb5eAhorro
            mode={mode}
            percent={state.savingsGoalPercent}
            monthlyIncome={state.incomeMode === 'dynamic' ? 0 : monthlyIncome}
            onSelectPercent={actions.setSavingsPercent}
            onAddGoal={() => {
              actions.setCreateFirstGoal(true)
              setGoalPanel('meta')
            }}
            onBack={actions.back}
            onNext={() => {
              actions.setCreateFirstGoal(false)
              void handleFinish(null)
            }}
            submitting={submitting}
            serverError={finishError}
          />
        )
      case 'meta':
        return (
          <Onb5e2Meta
            mode={mode}
            meta={meta}
            onChangeMeta={(next) => {
              setMeta(next)
              // Espejo al draft (misma fuente que el wizard anterior).
              actions.setCreateFirstGoal(true)
              actions.setFirstGoalTitle(next.title)
              actions.setFirstGoalEmoji(next.icon)
              actions.setFirstGoalTarget(String(next.monto))
              actions.setFirstGoalMonths(next.meses)
            }}
            onBack={() => setGoalPanel('ahorro')}
            onNext={() => void handleFinish(meta)}
            onSkip={() => {
              setMeta(null)
              actions.setCreateFirstGoal(false)
              void handleFinish(null)
            }}
            submitting={submitting}
            serverError={finishError}
          />
        )
      default: {
        // 'confirmar' — 5h con el peek real.
        const pending = state.pendingFamily
        const members: Onb5hMember[] = (pending?.members ?? []).map((m) => ({
          slug: m.avatar_animal && isAvatarSlug(m.avatar_animal) ? m.avatar_animal : null,
          name: m.display_name || t('onboarding:familySummary.noName'),
          owner: m.role === 'owner',
        }))
        return (
          <Onb5hConfirmar
            mode={mode}
            members={members}
            pendingName={trimmedName || t('onboarding:familySummary.youName')}
            pendingAvatar={state.avatarSlug}
            contributes={state.contributesIncome === true && monthlyIncome > 0}
            contribution={monthlyIncome}
            dynamicHousehold={pending?.income_mode === 'dynamic'}
            onBack={actions.back}
            onJoin={() => void handleFinish(null)}
            submitting={submitting}
            serverError={finishError}
          />
        )
      }
    }
  })()

  const s = ONB_SPEC[mode]

  return (
    <View style={[styles.root, { backgroundColor: s.bg }]}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      {/* Mismo host que el flow screen dev (sin el chrome de preview):
          insets reales arriba/abajo; el gutter horizontal lo pone cada
          pantalla (OnbBody/OnbScrollBody) para no guillotinar sombras. */}
      <View
        style={[
          styles.content,
          { paddingTop: insets.top + 10, paddingBottom: Math.max(insets.bottom, 10) },
        ]}
      >
        <Animated.View
          key={stepKey}
          entering={(navDir === 'fwd' ? FadeInRight : FadeInLeft).duration(
            motionDurations.enterStack,
          )}
          style={styles.stepHost}
        >
          {screen}
        </Animated.View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  stepHost: {
    flex: 1,
  },
})
