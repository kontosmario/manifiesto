import { Animated, StyleSheet, View, type Animated as AnimatedType } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { radii, type AppTheme } from '@/theme/palette'
import { AppSymbol } from '@/components/ui/app-symbol'

interface AddExpenseTabButtonFaceProps {
  buttonColorBoostOpacity: number
  buttonShineBoostOpacity: number
  iconRotate?: AnimatedType.AnimatedInterpolation<string>
  pressed: boolean
  theme: AppTheme
}

export function AddExpenseTabButtonFace({
  buttonColorBoostOpacity,
  buttonShineBoostOpacity,
  iconRotate,
  pressed,
  theme,
}: AddExpenseTabButtonFaceProps) {
  return (
    <LinearGradient
      colors={
        theme.isDark ? ['#77F3A8', '#38D67A', '#169D57'] : ['#63F0A0', '#29D27A', '#15AB60']
      }
      end={{ x: 1, y: 1 }}
      start={{ x: 0.12, y: 0 }}
      style={[
        styles.addButton,
        {
          borderColor: theme.isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.88)',
          shadowColor: theme.isDark ? '#62F49C' : '#31DB82',
          shadowOpacity: pressed ? (theme.isDark ? 0.42 : 0.26) : theme.isDark ? 0.28 : 0.18,
        },
      ]}
    >
      <LinearGradient
        colors={
          theme.isDark
            ? ['rgba(255, 255, 255, 0.26)', 'rgba(255, 255, 255, 0.05)', 'transparent']
            : ['rgba(255, 255, 255, 0.5)', 'rgba(255, 255, 255, 0.14)', 'transparent']
        }
        end={{ x: 0.85, y: 1 }}
        start={{ x: 0.2, y: 0 }}
        style={styles.addButtonGloss}
      />
      <View
        pointerEvents="none"
        style={[
          styles.addButtonColorBoost,
          {
            opacity: buttonColorBoostOpacity,
          },
        ]}
      >
        <LinearGradient
          colors={
            theme.isDark
              ? ['rgba(214, 255, 227, 0.34)', 'rgba(107, 255, 165, 0.24)', 'rgba(0, 0, 0, 0)']
              : ['rgba(244, 255, 248, 0.38)', 'rgba(116, 255, 180, 0.24)', 'rgba(0, 0, 0, 0)']
          }
          end={{ x: 1, y: 1 }}
          start={{ x: 0.12, y: 0.08 }}
          style={StyleSheet.absoluteFill}
        />
      </View>
      <View
        pointerEvents="none"
        style={[
          styles.addButtonShineBoost,
          {
            opacity: buttonShineBoostOpacity,
          },
        ]}
      >
        <LinearGradient
          colors={
            theme.isDark
              ? ['rgba(255, 255, 255, 0.28)', 'rgba(255, 255, 255, 0.04)', 'transparent']
              : ['rgba(255, 255, 255, 0.46)', 'rgba(255, 255, 255, 0.08)', 'transparent']
          }
          end={{ x: 0.84, y: 1 }}
          start={{ x: 0.16, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      </View>
      <Animated.View
        style={iconRotate ? { transform: [{ rotate: iconRotate }] } : undefined}
      >
        <AppSymbol color="#FFFFFF" fallback="add" name="plus" size={28} type="monochrome" />
      </Animated.View>
    </LinearGradient>
  )
}

const styles = StyleSheet.create({
  addButton: {
    width: 66,
    height: 66,
    borderRadius: radii.pill,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowOffset: {
      width: 0,
      height: 14,
    },
    shadowRadius: 24,
    elevation: 12,
  },
  addButtonGloss: {
    ...StyleSheet.absoluteFillObject,
  },
  addButtonColorBoost: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  addButtonShineBoost: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
})
