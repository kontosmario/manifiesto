import { useEffect, useRef, type ReactNode } from 'react'
import { Animated, StyleSheet, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { AppSymbol } from '@/components/ui/app-symbol'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { useAppTheme } from '@/theme/theme-provider'
import { brand, radii } from '@/theme/palette'

function useFocusProgress(focused: boolean) {
  const reduceMotion = useReducedMotion()
  const progress = useRef(new Animated.Value(focused ? 1 : 0)).current

  useEffect(() => {
    if (reduceMotion) {
      progress.setValue(focused ? 1 : 0)
      return
    }
    Animated.spring(progress, {
      toValue: focused ? 1 : 0,
      useNativeDriver: true,
      damping: 16,
      stiffness: 180,
      mass: 0.7,
    }).start()
  }, [focused, progress, reduceMotion])

  return progress
}

function TabIconFrame({
  children,
  focused,
}: {
  children: ReactNode
  focused: boolean
}) {
  const { theme } = useAppTheme()
  const progress = useFocusProgress(focused)

  const pillBackground = theme.isDark ? brand.bright : brand.deep
  const frameScale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] })
  const pillOpacity = progress

  return (
    <View style={styles.iconSlot}>
      {/* Signature brand dot floating above the pill on the active tab */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.signatureDot,
          {
            backgroundColor: brand.bright,
            opacity: pillOpacity,
            transform: [
              {
                scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }),
              },
            ],
          },
        ]}
      />

      <Animated.View
        style={[
          styles.iconFrame,
          { transform: [{ scale: frameScale }] },
        ]}
      >
        {/* Branded pill — fades in when active, sits flat (no gloss) for a confident look */}
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            styles.pillShape,
            {
              backgroundColor: pillBackground,
              opacity: pillOpacity,
            },
          ]}
        />
        <View style={styles.iconCenter}>{children}</View>
      </Animated.View>
    </View>
  )
}

export function TabBarIcon({
  color,
  fallback,
  focused,
  name,
  size,
}: {
  color: string
  fallback: keyof typeof MaterialIcons.glyphMap
  focused: boolean
  name: string
  size: number
}) {
  const { theme } = useAppTheme()
  // When active, icon flips to the surface of the pill (white on deep, deep on bright)
  const activeIconColor = theme.isDark ? brand.deep : '#FFFFFF'
  const idleIconColor = theme.colors.textMuted
  const resolvedColor = focused ? activeIconColor : idleIconColor
  // `color` from the tab options stays as fallback if theme isn't ready
  void color

  return (
    <TabIconFrame focused={focused}>
      <AppSymbol
        color={resolvedColor}
        fallback={fallback}
        name={name}
        size={focused ? size - 1 : size - 2}
      />
    </TabIconFrame>
  )
}

const styles = StyleSheet.create({
  iconSlot: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  signatureDot: {
    position: 'absolute',
    top: -8,
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  iconFrame: {
    width: 50,
    height: 34,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  pillShape: {
    borderRadius: radii.pill,
  },
  iconCenter: {
    width: 28,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
