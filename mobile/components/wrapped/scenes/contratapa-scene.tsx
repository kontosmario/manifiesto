import { useEffect } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'
import { FernLogo } from '@/components/auth/fern-logo'
import { CountUpText } from '@/components/home/animated/count-up-text'
import { decorativeDurations, motionEasings } from '@/lib/motion/tokens'
import { cssGradient } from '@/theme/neo-tokens'
import { formatMoneyShort, formatMoneyWithSign } from '@/utils/money'
import type { CycleWrappedPayload } from '@/lib/cycle-wrapped-emitter'
import { WRAPPED_ANIM } from '../wrapped-spec'
import {
  WrBrotBubble,
  WrChip,
  WrTag,
  WrText,
  useWrappedSpec,
  wrGap,
  wrBlock,
  wrType,
  wrWell,
} from '../wrapped-primitives'
import type { SceneRenderArgs } from './types'

/**
 * 07 Contratapa — la edición va a la estantería (HTML:204–228).
 * Chip de la decisión tomada en 06 · estantería (pozo inset con hasta 2
 * mini-cards pasadas + la NUEVA con logo y borde verde que "baja" al
 * estante) · listón · guardado acumulado · Brot `love` + despedida.
 */
export function ContratapaScene({
  payload,
  args,
  decisionChip,
}: {
  payload: CycleWrappedPayload
  args: SceneRenderArgs
  /** Texto del chip de decisión ("✓ Sobrante → Meta …"). Null = sin chip. */
  decisionChip: string | null
}) {
  const { t } = useTranslation()
  const spec = useWrappedSpec().contratapa
  const shelf = payload.shelf

  return (
    <View style={[styles.root, { gap: wrGap(18, args.compact) }]}>
      <WrTag>{t('control:wrapped.edicion.tagContratapa')}</WrTag>
      <WrText style={wrType(spec.titulo)}>
        {payload.editionNumber != null
          ? t('control:wrapped.edicion.contratapaTitulo', { n: payload.editionNumber })
          : t('control:wrapped.edicion.contratapaTituloSinN')}
      </WrText>

      {decisionChip ? (
        <WrChip tokens={spec.chipDecision} style={styles.chipLeft}>
          {decisionChip}
        </WrChip>
      ) : null}

      {shelf ? <Estanteria payload={payload} args={args} /> : null}

      <WrBrotBubble
        pose="love"
        size={wrBlock(spec.brotSize, args.compact)}
        side="left"
        active={args.active}
        text={t('control:wrapped.edicion.despedida')}
        maxWidth={spec.despedidaMaxWidth}
      />
    </View>
  )
}

// ─── Estantería ──────────────────────────────────────────────────────

function Estanteria({
  payload,
  args,
}: {
  payload: CycleWrappedPayload
  args: SceneRenderArgs
}) {
  const { t } = useTranslation()
  const wrapped = useWrappedSpec()
  const spec = wrapped.contratapa
  const e = spec.estante
  const shelf = payload.shelf
  if (!shelf) return null
  // Mini-cards: [más vieja, más nueva de las previas, NUEVA] — el
  // mockup dibuja ABRIL · MAYO · JUNIO✦NUEVA (HTML:214).
  const previous = [...shelf.previous].reverse()

  return (
    <View
      style={[
        wrWell({
          bg: e.bg,
          boxShadow: e.boxShadow,
          radius: e.radius,
          hairline: wrapped.shell.wellHairline,
        }),
        {
          paddingTop: e.paddingTop,
          paddingHorizontal: e.paddingH,
          paddingBottom: e.paddingBottom,
          gap: 12,
        },
      ]}
    >
      <View style={[styles.estanteRow, { gap: e.gap }]}>
        {previous.map((prev) => (
          <MiniCard
            key={prev.label}
            label={monthWord(prev.label)}
            saldo={prev.saldo}
          />
        ))}
        <MiniCardNueva payload={payload} args={args} />
      </View>

      <View
        style={{
          height: spec.liston.height,
          borderRadius: spec.liston.radius,
          backgroundColor: spec.liston.bg,
          boxShadow: spec.liston.boxShadow,
        }}
      />

      {shelf.accumulatedSaved != null ? (
        <WrText style={[wrType(spec.saldo), styles.center]} numberOfLines={2}>
          {t('control:wrapped.edicion.saldoAcumulado', {
            monto: formatMoneyWithSign(shelf.accumulatedSaved),
            count: shelf.totalEditions,
          })}
        </WrText>
      ) : null}
    </View>
  )
}

function MiniCard({ label, saldo }: { label: string; saldo: number }) {
  const m = useWrappedSpec().contratapa.miniCard
  return (
    <View
      style={[
        cssGradient(m.bgCss, m.bgFallback),
        styles.miniCard,
        {
          borderRadius: m.radius,
          paddingVertical: m.paddingV,
          paddingHorizontal: m.paddingH,
          boxShadow: m.boxShadow,
        },
      ]}
    >
      <WrText numberOfLines={1} style={wrType(m.label)}>
        {label}
      </WrText>
      <WrText
        numberOfLines={1}
        style={wrType({
          ...m.monto,
          ink: saldo >= 0 ? m.montoPositivoInk : m.montoNegativoInk,
        })}
      >
        {formatMoneyShort(saldo)}
      </WrText>
    </View>
  )
}

/** La edición recién cerrada baja al estante (translateY −14→0, 450ms). */
function MiniCardNueva({
  payload,
  args,
}: {
  payload: CycleWrappedPayload
  args: SceneRenderArgs
}) {
  const { t } = useTranslation()
  const wrapped = useWrappedSpec()
  const m = wrapped.contratapa.miniCard
  const n = wrapped.contratapa.miniCardNueva
  const drop = useSharedValue(0)
  useEffect(() => {
    if (!args.active) return
    drop.value = withDelay(
      args.reduced ? 0 : WRAPPED_ANIM.navCrossfadeMs,
      withTiming(1, {
        duration: args.reduced
          ? decorativeDurations.wrappedReducedFade
          : decorativeDurations.wrappedMiniDrop,
        easing: motionEasings.enterSmooth,
      }),
    )
  }, [args.active, args.reduced, drop])
  const style = useAnimatedStyle(() => ({
    opacity: drop.value,
    transform: [
      { translateY: WRAPPED_ANIM.miniCardDropFromPx * (1 - drop.value) },
    ],
  }))

  // DOS CAPAS a propósito: el `Animated.View` externo SÓLO anima
  // (opacity + translateY) y el material con `experimental_backgroundImage`
  // vive en una `View` estática adentro. Animar un nodo que lleva ese
  // gradiente lo hace pintar una forma rectangular fantasma que se sale de
  // su caja (mismo síntoma que tenía el halo del veredicto — QA del owner
  // 2026-08-13). Las mini-cards NO animadas, con el mismo `cssGradient`,
  // siempre se vieron bien: la variable es la animación, no el gradiente.
  return (
    <Animated.View style={[styles.miniCardNueva, style]}>
      <View
        style={[
          cssGradient(m.bgCss, m.bgFallback),
          styles.miniCard,
          {
            borderRadius: m.radius,
            paddingVertical: m.paddingV,
            paddingHorizontal: m.paddingH,
            boxShadow: n.boxShadow,
            borderWidth: n.borderWidth,
            borderColor: n.border,
          },
        ]}
      >
        <FernLogo size={n.logo.width} palette={wrapped.shell.logoPalette} iconMode />
        <WrText numberOfLines={1} style={wrType({ ...m.label, ink: n.labelInk })}>
          {monthWord(payload.periodLabel)} ✦ {t('control:wrapped.edicion.miniNueva')}
        </WrText>
        {/* Pineado al tamaño del diseño como el resto del Wrapped (ver
            WrText): la insignia tiene padding fijo y su label no crece. */}
        <CountUpText
          value={payload.savingsDelta}
          duration={WRAPPED_ANIM.filasCountUpMs}
          allowFontScaling={false}
          format={() => formatMoneyShort(payload.savingsDelta)}
          style={wrType({ ...m.monto, ink: n.montoInk })}
        />
      </View>
    </Animated.View>
  )
}

/** "Mayo 2026" → "MAYO" · "7 jul – 13 jul" → tal cual en mayúsculas. */
function monthWord(label: string): string {
  const first = label.trim().split(/\s+/)[0] ?? label
  return (first.length >= 3 ? first : label).toUpperCase()
}

const styles = StyleSheet.create({
  center: { textAlign: 'center' },
  chipLeft: { alignSelf: 'flex-start' },
  estanteRow: { alignItems: 'stretch', flexDirection: 'row' },
  miniCard: { alignItems: 'center', flex: 1, gap: 3, justifyContent: 'center' },
  miniCardNueva: { flex: 1.2 },
  root: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
})
