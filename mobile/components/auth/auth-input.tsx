import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native'
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { forwardRef, type ReactNode, useEffect, useState } from 'react'
import { triggerHaptic } from '@/lib/haptics'
import { motionDurations, motionEasings } from '@/lib/motion/tokens'
import { authPalette } from '@/theme/auth-theme'
import { radii } from '@/theme/palette'

export interface AuthInputProps extends TextInputProps {
  dense?: boolean
  label: string
  reducedMotion?: boolean
  trailing?: ReactNode
}

export const AuthInput = forwardRef<TextInput, AuthInputProps>(function AuthInput(
  {
    dense = false,
    label,
    reducedMotion = false,
    trailing,
    style,
    ...props
  },
  ref,
) {
  const [isFocused, setFocused] = useState(false)
  // Reanimated SharedValue runs on the UI thread, matching the rest
  // of the app's motion runtime. Previously this used RN's Animated
  // (JS-driven unless useNativeDriver: true), which split the runtime
  // and made focus animations un-interruptible by Reanimated worklets
  // running elsewhere on screen.
  const focusProgress = useSharedValue(0)

  useEffect(() => {
    const duration = reducedMotion
      ? 0
      : isFocused
        ? motionDurations.quick   // 180ms enter
        : motionDurations.micro   // 120ms exit (~67% of enter)
    focusProgress.value = withTiming(isFocused ? 1 : 0, {
      duration,
      easing: motionEasings.decelerate,
    })
  }, [focusProgress, isFocused, reducedMotion])

  const fillAnimatedStyle = useAnimatedStyle(() => ({
    opacity: focusProgress.value,
    transform: [
      {
        scale: interpolate(
          focusProgress.value,
          [0, 1],
          [0.985, 1],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }))

  const outlineAnimatedStyle = useAnimatedStyle(() => ({
    opacity: focusProgress.value,
  }))

  return (
    <View style={[styles.fieldBlock, dense && styles.fieldBlockDense]}>
      <Text style={[styles.fieldLabel, dense && styles.fieldLabelDense]}>{label}</Text>
      <View style={[styles.fieldShell, dense && styles.fieldShellDense]}>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.fieldFocusFill,
            dense && styles.fieldFocusFillDense,
            fillAnimatedStyle,
          ]}
        />
        <Animated.View
          pointerEvents="none"
          style={[
            styles.fieldFocusOutline,
            dense && styles.fieldFocusOutlineDense,
            outlineAnimatedStyle,
          ]}
        />
        <TextInput
          cursorColor={authPalette.field.cursor}
          onTouchStart={(event) => {
            if (props.editable !== false) {
              void triggerHaptic('light')
            }
            props.onTouchStart?.(event)
          }}
          placeholderTextColor={authPalette.field.placeholder}
          ref={ref}
          selectionColor={authPalette.field.cursor}
          style={[styles.fieldInput, dense && styles.fieldInputDense, style]}
          onBlur={(event) => {
            setFocused(false)
            props.onBlur?.(event)
          }}
          onFocus={(event) => {
            setFocused(true)
            props.onFocus?.(event)
          }}
          {...props}
        />
        {trailing}
      </View>
    </View>
  )
})

const styles = StyleSheet.create({
  fieldBlock: {
    gap: 7,
  },
  fieldBlockDense: {
    gap: 5,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.15,
    color: authPalette.field.label,
    textTransform: 'uppercase',
  },
  fieldLabelDense: {
    fontSize: 10.5,
    letterSpacing: 1,
  },
  fieldShell: {
    position: 'relative',
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: authPalette.field.border,
    backgroundColor: authPalette.field.background,
    paddingLeft: 16,
    paddingRight: 16,
    overflow: 'hidden',
  },
  fieldShellDense: {
    minHeight: 48,
    borderRadius: radii.md,
    paddingLeft: 14,
    paddingRight: 14,
  },
  fieldFocusFill: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radii.md,
    backgroundColor: authPalette.field.focusFill,
  },
  fieldFocusFillDense: {
    borderRadius: radii.md,
  },
  fieldFocusOutline: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: authPalette.field.focusOutline,
  },
  fieldFocusOutlineDense: {
    borderRadius: radii.md,
  },
  fieldInput: {
    flex: 1,
    color: authPalette.field.text,
    fontSize: 15,
    lineHeight: 19,
    paddingVertical: 13,
    fontWeight: '500',
  },
  fieldInputDense: {
    fontSize: 14,
    lineHeight: 18,
    paddingVertical: 11,
  },
})
