import { useCallback, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { BrotMascot } from '@/components/brot'
import { ConfettiBurst } from '@/components/ui/confetti-burst'
import { CountUpText } from '@/components/home/animated/count-up-text'
import { sobranteThreshold } from '@/features/month-close/sobrante'
import { formatMoneyWithSign } from '@/utils/money'
import type { CycleWrappedPayload } from '@/lib/cycle-wrapped-emitter'
import { WRAPPED_ANIM } from '../wrapped-spec'
import {
  WrStamp,
  WrText,
  useWrappedSpec,
  wrBlock,
  wrGap,
  wrType,
} from '../wrapped-primitives'
import type { SceneRenderArgs } from './types'

export type VerdictState = 'margen' | 'excedido' | 'justo'

/**
 * Estado del veredicto — la banda JUSTO usa el MISMO umbral relativo que
 * gatea "¿hay decisión?" (`sobranteThreshold`, plan §6.3): si divergieran,
 * un cierre dentro de la banda diría "nada que decidir" en una superficie
 * y preguntaría en la otra.
 */
export function resolveVerdictState(payload: CycleWrappedPayload): VerdictState {
  const saldo = payload.savingsDelta
  if (saldo < 0) return 'excedido'
  if (saldo > sobranteThreshold(payload.monthlyIncome)) return 'margen'
  return 'justo'
}

/**
 * 05 El veredicto (HTML:147–163 · 536–551 · 590–605).
 * MARGEN: Brot radiant 150 (sin halo, [OWNER-8]) + monto crema 56/900 +
 * estampa verde que "sella" (scale 1.4→1 + haptic medio + burst).
 * EXCEDIDO: Brot worried, monto durazno 50/900, estampa que cae sin
 * rebote, sin partículas. JUSTO: Brot zen, estampa crema en fade.
 */
export function VeredictoScene({
  payload,
  args,
}: {
  payload: CycleWrappedPayload
  args: SceneRenderArgs
}) {
  const { t } = useTranslation()
  const wrapped = useWrappedSpec()
  const spec = wrapped.veredicto
  const state = resolveVerdictState(payload)
  const v = spec[state]
  const [burstToken, setBurstToken] = useState(0)

  const handleSealed = useCallback(() => {
    setBurstToken((n) => n + 1)
  }, [])

  const sub =
    state === 'margen'
      ? payload.previousCycle && payload.savingsDelta > payload.previousCycle.saldo
        ? t('control:wrapped.edicion.subMargenVs', {
            label: payload.previousCycle.label.toLowerCase(),
          })
        : t('control:wrapped.edicion.subMargenSolo')
      : state === 'excedido'
        ? t('control:wrapped.edicion.subExcedido')
        : t('control:wrapped.edicion.subJusto')

  // El monto héroe ESCALA con su largo: el conteo fluido corre en un
  // TextInput cuyo ancho se mide UNA vez al montar — un saldo de 8+
  // dígitos ("+$12.345.678") a 56px desborda el ancho útil y el campo
  // recorta (el owner lo vio como un "+" suelto). El tamaño se decide
  // acá, ANTES de montar, por el string final formateado.
  const formatted = formatMoneyWithSign(payload.savingsDelta)
  const heroSize =
    formatted.length <= 9
      ? v.monto.size
      : formatted.length <= 11
        ? Math.min(v.monto.size, 46)
        : formatted.length <= 13
          ? 40
          : 34

  return (
    <View style={[styles.root, { gap: wrGap(14, args.compact) }]}>
      {/* Brot SIN halo de View — ver [OWNER-8] en wrapped-spec.ts. El
          sprite `radiant` ya dibuja sus propios destellos. */}
      <View style={styles.brotWrap}>
        <BrotMascot
          pose={v.brot.pose}
          size={wrBlock(v.brot.size, args.compact)}
          animated={args.active}
          shadow={false}
        />
      </View>

      <WrText style={[wrType(spec.label), styles.center]} numberOfLines={1}>
        {t('control:wrapped.edicion.veredictoLabel')}
      </WrText>

      {/* `alignSelf: stretch` + textAlign center: el TextInput del conteo
          fluido ocupa TODO el ancho de la escena — sin eso, su ancho
          intrínseco queda medido con el "$0" inicial y recorta el monto
          final (los animatedProps no re-layoutan).
          `allowFontScaling={false}`: pineado como TODO el texto del Wrapped
          (ver WrText). El tamaño ya lo decide `heroSize` por el largo del
          string y la composición no tiene dónde crecer. */}
      <CountUpText
        value={payload.savingsDelta}
        duration={WRAPPED_ANIM.veredictoCountUpMs}
        flourish
        unit="moneyDelta"
        glowColor={v.estampaInk}
        allowFontScaling={false}
        format={() => formatted}
        accessibilityLabel={formatted}
        style={[
          wrType({ ...v.monto, size: heroSize }, { numeric: true }),
          styles.center,
          styles.heroStretch,
        ]}
      />

      <WrStamp
        label={t(`control:wrapped.edicion.estampa.${state}`)}
        ink={v.estampaInk}
        rotateDeg={v.estampaRotateDeg}
        mode={state === 'margen' ? 'sella' : state === 'excedido' ? 'cae' : 'fade'}
        active={args.active}
        reduced={args.reduced}
        delayMs={args.reduced ? 0 : WRAPPED_ANIM.veredictoCountUpMs}
        onSealed={state === 'margen' ? handleSealed : undefined}
      />

      <WrText
        style={[
          wrType(spec.sub),
          styles.center,
          styles.sub,
          state === 'excedido' ? { maxWidth: spec.excedido.subMaxWidth } : null,
        ]}
      >
        {sub}
      </WrText>

      {/* Burst de la estampa (12 partículas, README:88) — sólo MARGEN. */}
      {state === 'margen' && !args.reduced ? (
        <ConfettiBurst
          pulseToken={burstToken}
          originY={260}
          colors={wrapped.shell.particleColors}
        />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  brotWrap: { alignItems: 'center', justifyContent: 'center' },
  center: { textAlign: 'center' },
  heroStretch: { alignSelf: 'stretch' },
  root: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  sub: { alignSelf: 'center', maxWidth: 280 },
})
