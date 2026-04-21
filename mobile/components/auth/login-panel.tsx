import { LinearGradient } from 'expo-linear-gradient'
import { Animated, StyleSheet, TextInput } from 'react-native'
import { FeedbackPill, GradientActionButton, AuthSegmentedControl as SegmentedControl } from '@/components/auth/login-primitives'
import { LoginPanelFooter } from '@/components/auth/login-panel-footer'
import { LoginPanelForm } from '@/components/auth/login-panel-form'
import { LoginPanelHeader } from '@/components/auth/login-panel-header'
import type { AuthMode } from '@/features/auth/auth-flow'
import type { BiometricLoginState } from '@/lib/biometric-auth'
import { authPalette } from '@/theme/auth-theme'
import { radii } from '@/theme/palette'

interface LoginPanelProps {
  biometricState: BiometricLoginState
  displayName: string
  email: string
  emailInputRef: React.RefObject<TextInput | null>
  errorMessage: string | null
  helperCopy: {
    buttonLabel: string
    subtitle: string
    title: string
  }
  infoMessage: string | null
  isBusy: boolean
  isReducedMotionEnabled: boolean
  mode: AuthMode
  modeContentOpacity: Animated.Value
  modeContentTranslateY: Animated.Value
  nameInputRef: React.RefObject<TextInput | null>
  onBiometricSignIn: () => void
  onDevSpikePress: () => void
  onFieldBlur: (field: 'name' | 'email' | 'password') => void
  onFieldFocus: (field: 'name' | 'email' | 'password') => void
  onPasswordChange: (value: string) => void
  onPasswordSubmit: () => void
  onSubmit: () => void
  onUpdateMode: (mode: AuthMode) => void
  onUpdateDisplayName: (value: string) => void
  onUpdateEmail: (value: string) => void
  panelGap: number
  panelPadding: number
  panelWidth: number
  password: string
  passwordInputRef: React.RefObject<TextInput | null>
  useReferenceSignInLayout: boolean
}

export function LoginPanel({
  biometricState,
  displayName,
  email,
  emailInputRef,
  errorMessage,
  helperCopy,
  infoMessage,
  isBusy,
  isReducedMotionEnabled,
  mode,
  modeContentOpacity,
  modeContentTranslateY,
  nameInputRef,
  onBiometricSignIn,
  onDevSpikePress,
  onFieldBlur,
  onFieldFocus,
  onPasswordChange,
  onPasswordSubmit,
  onSubmit,
  onUpdateDisplayName,
  onUpdateEmail,
  onUpdateMode,
  panelGap,
  panelPadding,
  panelWidth,
  password,
  passwordInputRef,
  useReferenceSignInLayout,
}: LoginPanelProps) {
  return (
    <LinearGradient
      colors={authPalette.panel.gradient}
      end={{ x: 0.92, y: 1 }}
      start={{ x: 0.05, y: 0 }}
      style={[styles.panel, { gap: panelGap, padding: panelPadding, width: panelWidth }]}
    >
      <Animated.View
        style={[
          styles.panelContentFlow,
          {
            gap: panelGap,
            opacity: modeContentOpacity,
            transform: [{ translateY: modeContentTranslateY }],
          },
        ]}
      >
        <LoginPanelHeader
          dense={useReferenceSignInLayout}
          subtitle={helperCopy.subtitle}
          title={helperCopy.title}
        />

        <SegmentedControl
          dense={useReferenceSignInLayout}
          disabled={isBusy}
          onChange={onUpdateMode}
          options={[
            { label: 'Ingresar', value: 'sign-in' },
            { label: 'Crear cuenta', value: 'sign-up' },
          ]}
          reducedMotion={isReducedMotionEnabled}
          value={mode}
        />

        {errorMessage ? <FeedbackPill intent="error" message={errorMessage} /> : null}
        {!errorMessage && infoMessage ? <FeedbackPill intent="info" message={infoMessage} /> : null}

        <LoginPanelForm
          displayName={displayName}
          email={email}
          emailInputRef={emailInputRef}
          isReducedMotionEnabled={isReducedMotionEnabled}
          mode={mode}
          nameInputRef={nameInputRef}
          onFieldBlur={onFieldBlur}
          onFieldFocus={onFieldFocus}
          onPasswordChange={onPasswordChange}
          onPasswordSubmit={onPasswordSubmit}
          onUpdateDisplayName={onUpdateDisplayName}
          onUpdateEmail={onUpdateEmail}
          password={password}
          passwordInputRef={passwordInputRef}
          useReferenceSignInLayout={useReferenceSignInLayout}
        />

        <GradientActionButton
          dense={useReferenceSignInLayout}
          disabled={isBusy}
          label={isBusy ? 'Procesando...' : helperCopy.buttonLabel}
          onPress={onSubmit}
        />

        {mode === 'sign-in' ? (
          <LoginPanelFooter
            biometricState={biometricState}
            isBusy={isBusy}
            onBiometricSignIn={onBiometricSignIn}
            onDevSpikePress={onDevSpikePress}
            useReferenceSignInLayout={useReferenceSignInLayout}
          />
        ) : null}
      </Animated.View>
    </LinearGradient>
  )
}

const styles = StyleSheet.create({
  panel: {
    borderRadius: radii['2xl'],
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: authPalette.panel.border,
    gap: 14,
    shadowColor: authPalette.panel.shadow,
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: {
      width: 0,
      height: 9,
    },
  },
  panelContentFlow: {
    width: '100%',
  },
})
