import { useEffect } from 'react'
import { usePathname } from 'expo-router'
import { setCurrentPathname } from '@/lib/current-pathname'

/**
 * Espeja el pathname del router en `current-pathname.ts` para que
 * `+native-intent.ts` (que corre fuera de React) pueda redirigir un
 * share en caliente a "donde el usuario ya está" en vez de a `/`.
 * Render nulo, costo cero.
 */
export function PathnameMirror() {
  const pathname = usePathname()
  useEffect(() => {
    if (pathname) setCurrentPathname(pathname)
  }, [pathname])
  return null
}
