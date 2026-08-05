// Asistente Financiero — preferences screen.
//
// Rebuilt on the app's canonical grouped-settings system
// (SettingsGroup / SettingsRow / SettingsSwitchRow) so it looks and
// behaves exactly like the rest of Ajustes: icon + chevron affordances,
// press-scale feedback, haptics, grouped cards with eyebrow titles.
// Intuitiveness pass (2026-06-15): controls before passive info, push
// sub-settings grouped under their switch, persona pickable as an
// iOS-style checklist. Copy follows the comprehensibility standard
// (no "familia" — collides with household members — no internal terms).
//
// Controls in one place:
//  1. Avisos: master on/off + push (cuándo / no molestar / nivel).
//  2. Tu estilo: persona inferida o elegida a mano (checklist).
//  3. Tus avisos: resumen de a cuáles les haces caso (solo lectura).
//  4. "Avisos que ocultaste" = `user_signal_blocklist` rows + unblock.
//  5. "Borrar lo que aprendió de mí": hard delete of own
//     `advisor_interactions` rows (gated by RLS — `delete_own` policy,
//     migration 20260501010000).

import { useCallback, useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import i18n from '@/lib/i18n'

import { Screen } from '@/components/ui/screen'
import { ModalCard } from '@/components/ui/modal-card'
import { HourPickerSheet } from '@/components/ui/hour-picker-sheet'
import { RiseView } from '@/components/home/animated/rise-view'
import { AmbientBlobs } from '@/components/home/ambient-blobs'
import {
  SettingsGroup,
  SettingsRow,
  SettingsSwitchRow,
} from '@/components/settings/settings-grouped-list'
import { neoConfirm } from '@/lib/confirm-bus'
import { toast } from '@/lib/toast-bus'
import { triggerHaptic } from '@/lib/haptics'
import { supabase } from '@/lib/supabase'
import { formatMoney } from '@/utils/money'
import { useAppTheme } from '@/theme/theme-provider'
import { neoInk } from '@/theme/neo-ink'
import { neoTokens } from '@/theme/neo-tokens'
import { radii } from '@/theme/palette'

import { useInteractionStats } from '@/features/insights/use-interaction-stats'
import { useAdvisorValueSummary } from '@/features/insights/use-advisor-value-summary'
import {
  ADVISOR_PREFERENCES_DEFAULTS,
  useAdvisorPreferences,
  useUpdateAdvisorPreferences,
} from '@/features/insights/use-advisor-preferences'
import {
  useNotificationPreferences,
  useUpdateNotificationPreferences,
  type AdvisorPushUrgency,
} from '@/features/notifications/use-notification-preferences'
import { inferPersona, PERSONA_PROFILES, type UserPersona } from '@/features/insights/persona'
import {
  useSignalBlocklistEntries,
  useUnblockSignalFamily,
} from '@/features/insights/use-signal-blocklist'
import { useQueryClient } from '@tanstack/react-query'

type IconName = keyof typeof MaterialIcons.glyphMap

interface Props {
  userId: string
}

// Etiquetas en lenguaje llano (auditoría de comprensibilidad 2026-06-15):
// el nombre interno NO se filtra a la UI. Cada label se entiende sin saber
// finanzas. Ver docs/superpowers/specs/2026-06-15-asistente-voz-comprensible-design.md
// El family-name interno (con guiones) se mapea a una key camelCase del JSON.
const FAMILY_I18N_KEYS: Record<string, string> = {
  velocity: 'velocity',
  'recovery-hard': 'recoveryHard',
  'recovery-soft': 'recoverySoft',
  'fijos-ratio': 'fijosRatio',
  'small-leaks': 'smallLeaks',
  'night-impulse': 'nightImpulse',
  'weekly-pattern': 'weeklyPattern',
  zombie: 'zombie',
  hike: 'hike',
  'undetected-sub': 'undetectedSub',
  cap: 'cap',
  'cat-dominance': 'catDominance',
  'cat-accel': 'catAccel',
  'cat-win': 'catWin',
  'member-imbalance': 'memberImbalance',
  'savings-feasibility': 'savingsFeasibility',
  'savings-over': 'savingsOver',
  'streak-ok': 'streakOk',
  'positive-forecast': 'positiveForecast',
  'high-single-expense': 'highSingleExpense',
  duplicate: 'duplicate',
  'data-gap-warning': 'dataGapWarning',
  'savings-milestone': 'savingsMilestone',
  'cycle-start-projection': 'cycleStartProjection',
  'forecast-tomorrow-risk': 'forecastTomorrowRisk',
  'forecast-storm-week': 'forecastStormWeek',
  'forecast-payday-gap': 'forecastPaydayGap',
  'income-missing': 'incomeMissing',
  causal: 'causal',
  'super-perfect-storm': 'superPerfectStorm',
  'super-savings-momentum': 'superSavingsMomentum',
  'super-hidden-drain': 'superHiddenDrain',
}

function familyLabel(family: string): string {
  const key = FAMILY_I18N_KEYS[family]
  return key ? i18n.t(`settings:signalFamily.${key}`) : family
}

// CTR → frase en lenguaje natural (decisión owner 2026-06-15: nada de
// porcentajes crudos, que se sienten fríos / invitan a "gamear" el número).
function engagementPhrase(ctr: number, acted: number): string {
  if (acted === 0) return i18n.t('settings:engagement.never')
  if (ctr >= 0.5) return i18n.t('settings:engagement.often')
  if (ctr >= 0.2) return i18n.t('settings:engagement.sometimes')
  return i18n.t('settings:engagement.rarely')
}

// El mismo dato como ícono de tendencia: refuerza "le haces caso / no" de un
// vistazo, sin pedir leer.
function engagementIcon(ctr: number, acted: number): IconName {
  if (acted === 0) return 'remove'
  if (ctr >= 0.5) return 'trending-up'
  if (ctr >= 0.2) return 'trending-flat'
  return 'trending-down'
}

// Mínimo de muestras para que una familia entre en "Tus avisos" (evita
// mostrar ruido con 1-2 apariciones).
const MIN_FAMILY_SAMPLE = 3
const TOP_FAMILIES = 5

// Personas elegibles a mano, en orden, con su ícono.
const PERSONA_PICKS: { value: UserPersona; icon: IconName }[] = [
  { value: 'planner', icon: 'fact-check' },
  { value: 'firefighter', icon: 'bolt' },
  { value: 'avoider', icon: 'spa' },
  { value: 'optimizer', icon: 'trending-up' },
]
const PERSONA_ICON: Record<UserPersona, IconName> = {
  planner: 'fact-check',
  firefighter: 'bolt',
  avoider: 'spa',
  optimizer: 'trending-up',
}

// Umbral de urgencia que dispara push (orden baja<media<alta) → frase llana.
const URGENCY_VALUES: AdvisorPushUrgency[] = ['alta', 'media', 'baja']
const URGENCY_KEY: Record<AdvisorPushUrgency, string> = {
  alta: 'high',
  media: 'medium',
  baja: 'low',
}

function urgencyLabel(value: AdvisorPushUrgency): string {
  return i18n.t(`settings:urgency.${URGENCY_KEY[value]}.label`)
}

function formatHour(h: number): string {
  return `${String(h).padStart(2, '0')}:00`
}

export function AsistentePreferencesScreen({ userId }: Props) {
  const { theme } = useAppTheme()
  const neo = neoTokens(theme.isDark ? 'dark' : 'light')
  const ink = neoInk(theme.isDark ? 'dark' : 'light')
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const statsQuery = useInteractionStats(userId)
  const blocklistQuery = useSignalBlocklistEntries(userId)
  const unblockMutation = useUnblockSignalFamily()

  const valueQuery = useAdvisorValueSummary(userId)
  const advisorPrefsQuery = useAdvisorPreferences()
  const updatePrefs = useUpdateAdvisorPreferences()
  const prefs = advisorPrefsQuery.data ?? ADVISOR_PREFERENCES_DEFAULTS

  const inferredPersona = statsQuery.data ? inferPersona(statsQuery.data) : 'planner'
  // Persona efectiva: override manual gana sobre la inferencia.
  const effectivePersona: UserPersona =
    !prefs.useInferredPersona && prefs.personaOverride
      ? prefs.personaOverride
      : inferredPersona
  const personaProfile = PERSONA_PROFILES[effectivePersona]
  const totalShown = statsQuery.data?.overall.totalShown ?? 0

  const handleToggleInferred = useCallback(
    (next: boolean) => {
      // Al pasar a manual sin override previo, sembramos el override con la
      // persona inferida actual para que el control quede seleccionado.
      updatePrefs.mutate(
        next || prefs.personaOverride
          ? { useInferredPersona: next }
          : { useInferredPersona: next, personaOverride: inferredPersona },
      )
    },
    [updatePrefs, prefs.personaOverride, inferredPersona],
  )

  const handleSelectPersona = useCallback(
    (p: UserPersona) => {
      void triggerHaptic('selection')
      updatePrefs.mutate({ personaOverride: p, useInferredPersona: false })
    },
    [updatePrefs],
  )

  // ── Notificaciones del asistente (notification_preferences) ──
  const notifPrefsQuery = useNotificationPreferences()
  const updateNotifPrefs = useUpdateNotificationPreferences()
  const notifPrefs = notifPrefsQuery.data
  const [quietPicker, setQuietPicker] = useState<'start' | 'end' | null>(null)
  const [urgencyOpen, setUrgencyOpen] = useState(false)

  const advisorEnabled = prefs.advisorEnabled
  const pushEnabled = notifPrefs?.advisorPushEnabled ?? true
  const quietStart = notifPrefs?.advisorQuietStart ?? 22
  const quietEnd = notifPrefs?.advisorQuietEnd ?? 8
  const minUrgency: AdvisorPushUrgency = notifPrefs?.advisorPushMinUrgency ?? 'alta'

  // El carrusel commitea al asentar (mientras el usuario explora); solo
  // actualiza el valor, NO cierra. El usuario cierra con "Listo". El haptic
  // por hora lo dispara el propio carrusel.
  const handleSetQuietHour = useCallback(
    (hour: number) => {
      updateNotifPrefs.mutate(
        quietPicker === 'start' ? { advisorQuietStart: hour } : { advisorQuietEnd: hour },
      )
    },
    [quietPicker, updateNotifPrefs],
  )

  const handlePickUrgency = useCallback(
    (value: AdvisorPushUrgency) => {
      void triggerHaptic('selection')
      updateNotifPrefs.mutate({ advisorPushMinUrgency: value })
      setUrgencyOpen(false)
    },
    [updateNotifPrefs],
  )

  // #1 Card de valor: solo si hay ahorro realizado (decisión: ocultar si 0
  // para no mostrar un $0 desmotivador). saved_quarter ≥ saved_month siempre.
  const value = valueQuery.data
  const showValueCard = Boolean(value && value.savedQuarter > 0)

  // "Tus avisos": top familias por CTR con muestra mínima. Oculta hasta
  // calibrar (mismo umbral de 10 que el footnote de la persona).
  const topFamilies = useMemo(() => {
    const perFamily = statsQuery.data?.perFamily
    if (!perFamily) return []
    return Object.entries(perFamily)
      .filter(([, s]) => s.shown >= MIN_FAMILY_SAMPLE)
      .sort((a, b) => b[1].ctr - a[1].ctr || b[1].shown - a[1].shown)
      .slice(0, TOP_FAMILIES)
  }, [statsQuery.data])
  const showStats = totalShown >= 10 && topFamilies.length > 0

  const blocklist = blocklistQuery.data ?? []

  const handleUnblock = useCallback(
    (family: string) => {
      void (async () => {
        const confirmed = await neoConfirm(t('settings:asistente.unblockTitle'), {
          confirmLabel: t('settings:asistente.unblockConfirm'),
          message: t('settings:asistente.unblockMessage', { label: familyLabel(family) }),
        })
        if (!confirmed) return
        void triggerHaptic('selection')
        unblockMutation.mutate(
          { userId, family },
          {
            onError: () => {
              void triggerHaptic('error')
              toast.error(t('settings:asistente.unblockErrorMessage'))
            },
          },
        )
      })()
    },
    [userId, unblockMutation, t],
  )

  const handleClearHistory = useCallback(() => {
    void (async () => {
      const confirmed = await neoConfirm(t('settings:asistente.clearTitle'), {
        confirmLabel: t('settings:asistente.clearConfirm'),
        message: t('settings:asistente.clearMessage'),
        tone: 'destructive',
      })
      if (!confirmed) return
      void triggerHaptic('warning')
            try {
              const { error } = await supabase
                .from('advisor_interactions')
                .delete()
                .eq('user_id', userId)
              if (error) throw error
              // Key shape real es `['advisor-interaction-stats', userId
              // ?? null]` (ver use-interaction-stats). Pasar el userId
              // hace el invalidate target-only en vez de prefix-match.
              queryClient.invalidateQueries({
                queryKey: ['advisor-interaction-stats', userId ?? null],
              })
      toast.success(t('settings:asistente.clearedMessage'))
      } catch {
        toast.error(t('settings:asistente.clearErrorMessage'))
      }
    })()
  }, [userId, queryClient, t])

  // Footnote de "Tu estilo" según el modo.
  const styleFooter = prefs.useInferredPersona
    ? totalShown < 10
      ? t('settings:asistente.styleFooterLearning')
      : t('settings:asistente.styleFooterAuto')
    : t('settings:asistente.styleFooterManual')

  return (
    <Screen
      backgroundColor={neo.bg}
      titleColor={neo.text}
      title={t('settings:asistente.title')}
      subtitle={t('settings:asistente.subtitle')}
      canGoBack
    >
      <AmbientBlobs tone={theme.isDark ? 'calm' : 'aurora'} />

      {showValueCard && value ? (
        <RiseView delay={40} style={styles.block}>
          <Text style={[styles.eyebrow, { color: neo.textMuted }]}>{t('settings:asistente.valueEyebrow')}</Text>
          <View style={[styles.heroCard, { backgroundColor: neo.selectedTint }]}>
            <View style={styles.heroRow}>
              <View style={[styles.heroIcon, { backgroundColor: neo.well, boxShadow: neo.shadows.insetSm }]}>
                <MaterialIcons name="savings" size={22} color={ink.accent} />
              </View>
              <View style={styles.heroText}>
                <Text style={[styles.heroAmount, { color: neo.text }]}>
                  {formatMoney(value.savedQuarter)}
                </Text>
                <Text style={[styles.heroCaption, { color: neo.textMuted }]}>
                  {t('settings:asistente.thisQuarter')}
                </Text>
              </View>
            </View>
            <Text style={[styles.heroFootnote, { color: neo.textMuted }]}>
              {`${t('settings:asistente.savedThisMonth', { amount: formatMoney(value.savedMonth) })} · ${t('settings:asistente.actionsCount', { count: value.totalActions })} · ${t('settings:asistente.signalTypesCount', { count: value.distinctFamilies })}`}
            </Text>
          </View>
        </RiseView>
      ) : null}

      {/* 1. Controles: encender el asistente y sus notificaciones. */}
      <RiseView delay={80} style={styles.block}>
        <SettingsGroup
          title={t('settings:asistente.alertsGroup')}
          footer={
            advisorEnabled && pushEnabled
              ? t('settings:asistente.alertsFooter')
              : undefined
          }
        >
          <SettingsSwitchRow
            icon="auto-awesome"
            label={t('settings:asistente.advisorLabel')}
            helper={t('settings:asistente.advisorHelper')}
            value={advisorEnabled}
            onValueChange={(v) => updatePrefs.mutate({ advisorEnabled: v })}
            isLast={!advisorEnabled}
          />
          {advisorEnabled ? (
            <>
              <SettingsSwitchRow
                icon="notifications"
                label={t('settings:asistente.pushLabel')}
                helper={t('settings:asistente.pushHelper')}
                value={pushEnabled}
                onValueChange={(v) => updateNotifPrefs.mutate({ advisorPushEnabled: v })}
                isLast={!pushEnabled}
              />
              {pushEnabled ? (
                <>
                  <SettingsRow
                    icon="tune"
                    label={t('settings:asistente.whenLabel')}
                    value={urgencyLabel(minUrgency)}
                    onPress={() => setUrgencyOpen(true)}
                  />
                  <SettingsRow
                    icon="bedtime"
                    label={t('settings:asistente.quietFrom')}
                    value={formatHour(quietStart)}
                    onPress={() => setQuietPicker('start')}
                  />
                  <SettingsRow
                    icon="wb-twilight"
                    label={t('settings:asistente.quietUntil')}
                    value={formatHour(quietEnd)}
                    onPress={() => setQuietPicker('end')}
                    isLast
                  />
                </>
              ) : null}
            </>
          ) : null}
        </SettingsGroup>
      </RiseView>

      {/* 2. Tu estilo: automático (resumen) o elegido a mano (checklist). */}
      <RiseView delay={140} style={styles.block}>
        <SettingsGroup title={t('settings:asistente.styleGroup')} footer={styleFooter}>
          <SettingsSwitchRow
            icon="auto-fix-high"
            label={t('settings:asistente.styleAutoLabel')}
            helper={t('settings:asistente.styleAutoHelper')}
            value={prefs.useInferredPersona}
            onValueChange={handleToggleInferred}
          />
          {prefs.useInferredPersona ? (
            <SettingsRow
              icon={PERSONA_ICON[effectivePersona]}
              label={personaProfile.label}
              helper={personaProfile.description}
              isLast
            />
          ) : (
            PERSONA_PICKS.map((p, i) => {
              const selected = p.value === effectivePersona
              return (
                <SettingsRow
                  key={p.value}
                  icon={p.icon}
                  label={PERSONA_PROFILES[p.value].label}
                  helper={PERSONA_PROFILES[p.value].description}
                  onPress={() => handleSelectPersona(p.value)}
                  isLast={i === PERSONA_PICKS.length - 1}
                  trailing={
                    <MaterialIcons
                      name={selected ? 'check-circle' : 'radio-button-unchecked'}
                      size={22}
                      color={selected ? ink.accent : neo.textMuted}
                    />
                  }
                />
              )
            })
          )}
        </SettingsGroup>
      </RiseView>

      {/* 3. Tus avisos: solo lectura, a cuáles les haces caso. */}
      {showStats ? (
        <RiseView delay={200} style={styles.block}>
          <SettingsGroup title={t('settings:asistente.yourAlertsGroup')} footer={t('settings:asistente.yourAlertsFooter')}>
            {topFamilies.map(([family, s], i) => (
              <SettingsRow
                key={family}
                icon={engagementIcon(s.ctr, s.acted)}
                label={familyLabel(family)}
                value={engagementPhrase(s.ctr, s.acted)}
                isLast={i === topFamilies.length - 1}
              />
            ))}
          </SettingsGroup>
        </RiseView>
      ) : null}

      {/* 4. Avisos ocultados. */}
      <RiseView delay={260} style={styles.block}>
        <SettingsGroup
          title={t('settings:asistente.hiddenGroup')}
          footer={
            blocklist.length > 0
              ? t('settings:asistente.hiddenFooterSome')
              : t('settings:asistente.hiddenFooterNone')
          }
        >
          {blocklist.length > 0 ? (
            blocklist.map((entry, i) => (
              <SettingsRow
                key={entry.signal_family}
                icon="visibility-off"
                label={familyLabel(entry.signal_family)}
                helper={entry.reason ?? undefined}
                onPress={() => handleUnblock(entry.signal_family)}
                isLast={i === blocklist.length - 1}
              />
            ))
          ) : (
            <SettingsRow icon="visibility" label={t('settings:asistente.noneHidden')} isLast />
          )}
        </SettingsGroup>
      </RiseView>

      {/* 5. Privacidad. */}
      <RiseView delay={320} style={styles.block}>
        <SettingsGroup
          title={t('settings:asistente.privacyGroup')}
          footer={t('settings:asistente.privacyFooter')}
        >
          <SettingsRow
            icon="delete-outline"
            label={t('settings:asistente.clearRowLabel')}
            destructive
            onPress={handleClearHistory}
            isLast
          />
        </SettingsGroup>
      </RiseView>

      <HourPickerSheet
        visible={quietPicker !== null}
        title={quietPicker === 'start' ? t('settings:asistente.quietFrom') : t('settings:asistente.quietUntil')}
        value={quietPicker === 'start' ? quietStart : quietEnd}
        instanceKey={quietPicker ?? 'closed'}
        onChange={handleSetQuietHour}
        onClose={() => setQuietPicker(null)}
        accessibilityLabel={
          quietPicker === 'start' ? t('settings:asistente.quietFromA11y') : t('settings:asistente.quietUntilA11y')
        }
      />

      <ModalCard
        skin="neo"
        visible={urgencyOpen}
        title={t('settings:asistente.urgencyModalTitle')}
        onClose={() => setUrgencyOpen(false)}
      >
        <View style={styles.optionList}>
          {URGENCY_VALUES.map((urgencyValue) => {
            const selected = urgencyValue === minUrgency
            const optKey = URGENCY_KEY[urgencyValue]
            return (
              <Pressable
                key={urgencyValue}
                onPress={() => handlePickUrgency(urgencyValue)}
                style={({ pressed }) => [
                  styles.urgencyOption,
                  {
                    borderColor: selected ? ink.accent : neo.sheetDivider,
                    backgroundColor: selected ? neo.selectedTint : 'transparent',
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <View style={styles.urgencyCopy}>
                  <Text style={[styles.optionLabel, { color: neo.text }]}>
                    {t(`settings:urgency.${optKey}.label`)}
                  </Text>
                  <Text style={[styles.urgencyHelper, { color: neo.textMuted }]}>
                    {t(`settings:urgency.${optKey}.helper`)}
                  </Text>
                </View>
                {selected ? (
                  <MaterialIcons name="check-circle" size={22} color={ink.accent} />
                ) : null}
              </Pressable>
            )
          })}
        </View>
      </ModalCard>
    </Screen>
  )
}

const styles = StyleSheet.create({
  // Separación entre bloques (cada RiseView). Se suma al gap del Screen.
  block: { marginTop: 6, gap: 8 },
  eyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.6,
    paddingHorizontal: 4,
  },
  // Card hero del valor — tinte de marca + número grande como ancla visual.
  heroCard: {
    borderRadius: radii.xl,
    padding: 20,
    gap: 12,
  },
  heroRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  heroIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroText: { flex: 1, gap: 2 },
  heroAmount: { fontSize: 30, fontWeight: '800', letterSpacing: -0.6 },
  heroCaption: { fontSize: 13, lineHeight: 18 },
  heroFootnote: { fontSize: 12, lineHeight: 16 },
  // Lista de opciones dentro del ModalCard de nivel de aviso.
  optionList: { paddingVertical: 4, gap: 2 },
  optionLabel: { fontSize: 15, fontWeight: '600' },
  urgencyOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: radii.lg,
    borderWidth: 1,
  },
  urgencyCopy: { flex: 1, gap: 3 },
  urgencyHelper: { fontSize: 13, lineHeight: 18 },
})
