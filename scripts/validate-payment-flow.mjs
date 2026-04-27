import { createClient } from '@supabase/supabase-js'

const url = process.env.EXPO_PUBLIC_SUPABASE_URL
const anon = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
const client = createClient(url, anon, { auth: { persistSession: false } })
const { data: auth } = await client.auth.signInWithPassword({
  email: 'kontosmario@gmail.com',
  password: 'marito78',
})
const userId = auth.user.id
const { data: fm } = await client.from('family_members').select('family_id').eq('user_id', userId).maybeSingle()
const familyId = fm.family_id

// Find fijos category
const { data: cats } = await client.from('categories').select('id').eq('family_id', familyId).eq('scope', 'fixed_expense').eq('name', 'Servicios').maybeSingle()

// Create throwaway fijo
const { data: fijo } = await client.from('fixed_expenses').insert({
  family_id: familyId,
  name: 'TEST payment flow',
  amount: 10000,
  category_id: cats.id,
  day_of_month: 15,
  frequency: 'monthly',
  kind: 'recurring',
  status: 'active',
  next_due_on: '2026-04-15',
}).select('*').single()

const fijoId = fijo.id
console.log('created fijo', fijoId, 'period should be 2026-04-01')

// Record payment
const { data: rpcData, error: rpcErr } = await client.rpc('record_fixed_expense_payment', {
  p_fixed_expense_id: fijoId,
})
console.log('rpc error:', rpcErr, 'expense id:', rpcData)

// Verify fixed_expense_payments row
const { data: pays } = await client.from('fixed_expense_payments').select('*').eq('fixed_expense_id', fijoId)
console.log('payments rows:', pays)

// Verify fijo advanced
const { data: after } = await client.from('fixed_expenses').select('next_due_on, last_paid_at, status').eq('id', fijoId).single()
console.log('fijo after:', after)

// Cleanup
await client.from('fixed_expenses').delete().eq('id', fijoId)
console.log('cleaned up')
