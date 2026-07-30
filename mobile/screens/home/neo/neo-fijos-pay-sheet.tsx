// @i18n-ignore-file
/**
 * Sheet de pago DEV-ONLY para la Fijos neo.
 *
 * ── Por qué existe fuera del kit ────────────────────────────────────────
 * El kit del rediseño NO tiene ninguna superficie que reciba un
 * `fixedExpenseId`: sus filas son por CATEGORÍA y `onPressCategory` entrega
 * un `FijosCategoryKey`. El único lugar del rediseño donde un fijo
 * individual es accionable es el DETALLE EXPANDIDO DEL ÍTEM, que es la
 * Fase 2 y todavía no existe.
 *
 * Así que para poder ejercitar la interacción central de Fijos —pagar— sin
 * tocar el kit (que tiene gate de aprobación pendiente), este sheet se monta
 * como UI propia en el lugar EXACTO donde va a vivir ese detalle. Hace
 * visible el hueco de la Fase 2 en su sitio en vez de esconderlo.
 *
 * ── ESCRITURAS REALES ───────────────────────────────────────────────────
 * Marcar pagado y revertir escriben en la base de PRODUCCIÓN vía los mismos
 * RPCs que usa la pantalla viva. Son reversibles entre sí (ese es justamente
 * el criterio por el que se habilitaron), y se ven en la pantalla vieja
 * porque comparten los mismos queryKeys.
 *
 * Se reusan los hooks de la pantalla vieja TAL CUAL: la invalidación y los
 * optimistic updates viven ahí y no se reimplementan.
 */
import { useCallback, useMemo, useRef, useState } from 'react'
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'

import { ConfirmFixedPaymentSheet } from '@/components/fijos/confirm-fixed-payment-sheet'
import { FIJOS_RADII, FIJOS_SPEC, type FijosMode } from '@/components/redesign/fijos/fijos-spec'
import type { FijoItem } from '@/features/fijos/fijos-aggregates.model'
import { isPersistedFixedExpenseId } from '@/features/fixed-expenses/fixed-expense-id'
import {
  useRecordFixedExpensePayment,
  useRevertFixedExpensePayment,
} from '@/features/fixed-expenses/use-fixed-expenses'
import { triggerHaptic } from '@/lib/haptics'
import { toast } from '@/lib/toast-bus'
import { nunitoFamily } from '@/theme/typography'
import { getErrorMessage } from '@/utils/error-message'

interface NeoFijosPaySheetProps {
  visible: boolean
  mode: FijosMode
  /** Título del bucket que se tocó (ej. "Servicios"). */
  bucketName: string
  /** Los fijos de ese bucket, en el orden en que los agrupó el modelo. */
  items: FijoItem[]
  familyId: string
  userId: string
  onClose: () => void
}

export function NeoFijosPaySheet({
  visible,
  mode,
  bucketName,
  items,
  familyId,
  userId,
  onClose,
}: NeoFijosPaySheetProps) {
  const { t } = useTranslation()
  const s = FIJOS_SPEC[mode]

  const recordPaymentMutation = useRecordFixedExpensePayment(familyId, userId)
  const revertPaymentMutation = useRevertFixedExpensePayment(familyId, userId)

  // `useMutation` de RQ v5 devuelve un objeto NUEVO en cada render. Guardarlo
  // en ref evita que los `useCallback` de abajo lo lleven en deps y se
  // reconstruyan por render — que es lo que anula las memos de las filas.
  const recordRef = useRef(recordPaymentMutation)
  recordRef.current = recordPaymentMutation
  const revertRef = useRef(revertPaymentMutation)
  revertRef.current = revertPaymentMutation

  /** Sheet de confirmación de precio (2do+ pago). */
  const [confirmFor, setConfirmFor] = useState<FijoItem | null>(null)

  /**
   * COPIADO LITERAL de la pantalla viva (`fijos-v2-screen.tsx`) — es un bugfix
   * documentado del 2026-05-30, no una heurística a re-derivar.
   *
   * `last_paid_at` del fijo es el source of truth: si nunca se pagó es null →
   * 1er pago → se omite el sheet de precio. La versión anterior miraba el
   * cache de expenses buscando `commitment_id`, y como los expenses se
   * archivan al cerrar ciclo, los fijos MENSUALES quedaban marcados como "1er
   * pago" todos los meses y el sheet nunca aparecía.
   *
   * Si no se encuentra el fijo (race), devuelve `false` → abre el sheet
   * conservadoramente: un sheet innecesario es 1 tap, saltearlo pierde data.
   */
  const isFirstPayment = useCallback(
    (fixedExpenseId: string) => {
      const fixed = items.find((i) => i.id === fixedExpenseId)
      if (!fixed) return false
      return fixed.last_paid_at == null
    },
    [items],
  )

  const runRecord = useCallback(
    (item: FijoItem, amountOverride?: number) => {
      recordRef.current.mutate(
        { amountOverride, fixedExpenseId: item.id },
        {
          onError: (error: unknown) => {
            void triggerHaptic('error')
            Alert.alert('No se pudo registrar el pago', getErrorMessage(error, t('states:error.server')))
          },
          onSuccess: () => {
            void triggerHaptic('success')
            toast.success(`${item.name} marcado como pagado`)
          },
        },
      )
    },
    [t],
  )

  const handlePay = useCallback(
    (item: FijoItem) => {
      // Guarda de id: un `temp-…` (fijo recién creado, todavía optimista) no
      // existe server-side y tira `FixedExpenseNotPersistedError` sincrónico.
      if (!isPersistedFixedExpenseId(item.id)) {
        toast.error('El fijo todavía se está guardando — probá en un segundo')
        return
      }
      void triggerHaptic('light')
      if (isFirstPayment(item.id)) {
        runRecord(item)
        return
      }
      setConfirmFor(item)
    },
    [isFirstPayment, runRecord],
  )

  const handleRevert = useCallback(
    (item: FijoItem) => {
      // Guarda de id: `paidPaymentId` ya viene null cuando el payment es
      // `optimistic-…`; mandarlo a la RPC daría 22P02.
      const paymentId = item.paidPaymentId
      if (!paymentId) {
        toast.error('El pago todavía se está sincronizando — probá en un segundo')
        return
      }
      void triggerHaptic('warning')
      revertRef.current.mutate(paymentId, {
        onError: (error: unknown) => {
          void triggerHaptic('error')
          Alert.alert('No se pudo revertir', getErrorMessage(error, t('states:error.server')))
        },
        onSuccess: () => {
          void triggerHaptic('success')
          toast.info(`Pago de ${item.name} revertido`)
        },
      })
    },
    [t],
  )

  const handleConfirmSame = useCallback(() => {
    if (!confirmFor) return
    const item = confirmFor
    setConfirmFor(null)
    runRecord(item)
  }, [confirmFor, runRecord])

  const handleConfirmChanged = useCallback(
    (newAmount: number) => {
      if (!confirmFor) return
      const item = confirmFor
      setConfirmFor(null)
      runRecord(item, newAmount)
    },
    [confirmFor, runRecord],
  )

  const rows = useMemo(
    () =>
      items.map((item) => ({
        item,
        isPaid: item.computedStatus === 'paid',
      })),
    [items],
  )

  return (
    <>
      <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
        <View style={styles.backdrop}>
          <Pressable onPress={onClose} style={styles.backdropTap} />
          <View style={[styles.sheet, { backgroundColor: s.bg }]}>
            <Text style={[styles.devTag, { color: s.rowMetaOverdueInk }]}>
              DEV · el detalle real del ítem es la Fase 2
            </Text>
            <Text style={[styles.title, { color: s.text }]}>{bucketName}</Text>
            <Text style={[styles.sub, { color: s.faint }]}>
              Escribe en la base REAL. Pagar y revertir son reversibles entre sí.
            </Text>
            <ScrollView style={styles.list}>
              {rows.map(({ item, isPaid }) => (
                <View
                  key={item.id}
                  style={[
                    styles.row,
                    { backgroundColor: s.rowBackground, borderRadius: FIJOS_RADII.row },
                  ]}
                >
                  <View style={styles.rowTexts}>
                    <Text style={[styles.rowName, { color: s.text }]}>{item.name}</Text>
                    <Text style={[styles.rowMeta, { color: s.faint }]}>
                      {`${item.computedStatus} · $${Math.round(item.amount).toLocaleString('es-AR')}`}
                    </Text>
                  </View>
                  <Pressable
                    hitSlop={8}
                    onPress={() => (isPaid ? handleRevert(item) : handlePay(item))}
                    style={[
                      styles.action,
                      { borderColor: isPaid ? s.faint : s.green },
                    ]}
                  >
                    <Text
                      style={[
                        styles.actionText,
                        { color: isPaid ? s.faint : s.green },
                      ]}
                    >
                      {isPaid ? 'Revertir' : 'Pagar'}
                    </Text>
                  </Pressable>
                </View>
              ))}
              {rows.length === 0 ? (
                <Text style={[styles.rowMeta, { color: s.faint }]}>
                  Este bucket no tiene fijos en el ciclo activo.
                </Text>
              ) : null}
            </ScrollView>
            <Pressable hitSlop={8} onPress={onClose} style={styles.close}>
              <Text style={[styles.closeText, { color: s.text }]}>Cerrar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <ConfirmFixedPaymentSheet
        fixedExpenseName={confirmFor?.name ?? ''}
        isProcessing={recordPaymentMutation.isPending}
        onClose={() => setConfirmFor(null)}
        onConfirmChanged={handleConfirmChanged}
        onConfirmSame={handleConfirmSame}
        previousAmount={confirmFor?.amount ?? 0}
        visible={confirmFor != null}
        wasOverdue={confirmFor?.computedStatus === 'overdue'}
      />
    </>
  )
}

const styles = StyleSheet.create({
  action: { borderRadius: 14, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 7 },
  actionText: { fontFamily: nunitoFamily('900'), fontSize: 12 },
  backdrop: { backgroundColor: 'rgba(0,0,0,0.45)', flex: 1, justifyContent: 'flex-end' },
  backdropTap: { flex: 1 },
  close: { alignSelf: 'center', paddingBottom: 6, paddingTop: 14 },
  closeText: { fontFamily: nunitoFamily('900'), fontSize: 13 },
  devTag: { fontFamily: nunitoFamily('900'), fontSize: 10, letterSpacing: 0.4 },
  list: { maxHeight: 380 },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rowMeta: { fontFamily: nunitoFamily('700'), fontSize: 11.5, marginTop: 2 },
  rowName: { fontFamily: nunitoFamily('900'), fontSize: 14.5 },
  rowTexts: { flex: 1, paddingRight: 12 },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingBottom: 24,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  sub: { fontFamily: nunitoFamily('700'), fontSize: 11.5, marginBottom: 12, marginTop: 2 },
  title: { fontFamily: nunitoFamily('900'), fontSize: 20, marginTop: 4 },
})
