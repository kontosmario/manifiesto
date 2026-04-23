import { useRouter } from 'expo-router'
import { useState } from 'react'
import { useAuthSession } from '@/features/auth/use-auth-session'
import { useBootstrapFamily, useJoinFamily } from '@/features/family/use-family-actions'
import { triggerHaptic } from '@/lib/haptics'
import { getErrorMessage } from '@/utils/error-message'

export function useJoinController() {
  const router = useRouter()
  const { data: session } = useAuthSession()
  const userId = session?.user.id
  const [code, setCode] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const bootstrapMutation = useBootstrapFamily(userId)
  const joinMutation = useJoinFamily(userId)
  const isLoading = bootstrapMutation.isPending || joinMutation.isPending
  const canJoinWithCode = code.trim().length >= 6
  const clearError = () => setErrorMessage(null)

  const joinWithCode = () => {
    setErrorMessage(null)
    joinMutation.mutate(code, {
      onError: (error: unknown) => {
        void triggerHaptic('error')
        setErrorMessage(getErrorMessage(error, 'No se pudo unir a la familia con ese código.'))
      },
      onSuccess: () => {
        void triggerHaptic('success')
        router.replace('/')
      },
    })
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
    joinMutation,
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
