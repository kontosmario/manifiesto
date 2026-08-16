import { useMemo } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui/app-text'
import { useTranslation } from 'react-i18next'
import { MaterialIcons } from '@expo/vector-icons'
import { ModalCard } from '@/components/ui/modal-card'
import { NeoButton } from '@/components/ui/neo-button'
import { NeoSurface } from '@/components/ui/neo-surface'
import { SUPPORTS_INSET_SHADOW } from '@/components/wizard/inset-shadow-support'
import { useCategories } from '@/features/categories/use-categories'
import { useExpenses } from '@/features/expenses/use-expenses'
import {
  buildDondeAjustarModel,
  type DondeAjustarMode,
} from '@/features/insights/donde-ajustar-model'
import { usePayCycle } from '@/hooks/use-pay-cycle'
import { triggerHaptic } from '@/lib/haptics'
import { neoInk } from '@/theme/neo-ink'
import { neoRadii, neoTokens } from '@/theme/neo-tokens'
import { nunitoFamily } from '@/theme/typography'
import { useThemeTokens } from '@/theme/theme-provider'
import { currencyFormatter } from '@/utils/money'

interface DondeAjustarSheetProps {
  visible: boolean
  /** Qué CTA lo abrió — decide el encabezado. Ver `DondeAjustarMode`. */
  mode: DondeAjustarMode
  familyId: string
  /** Presupuesto variable que queda del ciclo (puede ser negativo). */
  restanteMes: number
  /** Proyección de sobrante al cierre (negativo = faltante). */
  sobrante: number
  diasRestantes: number
  promedioDiario: number
  fijosMes: number
  ingresoMes: number
  onClose: () => void
  /** Navega a la tab Gastos filtrada por la categoría. El sheet se cierra antes. */
  onOpenCategory: (categoryId: string) => void
  /** Navega a la tab Gastos sin filtro. */
  onOpenExpenses: () => void
  /** Navega a la tab Fijos (sólo se ofrece con fijos ≥35% del ingreso). */
  onOpenFijos: () => void
}

/**
 * Sheet de diagnóstico "Dónde ajustar" — el destino real de los CTAs del hero
 * de Control (ajustado/corto) y de la alcancía sin sobrante.
 *
 * Antes esos tres CTAs navegaban al ADMINISTRADOR del catálogo de categorías:
 * prometían "dónde ajustar / en qué recortar / ver en qué se fue" y entregaban
 * un CRUD sin un solo monto. Este sheet responde la promesa con los números
 * del ciclo: cuánto falta, cuánto puede costar cada día que queda, y en qué
 * categorías está la plata — cada una con salida directa a sus gastos.
 *
 * Mismo molde que los demás sheets de Control (`DailyGoalSheet`,
 * `QuickAddSavingsSheet`): in-tree + `ModalCard skin="neo"`.
 */
export function DondeAjustarSheet({
  visible,
  mode,
  familyId,
  restanteMes,
  sobrante,
  diasRestantes,
  promedioDiario,
  fijosMes,
  ingresoMes,
  onClose,
  onOpenCategory,
  onOpenExpenses,
  onOpenFijos,
}: DondeAjustarSheetProps) {
  const { t } = useTranslation()
  const theme = useThemeTokens()
  const neo = neoTokens(theme.mode)
  const ink = neoInk(theme.mode)
  // Cache caliente: mismas keys que Home/Gastos/Control — en la práctica no
  // agrega round-trips, sólo lee lo que la pantalla de atrás ya montó.
  const expensesQuery = useExpenses(familyId)
  const categoriesQuery = useCategories(familyId, 'expense')
  const payCycle = usePayCycle(familyId)

  const model = useMemo(
    () =>
      buildDondeAjustarModel({
        mode,
        expenses: expensesQuery.data ?? [],
        categories: categoriesQuery.data ?? [],
        cycleStart: payCycle.cycle.start,
        cycleEnd: payCycle.cycle.end,
        restanteMes,
        sobrante,
        diasRestantes,
        promedioDiario,
        fijosMes,
        ingresoMes,
      }),
    [
      mode,
      expensesQuery.data,
      categoriesQuery.data,
      payCycle.cycle.start,
      payCycle.cycle.end,
      restanteMes,
      sobrante,
      diasRestantes,
      promedioDiario,
      fijosMes,
      ingresoMes,
    ],
  )

  const headline =
    model.mode === 'corto'
      ? t('control:neo.ajustar.headlineCorto', {
          amount: currencyFormatter.format(model.headlineAmount),
        })
      : model.mode === 'ajustado'
        ? t('control:neo.ajustar.headlineAjustado', {
            amount: currencyFormatter.format(model.headlineAmount),
          })
        : t('control:neo.ajustar.headlineSinSobrante')

  const plan =
    model.nuevoCupo === null
      ? t('control:neo.ajustar.planCierreHoy')
      : model.cupoAgotado
        ? t('control:neo.ajustar.planSinCupo')
        : t('control:neo.ajustar.planConCupo', {
            count: Math.max(1, Math.floor(diasRestantes)),
            amount: currencyFormatter.format(model.nuevoCupo),
          })

  const wellFallback = SUPPORTS_INSET_SHADOW
    ? null
    : { borderWidth: 1, borderColor: neo.sheetDivider }

  const maxCategoryAmount = model.topCategories[0]?.amount ?? 0

  return (
    <ModalCard
      visible={visible}
      onClose={onClose}
      skin="neo"
      title={t('control:neo.ajustar.title')}
      subtitle={t('control:neo.ajustar.subtitle')}
      footer={
        <NeoButton
          label={t('control:neo.ajustar.verGastosCta')}
          onPress={onOpenExpenses}
          fullWidth
          icon={<MaterialIcons name="receipt-long" size={20} color={neo.ctaText} />}
        />
      }
    >
      <View style={styles.body}>
        {/* ── El número + el plan ─────────────────────────────────── */}
        <NeoSurface variant="raisedXl" radius={neoRadii.card} style={styles.hero}>
          <Text style={[styles.headline, { color: neo.text }]}>{headline}</Text>
          <Text
            style={[
              styles.plan,
              { color: model.cupoAgotado ? ink.warn : neo.textMuted },
            ]}
          >
            {plan}
          </Text>
          {model.ritmoActual > 0 && !model.cupoAgotado ? (
            <Text style={[styles.ritmo, { color: neo.textMuted }]}>
              {t('control:neo.ajustar.ritmoActual', {
                amount: currencyFormatter.format(model.ritmoActual),
              })}
            </Text>
          ) : null}
        </NeoSurface>

        {/* ── Dónde se va ─────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={[styles.eyebrow, { color: neo.textMuted }]}>
            {t('control:neo.ajustar.breakdownEyebrow')}
          </Text>
          {model.topCategories.length === 0 ? (
            <Text style={[styles.emptyLine, { color: neo.textMuted }]}>
              {t('control:neo.ajustar.breakdownEmpty')}
            </Text>
          ) : (
            <>
              {model.topCategories.map((row) => (
                <CategoryRow
                  key={row.id}
                  name={row.displayName}
                  amount={row.amount}
                  sharePct={row.sharePct}
                  barPct={
                    maxCategoryAmount > 0
                      ? Math.max(6, Math.round((row.amount / maxCategoryAmount) * 100))
                      : 0
                  }
                  wellFallback={wellFallback}
                  onPress={() => {
                    void triggerHaptic('selection')
                    onOpenCategory(row.id)
                  }}
                />
              ))}
              {model.otherAmount > 0 ? (
                <View style={styles.otherRow}>
                  <Text style={[styles.otherLabel, { color: neo.textMuted }]}>
                    {t('control:neo.ajustar.otherRow')}
                  </Text>
                  <Text style={[styles.otherAmount, { color: neo.textMuted }]}>
                    {currencyFormatter.format(model.otherAmount)}
                  </Text>
                </View>
              ) : null}
              <Text style={[styles.hint, { color: neo.textMuted }]}>
                {t('control:neo.ajustar.breakdownHint')}
              </Text>
            </>
          )}
        </View>

        {/* ── Fijos pesados ───────────────────────────────────────── */}
        {model.showFijosWarning ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${t('control:neo.ajustar.fijosWarning', { pct: model.fijosPct })} ${t('control:neo.ajustar.fijosCta')}`}
            onPress={() => {
              void triggerHaptic('selection')
              onOpenFijos()
            }}
            style={({ pressed }) => [
              styles.fijosRow,
              { backgroundColor: neo.well },
              wellFallback,
              pressed ? { opacity: 0.7 } : null,
            ]}
          >
            <MaterialIcons name="push-pin" size={16} color={ink.warn} />
            <Text style={[styles.fijosText, { color: neo.text }]} numberOfLines={2}>
              {t('control:neo.ajustar.fijosWarning', { pct: model.fijosPct })}{' '}
              <Text style={[styles.fijosCta, { color: ink.accent }]}>
                {t('control:neo.ajustar.fijosCta')} ›
              </Text>
            </Text>
          </Pressable>
        ) : null}
      </View>
    </ModalCard>
  )
}

interface CategoryRowProps {
  name: string
  amount: number
  sharePct: number
  /** Largo de la barra relativo a la categoría más pesada (6-100). */
  barPct: number
  wellFallback: { borderWidth: number; borderColor: string } | null
  onPress: () => void
}

function CategoryRow({
  name,
  amount,
  sharePct,
  barPct,
  wellFallback,
  onPress,
}: CategoryRowProps) {
  const { t } = useTranslation()
  const theme = useThemeTokens()
  const neo = neoTokens(theme.mode)

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('control:neo.ajustar.categoryA11y', {
        name,
        amount: currencyFormatter.format(amount),
        pct: sharePct,
      })}
      onPress={onPress}
      hitSlop={{ top: 2, bottom: 2 }}
      style={({ pressed }) => [styles.catRow, pressed ? { opacity: 0.6 } : null]}
    >
      <View style={styles.catHead}>
        <Text style={[styles.catName, { color: neo.text }]} numberOfLines={1}>
          {name}
        </Text>
        <Text style={[styles.catAmount, { color: neo.text }]} numberOfLines={1}>
          {currencyFormatter.format(amount)}
        </Text>
        <MaterialIcons name="chevron-right" size={16} color={neo.textMuted} />
      </View>
      <View style={styles.catMeterRow}>
        {/* Pista hundida + tramo verde: mismo vocabulario que las barras de
            hábito de la card de tendencia. */}
        <View
          style={[styles.catTrack, { backgroundColor: neo.well }, wellFallback]}
        >
          <View
            style={[
              styles.catFill,
              { backgroundColor: neo.green, width: `${barPct}%` },
            ]}
          />
        </View>
        <Text style={[styles.catShare, { color: neo.textMuted }]}>
          {t('control:neo.ajustar.rowShare', { pct: sharePct })}
        </Text>
      </View>
    </Pressable>
  )
}

// El `fontFamily` viaja con el peso: cada peso de Nunito es un face estático
// propio, así que sin él el 800/900 se renderiza como regular.
const styles = StyleSheet.create({
  body: { gap: 16, paddingBottom: 4 },
  hero: { padding: 18, gap: 8 },
  headline: {
    fontSize: 19,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    letterSpacing: -0.4,
  },
  plan: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    lineHeight: 20,
  },
  ritmo: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
  },
  section: { gap: 10 },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  emptyLine: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
  },
  catRow: { gap: 5, paddingVertical: 4 },
  catHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  catName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: -0.2,
  },
  catAmount: {
    fontSize: 15,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.3,
  },
  catMeterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  catTrack: {
    flex: 1,
    height: 8,
    borderRadius: 999,
    overflow: 'hidden',
  },
  catFill: {
    height: '100%',
    borderRadius: 999,
  },
  catShare: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    minWidth: 86,
    textAlign: 'right',
  },
  otherRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 2,
  },
  otherLabel: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
  },
  otherAmount: {
    fontSize: 13,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    fontVariant: ['tabular-nums'],
  },
  hint: {
    fontSize: 11.5,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    textAlign: 'center',
    marginTop: 2,
  },
  fijosRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: neoRadii.tile,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  fijosText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    lineHeight: 18,
  },
  fijosCta: {
    fontSize: 13,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
  },
})
