import { createClient } from '@supabase/supabase-js'

const url = process.env.EXPO_PUBLIC_SUPABASE_URL
const anon = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY

const client = createClient(url, anon, { auth: { persistSession: false } })
const { data: auth, error: authErr } = await client.auth.signInWithPassword({
  email: 'kontosmario@gmail.com',
  password: 'marito78',
})
if (authErr) { console.error('auth error', authErr); process.exit(1) }
const userId = auth.user.id

// Find family
const { data: fm } = await client.from('family_members').select('family_id').eq('user_id', userId).maybeSingle()
const familyId = fm.family_id

// Grab a fixed_expense category id (Servicios)
const { data: cats } = await client
  .from('categories')
  .select('id, name, scope')
  .eq('family_id', familyId)
  .eq('scope', 'fixed_expense')
const cuotasCat = cats.find((c) => c.name === 'Cuotas')
const serviciosCat = cats.find((c) => c.name === 'Servicios')

console.log('--- CASE 1: recurring monthly fijo (AddFijoV2 default flow) ---')
const recurringPayload = {
  family_id: familyId,
  amount: 9999,
  category_id: serviciosCat.id,
  day_of_month: 17,
  ends_on: null,
  frequency: 'monthly',
  installments_paid: 0,
  installments_total: null,
  kind: 'recurring',
  lender_name: null,
  name: 'TEST recurring v2',
  next_due_on: '2026-05-17',
  notes: null,
  remaining_balance: null,
  status: 'active',
}
const r1 = await client.from('fixed_expenses').insert(recurringPayload).select('*').single()
console.log('insert error:', r1.error)
if (r1.data) {
  console.log('stored:', {
    id: r1.data.id,
    name: r1.data.name,
    amount: r1.data.amount,
    kind: r1.data.kind,
    frequency: r1.data.frequency,
    day_of_month: r1.data.day_of_month,
    next_due_on: r1.data.next_due_on,
    installments_total: r1.data.installments_total,
    installments_paid: r1.data.installments_paid,
    status: r1.data.status,
    category_id: r1.data.category_id,
  })
}

console.log('\n--- CASE 2: cuotas (installment → kind=installment, freq=monthly, total=12) ---')
const installmentPayload = {
  family_id: familyId,
  amount: 52000,
  category_id: cuotasCat.id,
  day_of_month: 20,
  ends_on: null,
  frequency: 'monthly',
  installments_paid: 0,
  installments_total: 12,
  kind: 'installment',
  lender_name: null,
  name: 'TEST cuotas iPhone v2',
  next_due_on: '2026-05-20',
  notes: null,
  remaining_balance: null,
  status: 'active',
}
const r2 = await client.from('fixed_expenses').insert(installmentPayload).select('*').single()
console.log('insert error:', r2.error)
if (r2.data) {
  console.log('stored:', {
    id: r2.data.id,
    name: r2.data.name,
    amount: r2.data.amount,
    kind: r2.data.kind,
    frequency: r2.data.frequency,
    day_of_month: r2.data.day_of_month,
    next_due_on: r2.data.next_due_on,
    installments_total: r2.data.installments_total,
    installments_paid: r2.data.installments_paid,
    status: r2.data.status,
    category_id: r2.data.category_id,
  })
}

console.log('\n--- CASE 3: cycle roll — record payment on recurring to verify day_of_month anchor survives ---')
if (r1.data) {
  const rpc = await client.rpc('record_fixed_expense_payment', { p_fixed_expense_id: r1.data.id })
  console.log('rpc error:', rpc.error)
  const { data: after } = await client.from('fixed_expenses').select('next_due_on, day_of_month, last_paid_at, installments_paid, status').eq('id', r1.data.id).single()
  console.log('after payment:', after)
}

console.log('\n--- CASE 4: record payment on installment, confirm installments_paid=1 ---')
if (r2.data) {
  const rpc = await client.rpc('record_fixed_expense_payment', { p_fixed_expense_id: r2.data.id })
  console.log('rpc error:', rpc.error)
  const { data: after } = await client.from('fixed_expenses').select('next_due_on, day_of_month, last_paid_at, installments_paid, installments_total, status').eq('id', r2.data.id).single()
  console.log('after payment:', after)
}

console.log('\n--- CLEANUP ---')
if (r1.data) await client.from('fixed_expenses').delete().eq('id', r1.data.id)
if (r2.data) await client.from('fixed_expenses').delete().eq('id', r2.data.id)
console.log('cleanup done')
