import React, { useMemo } from 'react'
import { View } from 'react-native'
import {
  useDeclareSubscriptionIntent,
  useRecordSubscriptionAudit,
  useResolveSubscriptionIntent,
  useSubscriptionAuditFeed,
  useZombiePushSync,
} from '@/features/subscriptions-zombie'
import { AuditPromptCard } from '@/components/subscriptions-zombie/audit-prompt-card'
import { ClassificationCard } from '@/components/subscriptions-zombie/classification-card'
import { IntentFollowupCard } from '@/components/subscriptions-zombie/intent-followup-card'
import { IntentStatusCard } from '@/components/subscriptions-zombie/intent-status-card'

interface Props {
  familyId?: string
  userId?: string | null
}

/**
 * Zombie subscription audit feed for the asistente screen.
 *
 * Self-contained: subscribes to its own data via `useSubscriptionAuditFeed`,
 * runs the pure engine, and renders one card per candidate. The shape of
 * the card depends on the feed item's classification + open intent + follow-up.
 */
export function ZombieFeedSection({ familyId, userId }: Props) {
  const { data, raw } = useSubscriptionAuditFeed(familyId)
  const recordAudit = useRecordSubscriptionAudit(familyId)
  const declareIntent = useDeclareSubscriptionIntent(familyId)
  const resolveIntent = useResolveSubscriptionIntent(familyId)

  const fijosById = useMemo(() => {
    const map = new Map<string, NonNullable<typeof raw>['fixedExpenses'][number]>()
    if (raw) for (const f of raw.fixedExpenses) map.set(f.id, f)
    return map
  }, [raw])

  const membersById = useMemo(() => {
    const map = new Map<string, NonNullable<typeof raw>['members'][number]>()
    if (raw) for (const m of raw.members) map.set(m.userId, m)
    return map
  }, [raw])

  useZombiePushSync({ familyId, feed: data?.feed, fijosById })

  if (!data || data.feed.length === 0 || !raw) return null

  const now = new Date()

  return (
    <View style={{ gap: 12, paddingHorizontal: 16, marginTop: 12 }}>
      {data.feed.map((item) => {
        const fijo = fijosById.get(item.fixedExpenseId)
        if (!fijo) return null

        if (item.openIntent && item.followUpKind) {
          const declaredBy = item.openIntent.userId
            ? membersById.get(item.openIntent.userId)
            : undefined
          return (
            <View key={item.fixedExpenseId} style={{ gap: 8 }}>
              <IntentStatusCard
                intent={item.openIntent.intent}
                declaredByName={declaredBy?.name ?? 'Alguien'}
                declaredAtIso={item.openIntent.declaredAt}
                fijoName={fijo.name}
                monthlySaving={fijo.amount}
                now={now}
              />
              <IntentFollowupCard
                fijoName={fijo.name}
                declaredAtIso={item.openIntent.declaredAt}
                followUpKind={item.followUpKind}
                now={now}
                onConfirmDone={() =>
                  resolveIntent.mutate({
                    intentId: item.openIntent!.id,
                    resolution: 'completed',
                  })
                }
                onStillNo={() => {
                  /* no-op: dismissed for now, will reappear next cycle */
                }}
                onChangedMind={() =>
                  resolveIntent.mutate({
                    intentId: item.openIntent!.id,
                    resolution: 'abandoned',
                  })
                }
              />
            </View>
          )
        }

        if (item.classification === 'pending_audit') {
          return (
            <AuditPromptCard
              key={item.fixedExpenseId}
              fijoName={fijo.name}
              fijoAmount={fijo.amount}
              audits={item.audits}
              members={raw.members}
              currentUserId={userId ?? ''}
              now={now}
              onSelect={(level) =>
                recordAudit.mutate({
                  fixedExpenseId: item.fixedExpenseId,
                  level,
                })
              }
            />
          )
        }

        if (
          item.classification === 'zombie_consensuado' ||
          item.classification === 'uso_desigual'
        ) {
          const monthsObserved = Math.max(
            Math.floor(
              (Date.now() - Date.parse(fijo.createdAt)) / (1000 * 60 * 60 * 24 * 30),
            ),
            1,
          )
          return (
            <ClassificationCard
              key={item.fixedExpenseId}
              classification={item.classification}
              fijoName={fijo.name}
              fijoAmount={fijo.amount}
              monthsObserved={monthsObserved}
              onDeclareIntent={(intent) =>
                declareIntent.mutate({
                  fixedExpenseId: item.fixedExpenseId,
                  intent,
                })
              }
              onIgnore={() => {
                /* no-op: cooldown decides re-surface */
              }}
            />
          )
        }

        return null
      })}
    </View>
  )
}
