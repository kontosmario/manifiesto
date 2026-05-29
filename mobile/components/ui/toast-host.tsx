import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated'
import { subscribeToast, type ToastPayload } from '@/lib/toast-bus'
import { useAppTheme } from '@/theme/theme-provider'

/**
 * Toast global mostrado en la parte inferior, encima de tab bar. Una
 * sola toast visible a la vez; un toast nuevo reemplaza al anterior.
 * Auto-dismiss según `durationMs` del payload (default 3-6s).
 */
export function ToastHost() {
  const { theme } = useAppTheme()
  const insets = useSafeAreaInsets()
  const [current, setCurrent] = useState<ToastPayload | null>(null)

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

  if (!current) return null

  const tone =
    current.kind === 'error'
      ? {
          bg: theme.colors.danger,
          fg: '#FFFBF2',
          icon: 'error-outline' as const,
        }
      : current.kind === 'success'
        ? {
            bg: theme.colors.success,
            fg: '#0B1F12',
            icon: 'check-circle' as const,
          }
        : {
            bg: theme.colors.text,
            fg: theme.colors.background,
            icon: 'info-outline' as const,
          }

  return (
    <Animated.View
      entering={FadeInDown.duration(200)}
      exiting={FadeOutDown.duration(180)}
      pointerEvents="box-none"
      style={[styles.wrap, { bottom: insets.bottom + 80 }]}
    >
      <View style={[styles.toast, { backgroundColor: tone.bg }]}>
        <MaterialIcons name={tone.icon} size={18} color={tone.fg} />
        <Text style={[styles.message, { color: tone.fg }]} numberOfLines={2}>
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
            <Text style={[styles.action, { color: tone.fg }]}>
              {current.actionLabel}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
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
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    maxWidth: '100%',
  },
  message: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 17,
  },
  action: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.2,
    textDecorationLine: 'underline',
  },
})
