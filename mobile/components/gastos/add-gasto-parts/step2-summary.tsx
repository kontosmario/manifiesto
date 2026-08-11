// Paso 2 del wizard de agregar gasto: resumen del movimiento + impacto sobre
// el cupo de hoy + los opcionales (nota y fecha). Hermano de
// `add-fijo-parts/step2-summary.tsx`: mismo material de cards, mismo bloque
// "antes → ahora" (`ImpactColumns`) y misma badge de salud.
//
// La diferencia con fijos es QUÉ se mide: allá el % del sueldo que se
// compromete al mes; acá el % del CUPO DIARIO que se consume hoy. Por eso el
// medidor es `CupoGauge` y no el `ZoneGauge` del kit (ver su docblock).
//
// El aviso de FUERA DEL CICLO es el mismo bloque del alta de ingreso: cuando
// la fecha destino cae en otro ciclo, el impacto que se muestra es CERO (la
// screen no aplica el monto) y sin la mitad explicativa el paso se leía como
// "no pasa nada" sin decir por qué.
import { memo } from 'react'
import { StyleSheet, Text, TextInput, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import Animated from 'react-native-reanimated'
import { BrotMascot, type BrotPose } from '@/components/brot/brot-mascot'
import { CategoryIcon } from '@/components/category/category-icon'
import { CountUpText } from '@/components/home/animated/count-up-text'
import { RiseView } from '@/components/home/animated/rise-view'
import { resolveFijosCategoryTone } from '@/components/fijos/fijos-category-palette'
import { SUPPORTS_INSET_SHADOW } from '@/components/wizard/inset-shadow-support'
import { Field } from '@/components/wizard/parts/field'
import { HealthBadge } from '@/components/wizard/parts/health-badge'
import { ImpactColumns } from '@/components/wizard/parts/impact-columns'
import {
  STEP_DELAYED_ENTER,
  STEP_ENTER,
  STEP_EXIT,
  STEP_LAYOUT,
} from '@/components/wizard/step-motion'
import { useWizardSkin } from '@/components/wizard/wizard-skin'
import type { Category } from '@/features/categories/use-categories'
import type { AddExpenseImpact } from '@/features/expenses/add-expense-impact'
import { EXPENSE_NOTES_MAX_LENGTH } from '@/features/expenses/expense-repository.model'
// Del alta de INGRESO por reuso deliberado: clasificar una fecha contra la
// ventana del ciclo es la misma cuenta en los dos flujos (ver el docblock del
// import gemelo en `add-gasto-v2-screen`).
import type { CyclePlacement } from '@/features/income/add-income-impact'
import { resolveCategoryHueByName } from '@/theme/category-hues'
import { formatMoney } from '@/utils/money'
import { useAppTheme } from '@/theme/theme-provider'
import { CupoGauge, zoneForCupoPct } from './cupo-gauge'
import { nunitoFamily } from '@/theme/typography'

/** Placeholder de una cifra que todavía no se puede afirmar (mismo recurso que
 *  el paso 2 del alta de ingreso). */
const PENDING_VALUE = '—'

export interface Step2SummaryProps {
  description: string
  amount: number
  selectedCategory: Category | undefined
  impact: AddExpenseImpact
  /** `false` == el hogar todavía no configuró ingreso. Sin base no hay
   *  porcentaje que mostrar: se dice, no se muestra un "0%". */
  incomeConfigured: boolean
  /**
   * `false` mientras hidratan las queries del ciclo y del día destino. Con el
   * dashboard frío el cupo vale 0 e `incomeConfigured` sale `false`, que es
   * indistinguible de "este hogar no cargó ingreso": el paso mostraba ANTES $0
   * → AHORA $0 y, 8pt más abajo, "todavía no configuraste un ingreso" a una
   * familia con sueldo cargado hace meses. Con `false` las cifras van al
   * placeholder y no se dibuja ningún veredicto — igual que el hermano.
   */
  isReady: boolean
  /**
   * `false` cuando el gasto se estampa en un día que cae FUERA del ciclo
   * vigente (el "registrar olvidado" del calendario acepta días de ciclos
   * cerrados). Ese gasto no entra en el `var_cycle` de este ciclo: al
   * confirmar, el cupo del Home no se mueve un peso, así que el bloque de
   * impacto no se dibuja en vez de prometer un desborde que no va a ocurrir.
   */
  impactApplies: boolean
  /** Dónde cae la fecha destino respecto del ciclo VIGENTE. Con `impactApplies`
   *  en `false` es lo que decide CUÁL de las dos explicaciones se muestra
   *  (ciclo anterior / ciclo siguiente). */
  placement: CyclePlacement
  notes: string
  onChangeNotes: (v: string) => void
  /** Día al que se estampa el gasto. `null` == hoy. */
  forDate: Date | null
}

export function Step2Summary(props: Step2SummaryProps) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  const skin = useWizardSkin()
  const neo = skin.kind === 'neo' ? skin : null
  const {
    description,
    amount,
    selectedCategory,
    impact,
    incomeConfigured,
    isReady,
    impactApplies,
    placement,
    notes,
    onChangeNotes,
    forDate,
  } = props

  // El aviso ocupa el MISMO hueco que la card de impacto: es su reemplazo
  // explicativo, no un bloque extra. Con el ciclo sin hidratar la ventana
  // todavía puede ser la del default, así que no se afirma nada.
  const showsCycleNotice = isReady && !impactApplies && placement !== 'inside'
  // La cascada se recompone cuando ese segundo hueco no se dibuja: los delays
  // son POSICIONALES (0 / 80 / 160 / 220, la cadencia del rediseño), no
  // propiedades del bloque. Dejarlos fijos abría un hueco de 80ms en el medio
  // justo en el caso en el que hay menos para leer.
  const hasSecondBlock = impactApplies || showsCycleNotice
  const notesDelay = hasSecondBlock ? 160 : 80
  const dateDelay = hasSecondBlock ? 220 : 160

  return (
    <Animated.View
      key="step-2"
      entering={STEP_ENTER}
      exiting={STEP_EXIT}
      layout={STEP_LAYOUT}
      style={[styles.formStack, neo ? styles.formStackNeo : null]}
    >
      <Step2Overview
        description={description}
        amount={amount}
        selectedCategory={selectedCategory}
        impact={impact}
        incomeConfigured={incomeConfigured}
        isReady={isReady}
        impactApplies={impactApplies}
        showsCycleNotice={showsCycleNotice}
        placement={placement}
      />

      {/* ── Opcionales ─────────────────────────────────────────────── */}
      <RiseView delay={notesDelay}>
        <Field label={t('gastos:addExpense.wizard.step2.notesLabel')}>
          <View
            style={[
              styles.notesWrap,
              { backgroundColor: theme.colors.surface, borderColor: theme.colors.line },
              neo
                ? {
                    // El pozo es SOLO sombra inset y Android < API 29 la
                    // descarta en silencio: sin el hairline queda un
                    // rectángulo `#F4F5EE` sobre `#E9EBE0` (~1.06:1) y no se
                    // ve dónde tocar. Mismo fallback que `AmountCard`.
                    borderWidth: SUPPORTS_INSET_SHADOW ? 0 : 1,
                    borderColor: theme.colors.border,
                    backgroundColor: neo.add.well.background,
                    borderRadius: neo.add.well.radius,
                    boxShadow: neo.add.well.shadow,
                  }
                : null,
            ]}
          >
            <TextInput
              value={notes}
              onChangeText={onChangeNotes}
              // El `<Text>` del `Field` que lo envuelve es un HERMANO: no lo
              // toma el lector. Y el `placeholder` sólo hace de label
              // accesible mientras el campo está VACÍO (en TalkBack ni eso),
              // así que apenas hay una nota escrita —o el usuario vuelve al
              // paso 2 con la nota cargada— VoiceOver leía el texto libre
              // ("cumple de mamá") sin decir de qué campo se trata, en la
              // pantalla donde se confirma el gasto. Mismo tratamiento que el
              // pozo de descripción del paso 1 y que el hermano de ingreso.
              accessibilityLabel={t('gastos:addExpense.wizard.step2.notesLabel')}
              placeholder={t('gastos:addExpense.wizard.step2.notesPlaceholder')}
              placeholderTextColor={neo ? neo.faintInk : theme.colors.textSoft}
              multiline
              maxLength={EXPENSE_NOTES_MAX_LENGTH}
              textAlignVertical="top"
              style={[
                styles.notesInput,
                { color: theme.colors.text },
                neo
                  ? {
                      paddingHorizontal: 17,
                      paddingVertical: 14,
                      fontSize: 14.5,
                      fontWeight: '700',
                      fontFamily: neo.font('700'),
                      color: neo.ink.title,
                    }
                  : null,
              ]}
            />
          </View>
        </Field>
      </RiseView>

      {/* La fila FECHA sólo aparece cuando el gasto va a HOY. Con back-date la
          píldora del orquestador ya dice "REGISTRANDO PARA MARTES 12 AGO" a
          pantalla completa y esta fila repetía "martes 12 ago" unos
          centímetros abajo.
          Material PLANO (el panel tintado), no el de las cards elevadas: es un
          dato que se lee, no un control. Con la superficie y la sombra de la
          card de resumen —que sí es tocable en el resto del sistema— prometía
          una edición que este flujo no tiene (la fecha la fija el calendario
          de Gastos al abrir el alta). */}
      {forDate === null ? (
        <RiseView delay={dateDelay}>
          <Field label={t('gastos:addExpense.wizard.step2.forDateLabel')}>
            <View
              style={[
                styles.dateRow,
                { backgroundColor: theme.colors.creamSoft, borderColor: theme.colors.line },
                neo
                  ? {
                      borderRadius: neo.add.librePanel.radius,
                      backgroundColor: neo.add.librePanel.background,
                      borderColor: neo.add.librePanel.borderColor,
                      borderWidth: neo.add.librePanel.borderWidth,
                    }
                  : null,
              ]}
            >
              <Text
                style={[
                  styles.dateValue,
                  { color: theme.colors.text },
                  neo
                    ? { color: neo.ink.title, fontFamily: neo.font('800') }
                    : null,
                ]}
              >
                {t('gastos:addExpense.wizard.step2.forDateToday')}
              </Text>
            </View>
          </Field>
        </RiseView>
      ) : null}
    </Animated.View>
  )
}

interface Step2OverviewProps {
  description: string
  amount: number
  selectedCategory: Category | undefined
  impact: AddExpenseImpact
  incomeConfigured: boolean
  isReady: boolean
  impactApplies: boolean
  showsCycleNotice: boolean
  placement: CyclePlacement
}

/**
 * MEMOIZADO — y por eso ninguna de sus props puede depender de la NOTA.
 *
 * La nota vive en el form del orquestador, así que cada carácter tipeado
 * re-renderiza la screen entera y con ella este paso. Sin la memo, eso
 * arrastraba la card de resumen, `ImpactColumns` (con su SVG de flecha),
 * `CupoGauge`, `CountUpText`, `HealthBadge`, el `BrotMascot` y ~40 arrays de
 * estilo por tecla. Todas las props que entran acá son primitivas o vienen
 * memoizadas desde la screen (`impact` de un `useMemo`, `selectedCategory` de
 * un `find` sobre el array memoizado del controller), así que la memo corta de
 * verdad — es el mismo problema que el foco de la descripción, resuelto
 * bajando el estado al campo (`description-field.tsx`).
 */
const Step2Overview = memo(function Step2Overview({
  description,
  amount,
  selectedCategory,
  impact,
  incomeConfigured,
  isReady,
  impactApplies,
  showsCycleNotice,
  placement,
}: Step2OverviewProps) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  const skin = useWizardSkin()
  const neo = skin.kind === 'neo' ? skin : null

  const usedPctAfter = impact.usedPctAfter ?? 0
  const zone = zoneForCupoPct(usedPctAfter)
  // Dos acentos, no tres: verde mientras el gasto entra en el cupo, terracota
  // cuando lo desborda. Es el mismo criterio del resto de la piel.
  const remainingInk = neo
    ? impact.exceeds
      ? neo.add.accentClay
      : neo.add.accentGreen
    : impact.exceeds
      ? theme.colors.danger
      : theme.colors.primary
  const brotPose: BrotPose = impact.exceeds ? 'worried' : zone === 'media' ? 'zen' : 'cheer'
  const categoryTone = selectedCategory
    ? neo
      ? resolveFijosCategoryTone(selectedCategory.name, theme.isDark).surface
      : resolveCategoryHueByName(selectedCategory.name).light.surface
    : theme.colors.creamSoft

  const healthLabels = {
    high: t('gastos:addExpense.wizard.step2.healthBadge.high'),
    mid: t('gastos:addExpense.wizard.step2.healthBadge.mid'),
    healthy: t('gastos:addExpense.wizard.step2.healthBadge.healthy'),
  }

  const cardSurface = neo
    ? {
        borderWidth: 0,
        backgroundColor: neo.add.step2Card.background,
        experimental_backgroundImage: neo.add.step2Card.gradientCss,
        boxShadow: neo.add.step2Card.shadow,
      }
    : null

  return (
    <>
      {/* ── Resumen del movimiento ─────────────────────────────────── */}
      <RiseView>
        <View
          style={[
            styles.summaryCard,
            { backgroundColor: theme.colors.creamCard, borderColor: theme.colors.line },
            neo ? { ...cardSurface, paddingHorizontal: 14, paddingVertical: 12 } : null,
          ]}
        >
          <View
            style={[
              styles.summaryIcon,
              { backgroundColor: categoryTone, borderColor: theme.colors.line },
              // 44×44 sin borde y con el TONO de la categoría — el mismo que
              // pinta su tile en el rail del paso 1. La categoría se tiene que
              // ver igual donde se la elige y donde se la lee después.
              neo ? { width: 44, height: 44, borderWidth: 0 } : null,
            ]}
          >
            {selectedCategory ? (
              <CategoryIcon
                name={selectedCategory.name}
                scope="expense"
                size={neo ? 32 : 30}
                emojiStyle={styles.summaryIconText}
                // Sin placa: en oscuro la placa clara se lee como un recorte
                // de light mode adentro del tile.
                onLightSurface
              />
            ) : (
              <Text style={styles.summaryIconText}>
                {t('gastos:addExpense.wizard.step2.summaryFallbackIcon')}
              </Text>
            )}
          </View>
          <View style={styles.summaryBody}>
            <Text
              numberOfLines={1}
              style={[
                styles.summaryName,
                { color: theme.colors.text },
                neo
                  ? {
                      fontSize: 16,
                      fontWeight: '900',
                      fontFamily: neo.font('900'),
                      color: neo.ink.title,
                    }
                  : null,
              ]}
            >
              {description}
            </Text>
            <Text
              numberOfLines={1}
              style={[
                styles.summaryMeta,
                { color: theme.colors.textMuted },
                neo
                  ? {
                      fontSize: 11.5,
                      fontWeight: '700',
                      fontFamily: neo.font('700'),
                      color: neo.mutedInk,
                      marginTop: 0,
                    }
                  : null,
              ]}
            >
              {selectedCategory?.displayName ??
                selectedCategory?.name ??
                t('gastos:addExpense.wizard.step2.noCategory')}
            </Text>
          </View>
          <Text
            style={[
              styles.summaryAmount,
              { color: theme.colors.text },
              neo
                ? {
                    fontSize: 20,
                    fontWeight: '900',
                    fontFamily: neo.font('900'),
                    color: neo.ink.title,
                    letterSpacing: 0,
                  }
                : null,
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
            // Escala con el sistema —es la cifra que se está confirmando— y el
            // `adjustsFontSizeToFit` la reacomoda sin partir la fila. Con 7
            // cifras y Texto Grande al 200% el importe crecía sin tope y
            // aplastaba la descripción hasta desaparecerla.
            maxFontSizeMultiplier={1.3}
          >
            {formatMoney(amount)}
          </Text>
        </View>
      </RiseView>

      {/* ── Impacto en el cupo de hoy ──────────────────────────────────
          Sólo cuando el gasto CAE en el ciclo vigente. Un gasto olvidado del
          22/07 (el CTA de días fuera de ciclo del calendario) no entra en el
          `var_cycle` de este ciclo: el cupo del Home no se mueve un peso al
          confirmarlo, así que la card entera se calla en vez de anunciar un
          desborde que no va a ocurrir, y en su lugar va el aviso de abajo.
          Ver `impactApplies`. */}
      {impactApplies ? (
        <RiseView delay={80}>
          <View
            style={[
              styles.impactCard,
              { backgroundColor: theme.colors.creamCard, borderColor: theme.colors.line },
              cardSurface,
            ]}
          >
            <View style={styles.impactHead}>
              <Text
                style={[
                  styles.impactEyebrow,
                  { color: theme.colors.textMuted },
                  neo ? { color: neo.mutedInk, fontFamily: neo.font('800') } : null,
                ]}
                numberOfLines={1}
              >
                {t('gastos:addExpense.wizard.step2.impactEyebrow')}
              </Text>
              {/* El chip es la cifra que el usuario acaba de decidir: entra
                  DESPUÉS de la card. Sin el retraso aparece pintado desde el
                  primer frame y se pierde el "esto sumaste". Y no se parte
                  nunca (`flexShrink: 0`): el que cede es el eyebrow, que puede
                  truncarse sin perder información. */}
              {isReady && neo && impact.deltaPct != null && impact.deltaPct > 0 ? (
                <Animated.Text
                  entering={STEP_DELAYED_ENTER}
                  numberOfLines={1}
                  // Escala con el sistema pero con tope, igual que el chip del
                  // alta de ingreso: con `allowFontScaling={false}` el chip era
                  // el único texto de la card que ignoraba Texto Grande.
                  maxFontSizeMultiplier={1.2}
                  style={[
                    styles.deltaChip,
                    {
                      borderRadius: neo.add.deltaChip.radius,
                      paddingHorizontal: neo.add.deltaChip.padH,
                      paddingVertical: neo.add.deltaChip.padV,
                      fontSize: neo.add.deltaChip.fontSize,
                      // NO `deltaChip.ink`: ese token es el clay `#C25B33` de
                      // bordes y fills, y a 11px sobre `#F6DCCB` (el fondo del
                      // propio chip) se queda en 3.31:1 — abajo de los 4.5:1
                      // de AA para texto normal. `accentClayInk` es la
                      // variante de TEXTO (5.1:1 sobre esa misma superficie) y
                      // en oscuro vale exactamente lo mismo que `accentClay`,
                      // así que el tema oscuro no se mueve. El hermano de
                      // ingreso no cae acá porque su delta va en verde.
                      color: neo.add.accentClayInk,
                      backgroundColor: neo.add.deltaChip.background,
                      fontFamily: neo.font('900'),
                    },
                  ]}
                >
                  {t('gastos:addExpense.wizard.step2.delta', { pp: impact.deltaPct })}
                </Animated.Text>
              ) : null}
            </View>

            <ImpactColumns
              beforeLabel={t('gastos:addExpense.wizard.step2.beforeShort')}
              afterLabel={t('gastos:addExpense.wizard.step2.afterShort')}
              beforeValue={isReady ? formatMoney(impact.budgetBefore) : PENDING_VALUE}
              // El clampeado, no el crudo: `formatMoney` toma valor absoluto, así
              // que un saldo negativo se imprimiría como positivo. El exceso se
              // dice aparte, con su propia línea.
              afterValue={isReady ? formatMoney(impact.budgetAfterClamped) : PENDING_VALUE}
              beforePctText={
                isReady && impact.usedPctBefore != null
                  ? t('gastos:addExpense.wizard.step2.pctOfBudget', {
                      pct: impact.usedPctBefore,
                    })
                  : undefined
              }
              afterPctText={
                isReady && impact.usedPctAfter != null
                  ? t('gastos:addExpense.wizard.step2.pctOfBudget', {
                      pct: impact.usedPctAfter,
                    })
                  : undefined
              }
            />

            {/* Con las queries frías no hay nada que afirmar: ni el estado
                sin-ingreso (que le diría "no configuraste tu ingreso" a un hogar
                con sueldo cargado hace meses) ni el panel de cupo sobre ceros.
                Las columnas de arriba ya están en `—`. */}
            {!isReady ? null : !incomeConfigured ? (
              <View style={styles.noBaseBlock}>
                {/* Sólo el texto, SIN botón de setup: el CTA hacía
                    `router.replace` a /add-income y desmontaba el alta entera
                    con los cinco campos adentro — el usuario volvía a un
                    formulario en blanco y tenía que tipear todo de nuevo. El
                    camino al setup existe en el Home, que es de donde no se
                    pierde nada. Mismo trato que el estado `!hasBudgetBase`. */}
                <Text
                  style={[
                    styles.noBaseText,
                    { color: theme.colors.textMuted },
                    neo ? { color: neo.mutedInk, fontFamily: neo.font('700') } : null,
                  ]}
                >
                  {t('gastos:addExpense.wizard.step2.noIncome')}
                </Text>
              </View>
            ) : !impact.hasBudgetBase ? (
              <View style={styles.noBaseBlock}>
                <Text
                  style={[
                    styles.noBaseText,
                    { color: theme.colors.textMuted },
                    neo ? { color: neo.mutedInk, fontFamily: neo.font('700') } : null,
                  ]}
                >
                  {t('gastos:addExpense.wizard.step2.noBase')}
                </Text>
              </View>
            ) : neo ? (
              <View
                style={[
                  styles.remainingPanel,
                  {
                    borderRadius: neo.add.librePanel.radius,
                    paddingVertical: neo.add.librePanel.padV,
                    paddingHorizontal: neo.add.librePanel.padH,
                    backgroundColor: neo.add.librePanel.background,
                    borderColor: neo.add.librePanel.borderColor,
                    borderWidth: neo.add.librePanel.borderWidth,
                  },
                ]}
              >
                <View style={styles.remainingHead}>
                  <BrotMascot pose={brotPose} size={42} shadow={false} />
                  <View style={styles.remainingBody}>
                    <Text
                      style={[
                        styles.remainingEyebrow,
                        { color: remainingInk, fontFamily: neo.font('800') },
                      ]}
                    >
                      {t('gastos:addExpense.wizard.step2.remainingEyebrow')}
                    </Text>
                    {/* SIN `flourish`. El camino fluido rendea el número en el
                        UI thread con `formatCountWorklet`, que tiene el
                        separador de miles "." HARDCODEADO (Intl crashea en
                        worklets): con la app en inglés esta cifra salía
                        "$1.234.567" mientras las columnas ANTES/AHORA de la
                        MISMA card, 15px más arriba, decían "$1,234,567" —
                        `formatMoney` sí sigue al idioma activo. El camino JS
                        formatea con el `format` de acá, así que el número
                        sigue contando; lo único que se pierde es el destello
                        del UI thread. */}
                    <CountUpText
                      value={impact.budgetAfterClamped}
                      format={formatMoney}
                      unit="money"
                      style={[
                        styles.remainingValue,
                        { color: remainingInk, fontFamily: neo.font('900') },
                      ]}
                    />
                  </View>
                  <HealthBadge pct={usedPctAfter} zone={zone} labels={healthLabels} />
                </View>

                <CupoGauge
                  pct={usedPctAfter}
                  fromPct={impact.usedPctBefore ?? undefined}
                  exceeds={impact.exceeds}
                />

                <View style={styles.gaugeCaption}>
                  <Text
                    style={[
                      styles.gaugeCaptionLeft,
                      { color: neo.ink.title, fontFamily: neo.font('800') },
                    ]}
                    numberOfLines={1}
                  >
                    {t('gastos:addExpense.wizard.step2.pctOfBudget', { pct: usedPctAfter })}
                  </Text>
                  {impact.exceeds ? (
                    <Text
                      style={[
                        styles.gaugeCaptionRight,
                        // La variante de TEXTO del clay, no el `accentClay` de
                        // bordes: a 11px/900 sobre el `librePanel` aquel se
                        // queda en 3.54:1 y esta línea —cuánto te pasaste del
                        // cupo, el dato más importante del paso— era la menos
                        // legible de la card. `accentClayInk` da 5.4:1 ahí y
                        // en oscuro es el mismo color, así que no se mueve.
                        { color: neo.add.accentClayInk, fontFamily: neo.font('900') },
                      ]}
                      numberOfLines={1}
                    >
                      {t('gastos:addExpense.wizard.step2.exceeds', {
                        amount: formatMoney(impact.overBy),
                      })}
                    </Text>
                  ) : null}
                </View>

                {/* Pasarse NO bloquea el alta: el gasto ya ocurrió y ocultarlo
                    no lo deshace. La línea explica qué pasa con el excedente
                    para que confirmar no se sienta un error. */}
                {impact.exceeds ? (
                  <Text
                    style={[
                      styles.exceedsHint,
                      { color: neo.mutedInk, fontFamily: neo.font('700') },
                    ]}
                  >
                    {t('gastos:addExpense.wizard.step2.exceedsHint')}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>
        </RiseView>
      ) : null}

      {/* ── Fuera del ciclo vigente ────────────────────────────────────
          Ocupa el hueco de la card de impacto: sin esta mitad, un gasto
          back-dateado a otro ciclo mostraba el paso sin impacto y el usuario
          leía "no pasa nada" sin ninguna explicación. Mismo bloque, mismos
          tokens y misma tinta que el hermano de ingreso
          (`add-income-parts/step2-summary.tsx`): card del paso con anillo
          clay, y el título con la tinta de "vencido" —que existe justo para
          texto de atención sobre superficie— porque el clay de bordes se
          queda abajo de AA como texto chico. */}
      {showsCycleNotice ? (
        <RiseView delay={80}>
          <View
            style={[
              styles.noticeCard,
              { backgroundColor: theme.colors.creamCard },
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
              {t('gastos:addExpense.wizard.step2.outsideCycleTitle')}
            </Text>
            <Text
              style={[
                styles.noticeBody,
                {
                  color: neo ? neo.ink.title : theme.colors.text,
                  fontFamily: neo ? neo.font('700') : undefined,
                },
              ]}
            >
              {placement === 'before'
                ? t('gastos:addExpense.wizard.step2.outsideCycleBefore')
                : t('gastos:addExpense.wizard.step2.outsideCycleAfter')}
            </Text>
          </View>
        </RiseView>
      ) : null}
    </>
  )
})

const styles = StyleSheet.create({
  formStack: { gap: 12 },
  formStackNeo: { gap: 10 },
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 20,
    borderWidth: 1,
  },
  summaryIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  summaryIconText: { fontSize: 22 },
  summaryBody: { flex: 1, minWidth: 0 },
  summaryName: { fontSize: 15, fontWeight: '800', fontFamily: nunitoFamily('800') },
  summaryMeta: { fontSize: 11, marginTop: 2 },
  // `flexShrink: 0`: el que cede en un ancho apretado es la descripción, que
  // puede truncarse. La cifra cortada sería una mentira. Igual que el hermano.
  summaryAmount: {
    fontSize: 18,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: -0.4,
    flexShrink: 0,
    maxWidth: 140,
  },
  impactCard: {
    borderRadius: 22,
    borderWidth: 1,
    paddingVertical: 15,
    paddingHorizontal: 16,
  },
  impactHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  // 0.14em sobre 10.5px. RN no acepta em.
  impactEyebrow: { fontSize: 10.5, fontWeight: '800', fontFamily: nunitoFamily('800'), letterSpacing: 1.47, flexShrink: 1 },
  deltaChip: { fontWeight: '900', fontFamily: nunitoFamily('900'), overflow: 'hidden', flexShrink: 0 },
  noBaseBlock: { marginTop: 14, gap: 10, alignItems: 'flex-start' },
  noBaseText: { fontSize: 12.5, fontWeight: '700', fontFamily: nunitoFamily('700'), lineHeight: 17 },
  remainingPanel: { marginTop: 14 },
  remainingHead: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  remainingBody: { flex: 1, minWidth: 0 },
  // 0.1em sobre 10px.
  remainingEyebrow: { fontSize: 10, fontWeight: '800', fontFamily: nunitoFamily('800'), letterSpacing: 1 },
  remainingValue: { fontSize: 22, fontWeight: '900', fontFamily: nunitoFamily('900'), marginTop: 1 },
  gaugeCaption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 8,
  },
  gaugeCaptionLeft: { fontSize: 11, fontWeight: '800', fontFamily: nunitoFamily('800'), flexShrink: 1 },
  gaugeCaptionRight: { fontSize: 11, fontWeight: '900', fontFamily: nunitoFamily('900'), flexShrink: 0 },
  exceedsHint: { fontSize: 11, fontWeight: '700', fontFamily: nunitoFamily('700'), lineHeight: 15, marginTop: 8 },
  // Mismas medidas que el aviso del alta de ingreso: los dos son el mismo
  // bloque y cualquier deriva los haría ver de familias distintas.
  noticeCard: { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 12, gap: 4 },
  noticeTitle: { fontSize: 12.5, fontWeight: '900', fontFamily: nunitoFamily('900'), letterSpacing: -0.1 },
  noticeBody: { fontSize: 12.5, fontWeight: '700', fontFamily: nunitoFamily('700'), lineHeight: 18 },
  notesWrap: { borderRadius: 14, borderWidth: 1 },
  notesInput: {
    minHeight: 72,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '600',
    fontFamily: nunitoFamily('600'),
  },
  dateRow: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  dateValue: { fontSize: 14, fontWeight: '800', fontFamily: nunitoFamily('800'), textTransform: 'capitalize' },
})
