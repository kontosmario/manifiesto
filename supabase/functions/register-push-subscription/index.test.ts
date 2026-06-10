// Deno tests for register-push-subscription. Covers the public auth
// gate + format validation. Closes regression risk for F4 (red-team
// audit 2026-06-10) — direct client upsert to push_subscriptions.
//
// Run with: `cd supabase/functions/register-push-subscription && deno test`

import { assertEquals } from 'jsr:@std/assert@1'

Deno.env.set('SUPABASE_URL', 'https://test.supabase.co')
Deno.env.set('SUPABASE_ANON_KEY', 'anon-key-fake')
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'service-role-fake-12345')

async function getHandler(): Promise<(r: Request) => Promise<Response>> {
  const mod = await import('./index.ts')
  const handler = (mod as unknown as { handler?: (r: Request) => Promise<Response> }).handler
  if (typeof handler !== 'function') {
    throw new Error('handler not exported from index.ts — smoke tests cannot run')
  }
  return handler
}

Deno.test('rejects OPTIONS preflight from unknown origin without echoing', async () => {
  const handler = await getHandler()
  const res = await handler(new Request('http://localhost', {
    method: 'OPTIONS',
    headers: { origin: 'https://evil.example.com' },
  }))
  assertEquals(res.status, 200)
  assertEquals(res.headers.get('Access-Control-Allow-Origin'), '')
})

Deno.test('echoes Access-Control-Allow-Origin for production site', async () => {
  const handler = await getHandler()
  const res = await handler(new Request('http://localhost', {
    method: 'OPTIONS',
    headers: { origin: 'https://manifiestoapp.com' },
  }))
  assertEquals(res.status, 200)
  assertEquals(res.headers.get('Access-Control-Allow-Origin'), 'https://manifiestoapp.com')
})

Deno.test('rejects non-POST (405)', async () => {
  const handler = await getHandler()
  const res = await handler(new Request('http://localhost', { method: 'GET' }))
  assertEquals(res.status, 405)
})

Deno.test('rejects invalid JSON (400)', async () => {
  const handler = await getHandler()
  const res = await handler(new Request('http://localhost', {
    method: 'POST',
    body: 'not json',
    headers: { Authorization: 'Bearer some-jwt' },
  }))
  assertEquals(res.status, 400)
})

Deno.test('rejects missing token field (400)', async () => {
  const handler = await getHandler()
  const res = await handler(new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify({}),
    headers: { Authorization: 'Bearer some-jwt' },
  }))
  assertEquals(res.status, 400)
})

Deno.test('rejects expo provider with non-expo token format (400)', async () => {
  const handler = await getHandler()
  const res = await handler(new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify({ token: 'arbitrary-garbage', provider: 'expo' }),
    headers: { Authorization: 'Bearer some-jwt' },
  }))
  assertEquals(res.status, 400)
})

Deno.test('rejects POST without Authorization header (401)', async () => {
  const handler = await getHandler()
  const res = await handler(new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify({ token: 'ExponentPushToken[abc]' }),
  }))
  assertEquals(res.status, 401)
})

Deno.test('rejects POST with invalid bearer (401)', async () => {
  // The supabase-js client will call auth.getUser() and fail because
  // the test env has no real Supabase. The handler should treat any
  // failure as 401, never leak a stack trace.
  const handler = await getHandler()
  const res = await handler(new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify({ token: 'ExponentPushToken[abc]' }),
    headers: { Authorization: 'Bearer fake-jwt-token' },
  }))
  // 401 (auth.getUser rejects) is the expected branch.
  assertEquals(res.status, 401)
})
