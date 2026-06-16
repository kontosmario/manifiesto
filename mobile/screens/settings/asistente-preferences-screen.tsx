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
//  3. Tus avisos: resumen de a cuáles les hacés caso (solo lectura).
//  4. "Avisos que ocultaste" = `user_signal_blocklist` rows + unblock.
//  5. "Borrar lo que aprendió de mí": hard delete of own
//     `advisor_interactions` rows (gated by RLS — `delete_own` policy,
//     migration 20260501010000).

import { useCallback, useMemo, useState } from 'react'
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'

import { Screen } from '@/components/ui/screen'
import { ModalCard } from '@/components/ui/modal-card'
import { HourStripSlider } from '@/components/ui/hour-strip-slider'
import { RiseView } from '@/components/home/animated/rise-view'
import { AmbientBlobs } from '@/components/home/ambient-blobs'
import {
  SettingsGroup,
  SettingsRow,
  SettingsSwitchRow,
} from '@/components/settings/settings-grouped-list'
import { triggerHaptic } from '@/lib/haptics'
import { supabase } from '@/lib/supabase'
import { formatMoney } from '@/utils/money'
import { useAppTheme } from '@/theme/theme-provider'
import { DARK_TAB_CANVAS, radii } from '@/theme/palette'

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
const FAMILY_LABELS: Record<string, string> = {
  velocity: 'Estás gastando más rápido',
  'recovery-hard': 'Volver a encarrilar el mes',
  'recovery-soft': 'Un ajuste chico del mes',
  'fijos-ratio': 'Tus pagos fijos pesan mucho',
  'small-leaks': 'Gastos chicos que suman',
  'night-impulse': 'Compras de noche',
  'weekly-pattern': 'Un día que gastás más',
  zombie: 'Servicios que pagás y no usás',
  hike: 'Algo que te aumentó',
  'undetected-sub': 'Pagos que se repiten cada mes',
  cap: 'Límites que te pusiste',
  'cat-dominance': 'Dónde se va casi toda tu plata',
  'cat-accel': 'Una categoría que se disparó',
  'cat-win': 'Dónde gastaste menos',
  'member-imbalance': 'Quién gasta más en casa',
  'savings-feasibility': '¿Llegás a tu meta de ahorro?',
  'savings-over': 'Vas adelantado con el ahorro',
  'streak-ok': 'Venís anotando todos los días',
  'positive-forecast': 'Te va a sobrar plata',
  'high-single-expense': 'Una compra grande puntual',
  duplicate: 'Te cobraron dos veces',
  'data-gap-warning': 'Días que no anotaste nada',
  'savings-milestone': 'Logros de tu ahorro',
  'cycle-start-projection': 'Cómo arranca tu mes',
  'forecast-tomorrow-risk': 'Cuidado con mañana',
  'forecast-storm-week': 'Semana con varios pagos',
  'forecast-payday-gap': 'Plata hasta el próximo cobro',
  'income-missing': 'Un cobro que falta confirmar',
  causal: 'Costumbres que te hacen gastar',
  'super-perfect-storm': 'Varias cosas juntas para cuidar',
  'super-savings-momentum': 'Venís ahorrando bien',
  'super-hidden-drain': 'Plata que se te va sin notarlo',
}

function familyLabel(family: string): string {
  return FAMILY_LABELS[family] ?? family
}

// CTR → frase en lenguaje natural (decisión owner 2026-06-15: nada de
// porcentajes crudos, que se sienten fríos / invitan a "gamear" el número).
function engagementPhrase(ctr: number, acted: number): string {
  if (acted === 0) return 'todavía no'
  if (ctr >= 0.5) return 'seguido'
  if (ctr >= 0.2) return 'a veces'
  return 'rara vez'
}

// El mismo dato como ícono de tendencia: refuerza "le hacés caso / no" de un
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
const URGENCY_OPTIONS: { value: AdvisorPushUrgency; label: string; helper: string }[] = [
  { value: 'alta', label: 'Solo urgencias', helper: 'Solo lo que no puede esperar.' },
  { value: 'media', label: 'Importantes', helper: 'Las urgencias y los cambios que conviene saber.' },
  { value: 'baja', label: 'Todo', helper: 'Cualquier aviso, apenas pasa.' },
]

function urgencyLabel(value: AdvisorPushUrgency): string {
  return URGENCY_OPTIONS.find((o) => o.value === value)?.label ?? 'Todo'
}

function formatHour(h: number): string {
  return `${String(h).padStart(2, '0')}:00`
}

export function AsistentePreferencesScreen({ userId }: Props) {
  const { theme } = useAppTheme()
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

  const handlePickQuietHour = useCallback(
    (hour: number) => {
      void triggerHaptic('selection')
      updateNotifPrefs.mutate(
        quietPicker === 'start' ? { advisorQuietStart: hour } : { advisorQuietEnd: hour },
      )
      setQuietPicker(null)
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
      Alert.alert(
        'Volver a mostrar este aviso',
        `"${familyLabel(family)}" va a volver a aparecer cuando haga falta.`,
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Mostrar de nuevo',
            onPress: () => {
              void triggerHaptic('selection')
              unblockMutation.mutate(
                { userId, family },
                {
                  onError: () => {
                    void triggerHaptic('error')
                    Alert.alert('No pudimos mostrarlo', 'Probá de nuevo en unos segundos.')
                  },
                },
              )
            },
          },
        ],
        { cancelable: true },
      )
    },
    [userId, unblockMutation],
  )

  const handleClearHistory = useCallback(() => {
    Alert.alert(
      'Borrar lo que el asistente aprendió',
      'Borra todo lo que el asistente fue aprendiendo de cómo usás la app. Va a arrancar de cero y tratarte como a alguien nuevo hasta volver a conocerte. No se puede deshacer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Borrar',
          style: 'destructive',
          onPress: async () => {
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
              Alert.alert('Listo', 'El asistente arranca de cero.')
            } catch {
              Alert.alert('No pudimos borrar', 'Probá de nuevo. Si sigue igual, escribinos.')
            }
          },
        },
      ],
      { cancelable: true },
    )
  }, [userId, queryClient])

  // Footnote de "Tu estilo" según el modo.
  const styleFooter = prefs.useInferredPersona
    ? totalShown < 10
      ? 'Recién te empiezo a conocer. Con el uso me ajusto a cómo manejás tu plata.'
      : 'Lo elegí mirando cómo venís usando la app. Si querés, cambialo vos.'
    : 'Lo elegiste vos. Tocá otro para cambiarlo, o volvé a automático arriba.'

  return (
    <Screen
      backgroundColor={theme.isDark ? DARK_TAB_CANVAS : undefined}
      title="Asistente"
      subtitle="Cómo te avisa y qué mira primero"
      canGoBack
    >
      <AmbientBlobs tone={theme.isDark ? 'calm' : 'aurora'} />

      {showValueCard && value ? (
        <RiseView delay={40} style={styles.block}>
          <Text style={[styles.eyebrow, { color: theme.colors.textMuted }]}>LO QUE TE AHORRÉ</Text>
          <View style={[styles.heroCard, { backgroundColor: theme.colors.primarySurface }]}>
            <View style={styles.heroRow}>
              <View style={[styles.heroIcon, { backgroundColor: theme.colors.surface }]}>
                <MaterialIcons name="savings" size={22} color={theme.colors.primary} />
              </View>
              <View style={styles.heroText}>
                <Text style={[styles.heroAmount, { color: theme.colors.text }]}>
                  {formatMoney(value.savedQuarter)}
                </Text>
                <Text style={[styles.heroCaption, { color: theme.colors.textSoft }]}>
                  este trimestre
                </Text>
              </View>
            </View>
            <Text style={[styles.heroFootnote, { color: theme.colors.textSoft }]}>
              {`${formatMoney(value.savedMonth)} este mes · ${value.totalActions} ${value.totalActions === 1 ? 'acción' : 'acciones'} · ${value.distinctFamilies} ${value.distinctFamilies === 1 ? 'tipo' : 'tipos'} de aviso`}
            </Text>
          </View>
        </RiseView>
      ) : null}

      {/* 1. Controles: encender el asistente y sus notificaciones. */}
      <RiseView delay={80} style={styles.block}>
        <SettingsGroup
          title="Avisos"
          footer={
            advisorEnabled && pushEnabled
              ? 'Entre las horas de "no molestar" no te llega nada al celular.'
              : undefined
          }
        >
          <SettingsSwitchRow
            icon="auto-awesome"
            label="Asistente financiero"
            helper="Si lo apagás, deja de darte avisos y consejos."
            value={advisorEnabled}
            onValueChange={(v) => updatePrefs.mutate({ advisorEnabled: v })}
            isLast={!advisorEnabled}
          />
          {advisorEnabled ? (
            <>
              <SettingsSwitchRow
                icon="notifications"
                label="Notificaciones en el celular"
                helper="Si lo apagás, los avisos aparecen solo cuando abrís la app."
                value={pushEnabled}
                onValueChange={(v) => updateNotifPrefs.mutate({ advisorPushEnabled: v })}
                isLast={!pushEnabled}
              />
              {pushEnabled ? (
                <>
                  <SettingsRow
                    icon="tune"
                    label="¿Cuándo te aviso?"
                    value={urgencyLabel(minUrgency)}
                    onPress={() => setUrgencyOpen(true)}
                  />
                  <SettingsRow
                    icon="bedtime"
                    label="No molestar desde"
                    value={formatHour(quietStart)}
                    onPress={() => setQuietPicker('start')}
                  />
                  <SettingsRow
                    icon="wb-twilight"
                    label="Volver a avisar a las"
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
        <SettingsGroup title="Tu estilo" footer={styleFooter}>
          <SettingsSwitchRow
            icon="auto-fix-high"
            label="Elegir el estilo por mí"
            helper="Si lo apagás, lo elegís vos abajo."
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
                      color={selected ? theme.colors.primary : theme.colors.textSoft}
                    />
                  }
                />
              )
            })
          )}
        </SettingsGroup>
      </RiseView>

      {/* 3. Tus avisos: solo lectura, a cuáles les hacés caso. */}
      {showStats ? (
        <RiseView delay={200} style={styles.block}>
          <SettingsGroup title="Tus avisos" footer="Cuánto le hacés caso a cada tipo.">
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
          title="Avisos que ocultaste"
          footer={
            blocklist.length > 0
              ? 'Tocá uno para que ese aviso vuelva a aparecer.'
              : 'Si ocultás un tipo de aviso, aparece acá.'
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
            <SettingsRow icon="visibility" label="No ocultaste ningún aviso" isLast />
          )}
        </SettingsGroup>
      </RiseView>

      {/* 5. Privacidad. */}
      <RiseView delay={320} style={styles.block}>
        <SettingsGroup
          title="Privacidad"
          footer="Lo que hacés en la app se usa solo para que el asistente te conozca mejor. No lo compartimos."
        >
          <SettingsRow
            icon="delete-outline"
            label="Borrar lo que aprendió de mí"
            destructive
            onPress={handleClearHistory}
            isLast
          />
        </SettingsGroup>
      </RiseView>

      <ModalCard
        visible={quietPicker !== null}
        title={quietPicker === 'start' ? 'No molestar desde' : 'Volver a avisar a las'}
        onClose={() => setQuietPicker(null)}
      >
        <View style={styles.sliderWrap}>
          <HourStripSlider
            value={quietPicker === 'start' ? quietStart : quietEnd}
            onChange={handlePickQuietHour}
            accessibilityLabel={
              quietPicker === 'start' ? 'Hora de inicio del no molestar' : 'Hora de volver a avisar'
            }
          />
        </View>
      </ModalCard>

      <ModalCard
        visible={urgencyOpen}
        title="¿Cuándo te aviso al celular?"
        onClose={() => setUrgencyOpen(false)}
      >
        <View style={styles.optionList}>
          {URGENCY_OPTIONS.map((opt) => {
            const selected = opt.value === minUrgency
            return (
              <Pressable
                key={opt.value}
                onPress={() => handlePickUrgency(opt.value)}
                style={({ pressed }) => [
                  styles.urgencyOption,
                  {
                    borderColor: selected ? theme.colors.primary : theme.colors.border,
                    backgroundColor: selected ? theme.colors.primarySurface : 'transparent',
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <View style={styles.urgencyCopy}>
                  <Text style={[styles.optionLabel, { color: theme.colors.text }]}>
                    {opt.label}
                  </Text>
                  <Text style={[styles.urgencyHelper, { color: theme.colors.textMuted }]}>
                    {opt.helper}
                  </Text>
                </View>
                {selected ? (
                  <MaterialIcons name="check-circle" size={22} color={theme.colors.primary} />
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
  // Slider de horas (no molestar) dentro del ModalCard.
  sliderWrap: { paddingVertical: 8 },
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
