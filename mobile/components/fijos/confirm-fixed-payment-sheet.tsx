import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui/app-text'
import { useTranslation } from 'react-i18next'
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { MaterialIcons } from '@expo/vector-icons'
import { ModalCard } from '@/components/ui/modal-card'
import { NeoButton } from '@/components/ui/neo-button'
import { NeoSurface } from '@/components/ui/neo-surface'
import {
  ONB_NUMPAD_SHEET_HEIGHT,
  OnbNumpad,
} from '@/components/redesign/onboarding/onb-numpad'
import { SUPPORTS_INSET_SHADOW } from '@/components/wizard/inset-shadow-support'
import { publishNumpadClose, publishNumpadOpen } from '@/lib/numpad-visibility'
import { usePressScale } from '@/hooks/use-press-scale'
import { withAlpha } from '@/theme/color-utils'
import { cssGradient, neoRadii, neoTokens } from '@/theme/neo-tokens'
import { nunitoFamily } from '@/theme/typography'
import { useThemeTokens } from '@/theme/theme-provider'
import { currencyFormatter, formatMoneyShort } from '@/utils/money'

/**
 * Terracota AA para TEXTO CHICO en el tema CLARO.
 *
 * `neo.warm` (#C96F3F) y `neo.danger` (#C25B33) están calibrados para bordes,
 * anillos y fills, que sólo necesitan 3:1: como TINTA sobre las superficies
 * claras del rediseño se quedan en 2.99-3.75:1, abajo de los 4.5 que pide AA
 * para texto normal (la nota de aviso son 11px, el chip del delta 12px). Este
 * es el mismo oscurecimiento que ya vive en la piel del wizard
 * (`fijos-skin.tsx` → `STEP2.light.accentClayInk`), y sobre el pozo claro
 * (#E9EBE0) da 5.49:1 y sobre el chip teñido 4.96:1.
 *
 * En OSCURO no hace falta: `neo.warm` (#F2A87E) ya da 5.28-8.16:1 sobre las
 * mismas superficies.
 */
const ALERT_INK_LIGHT = '#9A421F'

interface ConfirmFixedPaymentSheetProps {
  visible: boolean
  /** Nombre del fijo (cabecera). */
  fixedExpenseName: string
  /** Último monto pagado (= `fixed_expenses.amount`). Prepara el botón
   *  primario "Mismo monto · $X" y precarga el input cuando el user
   *  elige "Cambió". */
  previousAmount: number
  /** True si el fijo estaba VENCIDO al momento de abrir el sheet. Se
   *  pasa al RPC como contexto (el RPC también lo recalcula DB-side
   *  para seguridad). La UI muestra una nota visible cuando es true
   *  para reforzar que el monto puede incluir intereses. */
  wasOverdue: boolean
  /** True mientras la mutation está en flight (post-confirm). */
  isProcessing: boolean
  onClose: () => void
  /** Confirm sin cambio de monto. RPC se llama sin amountOverride. */
  onConfirmSame: () => void
  /** Confirm con monto editado. RPC se llama con amountOverride =
   *  parsedAmount (debe ser > 0; sheet valida antes de invocar). */
  onConfirmChanged: (newAmount: number) => void
}

type Mode = 'same' | 'changed'

/**
 * Sheet de confirmación de precio al registrar el pago de un fijo (2do+).
 *
 * UX:
 *   1) Header con nombre del fijo + última cantidad pagada.
 *   2) Nota de "cobrado con mora" si `wasOverdue` (rojo soft, sutil).
 *   3) Dos opciones grandes:
 *        a) "Mismo monto · $X" (primario, default) → cierra sin override.
 *        b) "Cambió" (secondary)   → revela el pozo de monto con $X precargado.
 *   4) Preview inline del cambio cuando edita ("+$1.500 · +12%").
 *   5) Botón final "Confirmar pago".
 *
 * PIEL: rediseño neumórfico. La carcasa la pone `ModalCard skin="neo"` (hoja
 * `neo.sheet`, esquinas 34, sombra hacia arriba, píldora de arrastre) y el
 * contenido habla el mismo idioma: la card del último monto es una superficie
 * ELEVADA, la nota de mora y el chip del delta son POZOS, el selector de modo
 * se HUNDE al elegirse (no se rellena en negativo) y el input de monto es el
 * pozo grande del handoff en vez de un `TextField` con borde.
 *
 * El sheet NO conoce de mutations — la pantalla huésped maneja
 * `recordPaymentMutation.mutate` en `onConfirmSame`/`onConfirmChanged`.
 *
 * No abre cuando es el 1er pago (la pantalla huésped detecta eso vía
 * `isFirstFixedPayment` y omite directamente este sheet).
 */
export function ConfirmFixedPaymentSheet({
  visible,
  fixedExpenseName,
  previousAmount,
  wasOverdue,
  isProcessing,
  onClose,
  onConfirmSame,
  onConfirmChanged,
}: ConfirmFixedPaymentSheetProps) {
  const theme = useThemeTokens()
  const neo = neoTokens(theme.mode)
  const isDark = theme.mode === 'dark'
  const { t } = useTranslation()
  const [mode, setMode] = useState<Mode>('same')
  const [amountText, setAmountText] = useState('')
  const samePress = usePressScale({ pressedScale: 0.97 })
  const changedPress = usePressScale({ pressedScale: 0.97 })
  const wellPress = usePressScale({ pressedScale: 0.985 })

  // ── Numpad de la app (no el del SO) ────────────────────────────────
  // El monto de un fijo se carga con el teclado del rediseño en TODAS las
  // demás superficies (alta de fijo, de gasto y de ingreso); acá había
  // quedado un TextInput nativo de la tanda anterior. El numpad se monta en
  // su propio <Modal> anclado abajo, así que taparía la hoja: publicando su
  // alto por `numpad-visibility`, el ModalCard reserva el espacio y el pozo
  // queda visible. Mismo patrón que `useSheetNumpad` de los sheets de Ajustes.
  const [numpadOpen, setNumpadOpen] = useState(false)
  const insets = useSafeAreaInsets()
  const scrollRef = useRef<ScrollView | null>(null)
  useEffect(() => {
    if (!numpadOpen) return
    publishNumpadOpen(ONB_NUMPAD_SHEET_HEIGHT + insets.bottom)
    return () => {
      publishNumpadClose()
    }
  }, [numpadOpen, insets.bottom])

  // Revelar el campo al abrir el teclado. Con el numpad puesto el cuerpo de la
  // hoja se comprime a ~150pt (reserva el alto del teclado), así que el pozo
  // del monto —que vive debajo del snapshot y del selector— quedaba abajo del
  // fold: el usuario veía el teclado pero no lo que estaba tipeando.
  //
  // Los reintentos son por el mismo motivo que en `useNumpadScrollAvoid`: el
  // primer frame todavía no midió el alto nuevo, así que un solo `scrollToEnd`
  // se queda corto. Idempotente — al final el scroll ya está donde tiene que
  // estar y los reintentos no mueven nada.
  useEffect(() => {
    if (!numpadOpen) return
    const timers = [0, 80, 220].map((delay) =>
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: delay > 0 }), delay),
    )
    return () => timers.forEach(clearTimeout)
  }, [numpadOpen])

  // Tintas de estado ya resueltas por tema. `alertInk` sube (aumento, mora),
  // `positiveInk` baja (el fijo salió más barato) y es también la tinta del
  // chip seleccionado — en claro va el verde PROFUNDO porque el `green` del
  // sistema sobre el tinte de selección se queda en 3.97:1.
  const alertInk = isDark ? neo.warm : ALERT_INK_LIGHT
  const positiveInk = isDark ? neo.green : neo.greenDeep

  // Hidratamos cuando el sheet abre — useEffect en vez de inicializador
  // de useState porque el sheet vive montado entre aperturas y queremos
  // que cada apertura arranque limpia.
  useEffect(() => {
    if (!visible) return
    // Hidratamos al abrir el sheet — el sheet vive montado entre
    // aperturas y queremos arrancar limpios (modo "same", monto
    // precargado con el último valor). El lint warn de
    // `set-state-in-effect` aplica cuando esto causa re-render
    // innecesario; aquí el reset SOLO ocurre cuando `visible` flipea
    // a true (sheet recién abierto), no en cada render — necesario
    // para resetear estado stale de la apertura anterior.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate on open
    setMode('same')
    setAmountText(String(Math.max(0, Math.round(previousAmount))))
    // El sheet vive montado entre aperturas: si quedó con el numpad abierto,
    // reabrirlo lo mostraría sobre un monto que ya se rehidrató.
    setNumpadOpen(false)
  }, [visible, previousAmount])

  const parsedAmount = useMemo(() => {
    const digits = amountText.replace(/[^\d]/g, '')
    return digits === '' ? 0 : parseInt(digits, 10)
  }, [amountText])

  // El numpad trabaja con un ENTERO de pesos; el 0 vuelve al string vacío
  // para que el placeholder propio siga apareciendo (si guardáramos "0", el
  // pozo mostraría un cero en tinta plena, indistinguible de un monto).
  const handleNumpadChange = useCallback((next: number) => {
    setAmountText(next === 0 ? '' : String(next))
  }, [])

  const delta = parsedAmount - Math.round(previousAmount)
  const deltaPct =
    previousAmount > 0 && parsedAmount > 0
      ? Math.round((delta / previousAmount) * 100)
      : 0

  // Habilita confirm en modo "changed" solo si el monto es válido (> 0).
  const isChangedValid = parsedAmount > 0
  // En modo "same" siempre OK; el botón es la opción primaria default.
  const isSameValid = previousAmount > 0

  // Material del chip de modo. El seleccionado se HUNDE con el anillo verde
  // (`ringSelected`) sobre el tinte de selección; el de reposo es un tile
  // ELEVADO con el gradiente raised del tema. En Android < API 28 el anillo
  // —que es un boxShadow outset— se descarta en silencio: el `selectedTint`
  // es lo único que queda para distinguirlos, por eso no se omite.
  const modeSurface = (selected: boolean) =>
    selected
      ? { backgroundColor: neo.selectedTint, boxShadow: neo.shadows.ringSelected }
      : { ...cssGradient(neo.raisedGradientCss, neo.surface), boxShadow: neo.shadows.raisedSm }

  const previousLabel = currencyFormatter.format(previousAmount)
  const overduePill = wasOverdue ? (
    <NeoSurface
      backgroundColor={neo.well}
      radius={neoRadii.pill}
      style={[
        styles.overduePill,
        // Sin sombra inset (Android < API 29) el pozo queda como un
        // rectángulo casi del mismo tono que la card: ahí y sólo ahí,
        // hairline en la propia tinta de la alerta.
        SUPPORTS_INSET_SHADOW
          ? null
          : { borderWidth: 1, borderColor: withAlpha(alertInk, 0.35) },
      ]}
      variant="insetSm"
    >
      <MaterialIcons color={alertInk} name="warning" size={12} />
      <Text style={[styles.overduePillText, { color: alertInk }]}>
        {t('fijos:confirmPayment.overdueNote')}
      </Text>
    </NeoSurface>
  ) : null

  return (
    <ModalCard
      // El CTA va ANCLADO, fuera del scroll: con el numpad abierto la card
      // reserva ~450pt y el cuerpo se comprime — en el body, "Confirmar pago"
      // quedaba atrás del scroll justo cuando el usuario termina de tipear.
      footer={
        <NeoButton
          block
          busy={isProcessing}
          disabled={mode === 'changed' ? !isChangedValid : !isSameValid}
          label={t('fijos:confirmPayment.confirm')}
          onPress={() => {
            // El numpad se cierra ANTES de confirmar: si su <Modal> sigue
            // presentado cuando la pantalla huésped cierra el sheet, se apilan
            // dos dismiss y en iOS la cadena queda colgada.
            setNumpadOpen(false)
            if (mode === 'changed') {
              if (!isChangedValid) return
              onConfirmChanged(parsedAmount)
            } else {
              if (!isSameValid) return
              onConfirmSame()
            }
          }}
          variant="primary"
        />
      }
      onClose={onClose}
      scrollRef={scrollRef}
      skin="neo"
      subtitle={t('fijos:confirmPayment.subtitle')}
      title={t('fijos:confirmPayment.title')}
      visible={visible}
    >
      <View style={styles.body}>
        {/* Snapshot del último monto + nombre del fijo. Card ELEVADA dentro
            de la hoja: el neumorfismo la separa por relieve, sin borde.
            Con el teclado abierto se COMPACTA a un renglón: la hoja reserva el
            alto del numpad y el cuerpo cae a ~130pt, así que la card entera
            (~115pt) se comía sola el espacio del campo. La misma información
            sigue en pantalla, en una línea. */}
        {numpadOpen ? (
          <View style={styles.snapshotCompact}>
            <Text numberOfLines={1} style={[styles.snapshotCompactName, { color: neo.textMuted }]}>
              {fixedExpenseName.toUpperCase()}
            </Text>
            <Text numberOfLines={1} style={[styles.snapshotCompactValue, { color: neo.text }]}>
              {previousLabel}
            </Text>
          </View>
        ) : (
        <NeoSurface
          radius={neoRadii.cardSm}
          style={[
            styles.snapshotCard,
            // La card se separa de la hoja SOLO por relieve: su gradiente
            // raised está a un paso del tono de la hoja. Donde Android
            // descarta el boxShadow en silencio, el bloque se fundiría con el
            // fondo — ahí y sólo ahí, hairline.
            SUPPORTS_INSET_SHADOW
              ? null
              : { borderWidth: 1, borderColor: withAlpha(neo.textTertiary, 0.4) },
          ]}
          variant="raisedMd"
        >
          <Text
            numberOfLines={1}
            style={[styles.snapshotEyebrow, { color: neo.textMuted }]}
          >
            {fixedExpenseName.toUpperCase()}
          </Text>
          <Text style={[styles.snapshotValue, { color: neo.text }]}>
            {previousLabel}
          </Text>
          <Text style={[styles.snapshotMeta, { color: neo.textMuted }]}>
            {t('fijos:confirmPayment.lastAmount')}
          </Text>
          {overduePill}
        </NeoSurface>
        )}
        {/* La nota de mora NO se pierde al compactar: es la única señal de que
            el monto puede traer intereses, justo lo que el usuario va a tipear. */}
        {numpadOpen ? overduePill : null}

        {/* Selector de modo. Misma altura para que la transición entre
            options se sienta firme; el activo NO se rellena en negativo —
            se hunde con el anillo verde, que es el recurso de "presionado"
            del neumorfismo (mismo patrón que FreqTile y los tiles del alta). */}
        <View style={styles.modeRow}>
          <Pressable
            accessibilityLabel={t('fijos:confirmPayment.sameAmount')}
            accessibilityRole="button"
            accessibilityState={{ selected: mode === 'same' }}
            onPress={() => {
              setMode('same')
              // Volver a "mismo monto" con el numpad puesto dejaba la hoja del
              // teclado tapando media pantalla sin campo que editar.
              setNumpadOpen(false)
            }}
            onPressIn={samePress.onPressIn}
            onPressOut={samePress.onPressOut}
            style={styles.modeWrap}
          >
            <Animated.View
              style={[styles.modeBtn, modeSurface(mode === 'same'), samePress.animatedStyle]}
            >
              <MaterialIcons
                color={mode === 'same' ? positiveInk : neo.textMuted}
                name="check"
                size={14}
              />
              <Text
                numberOfLines={1}
                style={[
                  styles.modeBtnText,
                  { color: mode === 'same' ? positiveInk : neo.text },
                ]}
              >
                {t('fijos:confirmPayment.same', { amount: previousLabel })}
              </Text>
            </Animated.View>
          </Pressable>
          <Pressable
            accessibilityLabel={t('fijos:confirmPayment.changed')}
            accessibilityRole="button"
            accessibilityState={{ selected: mode === 'changed' }}
            onPress={() => {
              setMode('changed')
              // Elegir "Cambió" ES la intención de editar: abrir el teclado acá
              // ahorra el segundo tap sobre el pozo (que además, hasta que el
              // scroll lo revela, puede no estar a la vista).
              setNumpadOpen(true)
            }}
            onPressIn={changedPress.onPressIn}
            onPressOut={changedPress.onPressOut}
            style={styles.modeWrap}
          >
            <Animated.View
              style={[
                styles.modeBtn,
                modeSurface(mode === 'changed'),
                changedPress.animatedStyle,
              ]}
            >
              <MaterialIcons
                color={mode === 'changed' ? positiveInk : neo.textMuted}
                name="edit"
                size={14}
              />
              <Text
                numberOfLines={1}
                style={[
                  styles.modeBtnText,
                  { color: mode === 'changed' ? positiveInk : neo.text },
                ]}
              >
                {t('fijos:confirmPayment.changed')}
              </Text>
            </Animated.View>
          </Pressable>
        </View>

        {/* Input + preview de variación — solo en modo "changed". El
            FadeIn/FadeOut suaviza la entrada para que no aparezca como
            un salto visual. */}
        {mode === 'changed' ? (
          <Animated.View
            entering={FadeIn.duration(180)}
            exiting={FadeOut.duration(120)}
            style={styles.changedBlock}
          >
            {/* El label sale AFUERA del campo, como los eyebrows del wizard
                (NOMBRE / MONTO / CATEGORÍA): adentro del pozo queda sólo la
                cifra. Reemplaza al label flotante del `TextField` V1. */}
            <Text style={[styles.fieldEyebrow, { color: neo.textMuted }]}>
              {t('fijos:confirmPayment.amountPaid')}
            </Text>
            {/* El pozo es TAP-TO-EDIT, no un input nativo: abre el numpad del
                rediseño, igual que el monto en el alta de fijo/gasto/ingreso.
                Antes montaba un TextInput con `keyboardType="number-pad"`, que
                levantaba el teclado del SO — la única superficie de dinero del
                rediseño que se había quedado sin migrar. */}
            <Pressable
              accessibilityHint={t('fijos:confirmPayment.amountPaidHint')}
              accessibilityLabel={t('fijos:confirmPayment.amountPaidA11y')}
              accessibilityRole="button"
              onPress={() => setNumpadOpen(true)}
              onPressIn={wellPress.onPressIn}
              onPressOut={wellPress.onPressOut}
            >
              <Animated.View style={wellPress.animatedStyle}>
                <NeoSurface
                  backgroundColor={neo.well}
                  radius={neoRadii.input}
                  style={[
                    styles.amountWell,
                    SUPPORTS_INSET_SHADOW
                      ? null
                      : { borderWidth: 1, borderColor: withAlpha(neo.textTertiary, 0.45) },
                    // Mientras se edita, el pozo se anilla como el resto de los
                    // campos activos del rediseño: sin cursor nativo, el anillo
                    // es lo único que dice "esto es lo que estás tipeando".
                    numpadOpen ? { boxShadow: neo.shadows.ringSelected } : null,
                  ]}
                  variant="insetLg"
                >
                  <Text style={[styles.amountInput, { color: neo.text }]}>
                    {amountText === '' ? ' ' : amountText}
                  </Text>
                  {/* Placeholder PROPIO (mismos tokens tipográficos) — se
                      conserva del input anterior para que el pozo vacío no
                      quede mudo. */}
                  {amountText === '' ? (
                    <Text
                      pointerEvents="none"
                      // `textMuted`, no `textTertiary`: el terciario sobre el
                      // pozo claro da 2.11:1 — ni el 3:1 de texto grande.
                      style={[styles.amountPlaceholder, { color: neo.textMuted }]}
                    >
                      0
                    </Text>
                  ) : null}
                </NeoSurface>
              </Animated.View>
            </Pressable>
            {parsedAmount > 0 && delta !== 0 ? (
              <NeoSurface
                backgroundColor={withAlpha(
                  delta > 0 ? neo.warm : neo.green,
                  isDark ? 0.16 : 0.14,
                )}
                radius={neoRadii.chip}
                style={styles.deltaRow}
                variant="insetSm"
              >
                <MaterialIcons
                  color={delta > 0 ? alertInk : positiveInk}
                  name={delta > 0 ? 'trending-up' : 'trending-down'}
                  size={14}
                />
                <Text
                  style={[
                    styles.deltaText,
                    { color: delta > 0 ? alertInk : positiveInk },
                  ]}
                >
                  {delta > 0 ? '+' : '−'}
                  {formatMoneyShort(Math.abs(delta))}
                  {deltaPct !== 0 ? ` · ${delta > 0 ? '+' : ''}${deltaPct}%` : ''}
                </Text>
              </NeoSurface>
            ) : null}
          </Animated.View>
        ) : null}

      </View>
      {/* Último hermano y fuera del cuerpo: se monta en su propio <Modal>
          anclado al borde inferior, por encima de la hoja. */}
      <OnbNumpad
        mode={theme.mode}
        onChange={handleNumpadChange}
        onDone={() => setNumpadOpen(false)}
        value={parsedAmount}
        visible={numpadOpen}
      />
    </ModalCard>
  )
}

const styles = StyleSheet.create({
  body: { gap: 14 },
  snapshotCard: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: 'flex-start',
    gap: 2,
  },
  // El `fontFamily` viaja SIEMPRE con el peso: cada peso de Nunito es un face
  // estático, así que un `fontWeight` suelto rinde el regular del sistema.
  snapshotEyebrow: {
    fontSize: 10,
    letterSpacing: 1.4,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    marginBottom: 2,
  },
  snapshotValue: {
    fontSize: 24,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: -0.4,
    fontVariant: ['tabular-nums'],
  },
  snapshotMeta: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: nunitoFamily('600'),
  },
  // Variante de un renglón mientras el numpad está abierto (ver el bloque que
  // la monta): mismo contenido, sin la caja elevada ni la línea de contexto.
  snapshotCompact: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 10,
  },
  snapshotCompactName: {
    fontSize: 10,
    letterSpacing: 1.4,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    flexShrink: 1,
  },
  snapshotCompactValue: {
    fontSize: 15,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: -0.2,
    fontVariant: ['tabular-nums'],
  },
  overduePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    marginTop: 8,
  },
  // 10 → 11px: a 10 la nota de mora no llegaba a AA ni con la tinta
  // oscurecida sobre el pozo claro (el umbral de "texto grande" arranca en
  // 18.66px, así que estos 11px se miden contra 4.5:1 igual que los 10).
  overduePillText: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    letterSpacing: 0.2,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  modeWrap: { flex: 1 },
  modeBtn: {
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: neoRadii.chip,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  modeBtnText: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  changedBlock: { gap: 8 },
  fieldEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: 1.98,
    textTransform: 'uppercase',
  },
  amountWell: {
    paddingHorizontal: 17,
    paddingVertical: 12,
  },
  amountInput: {
    fontSize: 30,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    letterSpacing: -0.6,
    // `padding: 0` mata el padding implícito del TextInput de Android, que
    // desalinea la cifra respecto del padding del pozo.
    padding: 0,
    fontVariant: ['tabular-nums'],
  },
  amountPlaceholder: {
    position: 'absolute',
    left: 17,
    top: 12,
    fontSize: 30,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    letterSpacing: -0.6,
    fontVariant: ['tabular-nums'],
  },
  deltaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  deltaText: {
    fontSize: 12,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: -0.2,
    fontVariant: ['tabular-nums'],
  },
})
