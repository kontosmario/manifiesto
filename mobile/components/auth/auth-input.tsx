import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native'
import { forwardRef, type ReactNode, useEffect, useState } from 'react'
import { triggerHaptic } from '@/lib/haptics'
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
  const [focusProgress] = useState(() => new Animated.Value(0))

  useEffect(() => {
    const animation = Animated.timing(focusProgress, {
      toValue: isFocused ? 1 : 0,
      duration: reducedMotion ? 0 : isFocused ? 180 : 140,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    })

    animation.start()

    return () => {
      animation.stop()
    }
  }, [focusProgress, isFocused, reducedMotion])

  return (
    <View style={[styles.fieldBlock, dense && styles.fieldBlockDense]}>
      <Text style={[styles.fieldLabel, dense && styles.fieldLabelDense]}>{label}</Text>
      <View style={[styles.fieldShell, dense && styles.fieldShellDense]}>
        <Animated.View
          style={[
            styles.fieldFocusFill,
            dense && styles.fieldFocusFillDense,
            {
              pointerEvents: 'none',
              opacity: focusProgress,
              transform: [
                {
                  scale: focusProgress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.985, 1],
                  }),
                },
              ],
            },
          ]}
        />
        <Animated.View
          style={[
            styles.fieldFocusOutline,
            dense && styles.fieldFocusOutlineDense,
            {
              pointerEvents: 'none',
              opacity: focusProgress.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 1],
              }),
            },
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
