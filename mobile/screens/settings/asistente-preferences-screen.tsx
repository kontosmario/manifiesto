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

import { useCallback } from 'react'
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'

import { Screen } from '@/components/ui/screen'
import { SectionHeader } from '@/components/ui/section-header'
import { RiseView } from '@/components/home/animated/rise-view'
import { AmbientBlobs } from '@/components/home/ambient-blobs'
import { triggerHaptic } from '@/lib/haptics'
import { supabase } from '@/lib/supabase'
import { useAppTheme } from '@/theme/theme-provider'
import { DARK_TAB_CANVAS, radii } from '@/theme/palette'

import { useInteractionStats } from '@/features/insights/use-interaction-stats'
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

export function AsistentePreferencesScreen({ userId }: Props) {
  const { theme } = useAppTheme()
  const queryClient = useQueryClient()
  const statsQuery = useInteractionStats(userId)
  const blocklistQuery = useSignalBlocklistEntries(userId)
  const unblockMutation = useUnblockSignalFamily()

  const persona = statsQuery.data ? inferPersona(statsQuery.data) : 'planner'
  const personaProfile = PERSONA_PROFILES[persona]
  const totalShown = statsQuery.data?.overall.totalShown ?? 0

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

      <RiseView delay={140}>
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

      <RiseView delay={200}>
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
