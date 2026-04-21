import { type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { MaterialIcons } from '@expo/vector-icons'
import { AppSymbol } from '@/components/ui/app-symbol'
import { useAppTheme } from '@/theme/theme-provider'
import { radii } from '@/theme/palette'

function TabIconFrame({
  children,
  focused,
}: {
  children: ReactNode
  focused: boolean
}) {
  const { theme } = useAppTheme()

  return (
    <View
      style={[
        styles.iconFrame,
        focused
          ? [
              styles.iconFrameFocused,
              {
                backgroundColor: theme.isDark ? 'rgba(23, 37, 29, 0.92)' : 'rgba(247, 251, 248, 0.98)',
                borderColor: theme.isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.78)',
                shadowColor: theme.isDark ? '#5EE096' : '#9EC9B0',
              },
            ]
          : styles.iconFrameIdle,
      ]}
    >
      {focused ? (
        <>
          <LinearGradient
            colors={
              theme.isDark
                ? ['rgba(255, 255, 255, 0.2)', 'rgba(117, 167, 138, 0.08)', 'rgba(12, 19, 15, 0.24)']
                : ['rgba(255, 255, 255, 0.96)', 'rgba(246, 251, 248, 0.56)', 'rgba(229, 238, 232, 0.36)']
            }
            end={{ x: 1, y: 1 }}
            start={{ x: 0, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
          <View
            style={[
              styles.iconFrameGlow,
              {
                backgroundColor: theme.isDark ? 'rgba(105, 248, 159, 0.14)' : 'rgba(83, 228, 143, 0.12)',
              },
            ]}
          />
          <View
            style={[
              styles.iconFrameSpecular,
              {
                backgroundColor: theme.isDark ? 'rgba(255, 255, 255, 0.14)' : 'rgba(255, 255, 255, 0.94)',
              },
            ]}
          />
          <View
            style={[
              styles.iconFrameFloor,
              {
                backgroundColor: theme.isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(255, 255, 255, 0.5)',
              },
            ]}
          />
          <View
            style={[
              styles.iconFrameShine,
              {
                backgroundColor: theme.isDark ? 'rgba(255, 255, 255, 0.16)' : 'rgba(255, 255, 255, 1)',
              },
            ]}
          />
        </>
      ) : null}
      {children}
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
  return (
    <TabIconFrame focused={focused}>
      <View
        style={[
          styles.iconSymbolWrap,
          focused
            ? {
                transform: [{ translateY: -0.5 }],
              }
            : null,
        ]}
      >
        <AppSymbol
          color={color}
          fallback={fallback}
          name={name}
          size={focused ? size - 1 : size - 2}
        />
      </View>
    </TabIconFrame>
  )
}

const styles = StyleSheet.create({
  iconFrame: {
    width: 50,
    height: 38,
    borderRadius: radii.xl,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  iconFrameFocused: {
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowRadius: 20,
    shadowOpacity: 0.12,
    elevation: 4,
  },
  iconFrameIdle: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    shadowOpacity: 0,
    elevation: 0,
  },
  iconFrameGlow: {
    position: 'absolute',
    width: 84,
    height: 84,
    borderRadius: radii.pill,
    top: -40,
    right: -8,
  },
  iconFrameSpecular: {
    position: 'absolute',
    width: 28,
    height: 12,
    borderRadius: radii.pill,
    top: 6,
    left: 8,
    transform: [{ rotate: '-10deg' }],
  },
  iconFrameFloor: {
    position: 'absolute',
    height: 12,
    left: 10,
    right: 10,
    bottom: 5,
    borderRadius: radii.pill,
  },
  iconFrameShine: {
    position: 'absolute',
    top: 1,
    left: 10,
    right: 10,
    height: 1,
    borderRadius: radii.pill,
  },
  iconSymbolWrap: {
    width: 28,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
