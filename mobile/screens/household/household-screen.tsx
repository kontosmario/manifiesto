import { useCallback, useMemo, useState } from 'react'
import { RefreshControl, StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui/app-text'
import { MaterialIcons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { RiseView } from '@/components/home/animated/rise-view'
import { MemberRow } from '@/components/settings/member-row'
import {
  SettingsGroup,
  SettingsRow,
  SettingsSwitchRow,
} from '@/components/settings/settings-grouped-list'
import {
  SettingsHeroCard,
  settingsHeroInk,
} from '@/components/settings/settings-hero-card'
import { ConversionSettingsSheet } from '@/components/settings/sheets/conversion-settings-sheet'
import { DestroyFamilyConfirmSheet } from '@/components/settings/sheets/destroy-family-confirm-sheet'
import { EditBufferSheet } from '@/components/settings/sheets/edit-buffer-sheet'
import { EditCycleConfigSheet } from '@/components/settings/sheets/edit-cycle-config-sheet'
import { EditMyContributionSheet } from '@/components/settings/sheets/edit-my-contribution-sheet'
import { EditSavingsPercentSheet } from '@/components/settings/sheets/edit-savings-percent-sheet'
import { IncomeModeConfirmSheet } from '@/components/settings/sheets/income-mode-confirm-sheet'
import { MemberActionSheet } from '@/components/settings/sheets/member-action-sheet'
import { ShareInviteSheet } from '@/components/settings/sheets/share-invite-sheet'
import { RequireReauthSheet } from '@/components/auth/require-reauth-sheet'
import { AvatarAnimal } from '@/components/ui/avatar-animal'
import { Avatar } from '@/components/ui/avatar'
import { NeoStateBlock } from '@/components/ui/neo-state-block'
import { Screen } from '@/components/ui/screen'
import { useEntitlement } from '@/features/billing/use-entitlement'
import { useRequireReauth } from '@/features/auth/use-require-reauth'
import {
  useConvertToFamily,
  useConvertToSolo,
  useLeaveCurrentFamily,
  useUpdateMyIncomeContribution,
} from '@/features/family/use-family-actions'
import {
  useBlockMember,
  useFamilyMemberStats,
  useRemoveMember,
  useUnblockMember,
  type FamilyMemberStats,
} from '@/features/family/use-family-admin'
import { useFamilyMembersDetail } from '@/features/family/use-family-members-detail'
import { useIsSolo } from '@/features/family/use-is-solo'
import { useMyFamilyRole } from '@/features/family/use-my-family-role'
import {
  buildFamilyFinanceInput,
  type FamilyFinanceInputSnapshot,
} from '@/features/finance/family-finance.model'
import { useUpsertFamilyFinance } from '@/features/finance/use-family-finance'
import { goalEmojiText } from '@/features/savings-goals/goal-icon'
import { useLatestSavingsGoal } from '@/features/savings-goals/use-latest-savings-goal'
import { useFamilyDashboard } from '@/hooks/use-family-dashboard'
import { neoConfirm } from '@/lib/confirm-bus'
import { triggerHaptic } from '@/lib/haptics'
import { toast } from '@/lib/toast-bus'
import { useAppTheme } from '@/theme/theme-provider'
import { neoTokens } from '@/theme/neo-tokens'
import { nunitoFamily, typography } from '@/theme/typography'
import { getErrorMessage } from '@/utils/error-message'
import { financeToCycleConfig, type FinanceCycleConfig } from '@/utils/finance-cycle-config'
import { formatCycleSummary } from '@/utils/format-cycle-label'
import { currencyFormatter, formatMoneyShort } from '@/utils/money'

interface HouseholdScreenProps {
  userId: string
  familyId: string
}

/**
 * "Mi hogar" — la sección que unifica lo que antes vivía repartido:
 *
 *   · Ajustes §Hogar   → el dinero y el ciclo del hogar (MOVIDO acá)
 *   · Ajustes §Familia → invitar + salir/eliminar el hogar (MOVIDO acá)
 *   · Ajustes §Tipo de cuenta → pasar a individual / compartir (MOVIDO acá)
 *   · /settings/family-admin  → el roster de integrantes (MOVIDO acá; esa ruta
 *     ahora redirige)
 *
 * Meta de ahorro y Plan del hogar se DUPLICAN como enlaces: sus pantallas
 * siguen colgando de Ajustes, acá sólo se agrega una segunda puerta.
 *
 * Sin guard de dueño: la pantalla se auto-gatea fila por fila. El roster es de
 * LECTURA para cualquier integrante (antes un no-dueño no veía a nadie en
 * ningún lado); las acciones destructivas y la configuración compartida siguen
 * siendo del dueño, igual que en el backend.
 */
export function HouseholdScreen({ userId, familyId }: HouseholdScreenProps) {
  const { theme } = useAppTheme()
  const neo = neoTokens(theme.isDark ? 'dark' : 'light')
  const { t } = useTranslation()
  const router = useRouter()
  const DISABLED_HINT = t('settings:settingsScreen.disabledHint')

  const roleQuery = useMyFamilyRole(userId, familyId)
  const isOwner = roleQuery.data === 'owner'
  const isSolo = useIsSolo(userId)
  const statsQuery = useFamilyMemberStats()
  const dashboard = useFamilyDashboard(familyId)
  const familyMembersDetailQuery = useFamilyMembersDetail(familyId)
  const savingsGoalQuery = useLatestSavingsGoal(familyId)
  const entitlementQuery = useEntitlement(userId)

  const blockMutation = useBlockMember()
  const unblockMutation = useUnblockMember()
  const removeMutation = useRemoveMember()
  const updateMyContributionMutation = useUpdateMyIncomeContribution(userId, familyId)
  const upsertFamilyFinanceMutation = useUpsertFamilyFinance(familyId, userId)
  const leaveFamilyMutation = useLeaveCurrentFamily(userId)
  const leaveFamilyReauth = useRequireReauth()
  const convertToSolo = useConvertToSolo(userId)
  const convertToFamily = useConvertToFamily(userId)

  // ── Roster ────────────────────────────────────────────────────────
  const members = useMemo(() => statsQuery.data ?? [], [statsQuery.data])
  const active = useMemo(
    () =>
      members
        .filter((m) => m.role !== 'blocked')
        .sort((a, b) => (a.role === 'owner' ? -1 : b.role === 'owner' ? 1 : 0)),
    [members],
  )
  const blocked = useMemo(() => members.filter((m) => m.role === 'blocked'), [members])
  const otherActiveMembers = useMemo(
    () =>
      members.filter(
        (m) => m.userId !== userId && m.role !== 'blocked' && m.blockedAt === null,
      ).length,
    [members, userId],
  )

  const [selected, setSelected] = useState<FamilyMemberStats | null>(null)
  const openMember = useCallback((member: FamilyMemberStats) => {
    void triggerHaptic('selection')
    setSelected(member)
  }, [])

  // ── Sheets ────────────────────────────────────────────────────────
  const [inviteSheetOpen, setInviteSheetOpen] = useState(false)
  const [contributionSheetOpen, setContributionSheetOpen] = useState(false)
  const [cycleConfigSheetOpen, setCycleConfigSheetOpen] = useState(false)
  const [savingsSheetOpen, setSavingsSheetOpen] = useState(false)
  const [bufferSheetOpen, setBufferSheetOpen] = useState(false)
  const [conversionSheetOpen, setConversionSheetOpen] = useState(false)
  const [destroyFamilySheetOpen, setDestroyFamilySheetOpen] = useState(false)

  // ── Finanzas del hogar ────────────────────────────────────────────
  const financeSnapshot = useMemo<FamilyFinanceInputSnapshot>(
    () => ({
      dailyBudgetBufferMode: dashboard.dailyBudgetBufferMode,
      dailyBudgetBufferValue: dashboard.dailyBudgetBufferValue,
      dailyBudgetCheckinHour: dashboard.dailyBudgetCheckinHour,
      dailyBudgetNudgesEnabled: dashboard.dailyBudgetNudgesEnabled,
      lastSalaryConfirmedAt:
        dashboard.familyFinanceQuery.data?.last_salary_confirmed_at ?? null,
      monthlyIncome: dashboard.monthlyIncome,
      salaryPaymentDay: dashboard.salaryPaymentDay,
      savingsGoal: dashboard.savingsGoal,
      savingsGoalPercent: dashboard.familyFinanceQuery.data?.savings_goal_percent ?? 20,
      usdExchangeRate: dashboard.usdExchangeRate,
      localCurrency: dashboard.familyFinanceQuery.data?.local_currency,
      usdRateEnabled: dashboard.familyFinanceQuery.data?.usd_rate_enabled ?? false,
      currentCycleStartingBalance:
        dashboard.familyFinanceQuery.data?.current_cycle_starting_balance ?? null,
      currentCycleAnchor: dashboard.familyFinanceQuery.data?.current_cycle_anchor ?? null,
      incomeMode: dashboard.incomeMode,
      // Cycle config: leer del query — NO hardcodear monthly. Cualquier save
      // vía `saveFinanceSnapshot` (USD rate, ahorro, etc.) reseteaba la config
      // del ciclo si estos quedaban fijos.
      cycleType: dashboard.familyFinanceQuery.data?.cycle_type ?? 'monthly',
      cycleAnchorDate: dashboard.familyFinanceQuery.data?.cycle_anchor_date ?? null,
      cycleLengthDays: dashboard.familyFinanceQuery.data?.cycle_length_days ?? null,
    }),
    [
      dashboard.dailyBudgetBufferMode,
      dashboard.dailyBudgetBufferValue,
      dashboard.dailyBudgetCheckinHour,
      dashboard.dailyBudgetNudgesEnabled,
      dashboard.familyFinanceQuery.data?.last_salary_confirmed_at,
      dashboard.familyFinanceQuery.data?.savings_goal_percent,
      dashboard.familyFinanceQuery.data?.current_cycle_starting_balance,
      dashboard.familyFinanceQuery.data?.current_cycle_anchor,
      dashboard.familyFinanceQuery.data?.cycle_type,
      dashboard.familyFinanceQuery.data?.cycle_anchor_date,
      dashboard.familyFinanceQuery.data?.cycle_length_days,
      dashboard.monthlyIncome,
      dashboard.salaryPaymentDay,
      dashboard.savingsGoal,
      dashboard.usdExchangeRate,
      dashboard.familyFinanceQuery.data?.local_currency,
      dashboard.familyFinanceQuery.data?.usd_rate_enabled,
      dashboard.incomeMode,
    ],
  )

  const showError = useCallback(async (error: unknown, fallbackMessage: string) => {
    await triggerHaptic('error')
    toast.error(getErrorMessage(error, fallbackMessage))
  }, [])

  const saveFinanceSnapshot = useCallback(
    (next: FamilyFinanceInputSnapshot, onDone: () => void) => {
      upsertFamilyFinanceMutation.mutate(buildFamilyFinanceInput(next), {
        onSuccess: () => {
          void triggerHaptic('success')
          onDone()
        },
        onError: (error: unknown) => {
          void showError(error, t('settings:errors.saveHouseholdMetrics'))
        },
      })
    },
    [showError, upsertFamilyFinanceMutation, t],
  )

  const myContribution = useMemo(() => {
    const me = (familyMembersDetailQuery.data ?? []).find((m) => m.userId === userId)
    return me?.monthlyIncomeContribution ?? 0
  }, [familyMembersDetailQuery.data, userId])

  const handleSaveMyContribution = useCallback(
    (value: number) => {
      updateMyContributionMutation.mutate(value, {
        onSuccess: () => {
          void triggerHaptic('success')
          setContributionSheetOpen(false)
        },
        onError: (error: unknown) => {
          void showError(error, t('settings:errors.updateContribution'))
        },
      })
    },
    [showError, updateMyContributionMutation, t],
  )

  const handleSaveCycleConfig = useCallback(
    (next: FinanceCycleConfig) => {
      saveFinanceSnapshot(
        {
          ...financeSnapshot,
          // El día de cobro sólo se persiste en `salaryPaymentDay` cuando el
          // ciclo es mensual; para los rolling lo derivan de `cycle_anchor_date`.
          salaryPaymentDay:
            next.cycle_type === 'monthly'
              ? next.salary_payment_day
              : financeSnapshot.salaryPaymentDay,
          cycleType: next.cycle_type,
          cycleAnchorDate: next.cycle_type === 'monthly' ? null : next.cycle_anchor_date,
          cycleLengthDays: next.cycle_type === 'monthly' ? null : next.cycle_length_days,
        },
        () => setCycleConfigSheetOpen(false),
      )
    },
    [financeSnapshot, saveFinanceSnapshot],
  )

  const handleSaveSavingsPercent = useCallback(
    (value: number) => {
      saveFinanceSnapshot({ ...financeSnapshot, savingsGoalPercent: value }, () =>
        setSavingsSheetOpen(false),
      )
    },
    [financeSnapshot, saveFinanceSnapshot],
  )

  const handleSaveBuffer = useCallback(
    (mode: 'none' | 'fixed' | 'percent', value: number) => {
      saveFinanceSnapshot(
        {
          ...financeSnapshot,
          dailyBudgetBufferMode: mode,
          dailyBudgetBufferValue: value,
        },
        () => setBufferSheetOpen(false),
      )
    },
    [financeSnapshot, saveFinanceSnapshot],
  )

  const handleSaveCurrency = useCallback(
    (value: string) => {
      // No cierra el sheet: el usuario ve el check moverse y cierra cuando quiere.
      saveFinanceSnapshot({ ...financeSnapshot, localCurrency: value }, () => {})
    },
    [financeSnapshot, saveFinanceSnapshot],
  )

  const handleToggleUsdRate = useCallback(
    (value: boolean) => {
      saveFinanceSnapshot({ ...financeSnapshot, usdRateEnabled: value }, () => {})
    },
    [financeSnapshot, saveFinanceSnapshot],
  )

  // Régimen de ingreso (fijo ↔ variable). Cambia cómo se calcula el cupo
  // diario, así que se confirma con un sheet que enumera los efectos. Al pasar
  // a dinámico se APAGA el ahorro por % y se LIMPIA el override del ciclo.
  const isDynamicIncomeMode = dashboard.incomeMode === 'dynamic'
  const [incomeModeSheet, setIncomeModeSheet] = useState<{
    open: boolean
    nextMode: 'fixed' | 'dynamic'
  }>({ open: false, nextMode: 'dynamic' })
  const handleToggleDynamicIncome = useCallback((value: boolean) => {
    setIncomeModeSheet({ open: true, nextMode: value ? 'dynamic' : 'fixed' })
  }, [])
  const handleConfirmIncomeMode = useCallback(() => {
    const { nextMode } = incomeModeSheet
    saveFinanceSnapshot(
      nextMode === 'dynamic'
        ? {
            ...financeSnapshot,
            incomeMode: nextMode,
            savingsGoal: 0,
            savingsGoalPercent: 0,
            currentCycleStartingBalance: null,
            currentCycleAnchor: null,
          }
        : { ...financeSnapshot, incomeMode: nextMode },
      () => setIncomeModeSheet((prev) => ({ ...prev, open: false })),
    )
  }, [incomeModeSheet, financeSnapshot, saveFinanceSnapshot])

  // ── Acciones delicadas ────────────────────────────────────────────
  const isOwnerDestroyFlow = isOwner && otherActiveMembers > 0

  const runLeaveFamily = useCallback(async () => {
    const ok = await leaveFamilyReauth.requireReauth(t('settings:leaveHousehold.title'))
    if (!ok) return
    leaveFamilyMutation.mutate(undefined, {
      onError: (error: unknown) => {
        void showError(error, t('settings:errors.leaveFamily'))
      },
      onSuccess: () => {
        void triggerHaptic('success')
        setDestroyFamilySheetOpen(false)
        router.replace('/(app)/onboarding')
      },
    })
  }, [leaveFamilyMutation, leaveFamilyReauth, router, showError, t])

  const handleConfirmLeave = useCallback(() => {
    if (isOwnerDestroyFlow) {
      void triggerHaptic('warning')
      setDestroyFamilySheetOpen(true)
      return
    }
    // Si su acceso venía del hogar y su período libre personal ya venció, al
    // salir queda sin plan. Se avisa ANTES.
    const ent = entitlementQuery.data
    const willLoseAccess = ent?.source === 'family' && ent.trialDaysLeft === 0
    const baseMsg = t('settings:leaveHousehold.baseMessage')
    const message = willLoseAccess
      ? `${baseMsg}\n\n${t('settings:leaveHousehold.lostAccessNote')}`
      : baseMsg
    void (async () => {
      const confirmed = await neoConfirm(t('settings:leaveHousehold.title'), {
        confirmLabel: t('settings:leaveHousehold.leave'),
        message,
        tone: 'destructive',
      })
      if (!confirmed) return
      await runLeaveFamily()
    })()
  }, [isOwnerDestroyFlow, runLeaveFamily, entitlementQuery.data, t])

  const handleConfirmConvertToSolo = useCallback(() => {
    void (async () => {
      const confirmed = await neoConfirm(t('settings:convertToSolo.title'), {
        confirmLabel: t('settings:convertToSolo.confirm'),
        message: t('settings:convertToSolo.message'),
        tone: 'destructive',
      })
      if (!confirmed) return
      convertToSolo.mutate(undefined, {
        onError: (error) => void showError(error, t('settings:errors.changeAccountType')),
      })
    })()
  }, [convertToSolo, showError, t])

  const handleConfirmConvertToFamily = useCallback(() => {
    void (async () => {
      const confirmed = await neoConfirm(t('settings:convertToFamily.title'), {
        confirmLabel: t('settings:convertToFamily.confirm'),
        message: t('settings:convertToFamily.message'),
      })
      if (!confirmed) return
      convertToFamily.mutate(undefined, {
        onError: (error) => void showError(error, t('settings:errors.changeAccountType')),
      })
    })()
  }, [convertToFamily, showError, t])

  const handleOpenInvite = useCallback(() => {
    void triggerHaptic('selection')
    setInviteSheetOpen(true)
  }, [])

  // ── Valores de las filas ──────────────────────────────────────────
  const myContributionValue =
    myContribution > 0
      ? currencyFormatter.format(myContribution)
      : familyMembersDetailQuery.isLoading
        ? '…'
        : t('settings:rowValue.define')
  const householdTotalValue =
    financeSnapshot.monthlyIncome > 0
      ? currencyFormatter.format(financeSnapshot.monthlyIncome)
      : t('settings:rowValue.define')
  const currentCycleConfig = useMemo<FinanceCycleConfig>(
    () => financeToCycleConfig(dashboard.familyFinanceQuery.data),
    [dashboard.familyFinanceQuery.data],
  )
  const cycleConfigValue = formatCycleSummary(currentCycleConfig)
  const savingsPercentValue = `${financeSnapshot.savingsGoalPercent}%`
  const usdRateEnabled = financeSnapshot.usdRateEnabled ?? false
  const currencyValue = financeSnapshot.localCurrency ?? null
  const conversionRowValue = !usdRateEnabled
    ? t('settings:conversion.rowDisabled')
    : (currencyValue ?? t('settings:conversion.chooseCurrency'))
  const bufferValueLabel =
    financeSnapshot.dailyBudgetBufferMode === 'none'
      ? t('settings:buffer.none')
      : financeSnapshot.dailyBudgetBufferMode === 'percent'
        ? t('settings:buffer.percentDaily', { value: financeSnapshot.dailyBudgetBufferValue })
        : t('settings:buffer.perDay', {
            amount: currencyFormatter.format(financeSnapshot.dailyBudgetBufferValue),
          })
  const savingsGoalSubtitle = savingsGoalQuery.data
    ? savingsGoalQuery.data.isActive
      ? `${goalEmojiText(savingsGoalQuery.data.emoji)} ${savingsGoalQuery.data.title} · ${formatMoneyShort(savingsGoalQuery.data.currentAmount)} / ${formatMoneyShort(savingsGoalQuery.data.goalAmount)}`
          .replace(/\s{2,}/g, ' ')
          .trim()
      : t('settings:savingsGoal.inactiveSubtitle', {
          emoji: goalEmojiText(savingsGoalQuery.data.emoji),
          title: savingsGoalQuery.data.title,
        })
          .replace(/\s{2,}/g, ' ')
          .trim()
    : t('settings:savingsGoal.noGoal')

  const heroSummary =
    blocked.length > 0
      ? `${t('settings:familyAdmin.activeCount', { count: active.length })} · ${t('settings:familyAdmin.blockedCount', { count: blocked.length })}`
      : t('settings:familyAdmin.activeCount', { count: active.length })

  if (statsQuery.isError && !statsQuery.data) {
    return (
      <Screen
        backgroundColor={neo.bg}
        titleColor={neo.text}
        title={t('settings:myHome.title')}
        subtitle={t('settings:familyAdmin.subtitleError')}
        canGoBack
      >
        <RiseView>
          <NeoStateBlock
            actionLabel={t('states:errorState.action')}
            description={getErrorMessage(
              statsQuery.error,
              t('settings:familyAdmin.errorDescription'),
            )}
            icon="error-outline"
            title={t('settings:familyAdmin.errorTitle')}
            tone="error"
            onAction={() => {
              void statsQuery.refetch()
            }}
          />
        </RiseView>
      </Screen>
    )
  }

  return (
    <Screen
      backgroundColor={neo.bg}
      titleColor={neo.text}
      title={t('settings:myHome.title')}
      subtitle={isSolo ? t('settings:myHome.subtitleSolo') : t('settings:myHome.subtitle')}
      canGoBack
      bodyStyle={styles.body}
      refreshControl={
        <RefreshControl
          refreshing={statsQuery.isRefetching}
          onRefresh={() => {
            void statsQuery.refetch()
          }}
          tintColor={neo.textMuted}
        />
      }
    >
      {/* ── HERO ───────────────────────────────────────────────── */}
      <RiseView>
        <SettingsHeroCard particleCount={9}>
          <Text style={[styles.heroEyebrow, { color: settingsHeroInk.accent }]}>
            {isSolo ? t('settings:myHome.heroEyebrowSolo') : t('settings:myHome.heroEyebrow')}
          </Text>
          {active.length > 0 ? <HeroAvatarStack members={active} /> : null}
          <Text style={[styles.heroTitle, { color: settingsHeroInk.title }]}>
            {isSolo
              ? t('settings:myHome.soloTitle')
              : t('settings:familyAdmin.memberCount', { count: active.length })}
          </Text>
          <Text style={[styles.heroSummary, { color: settingsHeroInk.soft }]}>
            {isSolo ? t('settings:myHome.soloSummary') : heroSummary}
          </Text>
          {!isSolo ? (
            <View
              style={[styles.rolePill, { backgroundColor: settingsHeroInk.chipBackground }]}
            >
              <MaterialIcons
                color={settingsHeroInk.chipAccentInk}
                name={isOwner ? 'verified' : 'person'}
                size={14}
              />
              <Text style={[styles.rolePillText, { color: settingsHeroInk.chipAccentInk }]}>
                {isOwner
                  ? t('settings:myHome.rolePillOwner')
                  : t('settings:myHome.rolePillMember')}
              </Text>
            </View>
          ) : null}
        </SettingsHeroCard>
      </RiseView>

      {/* ── A · INTEGRANTES ────────────────────────────────────── */}
      {!isSolo ? (
        <RiseView delay={80}>
          <SettingsGroup
            footer={isOwner ? undefined : t('settings:myHome.membersFooterMember')}
            title={t('settings:familyAdmin.membersGroup')}
          >
            {isOwner ? (
              <SettingsRow
                helper={t('settings:family.inviteHelper')}
                icon="person-add"
                label={t('settings:family.invite')}
                onPress={handleOpenInvite}
              />
            ) : null}
            {active.length === 0 ? (
              <EmptyRow
                text={
                  statsQuery.isLoading
                    ? t('settings:familyAdmin.loadingMembers')
                    : t('settings:familyAdmin.noMembers')
                }
              />
            ) : (
              active.map((member, index) => (
                <MemberRow
                  key={member.userId}
                  member={member}
                  isMe={member.userId === userId}
                  isLast={index === active.length - 1}
                  // Sólo el dueño abre el sheet de acciones — el resto ve el
                  // roster en lectura (y el backend lo exige igual).
                  onPress={isOwner ? () => openMember(member) : undefined}
                />
              ))
            )}
          </SettingsGroup>
        </RiseView>
      ) : (
        <RiseView delay={80}>
          <SettingsGroup title={t('settings:myHome.growGroup')}>
            <SettingsRow
              helper={t('settings:accountType.toFamilyHelper')}
              icon="group-add"
              isLast
              label={t('settings:accountType.toFamily')}
              onPress={handleConfirmConvertToFamily}
            />
          </SettingsGroup>
        </RiseView>
      )}

      {!isSolo && blocked.length > 0 ? (
        <RiseView delay={120}>
          <SettingsGroup title={t('settings:familyAdmin.blockedGroup')}>
            {blocked.map((member, index) => (
              <MemberRow
                key={member.userId}
                member={member}
                isMe={member.userId === userId}
                isLast={index === blocked.length - 1}
                onPress={isOwner ? () => openMember(member) : undefined}
              />
            ))}
          </SettingsGroup>
        </RiseView>
      ) : null}

      {/* ── B · DINERO DEL HOGAR ───────────────────────────────── */}
      <RiseView delay={160}>
        <SettingsGroup title={t('settings:myHome.moneyGroup')}>
          {/* En ingreso VARIABLE no hay sueldo fijo: el aporte y el total del
              hogar no tienen base y las filas desaparecen. */}
          {!isDynamicIncomeMode ? (
            <SettingsRow
              icon="attach-money"
              label={
                isSolo
                  ? t('settings:household.monthlyIncome')
                  : t('settings:household.myContribution')
              }
              onPress={() => setContributionSheetOpen(true)}
              value={myContributionValue}
            />
          ) : null}
          {!isDynamicIncomeMode && !isSolo ? (
            <SettingsRow
              helper={t('settings:myHome.householdTotalHelper')}
              icon="account-balance-wallet"
              label={t('settings:myHome.householdTotal')}
              value={householdTotalValue}
            />
          ) : null}
          <SettingsRow
            disabled={!isOwner}
            disabledHint={DISABLED_HINT}
            helper={savingsGoalSubtitle}
            icon="flag"
            label={t('settings:savingsGoal.rowLabel')}
            onPress={() => router.push('/(app)/savings-goal')}
          />
          <SettingsRow
            helper={t('settings:plan.helper')}
            icon="workspace-premium"
            isLast
            label={t('settings:plan.rowLabel')}
            onPress={() => router.push('/(app)/settings/plan')}
            value={t('settings:plan.rowValue')}
          />
        </SettingsGroup>
      </RiseView>

      {/* ── C · CICLO DEL HOGAR ────────────────────────────────── */}
      <RiseView delay={220}>
        <SettingsGroup
          footer={isOwner ? undefined : t('settings:household.ownerOnlyFooter')}
          title={t('settings:myHome.cycleGroup')}
        >
          <SettingsSwitchRow
            disabled={!isOwner}
            helper={
              isDynamicIncomeMode
                ? t('settings:household.incomeModeHelperOn')
                : t('settings:household.incomeModeHelper')
            }
            icon="auto-graph"
            label={t('settings:household.incomeModeLabel')}
            onValueChange={handleToggleDynamicIncome}
            value={isDynamicIncomeMode}
          />
          <SettingsRow
            disabled={!isOwner}
            disabledHint={DISABLED_HINT}
            icon="autorenew"
            label={
              isDynamicIncomeMode
                ? t('settings:household.cycleLabelDynamic')
                : t('settings:household.payCycle')
            }
            onPress={() => setCycleConfigSheetOpen(true)}
            value={cycleConfigValue}
          />
          {!isDynamicIncomeMode ? (
            <SettingsRow
              disabled={!isOwner}
              disabledHint={DISABLED_HINT}
              icon="savings"
              label={t('settings:household.savingsPercent')}
              onPress={() => setSavingsSheetOpen(true)}
              value={savingsPercentValue}
            />
          ) : null}
          <SettingsRow
            disabled={!isOwner}
            disabledHint={DISABLED_HINT}
            icon="shield"
            label={t('settings:household.dailyBuffer')}
            onPress={() => setBufferSheetOpen(true)}
            value={bufferValueLabel}
          />
          <SettingsRow
            disabled={!isOwner}
            disabledHint={DISABLED_HINT}
            helper={t('settings:household.usdRateHelper')}
            icon="currency-exchange"
            isLast
            label={t('settings:household.usdRate')}
            onPress={() => setConversionSheetOpen(true)}
            value={conversionRowValue}
          />
        </SettingsGroup>
      </RiseView>

      {/* ── D · ACCIONES DELICADAS ─────────────────────────────────
          Separadas del resto por un espaciador propio + su grupo aparte,
          con la tinta de peligro que ya usa `SettingsRow destructive`
          (neoInk().danger). Nada de esto se dispara sin confirmación:
          `neoConfirm` en un tap, el sheet de dos pasos + re-auth en el
          flujo del dueño con miembros. En modo solo no hay nada que
          eliminar acá (reiniciar la cuenta sigue en Ajustes). */}
      {!isSolo ? (
        <RiseView delay={280}>
          <View style={styles.dangerZone}>
            <SettingsGroup
              footer={t('settings:myHome.dangerFooter')}
              title={t('settings:myHome.dangerGroup')}
            >
              {isOwner ? (
                <SettingsRow
                  destructive
                  helper={t('settings:accountType.toSoloHelper')}
                  icon="person-remove"
                  label={t('settings:accountType.toSolo')}
                  onPress={handleConfirmConvertToSolo}
                />
              ) : null}
              <SettingsRow
                destructive
                helper={isOwnerDestroyFlow ? t('settings:family.ownerLeaveHelper') : undefined}
                icon={isOwnerDestroyFlow ? 'delete-forever' : 'logout'}
                isLast
                label={
                  isOwnerDestroyFlow
                    ? t('settings:family.deleteHousehold')
                    : t('settings:family.leaveHousehold')
                }
                onPress={handleConfirmLeave}
              />
            </SettingsGroup>
          </View>
        </RiseView>
      ) : null}

      {/* ── Sheets ─────────────────────────────────────────────── */}
      <MemberActionSheet
        member={selected}
        currentUserId={userId}
        onClose={() => setSelected(null)}
        onBlock={(member) => blockMutation.mutateAsync({ targetUserId: member.userId })}
        onUnblock={(member) => unblockMutation.mutateAsync({ targetUserId: member.userId })}
        onRemove={(member) => removeMutation.mutateAsync({ targetUserId: member.userId })}
      />
      <ShareInviteSheet
        visible={inviteSheetOpen}
        onClose={() => setInviteSheetOpen(false)}
      />
      <EditMyContributionSheet
        currentValue={myContribution}
        householdTotal={financeSnapshot.monthlyIncome}
        isSaving={updateMyContributionMutation.isPending}
        isSolo={isSolo}
        onClose={() => setContributionSheetOpen(false)}
        onSave={handleSaveMyContribution}
        visible={contributionSheetOpen}
      />
      <EditCycleConfigSheet
        copyVariant={isDynamicIncomeMode ? 'cycle' : 'salary'}
        currentConfig={currentCycleConfig}
        isSaving={upsertFamilyFinanceMutation.isPending}
        onClose={() => setCycleConfigSheetOpen(false)}
        onSave={handleSaveCycleConfig}
        visible={cycleConfigSheetOpen}
      />
      <IncomeModeConfirmSheet
        visible={incomeModeSheet.open}
        nextMode={incomeModeSheet.nextMode}
        isSaving={upsertFamilyFinanceMutation.isPending}
        onConfirm={handleConfirmIncomeMode}
        onClose={() => setIncomeModeSheet((prev) => ({ ...prev, open: false }))}
      />
      <EditSavingsPercentSheet
        currentValue={financeSnapshot.savingsGoalPercent}
        isSaving={upsertFamilyFinanceMutation.isPending}
        monthlyIncome={financeSnapshot.monthlyIncome}
        onClose={() => setSavingsSheetOpen(false)}
        onSave={handleSaveSavingsPercent}
        visible={savingsSheetOpen}
      />
      <EditBufferSheet
        currentMode={financeSnapshot.dailyBudgetBufferMode}
        currentValue={financeSnapshot.dailyBudgetBufferValue}
        isSaving={upsertFamilyFinanceMutation.isPending}
        onClose={() => setBufferSheetOpen(false)}
        onSave={handleSaveBuffer}
        visible={bufferSheetOpen}
      />
      <ConversionSettingsSheet
        currency={currencyValue}
        enabled={usdRateEnabled}
        isSaving={upsertFamilyFinanceMutation.isPending}
        onClose={() => setConversionSheetOpen(false)}
        onSelectCurrency={handleSaveCurrency}
        onToggle={handleToggleUsdRate}
        visible={conversionSheetOpen}
      />
      <DestroyFamilyConfirmSheet
        isSubmitting={leaveFamilyMutation.isPending}
        onCancel={() => {
          if (leaveFamilyMutation.isPending) return
          setDestroyFamilySheetOpen(false)
        }}
        onConfirm={() => void runLeaveFamily()}
        otherActiveMembers={otherActiveMembers}
        visible={destroyFamilySheetOpen}
      />
      <RequireReauthSheet
        visible={leaveFamilyReauth.isVisible}
        actionLabel={leaveFamilyReauth.actionLabel}
        onConfirmed={leaveFamilyReauth.onConfirmed}
        onCancel={leaveFamilyReauth.onCancel}
      />
    </Screen>
  )
}

/**
 * Stack de avatares REALES del hogar sobre el hero forest.
 *
 * El hero es un GRADIENTE, así que el ring no puede "borrarse" contra el fondo
 * como hace el de la píldora del Home (que copia el color plano del chip): acá
 * el ring es la tinta crema del propio hero (`settingsHeroInk.title`) y separa
 * el overlap de forma deliberada. Sin colores nuevos: los dos valores salen del
 * mismo set de tintas del hero.
 */
function HeroAvatarStack({ members }: { members: FamilyMemberStats[] }) {
  const visible = members.slice(0, 4)
  return (
    <View style={styles.avatarStack}>
      {visible.map((member, index) => (
        <View
          key={member.userId}
          style={[styles.avatarSlot, index > 0 ? styles.avatarOverlap : null]}
        >
          {member.avatarAnimal ? (
            <AvatarAnimal
              slug={member.avatarAnimal}
              size={34}
              ringColor={settingsHeroInk.title}
            />
          ) : (
            // Iniciales BLANCAS sobre el pozo oscuro del hero (el mismo que
            // usan los chips) — el fill translúcido compuesto sobre cualquier
            // stop del forest deja el blanco muy por encima de AA.
            <Avatar
              name={member.displayName}
              color={settingsHeroInk.chipBackground}
              size={34}
              ringColor={settingsHeroInk.title}
            />
          )}
        </View>
      ))}
    </View>
  )
}

function EmptyRow({ text }: { text: string }) {
  const { theme } = useAppTheme()
  const neo = neoTokens(theme.isDark ? 'dark' : 'light')
  return (
    <View style={styles.emptyRow}>
      <Text style={[styles.emptyText, { color: neo.textMuted }]}>{text}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  // El wrapper del body del <Screen> no trae gap propio → sin esto el hero y
  // la primera sección quedan pegados. 24 = tier de separación entre secciones.
  body: {
    gap: 24,
  },
  heroEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    letterSpacing: 1.6,
  },
  heroTitle: {
    ...typography.screenTitle,
  },
  heroSummary: {
    fontSize: 13,
    fontFamily: nunitoFamily('600'),
    lineHeight: 18,
  },
  avatarStack: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
  },
  avatarSlot: {
    width: 34,
    height: 34,
  },
  avatarOverlap: {
    marginLeft: -10,
  },
  rolePill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginTop: 4,
  },
  rolePillText: {
    fontSize: 12,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
  },
  // Separación EXTRA de las destructivas: el `gap: 24` del body separa
  // secciones pares; este bloque tiene que leerse como "otra cosa", no como
  // la sección siguiente.
  dangerZone: {
    paddingTop: 20,
  },
  emptyRow: {
    paddingHorizontal: 14,
    paddingVertical: 18,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: nunitoFamily('400'),
  },
})
