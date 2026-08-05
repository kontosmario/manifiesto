import { memo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import Animated from 'react-native-reanimated'
import { MaterialIcons } from '@expo/vector-icons'
import { BreatheDot } from '@/components/home/animated/breathe-dot'
import { CountUpText } from '@/components/home/animated/count-up-text'
import { RiseView } from '@/components/home/animated/rise-view'
import { QuickAddSavingsSheet } from '@/components/home/quick-add-savings-sheet'
import { CreateSavingsGoalWizardSheet } from '@/components/savings-goals/create-savings-goal-wizard-sheet'
import { StatTile } from '@/components/ui/stat-tile'
import { useAddSavingsContribution } from '@/features/savings-goals/use-add-savings-contribution'
import { useUpsertSavingsGoal } from '@/features/savings-goals/use-upsert-savings-goal'
import type { SavingsGoal } from '@/features/savings-goals/savings-goal.model'
import { goalEmojiText } from '@/features/savings-goals/goal-icon'
import { useStreak } from '@/features/streaks/use-streak'
import { usePressScale } from '@/hooks/use-press-scale'
import { triggerHaptic } from '@/lib/haptics'
import { useAppTheme } from '@/theme/theme-provider'
import { formatMoney, formatMoneyShort } from '@/utils/money'
import { ControlV2AlcanciaCardEmpty } from './alcancia-parts/control-v2-alcancia-card-empty'
import { ReserveBlock } from './alcancia-parts/reserve-block'
import { toast } from '@/lib/toast-bus'

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
  const { t } = useTranslation()
  const isDark = theme.isDark
  const streakQuery = useStreak(familyId, userId)
  const globalStreak = streakQuery.data?.currentStreak ?? 0
  const freezeTokens = streakQuery.data?.freezeTokens ?? 0

  const [sheetOpen, setSheetOpen] = useState(false)
  const [wizardOpen, setWizardOpen] = useState(false)
  const addMutation = useAddSavingsContribution(goal?.familyId ?? familyId, userId)
  // Mutation para reactivar una meta inactiva sin tener que ir a
  // Settings. Reusa upsert con todos los fields existentes + isActive=true.
  // Pasamos userId también: sin él, syncAllAfterMutation no invalida
  // home_snapshot (gate `if (userId)`). Resultado: la MetaCard del
  // Home podía no aparecer después de activar la meta desde aquí hasta
  // expirar el staleTime (60s) o force-quit. Code review v3 finding.
  const upsertGoal = useUpsertSavingsGoal(familyId, userId)

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
        userId={userId}
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

  // Active states for the primary CTA. 3 estados posibles:
  //   - no goal (null)         → "Crear meta de ahorro" → wizard
  //   - goal inactivo          → "Activar meta · 🎯 Title" → upsert(isActive=true)
  //   - goal activo            → "Mover \$X a tu meta" / "Sumar..." → quick-add sheet
  // `hasGoal` se mantiene como "goal activo" para no romper el resto
  // de la card (eyebrow chip, progress, etc.). El estado "inactiva"
  // se trata como afterthought de UX: la meta existe pero el resto del
  // card debe mostrarse en modo "esperando reactivación".
  const hasActiveGoal = goal != null && goal.isActive
  const hasInactiveGoal = goal != null && !goal.isActive
  const hasGoal = hasActiveGoal // alias para el resto del código existente
  const canMove = hasActiveGoal && vault > 0
  const ctaLabel = hasInactiveGoal
    ? t('control:alcancia.ctaActivar', { emoji: goalEmojiText(goal.emoji), title: goal.title }).replace(/\s{2,}/g, ' ').trim()
    : !hasActiveGoal
      ? t('control:alcancia.ctaCrear')
      : vault > 0
        ? t('control:alcancia.ctaMover', { amount: formatMoneyShort(vault) })
        : t('control:alcancia.ctaSumar')

  const handleCtaPress = () => {
    if (hasInactiveGoal && goal != null) {
      // Reactivar la meta inline — un solo tap. Si ya hay sugerencia
      // de aporte (vault > 0), después de activar el card se
      // re-renderea con la rama "active" donde el siguiente tap
      // ya abre el quick-add sheet.
      void triggerHaptic('selection')
      upsertGoal.mutate({
        input: {
          title: goal.title,
          emoji: goal.emoji,
          goalAmount: goal.goalAmount,
          currentAmount: goal.currentAmount,
          targetMonths: goal.targetMonths,
          isActive: true,
        },
        existingId: goal.id,
      })
      return
    }
    if (!hasActiveGoal) {
      // No goal yet — open the inline wizard. Once the user completes
      // the 4 steps, the savings-goal query invalidates and this card
      // re-renders with the new goal so no further plumbing is needed
      // here (the wizard's `onCreated` simply closes itself).
      void triggerHaptic('selection')
      setWizardOpen(true)
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
          toast.error(
            `${t('control:alcancia.errorSumarTitle')} · ${err instanceof Error ? err.message : t('control:alcancia.errorRetry')}`,
          )
        },
      },
    )
  }

  const subSpendDays = t('control:alcancia.subSpendDays', {
    ganadores: diasGanadores,
    total: Math.max(closedDays, diasGanadores),
  })
  const subSpendCopy =
    vault > 0
      ? t('control:alcancia.subSpendOver', { range: subSpendDays })
      : closedDays === 0
        ? t('control:alcancia.subSpendNoClosed')
        : t('control:alcancia.subSpendUnder')

  return (
    <RiseView delay={180}>
      <View
        style={[styles.card, { backgroundColor: cardBg, borderColor: accentBorder }]}
      >
        <View style={styles.eyebrowRow}>
          <BreatheDot size={7} color={accentFg} glow={accentFg} />
          <Text style={[styles.eyebrow, { color: accentFg }]} numberOfLines={1}>
            {t('control:alcancia.eyebrow')}
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
                {t('control:alcancia.metaChip', { pct: goalPct })}
              </Text>
            </View>
          ) : hasInactiveGoal ? (
            // Chip alternativo cuando la meta existe pero está inactiva.
            // Tono muted (textMuted en lugar de success) → el user
            // entiende que la meta está pausada sin perder el contexto.
            <View
              style={[
                styles.metaChip,
                {
                  backgroundColor: isDark
                    ? 'rgba(255,255,255,0.06)'
                    : 'rgba(15,42,30,0.06)',
                  borderColor: theme.colors.line,
                },
              ]}
            >
              <MaterialIcons name="pause" size={11} color={muted} />
              <Text
                style={[styles.metaChipText, { color: muted }]}
                numberOfLines={1}
              >
                {t('control:alcancia.metaInactiva')}
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
          disabled={addMutation.isPending || upsertGoal.isPending}
        >
          <Animated.View
            style={[
              styles.cta,
              {
                // ctaEnabled: canMove (vault > 0 con goal activo), no-goal
                // (crear), o hasInactiveGoal (activar). Estos 3 estados
                // pintan el CTA con tono accent. "Sumar sin vault" cae
                // a tono muted (sigue presionable pero menos prominente).
                backgroundColor:
                  canMove || !hasActiveGoal || hasInactiveGoal ? ctaBg : tileBg,
                borderColor:
                  canMove || !hasActiveGoal || hasInactiveGoal
                    ? ctaBorder
                    : tileBorder,
                opacity:
                  addMutation.isPending || upsertGoal.isPending ? 0.5 : 1,
              },
              ctaPress.animatedStyle,
            ]}
          >
            <MaterialIcons
              name={
                hasInactiveGoal
                  ? 'play-arrow'
                  : hasActiveGoal
                    ? 'arrow-forward'
                    : 'add'
              }
              size={16}
              color={
                canMove || !hasActiveGoal || hasInactiveGoal ? accentFg : muted
              }
            />
            <Text
              style={[
                styles.ctaText,
                {
                  color:
                    canMove || !hasActiveGoal || hasInactiveGoal
                      ? accentFg
                      : muted,
                },
              ]}
              numberOfLines={1}
            >
              {addMutation.isPending
                ? t('control:alcancia.ctaSumando')
                : upsertGoal.isPending
                  ? t('control:alcancia.ctaActivando')
                  : ctaLabel}
            </Text>
            {hasActiveGoal && vault > 0 ? (
              <MaterialIcons name="chevron-right" size={16} color={accentFg} />
            ) : null}
          </Animated.View>
        </Pressable>

        <View style={styles.tilesRow}>
          <StatTile
            iconName="eco"
            iconColor={accentFg}
            label={t('control:alcancia.tileSinGastos')}
            value={String(noSpendCount)}
            sub={
              closedDays > 0
                ? t('control:alcancia.tileSinGastosSub', {
                    count: noSpendCount,
                    total: closedDays,
                  })
                : t('control:alcancia.tileSinGastosSubDefault')
            }
            bg={tileBg}
            border={tileBorder}
            text={text}
            muted={muted}
          />
          <StatTile
            iconName="trending-down"
            iconColor={accentFg}
            label={t('control:alcancia.tileBajoCupo')}
            value={`${diasGanadores}`}
            sub={
              rachaBajoCupo > 0
                ? t('control:alcancia.tileBajoCupoRacha', { count: rachaBajoCupo })
                : t('control:alcancia.tileBajoCupoSub')
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
            label={t('control:alcancia.tileRacha')}
            value={t('control:alcancia.tileRachaValue', { count: globalStreak })}
            sub={
              freezeTokens > 0
                ? t('control:alcancia.tileRachaEscudos', { count: freezeTokens })
                : t('control:alcancia.tileRachaSub')
            }
            bg={tileBg}
            border={tileBorder}
            text={text}
            muted={muted}
          />
        </View>

        <ReserveBlock
          familyId={familyId}
          userId={userId}
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

      {!hasGoal ? (
        <CreateSavingsGoalWizardSheet
          visible={wizardOpen}
          familyId={familyId}
          userId={userId}
          onCreated={() => setWizardOpen(false)}
          onClose={() => setWizardOpen(false)}
        />
      ) : null}

    </RiseView>
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
  // minWidth:0 → la columna del monto encoge en la fila flex (el glyph de la
  // derecha queda fijo; el monto no lo empuja afuera de la card).
  heroFlex: { flex: 1, minWidth: 0 },
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
})

// Memo: Alcancia tiene Pressables + Alert handler. Sin memo cada
// render del parent recreaba el árbol incluyendo los useState locales.
export const ControlV2AlcanciaCard = memo(ControlV2AlcanciaCardImpl)
