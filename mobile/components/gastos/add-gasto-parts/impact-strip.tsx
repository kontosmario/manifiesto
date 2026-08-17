// Tira de IMPACTO del alta de gasto: qué te queda del cupo de hoy si confirmás
// este movimiento. Vive pegada arriba del CTA y se actualiza EN VIVO, con cada
// dígito del monto.
//
// Reemplaza a la card de ~242pt del viejo paso 2 (`step2-summary.tsx`, borrado
// el 2026-08-17). Ese paso cobraba un tap de CTA por mostrar exactamente esta
// información y no agregaba ninguna validación —`canSubmit` evaluaba idéntico
// a `canContinue`—, así que la cuenta se mudó al único lugar donde tiene que
// estar: al lado del botón que la confirma.
//
// Qué se conservó de aquel paso, y dónde:
//  · `!isReady`              → cifra en `—`, sin veredicto (rama `pending`).
//  · sin ingreso configurado → la línea `noIncome`, sin medidor ni porcentajes.
//  · sin cupo (`hasBudgetBase` false) → la línea `noBase`.
//  · fuera del ciclo vigente → el aviso `outsideCycle*`, que OCUPA el hueco de
//    la tira en vez de sumarse a ella (igual que antes ocupaba el de la card).
//  · el resto —"TE QUEDA HOY", `HealthBadge`, `CupoGauge`, "% del cupo" y
//    "te pasás por $X"— vive acá, compacto.
// Lo único que se movió a la hoja de "ver detalle" (`impact-detail-sheet.tsx`)
// es lo que no entra en una tira: las columnas ANTES→AHORA, el chip del delta,
// el Brot y la línea que explica qué pasa con el excedente.
import { memo } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui/app-text'
import { useTranslation } from 'react-i18next'
import { MaterialIcons } from '@expo/vector-icons'
import { CountUpText } from '@/components/home/animated/count-up-text'
import { HealthBadge } from '@/components/wizard/parts/health-badge'
import { useWizardSkin } from '@/components/wizard/wizard-skin'
import type { AddExpenseImpact } from '@/features/expenses/add-expense-impact'
// Del alta de INGRESO por reuso deliberado: clasificar una fecha contra la
// ventana del ciclo es la misma cuenta en los dos flujos (ver el docblock del
// import gemelo en `add-gasto-v2-screen`).
import type { CyclePlacement } from '@/features/income/add-income-impact'
import { useAppTheme } from '@/theme/theme-provider'
import { nunitoFamily } from '@/theme/typography'
import { formatMoney } from '@/utils/money'
import { CupoGauge, zoneForCupoPct } from './cupo-gauge'

/** Placeholder de una cifra que todavía no se puede afirmar (mismo recurso que
 *  el paso 2 del alta de ingreso). */
const PENDING_VALUE = '—'

export interface ImpactStripProps {
  impact: AddExpenseImpact
  /** `false` == el hogar todavía no configuró ingreso. Sin base no hay
   *  porcentaje que mostrar: se dice, no se muestra un "0%". */
  incomeConfigured: boolean
  /**
   * `false` mientras hidratan las queries del ciclo y del día destino. Con el
   * dashboard frío el cupo vale 0 e `incomeConfigured` sale `false`, que es
   * indistinguible de "este hogar no cargó ingreso": la tira mostraría $0 y,
   * abajo, "todavía no configuraste un ingreso" a una familia con sueldo
   * cargado hace meses. Con `false` la cifra va al placeholder y no se dibuja
   * ningún veredicto.
   */
  isReady: boolean
  /**
   * `false` cuando el gasto se estampa en un día que cae FUERA del ciclo
   * vigente (el "registrar olvidado" del calendario acepta días de ciclos
   * cerrados). Ese gasto no entra en el `var_cycle` de este ciclo: al
   * confirmar, el cupo del Home no se mueve un peso, así que la tira no afirma
   * un impacto que no va a ocurrir.
   */
  impactApplies: boolean
  /** Dónde cae la fecha destino respecto del ciclo VIGENTE. Con `impactApplies`
   *  en `false` es lo que decide CUÁL de las dos explicaciones se muestra
   *  (ciclo anterior / ciclo siguiente). */
  placement: CyclePlacement
  /** Abre la hoja de detalle. La tira ENTERA es el control. */
  onOpenDetail: () => void
}

/**
 * MEMOIZADA — y por eso ninguna de sus props puede depender de la NOTA ni de la
 * descripción.
 *
 * La tira vive en el footer de una pantalla cuyo estado incluye los dos campos
 * de texto, así que cada carácter tipeado re-renderiza la screen. Sin la memo
 * eso arrastraba `CountUpText`, `CupoGauge` (con su perilla animada),
 * `HealthBadge` y ~20 arrays de estilo por tecla. Todas las props que entran
 * acá son primitivas o vienen memoizadas desde la screen (`impact` de un
 * `useMemo`, `onOpenDetail` de un `useCallback`), así que la memo corta de
 * verdad.
 */
export const ImpactStrip = memo(function ImpactStrip({
  impact,
  incomeConfigured,
  isReady,
  impactApplies,
  placement,
  onOpenDetail,
}: ImpactStripProps) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  const skin = useWizardSkin()
  const neo = skin.kind === 'neo' ? skin : null

  // El aviso ocupa el MISMO hueco que la tira: es su reemplazo explicativo, no
  // un bloque extra. Con el ciclo sin hidratar la ventana todavía puede ser la
  // del default, así que no se afirma nada.
  const showsCycleNotice = isReady && !impactApplies && placement !== 'inside'

  const cardStyle = [
    styles.card,
    { backgroundColor: theme.colors.creamCard, borderColor: theme.colors.line },
    neo
      ? {
          borderWidth: 0,
          backgroundColor: neo.add.step2Card.background,
          experimental_backgroundImage: neo.add.step2Card.gradientCss,
          boxShadow: neo.add.step2Card.shadow,
        }
      : null,
  ]

  // ── Fuera del ciclo vigente ────────────────────────────────────────
  // Mismos tokens y misma tinta que el hermano de ingreso: card del paso con
  // anillo clay, y el título con la tinta de "vencido" —que existe justo para
  // texto de atención sobre superficie— porque el clay de bordes se queda
  // abajo de AA como texto chico.
  if (showsCycleNotice) {
    return (
      <View
        style={[
          styles.card,
          { backgroundColor: theme.colors.creamCard },
          neo
            ? {
                backgroundColor: neo.add.step2Card.background,
                experimental_backgroundImage: neo.add.step2Card.gradientCss,
                boxShadow: neo.add.step2Card.shadow,
                borderColor: neo.add.accentClay,
                borderWidth: 1.5,
              }
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
    )
  }

  const eyebrowInk = neo ? neo.mutedInk : theme.colors.textMuted
  const eyebrowStyle = [
    styles.eyebrow,
    { color: eyebrowInk },
    neo ? { fontFamily: neo.font('800') } : null,
  ]

  // ── Estados que todavía no pueden afirmar un impacto ───────────────
  // Tres casos con el mismo tratamiento: SIN medidor —una perilla sobre ceros
  // se lee como "gastaste todo"— y sin hoja de detalle, porque no habría
  // columnas que llenar. `impactApplies` no entra en el guard: cuando es falso
  // y el ciclo ya hidrató, la rama del aviso de arriba ya devolvió; y si no
  // hidrató, este mismo bloque lo cubre con el placeholder.
  if (!isReady || !incomeConfigured || !impact.hasBudgetBase) {
    return (
      <View style={cardStyle}>
        <Text style={eyebrowStyle} numberOfLines={1}>
          {t('gastos:addExpense.wizard.step2.remainingEyebrow')}
        </Text>
        {!isReady ? (
          // Las queries del ciclo / del día destino no hidrataron. Con el
          // dashboard frío el cupo vale 0 e `incomeConfigured` sale false: si
          // acá se cayera a la línea de abajo, se le ofrecería el setup de
          // ingreso a un hogar con sueldo cargado hace meses.
          <Text
            style={[
              styles.value,
              { color: neo ? neo.ink.title : theme.colors.text },
              neo ? { fontFamily: neo.font('900') } : null,
            ]}
          >
            {PENDING_VALUE}
          </Text>
        ) : (
          // Sin botón de setup: el CTA de antes hacía `router.replace` a
          // /add-income y desmontaba el alta entera con los campos adentro —
          // el usuario volvía a un formulario en blanco. El camino al setup
          // existe en el Home, que es de donde no se pierde nada.
          <Text
            style={[
              styles.blockedText,
              { color: eyebrowInk },
              neo ? { fontFamily: neo.font('700') } : null,
            ]}
          >
            {!incomeConfigured
              ? t('gastos:addExpense.wizard.step2.noIncome')
              : t('gastos:addExpense.wizard.step2.noBase')}
          </Text>
        )}
      </View>
    )
  }

  // ── Tira completa ──────────────────────────────────────────────────
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

  return (
    <Pressable
      onPress={onOpenDetail}
      accessibilityRole="button"
      accessibilityLabel={t('gastos:addExpense.wizard.step2.detailA11y', {
        amount: formatMoney(impact.budgetAfterClamped),
        pct: usedPctAfter,
      })}
      accessibilityHint={t('gastos:addExpense.wizard.step2.detailHint')}
      style={cardStyle}
    >
      <View style={styles.headRow}>
        <Text style={[...eyebrowStyle, styles.headEyebrow]} numberOfLines={1}>
          {t('gastos:addExpense.wizard.step2.remainingEyebrow')}
        </Text>
        <Text
          style={[
            styles.headPct,
            { color: eyebrowInk },
            neo ? { fontFamily: neo.font('800') } : null,
          ]}
          numberOfLines={1}
        >
          {t('gastos:addExpense.wizard.step2.pctOfBudget', { pct: usedPctAfter })}
        </Text>
        <MaterialIcons name="chevron-right" size={16} color={eyebrowInk} />
      </View>

      <View style={styles.valueRow}>
        {/* El contador va en una columna `flex:1`: con 7 cifras y la badge al
            lado, sin esto el número empujaba la badge fuera de la card en un
            teléfono angosto.

            SIN `flourish`. El camino fluido rendea el número en el UI thread
            con `formatCountWorklet`, que tiene el separador de miles "."
            HARDCODEADO (Intl crashea en worklets): con la app en inglés esta
            cifra salía "$1.234.567" mientras las columnas ANTES/AHORA de la
            hoja de detalle decían "$1,234,567" — `formatMoney` sí sigue al
            idioma activo. El camino JS formatea con el `format` de acá, así
            que el número sigue contando; lo único que se pierde es el destello
            del UI thread. */}
        <View style={styles.valueCol}>
          <CountUpText
            value={impact.budgetAfterClamped}
            format={formatMoney}
            unit="money"
            style={[
              styles.value,
              { color: remainingInk },
              neo ? { fontFamily: neo.font('900') } : null,
            ]}
          />
        </View>
        <HealthBadge
          pct={usedPctAfter}
          zone={zone}
          labels={{
            high: t('gastos:addExpense.wizard.step2.healthBadge.high'),
            mid: t('gastos:addExpense.wizard.step2.healthBadge.mid'),
            healthy: t('gastos:addExpense.wizard.step2.healthBadge.healthy'),
          }}
        />
      </View>

      <CupoGauge
        pct={usedPctAfter}
        fromPct={impact.usedPctBefore ?? undefined}
        exceeds={impact.exceeds}
      />

      {/* Pasarse NO bloquea el alta: el gasto ya ocurrió y ocultarlo no lo
          deshace. Acá va el HECHO; el porqué —qué pasa con el excedente— vive
          en la hoja de detalle, que es lo que el chevron promete. */}
      {impact.exceeds ? (
        <Text
          style={[
            styles.exceeds,
            // La variante de TEXTO del clay, no el `accentClay` de bordes: a
            // 11px/900 sobre la card aquel se queda abajo de AA, y esta línea
            // —cuánto te pasaste del cupo— es el dato más importante de la
            // tira. `accentClayInk` da 5.4:1 y en oscuro es el mismo color.
            { color: neo ? neo.add.accentClayInk : theme.colors.danger },
            neo ? { fontFamily: neo.font('900') } : null,
          ]}
          numberOfLines={1}
        >
          {t('gastos:addExpense.wizard.step2.exceeds', {
            amount: formatMoney(impact.overBy),
          })}
        </Text>
      ) : null}
    </Pressable>
  )
})

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  // 0.1em sobre 10px. RN no acepta em.
  eyebrow: { fontSize: 10, fontWeight: '800', fontFamily: nunitoFamily('800'), letterSpacing: 1 },
  // El que cede en un ancho apretado es el eyebrow: el porcentaje es un dato.
  headEyebrow: { flexShrink: 1 },
  headPct: {
    fontSize: 10.5,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    marginLeft: 'auto',
    flexShrink: 0,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 1,
  },
  valueCol: { flex: 1, minWidth: 0 },
  value: { fontSize: 20, fontWeight: '900', fontFamily: nunitoFamily('900') },
  blockedText: {
    fontSize: 12.5,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    lineHeight: 17,
    marginTop: 4,
  },
  exceeds: {
    fontSize: 11,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    marginTop: 6,
  },
  // Mismas medidas que el aviso del alta de ingreso: los dos son el mismo
  // bloque y cualquier deriva los haría ver de familias distintas.
  noticeTitle: {
    fontSize: 12.5,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    letterSpacing: -0.1,
  },
  noticeBody: {
    fontSize: 12.5,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    lineHeight: 18,
    marginTop: 4,
  },
})
