import { memo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { MaterialIcons } from '@expo/vector-icons'
import { BreatheDot } from '@/components/home/animated/breathe-dot'
import { RiseView } from '@/components/home/animated/rise-view'
import { useAppTheme } from '@/theme/theme-provider'
import { DARK_TAB_CANVAS } from '@/theme/palette'
import { getStateTokens } from '@/theme/state-tokens'
import type { IngresosCiclo } from '@/features/insights/use-control-v2-data'
import type { IncomeEventKind } from '@/features/income/use-income-events'
import { formatMoney, formatMoneyShort } from '@/utils/money'
import { monthShort } from '@/utils/date-format'

interface ControlV2IngresosCardProps {
  ingresos: IngresosCiclo
  /** Días del ciclo — para traducir el total a "+$X/día de cupo". */
  diasMes: number
}

const KIND_META: Record<
  IncomeEventKind,
  { labelKey: string; icon: 'swap-horiz' | 'workspace-premium' | 'card-giftcard' | 'attach-money' }
> = {
  transfer: { labelKey: 'control:ingresos.kindTransfer', icon: 'swap-horiz' },
  bonus: { labelKey: 'control:ingresos.kindBonus', icon: 'workspace-premium' },
  gift: { labelKey: 'control:ingresos.kindGift', icon: 'card-giftcard' },
  other: { labelKey: 'control:ingresos.kindOther', icon: 'attach-money' },
}

const MAX_VISIBLE = 3

/** "2026-06-04" → "4 jun" sin pasar por Date (evita el corrimiento
 *  timezone de `new Date('YYYY-MM-DD')`, que parsea como UTC). */
function formatFechaCorta(isoDate: string): string {
  const [y, m, d] = isoDate.split('-')
  // Date local anclada a mediodía para evitar el corrimiento timezone de
  // `new Date('YYYY-MM-DD')` (que parsea como UTC); solo se usa para el mes.
  const date = new Date(Number(y), Number(m) - 1, 1, 12, 0, 0, 0)
  const month = Number.isFinite(date.getTime()) ? monthShort(date) : ''
  return `${Number(d)} ${month}`
}

/**
 * "Entró este ciclo" — ingresos extra (income_events) del ciclo.
 *
 * Auditoría 2026-06-11: Home ya sumaba estos movimientos al
 * disponible pero Control los ignoraba por completo — ni en el cupo
 * ni visualmente. Esta card cierra la mitad visual: el adapter ya
 * los suma al ingreso efectivo, aquí el usuario VE qué entró y cuánto
 * suma a su cupo diario.
 *
 * Diseño:
 *  · Solo se monta con total > 0 (el screen la condiciona) — un ciclo
 *    sin ingresos extra no merece una card vacía.
 *  · Siempre `positive`: plata que entra nunca es una alerta.
 *  · Headline narrativo conecta el dato con la consecuencia accionable
 *    (+$X/día de cupo), no solo el monto crudo.
 *  · Lista inset (máx 3 + "+N más") sobre el canvas oscuro, mismo
 *    well que usan Cobertura y Alcancía.
 */
function ControlV2IngresosCardImpl({
  ingresos,
  diasMes,
}: ControlV2IngresosCardProps) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  const { total, movimientos } = ingresos
  if (total <= 0 || movimientos.length === 0) return null

  const tokens = getStateTokens('positive', theme)
  const cupoExtraDiario = diasMes > 0 ? total / diasMes : 0
  const visibles = movimientos.slice(0, MAX_VISIBLE)
  const ocultos = movimientos.length - visibles.length

  return (
    <RiseView delay={420}>
      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.isDark
              ? theme.colors.surfaceMuted
              : theme.colors.creamCard,
            borderColor: tokens.border,
          },
        ]}
      >
        <View style={styles.eyebrowRow}>
          <BreatheDot size={7} color={tokens.fg} glow={tokens.fg} />
          <Text style={[styles.eyebrow, { color: tokens.fg }]} numberOfLines={1}>
            {t('control:ingresos.eyebrow')}
          </Text>
          <View
            style={[
              styles.statePill,
              { backgroundColor: tokens.bg, borderColor: tokens.border },
            ]}
          >
            <MaterialIcons name="trending-up" size={11} color={tokens.fg} />
            <Text
              style={[styles.statePillText, { color: tokens.fg }]}
              numberOfLines={1}
            >
              +{formatMoneyShort(total)}
              {movimientos.length > 1 ? ` · ${movimientos.length}` : ''}
            </Text>
          </View>
        </View>

        <Text style={[styles.headline, { color: theme.colors.text }]}>
          {t('control:ingresos.headline', {
            total: formatMoney(total),
            perDia: formatMoneyShort(cupoExtraDiario),
          })}
        </Text>

        <View
          style={[
            styles.list,
            {
              backgroundColor: theme.isDark
                ? DARK_TAB_CANVAS
                : theme.colors.surfaceMuted,
              borderColor: theme.colors.border,
            },
          ]}
        >
          {visibles.map((mov, index) => {
            const meta = KIND_META[mov.kind] ?? KIND_META.other
            return (
              <View
                key={mov.id}
                style={[
                  styles.row,
                  index > 0 && {
                    borderTopWidth: StyleSheet.hairlineWidth,
                    borderTopColor: theme.colors.border,
                  },
                ]}
              >
                <MaterialIcons name={meta.icon} size={15} color={tokens.fg} />
                <View style={styles.rowBody}>
                  <Text
                    style={[styles.rowTitle, { color: theme.colors.text }]}
                    numberOfLines={1}
                  >
                    {mov.descripcion?.trim() || t(meta.labelKey)}
                  </Text>
                  <Text
                    style={[styles.rowSub, { color: theme.colors.textMuted }]}
                    numberOfLines={1}
                  >
                    {formatFechaCorta(mov.fecha)}
                    {mov.descripcion?.trim() ? ` · ${t(meta.labelKey)}` : ''}
                  </Text>
                </View>
                <Text
                  style={[styles.rowAmount, { color: tokens.fg }]}
                  numberOfLines={1}
                >
                  +{formatMoney(mov.monto)}
                </Text>
              </View>
            )
          })}
          {ocultos > 0 ? (
            <View
              style={[
                styles.row,
                {
                  borderTopWidth: StyleSheet.hairlineWidth,
                  borderTopColor: theme.colors.border,
                },
              ]}
            >
              <Text style={[styles.moreText, { color: theme.colors.textMuted }]}>
                {t('control:ingresos.more', { count: ocultos })}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
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
    flex: 1,
  },
  statePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    maxWidth: 200,
  },
  statePillText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  headline: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
    letterSpacing: -0.2,
  },
  headlineStrong: {
    fontWeight: '800',
  },
  list: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingVertical: 9,
  },
  rowBody: {
    flex: 1,
    gap: 1,
  },
  rowTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  rowSub: {
    fontSize: 10.5,
  },
  rowAmount: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'],
  },
  moreText: {
    fontSize: 11,
    fontWeight: '600',
  },
})

// Memo: card de solo-lectura — re-render solo cuando cambian los
// ingresos del ciclo o el largo del mes.
export const ControlV2IngresosCard = memo(ControlV2IngresosCardImpl)
