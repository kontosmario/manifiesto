import { Pressable, StyleSheet, TextInput, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { TextField } from '@/components/ui/text-field'
import type { AuthMode } from '@/features/auth/auth-flow'
import { triggerHaptic } from '@/lib/haptics'
import { DEFAULT_HIT_SLOP } from '@/theme/interaction'
import { useAppTheme } from '@/theme/theme-provider'

export function LoginPanelForm({
  displayName,
  email,
  emailInputRef,
  isReducedMotionEnabled,
  mode,
  nameInputRef,
  onFieldBlur,
  onFieldFocus,
  onPasswordChange,
  onPasswordSubmit,
  onTogglePasswordVisibility,
  onUpdateDisplayName,
  onUpdateEmail,
  password,
  passwordInputRef,
  showPassword,
  useReferenceSignInLayout,
}: {
  displayName: string
  email: string
  emailInputRef: React.RefObject<TextInput | null>
  isReducedMotionEnabled: boolean
  mode: AuthMode
  nameInputRef: React.RefObject<TextInput | null>
  onFieldBlur: (field: 'name' | 'email' | 'password') => void
  onFieldFocus: (field: 'name' | 'email' | 'password') => void
  onPasswordChange: (value: string) => void
  onPasswordSubmit: () => void
  onTogglePasswordVisibility?: () => void
  onUpdateDisplayName: (value: string) => void
  onUpdateEmail: (value: string) => void
  password: string
  passwordInputRef: React.RefObject<TextInput | null>
  showPassword?: boolean
  useReferenceSignInLayout: boolean
}) {
  const { theme } = useAppTheme()
  return (
    <View style={[styles.formStack, useReferenceSignInLayout && styles.formStackDense]}>
      {mode === 'sign-up' ? (
        <TextField
          autoCapitalize="words"
          autoComplete="name"
          autoCorrect={false}
          label="Nombre"
          onBlur={() => onFieldBlur('name')}
          onChangeText={onUpdateDisplayName}
          onFocus={() => onFieldFocus('name')}
          onSubmitEditing={() => {
            emailInputRef.current?.focus()
          }}
          placeholder="Mario"
          ref={nameInputRef}
          returnKeyType="next"
          textContentType="name"
          value={displayName}
        />
      ) : null}

      <TextField
        autoCapitalize="none"
        autoComplete={mode === 'sign-in' ? 'username' : 'email'}
        autoCorrect={false}
        keyboardType="email-address"
        label="Email"
        onBlur={() => onFieldBlur('email')}
        onChangeText={onUpdateEmail}
        onFocus={() => onFieldFocus('email')}
        onSubmitEditing={() => {
          passwordInputRef.current?.focus()
        }}
        placeholder="mario@email.com"
        ref={emailInputRef}
        returnKeyType="next"
        spellCheck={false}
        textContentType={mode === 'sign-in' ? 'username' : 'emailAddress'}
        value={email}
      />

      <TextField
        autoCapitalize="none"
        autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
        autoCorrect={false}
        label="Contraseña"
        onBlur={() => onFieldBlur('password')}
        onChangeText={onPasswordChange}
        onFocus={() => onFieldFocus('password')}
        onSubmitEditing={onPasswordSubmit}
        placeholder="••••••••"
        ref={passwordInputRef}
        returnKeyType={mode === 'sign-in' ? 'go' : 'next'}
        secureTextEntry={!showPassword}
        spellCheck={false}
        textContentType={mode === 'sign-in' ? 'password' : 'newPassword'}
        trailing={
          onTogglePasswordVisibility ? (
            <Pressable
              accessibilityLabel={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              accessibilityRole="button"
              hitSlop={DEFAULT_HIT_SLOP}
              onPress={() => {
                void triggerHaptic('selection')
                onTogglePasswordVisibility()
              }}
              style={({ pressed }) => [styles.eyeToggle, pressed && styles.eyeTogglePressed]}
            >
              <MaterialIcons
                color={theme.colors.textMuted}
                name={showPassword ? 'visibility-off' : 'visibility'}
                size={18}
              />
            </Pressable>
          ) : undefined
        }
        value={password}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  formStack: {
    gap: 13,
  },
  formStackDense: {
    gap: 10,
  },
  eyeToggle: {
    padding: 6,
    marginLeft: 4,
    borderRadius: 999,
  },
  eyeTogglePressed: {
    opacity: 0.65,
  },
})
