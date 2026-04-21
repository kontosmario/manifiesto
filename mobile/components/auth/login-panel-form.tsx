import { StyleSheet, Text, TextInput, View } from 'react-native'
import { AuthInput } from '@/components/auth/login-primitives'
import type { AuthMode } from '@/features/auth/auth-flow'
import { authPalette } from '@/theme/auth-theme'

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
  onUpdateDisplayName,
  onUpdateEmail,
  password,
  passwordInputRef,
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
  onUpdateDisplayName: (value: string) => void
  onUpdateEmail: (value: string) => void
  password: string
  passwordInputRef: React.RefObject<TextInput | null>
  useReferenceSignInLayout: boolean
}) {
  return (
    <View style={[styles.formStack, useReferenceSignInLayout && styles.formStackDense]}>
      {mode === 'sign-up' ? (
        <AuthInput
          autoCapitalize="words"
          autoComplete="name"
          autoCorrect={false}
          dense={useReferenceSignInLayout}
          label="Nombre"
          onBlur={() => onFieldBlur('name')}
          onChangeText={onUpdateDisplayName}
          onFocus={() => onFieldFocus('name')}
          onSubmitEditing={() => {
            emailInputRef.current?.focus()
          }}
          placeholder="Mario"
          reducedMotion={isReducedMotionEnabled}
          ref={nameInputRef}
          returnKeyType="next"
          textContentType="name"
          value={displayName}
        />
      ) : null}

      <AuthInput
        autoCapitalize="none"
        autoComplete={mode === 'sign-in' ? 'username' : 'email'}
        autoCorrect={false}
        clearButtonMode="while-editing"
        dense={useReferenceSignInLayout}
        keyboardType="email-address"
        label="Email"
        onBlur={() => onFieldBlur('email')}
        onChangeText={onUpdateEmail}
        onFocus={() => onFieldFocus('email')}
        onSubmitEditing={() => {
          passwordInputRef.current?.focus()
        }}
        placeholder="mario@email.com"
        reducedMotion={isReducedMotionEnabled}
        ref={emailInputRef}
        returnKeyType="next"
        spellCheck={false}
        textContentType={mode === 'sign-in' ? 'username' : 'emailAddress'}
        value={email}
      />

      <AuthInput
        autoCapitalize="none"
        autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
        autoCorrect={false}
        dense={useReferenceSignInLayout}
        label="Password"
        onBlur={() => onFieldBlur('password')}
        onChangeText={onPasswordChange}
        onFocus={() => onFieldFocus('password')}
        onSubmitEditing={onPasswordSubmit}
        placeholder="••••••••"
        reducedMotion={isReducedMotionEnabled}
        ref={passwordInputRef}
        returnKeyType="go"
        secureTextEntry
        spellCheck={false}
        textContentType={mode === 'sign-in' ? 'password' : 'newPassword'}
        value={password}
      />

      {mode === 'sign-up' ? (
        <Text style={styles.helperCopy}>
          Después de crear la cuenta vas a elegir si querés crear un grupo familiar o unirte a uno existente.
        </Text>
      ) : null}
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
  helperCopy: {
    color: authPalette.field.label,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 18,
    paddingTop: 2,
  },
})
