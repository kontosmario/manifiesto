import { createRef, useMemo } from 'react'
import type { ReturnKeyTypeOptions, TextInput } from 'react-native'

export interface KeyboardChainField {
  /** Attach this ref to the TextInput. */
  ref: React.RefObject<TextInput | null>
  /** Apply to the TextInput's `returnKeyType` prop. */
  returnKeyType: ReturnKeyTypeOptions
  /** Apply to the TextInput's `onSubmitEditing` prop. */
  onSubmitEditing: () => void
}

/**
 * Builds a return-key chain across a sequence of TextInput refs.
 *
 * Usage:
 *   const [amount, description] = useKeyboardChain(2, handleSubmit)
 *   <TextField ref={amount.ref} returnKeyType={amount.returnKeyType} onSubmitEditing={amount.onSubmitEditing} />
 *   <TextField ref={description.ref} returnKeyType={description.returnKeyType} onSubmitEditing={description.onSubmitEditing} />
 *
 * The last field fires `onSubmit` (if provided) and uses `done` / `go` as its key.
 */
export function useKeyboardChain(
  count: number,
  onSubmit?: () => void,
  lastReturnKey: ReturnKeyTypeOptions = 'done',
): KeyboardChainField[] {
  return useMemo(() => {
    const refs = Array.from({ length: count }, () => createRef<TextInput>())
    return refs.map((ref, index) => {
      const isLast = index === count - 1
      return {
        ref,
        returnKeyType: isLast ? lastReturnKey : 'next',
        onSubmitEditing: () => {
          if (isLast) {
            onSubmit?.()
          } else {
            refs[index + 1]?.current?.focus()
          }
        },
      }
    })
  }, [count, onSubmit, lastReturnKey])
}
