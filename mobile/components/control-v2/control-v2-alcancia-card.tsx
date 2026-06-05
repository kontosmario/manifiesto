import { memo, useState } from 'react'
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { MaterialIcons } from '@expo/vector-icons'
import { BreatheDot } from '@/components/home/animated/breathe-dot'
import { CountUpText } from '@/components/home/animated/count-up-text'
import { RiseView } from '@/components/home/animated/rise-view'
import { QuickAddSavingsSheet } from '@/components/home/quick-add-savings-sheet'
import { useAddSavingsContribution } from '@/features/savings-goals/use-add-savings-contribution'
import type { SavingsGoal } from '@/features/savings-goals/savings-goal.model'
import { useStreak } from '@/features/streaks/use-streak'
import { usePressScale } from '@/hooks/use-press-scale'
import { triggerHaptic } from '@/lib/haptics'
import { useAppTheme } from '@/theme/theme-provider'
import { formatMoney, formatMoneyShort } from '@/utils/money'

const MIN_DIAS = 3
// La sugerencia de ahorro necesita gasto en varios días para no contar
// como "ahorro" los días sin registrar. Se activa con 3 días con gasto.
const MIN_SPEND_DAYS = 3

interface ControlV2AlcanciaCardProps {
  familyId: string
  userId: string
  /** Savings goal active in this family — drives the "mover a tu meta"
   *  CTA and the goal-progress hint. `null` when the user hasn't set
   *  one up yet (renders a "Crear meta" call-to-action instead). */
  goal: SavingsGoal | null
  /** Suma de los deltas positivos diarios — "lo que pudiste haber
   *  guardado" gracias a sub-gastar el cupo en este ciclo. */
  vault: number
  /** Días cerrados del ciclo (no incluye el día de hoy). */
  closedDays: number
  /** Días con gasto ≤ cupo diario en el ciclo. */
  diasGanadores: number
  /** Días seguidos hasta hoy con gasto bajo cupo. */
  rachaBajoCupo: number
  /** Días del ciclo sin movimientos: combina los $0 pasivos y los
   *  marcados explícitamente con "hoy no tuve gastos". */
  noSpendCount: number
  /** Posición 1-based dentro del ciclo. */
  diaActual?: number
  /** Días distintos con gasto en el ciclo. Sin gasto en varios días el
   *  "vault" (sugerencia de ahorro por sub-gasto) sería falso (todos los
   *  días contarían como "bajo cupo"), así que se activa con
   *  ≥ MIN_SPEND_DAYS. */
  diasConGasto?: number
}

/**
 * Alcancía smart — auditada y conectada al sistema real:
 *
 *  · El "vault" es la **sugerencia** de cuánto deberías mover a tu
 *    meta este ciclo (sub-spending). El número grande es eso: un
 *    presupuesto de aporte basado en tu propio ritmo.
 *  · El CTA primario abre el `QuickAddSavingsSheet` precargado con
 *    el monto del vault, así con un tap el usuario realmente mueve
 *    plata a su `savings_goal` activa (vía la RPC atómica
 *    `add_savings_contribution`). Si no hay meta, ofrece crearla.
 *  · Las tres mini-tiles cuentan tres historias complementarias en
 *    lugar de duplicarse:
 *      1. **Días sin gastos** — incluye los días marcados como "hoy
 *         no tuve gastos" desde la pantalla de Gastos (los marked
 *         days viven en `streak_marked_days` y se cuentan aquí igual
 *         que los días pasivamente $0).
 *      2. **Bajo cupo** — proporción del ciclo donde respetaste el
 *         presupuesto diario (engagement con la métrica de Hoy).
 *      3. **Racha** — el `currentStreak` global (con escudos), el
 *         mismo que se ve en el header de Gastos. Conecta esta
 *         vista con el sistema de gamificación real.
 *  · MaterialIcons para todos los glyphs (sin emojis).
 */
function ControlV2AlcanciaCardImpl({
  familyId,
  userId,
  goal,
  vault,
  closedDays,
  diasGanadores,
  rachaBajoCupo,
  noSpendCount,
  diaActual = 999,
  diasConGasto = 999,
}: ControlV2AlcanciaCardProps) {
  const { theme } = useAppTheme()
  const isDark = theme.isDark
  const streakQuery = useStreak(familyId, userId)
  const globalStreak = streakQuery.data?.currentStreak ?? 0
  const freezeTokens = streakQuery.data?.freezeTokens ?? 0

  const [sheetOpen, setSheetOpen] = useState(false)
  const addMutation = useAddSavingsContribution(goal?.familyId ?? familyId)
  // Press scale 0.97 — la CTA es el único elemento interactivo del
  // card. Antes usaba `opacity: pressed ? 0.78 : ...` (lento fade
  // muerto). Spring scale + Animated.View es Emil-grade y tactile.
  const ctaPress = usePressScale({ pressedScale: 0.97 })

  // El vault (sugerencia por sub-gasto) sería falso con pocos días de
  // gasto (los días sin registrar contarían como "ahorro"). Mostramos la
  // silueta real — eyebrow + número grande + 3 mini-tiles + CTA — pero
  // inerte, sin números, con el progreso hacia la activación.
  if (diaActual < MIN_DIAS || diasConGasto < MIN_SPEND_DAYS) {
    return <ControlV2AlcanciaCardEmpty diasConGasto={diasConGasto} />
  }

  // Tone tokens — alineados con la MetaCard así "alcancía" y "meta"
  // se leen como dos vistas del mismo dominio (lo que ahorras vs. el
  // objetivo final).
  const accentFg = theme.colors.success
  const accentBorder = isDark ? 'rgba(122,216,163,0.32)' : 'rgba(28,126,58,0.26)'
  const accentChipBg = isDark ? 'rgba(122,216,163,0.16)' : 'rgba(28,126,58,0.10)'
  const accentChipBorder = isDark ? 'rgba(122,216,163,0.34)' : 'rgba(28,126,58,0.26)'
  const ctaBg = isDark ? 'rgba(122,216,163,0.18)' : 'rgba(28,126,58,0.10)'
  const ctaBorder = isDark ? 'rgba(122,216,163,0.42)' : 'rgba(28,126,58,0.30)'
  const tileBg = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,42,30,0.04)'
  const tileBorder = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,42,30,0.08)'
  const muted = theme.colors.textMuted
  const text = theme.colors.text
  const cardBg = theme.isDark ? theme.colors.surfaceMuted : theme.colors.creamCard

  const goalPct =
    goal != null
      ? Math.min(100, Math.round((goal.currentAmount / goal.goalAmount) * 100))
      : 0

  // Active states for the primary CTA.
  const hasGoal = goal != null
  const canMove = hasGoal && vault > 0
  const ctaLabel = !hasGoal
    ? 'Crear meta de ahorro'
    : vault > 0
      ? `Mover ${formatMoneyShort(vault)} a tu meta`
      : 'Sumar a tu meta'

  const handleCtaPress = () => {
    if (!hasGoal) {
      // No goal yet — point the user to settings/savings-goal config.
      // The streak/cycle data is already there to seed a sensible
      // first goal once they land on the form.
      void triggerHaptic('selection')
      Alert.alert(
        'Aún no tienes meta',
        'Crea tu meta de ahorro desde Ajustes → Metas para empezar a usar la alcancía.',
      )
      return
    }
    void triggerHaptic('selection')
    setSheetOpen(true)
  }

  const handleSheetSubmit = (amount: number) => {
    if (!goal) return
    addMutation.mutate(
      { goalId: goal.id, amount },
      {
        onSuccess: () => {
          void triggerHaptic('success')
          setSheetOpen(false)
        },
        onError: (err) => {
          void triggerHaptic('error')
          Alert.alert(
            'No pudimos sumar el aporte',
            err instanceof Error ? err.message : 'Reintenta en un momento.',
          )
        },
      },
    )
  }

  const subSpendDays = `${diasGanadores} de ${Math.max(closedDays, diasGanadores)} días`
  const subSpendCopy =
    vault > 0
      ? `Gasto debajo del cupo en ${subSpendDays} cerrados de este mes.`
      : closedDays === 0
        ? 'Aún no hay días cerrados — empezamos a calcular mañana.'
        : `Esta semana el gasto superó el cupo casi todos los días. Cuando bajes, lo guardamos aquí.`

  return (
    <RiseView delay={180}>
      <View
        style={[styles.card, { backgroundColor: cardBg, borderColor: accentBorder }]}
      >
        <View style={styles.eyebrowRow}>
          <BreatheDot size={7} color={accentFg} glow={accentFg} />
          <Text style={[styles.eyebrow, { color: accentFg }]} numberOfLines={1}>
            TU ALCANCÍA · ESTE CICLO
          </Text>
          {hasGoal ? (
            <View
              style={[
                styles.metaChip,
                { backgroundColor: accentChipBg, borderColor: accentChipBorder },
              ]}
            >
              <MaterialIcons name="flag" size={11} color={accentFg} />
              <Text
                style={[styles.metaChipText, { color: accentFg }]}
                numberOfLines={1}
              >
                META · {goalPct}%
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.heroRow}>
          <View style={styles.heroFlex}>
            <View style={styles.amountRow}>
              <Text style={[styles.plus, { color: text }]}>+</Text>
              <CountUpText
                value={vault}
                duration={1300}
                format={(n) => formatMoney(n)}
                style={[styles.amount, { color: text }]}
              />
            </View>
            <Text style={[styles.amountSub, { color: muted }]} numberOfLines={2}>
              {subSpendCopy}
            </Text>
          </View>
          <View style={[styles.glyph, { backgroundColor: accentChipBg }]}>
            <MaterialIcons name="savings" size={28} color={accentFg} />
          </View>
        </View>

        <Pressable
          onPress={handleCtaPress}
          onPressIn={ctaPress.onPressIn}
          onPressOut={ctaPress.onPressOut}
          accessibilityRole="button"
          accessibilityLabel={ctaLabel}
          disabled={addMutation.isPending}
        >
          <Animated.View
            style={[
              styles.cta,
              {
                backgroundColor: canMove || !hasGoal ? ctaBg : tileBg,
                borderColor: canMove || !hasGoal ? ctaBorder : tileBorder,
                // Disabled state retiene opacity 0.5 (semantica). Press
                // feedback ahora vive en scale spring vía Animated.View.
                opacity: addMutation.isPending ? 0.5 : 1,
              },
              ctaPress.animatedStyle,
            ]}
          >
            <MaterialIcons
              name={hasGoal ? 'arrow-forward' : 'add'}
              size={16}
              color={canMove || !hasGoal ? accentFg : muted}
            />
            <Text
              style={[
                styles.ctaText,
                { color: canMove || !hasGoal ? accentFg : muted },
              ]}
              numberOfLines={1}
            >
              {addMutation.isPending ? 'Sumando…' : ctaLabel}
            </Text>
            {hasGoal && vault > 0 ? (
              <MaterialIcons name="chevron-right" size={16} color={accentFg} />
            ) : null}
          </Animated.View>
        </Pressable>

        <View style={styles.tilesRow}>
          <StatTile
            iconName="eco"
            iconColor={accentFg}
            label="Sin gastos"
            value={String(noSpendCount)}
            sub={
              closedDays > 0
                ? `${noSpendCount} de ${closedDays} días`
                : 'días del mes'
            }
            bg={tileBg}
            border={tileBorder}
            text={text}
            muted={muted}
          />
          <StatTile
            iconName="trending-down"
            iconColor={accentFg}
            label="Bajo cupo"
            value={`${diasGanadores}`}
            sub={
              rachaBajoCupo > 0
                ? `racha ${rachaBajoCupo}d`
                : 'días respetando'
            }
            bg={tileBg}
            border={tileBorder}
            text={text}
            muted={muted}
          />
          <StatTile
            iconName="local-fire-department"
            iconColor={
              isDark ? 'rgba(242,181,138,0.95)' : 'rgba(194,90,62,0.95)'
            }
            label="Racha"
            value={`${globalStreak}d`}
            sub={
              freezeTokens > 0
                ? `${freezeTokens} ${freezeTokens === 1 ? 'escudo' : 'escudos'}`
                : 'con registro'
            }
            bg={tileBg}
            border={tileBorder}
            text={text}
            muted={muted}
          />
        </View>
      </View>

      {hasGoal ? (
        <QuickAddSavingsSheet
          visible={sheetOpen}
          goalTitle={goal!.title}
          remaining={Math.max(0, goal!.goalAmount - goal!.currentAmount)}
          isSaving={addMutation.isPending}
          initialAmount={vault > 0 ? vault : undefined}
          onClose={() => {
            if (addMutation.isPending) return
            setSheetOpen(false)
          }}
          onSubmit={handleSheetSubmit}
        />
      ) : null}
    </RiseView>
  )
}

/**
 * Empty-state twin de "Tu alcancía". Misma chrome (surface, border
 * `line`, eyebrow + BreatheDot + título UPPERCASE) y la misma silueta —
 * número grande + 3 mini-tiles + CTA — pero inerte: el número como dash
 * muted, tiles con valores en dash, CTA con look deshabilitado (no
 * presionable). El pill dice "Pronto" en textMuted; el callout comunica
 * la activación + el progreso. Recesado (opacity 0.86), sin shimmer.
 */
function ControlV2AlcanciaCardEmpty({ diasConGasto }: { diasConGasto: number }) {
  const { theme } = useAppTheme()
  const isDark = theme.isDark
  const ph = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,42,30,0.06)'
  const tileBg = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,42,30,0.04)'
  const tileBorder = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,42,30,0.08)'
  const muted = theme.colors.textMuted
  const text = theme.colors.text
  const cardBg = isDark ? theme.colors.surfaceMuted : theme.colors.creamCard
  const progreso = Math.max(0, Math.min(diasConGasto, MIN_SPEND_DAYS))

  return (
    <RiseView delay={180}>
      <View
        accessibilityRole="text"
        accessibilityLabel="Tu alcancía: esperando más días con gasto"
        style={[
          styles.card,
          styles.emptyCard,
          { backgroundColor: cardBg, borderColor: theme.colors.line },
        ]}
      >
        <View style={styles.eyebrowRow}>
          <BreatheDot size={7} color={muted} glow={muted} />
          <Text style={[styles.eyebrow, { color: muted }]} numberOfLines={1}>
            TU ALCANCÍA · ESTE CICLO
          </Text>
          <View style={[styles.emptyPill, { borderColor: theme.colors.line }]}>
            <Text style={[styles.emptyPillText, { color: muted }]}>Pronto</Text>
          </View>
        </View>

        {/* Número grande inerte como dash muted + glyph recesado. */}
        <View style={styles.heroRow}>
          <View style={styles.heroFlex}>
            <View style={styles.amountRow}>
              <Text style={[styles.amount, { color: muted }]}>—</Text>
            </View>
            <View
              style={[styles.emptyBar, { width: '70%', height: 10, backgroundColor: ph, marginTop: 8 }]}
            />
          </View>
          <View style={[styles.glyph, { backgroundColor: ph }]}>
            <MaterialIcons name="savings" size={28} color={muted} />
          </View>
        </View>

        {/* CTA con look deshabilitado — no presionable. */}
        <View
          style={[styles.cta, { backgroundColor: tileBg, borderColor: tileBorder }]}
        >
          <MaterialIcons name="lock-outline" size={16} color={muted} />
          <Text style={[styles.ctaText, { color: muted }]} numberOfLines={1}>
            Disponible pronto
          </Text>
        </View>

        {/* 3 mini-tiles inertes — labels reales, valores en dash. */}
        <View style={styles.tilesRow}>
          {(['Sin gastos', 'Bajo cupo', 'Racha'] as const).map((label) => (
            <View
              key={label}
              style={[styles.tile, { backgroundColor: tileBg, borderColor: tileBorder }]}
            >
              <View style={styles.tileHead}>
                <View style={[styles.emptyDot, { backgroundColor: ph }]} />
                <Text style={[styles.tileLabel, { color: muted }]} numberOfLines={1}>
                  {label}
                </Text>
              </View>
              <Text style={[styles.tileValue, { color: muted }]}>—</Text>
              <View
                style={[styles.emptyBar, { width: 40, height: 7, backgroundColor: ph, marginTop: 5 }]}
              />
            </View>
          ))}
        </View>

        <View
          style={[
            styles.emptyCallout,
            {
              backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,42,30,0.04)',
              borderColor: theme.colors.line,
            },
          ]}
        >
          <MaterialIcons name="schedule" size={16} color={muted} />
          <View style={styles.calloutBody}>
            <Text style={[styles.emptyCalloutText, { color: text }]}>
              Registra gastos en al menos {MIN_SPEND_DAYS} días distintos para
              sugerirte cuánto mover a tu meta según tu ritmo.
            </Text>
            <Text style={[styles.emptyProgress, { color: muted }]}>
              Gasto en {progreso} de {MIN_SPEND_DAYS} días.
            </Text>
          </View>
        </View>
      </View>
    </RiseView>
  )
}

interface StatTileProps {
  iconName: keyof typeof MaterialIcons.glyphMap
  iconColor: string
  label: string
  value: string
  sub: string
  bg: string
  border: string
  text: string
  muted: string
}

function StatTile({
  iconName,
  iconColor,
  label,
  value,
  sub,
  bg,
  border,
  text,
  muted,
}: StatTileProps) {
  return (
    <View
      style={[styles.tile, { backgroundColor: bg, borderColor: border }]}
    >
      <View style={styles.tileHead}>
        <MaterialIcons name={iconName} size={13} color={iconColor} />
        <Text style={[styles.tileLabel, { color: muted }]} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Text style={[styles.tileValue, { color: text }]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={[styles.tileSub, { color: muted }]} numberOfLines={1}>
        {sub}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  eyebrow: {
    fontSize: 10,
    letterSpacing: 1.4,
    fontWeight: '800',
    flexShrink: 1,
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    marginLeft: 'auto',
    maxWidth: 160,
  },
  metaChipText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  heroFlex: { flex: 1 },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  plus: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -1,
    lineHeight: 30,
    marginRight: 2,
  },
  amount: {
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -1.2,
    lineHeight: 32,
  },
  amountSub: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 4,
    lineHeight: 16,
  },
  glyph: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  ctaText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  tilesRow: {
    flexDirection: 'row',
    gap: 8,
  },
  tile: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    minHeight: 64,
  },
  tileHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  tileLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  tileValue: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  tileSub: {
    fontSize: 10,
    fontWeight: '500',
    marginTop: 2,
  },
  // ── Empty-state silhouette ──────────────────────────────────
  emptyCard: { opacity: 0.86 },
  emptyBar: { borderRadius: 4 },
  emptyDot: { width: 8, height: 8, borderRadius: 4 },
  emptyPill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    marginLeft: 'auto',
  },
  emptyPillText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
  emptyCallout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  calloutBody: { flex: 1, gap: 4 },
  emptyCalloutText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  emptyProgress: { fontSize: 11, fontWeight: '700', letterSpacing: 0.2 },
})

// Memo: Alcancia tiene Pressables + Alert handler. Sin memo cada
// render del parent recreaba el árbol incluyendo los useState locales.
export const ControlV2AlcanciaCard = memo(ControlV2AlcanciaCardImpl)
