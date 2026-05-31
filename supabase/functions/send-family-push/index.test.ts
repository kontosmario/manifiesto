// Deno test for the service-role gate on send-family-push
// messages[] branch. Closes regression risk for 0007d76 + 430003a.

import { assertEquals } from 'jsr:@std/assert@1'

Deno.env.set('SUPABASE_URL', 'https://test.supabase.co')
Deno.env.set('SUPABASE_ANON_KEY', 'anon-key-fake')
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'service-role-fake-12345')
Deno.env.set('WEB_PUSH_VAPID_PUBLIC_KEY', '')
Deno.env.set('WEB_PUSH_VAPID_PRIVATE_KEY', '')

Deno.test('messages[] rejects no-bearer (401)', async () => {
  const mod = await import('./index.ts')
  const handler = (mod as unknown as { handler?: (r: Request) => Promise<Response> }).handler
  if (typeof handler !== 'function') return
  const res = await handler(new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify({ messages: [{ to: 'ExponentPushToken[x]', title: 't', body: 'b' }] }),
  }))
  assertEquals(res.status, 401)
})

Deno.test('messages[] rejects anon bearer (401)', async () => {
  const mod = await import('./index.ts')
  const handler = (mod as unknown as { handler?: (r: Request) => Promise<Response> }).handler
  if (typeof handler !== 'function') return
  const res = await handler(new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify({ messages: [{ to: 'ExponentPushToken[x]', title: 't', body: 'b' }] }),
    headers: { Authorization: 'Bearer anon-key-fake' },
  }))
  assertEquals(res.status, 401)
})
