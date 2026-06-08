import { memo, useEffect, useMemo, useState } from 'react'
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { MaterialIcons } from '@expo/vector-icons'
import { BreatheDot } from '@/components/home/animated/breathe-dot'
import { CountUpText } from '@/components/home/animated/count-up-text'
import { RiseView } from '@/components/home/animated/rise-view'
import { QuickAddSavingsSheet } from '@/components/home/quick-add-savings-sheet'
import { NumericEditSheet } from '@/components/ui/numeric-edit-sheet'
import { useAddSavingsContribution } from '@/features/savings-goals/use-add-savings-contribution'
import type { SavingsGoal } from '@/features/savings-goals/savings-goal.model'
import { useStreak } from '@/features/streaks/use-streak'
import { useApplyReserveDecision } from '@/features/month-close/use-apply-reserve'
import { usePressScale } from '@/hooks/use-press-scale'
import { triggerHaptic } from '@/lib/haptics'
import { useAppTheme } from '@/theme/theme-provider'
import {
  formatMoney,
  formatMoneyShort,
  formatPriceInputValue,
  parsePrice,
  serializePrice,
} from '@/utils/money'

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
  /** Reserva acumulada de cierres de mes anteriores (Spec B). Cuando
   *  > 0 se renderea un bloque indigo dentro del card con CTAs para
   *  moverla al ciclo actual o aportarla a la meta. Cuando vuelve a 0
   *  (después de aplicar), las invalidaciones del hook descartan el
   *  bloque automáticamente. */
  monthlyReserveAmount?: number
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
  monthlyReserveAmount = 0,
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
  //
  // EXCEPCIÓN: si el user tiene reserva acumulada, la card debe
  // permanecer FUNCIONAL para que pueda decidir qué hacer con esa
  // plata — independientemente de que el vault no esté listo (vault
  // depende de días con gasto; la reserva existe sí o sí en DB).
  // El empty state recibe los props necesarios para hostear el
  // ReserveBlock al fondo.
  if (diaActual < MIN_DIAS || diasConGasto < MIN_SPEND_DAYS) {
    return (
      <ControlV2AlcanciaCardEmpty
        diasConGasto={diasConGasto}
        familyId={familyId}
        goal={goal}
        monthlyReserveAmount={monthlyReserveAmount}
      />
    )
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

        <ReserveBlock
          familyId={familyId}
          monthlyReserveAmount={monthlyReserveAmount}
          goal={goal}
        />
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

// ── ReserveBlock — self-contained ────────────────────────────────────
//
// Bloque indigo + 2 CTAs + NumericEditSheet para administrar la
// reserva acumulada. Extraído del Impl para poder reusarse en el
// empty state (cuando no hay días suficientes para el vault pero SÍ
// hay reserva en DB). Maneja su propio sheet state y mutation.
//
// Render nullable: si reserve <= 0 retorna null y el parent no
// necesita gate extra.
interface ReserveBlockProps {
  familyId: string
  monthlyReserveAmount: number
  goal: SavingsGoal | null
}

function ReserveBlock({
  familyId,
  monthlyReserveAmount,
  goal,
}: ReserveBlockProps) {
  const { theme } = useAppTheme()
  const isDark = theme.isDark
  const text = theme.colors.text
  const reserveColor = isDark ? '#A5B4FC' : '#4F46E5'
  const reserveBg = isDark ? 'rgba(165,180,252,0.14)' : 'rgba(99,102,241,0.10)'
  const reserveBorder = isDark
    ? 'rgba(165,180,252,0.36)'
    : 'rgba(99,102,241,0.32)'

  const reserveMutation = useApplyReserveDecision(familyId)
  const [sheetMode, setSheetMode] = useState<'cycle' | 'meta' | null>(null)
  const [draft, setDraft] = useState('')

  useEffect(() => {
    if (sheetMode !== null) {
      setDraft(serializePrice(monthlyReserveAmount))
    }
  }, [sheetMode, monthlyReserveAmount])

  const parsed = useMemo(() => parsePrice(draft), [draft])
  const isValid =
    Number.isFinite(parsed) && parsed > 0 && parsed <= monthlyReserveAmount

  const openSumar = () => {
    void triggerHaptic('selection')
    setSheetMode('cycle')
  }
  const openMeta = () => {
    if (!goal) {
      void triggerHaptic('selection')
      Alert.alert(
        'Aún no tienes meta',
        'Crea tu meta de ahorro desde Ajustes → Metas para poder aportar la reserva.',
      )
      return
    }
    void triggerHaptic('selection')
    setSheetMode('meta')
  }

  const handleSubmit = () => {
    if (!isValid || !sheetMode) return
    reserveMutation.mutate(
      {
        amount: parsed,
        target: sheetMode,
        metaGoalId: sheetMode === 'meta' ? goal?.id : undefined,
      },
      {
        onSuccess: () => {
          void triggerHaptic('success')
          setSheetMode(null)
          setDraft('')
        },
        onError: (err) => {
          void triggerHaptic('error')
          Alert.alert(
            'No pudimos usar la reserva',
            err instanceof Error ? err.message : 'Reintenta en un momento.',
          )
        },
      },
    )
  }

  if (monthlyReserveAmount <= 0) return null

  return (
    <>
      <View
        style={[
          styles.reserveSection,
          { backgroundColor: reserveBg, borderColor: reserveBorder },
        ]}
      >
        <View style={styles.reserveHeader}>
          <View style={[styles.reserveDot, { backgroundColor: reserveColor }]} />
          <Text
            style={[styles.reserveLabel, { color: reserveColor }]}
            numberOfLines={1}
          >
            RESERVA ACUMULADA
          </Text>
          <Text style={[styles.reserveAmount, { color: text }]} numberOfLines={1}>
            {formatMoney(monthlyReserveAmount)}
          </Text>
        </View>
        <View style={styles.reserveActionsRow}>
          <Pressable
            onPress={openSumar}
            accessibilityRole="button"
            accessibilityLabel="Sumar reserva al mes actual"
            disabled={reserveMutation.isPending}
            style={({ pressed }) => [
              styles.reserveAction,
              {
                backgroundColor: reserveBg,
                borderColor: reserveBorder,
                opacity: pressed ? 0.78 : 1,
              },
            ]}
          >
            <MaterialIcons name="trending-up" size={14} color={reserveColor} />
            <Text
              style={[styles.reserveActionText, { color: reserveColor }]}
              numberOfLines={1}
            >
              Sumar al mes
            </Text>
          </Pressable>
          <Pressable
            onPress={openMeta}
            accessibilityRole="button"
            accessibilityLabel="Aportar reserva a tu meta de ahorro"
            disabled={reserveMutation.isPending}
            style={({ pressed }) => [
              styles.reserveAction,
              {
                backgroundColor: reserveBg,
                borderColor: reserveBorder,
                opacity: pressed ? 0.78 : 1,
              },
            ]}
          >
            <MaterialIcons name="flag" size={14} color={reserveColor} />
            <Text
              style={[styles.reserveActionText, { color: reserveColor }]}
              numberOfLines={1}
            >
              A una meta
            </Text>
          </Pressable>
        </View>
      </View>

      <NumericEditSheet
        visible={sheetMode !== null}
        title={
          sheetMode === 'cycle'
            ? 'Sumar reserva al mes'
            : 'Aportar reserva a tu meta'
        }
        subtitle={`Reserva disponible: ${formatMoney(monthlyReserveAmount)}`}
        rawValue={draft}
        onChangeRawValue={setDraft}
        formatDisplay={(raw) => formatPriceInputValue(raw, false)}
        displayEyebrow="MONTO A USAR"
        displayPlaceholder="$ 0"
        maxIntegerDigits={11}
        maxDecimalDigits={2}
        numpadCollapsedByDefault
        saveLabel={sheetMode === 'cycle' ? 'Sumar al mes' : 'Aportar a meta'}
        saveDisabled={!isValid}
        isSaving={reserveMutation.isPending}
        onSave={handleSubmit}
        onClose={() => {
          if (reserveMutation.isPending) return
          setSheetMode(null)
        }}
      />
    </>
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
interface ControlV2AlcanciaCardEmptyProps {
  diasConGasto: number
  familyId: string
  goal: SavingsGoal | null
  monthlyReserveAmount: number
}

function ControlV2AlcanciaCardEmpty({
  diasConGasto,
  familyId,
  goal,
  monthlyReserveAmount,
}: ControlV2AlcanciaCardEmptyProps) {
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

        {/* Reserva acumulada: vive FUERA del paywall de "días con gasto".
            Si el user tiene plata en reserva, debe poder administrarla
            independiente de que la sugerencia de vault aún no esté
            lista. El ReserveBlock se auto-renderea nullable. */}
        <ReserveBlock
          familyId={familyId}
          monthlyReserveAmount={monthlyReserveAmount}
          goal={goal}
        />
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
  // ── Reserve admin block (Spec B) ────────────────────────────
  reserveSection: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  reserveHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  reserveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  reserveLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    flexShrink: 1,
  },
  reserveAmount: {
    marginLeft: 'auto',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  reserveActionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  reserveAction: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
  },
  reserveActionText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
})

// Memo: Alcancia tiene Pressables + Alert handler. Sin memo cada
// render del parent recreaba el árbol incluyendo los useState locales.
export const ControlV2AlcanciaCard = memo(ControlV2AlcanciaCardImpl)
