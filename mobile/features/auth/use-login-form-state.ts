import { useCallback, useState } from 'react'
import type { AuthMode } from '@/features/auth/auth-flow'

export function useLoginFormState() {
  const [mode, setMode] = useState<AuthMode>('sign-in')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [infoMessage, setInfoMessage] = useState<string | null>(null)

  const clearFeedback = useCallback(() => {
    setErrorMessage((current) => (current ? null : current))
    setInfoMessage((current) => (current ? null : current))
  }, [])

  const updateMode = useCallback(
    (nextMode: AuthMode) => {
      if (nextMode === mode) {
        return
      }

      clearFeedback()
      setMode(nextMode)
    },
    [clearFeedback, mode],
  )

  const handleDisplayNameChange = useCallback(
    (value: string) => {
      clearFeedback()
      setDisplayName(value)
    },
    [clearFeedback],
  )

  const handleEmailChange = useCallback(
    (value: string) => {
      clearFeedback()
      setEmail(value)
    },
    [clearFeedback],
  )

  const handlePasswordChange = useCallback(
    (value: string) => {
      clearFeedback()
      setPassword(value)
    },
    [clearFeedback],
  )

  return {
    displayName,
    email,
    errorMessage,
    infoMessage,
    mode,
    password,
    actions: {
      clearFeedback,
      setDisplayName: handleDisplayNameChange,
      setEmail: handleEmailChange,
      setErrorMessage,
      setInfoMessage,
      setMode,
      setPassword,
      setPasswordValue: handlePasswordChange,
      updateMode,
    },
  }
}
