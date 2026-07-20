import { useCallback, useMemo } from 'react'
import { StyleSheet, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AVATAR_LABELS, isAvatarSlug, type AvatarSlug } from '@/assets/avatars'
import { RequireAuth } from '@/components/guards'
import { PermissionPrimeSheet } from '@/components/permissions/permission-prime-sheet'
import { Onb5fResumen, type Onb5fSummary } from '@/components/redesign/onboarding/onb-5f-resumen'
import { formatPesos } from '@/components/redesign/onboarding/onb-format'
import { ONB_SPEC } from '@/components/redesign/onboarding/onb-spec'
import { useFamilyMembersDetail } from '@/features/family/use-family-members-detail'
import { useIsSolo } from '@/features/family/use-is-solo'
import { resolveIncomeMode, type FamilyFinance } from '@/features/finance/family-finance.model'
import { useFamilyFinance } from '@/features/finance/use-family-finance'
import { useMyProfile } from '@/features/profile/use-profile'
import { usePushPermissionPrime } from '@/features/push/use-push-permission-prime'
import { triggerHaptic } from '@/lib/haptics'
import i18n from '@/lib/i18n'
import { useThemeMode } from '@/theme/theme-provider'

/**
 * Success post-onboarding LIVE del rediseño (Turno 5 · cableado
 * 2026-07-17). Reemplaza a onboarding-success-screen.tsx (que queda
 * intacto como referencia) montando la réplica de éxito aprobada:
 *   · 5f (Onb5fResumen, variante creator) — cuenta solo o hogar creado
 *     (chip "Ya estás en Manifiesto"; filas PERFIL/HOGAR/INGRESOS/AHORRO
 *     desde family_finance, que el wizard acaba de escribir).
 *   · 5i (Onb5fResumen, variante joiner) — se unió a un hogar (chip
 *     "Te uniste a la familia"; filas PERFIL/HOGAR/APORTE desde el
 *     roster real). Joiner = mi fila de family_members no es owner.
 *
 * CONSERVA la mecánica real de la pantalla anterior: el pre-prompt de
 * notificaciones (usePushPermissionPrime — lo ve toda cuenta nueva) y
 * navigateNext → /(app)/trial-welcome (esa pantalla decide anunciar el
 * período de acceso o saltar a Home según entitlement).
 */

export function NeoOnboardingSuccessScreen() {
  return (
    <RequireAuth>
      {({ userId, familyId }) => (
        <NeoOnboardingSuccessBody userId={userId} familyId={familyId} />
      )}
    </RequireAuth>
  )
}

/** Día del mes de un anchor ISO local (YYYY-MM-DD) — 1 defensivo. */
function anchorDayOfMonth(iso: string | null): number {
  const day = iso ? Number(iso.slice(8, 10)) : NaN
  return Number.isFinite(day) && day >= 1 ? day : 1
}

/** Etiqueta del ciclo (formato aprobado de cicloLabel del flow dev). */
function cicloLabelFromFinance(finance: FamilyFinance): string {
  switch (finance.cycle_type) {
    case 'biweekly':
      return i18n.t('onboarding:success.cycleBiweekly', {
        day: anchorDayOfMonth(finance.cycle_anchor_date),
      })
    case 'weekly':
      return i18n.t('onboarding:success.cycleWeekly')
    case 'custom':
      return i18n.t('onboarding:success.cycleCustom', {
        days: finance.cycle_length_days ?? 30,
      })
    default:
      return i18n.t('onboarding:success.cycleMonthly', {
        day: finance.salary_payment_day,
      })
  }
}

/** Fila INGRESOS del resumen (mismo formato que el flow screen dev). */
function ingresosLabel(finance: FamilyFinance | undefined): string {
  if (!finance) return ''
  const ciclo = cicloLabelFromFinance(finance)
  if (resolveIncomeMode(finance) === 'dynamic') {
    return i18n.t('onboarding:success.incomeDynamic', { cycle: ciclo })
  }
  return `${formatPesos(finance.monthly_income)} · ${ciclo}`
}

/** Fila AHORRO del resumen (formato del flow screen dev). */
function ahorroLabel(finance: FamilyFinance | undefined): string {
  if (!finance) return ''
  const pct = finance.savings_goal_percent ?? 0
  const monthly = resolveIncomeMode(finance) === 'dynamic' ? 0 : finance.monthly_income
  return i18n.t('onboarding:success.savingsRow', {
    pct,
    amount: formatPesos((monthly * pct) / 100),
  })
}

function NeoOnboardingSuccessBody({
  userId,
  familyId,
}: {
  userId: string
  familyId: string
}) {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const mode = useThemeMode().resolvedMode
  const isSolo = useIsSolo(userId)
  const profileQuery = useMyProfile(userId)
  const profile = profileQuery.data
  const financeQuery = useFamilyFinance(familyId)
  const membersQuery = useFamilyMembersDetail(familyId)
  const members = membersQuery.data ?? []
  const myRow = members.find((m) => m.userId === userId)

  const firstName = useMemo(() => {
    const raw = profile?.display_name?.trim() ?? ''
    return raw.split(/\s+/)[0] ?? ''
  }, [profile?.display_name])

  const avatarSlug: AvatarSlug =
    profile?.avatar_animal && isAvatarSlug(profile.avatar_animal)
      ? profile.avatar_animal
      : 'macaw' // default del rediseño mientras asienta el cache

  // Joiner = mi membresía NO es owner (el creador — solo o compartido —
  // siempre es owner del hogar que bootstrapeó).
  const isJoiner = myRow?.isOwner === false

  // El roster llega frío para un joiner recién unido, así que hasta que
  // membersQuery RESOLVIÓ CON DATOS no se puede elegir variante: sin este
  // gate el joiner ve la variante CREATOR (5f) y salta a la joiner (5i)
  // (review r2). Se exige isSuccess (no solo !isLoading): en ERROR,
  // isLoading también es false pero members=[] → myRow undefined →
  // isJoiner false → variante creator equivocada para un joiner (review
  // r3). React Query reintenta el error; el lienzo se sostiene hasta que
  // el roster y el perfil resuelven con datos.
  const summaryReady = membersQuery.isSuccess && profileQuery.isSuccess

  const summary: Onb5fSummary = useMemo(() => {
    const base = {
      name: firstName,
      avatar: { slug: avatarSlug, label: AVATAR_LABELS[avatarSlug] },
    }
    if (isJoiner) {
      const aporte = (myRow?.monthlyIncomeContribution ?? 0) > 0
        ? i18n.t('onboarding:success.joinerContributes', {
            amount: formatPesos(myRow?.monthlyIncomeContribution ?? 0),
          })
        : i18n.t('onboarding:success.joinerNoContribution')
      return {
        ...base,
        hogar: i18n.t('onboarding:success.householdShared'),
        hogarSolo: false,
        ingresos: '',
        ahorro: '',
        variant: 'joiner',
        joinerHogar: i18n.t('onboarding:success.joinerHousehold', {
          members: members.length,
        }),
        joinerAporte: aporte,
      }
    }
    return {
      ...base,
      // Copys del flow screen dev (aprobados con la réplica 5f).
      hogar: isSolo
        ? i18n.t('onboarding:success.householdSolo')
        : i18n.t('onboarding:success.householdShared'),
      hogarSolo: isSolo,
      ingresos: ingresosLabel(financeQuery.data),
      ahorro: ahorroLabel(financeQuery.data),
    }
  }, [firstName, avatarSlug, isJoiner, isSolo, financeQuery.data, members.length, myRow])

  // ── Pre-prompt de notificaciones + salida real (transcrito de la
  // pantalla anterior — un solo lugar marca cooldown/prompt/token) ────
  const prime = usePushPermissionPrime({ userId, familyId })
  const { showIfEligible, onAllow, onDismiss } = prime

  const navigateNext = useCallback(() => {
    // Antes de Home pasamos por la bienvenida al acceso completo
    // (trial-welcome); esa pantalla decide según el entitlement.
    router.replace('/(app)/trial-welcome')
  }, [router])

  const handleContinue = useCallback(async () => {
    void triggerHaptic('selection')
    const shown = await showIfEligible()
    if (!shown) navigateNext()
  }, [showIfEligible, navigateNext])

  const handlePrimeAllow = useCallback(async () => {
    await onAllow()
    navigateNext()
  }, [onAllow, navigateNext])

  const handlePrimeDismiss = useCallback(async () => {
    await onDismiss()
    navigateNext()
  }, [onDismiss, navigateNext])

  const s = ONB_SPEC[mode]

  return (
    <View style={[styles.root, { backgroundColor: s.bg }]}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      {/* Mismo host que el flujo neo: insets reales; el gutter lo pone
          la réplica (OnbBody). */}
      <View
        style={[
          styles.content,
          { paddingTop: insets.top + 10, paddingBottom: Math.max(insets.bottom, 10) },
        ]}
      >
        {/* Hasta que el roster/perfil resuelvan, lienzo del tema (sin
            card) — evita el flash de variante equivocada del joiner. */}
        {summaryReady ? (
          <Onb5fResumen mode={mode} summary={summary} onGoHome={() => void handleContinue()} />
        ) : null}
      </View>

      <PermissionPrimeSheet
        visible={prime.visible}
        type="notifications"
        onAllow={() => {
          void handlePrimeAllow()
        }}
        onDismiss={() => {
          void handlePrimeDismiss()
        }}
      />
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
})
