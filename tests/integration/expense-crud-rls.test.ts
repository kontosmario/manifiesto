/**
 * Integration test — Sprint B / B7:
 *
 * Cubre el CRUD de `expenses` ejercitando las policies RLS reales:
 *   - `expenses_select_members` (member-of-family)
 *   - `expenses_insert_active` (active member; created_by = auth.uid())
 *   - `expenses_update_members` (creator OR family owner)
 *   - `expenses_delete_members` (creator OR family owner) — fix 20260522
 *   - `is_family_member` hardened a `role <> 'blocked'`
 *
 * Pattern: 2 families seedeadas independientemente, agregamos un
 * member secundario a family A para cubrir el caso "otro member" y
 * un blocked member para el regression del CR v1 C1.
 *
 * Cada test ensucia rows nuevas en `expenses`; el cleanup borra las
 * 2 families (cascade limpia expenses) y los users efímeros.
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
const familiesToCleanup: SeededFamily[] = []
const extraUsersToCleanup: string[] = []

beforeAll(async () => {
  reachable = await isSupabaseLocalReachable()
})

afterEach(async () => {
  const admin = adminClient()
  for (const family of familiesToCleanup.splice(0)) {
    await cleanupFamily(family)
  }
  for (const userId of extraUsersToCleanup.splice(0)) {
    try {
      await admin.auth.admin.deleteUser(userId)
    } catch {
      /* idempotent */
    }
  }
})

/**
 * Agrega un user adicional a una family ya seedada con el rol que se
 * pase (default `member`). Devuelve userId + accessToken.
 */
async function addMember(
  familyId: string,
  role: 'member' | 'owner' | 'blocked' = 'member',
  emailPrefix = 'extra',
): Promise<{ userId: string; accessToken: string }> {
  const admin = adminClient()
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
  const email = `${emailPrefix}-${stamp}@manifiesto.test`
  const { data: signup, error: signupErr } =
    await admin.auth.admin.createUser({
      email,
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: `${emailPrefix} user` },
    })
  if (signupErr || !signup.user) {
    throw signupErr ?? new Error('createUser failed')
  }
  const userId = signup.user.id
  extraUsersToCleanup.push(userId)

  const { error: memberErr } = await admin
    .from('family_members')
    .insert({ family_id: familyId, user_id: userId, role })
  if (memberErr) throw memberErr

  const { data: session, error: signInErr } =
    await admin.auth.signInWithPassword({ email, password: TEST_PASSWORD })
  if (signInErr || !session.session) {
    throw signInErr ?? new Error('signIn failed')
  }
  return { userId, accessToken: session.session.access_token }
}

/** Lookup de un categoryId expense-scope de la family ya seedada. */
async function getExpenseCategoryId(familyId: string): Promise<string> {
  const admin = adminClient()
  const { data, error } = await admin
    .from('categories')
    .select('id')
    .eq('family_id', familyId)
    .eq('scope', 'expense')
    .limit(1)
    .single()
  if (error || !data) {
    throw error ?? new Error('no expense category found')
  }
  return (data as { id: string }).id
}

describe('expenses CRUD vs RLS — Sprint B (B7)', () => {
  it('CREATE: owner inserta expense propio (created_by = auth.uid())', async () => {
    if (!reachable) return
    const familyA = await seedMinimalFamily('-crud-a')
    familiesToCleanup.push(familyA)
    const categoryId = await getExpenseCategoryId(familyA.familyId)

    const client = userClient(familyA.ownerAccessToken)
    const { data, error } = await client
      .from('expenses')
      .insert({
        family_id: familyA.familyId,
        category_id: categoryId,
        description: 'Test gasto owner',
        price: 1234,
        created_by: familyA.ownerId,
      })
      .select('id')
      .single()
    expect(error).toBeNull()
    expect(data).not.toBeNull()

    // SELECT confirma que el owner lo ve
    const { data: rows, error: selErr } = await client
      .from('expenses')
      .select('id')
      .eq('id', (data as { id: string }).id)
    expect(selErr).toBeNull()
    expect((rows ?? []).length).toBe(1)
  })

  it('CREATE: insertar con family_id de OTRA family falla por RLS', async () => {
    if (!reachable) return
    const familyA = await seedMinimalFamily('-crud-cross-a')
    const familyB = await seedMinimalFamily('-crud-cross-b')
    familiesToCleanup.push(familyA, familyB)
    const categoryB = await getExpenseCategoryId(familyB.familyId)

    const clientA = userClient(familyA.ownerAccessToken)
    const { error } = await clientA
      .from('expenses')
      .insert({
        family_id: familyB.familyId, // ← OTHER family
        category_id: categoryB,
        description: 'Cross-family attack',
        price: 1,
        created_by: familyA.ownerId,
      })
      .select('id')
      .single()
    expect(error).not.toBeNull()
    // El insert puede rebotar por (a) RLS de expenses sobre family_id
    // ajeno, o (b) un trigger upstream que valida que category_id
    // pertenezca a la family del actor (defense-in-depth). Cualquiera
    // de los dos paths es válido — lo importante es que NO se cree
    // la fila cross-family.
    expect(error?.message ?? '').toMatch(
      /row-level security|policy|violates|category not found|not found/i,
    )
  })

  it('READ: user de family A NO ve expenses de family B', async () => {
    if (!reachable) return
    const familyA = await seedMinimalFamily('-read-a')
    const familyB = await seedMinimalFamily('-read-b')
    familiesToCleanup.push(familyA, familyB)

    // Sanity: familyB tiene 5 expenses seedeadas.
    const admin = adminClient()
    const { data: allB } = await admin
      .from('expenses')
      .select('id')
      .eq('family_id', familyB.familyId)
    expect((allB ?? []).length).toBeGreaterThan(0)

    // User de A intenta SELECT de B → 0 filas (RLS filtra).
    const clientA = userClient(familyA.ownerAccessToken)
    const { data, error } = await clientA
      .from('expenses')
      .select('id')
      .eq('family_id', familyB.familyId)
    expect(error).toBeNull()
    expect(data ?? []).toEqual([])
  })

  it('READ: blocked member NO ve expenses (regression CR v1 C1)', async () => {
    if (!reachable) return
    const family = await seedMinimalFamily('-read-blocked')
    familiesToCleanup.push(family)
    const blocked = await addMember(family.familyId, 'blocked', 'blocked')

    const clientB = userClient(blocked.accessToken)
    const { data, error } = await clientB
      .from('expenses')
      .select('id')
      .eq('family_id', family.familyId)
    expect(error).toBeNull()
    expect(data ?? []).toEqual([])
  })

  it('UPDATE: owner puede actualizar SU PROPIO expense', async () => {
    if (!reachable) return
    const family = await seedMinimalFamily('-upd-owner')
    familiesToCleanup.push(family)
    const categoryId = await getExpenseCategoryId(family.familyId)

    const admin = adminClient()
    const { data: ins } = await admin
      .from('expenses')
      .insert({
        family_id: family.familyId,
        category_id: categoryId,
        description: 'Orig',
        price: 100,
        created_by: family.ownerId,
      })
      .select('id')
      .single()
    const expenseId = (ins as { id: string }).id

    const client = userClient(family.ownerAccessToken)
    const { error } = await client
      .from('expenses')
      .update({ description: 'Updated', price: 200 })
      .eq('id', expenseId)
    expect(error).toBeNull()

    const { data: after } = await admin
      .from('expenses')
      .select('description, price')
      .eq('id', expenseId)
      .single()
    expect((after as { description: string }).description).toBe('Updated')
  })

  it('UPDATE: non-creator member NO puede actualizar expense ajena (fix 20260522)', async () => {
    if (!reachable) return
    const family = await seedMinimalFamily('-upd-cross')
    familiesToCleanup.push(family)
    const categoryId = await getExpenseCategoryId(family.familyId)
    // Member B (no owner) — solo debe poder editar lo suyo.
    const memberB = await addMember(family.familyId, 'member', 'member')

    const admin = adminClient()
    // Expense creado POR el OWNER (no por memberB)
    const { data: ins } = await admin
      .from('expenses')
      .insert({
        family_id: family.familyId,
        category_id: categoryId,
        description: 'Owner expense',
        price: 500,
        created_by: family.ownerId,
      })
      .select('id')
      .single()
    const expenseId = (ins as { id: string }).id

    const clientB = userClient(memberB.accessToken)
    const { error, data } = await clientB
      .from('expenses')
      .update({ description: 'Hijack!' })
      .eq('id', expenseId)
      .select('id')
    // RLS: el update no matchea filas (using clause falla) →
    // success status pero `data` vacío. No tiramos error.
    expect(error).toBeNull()
    expect((data ?? []).length).toBe(0)

    // Confirmamos que la descripción NO cambió.
    const { data: after } = await admin
      .from('expenses')
      .select('description')
      .eq('id', expenseId)
      .single()
    expect((after as { description: string }).description).toBe('Owner expense')
  })

  it('UPDATE: owner SÍ puede actualizar expense ajena (admin path)', async () => {
    if (!reachable) return
    const family = await seedMinimalFamily('-upd-admin')
    familiesToCleanup.push(family)
    const categoryId = await getExpenseCategoryId(family.familyId)
    const memberB = await addMember(family.familyId, 'member', 'memberadm')

    const admin = adminClient()
    // Expense creado por memberB
    const { data: ins } = await admin
      .from('expenses')
      .insert({
        family_id: family.familyId,
        category_id: categoryId,
        description: 'Member expense',
        price: 300,
        created_by: memberB.userId,
      })
      .select('id')
      .single()
    const expenseId = (ins as { id: string }).id

    // Owner usa el admin override (is_family_owner) para corregir.
    const ownerClient = userClient(family.ownerAccessToken)
    const { error } = await ownerClient
      .from('expenses')
      .update({ description: 'Owner cleanup' })
      .eq('id', expenseId)
    expect(error).toBeNull()

    const { data: after } = await admin
      .from('expenses')
      .select('description')
      .eq('id', expenseId)
      .single()
    expect((after as { description: string }).description).toBe('Owner cleanup')
  })

  it('DELETE: creator borra su propio expense (hard-delete)', async () => {
    if (!reachable) return
    const family = await seedMinimalFamily('-del-self')
    familiesToCleanup.push(family)
    const categoryId = await getExpenseCategoryId(family.familyId)

    const admin = adminClient()
    const { data: ins } = await admin
      .from('expenses')
      .insert({
        family_id: family.familyId,
        category_id: categoryId,
        description: 'To delete',
        price: 1,
        created_by: family.ownerId,
      })
      .select('id')
      .single()
    const expenseId = (ins as { id: string }).id

    const client = userClient(family.ownerAccessToken)
    const { error } = await client.from('expenses').delete().eq('id', expenseId)
    expect(error).toBeNull()

    // Hard-delete: no debería existir más
    const { data: after } = await admin
      .from('expenses')
      .select('id')
      .eq('id', expenseId)
    expect((after ?? []).length).toBe(0)
  })

  it('DELETE: non-creator member NO puede borrar expense ajena', async () => {
    if (!reachable) return
    const family = await seedMinimalFamily('-del-cross')
    familiesToCleanup.push(family)
    const categoryId = await getExpenseCategoryId(family.familyId)
    const memberB = await addMember(family.familyId, 'member', 'memberdel')

    const admin = adminClient()
    const { data: ins } = await admin
      .from('expenses')
      .insert({
        family_id: family.familyId,
        category_id: categoryId,
        description: 'Owner expense',
        price: 999,
        created_by: family.ownerId,
      })
      .select('id')
      .single()
    const expenseId = (ins as { id: string }).id

    const clientB = userClient(memberB.accessToken)
    const { error, data } = await clientB
      .from('expenses')
      .delete()
      .eq('id', expenseId)
      .select('id')
    // RLS: matchea 0 rows; no error pero no borra.
    expect(error).toBeNull()
    expect((data ?? []).length).toBe(0)

    const { data: still } = await admin
      .from('expenses')
      .select('id')
      .eq('id', expenseId)
    expect((still ?? []).length).toBe(1)
  })

  it('BULK INSERT: 50 expenses en serie no rate-limita (path no-RPC)', async () => {
    if (!reachable) return
    // Sprint B agregó rate-limits a RPCs sensibles; los INSERT directos
    // a `expenses` NO deberían tener rate-limit (caen al path mutación
    // normal de PostgREST). Verificamos un volumen razonable.
    const family = await seedMinimalFamily('-bulk')
    familiesToCleanup.push(family)
    const categoryId = await getExpenseCategoryId(family.familyId)

    const client = userClient(family.ownerAccessToken)
    const rows = Array.from({ length: 50 }, (_, i) => ({
      family_id: family.familyId,
      category_id: categoryId,
      description: `Bulk ${i}`,
      price: 10 + i,
      created_by: family.ownerId,
    }))
    const { data, error } = await client
      .from('expenses')
      .insert(rows)
      .select('id')
    expect(error).toBeNull()
    expect((data ?? []).length).toBe(50)
  })
})
