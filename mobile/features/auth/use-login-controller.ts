import { useFocusEffect } from '@react-navigation/native'
import {
  Dimensions,
  useWindowDimensions,
} from 'react-native'
import { useCallback, useMemo, useRef, useState } from 'react'
import { buildAuthHelperCopy, type AuthMode } from '@/features/auth/auth-flow'
import {
  buildAuthViewportMetrics,
} from '@/features/auth/auth-layout'
import { usePasswordSignIn, usePasswordSignUp } from '@/features/auth/use-auth-actions'
import { useAuthBiometricController } from '@/features/auth/use-auth-biometric-controller'
import { useAuthKeyboardController } from '@/features/auth/use-auth-keyboard-controller'
import { useLoginFormState } from '@/features/auth/use-login-form-state'
import { useLoginSubmit } from '@/features/auth/use-login-submit'
import { dispatchAuthFlow } from '@/features/auth-flow/auth-flow-controller'
import { authFlowLog } from '@/lib/auth-flow-logger'
import { useReducedMotion } from '@/hooks/use-reduced-motion'

interface UseLoginControllerOptions {
  /**
   * Sprint F · F14: captcha resolver passed from the LoginScreen,
   * which owns the `useCaptcha()` modal state. When provided,
   * `useLoginSubmit` calls it before `signInWithPassword` and forwards
   * the resulting token to Supabase. Optional so other entry points
   * that don't render the captcha modal (e.g. tests) keep working.
   */
  resolveCaptchaToken?: () => Promise<string | undefined>
}

export function useLoginController(options?: UseLoginControllerOptions) {
  const isReducedMotionEnabled = useReducedMotion()
  const { width } = useWindowDimensions()
  const screenHeight = Dimensions.get('screen').height
  const isSubmittingRef = useRef(false)
  const [isSubmitting, setSubmitting] = useState(false)
  const useReferenceSignInLayout = true
  const passwordSignIn = usePasswordSignIn()
  const passwordSignUp = usePasswordSignUp()
  const formState = useLoginFormState()
  const {
    displayName,
    email,
    errorMessage,
    infoMessage,
    mode,
    password,
    actions: formActions,
  } = formState
  const {
    clearFeedback,
    setDisplayName,
    setEmail,
    setErrorMessage,
    setInfoMessage,
    setMode,
    setPassword,
    setPasswordValue,
    updateMode: updateModeState,
  } = formActions

  const keyboardController = useAuthKeyboardController({
    mode,
  })
  const {
    availableContentHeight,
    emailInputRef,
    keyboardHeight,
    nameInputRef,
    passwordInputRef,
    isKeyboardVisible,
    actions: keyboardActions,
  } = keyboardController
  // Entrance animation hook removed (2026-04-30): the values returned
  // (heroOpacity / panelOpacity / etc.) were never consumed by any
  // rendered screen. The dead code path is gone — see commit history
  // if you need the previous implementation.
  const handleSignedInTransition = useCallback(() => {
    // La máquina hace todo: marca unlocked, prefetchea el snapshot,
    // espera el bridge opaco y navega al destino resuelto. Acá solo
    // confirmamos la identidad.
    authFlowLog('login-controller', 'handleSignedInTransition: dispatch LOGIN_SUCCESS')
    dispatchAuthFlow({ type: 'LOGIN_SUCCESS' })
  }, [])
  const biometricController = useAuthBiometricController({
    clearFeedback: formActions.clearFeedback,
    isSubmitting,
    mode,
    onErrorMessage: formActions.setErrorMessage,
    onInfoMessage: formActions.setInfoMessage,
    onSignedIn: handleSignedInTransition,
    submissionLockRef: isSubmittingRef,
  })
  const {
    biometricState,
    isBiometricSubmitting,
    actions: biometricActions,
  } = biometricController
  const {
    handleBiometricSignIn,
    persistBiometricCredentials,
    refreshBiometricState,
    resetAutoBiometricAttempt,
  } = biometricActions
  // Used by `useLoginSubmit` when a sign-up resolution returns the
  // onboarding href. El destino real lo resuelve el driver de la
  // máquina (resolveDestinationRoute → biometric-setup/onboarding según
  // flags); el href del resolver queda como dato legacy hasta Etapa 5.
  const navigateToJoin = useCallback(
    (_href: '/(app)/biometric-setup') => {
      dispatchAuthFlow({ type: 'SIGNUP_SUCCESS' })
    },
    [],
  )
  const { handleSubmit } = useLoginSubmit({
    clearFeedback,
    displayName,
    email,
    isBiometricSubmitting,
    mode,
    onErrorMessage: setErrorMessage,
    onInfoMessage: setInfoMessage,
    onModeChange: setMode,
    onNavigateToJoin: navigateToJoin,
    onPasswordReset: () => setPassword(''),
    onSignedIn: handleSignedInTransition,
    password,
    passwordSignIn: passwordSignIn.mutateAsync,
    passwordSignUp: passwordSignUp.mutateAsync,
    persistBiometricCredentials,
    resolveCaptchaToken: options?.resolveCaptchaToken,
    setSubmitting,
    submissionLockRef: isSubmittingRef,
  })
  const isBusy = isSubmitting || isBiometricSubmitting

  const helperCopy = useMemo(() => buildAuthHelperCopy(mode), [mode])
  const viewportMetrics = useMemo(
    () =>
      buildAuthViewportMetrics({
        availableContentHeight,
        screenHeight,
        width,
      }),
    [availableContentHeight, screenHeight, width],
  )
  const {
    containerMinHeight,
    contentGap,
    isCompact,
    panelGap,
    panelPadding,
    panelWidth,
    scrollBottomPadding,
    scrollTopPadding,
  } = viewportMetrics

  useFocusEffect(
    useCallback(() => {
      resetAutoBiometricAttempt()
      void refreshBiometricState()
    }, [refreshBiometricState, resetAutoBiometricAttempt]),
  )

  const updateMode = useCallback(
    (nextMode: AuthMode) => {
      if (isBusy || nextMode === mode) {
        return
      }

      updateModeState(nextMode)
    },
    [isBusy, mode, updateModeState],
  )

  return {
    // `animation` field removed (2026-04-30): every value it exposed
    // (heroOpacity / panelOpacity / modeContent* / keyboardShift) was
    // dead code — never plumbed into any JSX style. The hooks that
    // produced them (useAuthEntranceAnimation + the timing animation
    // inside useAuthKeyboardController) were also deleted.
    biometricState,
    containerMinHeight,
    contentGap,
    displayName,
    email,
    errorMessage,
    helperCopy,
    infoMessage,
    isBusy,
    isCompact,
    isKeyboardVisible,
    isReducedMotionEnabled,
    keyboardHeight,
    mode,
    nameInputRef,
    panelGap,
    panelPadding,
    panelWidth,
    password,
    passwordInputRef,
    scrollBottomPadding,
    scrollTopPadding,
    useReferenceSignInLayout,
    emailInputRef,
    actions: {
      clearFeedback,
      dismissKeyboard: keyboardActions.dismissKeyboard,
      handleBiometricSignIn,
      handleFieldBlur: keyboardActions.handleFieldBlur,
      handleFieldFocus: keyboardActions.handleFieldFocus,
      handleSubmit,
      handleViewportLayout: keyboardActions.handleViewportLayout,
      setDisplayName,
      setEmail,
      setErrorMessage,
      setInfoMessage,
      setPassword: setPasswordValue,
      updateMode,
    },
  }
}
