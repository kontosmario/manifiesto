import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated'
import { MaterialIcons } from '@expo/vector-icons'
import { FijoTrendSpark } from '@/components/fijos/fijo-trend-spark'
import type { FijoItem } from '@/features/fijos/fijos-aggregates.model'
import { usePressScale } from '@/hooks/use-press-scale'
import { formatMoney } from '@/utils/money'
import { withAlpha } from '@/theme/color-utils'
import { useThemeTokens } from '@/theme/theme-provider'
import { useFijosSkin } from '@/components/fijos/fijos-skin'
import { InfoLine } from './info-line'
import { InlinePayButton } from './inline-pay-button'
import {
  frequencyLabel,
  nextDueLabel,
  trendCopyColor,
  trendCopyLabel,
  trendCopySubLabel,
  trendState,
} from './fijo-row-helpers'
import type { AccentPalette } from './fijo-row-styling'
import { nunitoFamily } from '@/theme/typography'

type FijoStatus = 'paid' | 'overdue' | 'pending' | 'future'

interface FijoRowDetailPanelProps {
  fijo: FijoItem
  status: FijoStatus
  accent: AccentPalette
  categoryName: string
  onEdit?: (id: string) => void
  /**
   * Presente SOLO cuando la card está expandida con la piel `neo`: ahí el pill
   * "Pagar" sale de la fila superior (no entraba el nombre) y aparece acá como
   * CTA primario de ancho completo, en el mismo slot donde el handoff pone
   * "Editar" / la acción doble de pagada.
   */
  onMarkPaid?: (id: string) => void
  onRevertPaid?: (paymentId: string) => void
  /**
   * Eliminar el fijo. Va SEPARADO de la fila de acciones y con menos peso
   * visual: es destructivo e irreversible, así que no comparte prominencia
   * con Editar. La pantalla huésped confirma con `Alert` antes de mutar.
   */
  onDelete?: (id: string) => void
}

/**
 * Expand panel del fijo-row — stats hero (anual / total / deuda
 * restante) + tendencia + este pago + historial + actions row.
 *
 * Extraído del row principal por verticalidad: ~225 LOC de UI
 * declarativa con stats tintado por status, info-lines, trend copy.
 * Aparece detrás del divider dashed cuando el user toca el card.
 *
 * Animación intacta: FadeIn(200ms) / FadeOut(140ms).
 */
export function FijoRowDetailPanel({
  fijo,
  status,
  accent,
  categoryName,
  onEdit,
  onMarkPaid,
  onRevertPaid,
  onDelete,
}: FijoRowDetailPanelProps) {
  const theme = useThemeTokens()
  const skin = useFijosSkin()
  /** Atajo: `null` en classic, el skin resuelto en neo. Mantiene las ramas
   *  legibles sin repetir el discriminante en cada style array. */
  const neo = skin.kind === 'neo' ? skin : null
  const { t } = useTranslation()
  const actionSecondaryPress = usePressScale({ pressedScale: 0.96 })
  const payPress = usePressScale({ pressedScale: 0.96 })
  const deletePress = usePressScale({ pressedScale: 0.96 })
  /**
   * Estado de la tendencia. La sección entera se OCULTA cuando no hay con qué
   * comparar: antes se renderizaba igual, con el slot de la spark vacío (la
   * spark devuelve null si no hay variación) al lado de un "Mantiene el
   * precio" que afirmaba una comparación inexistente.
   */
  const trend = trendState(fijo.priceHistory, fijo.trendDeltaPct)

  /**
   * Tinta de "Eliminar" en la piel neo. Era el ÚNICO texto de la card abierta
   * sin rama neo: seguía en `#F18C8C`/`#A8211B`, dos hex que no existen en la
   * paleta del rediseño.
   *
   * Sale de `add.accentClayInk` y no de `neo.danger` a propósito: el rojo del
   * sistema (`#C25B33` en claro) está calibrado para bordes, anillos y fills
   * —les alcanza 3:1— y como TINTA de 13.5px sobre la card (`#E9EBE0`) se
   * queda en 3.60:1, abajo del 4.5 que pide AA. `accentClayInk` es el mismo
   * terracota ya oscurecido y auditado para texto chico: 5.49:1 en claro y
   * 5.7:1 en oscuro sobre esa misma card.
   *
   * Lo CORRECTO sería un campo propio (`ctaDeleteInk`) en `FijosDetailSkin`,
   * pero `fijos-skin.tsx` está fuera del alcance de este cambio.
   */
  const deleteInk = neo?.add.accentClayInk

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(140)}
      // borderTopColor tintado por status — el divider que separa
      // el row collapsed del expand panel anuncia visualmente el
      // estado del fijo apenas se abre.
      //
      // En `neo` el tinte sale de la barra del bloque de stats (los DOS
      // acentos del handoff) y no de `computeAccent()`, que es la paleta V1
      // de estado —incluye un azul `#9DC4DE`/`#3F7CA3` que el rediseño no
      // tiene. De paso el punteado pasa a línea sólida y tenue: el handoff
      // separa bloques por relieve, no con vocabulario de formulario, y un
      // dashed saturado era lo más V1 que quedaba en la card abierta.
      style={[
        styles.detailBlock,
        { borderTopColor: accent.border },
        neo
          ? {
              borderStyle: 'solid',
              borderTopColor: withAlpha(neo.detail.stats(status).stripe, 0.35),
            }
          : null,
      ]}
    >
      {/*
        Stats hero. Para recurring/periodic: "SE LLEVA AL AÑO".
        Para installment: "TOTAL DE LA DEUDA". Para debt: "DEUDA
        RESTANTE". Cifra grande para anclar el ojo + sublabel
        con % del sueldo (cuando hay sueldo configurado).
      */}
      <View
        style={[
          styles.statsHero,
          { backgroundColor: accent.bg },
          neo
            ? {
                backgroundColor: neo.detail.stats(status).background,
                boxShadow: neo.detail.stats(status).ring,
                borderRadius: neo.detail.statsRadius,
                paddingVertical: neo.detail.statsPadV,
                paddingLeft: neo.detail.statsPadH,
                paddingRight: neo.detail.statsPadH,
                gap: 0,
              }
            : null,
        ]}
      >
        {/* Accent stripe — barra vertical en el left edge (3pt classic, 5 neo). */}
        <View
          pointerEvents="none"
          style={[
            styles.statsAccentStripe,
            { backgroundColor: accent.solid },
            neo
              ? { width: neo.detail.stripeWidth, backgroundColor: neo.detail.stats(status).stripe }
              : null,
          ]}
        />
        <Text
          style={[
            styles.statsEyebrow,
            { color: accent.solid },
            neo
              ? {
                  ...neo.detail.eyebrow,
                  color: neo.detail.stats(status).stripe,
                  paddingLeft: neo.detail.statsInnerPadLeft,
                }
              : null,
          ]}
        >
          {fijo.kind === 'installment'
            ? t('fijos:detailPanel.totalDebtEyebrow')
            : fijo.kind === 'debt'
              ? t('fijos:detailPanel.remainingDebtEyebrow')
              : t('fijos:detailPanel.annualEyebrow')}
        </Text>
        <Text
          style={[
            styles.statsValue,
            { color: theme.colors.text },
            neo
              ? {
                  ...neo.detail.value,
                  color: neo.ink.title,
                  marginTop: 3,
                  paddingLeft: neo.detail.statsInnerPadLeft,
                }
              : null,
          ]}
        >
          {formatMoney(fijo.annualCost)}
        </Text>
        {fijo.pctOfIncome != null && fijo.pctOfIncome > 0 ? (
          <View
            style={[
              styles.statsPctRow,
              neo ? { gap: 6, marginTop: 4, paddingLeft: neo.detail.statsInnerPadLeft } : null,
            ]}
          >
            <MaterialIcons
              name="account-balance-wallet"
              size={neo ? 15 : 11}
              color={neo ? neo.detail.stats(status).stripe : theme.colors.textMuted}
            />
            <Text
              style={[
                styles.statsPctText,
                { color: theme.colors.textMuted },
                neo ? { ...neo.detail.pct, color: neo.detail.stats(status).stripe } : null,
              ]}
            >
              {t('fijos:detailPanel.pctOfSalary', { pct: fijo.pctOfIncome })}
            </Text>
          </View>
        ) : null}
      </View>

      {/*
        Tendencia. Solo cuando hay >= 2 puntos de historia.
      */}
      {trend !== 'no-comparison' ? (
        <View style={styles.section}>
          <Text
            style={[
              styles.sectionEyebrow,
              { color: theme.colors.textMuted },
              neo ? { ...neo.detail.sectionLabel, color: neo.detail.sectionLabelInk } : null,
            ]}
          >
            {t('fijos:detailPanel.trendEyebrow')}
          </Text>
          <View
            style={[
              styles.trendRow,
              neo
                ? {
                    borderRadius: neo.detail.trendWell.radius,
                    // El pozo necesita fondo PROPIO: un inset sin fill se
                    // dibuja sobre el material de la card padre y en oscuro el
                    // hundido casi no se lee (en claro apenas se nota). Es el
                    // mismo well que ya usan los campos del alta.
                    backgroundColor: neo.add.well.background,
                    boxShadow: neo.detail.trendWell.shadow,
                    paddingVertical: neo.detail.trendWell.padV,
                    paddingHorizontal: neo.detail.trendWell.padH,
                    gap: neo.detail.trendWell.gap,
                    marginTop: 8,
                  }
                : null,
            ]}
          >
            {/* El slot solo existe si hay curva. `FijoTrendSpark` devuelve
                null sin variación de precio, y reservar 70×30 igual dejaba un
                hueco al lado del texto que leía como gráfico roto. */}
            {trend === 'up' || trend === 'down' ? (
              <View style={styles.trendSparkSlot}>
                <FijoTrendSpark points={fijo.priceHistory} />
              </View>
            ) : null}
            <View style={styles.trendCopySlot}>
              <Text
                style={[
                  styles.trendCopyMain,
                  { color: trendCopyColor(fijo.trendDeltaPct ?? 0, theme.isDark) },
                  neo ? { ...neo.detail.trendTitle, color: neo.ink.title } : null,
                ]}
              >
                {trendCopyLabel(fijo.trendDeltaPct ?? 0, trend)}
              </Text>
              <Text
                style={[
                  styles.trendCopySub,
                  { color: theme.colors.textMuted },
                  neo ? { ...neo.detail.trendSub, color: neo.detail.trendSubInk } : null,
                ]}
              >
                {trendCopySubLabel(fijo.priceHistory, trend)}
              </Text>
            </View>
          </View>
        </View>
      ) : null}

      {/* Este pago. */}
      <View style={styles.section}>
        <Text
            style={[
              styles.sectionEyebrow,
              { color: theme.colors.textMuted },
              neo ? { ...neo.detail.sectionLabel, color: neo.detail.sectionLabelInk } : null,
            ]}
          >
          {t('fijos:detailPanel.thisPaymentEyebrow')}
        </Text>
        <InfoLine
          icon="event-repeat"
          label={
            fijo.kind === 'installment'
              ? t('fijos:detailPanel.installmentLabel', {
                  current: (fijo.installments_paid ?? 0) + 1,
                  total: fijo.installments_total ?? '?',
                })
              : t('fijos:detailPanel.recurringLabel', {
                  frequency: frequencyLabel(fijo.frequency),
                  day: fijo.dayOfMonth,
                })
          }
          theme={theme}
        />
        <InfoLine
          icon="event"
          label={nextDueLabel(fijo.next_due_on)}
          theme={theme}
        />
        <InfoLine
          icon="local-offer"
          label={categoryName || t('fijos:detailPanel.noCategory')}
          theme={theme}
        />
      </View>

      {/* Historial — solo cuando hay >= 1 pago lifetime registrado. */}
      {fijo.paymentsLifetime > 0 ? (
        <View style={styles.section}>
          <Text
            style={[
              styles.sectionEyebrow,
              { color: theme.colors.textMuted },
              neo ? { ...neo.detail.sectionLabel, color: neo.detail.sectionLabelInk } : null,
            ]}
          >
            {t('fijos:detailPanel.historyEyebrow')}
          </Text>
          <InfoLine
            icon="receipt-long"
            label={t('fijos:detailPanel.installmentsRecorded', {
              count: fijo.paymentsLifetime,
            })}
            theme={theme}
          />
          {fijo.totalPaidLifetime > 0 ? (
            <InfoLine
              icon="payments"
              label={t('fijos:detailPanel.totalPaid', {
                amount: formatMoney(fijo.totalPaidLifetime),
              })}
              theme={theme}
            />
          ) : null}
        </View>
      ) : null}

      {/* CTA primario "Pagar" — ancho completo, arriba de las acciones
          secundarias. Solo llega con handler desde la card expandida `neo`. */}
      {onMarkPaid && (status === 'pending' || status === 'overdue') ? (
        <View style={styles.payCtaRow}>
          <InlinePayButton
            fullWidth
            status={status}
            pressScale={payPress}
            onPress={() => onMarkPaid(fijo.id)}
          />
        </View>
      ) : null}

      {/* Actions row. Revertir pago (paid) + Editar. */}
      <View style={styles.actionsRow}>
        {status === 'paid' && onRevertPaid && fijo.paidPaymentId ? (
          <Pressable
            onPress={() => onRevertPaid(fijo.paidPaymentId!)}
            onPressIn={actionSecondaryPress.onPressIn}
            onPressOut={actionSecondaryPress.onPressOut}
            style={styles.actionFullWidthWrap}
            accessibilityRole="button"
            accessibilityLabel={t('fijos:detailPanel.revertPayment')}
            accessibilityHint={t('fijos:detailPanel.revertPaymentHint')}
          >
            <Animated.View
              style={[
                styles.actionSecondary,
                {
                  backgroundColor: theme.isDark
                    ? 'rgba(242,167,140,0.10)'
                    : 'rgba(242,167,140,0.18)',
                  borderColor: theme.isDark ? '#F2A78C' : '#B84014',
                },
                // Handoff: OUTLINE puro (anillo de 1.5px del mismo color), sin
                // relleno. Es la acción de deshacer, no la principal.
                neo
                  ? {
                      backgroundColor: 'transparent',
                      borderWidth: 0,
                      borderRadius: neo.detail.cta.radius,
                      paddingVertical: neo.detail.cta.padV,
                      // Anillo del handoff + el MISMO relieve que el pill de
                      // Pagar: los dos shadows conviven en una sola prop.
                      boxShadow: `inset 0 0 0 1.5px ${neo.detail.ctaRevertInk}, ${neo.pay.shadow}`,
                    }
                  : null,
                actionSecondaryPress.animatedStyle,
              ]}
            >
              <View style={styles.actionRevertContent}>
                <MaterialIcons
                  name="undo"
                  size={14}
                  color={neo ? neo.detail.ctaRevertInk : theme.isDark ? '#F2A78C' : '#B84014'}
                />
                <Text
                  style={[
                    styles.actionSecondaryText,
                    { color: theme.isDark ? '#F2A78C' : '#B84014' },
                    neo ? { ...neo.detail.cta, color: neo.detail.ctaRevertInk } : null,
                  ]}
                >
                  {t('fijos:detailPanel.revertPayment')}
                </Text>
              </View>
            </Animated.View>
          </Pressable>
        ) : null}
        {onEdit ? (
          <Pressable
            onPress={() => onEdit(fijo.id)}
            onPressIn={actionSecondaryPress.onPressIn}
            onPressOut={actionSecondaryPress.onPressOut}
            style={styles.actionFullWidthWrap}
            accessibilityRole="button"
            accessibilityLabel={t('fijos:detailPanel.editFijo')}
          >
            <Animated.View
              style={[
                styles.actionSecondary,
                { backgroundColor: theme.colors.pageBg, borderColor: theme.colors.line },
                // Handoff: relleno tintado verde, SIN borde.
                neo
                  ? {
                      backgroundColor: neo.detail.ctaEditBackground,
                      borderWidth: 0,
                      borderRadius: neo.detail.cta.radius,
                      paddingVertical: neo.detail.cta.padV,
                      boxShadow: neo.pay.shadow,
                    }
                  : null,
                actionSecondaryPress.animatedStyle,
              ]}
            >
              <Text
                style={[
                  styles.actionSecondaryText,
                  { color: theme.colors.text },
                  neo ? { ...neo.detail.cta, color: neo.detail.ctaEditInk } : null,
                ]}
              >
                {t('fijos:detailPanel.edit')}
              </Text>
            </Animated.View>
          </Pressable>
        ) : null}
      </View>

      {/* Eliminar — fila propia, sin fill y en el rojo del sistema. Es
          destructivo e irreversible: no debe competir en peso con Editar ni
          quedar a un dedo de distancia del CTA de pago. */}
      {onDelete ? (
        <Pressable
          onPress={() => onDelete(fijo.id)}
          onPressIn={deletePress.onPressIn}
          onPressOut={deletePress.onPressOut}
          accessibilityRole="button"
          accessibilityLabel={t('fijos:detailPanel.deleteFijo')}
          accessibilityHint={t('fijos:detailPanel.deleteHint')}
        >
          <Animated.View
            style={[
              styles.actionDelete,
              neo
                ? {
                    borderRadius: neo.detail.cta.radius,
                    paddingVertical: neo.detail.cta.padV,
                    boxShadow: neo.pay.shadow,
                    backgroundColor: neo.row.background,
                    marginTop: 6,
                  }
                : null,
              deletePress.animatedStyle,
            ]}
          >
            <MaterialIcons
              name="delete-outline"
              size={15}
              color={neo ? deleteInk : theme.isDark ? '#F18C8C' : '#A8211B'}
            />
            <Text
              style={[
                styles.actionSecondaryText,
                { color: theme.isDark ? '#F18C8C' : '#A8211B' },
                neo ? { ...neo.detail.cta, color: deleteInk } : null,
              ]}
            >
              {t('fijos:detailPanel.deleteFijo')}
            </Text>
          </Animated.View>
        </Pressable>
      ) : null}
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  detailBlock: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderStyle: 'dashed',
    gap: 12,
  },
  statsHero: {
    borderRadius: 12,
    paddingLeft: 18, // 14 + 4 para no chocar con la accent stripe
    paddingRight: 14,
    paddingVertical: 12,
    gap: 4,
    overflow: 'hidden',
  },
  statsAccentStripe: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },
  statsEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: 1.2,
  },
  statsValue: {
    fontSize: 26,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: -0.6,
    fontVariant: ['tabular-nums'],
  },
  statsPctRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
  },
  statsPctText: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: nunitoFamily('600'),
  },
  section: { gap: 6 },
  sectionEyebrow: {
    fontSize: 9,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: 1.4,
    marginBottom: 2,
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  trendSparkSlot: {
    width: 70,
    height: 30,
    justifyContent: 'center',
  },
  trendCopySlot: { flex: 1, gap: 2 },
  trendCopyMain: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    letterSpacing: -0.2,
  },
  trendCopySub: { fontSize: 11, fontWeight: '500', fontFamily: nunitoFamily('500') },
  payCtaRow: { marginTop: 10, marginBottom: 2 },
  actionDelete: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    marginTop: 2,
  },
  actionsRow: { flexDirection: 'row', gap: 6, marginTop: 4 },
  actionFullWidthWrap: { flex: 1 },
  actionSecondary: {
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  actionSecondaryText: { fontSize: 13, fontWeight: '700', fontFamily: nunitoFamily('700') },
  actionRevertContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
})
