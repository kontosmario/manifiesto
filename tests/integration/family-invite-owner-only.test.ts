/**
 * Integration test — `create_family_invite` es OWNER-ONLY.
 *
 * Audit de seguridad 2026-06-30 (migración 20260630060000_invite_owner_only.sql):
 * antes cualquier miembro activo podía generar invites; ahora solo el dueño.
 * El cliente (settings-screen) además oculta la fila "Invitar" a los no-dueños.
 *
 *   1. El dueño (familia bajo el cap del plan) genera un código.
 *   2. Un miembro no-dueño recibe error owner-only (el gate corre ANTES del
 *      cap check, así que da igual cuántos miembros haya).
 *
 * Pattern (espejo de blocked-member-rls.test.ts): seed family + owner, agregar
 * un segundo user como `member`, sign-in y verificar el gate.
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

const TEST_PASSWORD = 'test1234!'
let reachable = false
let lastSeeded: SeededFamily | null = null
const extraUsersToCleanup: string[] = []

beforeAll(async () => {
  reachable = await isSupabaseLocalReachable()
})

afterEach(async () => {
  const admin = adminClient()
  for (const userId of extraUsersToCleanup.splice(0)) {
    try {
      await admin.auth.admin.deleteUser(userId)
    } catch {
      /* idempotent */
    }
  }
  if (lastSeeded) {
    await cleanupFamily(lastSeeded)
    lastSeeded = null
  }
})

/** Crea un user adicional, lo agrega como `member` (NO blocked) y devuelve su token. */
async function addRegularMember(
  familyId: string,
): Promise<{ userId: string; accessToken: string }> {
  const admin = adminClient()
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
  const email = `member-${stamp}@manifiesto.test`
  const { data: signup, error: signupErr } =
    await admin.auth.admin.createUser({
      email,
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: 'Regular Member' },
    })
  if (signupErr || !signup.user) {
    throw signupErr ?? new Error('createUser returned no user')
  }
  const userId = signup.user.id
  extraUsersToCleanup.push(userId)

  const { error: memberErr } = await admin
    .from('family_members')
    .insert({ family_id: familyId, user_id: userId, role: 'member' })
  if (memberErr) throw memberErr

  const { data: session, error: signInErr } =
    await admin.auth.signInWithPassword({ email, password: TEST_PASSWORD })
  if (signInErr || !session.session) {
    throw signInErr ?? new Error('signInWithPassword returned no session')
  }
  return { userId, accessToken: session.session.access_token }
}

describe('create_family_invite owner-only — audit 2026-06-30', () => {
  it('el dueño (familia bajo el cap) genera un invite', async () => {
    if (!reachable) return
    const family = await seedMinimalFamily('owner')
    lastSeeded = family

    const ownerClient = userClient(family.ownerAccessToken)
    const { data, error } = await ownerClient.rpc('create_family_invite')
    expect(error).toBeNull()
    const row = Array.isArray(data) ? data[0] : data
    expect((row as { code?: string } | null)?.code).toBeTruthy()
  })

  it('un miembro no-dueño NO puede invitar (owner-only)', async () => {
    if (!reachable) return
    const family = await seedMinimalFamily('owner')
    lastSeeded = family
    const member = await addRegularMember(family.familyId)

    const memberClient = userClient(member.accessToken)
    const { error } = await memberClient.rpc('create_family_invite')
    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/dueño|owner/i)
  })
})
