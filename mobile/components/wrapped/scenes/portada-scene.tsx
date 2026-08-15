import { useEffect } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'
import { FernLogo } from '@/components/auth/fern-logo'
import { decorativeDurations, motionEasings } from '@/lib/motion/tokens'
import { cssGradient } from '@/theme/neo-tokens'
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
 * 01 Portada — sello editorial en la noche (HTML:41–65).
 * Tag "CIERRE DE CICLO" · sello raised 206/162 con logo + "EDICIÓN Nº N"
 * + rango · título · chip inset del ciclo · Brot `wave` con burbuja.
 * El CTA ("Abrir la edición ›") vive en el pie del orquestador.
 */
export function PortadaScene({
  payload,
  args,
}: {
  payload: CycleWrappedPayload
  args: SceneRenderArgs
}) {
  const { t } = useTranslation()
  const spec = useWrappedSpec().portada

  return (
    <View style={[styles.root, { gap: wrGap(22, args.compact) }]}>
      <WrTag style={styles.center}>{t('control:wrapped.edicion.tagPortada')}</WrTag>

      <SelloEdicion payload={payload} args={args} />

      <WrText style={[wrType(spec.titulo), styles.center]}>
        {t('control:wrapped.edicion.portadaTitulo')}
      </WrText>

      <WrChip tokens={spec.chipRango}>
        {t('control:wrapped.edicion.chipRango', {
          rango: payload.periodRangeDisplay.toUpperCase(),
          dias: payload.cycleDays,
          movs: payload.expensesCount,
        })}
      </WrChip>

      <WrBrotBubble
        pose="wave"
        size={wrBlock(spec.brotSize, args.compact)}
        side="left"
        active={args.active}
        text={t('control:wrapped.edicion.burbujaPortada')}
        maxWidth={230}
      />
    </View>
  )
}

/** Sello: círculo raised 206 + interior inset 162, entra scale 1.06→1. */
function SelloEdicion({
  payload,
  args,
}: {
  payload: CycleWrappedPayload
  args: SceneRenderArgs
}) {
  const { t } = useTranslation()
  const wrapped = useWrappedSpec()
  const base = wrapped.portada.sello
  // El sello es el bloque fijo más grande de todo el wrapped (206pt): en
  // pantalla baja se reduce con el resto de la composición.
  const size = wrBlock(base.size, args.compact)
  const s = {
    ...base,
    size,
    interior: {
      ...base.interior,
      size: Math.round(base.interior.size * (size / base.size)),
    },
  }
  const settle = useSharedValue(0)

  useEffect(() => {
    if (!args.active) return
    settle.value = withTiming(1, {
      duration: args.reduced
        ? decorativeDurations.wrappedReducedFade
        : decorativeDurations.wrappedSello,
      easing: motionEasings.enterSmooth,
    })
  }, [args.active, args.reduced, settle])

  const style = useAnimatedStyle(() => ({
    opacity: settle.value,
    transform: [
      {
        scale:
          WRAPPED_ANIM.selloScaleFrom -
          (WRAPPED_ANIM.selloScaleFrom - 1) * settle.value,
      },
    ],
  }))

  // DOS CAPAS: el `Animated.View` externo SÓLO anima; el material con
  // `experimental_backgroundImage` va en una `View` estática adentro.
  // Animar un nodo que lleva ese gradiente lo hace pintar una forma
  // rectangular fantasma fuera de su caja (QA del owner 2026-08-13).
  return (
    <Animated.View style={[{ alignSelf: 'center' }, style]}>
      <View
        style={[
          cssGradient(s.bgCss, s.bgFallback),
          {
            width: s.size,
            height: s.size,
            borderRadius: s.size / 2,
            boxShadow: s.boxShadow,
            alignItems: 'center',
            justifyContent: 'center',
          },
        ]}
      >
      <View
        style={[
          wrWell({
            bg: s.interior.bg,
            boxShadow: s.interior.boxShadow,
            radius: s.interior.size / 2,
            hairline: wrapped.shell.wellHairline,
          }),
          {
            width: s.interior.size,
            height: s.interior.size,
            alignItems: 'center',
            justifyContent: 'center',
            gap: s.interior.gap,
          },
        ]}
      >
        <FernLogo size={s.logo.width} palette={wrapped.shell.logoPalette} iconMode />
        <WrText style={wrType(s.kicker)}>
          {t('control:wrapped.edicion.selloKicker')}
        </WrText>
        {payload.editionNumber != null ? (
          <WrText style={wrType(s.numero, { numeric: true })}>
            {t('control:wrapped.edicion.selloNumero', { n: payload.editionNumber })}
          </WrText>
        ) : null}
        <WrText style={[wrType(s.rango), styles.center]}>
          {payload.selloRango}
        </WrText>
        </View>
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  center: { textAlign: 'center' },
  root: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
})
