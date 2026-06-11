import { useSyncExternalStore } from 'react'
import type { AdvisorSurface } from '@/features/insights/log-advisor-interaction'

// Reactive coordinator for advisor CTAs that need a confirmation
// sheet before firing. The dispatcher used to gate these flows
// behind `Alert.alert` — fine for prototypes but limits the UX
// (no editable amounts, no member preview, no shared design
// language). The coordinator + a global sheet host bring both
// flows under the same modal pattern as the rest of the app.
//
// State machine:
//   null (idle)
//   ↓ requestSavingsContribution
//   { type: 'savings', amount, dismissId, meta }
//   ↓ clear / mutation success
//   null
//
// Same shape for warnings, distinct discriminator.

/**
 * Meta forwarded by the dispatcher so the global host can write the
 * Memory Layer "acted" log on mutation success — same surface,
 * same task context that the original dispatcher had.
 */
export interface AdvisorRequestMeta {
  taskId: string
  surface: AdvisorSurface
  context?: Record<string, unknown>
  timeToActionMs?: number
}

export type AdvisorPendingAction =
  | {
      type: 'savings-contribution'
      amount: number
      dismissId: string
      meta: AdvisorRequestMeta | null
    }
  | {
      type: 'member-warning'
      targetUserId: string
      message: string
      meta: AdvisorRequestMeta | null
    }
  | {
      type: 'savings-goal-edit'
      meta: AdvisorRequestMeta | null
    }
  | {
      type: 'fixed-expense-edit'
      fixedExpenseId: string
      meta: AdvisorRequestMeta | null
    }
  | {
      type: 'fixed-expense-add'
      amount: number | null
      description: string | null
      meta: AdvisorRequestMeta | null
    }

let pending: AdvisorPendingAction | null = null
const listeners = new Set<() => void>()

function notify() {
  for (const listener of listeners) listener()
}

export function requestSavingsContribution(
  amount: number,
  dismissId: string,
  meta: AdvisorRequestMeta | null = null,
) {
  pending = { type: 'savings-contribution', amount, dismissId, meta }
  notify()
}

export function requestMemberWarning(
  targetUserId: string,
  message: string,
  meta: AdvisorRequestMeta | null = null,
) {
  pending = { type: 'member-warning', targetUserId, message, meta }
  notify()
}

export function requestSavingsGoalEdit(meta: AdvisorRequestMeta | null = null) {
  pending = { type: 'savings-goal-edit', meta }
  notify()
}

export function requestFixedExpenseEdit(
  fixedExpenseId: string,
  meta: AdvisorRequestMeta | null = null,
) {
  pending = { type: 'fixed-expense-edit', fixedExpenseId, meta }
  notify()
}

export function requestFixedExpenseAdd(
  amount: number | null,
  description: string | null,
  meta: AdvisorRequestMeta | null = null,
) {
  pending = { type: 'fixed-expense-add', amount, description, meta }
  notify()
}

export function clearPendingAdvisorAction() {
  if (pending === null) return
  pending = null
  notify()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot() {
  return pending
}

export function usePendingAdvisorAction(): AdvisorPendingAction | null {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

// ─── Nested-host claim ────────────────────────────────────────────
//
// The advisor action sheets (QuickAddSavings, MemberWarning) live
// inside `GlobalAdvisorActionHost`, mounted at the AppStackShell
// level so any tab can fire an action and see the sheet.
//
// Problem: when the user is on the Asistente screen — which is
// itself an expo-router stack-modal (`presentation: 'modal'`) — iOS
// does not reliably present another native `<Modal>` on top of the
// already-presented modal screen, and the sheet appears to "do
// nothing" from the user's perspective.
//
// Fix: the Asistente screen mounts its OWN copy of the sheets,
// claiming ownership through this counter. While `nestedClaims > 0`,
// the AppStackShell host skips rendering — leaving the inner host
// in charge so the modal opens within the asistente's view
// hierarchy. When the asistente unmounts (the user dismisses), the
// claim releases and the AppStackShell host takes over again.

let nestedClaims = 0
const nestedListeners = new Set<() => void>()

function notifyNested() {
  for (const listener of nestedListeners) listener()
}

export function claimNestedAdvisorHost(): () => void {
  nestedClaims += 1
  notifyNested()
  let released = false
  return () => {
    if (released) return
    released = true
    nestedClaims = Math.max(0, nestedClaims - 1)
    notifyNested()
  }
}

function subscribeNested(listener: () => void) {
  nestedListeners.add(listener)
  return () => {
    nestedListeners.delete(listener)
  }
}

function getNestedSnapshot() {
  return nestedClaims > 0
}

export function useHasNestedAdvisorHost(): boolean {
  return useSyncExternalStore(subscribeNested, getNestedSnapshot, getNestedSnapshot)
}

// ─── Mutual-exclusivity assertion ─────────────────────────────────
//
// Code review C4 (sprint A, 2026-06-08): el contrato del advisor host
// es que SÓLO un host activo (top-level o nested) renderice los sheets
// en un mismo punto en el tiempo. La gate `isActiveHost = isNested ||
// !hasNested` ya implementa eso. Esta sección suma un contador en
// memoria que cuenta cuántos hosts se consideran activos a la vez —
// si en dev (__DEV__) hay más de 1, tiramos un assertion ruidoso para
// pegar antes de shippear un regress que reintroduce el bug de
// doble-mount silencioso.

let activeHostCount = 0
let mutualExclusivityCheckTimer: ReturnType<typeof setTimeout> | null = null

export function registerActiveAdvisorHost(): () => void {
  activeHostCount += 1
  // Verificación diferida: cuando el nested host se monta + el top-level
  // sigue activo, hay 1-2 commits transient donde ambos están registrados
  // antes de que el top-level resuelva su step-aside via `useHasNestedAdvisorHost`.
  // La lógica de exclusión es correcta — el conflict transient es ruido.
  // El check diferido se cancela si el count baja a 1 antes del próximo tick,
  // y solo dispara assertion para un conflict real persistente.
  if (__DEV__ && activeHostCount > 1) {
    if (mutualExclusivityCheckTimer) clearTimeout(mutualExclusivityCheckTimer)
    mutualExclusivityCheckTimer = setTimeout(() => {
      mutualExclusivityCheckTimer = null
      if (activeHostCount > 1) {
        // eslint-disable-next-line no-console
        console.error(
          '[advisor-host] mutual exclusivity violated: ' +
            `${activeHostCount} active hosts detected. Sólo uno debe estar ` +
            'activo a la vez (top-level del shell o nested de Asistente). ' +
            'Revisar el gate `isActiveHost` y los unmounts.',
        )
      }
    }, 0)
  }
  let released = false
  return () => {
    if (released) return
    released = true
    activeHostCount = Math.max(0, activeHostCount - 1)
  }
}
