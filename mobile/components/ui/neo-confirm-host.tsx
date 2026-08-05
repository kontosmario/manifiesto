import { useCallback, useEffect, useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { ModalCard } from '@/components/ui/modal-card'
import { NeoButton, type NeoButtonVariant } from '@/components/ui/neo-button'
import { subscribeConfirm, type ConfirmRequest } from '@/lib/confirm-bus'
import { neoTokens } from '@/theme/neo-tokens'
import { nunitoFamily } from '@/theme/typography'
import { useThemeTokens } from '@/theme/theme-provider'

const CTA_BY_TONE: Record<ConfirmRequest['tone'], NeoButtonVariant> = {
  destructive: 'danger',
  irreversible: 'warm',
  neutral: 'primary',
}

/**
 * Host único de las confirmaciones neo. Va montado en
 * `app-stack-shell`, al lado de `ToastHost`, para sobrevivir al
 * desmontaje de la pantalla que preguntó (ver el docblock de
 * `confirm-bus`).
 *
 * Reemplaza a `Alert.alert` de dos botones, así que replica las tres
 * garantías que el diálogo del SO daba gratis:
 *  · botón físico de Android → `ModalCard.onRequestClose` → cancelar
 *  · foco de VoiceOver/TalkBack → `accessibilityViewIsModal` en la hoja
 *  · toda salida que no sea el CTA resuelve `false`
 */
export function NeoConfirmHost() {
  const theme = useThemeTokens()
  const neo = neoTokens(theme.mode)
  const { t } = useTranslation()
  const [current, setCurrent] = useState<ConfirmRequest | null>(null)
  const [visible, setVisible] = useState(false)

  // La request viva se guarda en una ref además del estado: el cierre
  // animado de ModalCard desmonta la hoja unos frames DESPUÉS de que
  // `visible` pasa a false, y en ese hueco todavía hay que poder
  // resolver la promesa del pedido saliente.
  const pendingRef = useRef<ConfirmRequest | null>(null)

  useEffect(() => {
    return subscribeConfirm((next) => {
      // Un pedido nuevo mientras hay otro abierto cancela al anterior:
      // sólo hay una hoja, y dejar la promesa vieja sin resolver colgaría
      // a quien la esperaba.
      pendingRef.current?.resolve(false)
      pendingRef.current = next
      setCurrent(next)
      setVisible(true)
    })
  }, [])

  const settle = useCallback((confirmed: boolean) => {
    pendingRef.current?.resolve(confirmed)
    pendingRef.current = null
    setVisible(false)
  }, [])

  // Limpieza del contenido una vez que la hoja terminó de salir, para
  // que el texto no parpadee si entra un pedido nuevo enseguida.
  useEffect(() => {
    if (visible) return
    const timer = setTimeout(() => {
      if (!pendingRef.current) setCurrent(null)
    }, 400)
    return () => {
      clearTimeout(timer)
    }
  }, [visible])

  if (!current) return null

  return (
    <ModalCard
      skin="neo"
      visible={visible}
      title={current.title}
      onClose={() => {
        settle(false)
      }}
      footer={
        <View style={styles.actions}>
          <NeoButton
            variant="ghost"
            block
            label={current.cancelLabel ?? t('common:actions.cancel')}
            onPress={() => {
              settle(false)
            }}
          />
          <NeoButton
            variant={CTA_BY_TONE[current.tone]}
            block
            label={current.confirmLabel ?? t('common:actions.confirm')}
            onPress={() => {
              settle(true)
            }}
          />
        </View>
      }
    >
      {current.message ? (
        <Text style={[styles.message, { color: neo.textMuted }]}>
          {current.message}
        </Text>
      ) : null}
    </ModalCard>
  )
}

const styles = StyleSheet.create({
  actions: {
    gap: 10,
    paddingBottom: 4,
  },
  message: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    lineHeight: 21,
  },
})
