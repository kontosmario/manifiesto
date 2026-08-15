import { useEffect, useMemo } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'
import { triggerHaptic } from '@/lib/haptics'
import { decorativeDurations, motionEasings } from '@/lib/motion/tokens'
import { cssGradient } from '@/theme/neo-tokens'
import { formatMoney, formatMoneyShort, formatMoneyWithSign } from '@/utils/money'
import type { CycleWrappedPayload } from '@/lib/cycle-wrapped-emitter'
import { WRAPPED_ANIM, type WrappedSpec } from '../wrapped-spec'
import {
  WrBrotBubble,
  WrRise,
  WrTag,
  WrText,
  useWrappedSpec,
  wrGap,
  wrBlock,
  wrType,
  wrWell,
} from '../wrapped-primitives'
import type { SceneRenderArgs } from './types'

export type DestinoBranch = 'margen' | 'excedido'

export interface DestinoOptionDef {
  id: string
  emoji: string
  /** Fill pastel del tile (catálogo `neoCategoryPastels`, [OWNER-4]). */
  pastel: string
  titulo: string
  sub: string
  /** Tramo del sub en acento (monto de la meta / reserva). */
  subStrong?: string
  /** Barra de progreso de la meta (sólo la opción meta). */
  metaBar?: {
    /** 0..1 — fill total del track (actual + aporte) / objetivo. */
    fillPct: number
    /** 0..1 — corte actual/nuevo dentro del fill. */
    actualShare: number
  }
}

export interface DestinoSceneProps {
  payload: CycleWrappedPayload
  args: SceneRenderArgs
  branch: DestinoBranch
  selected: string | null
  onSelect: (id: string) => void
  /** false = modo lectura (decisión pasada o miembro sin permiso). */
  interactive: boolean
  /** En modo lectura: la opción decidida (marca fija). */
  decidedId?: string | null
  /** "Decidiste el {fecha}" bajo la lista (replay). */
  decidedAtLabel?: string | null
  /** Aviso "la decisión la confirma el dueño" (miembro con pending). */
  noOwnerHint?: boolean
}

/** Opciones visibles por rama. Los tiles pastel salen del spec (mismo
 *  catálogo en ambos temas, [OWNER-4]). */
export function buildDestinoOptions(
  payload: CycleWrappedPayload,
  branch: DestinoBranch,
  t: (key: string, opts?: Record<string, unknown>) => string,
  spec: WrappedSpec['destino'],
): DestinoOptionDef[] {
  if (branch === 'margen') {
    const sobrante = payload.pendingLeftoverDecision?.sobrante
      ?? payload.pastLeftoverDecision?.sobrante
      ?? Math.max(0, payload.savingsDelta)
    const goal = payload.activeGoal
    const options: DestinoOptionDef[] = [
      {
        id: 'reserva',
        emoji: '🐷',
        pastel: spec.tilePastel.reservar,
        titulo: t('control:wrapped.edicion.opciones.reservarTitulo'),
        sub: t('control:wrapped.edicion.opciones.reservarSub'),
      },
    ]
    if (goal) {
      const current = goal.currentAmount ?? 0
      const target = goal.goalAmount ?? 0
      const projected = current + sobrante
      options.push({
        id: 'meta',
        emoji: goal.emoji || '🎯',
        pastel: spec.tilePastel.meta,
        titulo: t('control:wrapped.edicion.opciones.metaTitulo'),
        sub:
          target > 0
            ? t('control:wrapped.edicion.opciones.metaSub', {
                titulo: goal.title,
                actual: formatMoneyShort(current),
                proyectado: formatMoneyShort(projected),
                objetivo: formatMoneyShort(target),
              })
            : goal.title,
        metaBar:
          target > 0
            ? {
                fillPct: Math.min(1, projected / target),
                actualShare: projected > 0 ? current / projected : 0,
              }
            : undefined,
      })
    }
    options.push({
      id: 'acumular',
      emoji: '🔄',
      pastel: spec.tilePastel.ciclo,
      titulo: t('control:wrapped.edicion.opciones.cicloTitulo'),
      sub: t('control:wrapped.edicion.opciones.cicloSub', {
        monto: formatMoneyWithSign(sobrante),
      }),
    })
    return options
  }

  // EXCEDIDO — plan de recuperación (HTML:553–588). Copys HONESTOS (plan
  // §6.5): la reserva NO salda el rojo — se suma al presupuesto del ciclo
  // nuevo; "ajustar" es lo que pasa solo (el rojo se descuenta) y no
  // persiste nada.
  const deficit = Math.abs(payload.savingsDelta)
  const reserve = payload.reserveAvailable ?? 0
  const options: DestinoOptionDef[] = []
  if (reserve > 0 && payload.onApplyReserve) {
    const cubrePct = deficit > 0 ? Math.min(100, Math.round((reserve / deficit) * 100)) : 100
    options.push({
      id: 'cubrir',
      emoji: '🐷',
      pastel: spec.tilePastel.reservar,
      titulo: t('control:wrapped.edicion.opciones.cubrirTitulo'),
      sub: t('control:wrapped.edicion.opciones.cubrirSub', {
        monto: formatMoney(reserve),
        pct: cubrePct,
      }),
    })
  }
  options.push(
    {
      id: 'ajustar',
      emoji: '📉',
      pastel: spec.tilePastel.ajustar,
      titulo: t('control:wrapped.edicion.opciones.ajustarTitulo'),
      sub: t('control:wrapped.edicion.opciones.ajustarSub'),
    },
    {
      id: 'revisar',
      emoji: '🔍',
      pastel: spec.tilePastel.revisar,
      titulo: t('control:wrapped.edicion.opciones.revisarTitulo'),
      sub: t('control:wrapped.edicion.opciones.revisarSub'),
    },
  )
  return options
}

/**
 * 06 Destino del sobrante / Plan de recuperación (HTML:165–201 · 553–588).
 * Option cards pozo→raised con borde y check (verde en MARGEN, durazno en
 * EXCEDIDO); tiles pastel del sistema; barra de meta de dos tramos.
 */
export function DestinoScene({
  payload,
  args,
  branch,
  selected,
  onSelect,
  interactive,
  decidedId,
  decidedAtLabel,
  noOwnerHint,
}: DestinoSceneProps) {
  const { t } = useTranslation()
  const wrapped = useWrappedSpec()
  const spec = wrapped.destino
  const options = useMemo(
    () => buildDestinoOptions(payload, branch, t, spec),
    [payload, branch, t, spec],
  )

  const excedido = branch === 'excedido'
  const monto = excedido
    ? formatMoneyWithSign(payload.savingsDelta)
    : formatMoneyWithSign(
        payload.pendingLeftoverDecision?.sobrante
          ?? payload.pastLeftoverDecision?.sobrante
          ?? Math.max(0, payload.savingsDelta),
      )

  const goal = payload.activeGoal
  const brotText = excedido
    ? t('control:wrapped.edicion.burbujaRecuperacion')
    : goal && goal.goalAmount != null && goal.currentAmount != null && goal.goalAmount > goal.currentAmount
      ? t('control:wrapped.edicion.burbujaDestinoMeta', {
          falta: formatMoneyShort(goal.goalAmount - goal.currentAmount),
        })
      : t('control:wrapped.edicion.burbujaDestinoSinMeta')

  const markedId = interactive ? selected : (decidedId ?? null)

  return (
    <View style={[styles.root, { gap: wrGap(16, args.compact) }]}>
      <WrTag>
        {excedido
          ? t('control:wrapped.edicion.tagRecuperacion')
          : t('control:wrapped.edicion.tagDestino')}
      </WrTag>

      <WrText style={wrType(spec.titular)}>
        {excedido
          ? t('control:wrapped.edicion.recuperacionTituloPre')
          : t('control:wrapped.edicion.destinoTituloPre')}
        <WrText
          style={wrType({
            ...spec.titular,
            ink: excedido ? spec.titularAccentExcedidoInk : spec.titularAccentInk,
          })}
        >
          {monto}
        </WrText>
        {t('control:wrapped.edicion.tituloPost')}
      </WrText>

      <View style={styles.lista}>
        {options.map((opt, idx) => (
          <WrRise
            key={opt.id}
            active={args.active}
            reduced={args.reduced}
            delayMs={idx * WRAPPED_ANIM.cardsStaggerMs}
          >
            <OptionCard
              def={opt}
              excedido={excedido}
              selected={markedId === opt.id}
              dimmed={!interactive && markedId != null && markedId !== opt.id}
              reduced={args.reduced}
              onPress={
                interactive
                  ? () => {
                      void triggerHaptic('selection')
                      onSelect(opt.id)
                    }
                  : undefined
              }
            />
          </WrRise>
        ))}
      </View>

      {decidedAtLabel ? (
        <WrText style={[wrType(wrapped.shell.marker), styles.hint]}>
          {decidedAtLabel}
        </WrText>
      ) : null}
      {noOwnerHint ? (
        <WrText style={[wrType(wrapped.shell.marker), styles.hint]}>
          {t('control:wrapped.edicion.noOwnerHint')}
        </WrText>
      ) : null}

      <WrBrotBubble
        pose="coach"
        size={wrBlock(spec.brotSize, args.compact)}
        side="left"
        active={args.active}
        text={brotText}
        maxWidth={240}
        compact
      />
    </View>
  )
}

// ─── Option card ─────────────────────────────────────────────────────

function OptionCard({
  def,
  excedido,
  selected,
  dimmed,
  reduced,
  onPress,
}: {
  def: DestinoOptionDef
  excedido: boolean
  selected: boolean
  dimmed: boolean
  reduced: boolean
  onPress?: () => void
}) {
  const wrapped = useWrappedSpec()
  const spec = wrapped.destino
  const o = spec.option
  const sel = useSharedValue(selected ? 1 : 0)
  useEffect(() => {
    sel.value = withTiming(selected ? 1 : 0, {
      duration: reduced
        ? decorativeDurations.wrappedReducedFade
        : decorativeDurations.wrappedSelect,
      easing: motionEasings.enterSmooth,
    })
  }, [selected, reduced, sel])

  const raisedStyle = useAnimatedStyle(() => ({ opacity: sel.value }))
  const checkStyle = useAnimatedStyle(() => ({
    opacity: sel.value,
    transform: [{ scale: 0.6 + sel.value * 0.4 }],
  }))
  const radioStyle = useAnimatedStyle(() => ({ opacity: 1 - sel.value }))

  const borderInk = excedido
    ? spec.option.seleccionadaExcedido.border
    : spec.option.seleccionada.border
  const checkBg = excedido
    ? spec.option.seleccionadaExcedido.checkBg
    : spec.option.seleccionada.check.bg

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled: !onPress }}
      accessibilityLabel={`${def.titulo}. ${def.sub}`}
      disabled={!onPress}
      onPress={onPress}
      style={[
        wrWell({
          bg: o.reposo.bg,
          boxShadow: o.reposo.boxShadow,
          radius: o.radius,
          hairline: wrapped.shell.wellHairline,
        }),
        {
          borderWidth: o.seleccionada.borderWidth,
          borderColor: selected ? borderInk : 'transparent',
          opacity: dimmed ? 0.45 : 1,
        },
      ]}
    >
      {/* Capa raised — crossfade pozo→raised al seleccionar (150ms).
          DOS CAPAS: el `Animated.View` sólo anima la opacidad y el
          material con `experimental_backgroundImage` va en una `View`
          estática adentro — animar el nodo que lleva el gradiente lo hace
          pintar una forma rectangular fantasma fuera de su caja (QA del
          owner 2026-08-13). */}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFillObject, raisedStyle]}
      >
        <View
          style={[
            StyleSheet.absoluteFillObject,
            cssGradient(o.seleccionada.bgCss, o.seleccionada.bgFallback),
            {
              borderRadius: o.radius - o.seleccionada.borderWidth,
              boxShadow: o.seleccionada.boxShadow,
            },
          ]}
        />
      </Animated.View>
      <View
        style={[
          styles.optionRow,
          {
            paddingVertical: o.paddingV,
            paddingHorizontal: o.paddingH,
            gap: o.gap,
          },
        ]}
      >
        <View
          style={[
            styles.tile,
            {
              width: o.tile.size,
              height: o.tile.size,
              borderRadius: o.tile.radius,
              backgroundColor: def.pastel,
            },
          ]}
        >
          <WrText style={{ fontSize: o.tile.emojiSize }}>{def.emoji}</WrText>
        </View>

        <View style={styles.optionBody}>
          <WrText style={wrType(o.titulo)}>{def.titulo}</WrText>
          <WrText style={wrType(o.sub)}>{def.sub}</WrText>
          {def.metaBar ? (
            <MetaBar
              fillPct={def.metaBar.fillPct}
              actualShare={def.metaBar.actualShare}
              animateNuevo={selected}
              reduced={reduced}
            />
          ) : null}
        </View>

        <View style={styles.markWrap}>
          <Animated.View
            style={[
              styles.radio,
              {
                width: o.reposo.radio.size,
                height: o.reposo.radio.size,
                borderRadius: o.reposo.radio.size / 2,
                borderWidth: o.reposo.radio.borderWidth,
                borderColor: o.reposo.radio.border,
              },
              radioStyle,
            ]}
          />
          <Animated.View
            style={[
              styles.check,
              {
                width: o.seleccionada.check.size,
                height: o.seleccionada.check.size,
                borderRadius: o.seleccionada.check.size / 2,
                backgroundColor: checkBg,
              },
              checkStyle,
            ]}
          >
            <WrText
              style={wrType({
                size: o.seleccionada.check.fontSize,
                weight: o.seleccionada.check.weight,
                ink: o.seleccionada.check.ink,
              })}
            >
              ✓
            </WrText>
          </Animated.View>
        </View>
      </View>
    </Pressable>
  )
}

// ─── Barra de progreso de la meta (dos tramos) ───────────────────────

/** Dos `View` hermanas — NUNCA `locations:[x,x]` en un gradiente (el
 *  corte duro no interpola parejo entre plataformas). El tramo nuevo
 *  anima su entrada 600ms al seleccionar la opción (README:89). */
function MetaBar({
  fillPct,
  actualShare,
  animateNuevo,
  reduced,
}: {
  fillPct: number
  actualShare: number
  animateNuevo: boolean
  reduced: boolean
}) {
  const m = useWrappedSpec().destino.metaBar
  const nuevo = useSharedValue(reduced ? 1 : 0)
  useEffect(() => {
    if (!animateNuevo) return
    nuevo.value = reduced
      ? 1
      : withDelay(
          decorativeDurations.wrappedSelect,
          withTiming(1, {
            duration: decorativeDurations.wrappedMetaBar,
            easing: motionEasings.enterSmooth,
          }),
        )
  }, [animateNuevo, reduced, nuevo])
  const nuevoStyle = useAnimatedStyle(() => ({
    opacity: nuevo.value,
  }))
  return (
    <View
      style={{
        height: m.height,
        borderRadius: m.radius,
        backgroundColor: m.trackBg,
        marginTop: 7,
        overflow: 'hidden',
      }}
    >
      <View style={[styles.metaFill, { width: `${Math.round(fillPct * 100)}%` }]}>
        <View style={{ flex: Math.max(0.0001, actualShare), backgroundColor: m.fillActual }} />
        <Animated.View
          style={[
            { flex: Math.max(0.0001, 1 - actualShare), backgroundColor: m.fillNuevo },
            nuevoStyle,
          ]}
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  check: { alignItems: 'center', justifyContent: 'center', position: 'absolute' },
  hint: { textAlign: 'center' },
  lista: { gap: 12 },
  markWrap: {
    alignItems: 'center',
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  metaFill: { flexDirection: 'row', height: '100%' },
  optionBody: { flex: 1, gap: 3 },
  optionRow: { alignItems: 'center', flexDirection: 'row' },
  radio: { position: 'absolute' },
  root: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  tile: { alignItems: 'center', justifyContent: 'center' },
})
