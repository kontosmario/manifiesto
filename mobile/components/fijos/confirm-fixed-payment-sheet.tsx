import { useEffect, useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated'
import { MaterialIcons } from '@expo/vector-icons'
import { AppButton } from '@/components/ui/button'
import { ModalCard } from '@/components/ui/modal-card'
import { TextField } from '@/components/ui/text-field'
import { usePressScale } from '@/hooks/use-press-scale'
import { useAppTheme } from '@/theme/theme-provider'
import { currencyFormatter, formatMoneyShort } from '@/utils/money'

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
 *        b) "Cambió" (secondary)   → revela TextField con $X precargado.
 *   4) Preview inline del cambio cuando edita ("+$1.500 · +12%").
 *   5) Botón final "Confirmar pago".
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
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  const [mode, setMode] = useState<Mode>('same')
  const [amountText, setAmountText] = useState('')
  const samePress = usePressScale({ pressedScale: 0.97 })
  const changedPress = usePressScale({ pressedScale: 0.97 })

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
  }, [visible, previousAmount])

  const parsedAmount = useMemo(() => {
    const digits = amountText.replace(/[^\d]/g, '')
    return digits === '' ? 0 : parseInt(digits, 10)
  }, [amountText])

  const delta = parsedAmount - Math.round(previousAmount)
  const deltaPct =
    previousAmount > 0 && parsedAmount > 0
      ? Math.round((delta / previousAmount) * 100)
      : 0

  // Habilita confirm en modo "changed" solo si el monto es válido (> 0).
  const isChangedValid = parsedAmount > 0
  // En modo "same" siempre OK; el botón es la opción primaria default.
  const isSameValid = previousAmount > 0

  const previousLabel = currencyFormatter.format(previousAmount)
  const overduePill = wasOverdue ? (
    <View
      style={[
        styles.overduePill,
        {
          backgroundColor: theme.isDark
            ? 'rgba(242,167,140,0.16)'
            : 'rgba(151,53,17,0.10)',
        },
      ]}
    >
      <MaterialIcons
        name="warning"
        size={11}
        color={theme.isDark ? '#F2A78C' : '#973511'}
      />
      <Text
        style={[
          styles.overduePillText,
          { color: theme.isDark ? '#F2A78C' : '#973511' },
        ]}
      >
        {t('fijos:confirmPayment.overdueNote')}
      </Text>
    </View>
  ) : null

  return (
    <ModalCard
      visible={visible}
      onClose={onClose}
      title={t('fijos:confirmPayment.title')}
      subtitle={t('fijos:confirmPayment.subtitle')}
    >
      <View style={styles.body}>
        {/* Snapshot del último monto + nombre del fijo. */}
        <View
          style={[
            styles.snapshotCard,
            {
              backgroundColor: theme.colors.surfaceMuted,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <Text
            style={[styles.snapshotEyebrow, { color: theme.colors.textMuted }]}
            numberOfLines={1}
          >
            {fixedExpenseName.toUpperCase()}
          </Text>
          <Text style={[styles.snapshotValue, { color: theme.colors.text }]}>
            {previousLabel}
          </Text>
          <Text
            style={[styles.snapshotMeta, { color: theme.colors.textMuted }]}
          >
            {t('fijos:confirmPayment.lastAmount')}
          </Text>
          {overduePill}
        </View>

        {/* Selector de modo. Misma altura para que la transición entre
            options se sienta firme; el activo se hincha con creamCard
            + bordered text (mismo patrón visual que GastosFilterPill). */}
        <View style={styles.modeRow}>
          <Pressable
            onPress={() => setMode('same')}
            onPressIn={samePress.onPressIn}
            onPressOut={samePress.onPressOut}
            accessibilityRole="button"
            accessibilityState={{ selected: mode === 'same' }}
            accessibilityLabel={t('fijos:confirmPayment.sameAmount')}
            style={styles.modeWrap}
          >
            <Animated.View
              style={[
                styles.modeBtn,
                mode === 'same'
                  ? {
                      backgroundColor: theme.colors.text,
                      borderColor: theme.colors.text,
                    }
                  : {
                      backgroundColor: theme.colors.pageBg,
                      borderColor: theme.colors.line,
                    },
                samePress.animatedStyle,
              ]}
            >
              <MaterialIcons
                name="check"
                size={14}
                color={mode === 'same' ? theme.colors.creamCard : theme.colors.text}
              />
              <Text
                style={[
                  styles.modeBtnText,
                  {
                    color:
                      mode === 'same'
                        ? theme.colors.creamCard
                        : theme.colors.text,
                  },
                ]}
                numberOfLines={1}
              >
                {t('fijos:confirmPayment.same', { amount: previousLabel })}
              </Text>
            </Animated.View>
          </Pressable>
          <Pressable
            onPress={() => setMode('changed')}
            onPressIn={changedPress.onPressIn}
            onPressOut={changedPress.onPressOut}
            accessibilityRole="button"
            accessibilityState={{ selected: mode === 'changed' }}
            accessibilityLabel={t('fijos:confirmPayment.changed')}
            style={styles.modeWrap}
          >
            <Animated.View
              style={[
                styles.modeBtn,
                mode === 'changed'
                  ? {
                      backgroundColor: theme.colors.text,
                      borderColor: theme.colors.text,
                    }
                  : {
                      backgroundColor: theme.colors.pageBg,
                      borderColor: theme.colors.line,
                    },
                changedPress.animatedStyle,
              ]}
            >
              <MaterialIcons
                name="edit"
                size={14}
                color={mode === 'changed' ? theme.colors.creamCard : theme.colors.text}
              />
              <Text
                style={[
                  styles.modeBtnText,
                  {
                    color:
                      mode === 'changed'
                        ? theme.colors.creamCard
                        : theme.colors.text,
                  },
                ]}
                numberOfLines={1}
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
            <TextField
              label={t('fijos:confirmPayment.amountPaid')}
              value={amountText}
              onChangeText={setAmountText}
              keyboardType="number-pad"
              inputMode="numeric"
              placeholder="0"
              accessibilityLabel={t('fijos:confirmPayment.amountPaidA11y')}
            />
            {parsedAmount > 0 && delta !== 0 ? (
              <View
                style={[
                  styles.deltaRow,
                  {
                    backgroundColor:
                      delta > 0
                        ? 'rgba(242,167,140,0.14)'
                        : 'rgba(166,239,143,0.14)',
                  },
                ]}
              >
                <MaterialIcons
                  name={delta > 0 ? 'trending-up' : 'trending-down'}
                  size={14}
                  color={
                    delta > 0
                      ? theme.isDark
                        ? '#F2A78C'
                        : '#B84014'
                      : theme.isDark
                        ? '#A6EF8F'
                        : '#297811'
                  }
                />
                <Text
                  style={[
                    styles.deltaText,
                    {
                      color:
                        delta > 0
                          ? theme.isDark
                            ? '#F2A78C'
                            : '#B84014'
                          : theme.isDark
                            ? '#A6EF8F'
                            : '#297811',
                    },
                  ]}
                >
                  {delta > 0 ? '+' : '−'}
                  {formatMoneyShort(Math.abs(delta))}
                  {deltaPct !== 0 ? ` · ${delta > 0 ? '+' : ''}${deltaPct}%` : ''}
                </Text>
              </View>
            ) : null}
          </Animated.View>
        ) : null}

        <AppButton
          variant="primary"
          label={t('fijos:confirmPayment.confirm')}
          loading={isProcessing}
          disabled={mode === 'changed' ? !isChangedValid : !isSameValid}
          onPress={() => {
            if (mode === 'changed') {
              if (!isChangedValid) return
              onConfirmChanged(parsedAmount)
            } else {
              if (!isSameValid) return
              onConfirmSame()
            }
          }}
        />
      </View>
    </ModalCard>
  )
}

const styles = StyleSheet.create({
  body: { gap: 14 },
  snapshotCard: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: 'flex-start',
    gap: 2,
  },
  snapshotEyebrow: {
    fontSize: 10,
    letterSpacing: 1.4,
    fontWeight: '800',
    marginBottom: 2,
  },
  snapshotValue: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.4,
    fontVariant: ['tabular-nums'],
  },
  snapshotMeta: {
    fontSize: 11,
    fontWeight: '600',
  },
  overduePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    marginTop: 8,
  },
  overduePillText: {
    fontSize: 10,
    fontWeight: '700',
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
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  modeBtnText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  changedBlock: { gap: 8 },
  deltaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    alignSelf: 'flex-start',
  },
  deltaText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: -0.2,
    fontVariant: ['tabular-nums'],
  },
})
