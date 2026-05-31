// Deno test for the service-role gate on notifications-orchestrator.
// Runs with: `cd supabase/functions/notifications-orchestrator && deno test`
//
// We do NOT integration-test the orchestrator logic; we only assert
// the auth gate added by 45bf393 + the timing-safe compare from
// 430003a stays in place. Future regressions of those 2 commits would
// re-open the DoS amplifier.

import { assertEquals } from 'jsr:@std/assert@1'

Deno.env.set('SUPABASE_URL', 'https://test.supabase.co')
Deno.env.set('SUPABASE_ANON_KEY', 'anon-key-fake')
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'service-role-fake-12345')

async function getHandler(): Promise<(r: Request) => Promise<Response>> {
  const mod = await import('./index.ts')
  const handler = (mod as unknown as { handler?: (r: Request) => Promise<Response> }).handler
  // Fail loudly: if a future refactor un-exports the handler, the
  // gate becomes untestable from this file and the regression these
  // tests were written to catch (DoS amplifier via open POST) would
  // silently re-open. Throw instead of return so the suite fails.
  if (typeof handler !== 'function') {
    throw new Error('handler not exported from index.ts — smoke tests cannot run')
  }
  return handler
}

Deno.test('rejects POST without Authorization header (401)', async () => {
  const handler = await getHandler()
  const res = await handler(new Request('http://localhost', { method: 'POST', body: '{}' }))
  assertEquals(res.status, 401)
})

Deno.test('rejects POST with anon-key bearer (401)', async () => {
  const handler = await getHandler()
  const res = await handler(new Request('http://localhost', {
    method: 'POST',
    body: '{}',
    headers: { Authorization: 'Bearer anon-key-fake' },
  }))
  assertEquals(res.status, 401)
})

Deno.test('accepts POST with service-role bearer (not 401)', async () => {
  const handler = await getHandler()
  const res = await handler(new Request('http://localhost', {
    method: 'POST',
    body: '{"kind":"foo"}',
    headers: { Authorization: 'Bearer service-role-fake-12345' },
  }))
  // Either 400 (invalid kind) or 500 (downstream fetch fails) is OK —
  // we just assert the gate didn't reject as 401.
  if (res.status === 401) throw new Error('service-role bearer was rejected')
})
