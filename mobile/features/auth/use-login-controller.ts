import { useRouter } from 'expo-router'
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
import { showAuthTransitionSplash } from '@/lib/auth-transition-splash'
import { useReducedMotion } from '@/hooks/use-reduced-motion'

export function useLoginController() {
  const router = useRouter()
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
    showAuthTransitionSplash()
    router.replace('/')
  }, [router])
  const biometricController = useAuthBiometricController({
    clearFeedback: formActions.clearFeedback,
    isSubmitting,
    mode,
    onErrorMessage: formActions.setErrorMessage,
    onInfoMessage: formActions.setInfoMessage,
    onSignedIn: handleSignedInTransition,
    signInWithPassword: passwordSignIn.mutateAsync,
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
  // onboarding href. The name keeps "join" for back-compat with the
  // existing call sites; the destination is now /(app)/onboarding
  // (the 5-step wizard owns the family decision in step 3).
  const navigateToJoin = useCallback(
    (href: '/(app)/onboarding') => {
      showAuthTransitionSplash()
      router.replace(href)
    },
    [router],
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
      dismissKeyboard: keyboardActions.dismissKeyboard,
      handleBiometricSignIn,
      handleFieldBlur: keyboardActions.handleFieldBlur,
      handleFieldFocus: keyboardActions.handleFieldFocus,
      handleSubmit,
      handleViewportLayout: keyboardActions.handleViewportLayout,
      setDisplayName,
      setEmail,
      setPassword: setPasswordValue,
      updateMode,
    },
  }
}
