// mobile/features/achievements/use-achievements-seen.ts
//
// "LOGROS NUEVOS SIN VER" — el flag que prende el dot naranja de la
// `LogrosAccessCard` del jardín (matriz ④2 del plan
// `docs/superpowers/plans/2026-08-11-jardin-rediseno-integracion.md`, T11).
//
// ─────────────────────────────────────────────────────────────────────
// POR QUÉ UN CONTEO Y NO UNA LISTA DE CODES
// ─────────────────────────────────────────────────────────────────────
//
// El otorgamiento es 100% server-side y monótono: un logro desbloqueado no se
// vuelve a bloquear. Con eso, "cuántos había la última vez que fuiste a verlos"
// alcanza para saber si hay novedades, y es UN entero en vez de una lista que
// crece y que habría que reconciliar contra el catálogo en cada arranque.
//
// AsyncStorage (no `persistent-kv`/Keychain), igual que el "visto" del cierre
// de semana: son flags de UX sin valor sensible.
//
// ⚠️ ANCLAJE EN LA PRIMERA LECTURA. Sin marca previa NO se anuncia nada: se
// guarda el conteo actual y se reporta 0. Si no, el día del update todo usuario
// con logros ya ganados vería el dot de "hay algo nuevo" por logros que ya
// conoce — la peor forma posible de estrenar la señal.

import { useCallback, useEffect, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'

export const achievementsSeenKey = (userId: string) =>
  `achievements_last_seen_count_${userId}`

/** Cuántos desbloqueados hay de más respecto de lo último que el usuario vio.
 *  Nunca negativo: si el catálogo desactivara un code ya otorgado, el conteo
 *  real bajaría y un número negativo no significa nada para la UI. */
export function unseenFrom(stored: number | null, earned: number | null): number | null {
  if (stored === null || earned === null) return null
  return Math.max(0, earned - stored)
}

/** Guarda el conteo visto. Best-effort: si el storage falla, el dot se queda
 *  como está — nunca rompe la pantalla. */
export async function markAchievementsSeen(
  userId: string,
  earnedCount: number,
): Promise<void> {
  try {
    await AsyncStorage.setItem(achievementsSeenKey(userId), String(earnedCount))
  } catch {
    // Best-effort a propósito.
  }
}

/** Lee el conteo visto. `null` = sin marca (o storage caído): el llamador
 *  ancla. Un valor corrupto (no numérico) se trata como sin marca. */
export async function readAchievementsSeen(userId: string): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(achievementsSeenKey(userId))
    if (raw === null) return null
    const parsed = Number.parseInt(raw, 10)
    return Number.isFinite(parsed) ? parsed : null
  } catch {
    return null
  }
}

export interface AchievementsSeenState {
  /** `>0` hay logros nuevos sin ver · `0` nada nuevo · `null` todavía leyendo
   *  (o sin `userId`/sin conteo): el dot sólo se prende con un número > 0. */
  unseenCount: number | null
  /** Marca todo como visto con el conteo actual (optimista + persistente). */
  markSeen: () => void
}

/**
 * Estado de "logros nuevos sin ver" para `userId`.
 *
 * `earnedCount` es el conteo real del catálogo (`useAchievements`), `null`
 * mientras carga. Mientras sea `null` el hook no afirma nada.
 */
export function useAchievementsSeen(
  userId: string | undefined,
  earnedCount: number | null,
): AchievementsSeenState {
  // La lectura viaja CON el userId al que pertenece: si el usuario cambia, el
  // valor viejo deja de aplicar solo (vuelve a "leyendo") en vez de comparar
  // el conteo de una cuenta contra la marca de otra.
  const [read, setRead] = useState<{ userId: string; count: number | null } | null>(null)

  useEffect(() => {
    if (!userId) return
    let alive = true
    void (async () => {
      const count = await readAchievementsSeen(userId)
      if (alive) setRead({ userId, count })
    })()
    return () => {
      alive = false
    }
  }, [userId])

  // Anclaje (primera lectura sin marca) y saneo hacia abajo (marca por encima
  // del conteo real). El efecto SINCRONIZA el storage —un sistema externo— y
  // recién en el callback refleja el valor en el estado; escribir el estado en
  // el cuerpo del efecto dispararía el render en cascada que prohíbe la regla
  // `react-hooks/set-state-in-effect`. Corre una sola vez: después de anclar,
  // la guarda `count <= earnedCount` lo corta.
  useEffect(() => {
    if (!userId || earnedCount === null) return
    if (read === null || read.userId !== userId) return
    if (read.count !== null && read.count <= earnedCount) return
    let alive = true
    void markAchievementsSeen(userId, earnedCount).then(() => {
      if (alive) setRead({ userId, count: earnedCount })
    })
    return () => {
      alive = false
    }
  }, [userId, earnedCount, read])

  const markSeen = useCallback(() => {
    if (!userId || earnedCount === null) return
    setRead({ userId, count: earnedCount })
    void markAchievementsSeen(userId, earnedCount)
  }, [userId, earnedCount])

  const unseenCount =
    !userId || read === null || read.userId !== userId
      ? null
      : unseenFrom(read.count, earnedCount)

  return { unseenCount, markSeen }
}
