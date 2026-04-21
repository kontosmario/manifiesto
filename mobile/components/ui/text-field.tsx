import { useState } from 'react'
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native'
import { radii } from '@/theme/palette'
import { useAppTheme } from '@/theme/theme-provider'

interface TextFieldProps extends TextInputProps {
  label: string
  helper?: string
}

export function TextField({ label, helper, style, ...inputProps }: TextFieldProps) {
  const { theme } = useAppTheme()
  const [isFocused, setFocused] = useState(false)
  const isMultiline = Boolean(inputProps.multiline)

  return (
    <View style={styles.container}>
      <Text
        style={[
          styles.label,
          theme.typography.fieldLabel,
          { color: isFocused ? theme.colors.primaryStrong : theme.colors.textMuted },
        ]}
      >
        {label}
      </Text>
      <TextInput
        clearButtonMode="while-editing"
        placeholderTextColor={theme.colors.textSoft}
        selectionColor={theme.colors.primary}
        style={[
          styles.input,
          theme.typography.body,
          {
            backgroundColor: theme.colors.surfaceMuted,
            borderColor: isFocused ? theme.colors.primaryStrong : theme.colors.border,
            color: theme.colors.text,
            paddingBottom: isMultiline ? 14 : 0,
            paddingTop: isMultiline ? 14 : 0,
            textAlignVertical: isMultiline ? 'top' : 'center',
          },
          style,
        ]}
        onBlur={(event) => {
          setFocused(false)
          inputProps.onBlur?.(event)
        }}
        onFocus={(event) => {
          setFocused(true)
          inputProps.onFocus?.(event)
        }}
        {...inputProps}
      />
      {helper ? (
        <Text style={[styles.helper, theme.typography.bodySmall, { color: theme.colors.textSoft }]}>
          {helper}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    gap: 6,
  },
  label: {},
  input: {
    minHeight: 54,
    borderRadius: radii.lg, // 18 — exact match
    borderWidth: 1,
    paddingHorizontal: 16,
  },
  helper: {
    paddingHorizontal: 2,
  },
})
