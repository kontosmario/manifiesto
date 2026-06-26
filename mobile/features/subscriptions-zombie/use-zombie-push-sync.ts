import { useEffect } from 'react'
import {
  getPersistentValue,
  setPersistentValue,
} from '@/lib/persistent-kv'
import { sendFamilyPush } from '@/lib/send-family-push'
import type { AuditFeedItem, FixedExpenseRow } from './types'

const STORAGE_KEY = 'subs-zombie-notified:v1'

/**
 * Push notification cuando el engine emite una clasificación final de
 * suscripción zombie. Anti-spam: si hay >2 pendientes manda UNA sola push
 * consolidada; 1-2 → individuales. Dedupe persistido por
 * (fixed_expense_id, classification) vía SecureStore.
 *
 * Mounts inside the asistente screen / zombie feed section. Idempotent.
 */
export function useZombiePushSync(args: {
  familyId?: string
  feed: AuditFeedItem[] | undefined
  fijosById: Map<string, FixedExpenseRow>
}) {
  const { familyId, feed, fijosById } = args

  useEffect(() => {
    if (!familyId || !feed || feed.length === 0) return
    let cancelled = false
    void (async () => {
      const raw = (await getPersistentValue(STORAGE_KEY)) ?? '{}'
      let notified: Record<string, string> = {}
      try {
        const parsed = JSON.parse(raw) as unknown
        if (parsed && typeof parsed === 'object') {
          notified = parsed as Record<string, string>
        }
      } catch {
        notified = {}
      }
      let dirty = false

      // Juntar las suscripciones que pushearían (elegibles + no
      // notificadas). Anti-spam: si son >2 → UNA sola push consolidada;
      // 1-2 → individuales (copy actual).
      const pending: {
        id: string
        classification: string
        name: string
        amount: number
      }[] = []
      for (const item of feed) {
        if (
          item.classification !== 'zombie_consensuado' &&
          item.classification !== 'uso_desigual'
        ) {
          continue
        }
        if (notified[item.fixedExpenseId] === item.classification) continue
        const fijo = fijosById.get(item.fixedExpenseId)
        if (!fijo) continue
        pending.push({
          id: item.fixedExpenseId,
          classification: item.classification,
          name: fijo.name,
          amount: fijo.amount,
        })
      }

      if (!cancelled && pending.length > 2) {
        const total = pending.reduce((sum, p) => sum + p.amount, 0)
        const names = pending
          .slice(0, 3)
          .map((p) => p.name)
          .join(', ')
        const more = pending.length > 3 ? ` y ${pending.length - 3} más` : ''
        try {
          await sendFamilyPush({
            familyId,
            title: `Tienes ${pending.length} suscripciones que casi no usas`,
            body: `${names}${more} · $${total.toLocaleString('es-AR')}/mes. Toca para revisar.`,
            kind: 'subscription_zombie',
            url: '/asistente',
          })
          for (const p of pending) notified[p.id] = p.classification
          dirty = true
        } catch {
          // Best-effort: la card ya está visible in-app.
        }
      } else {
        for (const p of pending) {
          if (cancelled) return
          const title =
            p.classification === 'zombie_consensuado'
              ? `${p.name} — la familia casi no la usa`
              : `${p.name} — uso desigual en la familia`
          const body = `Pagas $${p.amount.toLocaleString('es-AR')} al mes. Toca para revisar.`
          try {
            await sendFamilyPush({
              familyId,
              title,
              body,
              kind: 'subscription_zombie',
              url: '/asistente',
            })
            notified[p.id] = p.classification
            dirty = true
          } catch {
            // Best-effort: la card ya está visible in-app.
          }
        }
      }
      if (dirty && !cancelled) {
        try {
          await setPersistentValue(STORAGE_KEY, JSON.stringify(notified))
        } catch {
          // Best-effort persistence — we already sent the push.
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [familyId, feed, fijosById])
}
