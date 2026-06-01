import { useMemo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { Screen } from '@/components/ui/screen'
import { StreakFlameIcon } from '@/components/gastos/streak-flame-icon'
import { triggerAchievementPreview } from '@/lib/achievement-preview-emitter'
import { triggerHaptic } from '@/lib/haptics'
import { useAuthSession } from '@/features/auth/use-auth-session'
import {
  useAchievements,
  type AchievementViewItem,
} from '@/features/achievements/use-achievements'
import type { StreakData } from '@/features/streaks/use-streak'
import { useAppTheme } from '@/theme/theme-provider'

/**
 * Dev-only preview tools for the new engagement systems (achievements
 * + streak). Mounted under `/settings/dev/preview` and gated by the
 * `__DEV__` flag in the entry row of the Settings screen.
 *
 * Why it exists
 * -------------
 * The achievement unlock celebration only fires when a real DB
 * insert happens (server trigger or backfill). Without this preview
 * tool, design iterations on the modal copy / motion / colors
 * required running an actual flow + having an unlock condition
 * exactly met — slow loop. The preview emitter (singleton in
 * `lib/achievement-preview-emitter.ts`) lets us pop the same modal
 * the Bridge would pop, without touching the database. Identical
 * UI path, zero side-effects.
 *
 * Likewise for streak — the flame icon has 3 statuses (active,
 * at_risk with 4 intensities, broken) and each renders different
 * animations + tones. Forcing real states means logging gastos at
 * specific hours and waiting for the cron to break a streak. The
 * preview tool renders the icon at every status in a single grid
 * for visual verification.
 */
export function AchievementsStreakPreviewScreen() {
  const { theme } = useAppTheme()
  const { data: session } = useAuthSession()
  const userId = session?.user?.id
  const { data, isLoading, error } = useAchievements(userId)

  // Build a fake StreakData per status × level so we can render the
  // flame icon in every visual state side-by-side. Numbers are
  // representative: each one crosses into the corresponding level
  // (Arranque/Constante/Disciplinado/Imparable/Maestro/Leyenda).
  const streakPreviews = useMemo(
    () => buildStreakPreviewMatrix(),
    [],
  )

  // A dev preview tool must not depend on the DB catalog. If
  // `achievements_catalog` is empty in the connected base (e.g. the
  // achievements migration isn't applied there) or the read errored,
  // fall back to a built-in sample — one per tier — so the unlock modal
  // (and its dark/light tones) can always be previewed in every tier.
  const realItems = data?.items ?? []
  const usingFallbackAchievements = realItems.length === 0
  const achievementPreviews = usingFallbackAchievements
    ? FALLBACK_ACHIEVEMENT_PREVIEWS
    : realItems

  return (
    <Screen
      title="Preview · Logros & Racha"
      subtitle="Herramientas de desarrollo para previsualizar el modal de unlock y la racha en cada estado."
      canGoBack
    >
      <View style={styles.stack}>
        {/* ── Section 1: Achievement unlock previews ────────────── */}
        <View>
          <Text style={[styles.sectionEyebrow, { color: theme.colors.textMuted }]}>
            LOGROS — DISPARAR MODAL
          </Text>
          <Text style={[styles.sectionHint, { color: theme.colors.textSoft }]}>
            Tocá cualquier logro para previsualizar el modal de celebración. No
            toca la base de datos — usa el emitter local que el Bridge subscribe.
          </Text>
          {isLoading ? null : (
            <View style={styles.previewGrid}>
              {usingFallbackAchievements ? (
                <Text style={[styles.fallbackNote, { color: theme.colors.warning }]}>
                  {error
                    ? 'No se pudo leer el catálogo en esta base. '
                    : 'El catálogo de logros está vacío en esta base. '}
                  Mostrando muestras por tier para previsualizar el modal y sus tonos.
                </Text>
              ) : null}
              {achievementPreviews.map((item) => (
                <PreviewAchievementRow key={item.code} item={item} />
              ))}
            </View>
          )}
        </View>

        {/* ── Section 2: Streak flame previews ───────────────────── */}
        <View>
          <Text style={[styles.sectionEyebrow, { color: theme.colors.textMuted }]}>
            RACHA — ÍCONOS POR ESTADO
          </Text>
          <Text style={[styles.sectionHint, { color: theme.colors.textSoft }]}>
            Cada celda renderea el StreakFlameIcon en un estado distinto. Útil
            para verificar palette, animaciones (breath / flicker) y la
            degradación a web (estática).
          </Text>
          <View style={styles.streakGrid}>
            {streakPreviews.map((preview) => (
              <View
                key={preview.label}
                style={[
                  styles.streakCell,
                  {
                    backgroundColor: theme.colors.creamCard,
                    borderColor: theme.colors.line,
                  },
                ]}
              >
                <StreakFlameIcon data={preview.data} onPress={() => {}} />
                <Text
                  style={[styles.streakCellLabel, { color: theme.colors.text }]}
                  numberOfLines={1}
                >
                  {preview.label}
                </Text>
                <Text
                  style={[styles.streakCellSub, { color: theme.colors.textSoft }]}
                  numberOfLines={1}
                >
                  {preview.sub}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── Section 3: Inspect cheat-sheet ─────────────────────── */}
        <View
          style={[
            styles.cheatsheet,
            {
              backgroundColor: theme.colors.surfaceMuted,
              borderColor: theme.colors.line,
            },
          ]}
        >
          <Text style={[styles.cheatTitle, { color: theme.colors.text }]}>
            Cómo funciona
          </Text>
          <Text style={[styles.cheatBody, { color: theme.colors.textMuted }]}>
            • Trigger SQL detecta el evento (INSERT en expenses, UPDATE en
            user_streaks, etc.) y llama a `award_achievement(code, user, family)`.
            {'\n'}• La función inserta en `achievements_earned` con
            `on conflict do nothing` (idempotente).{'\n'}• La tabla está en la
            publication realtime de Supabase. El cliente subscribe via
            `useAchievementUnlocks(userId)` filtrado por `user_id=eq.X`.{'\n'}•
            `AchievementUnlockBridge` (montado en AppStackShell) escucha y abre
            la modal con confetti + haptic.{'\n'}• La galería en Settings → "Tu
            progreso" → "Logros" leé el catálogo + earned y muestra el merge.
          </Text>
        </View>
      </View>
    </Screen>
  )
}

// ─────────────────────────────────────────────────────────────────
// Subcomponentes
// ─────────────────────────────────────────────────────────────────

function PreviewAchievementRow({ item }: { item: AchievementViewItem }) {
  const { theme } = useAppTheme()
  return (
    <Pressable
      onPress={() => {
        void triggerHaptic('selection')
        // Force `earned: true` for the preview — the modal expects
        // a "fresh unlock" shape, not the locked-state view item we
        // might get back from the merge in useAchievements.
        triggerAchievementPreview({
          ...item,
          earned: true,
          earned_at: new Date().toISOString(),
          context: { preview: true },
        })
      }}
      accessibilityRole="button"
      accessibilityLabel={`Previsualizar modal de unlock para ${item.title}`}
      style={({ pressed }) => [
        styles.previewRow,
        {
          backgroundColor: theme.colors.creamCard,
          borderColor: theme.colors.line,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <Text style={styles.previewIcon}>{item.icon}</Text>
      <View style={styles.previewBody}>
        <Text style={[styles.previewTitle, { color: theme.colors.text }]} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={[styles.previewCode, { color: theme.colors.textSoft }]} numberOfLines={1}>
          {item.code} · {tierLabel(item.tier)}
          {item.earned ? ' · ya ganado' : ' · pendiente'}
        </Text>
      </View>
      <MaterialIcons name="play-circle-outline" size={20} color={theme.colors.textMuted} />
    </Pressable>
  )
}

// ─────────────────────────────────────────────────────────────────
// Fallback samples — one per tier, used when the DB catalog is empty
// so the dev tool can always preview the unlock modal in every tier.
// ─────────────────────────────────────────────────────────────────

const FALLBACK_ACHIEVEMENT_PREVIEWS: AchievementViewItem[] = [
  {
    code: 'sample_bronze',
    title: 'Primer paso',
    body: 'Registraste tu primer gasto del hogar.',
    icon: '🌱',
    tier: 'bronze',
    sort_order: 1,
    earned: false,
    earned_at: null,
    context: null,
  },
  {
    code: 'sample_silver',
    title: 'Constancia',
    body: 'Una semana entera sin dejar de registrar.',
    icon: '⭐',
    tier: 'silver',
    sort_order: 2,
    earned: false,
    earned_at: null,
    context: null,
  },
  {
    code: 'sample_gold',
    title: 'Disciplina',
    body: 'Un mes completo de racha activa.',
    icon: '🏆',
    tier: 'gold',
    sort_order: 3,
    earned: false,
    earned_at: null,
    context: null,
  },
  {
    code: 'sample_legendary',
    title: 'Leyenda',
    body: 'Cien días imparable. Sos parte del manifiesto.',
    icon: '👑',
    tier: 'legendary',
    sort_order: 4,
    earned: false,
    earned_at: null,
    context: null,
  },
]

// ─────────────────────────────────────────────────────────────────
// Streak preview matrix
// ─────────────────────────────────────────────────────────────────

interface StreakPreview {
  label: string
  sub: string
  data: StreakData
}

function buildStreakPreviewMatrix(): StreakPreview[] {
  return [
    {
      label: 'Activa · Arranque',
      sub: '3 días, hoy registrado',
      data: makeStreak({ current: 3, hasLoggedToday: true }),
    },
    {
      label: 'Activa · Constante',
      sub: '10 días',
      data: makeStreak({ current: 10, hasLoggedToday: true }),
    },
    {
      label: 'Activa · Disciplinado',
      sub: '20 días',
      data: makeStreak({ current: 20, hasLoggedToday: true }),
    },
    {
      label: 'Activa · Imparable',
      sub: '45 días',
      data: makeStreak({ current: 45, hasLoggedToday: true }),
    },
    {
      label: 'Activa · Maestro',
      sub: '75 días',
      data: makeStreak({ current: 75, hasLoggedToday: true }),
    },
    {
      label: 'Activa · Leyenda',
      sub: '120 días',
      data: makeStreak({ current: 120, hasLoggedToday: true }),
    },
    {
      label: 'En riesgo · sin escudos',
      sub: 'hoy todavía no cargó',
      data: makeStreak({
        current: 10,
        hasLoggedToday: false,
        freezeTokens: 0,
      }),
    },
    {
      label: 'En riesgo · 1 escudo',
      sub: '10 días, 1 freeze disponible',
      data: makeStreak({
        current: 10,
        hasLoggedToday: false,
        freezeTokens: 1,
      }),
    },
    {
      label: 'Rota',
      sub: 'best 14, hoy 0',
      data: makeStreak({
        current: 0,
        longest: 14,
        hasLoggedToday: false,
        isBroken: true,
      }),
    },
  ]
}

function makeStreak(opts: {
  current: number
  longest?: number
  hasLoggedToday: boolean
  freezeTokens?: number
  isBroken?: boolean
}): StreakData {
  const current = opts.current
  return {
    currentStreak: current,
    longestStreak: opts.longest ?? Math.max(current, 14),
    totalDaysLogged: current,
    hasLoggedToday: opts.hasLoggedToday,
    hasMarkedNoExpenseToday: false,
    freezeTokens: opts.freezeTokens ?? 0,
    // 7-element array: index 6 = today. Fill earlier days based on
    // current count so the strip in the StreakSheet (if opened) looks
    // coherent.
    weekActivity: buildFakeWeekActivity(current, opts.hasLoggedToday),
    isBroken: Boolean(opts.isBroken),
    streakBrokenAt: opts.isBroken ? new Date().toISOString() : null,
    markedDaysIso: [],
  }
}

function buildFakeWeekActivity(current: number, today: boolean): boolean[] {
  const len = 7
  const out = new Array<boolean>(len).fill(false)
  // Mark today (index 6) based on flag
  out[len - 1] = today
  // For positive streaks fill backward from yesterday
  const back = Math.min(current - (today ? 1 : 0), len - 1)
  for (let i = 0; i < back; i++) {
    out[len - 2 - i] = true
  }
  return out
}

function tierLabel(tier: AchievementViewItem['tier']): string {
  switch (tier) {
    case 'bronze': return 'Bronce'
    case 'silver': return 'Plata'
    case 'gold': return 'Oro'
    case 'legendary': return 'Leyenda'
  }
}

const styles = StyleSheet.create({
  stack: { gap: 28 },

  sectionEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.6,
    marginBottom: 6,
  },
  sectionHint: {
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 14,
    fontStyle: 'italic',
  },

  // Achievement preview rows
  previewGrid: { gap: 8 },
  fallbackNote: {
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 4,
    fontStyle: 'italic',
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    minHeight: 56,
  },
  previewIcon: {
    fontSize: 24,
    width: 36,
    textAlign: 'center',
  },
  previewBody: {
    flex: 1,
    gap: 2,
  },
  previewTitle: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  previewCode: {
    fontSize: 11,
    fontFamily: 'Menlo',
    letterSpacing: -0.2,
  },

  // Streak grid
  streakGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 10,
  },
  streakCell: {
    width: '31%',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    gap: 8,
    minHeight: 110,
  },
  streakCellLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: -0.1,
    textAlign: 'center',
  },
  streakCellSub: {
    fontSize: 10,
    textAlign: 'center',
    letterSpacing: 0,
  },

  // Cheatsheet
  cheatsheet: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 8,
  },
  cheatTitle: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  cheatBody: {
    fontSize: 12,
    lineHeight: 18,
  },
})
