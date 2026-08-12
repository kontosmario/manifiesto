// mobile/features/garden/use-week-close-seen.ts
//
// "Visto" del cierre de semana — Task 10 del plan
// `docs/superpowers/plans/2026-08-11-jardin-rediseno-integracion.md`.
//
// ─────────────────────────────────────────────────────────────────────
// POR QUÉ EXISTE (la semántica CAMBIÓ)
// ─────────────────────────────────────────────────────────────────────
//
// Hasta acá había UNA sola marca: el `WeekCloseBridge` escribía
// `garden_week_close_seen_${userId}` en el auto-disparo, ANTES de mostrar la
// celebración. Servía para el "una vez por semana", pero convertía el "visto"
// en un sinónimo de "se intentó mostrar": con esa fuente, el dot de "sin ver"
// de la `SemanaPasadaCard` no podía prenderse NUNCA.
//
// El contrato nuevo separa las dos cosas:
//
//  · `garden_week_close_shown_${userId}`  ← lo escribe el bridge al
//    auto-disparar. Es lo que mantiene el 1×/semana.
//  · `garden_week_close_seen_${userId}`   ← se escribe al CERRAR el cierre
//    (desde el bridge o desde la pantalla del jardín). Es el "visto" de
//    verdad, el que apaga el dot.
//
// Ambas guardan el `weekCloseId` (el lunes ISO de la semana cerrada), así que
// se invalidan solas cuando arranca la semana siguiente.
//
// AsyncStorage (no `persistent-kv`/Keychain) a propósito: es donde ya vive la
// key legacy, y son flags de UX sin valor sensible.

import { useCallback, useEffect, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'

export const weekCloseSeenKey = (userId: string) => `garden_week_close_seen_${userId}`
export const weekCloseShownKey = (userId: string) => `garden_week_close_shown_${userId}`

/** Marca el cierre de la semana `weekCloseId` como VISTO. Best-effort: si
 *  AsyncStorage falla, el dot se queda prendido — nunca rompe la UI. */
export async function markWeekCloseSeen(userId: string, weekCloseId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(weekCloseSeenKey(userId), weekCloseId)
  } catch {
    // Best-effort a propósito.
  }
}

/**
 * Reclama el auto-disparo de la semana: `true` la PRIMERA vez que se pregunta
 * por ese `weekCloseId` (y deja la marca), `false` después. Es un
 * check-and-set: el bridge lo llama una sola vez por montaje.
 *
 * Migración del contrato viejo: si todavía no hay marca de "shown" pero la key
 * legacy de "seen" ya tiene ESTE `weekCloseId`, el auto-disparo de esta semana
 * ya ocurrió (lo escribía el bridge viejo antes de mostrar) → se traslada la
 * marca y se devuelve `false`. Sin esto, cada usuario con la app instalada
 * vería el cierre una segunda vez el día del update.
 */
export async function claimWeekCloseAutoShow(
  userId: string,
  weekCloseId: string,
): Promise<boolean> {
  try {
    const shown = await AsyncStorage.getItem(weekCloseShownKey(userId))
    if (shown === weekCloseId) return false
    if (shown === null) {
      const legacySeen = await AsyncStorage.getItem(weekCloseSeenKey(userId))
      if (legacySeen === weekCloseId) {
        await AsyncStorage.setItem(weekCloseShownKey(userId), weekCloseId)
        return false
      }
    }
    await AsyncStorage.setItem(weekCloseShownKey(userId), weekCloseId)
    return true
  } catch {
    // Si el storage falla no mostramos: repetir el takeover en cada arranque
    // es peor que perderse el momento automático (se ve igual desde el jardín).
    return false
  }
}

export interface WeekCloseSeenState {
  /** `true` visto · `false` sin ver · `null` mientras se lee (o sin datos):
   *  el dot sólo se prende con `false`, nunca durante la lectura. */
  seen: boolean | null
  /** Marca visto y actualiza el estado local (optimista). */
  markSeen: () => void
}

/**
 * Estado de "visto" del cierre de la semana `weekCloseId` para `userId`.
 * Devuelve `null` hasta que la lectura resuelve: un dot que aparece y se apaga
 * solo un frame después es peor que un dot que tarda un frame en aparecer.
 */
export function useWeekCloseSeen(
  userId: string | undefined,
  weekCloseId: string | undefined,
): WeekCloseSeenState {
  // La lectura viaja CON el userId al que pertenece: si el usuario cambia, el
  // valor viejo deja de aplicar solo (vuelve a `null` = leyendo) en vez de
  // afirmar "visto"/"sin ver" con la marca de otra cuenta por un tick.
  const [read, setRead] = useState<{ userId: string; value: string | null } | null>(null)

  useEffect(() => {
    if (!userId) return
    let alive = true
    void (async () => {
      try {
        const value = await AsyncStorage.getItem(weekCloseSeenKey(userId))
        if (alive) setRead({ userId, value })
      } catch {
        // Sin lectura no afirmamos "sin ver": el estado se queda en `null`.
      }
    })()
    return () => {
      alive = false
    }
  }, [userId])

  const markSeen = useCallback(() => {
    if (!userId || !weekCloseId) return
    setRead({ userId, value: weekCloseId })
    void markWeekCloseSeen(userId, weekCloseId)
  }, [userId, weekCloseId])

  const seen =
    !userId || weekCloseId === undefined || read === null || read.userId !== userId
      ? null
      : read.value === weekCloseId

  return { seen, markSeen }
}
