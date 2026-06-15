// Asistente Financiero — preferences screen.
//
// Three controls in one place:
//
//  1. Persona (planner / firefighter / avoider / optimizer):
//     read-only inferred persona + override (just an explanation
//     today; the override write-path lands when we add a
//     `user_advisor_prefs` table or when persona becomes a
//     local-stored override).
//
//  2. Familias bloqueadas: list of `user_signal_blocklist` rows
//     with an unblock CTA each.
//
//  3. Borrar mi historial: hard delete of own
//     `advisor_interactions` rows (gated by RLS — requires the
//     `delete_own` policy from migration 20260501010000).

import { useCallback, useMemo } from 'react'
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'

import { Screen } from '@/components/ui/screen'
import { SectionHeader } from '@/components/ui/section-header'
import { RiseView } from '@/components/home/animated/rise-view'
import { AmbientBlobs } from '@/components/home/ambient-blobs'
import { triggerHaptic } from '@/lib/haptics'
import { supabase } from '@/lib/supabase'
import { formatMoney } from '@/utils/money'
import { useAppTheme } from '@/theme/theme-provider'
import { DARK_TAB_CANVAS, radii } from '@/theme/palette'

import { useInteractionStats } from '@/features/insights/use-interaction-stats'
import { useAdvisorValueSummary } from '@/features/insights/use-advisor-value-summary'
import { inferPersona, PERSONA_PROFILES } from '@/features/insights/persona'
import {
  useSignalBlocklistEntries,
  useUnblockSignalFamily,
} from '@/features/insights/use-signal-blocklist'
import { useQueryClient } from '@tanstack/react-query'

interface Props {
  userId: string
}

const FAMILY_LABELS: Record<string, string> = {
  velocity: 'Ritmo del mes',
  'recovery-hard': 'Recuperación urgente',
  'recovery-soft': 'Recuperación moderada',
  'fijos-ratio': 'Fijos altos',
  'small-leaks': 'Filtraciones chicas',
  'night-impulse': 'Impulsos nocturnos',
  'weekly-pattern': 'Patrón semanal',
  zombie: 'Suscripciones zombie',
  hike: 'Subas de precio',
  'undetected-sub': 'Posibles suscripciones',
  cap: 'Topes de categoría',
  'cat-dominance': 'Categoría dominante',
  'cat-accel': 'Aceleración de categoría',
  'cat-win': 'Categorías a favor',
  'member-imbalance': 'Balance familiar',
  'savings-feasibility': 'Plan de meta',
  'savings-over': 'Adelanto del plan',
  'streak-ok': 'Racha sostenida',
  'positive-forecast': 'Excedente proyectado',
  'high-single-expense': 'Gastos únicos altos',
  duplicate: 'Cargos duplicados',
  'data-gap-warning': 'Días sin registros',
  'savings-milestone': 'Hitos de meta',
  'cycle-start-projection': 'Inicio del mes',
  'forecast-tomorrow-risk': 'Riesgo de mañana',
  'forecast-storm-week': 'Semana cargada',
  'forecast-payday-gap': 'Hasta cobro',
  'income-missing': 'Cobro no confirmado',
  causal: 'Patrones causales',
  'super-perfect-storm': 'Confluencias críticas',
  'super-savings-momentum': 'Momentum positivo',
  'super-hidden-drain': 'Drenajes invisibles',
}

function familyLabel(family: string): string {
  return FAMILY_LABELS[family] ?? family
}

// CTR → frase en lenguaje natural (decisión owner 2026-06-15: nada de
// porcentajes crudos, que se sienten fríos / invitan a "gamear" el número).
function engagementPhrase(ctr: number, acted: number): string {
  if (acted === 0) return 'todavía no'
  if (ctr >= 0.5) return 'actuás seguido'
  if (ctr >= 0.2) return 'a veces'
  return 'rara vez'
}

// Mínimo de muestras para que una familia entre en "Tus señales" (evita
// mostrar ruido con 1-2 apariciones).
const MIN_FAMILY_SAMPLE = 3
const TOP_FAMILIES = 5

export function AsistentePreferencesScreen({ userId }: Props) {
  const { theme } = useAppTheme()
  const queryClient = useQueryClient()
  const statsQuery = useInteractionStats(userId)
  const blocklistQuery = useSignalBlocklistEntries(userId)
  const unblockMutation = useUnblockSignalFamily()

  const valueQuery = useAdvisorValueSummary(userId)

  const persona = statsQuery.data ? inferPersona(statsQuery.data) : 'planner'
  const personaProfile = PERSONA_PROFILES[persona]
  const totalShown = statsQuery.data?.overall.totalShown ?? 0

  // #1 Card de valor: solo si hay ahorro realizado (decisión: ocultar si 0
  // para no mostrar un $0 desmotivador). saved_quarter ≥ saved_month siempre.
  const value = valueQuery.data
  const showValueCard = Boolean(value && value.savedQuarter > 0)

  // #3 "Tus señales": top familias por CTR con muestra mínima. Oculta hasta
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

  const handleUnblock = useCallback(
    (family: string) => {
      Alert.alert(
        'Volver a mostrar',
        `${familyLabel(family)} va a empezar a aparecer cuando el patrón se detecte.`,
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Desbloquear',
            onPress: () => {
              void triggerHaptic('selection')
              unblockMutation.mutate(
                { userId, family },
                {
                  onError: () => {
                    void triggerHaptic('error')
                    Alert.alert(
                      'No pudimos desbloquear',
                      'Prueba de nuevo en unos segundos.',
                    )
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
      'Borrar historial del asistente',
      'Esto borra el registro de interacciones (lo que viste, lo que actuaste, lo que descartaste). El asistente vuelve a "modo planner" hasta acumular datos nuevos. La acción no se puede deshacer.',
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
              // hace el invalidate target-only en vez de prefix-match,
              // que era el intent original. Code review screens-B6.
              queryClient.invalidateQueries({
                queryKey: ['advisor-interaction-stats', userId ?? null],
              })
              Alert.alert('Listo', 'Tu historial fue borrado.')
            } catch {
              Alert.alert(
                'No pudimos borrar',
                'Si el problema persiste, escribinos para intervenir manualmente.',
              )
            }
          },
        },
      ],
      { cancelable: true },
    )
  }, [userId, queryClient])

  return (
    <Screen
      backgroundColor={theme.isDark ? DARK_TAB_CANVAS : undefined}
      title="Asistente"
      subtitle="Cómo se comporta y qué patrones priorizar"
      canGoBack
    >
      <AmbientBlobs tone={theme.isDark ? 'calm' : 'aurora'} />

      {showValueCard && value ? (
        <RiseView delay={40}>
          <SectionHeader title="Lo que te ahorré" />
          <View
            style={[
              styles.card,
              { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
            ]}
          >
            <View style={styles.cardRow}>
              <View style={[styles.iconWrap, { backgroundColor: theme.colors.primarySurface }]}>
                <MaterialIcons name="savings" size={20} color={theme.colors.primary} />
              </View>
              <View style={styles.cardText}>
                <Text style={[styles.valueAmount, { color: theme.colors.text }]}>
                  {formatMoney(value.savedQuarter)}
                </Text>
                <Text style={[styles.cardBody, { color: theme.colors.textSoft }]}>
                  este trimestre
                </Text>
              </View>
            </View>
            <Text style={[styles.cardFootnote, { color: theme.colors.textMuted }]}>
              {`${formatMoney(value.savedMonth)} este mes · ${value.totalActions} ${value.totalActions === 1 ? 'acción' : 'acciones'} · ${value.distinctFamilies} ${value.distinctFamilies === 1 ? 'tipo' : 'tipos'} de señal`}
            </Text>
          </View>
        </RiseView>
      ) : null}

      <RiseView delay={80}>
        <SectionHeader title="Perfil inferido" />
        <View
          style={[
            styles.card,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
          ]}
        >
          <View style={styles.cardRow}>
            <View style={[styles.iconWrap, { backgroundColor: theme.colors.primarySurface }]}>
              <MaterialIcons name="auto-awesome" size={20} color={theme.colors.primary} />
            </View>
            <View style={styles.cardText}>
              <Text style={[styles.cardTitle, { color: theme.colors.text }]}>
                {personaProfile.label}
              </Text>
              <Text style={[styles.cardBody, { color: theme.colors.textSoft }]}>
                {personaProfile.description}
              </Text>
            </View>
          </View>
          <Text style={[styles.cardFootnote, { color: theme.colors.textMuted }]}>
            {totalShown < 10
              ? `Inferencia preliminar (${totalShown} interacción${totalShown === 1 ? '' : 'es'} registrada${totalShown === 1 ? '' : 's'}). Después de 10 empieza a calibrarse a tu comportamiento.`
              : `Calibrado con ${totalShown} interacciones registradas.`}
          </Text>
        </View>
      </RiseView>

      {showStats ? (
        <RiseView delay={140}>
          <SectionHeader
            title="Tus señales"
            subtitle="Qué tanto actuás en cada tipo de aviso."
          />
          <View
            style={[
              styles.card,
              { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
            ]}
          >
            {topFamilies.map(([family, s], i) => (
              <View
                key={family}
                style={[
                  styles.statRow,
                  i > 0 && {
                    borderTopWidth: StyleSheet.hairlineWidth,
                    borderTopColor: theme.colors.border,
                  },
                ]}
              >
                <Text
                  style={[styles.statLabel, { color: theme.colors.text }]}
                  numberOfLines={1}
                >
                  {familyLabel(family)}
                </Text>
                <Text style={[styles.statPhrase, { color: theme.colors.textMuted }]}>
                  {engagementPhrase(s.ctr, s.acted)}
                </Text>
              </View>
            ))}
          </View>
        </RiseView>
      ) : null}

      <RiseView delay={200}>
        <SectionHeader
          title="Familias bloqueadas"
          subtitle={
            blocklistQuery.data && blocklistQuery.data.length > 0
              ? 'Toca una para desbloquear.'
              : 'Cuando bloqueas una familia desde el chat, aparece aquí.'
          }
        />
        {blocklistQuery.data && blocklistQuery.data.length > 0 ? (
          <View
            style={[
              styles.card,
              { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
            ]}
          >
            {blocklistQuery.data.map((entry, i) => (
              <Pressable
                key={entry.signal_family}
                onPress={() => handleUnblock(entry.signal_family)}
                style={({ pressed }) => [
                  styles.blocklistRow,
                  i > 0 && {
                    borderTopWidth: StyleSheet.hairlineWidth,
                    borderTopColor: theme.colors.border,
                  },
                  pressed && { opacity: 0.7 },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Desbloquear ${familyLabel(entry.signal_family)}`}
              >
                <View style={styles.blocklistLeft}>
                  <MaterialIcons name="block" size={18} color={theme.colors.textMuted} />
                  <View style={styles.blocklistText}>
                    <Text style={[styles.blocklistTitle, { color: theme.colors.text }]}>
                      {familyLabel(entry.signal_family)}
                    </Text>
                    {entry.reason ? (
                      <Text
                        style={[styles.blocklistReason, { color: theme.colors.textMuted }]}
                        numberOfLines={1}
                      >
                        {entry.reason}
                      </Text>
                    ) : null}
                  </View>
                </View>
                <MaterialIcons name="chevron-right" size={18} color={theme.colors.textMuted} />
              </Pressable>
            ))}
          </View>
        ) : (
          <Text style={[styles.emptyText, { color: theme.colors.textMuted }]}>
            No tienes familias bloqueadas.
          </Text>
        )}
      </RiseView>

      <RiseView delay={260}>
        <SectionHeader
          title="Privacidad"
          subtitle="Tu historial de interacciones se usa solo para calibrar el asistente."
        />
        <Pressable
          onPress={handleClearHistory}
          style={({ pressed }) => [
            styles.dangerButton,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
            pressed && { opacity: 0.7 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Borrar mi historial del asistente"
        >
          <MaterialIcons name="delete-outline" size={18} color="#B33A1F" />
          <Text style={styles.dangerLabel}>Borrar mi historial</Text>
        </Pressable>
      </RiseView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 10,
  },
  cardRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: { flex: 1, gap: 2 },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  cardBody: { fontSize: 13, lineHeight: 18 },
  cardFootnote: { fontSize: 12, lineHeight: 16, marginTop: 4 },
  valueAmount: { fontSize: 24, fontWeight: '700', letterSpacing: -0.4 },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 11,
    paddingHorizontal: 14,
    gap: 12,
  },
  statLabel: { fontSize: 14, fontWeight: '500', flex: 1 },
  statPhrase: { fontSize: 13, fontWeight: '500' },
  blocklistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  blocklistLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  blocklistText: { flex: 1 },
  blocklistTitle: { fontSize: 14, fontWeight: '500' },
  blocklistReason: { fontSize: 12, marginTop: 2 },
  emptyText: { fontSize: 13, paddingHorizontal: 16, paddingVertical: 12 },
  dangerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 14,
  },
  dangerLabel: { fontSize: 14, fontWeight: '600', color: '#B33A1F' },
})
