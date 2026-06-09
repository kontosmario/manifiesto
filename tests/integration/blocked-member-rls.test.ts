/**
 * Integration test — Sprint B / Code review v2 cross L3:
 *
 * El rol `blocked` en `family_members` debe negar acceso completo a
 * datos de la family. Verificamos dos pathways representativos:
 *
 *   1. SELECT sobre `expenses` vía RLS (helper `is_family_member`
 *      hardened en 20260608100000_harden_is_family_member.sql).
 *   2. RPC `record_fixed_expense_payment` (membership check inline,
 *      hardened en 20260608110000_harden_fixed_payment_blocked_filter.sql).
 *
 * Pattern: seed family + owner, agregar un segundo user marcado como
 * blocked, sign-in con ese user y verificar que las dos surface
 * fallan / devuelven vacío.
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

/**
 * Crea un user adicional, lo agrega a la family con rol `blocked` y
 * devuelve su access token. Cleanup se encarga via extraUsersToCleanup.
 */
async function addBlockedMember(
  familyId: string,
): Promise<{ userId: string; accessToken: string }> {
  const admin = adminClient()
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
  const email = `blocked-${stamp}@manifiesto.test`
  const { data: signup, error: signupErr } =
    await admin.auth.admin.createUser({
      email,
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: 'Blocked User' },
    })
  if (signupErr || !signup.user) {
    throw signupErr ?? new Error('createUser returned no user')
  }
  const userId = signup.user.id
  extraUsersToCleanup.push(userId)

  const { error: memberErr } = await admin
    .from('family_members')
    .insert({ family_id: familyId, user_id: userId, role: 'blocked' })
  if (memberErr) throw memberErr

  const { data: session, error: signInErr } =
    await admin.auth.signInWithPassword({ email, password: TEST_PASSWORD })
  if (signInErr || !session.session) {
    throw signInErr ?? new Error('signInWithPassword returned no session')
  }
  return { userId, accessToken: session.session.access_token }
}

describe('blocked member RLS — Sprint B', () => {
  it('blocked role no puede SELECT expenses de la family', async () => {
    if (!reachable) return
    const family = await seedMinimalFamily('owner')
    lastSeeded = family
    const blocked = await addBlockedMember(family.familyId)

    // Sanity: el owner SÍ ve las 5 expenses seeded.
    const ownerClient = userClient(family.ownerAccessToken)
    const ownerRes = await ownerClient
      .from('expenses')
      .select('id')
      .eq('family_id', family.familyId)
    expect(ownerRes.error).toBeNull()
    expect((ownerRes.data ?? []).length).toBeGreaterThan(0)

    // Blocked user: RLS le devuelve 0 filas (el helper
    // `is_family_member` filtra role <> 'blocked').
    const blockedClient = userClient(blocked.accessToken)
    const blockedRes = await blockedClient
      .from('expenses')
      .select('id')
      .eq('family_id', family.familyId)
    expect(blockedRes.error).toBeNull()
    expect(blockedRes.data ?? []).toEqual([])
  })

  it('blocked role no puede llamar record_fixed_expense_payment', async () => {
    if (!reachable) return
    const family = await seedMinimalFamily('owner-fijo')
    lastSeeded = family
    const blocked = await addBlockedMember(family.familyId)

    const admin = adminClient()
    // Resolver el fixed_expense seeded + asignarle una category_id
    // (record_fixed_expense_payment exige category_id non-null).
    const { data: fijoRow, error: fijoErr } = await admin
      .from('fixed_expenses')
      .select('id')
      .eq('family_id', family.familyId)
      .limit(1)
      .single()
    expect(fijoErr).toBeNull()
    const fixedExpenseId = (fijoRow as { id: string }).id

    const { data: catRow, error: catErr } = await admin
      .from('categories')
      .insert({
        family_id: family.familyId,
        name: 'Fijos test',
        scope: 'fixed_expense',
      })
      .select('id')
      .single()
    expect(catErr).toBeNull()
    const categoryId = (catRow as { id: string }).id

    await admin
      .from('fixed_expenses')
      .update({ category_id: categoryId })
      .eq('id', fixedExpenseId)

    // Blocked user llama la RPC → RAISE 'No tenés permisos…'.
    const blockedClient = userClient(blocked.accessToken)
    const { error } = await blockedClient.rpc('record_fixed_expense_payment', {
      p_fixed_expense_id: fixedExpenseId,
    })
    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/permisos|permission|blocked/i)
  })
})
