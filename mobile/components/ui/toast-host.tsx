import { useCallback, useEffect, useState } from 'react'
import { Modal, Pressable, StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui/app-text'
import { MaterialIcons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated'
import { useIsAnyModalOpen } from '@/lib/modal-visibility'
import { subscribeToast, type ToastPayload } from '@/lib/toast-bus'
import { neoRadii, neoTokens } from '@/theme/neo-tokens'
import { nunitoFamily } from '@/theme/typography'
import { useThemeTokens } from '@/theme/theme-provider'

/**
 * Toast global mostrado en la parte inferior, encima de tab bar. Una
 * sola toast visible a la vez; un toast nuevo reemplaza al anterior.
 * Auto-dismiss según `durationMs` del payload (default 3-6s).
 */
export function ToastHost() {
  const theme = useThemeTokens()
  const neo = neoTokens(theme.mode)
  const insets = useSafeAreaInsets()
  const [current, setCurrent] = useState<ToastPayload | null>(null)
  // Un `<Modal>` nativo se presenta en su propia ventana, ARRIBA de todo
  // el árbol React de la app: mientras hay una hoja abierta, un toast
  // dibujado en la raíz queda tapado. Desde que los avisos de error
  // dejaron de ser `Alert.alert` (que era del SO y siempre se veía),
  // esto pasó de cosmético a "el error no existe para el usuario".
  const anyModalOpen = useIsAnyModalOpen()

  useEffect(() => {
    const unsub = subscribeToast((next) => {
      setCurrent(next)
    })
    return unsub
  }, [])

  useEffect(() => {
    if (!current) return
    const timer = setTimeout(() => {
      setCurrent((c) => (c?.id === current.id ? null : c))
    }, current.durationMs ?? 3500)
    return () => {
      clearTimeout(timer)
    }
  }, [current])

  const dismiss = useCallback(() => {
    setCurrent(null)
  }, [])

  if (!current) return null

  // En neo el tono NO es el fondo: la superficie es siempre la hoja del
  // tema y el estado lo comunica el acento del ícono y de la acción. Un
  // relleno saturado a todo el ancho (lo que hacía la piel V1) es
  // justamente el vocabulario que el rediseño saca de la app.
  const accent =
    current.kind === 'error'
      ? neo.danger
      : current.kind === 'success'
        ? neo.green
        : neo.textMuted
  const icon =
    current.kind === 'error'
      ? ('error-outline' as const)
      : current.kind === 'success'
        ? ('check-circle' as const)
        : ('info-outline' as const)

  const layer = (
    <Animated.View
      entering={FadeInDown.duration(200)}
      exiting={FadeOutDown.duration(180)}
      pointerEvents="box-none"
      style={[styles.wrap, { bottom: insets.bottom + 80 }]}
    >
      <View
        style={[
          styles.toast,
          {
            backgroundColor: neo.sheet,
            // `raisedXl` y no `sheet`: la sombra de hoja apunta hacia
            // arriba porque asume una superficie pegada al borde
            // inferior. El toast flota en el medio, así que necesita el
            // relieve completo para despegarse del contenido de atrás.
            boxShadow: neo.shadows.raisedXl,
          },
        ]}
      >
        <MaterialIcons name={icon} size={18} color={accent} />
        <Text style={[styles.message, { color: neo.text }]} numberOfLines={2}>
          {current.message}
        </Text>
        {current.actionLabel && current.onAction ? (
          <Pressable
            onPress={() => {
              current.onAction?.()
              setCurrent(null)
            }}
            hitSlop={8}
            accessibilityRole="button"
          >
            <Text style={[styles.action, { color: neo.green }]}>
              {current.actionLabel}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  )

  // Camino común (no hay hoja abierta): capa absoluta en la raíz. No
  // roba un solo toque — `wrap` es `box-none` y sólo el botón de acción
  // es interactivo.
  if (!anyModalOpen) return layer

  // Con una hoja abierta hace falta una ventana nativa para quedar por
  // encima de ella. El costo es que esa ventana captura los toques
  // mientras vive, así que el fondo es un `Pressable` que descarta el
  // toast: en el peor caso el usuario gasta UN toque para recuperar la
  // hoja, en vez de perderse el mensaje. El botón de acción gana el
  // hit-test por ser hijo, así que "Deshacer" sigue funcionando.
  return (
    <Modal
      animationType="none"
      onRequestClose={dismiss}
      statusBarTranslucent
      transparent
      visible
    >
      <Pressable
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        onPress={dismiss}
        style={StyleSheet.absoluteFill}
      />
      {layer}
    </Modal>
  )
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    alignItems: 'center',
    zIndex: 1000,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderRadius: neoRadii.tile,
    maxWidth: '100%',
  },
  message: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    lineHeight: 18,
  },
  action: {
    fontSize: 13,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    letterSpacing: 0.2,
  },
})
