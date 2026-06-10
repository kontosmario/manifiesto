// Deno test for the service-role gate on send-family-push
// messages[] branch. Closes regression risk for 0007d76 + 430003a.

import { assertEquals } from 'jsr:@std/assert@1'

Deno.env.set('SUPABASE_URL', 'https://test.supabase.co')
Deno.env.set('SUPABASE_ANON_KEY', 'anon-key-fake')
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'service-role-fake-12345')
Deno.env.set('WEB_PUSH_VAPID_PUBLIC_KEY', '')
Deno.env.set('WEB_PUSH_VAPID_PRIVATE_KEY', '')

async function getHandler(): Promise<(r: Request) => Promise<Response>> {
  const mod = await import('./index.ts')
  const handler = (mod as unknown as { handler?: (r: Request) => Promise<Response> }).handler
  // Fail loudly: if a future refactor un-exports the handler, the
  // gate becomes untestable from this file and the regression
  // these tests were written to catch (auth-bypass on messages[])
  // would silently re-open. Throw instead of return so the test
  // suite fails visibly.
  if (typeof handler !== 'function') {
    throw new Error('handler not exported from index.ts — smoke tests cannot run')
  }
  return handler
}

Deno.test('messages[] rejects no-bearer (401)', async () => {
  const handler = await getHandler()
  const res = await handler(new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify({ messages: [{ to: 'ExponentPushToken[x]', title: 't', body: 'b' }] }),
  }))
  assertEquals(res.status, 401)
})

Deno.test('messages[] rejects anon bearer (401)', async () => {
  const handler = await getHandler()
  const res = await handler(new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify({ messages: [{ to: 'ExponentPushToken[x]', title: 't', body: 'b' }] }),
    headers: { Authorization: 'Bearer anon-key-fake' },
  }))
  assertEquals(res.status, 401)
})

Deno.test('non-batch path missing bearer rejected (401)', async () => {
  // F6 follow-up: ensure the non-batch (familyId) path still requires
  // a bearer token. Smoke check for the auth gate landing before any
  // rate-limit / membership work.
  const handler = await getHandler()
  const res = await handler(new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify({ familyId: '00000000-0000-0000-0000-000000000000', title: 'hi' }),
  }))
  assertEquals(res.status, 401)
})

Deno.test('CORS preflight echoes allowed origin', async () => {
  const handler = await getHandler()
  const res = await handler(new Request('http://localhost', {
    method: 'OPTIONS',
    headers: { origin: 'https://manifiestoapp.com' },
  }))
  assertEquals(res.headers.get('Access-Control-Allow-Origin'), 'https://manifiestoapp.com')
})

Deno.test('CORS preflight blocks unknown origin', async () => {
  const handler = await getHandler()
  const res = await handler(new Request('http://localhost', {
    method: 'OPTIONS',
    headers: { origin: 'https://evil.example.com' },
  }))
  assertEquals(res.headers.get('Access-Control-Allow-Origin'), '')
})
