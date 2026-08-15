import { StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { formatMoney } from '@/utils/money'
import type { CycleWrappedPayload } from '@/lib/cycle-wrapped-emitter'
import { WRAPPED_ANIM } from '../wrapped-spec'
import {
  WrBrotBubble,
  WrPop,
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

/**
 * 03 Top 3 — ranking tipográfico + fijos cumplidos (HTML:91–109).
 * Rank fantasma 58/900; #1 crema pleno con monto verde; #2–#3 en crema
 * desaturada. Entran #3→#1 con stagger 120ms y el #1 cierra con pop.
 * Strip inset de fijos (se oculta si el select no trajo las columnas).
 */
export function Top3Scene({
  payload,
  args,
}: {
  payload: CycleWrappedPayload
  args: SceneRenderArgs
}) {
  const { t } = useTranslation()
  const wrapped = useWrappedSpec()
  const spec = wrapped.top3
  const tops = payload.topCategories ?? []
  const showFijos =
    payload.fixedPaidCount != null &&
    payload.fixedPaidCount > 0 &&
    payload.totalFixedSpent != null

  return (
    <View style={[styles.root, { gap: wrGap(24, args.compact) }]}>
      <WrTag>{t('control:wrapped.edicion.tagTop3')}</WrTag>

      <View style={styles.lista}>
        {tops.map((cat, idx) => {
          // Animación #3→#1: el último delay es del puesto #1 (README:86).
          const delay = (tops.length - 1 - idx) * WRAPPED_ANIM.rankingStaggerMs
          const first = idx === 0
          const row = (
            <View style={styles.filaRank}>
              <WrText style={wrType(spec.rank, { numeric: true })}>{idx + 1}</WrText>
              <View style={styles.filaBody}>
                {/* Tamaños PLENOS del handoff (30/24 — HTML:97–99): con el
                    escalado del OS fijado en WrText, todo nombre del
                    catálogo entra a 393. Elipsis sólo de último recurso. */}
                <WrText
                  numberOfLines={1}
                  style={wrType(first ? spec.primero.nombre : spec.resto.nombre)}
                >
                  {cat.name}
                </WrText>
                <WrText
                  numberOfLines={1}
                  style={wrType(first ? spec.primero.monto : spec.resto.monto)}
                >
                  {formatMoney(cat.amount)} · {Math.round(cat.share * 100)}%
                </WrText>
              </View>
            </View>
          )
          return first ? (
            <WrPop key={cat.name} active={args.active} reduced={args.reduced} delayMs={delay}>
              {row}
            </WrPop>
          ) : (
            <WrRise key={cat.name} active={args.active} reduced={args.reduced} delayMs={delay}>
              {row}
            </WrRise>
          )
        })}
      </View>

      {showFijos ? (
        <WrRise
          active={args.active}
          reduced={args.reduced}
          delayMs={tops.length * WRAPPED_ANIM.rankingStaggerMs}
        >
          <View
            style={[
              wrWell({
                bg: spec.stripFijos.bg,
                boxShadow: spec.stripFijos.boxShadow,
                radius: spec.stripFijos.radius,
                hairline: wrapped.shell.wellHairline,
              }),
              {
                paddingVertical: spec.stripFijos.paddingV,
                paddingHorizontal: spec.stripFijos.paddingH,
              },
            ]}
          >
            <WrText
              style={wrType({
                size: spec.stripFijos.size,
                weight: spec.stripFijos.weight,
                lineHeight: spec.stripFijos.lineHeight,
                ink: spec.stripFijos.ink,
              })}
            >
              {t('control:wrapped.edicion.fijosStripPrefix')}
              <WrText
                style={wrType({
                  size: spec.stripFijos.size,
                  weight: 900,
                  ink: spec.stripFijos.strongInk,
                })}
              >
                {t('control:wrapped.edicion.fijosStripStrong', {
                  count: payload.fixedPaidCount ?? 0,
                })}
              </WrText>
              {t('control:wrapped.edicion.fijosStripMonto', {
                monto: formatMoney(payload.totalFixedSpent ?? 0),
              })}
            </WrText>
          </View>
        </WrRise>
      ) : null}

      <WrBrotBubble
        pose="wow"
        size={wrBlock(spec.brotSize, args.compact)}
        side="right"
        active={args.active}
        text={t('control:wrapped.edicion.burbujaTop3')}
        maxWidth={spec.burbujaMaxWidth}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  // `flex: 1` (no flexShrink): el body TOMA el ancho restante y sus
  // textos ajustan adentro — con flexShrink el ancho intrínseco del
  // nombre podía empujar la fila más allá del borde (texto cortado).
  filaBody: { flex: 1, gap: 2 },
  filaRank: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 16,
  },
  lista: { gap: 24 },
  root: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
})
