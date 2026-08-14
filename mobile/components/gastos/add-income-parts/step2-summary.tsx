// Paso 2 del alta de ingreso: cuándo entró la plata y qué le hace al ciclo.
//
// Hermano del paso 2 del alta de fijos: misma anatomía —card de resumen → card
// de impacto (con el bloque de conclusión ADENTRO) → el control de edición del
// paso— y el mismo material. Dos diferencias que NO son cosméticas:
//
//  1. El delta va en VERDE. En fijos el chip es terracota porque el número que
//     sube es una obligación; acá el que sube es el saldo.
//  2. La conclusión es el CUPO DIARIO, no el "te queda libre" de fijos: sin
//     override de ciclo la fórmula canónica saca el cupo de
//     (ingreso − fijos − ahorro) e IGNORA los ingresos extra, así que el
//     ingreso sube el saldo del mes pero NO el cupo del día.
//     `impact.affectsDailyBudget` expone ese modo y la copy lo dice tal cual —
//     prometer "tu cupo sube" cuando no sube sería mentirle al usuario. Por eso
//     tampoco hay medidor de zonas ni badge: el ingreso no tiene un % contra el
//     que medirse como los fijos contra el sueldo.
//
// El aviso de FUERA DEL CICLO es valor nuevo: hoy la app es muda cuando la
// fecha elegida cae en otro ciclo, y la plata termina contando en un saldo que
// esta pantalla no muestra. Cuando eso pasa, el impacto que se muestra es CERO
// (la screen no aplica el monto): el aviso y los números tienen que decir lo
// mismo.
import type { ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui/app-text'
import { useTranslation } from 'react-i18next'
import Animated from 'react-native-reanimated'
import { BrotMascot } from '@/components/brot/brot-mascot'
import { RiseView } from '@/components/home/animated/rise-view'
import { ImpactColumns } from '@/components/wizard/parts/impact-columns'
import { Field } from '@/components/wizard/parts/field'
import {
  STEP_DELAYED_ENTER,
  STEP_ENTER,
  STEP_EXIT,
  STEP_LAYOUT,
} from '@/components/wizard/step-motion'
import { useWizardSkin } from '@/components/wizard/wizard-skin'
import type { AddIncomeImpact, CyclePlacement } from '@/features/income/add-income-impact'
import type { IncomeDayOffset } from '@/features/income/use-add-income-form'
import { formatMoney, formatMoneyWithSign } from '@/utils/money'
import { useAppTheme } from '@/theme/theme-provider'
import { DayChips, type DayChoice } from './day-chips'
import { nunitoFamily } from '@/theme/typography'

/** Placeholder de una cifra que todavía no se puede afirmar. */
const PENDING_VALUE = '—'

export interface Step2SummaryProps {
  amount: number
  description: string
  kindLabel: string
  /** Sticker del tipo de ingreso. `null` → se cae al emoji de la copy. */
  kindIcon: ReactNode | null
  dayOffset: IncomeDayOffset
  dayOptions: readonly DayChoice<IncomeDayOffset>[]
  onSelectDay: (offset: IncomeDayOffset) => void
  impact: AddIncomeImpact
  /** Dónde cae la fecha elegida respecto del ciclo VIGENTE. */
  placement: CyclePlacement
  /**
   * `false` mientras las queries del ciclo hidratan. Con el dashboard frío
   * todos los intermedios valen 0, así que las cifras se reemplazan por un
   * placeholder: mostrar "ANTES $0 → AHORA $50.000" y que dos segundos después
   * salten a otros números es exactamente prometer algo que no aparece.
   */
  isReady: boolean
}

export function Step2Summary({
  amount,
  description,
  kindLabel,
  kindIcon,
  dayOffset,
  dayOptions,
  onSelectDay,
  impact,
  placement,
  isReady,
}: Step2SummaryProps) {
  const { t } = useTranslation()
  const { theme } = useAppTheme()
  const skin = useWizardSkin()
  const neo = skin.kind === 'neo' ? skin : null

  const cardSurface = neo
    ? {
        backgroundColor: neo.add.step2Card.background,
        experimental_backgroundImage: neo.add.step2Card.gradientCss,
        boxShadow: neo.add.step2Card.shadow,
        borderWidth: 0,
      }
    : { backgroundColor: theme.colors.creamCard, borderColor: theme.colors.line, borderWidth: 1 }
  const positiveInk = neo ? neo.add.accentGreen : theme.colors.primary
  const titleInk = neo ? neo.ink.title : theme.colors.text
  const mutedInk = neo ? neo.mutedInk : theme.colors.textMuted

  // Familia PASADA de presupuesto: `availableToday` viene clampeado a 0, así
  // que un ingreso que tapa parte del rojo se leía "ANTES $0 → AHORA $0" con un
  // chip verde al lado. Cuando alguno de los dos lados está en rojo se muestra
  // el saldo CRUDO con signo, que es el que efectivamente se mueve.
  const showRawBalance =
    impact.before.rawCycleBalance < 0 || impact.after.rawCycleBalance < 0
  const beforeValue = showRawBalance
    ? formatMoneyWithSign(impact.before.rawCycleBalance)
    : formatMoney(impact.before.availableToday)
  const afterValue = showRawBalance
    ? formatMoneyWithSign(impact.after.rawCycleBalance)
    : formatMoney(impact.after.availableToday)

  return (
    <Animated.View
      key="step-2"
      entering={STEP_ENTER}
      exiting={STEP_EXIT}
      layout={STEP_LAYOUT}
      style={styles.stack}
    >
      {/* Resumen de lo cargado. Es lo primero porque el paso confirma: hay que
          poder reconocer QUÉ se está por guardar antes de leer el impacto. */}
      <RiseView>
        <View style={[styles.summaryCard, cardSurface]}>
          <View
            style={[
              styles.summaryIcon,
              { backgroundColor: neo ? neo.accent('paid').chipBackground : theme.colors.creamSoft },
            ]}
          >
            {kindIcon ?? (
              <Text allowFontScaling={false} style={styles.summaryFallbackIcon}>
                {t('gastos:addIncome.wizard.step2.summaryFallbackIcon')}
              </Text>
            )}
          </View>
          <View style={styles.summaryText}>
            <Text
              style={[
                styles.summaryTitle,
                { color: titleInk, fontFamily: neo ? neo.font('900') : undefined },
              ]}
              numberOfLines={1}
            >
              {description}
            </Text>
            <Text
              style={[
                styles.summaryMeta,
                // `marginTop: 0` en neo, igual que la meta de la card de
                // fijos: las dos cards se leen una detrás de la otra en el
                // mismo gesto y 2px de deriva las separa de familia.
                { color: mutedInk, fontFamily: neo ? neo.font('700') : undefined },
                neo ? styles.summaryMetaNeo : null,
              ]}
              numberOfLines={1}
            >
              {kindLabel}
            </Text>
          </View>
          <Text
            style={[
              styles.summaryAmount,
              { color: positiveInk, fontFamily: neo ? neo.font('900') : undefined },
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
            // Escala con el sistema —es la cifra que se está confirmando— y el
            // `adjustsFontSizeToFit` de arriba la reacomoda sin partir la fila.
            maxFontSizeMultiplier={1.3}
          >
            +{formatMoney(amount)}
          </Text>
        </View>
      </RiseView>

      {/* Impacto. Va PEGADO al resumen, como en fijos: el par "qué guardo /
          qué le hace al ciclo" es el punto del paso, y meter un control de
          edición en el medio lo parte. */}
      <RiseView delay={80}>
        <View style={[styles.impactCard, cardSurface]}>
          <View style={styles.impactHead}>
            <Text
              style={[
                styles.impactEyebrow,
                { color: mutedInk, fontFamily: neo ? neo.font('800') : undefined },
              ]}
              numberOfLines={1}
            >
              {t('gastos:addIncome.wizard.step2.impactEyebrow')}
            </Text>
            {isReady && impact.appliedAmount > 0 ? (
              // El chip es la cifra que el usuario acaba de decidir: entra
              // DESPUÉS de la card. Sin el retraso aparecía pintado desde el
              // primer frame y se perdía el "esto sumaste".
              <Animated.Text
                entering={STEP_DELAYED_ENTER}
                style={[
                  styles.deltaChip,
                  neo
                    ? {
                        borderRadius: neo.add.deltaChip.radius,
                        paddingHorizontal: neo.add.deltaChip.padH,
                        paddingVertical: neo.add.deltaChip.padV,
                        fontSize: neo.add.deltaChip.fontSize,
                        // Verde, no el terracota del token: en fijos el delta
                        // es una obligación que crece; acá es saldo que entra.
                        color: neo.add.accentGreen,
                        backgroundColor: neo.accent('paid').chipBackground,
                        fontFamily: neo.font('900'),
                      }
                    : { color: theme.colors.primary },
                ]}
                numberOfLines={1}
                maxFontSizeMultiplier={1.2}
              >
                +{formatMoney(impact.appliedAmount)}
              </Animated.Text>
            ) : null}
          </View>

          <Text
            style={[
              styles.blockEyebrow,
              { color: mutedInk, fontFamily: neo ? neo.font('800') : undefined },
            ]}
          >
            {t('gastos:addIncome.wizard.step2.availableEyebrow')}
          </Text>
          <ImpactColumns
            beforeLabel={t('gastos:addIncome.wizard.step2.beforeShort')}
            afterLabel={t('gastos:addIncome.wizard.step2.afterShort')}
            beforeValue={isReady ? beforeValue : PENDING_VALUE}
            afterValue={isReady ? afterValue : PENDING_VALUE}
          />

          {/* Conclusión del paso, en el panel PLANO tintado del rediseño (el
              mismo material del "te queda libre" de fijos): el paso cierra con
              un veredicto y con Brot, no con una línea de texto suelta. Con el
              ciclo sin hidratar no hay veredicto que dar, así que no se dibuja
              en vez de afirmar algo sobre ceros. */}
          {isReady ? (
            <View
              style={[
                styles.verdict,
                neo
                  ? {
                      borderRadius: neo.add.librePanel.radius,
                      paddingVertical: neo.add.librePanel.padV,
                      paddingHorizontal: neo.add.librePanel.padH,
                      backgroundColor: neo.add.librePanel.background,
                      borderColor: neo.add.librePanel.borderColor,
                      borderWidth: neo.add.librePanel.borderWidth,
                    }
                  : {
                      borderTopColor: theme.colors.line,
                      borderTopWidth: 1,
                      paddingTop: 13,
                    },
              ]}
            >
              {neo ? (
                <BrotMascot
                  pose={impact.appliedAmount > 0 ? 'cheer' : 'think'}
                  size={42}
                  shadow={false}
                />
              ) : null}
              <View style={styles.verdictText}>
                <Text
                  style={[
                    styles.blockEyebrow,
                    { color: mutedInk, fontFamily: neo ? neo.font('800') : undefined },
                  ]}
                >
                  {t('gastos:addIncome.wizard.step2.dailyBudgetEyebrow')}
                </Text>
                <Text
                  style={[
                    styles.dailyText,
                    {
                      color: impact.affectsDailyBudget ? positiveInk : titleInk,
                      fontFamily: neo
                        ? neo.font(impact.affectsDailyBudget ? '900' : '700')
                        : undefined,
                    },
                  ]}
                >
                  {impact.affectsDailyBudget
                    ? t('gastos:addIncome.wizard.step2.dailyBudgetChanged', {
                        amount: formatMoney(impact.after.dailyBudget),
                      })
                    : t('gastos:addIncome.wizard.step2.dailyBudgetUnchanged')}
                </Text>
              </View>
            </View>
          ) : null}
        </View>
      </RiseView>

      {/* El control de la fecha va DESPUÉS del impacto, como la agenda en
          fijos: primero qué se guarda y qué hace, después el ajuste. */}
      <RiseView delay={160}>
        <Field label={t('gastos:addIncome.wizard.step2.whenEyebrow')}>
          <DayChips
            options={dayOptions}
            value={dayOffset}
            onSelect={onSelectDay}
            accessibilityLabel={t('gastos:addIncome.wizard.step2.whenEyebrow')}
          />
        </Field>
      </RiseView>

      {/* Aviso de ciclo, PEGADO al selector que lo causa: es la consecuencia
          inmediata de haber elegido esa fecha. Con el ciclo sin hidratar la
          ventana todavía puede ser la del default, así que no se afirma nada. */}
      {isReady && placement !== 'inside' ? (
        <Animated.View
          // Con delay: es el ÚLTIMO de la cascada (las cards suben con
          // `RiseView` a 0 / 80 / 160). Sin él, al montar el paso con una fecha
          // fuera del ciclo el aviso estaba pintado en el frame 0 mientras sus
          // vecinos todavía subían, y se leía como algo que no pertenece a la
          // secuencia — justo el elemento que más atención pide.
          entering={STEP_DELAYED_ENTER}
          exiting={STEP_EXIT}
          layout={STEP_LAYOUT}
        >
          {/* Mismo material de card que las otras dos, con el anillo clay: el
              aviso es una superficie, no un chip agrandado. El fondo del chip
              del delta (`#F6DCCB`) dejaba el título en clay `#C25B33` en
              3.31:1 — abajo de AA para 12.5px. Sobre la card, y con la tinta
              de "vencido" (que existe justo para texto de atención sobre
              superficie), da 4.73:1. */}
          <View
            style={[
              styles.noticeCard,
              cardSurface,
              neo
                ? { borderColor: neo.add.accentClay, borderWidth: 1.5 }
                : { borderColor: theme.colors.warning, borderWidth: 1 },
            ]}
          >
            <Text
              style={[
                styles.noticeTitle,
                {
                  color: neo ? neo.accent('overdue').ink : theme.colors.warning,
                  fontFamily: neo ? neo.font('900') : undefined,
                },
              ]}
            >
              {t('gastos:addIncome.wizard.step2.outsideCycleTitle')}
            </Text>
            <Text
              style={[
                styles.noticeBody,
                { color: titleInk, fontFamily: neo ? neo.font('700') : undefined },
              ]}
            >
              {placement === 'before'
                ? t('gastos:addIncome.wizard.step2.outsideCycleBefore')
                : t('gastos:addIncome.wizard.step2.outsideCycleAfter')}
            </Text>
          </View>
        </Animated.View>
      ) : null}
    </Animated.View>
  )
}

// Las medidas de la card de resumen son las MISMAS que las del paso 2 de fijos
// (`add-fijo-parts/step2-summary.tsx`): las dos cards se leen una detrás de la
// otra en el mismo gesto y cualquier delta acá las hace ver de familias
// distintas.
const styles = StyleSheet.create({
  stack: { gap: 10 },
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  summaryIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryFallbackIcon: { fontSize: 24, lineHeight: 28, includeFontPadding: false },
  summaryText: { flex: 1, minWidth: 0 },
  summaryTitle: { fontSize: 16, fontWeight: '900', fontFamily: nunitoFamily('900'), letterSpacing: -0.3 },
  summaryMeta: { fontSize: 11.5, fontWeight: '700', fontFamily: nunitoFamily('700'), marginTop: 2 },
  summaryMetaNeo: { marginTop: 0 },
  // `flexShrink: 0`: el que cede en un ancho apretado es la descripción, que
  // puede truncarse. La cifra cortada sería una mentira.
  summaryAmount: { fontSize: 20, fontWeight: '900', fontFamily: nunitoFamily('900'), flexShrink: 0, maxWidth: 140 },
  impactCard: { borderRadius: 22, paddingVertical: 15, paddingHorizontal: 16 },
  impactHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 12,
  },
  // 0.14em sobre 10.5px. RN no acepta em.
  impactEyebrow: { fontSize: 10.5, fontWeight: '800', fontFamily: nunitoFamily('800'), letterSpacing: 1.47, flexShrink: 1 },
  deltaChip: { fontSize: 11, fontWeight: '900', fontFamily: nunitoFamily('900'), overflow: 'hidden', flexShrink: 0 },
  blockEyebrow: { fontSize: 10, fontWeight: '800', fontFamily: nunitoFamily('800'), letterSpacing: 1 },
  verdict: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 15 },
  verdictText: { flex: 1, minWidth: 0 },
  dailyText: { fontSize: 13.5, fontWeight: '700', fontFamily: nunitoFamily('700'), marginTop: 5, lineHeight: 19 },
  noticeCard: { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 12, gap: 4 },
  noticeTitle: { fontSize: 12.5, fontWeight: '900', fontFamily: nunitoFamily('900'), letterSpacing: -0.1 },
  noticeBody: { fontSize: 12.5, fontWeight: '700', fontFamily: nunitoFamily('700'), lineHeight: 18 },
})
