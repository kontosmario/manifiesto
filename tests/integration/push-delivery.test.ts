/**
 * Integration test — Sprint B / B8:
 *
 * Cubre el data-layer de push notifications. La entrega real a APNs
 * vía Expo Push API no se testea (requiere device físico + APNs key
 * en prod), pero sí los pre-requisitos de DB que el edge function
 * `send-family-push` depende:
 *
 *   1. INSERT de subscription respeta RLS (user_id = auth.uid()).
 *   2. Reuso del endpoint con mismo (user_id, endpoint) hace UPSERT
 *      (constraint `unique (user_id, endpoint)`).
 *   3. RLS lee solo subscriptions propias (`push_subscriptions_select_own`).
 *   4. removeSubscription (mock del path DeviceNotRegistered) — service
 *      role borra la row.
 *   5. SELECT del send-family-push filtra `neq('user_id', actorUserId)`
 *      (el caller no recibe push de sí mismo): smoke test de la query.
 *
 * No hay `register_push_subscription` RPC en el codebase — el A7
 * shipped usa upsert directo desde el client (decisión documentada en
 * el execution plan). Este test refleja ese path real.
 *
 * Para invocar el edge function en CI haría falta `supabase functions
 * serve` corriendo con Deno; lo dejamos out-of-scope: el index.test.ts
 * del function ya cubre el handler unit-level, y este test cubre la
 * capa de DB. End-to-end con APNs requiere build + key.
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import {
  adminClient,
  isSupabaseLocalReachable,
  userClient,
} from './_helpers/supabase-test-client'
import {
  cleanupFamily,
  seedMinimalFamily,
  type SeededFamily,
} from './_helpers/seed'

let reachable = false
const familiesToCleanup: SeededFamily[] = []

beforeAll(async () => {
  reachable = await isSupabaseLocalReachable()
})

afterEach(async () => {
  for (const family of familiesToCleanup.splice(0)) {
    await cleanupFamily(family)
  }
})

function fakeExpoToken(): string {
  const stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  return `ExponentPushToken[${stamp}]`
}

describe('push notifications data layer — Sprint B (B8)', () => {
  it('INSERT respeta RLS: user puede crear subscription para SÍ MISMO', async () => {
    if (!reachable) return
    const family = await seedMinimalFamily('-push-insert')
    familiesToCleanup.push(family)

    const client = userClient(family.ownerAccessToken)
    const endpoint = fakeExpoToken()
    const { data, error } = await client
      .from('push_subscriptions')
      .insert({
        family_id: family.familyId,
        user_id: family.ownerId,
        provider: 'expo',
        endpoint,
        p256dh: 'expo',
        auth: 'expo',
      })
      .select('id')
      .single()
    expect(error).toBeNull()
    expect(data).not.toBeNull()
  })

  it('INSERT bloquea subscription para OTRO user_id (RLS check)', async () => {
    if (!reachable) return
    const family = await seedMinimalFamily('-push-other')
    familiesToCleanup.push(family)
    const admin = adminClient()

    // Creamos un user fantasma — el owner no debería poder asociarle
    // una subscription.
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
    const { data: ghost } = await admin.auth.admin.createUser({
      email: `ghost-${stamp}@manifiesto.test`,
      password: 'test1234!',
      email_confirm: true,
    })
    const ghostId = ghost.user!.id

    try {
      const client = userClient(family.ownerAccessToken)
      const { error } = await client
        .from('push_subscriptions')
        .insert({
          family_id: family.familyId,
          user_id: ghostId, // ← NOT auth.uid()
          provider: 'expo',
          endpoint: fakeExpoToken(),
          p256dh: 'expo',
          auth: 'expo',
        })
        .select('id')
        .single()
      expect(error).not.toBeNull()
      expect(error?.message ?? '').toMatch(/row-level security|policy|violates/i)
    } finally {
      try {
        await admin.auth.admin.deleteUser(ghostId)
      } catch {
        /* idempotent */
      }
    }
  })

  it('UPSERT (user_id, endpoint) reusa row existente — no duplica', async () => {
    if (!reachable) return
    const family = await seedMinimalFamily('-push-upsert')
    familiesToCleanup.push(family)
    const endpoint = fakeExpoToken()

    const client = userClient(family.ownerAccessToken)
    // Primer insert
    const { error: e1 } = await client.from('push_subscriptions').upsert(
      {
        family_id: family.familyId,
        user_id: family.ownerId,
        provider: 'expo',
        endpoint,
        p256dh: 'expo',
        auth: 'expo',
      },
      { onConflict: 'user_id,endpoint' },
    )
    expect(e1).toBeNull()

    // Re-upsert mismo (user_id, endpoint) — actualiza la row
    // (mantiene id, refresca updated_at). El comportamiento del path
    // de A7 usa upsert idempotente en cada mount.
    const { error: e2 } = await client.from('push_subscriptions').upsert(
      {
        family_id: family.familyId,
        user_id: family.ownerId,
        provider: 'expo',
        endpoint,
        p256dh: 'expo',
        auth: 'expo',
      },
      { onConflict: 'user_id,endpoint' },
    )
    expect(e2).toBeNull()

    // Verificamos count — debería ser exactamente 1 row.
    const admin = adminClient()
    const { data: rows, error: selErr } = await admin
      .from('push_subscriptions')
      .select('id')
      .eq('user_id', family.ownerId)
      .eq('endpoint', endpoint)
    expect(selErr).toBeNull()
    expect((rows ?? []).length).toBe(1)
  })

  it('SELECT solo devuelve subscriptions del propio user (hardening 20260510)', async () => {
    if (!reachable) return
    const family = await seedMinimalFamily('-push-select')
    familiesToCleanup.push(family)
    const admin = adminClient()

    // Subscription propia
    const ownEndpoint = fakeExpoToken()
    await admin.from('push_subscriptions').insert({
      family_id: family.familyId,
      user_id: family.ownerId,
      provider: 'expo',
      endpoint: ownEndpoint,
      p256dh: 'expo',
      auth: 'expo',
    })

    // Subscription de otro user en la misma family — el owner NO debe
    // verla (la policy `push_subscriptions_select_own` solo permite
    // own; el path del edge function usa service-role para fanout).
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
    const { data: other } = await admin.auth.admin.createUser({
      email: `other-${stamp}@manifiesto.test`,
      password: 'test1234!',
      email_confirm: true,
    })
    const otherId = other.user!.id
    await admin
      .from('family_members')
      .insert({ family_id: family.familyId, user_id: otherId, role: 'member' })
    await admin.from('push_subscriptions').insert({
      family_id: family.familyId,
      user_id: otherId,
      provider: 'expo',
      endpoint: fakeExpoToken(),
      p256dh: 'expo',
      auth: 'expo',
    })

    try {
      const client = userClient(family.ownerAccessToken)
      const { data, error } = await client
        .from('push_subscriptions')
        .select('id, user_id, endpoint')
      expect(error).toBeNull()
      const ids = (data ?? []).map((r: { user_id: string }) => r.user_id)
      expect(ids).toContain(family.ownerId)
      expect(ids).not.toContain(otherId)
    } finally {
      try {
        await admin.auth.admin.deleteUser(otherId)
      } catch {
        /* idempotent */
      }
    }
  })

  it('removeSubscription path (DeviceNotRegistered): service-role borra row by id', async () => {
    if (!reachable) return
    // Smoke del path que el edge function ejecuta al recibir
    // `DeviceNotRegistered` de Expo: `delete().eq('id', ...)` con
    // service-role. Verificamos que el delete funciona y la row
    // desaparece.
    const family = await seedMinimalFamily('-push-remove')
    familiesToCleanup.push(family)

    const admin = adminClient()
    const endpoint = fakeExpoToken()
    const { data: ins, error: insErr } = await admin
      .from('push_subscriptions')
      .insert({
        family_id: family.familyId,
        user_id: family.ownerId,
        provider: 'expo',
        endpoint,
        p256dh: 'expo',
        auth: 'expo',
      })
      .select('id')
      .single()
    expect(insErr).toBeNull()
    const subscriptionId = (ins as { id: string }).id

    // El edge function llama: adminClient.from('push_subscriptions').delete().eq('id', subscriptionId)
    const { error: delErr } = await admin
      .from('push_subscriptions')
      .delete()
      .eq('id', subscriptionId)
    expect(delErr).toBeNull()

    const { data: after } = await admin
      .from('push_subscriptions')
      .select('id')
      .eq('id', subscriptionId)
    expect((after ?? []).length).toBe(0)
  })

  it('fan-out query (edge function): admin filtra family_id + neq user_id', async () => {
    if (!reachable) return
    // Smoke test de la query que `send-family-push` ejecuta para
    // obtener targets: trae todas las subs de la family EXCEPTO las
    // del caller. Esto evita auto-push al actor.
    const family = await seedMinimalFamily('-push-fanout')
    familiesToCleanup.push(family)
    const admin = adminClient()

    // Subscription del owner (sender) — NO debería matchear
    await admin.from('push_subscriptions').insert({
      family_id: family.familyId,
      user_id: family.ownerId,
      provider: 'expo',
      endpoint: fakeExpoToken(),
      p256dh: 'expo',
      auth: 'expo',
    })

    // Otro member con subscription — SÍ debería matchear
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
    const { data: peer } = await admin.auth.admin.createUser({
      email: `peer-${stamp}@manifiesto.test`,
      password: 'test1234!',
      email_confirm: true,
    })
    const peerId = peer.user!.id
    await admin
      .from('family_members')
      .insert({ family_id: family.familyId, user_id: peerId, role: 'member' })
    await admin.from('push_subscriptions').insert({
      family_id: family.familyId,
      user_id: peerId,
      provider: 'expo',
      endpoint: fakeExpoToken(),
      p256dh: 'expo',
      auth: 'expo',
    })

    try {
      const { data, error } = await admin
        .from('push_subscriptions')
        .select('id, user_id, endpoint, p256dh, auth')
        .eq('family_id', family.familyId)
        .neq('user_id', family.ownerId)
      expect(error).toBeNull()
      const userIds = (data ?? []).map((r: { user_id: string }) => r.user_id)
      expect(userIds).toEqual([peerId])
    } finally {
      try {
        await admin.auth.admin.deleteUser(peerId)
      } catch {
        /* idempotent */
      }
    }
  })

  it.todo(
    'end-to-end APNs delivery (requiere supabase functions serve + APNs key + device físico)',
  )
})
