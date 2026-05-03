import { useRouter } from 'expo-router'
import { useState } from 'react'
import { useAuthSession } from '@/features/auth/use-auth-session'
import {
  useBootstrapFamily,
  useConsumeFamilyInvite,
} from '@/features/family/use-family-actions'
import { triggerHaptic } from '@/lib/haptics'
import { getErrorMessage } from '@/utils/error-message'

/**
 * Standalone /(auth)/join flow — used when the user has a session
 * but no family (e.g. account created via deep link, abandoned
 * onboarding, etc.). The full onboarding wizard handles the same
 * branching with contribution toggle / family summary; this is the
 * minimal path for users who just want to bootstrap or join.
 *
 * Joining here doesn't capture a contribution amount — the user
 * lands at $0 and can update their contribution from Settings later.
 */
export function useJoinController() {
  const router = useRouter()
  const { data: session } = useAuthSession()
  const userId = session?.user.id
  const [code, setCode] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const bootstrapMutation = useBootstrapFamily(userId)
  const consumeMutation = useConsumeFamilyInvite(userId)
  const isLoading = bootstrapMutation.isPending || consumeMutation.isPending
  // Invite codes are 8 chars. Accept ≥4 to be tolerant of older
  // codes typed in the standalone flow.
  const canJoinWithCode = code.trim().length >= 4
  const clearError = () => setErrorMessage(null)

  const joinWithCode = () => {
    setErrorMessage(null)
    consumeMutation.mutate(
      { code, monthlyIncomeContribution: null },
      {
        onError: (error: unknown) => {
          void triggerHaptic('error')
          setErrorMessage(
            getErrorMessage(error, 'No se pudo unir a la familia con ese código.'),
          )
        },
        onSuccess: () => {
          void triggerHaptic('success')
          router.replace('/')
        },
      },
    )
  }

  const createFamily = () => {
    setErrorMessage(null)
    bootstrapMutation.mutate(undefined, {
      onError: (error: unknown) => {
        void triggerHaptic('error')
        setErrorMessage(getErrorMessage(error, 'No se pudo crear la familia.'))
      },
      onSuccess: () => {
        void triggerHaptic('success')
        router.replace('/(app)/household-setup?initial=1')
      },
    })
  }

  return {
    bootstrapMutation,
    canJoinWithCode,
    code,
    errorMessage,
    isLoading,
    joinMutation: consumeMutation,
    actions: {
      clearError,
      createFamily,
      joinWithCode,
      setCode: (value: string) => {
        clearError()
        setCode(value.toUpperCase())
      },
    },
  }
}
