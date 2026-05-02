import { useEffect } from 'react'
import {
  getPersistentValue,
  setPersistentValue,
} from '@/lib/persistent-kv'
import { sendFamilyPush } from '@/lib/send-family-push'
import type { AuditFeedItem, FixedExpenseRow } from './types'

const STORAGE_KEY = 'subs-zombie-notified:v1'

/**
 * Fire a push notification once per (fixed_expense_id, classification)
 * when the engine emits a final classification. Persisted dedupe via
 * SecureStore — the same classification twice (e.g. user audited again
 * after cooldown) won't re-spam.
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
      for (const item of feed) {
        if (cancelled) return
        if (
          item.classification !== 'zombie_consensuado' &&
          item.classification !== 'uso_desigual'
        ) {
          continue
        }
        if (notified[item.fixedExpenseId] === item.classification) continue

        const fijo = fijosById.get(item.fixedExpenseId)
        if (!fijo) continue

        const title =
          item.classification === 'zombie_consensuado'
            ? `${fijo.name} — la familia casi no la usa`
            : `${fijo.name} — uso desigual en la familia`
        const body = `Pagás $${fijo.amount.toLocaleString('es-AR')} al mes. Tocá para revisar.`

        try {
          await sendFamilyPush({
            familyId,
            title,
            body,
            kind: 'subscription_zombie',
            url: '/asistente',
          })
          notified[item.fixedExpenseId] = item.classification
          dirty = true
        } catch {
          // Swallow: push delivery is best-effort, the card already
          // surfaced visually. We'll retry on the next mount.
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
