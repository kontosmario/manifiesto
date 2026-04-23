import { useEffect, useState } from 'react'
import { AccessibilityInfo } from 'react-native'

export function useReducedMotion() {
  const [isReducedMotionEnabled, setReducedMotionEnabled] = useState(false)

  useEffect(() => {
    let isMounted = true

    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (isMounted) {
        setReducedMotionEnabled(value)
      }
    })

    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      (value) => {
        setReducedMotionEnabled(value)
      },
    )

    return () => {
      isMounted = false
      subscription.remove()
    }
  }, [])

  return isReducedMotionEnabled
}
