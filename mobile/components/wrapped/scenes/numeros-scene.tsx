import { StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { CountUpText } from '@/components/home/animated/count-up-text'
import { formatMoney } from '@/utils/money'
import type { CycleWrappedPayload } from '@/lib/cycle-wrapped-emitter'
import { WRAPPED_ANIM } from '../wrapped-spec'
import {
  WrBrotBubble,
  WrRise,
  WrTag,
  WrText,
  useWrappedSpec,
  wrGap,
  wrBlock,
  wrType,
} from '../wrapped-primitives'
import type { SceneRenderArgs } from './types'

/**
 * 02 Los números — índice editorial nocturno (HTML:69–87).
 * 3 filas label⇄valor con divisor de 2px; MOVIMIENTOS en verde; filas
 * con stagger 80ms (fade + rise) y count-up 800ms. Brot `think` a la
 * derecha con burbuja espejada.
 */
export function NumerosScene({
  payload,
  args,
}: {
  payload: CycleWrappedPayload
  args: SceneRenderArgs
}) {
  const { t } = useTranslation()
  const spec = useWrappedSpec().numeros
  const promedio =
    payload.cycleDays > 0 ? payload.totalSpent / payload.cycleDays : 0

  const rows: Array<{
    label: string
    value: number
    money: boolean
    accent?: boolean
  }> = [
    {
      label: t('control:wrapped.edicion.labelGastaste'),
      value: payload.totalSpent,
      money: true,
    },
    {
      label: t('control:wrapped.edicion.labelMovimientos'),
      value: payload.expensesCount,
      money: false,
      accent: true,
    },
    {
      label: t('control:wrapped.edicion.labelPromedio'),
      value: Math.round(promedio),
      money: true,
    },
  ]

  return (
    <View style={[styles.root, { gap: wrGap(20, args.compact) }]}>
      <WrTag>
        {payload.editionNumber != null
          ? t('control:wrapped.edicion.tagNumeros', { n: payload.editionNumber })
          : t('control:wrapped.edicion.tagNumerosSinN')}
      </WrTag>
      <WrText style={wrType(spec.titular)}>
        {t('control:wrapped.edicion.numerosTitulo')}
      </WrText>

      <View>
        {rows.map((row, idx) => (
          <WrRise
            key={row.label}
            active={args.active}
            reduced={args.reduced}
            delayMs={idx * WRAPPED_ANIM.filasStaggerMs}
          >
            <View
              style={[
                styles.fila,
                { paddingVertical: spec.fila.paddingV },
                idx < rows.length - 1
                  ? {
                      borderBottomWidth: spec.fila.dividerWidth,
                      borderBottomColor: spec.fila.divider,
                    }
                  : null,
              ]}
            >
              <WrText
                style={[wrType(spec.fila.label), styles.filaLabel]}
                numberOfLines={1}
              >
                {row.label}
              </WrText>
              {/* El valor escala por su largo formateado — un total de
                  8+ dígitos a 31px empujaba la fila fuera del borde.
                  allowFontScaling false = pineado al tamaño del diseño,
                  ni el OS ni la preferencia de la app lo tocan (réplica
                  a escala, ver WrText). */}
              <CountUpText
                value={row.value}
                duration={WRAPPED_ANIM.filasCountUpMs}
                allowFontScaling={false}
                format={(n) =>
                  row.money ? formatMoney(Math.round(n)) : `${Math.round(n)}`
                }
                style={wrType({
                  ...spec.fila.valor,
                  size: valueSize(
                    row.money ? formatMoney(row.value) : `${row.value}`,
                    spec.fila.valor.size,
                  ),
                  ink: row.accent ? spec.fila.valorAccentInk : spec.fila.valor.ink,
                })}
              />
            </View>
          </WrRise>
        ))}
      </View>

      <WrBrotBubble
        pose="think"
        size={wrBlock(spec.brotSize, args.compact)}
        side="right"
        active={args.active}
        text={t('control:wrapped.edicion.burbujaNumeros', {
          movs: payload.expensesCount,
        })}
        maxWidth={spec.burbujaMaxWidth}
      />
    </View>
  )
}

/** Tamaño del valor según su largo formateado — misma defensa que el
 *  monto héroe del veredicto (QA del owner 2026-08-13). */
function valueSize(formatted: string, base: number): number {
  if (formatted.length <= 10) return base
  if (formatted.length <= 12) return Math.min(base, 26)
  return Math.min(base, 22)
}

const styles = StyleSheet.create({
  fila: {
    alignItems: 'baseline',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  filaLabel: { flexShrink: 1, paddingRight: 12 },
  root: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
})
