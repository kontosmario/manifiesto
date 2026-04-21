import { type ReactNode } from 'react'

export function LoginHeroModel({
  fallback = null,
}: {
  fallback?: ReactNode
  objectScale?: number
  reducedMotion?: boolean
}) {
  return <>{fallback}</>
}
