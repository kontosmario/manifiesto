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

// H-8 (red-team 2026-06-10): a raw token (no `Bearer ` prefix) must
// be rejected. The previous parser fell back to returning the raw
// header value, which let a caller skip the spec.
Deno.test('rejects raw token without Bearer prefix (401)', async () => {
  const handler = await getHandler()
  const res = await handler(new Request('http://localhost', {
    method: 'POST',
    body: '{}',
    headers: { Authorization: 'service-role-fake-12345' },
  }))
  assertEquals(res.status, 401)
})

// H-9 (red-team 2026-06-10): OPTIONS preflight must return 204 with
// CORS headers, not 405. Pre-fix, browsers would see a generic CORS
// error instead of the real reason a request was rejected.
Deno.test('OPTIONS preflight returns 204 with CORS', async () => {
  const handler = await getHandler()
  const res = await handler(new Request('http://localhost', {
    method: 'OPTIONS',
    headers: { origin: 'https://manifiestoapp.com' },
  }))
  assertEquals(res.status, 204)
  assertEquals(res.headers.get('Access-Control-Allow-Origin'), 'https://manifiestoapp.com')
})

Deno.test('non-POST returns 405 with CORS headers', async () => {
  const handler = await getHandler()
  const res = await handler(new Request('http://localhost', {
    method: 'GET',
    headers: { origin: 'https://manifiestoapp.com' },
  }))
  assertEquals(res.status, 405)
  // H-9: 405 must still carry CORS so a browser-origin caller sees
  // the real status rather than a generic preflight failure.
  assertEquals(res.headers.get('Access-Control-Allow-Origin'), 'https://manifiestoapp.com')
})

Deno.test('500 response does not leak internal error message (M-edge2)', async () => {
  const handler = await getHandler()
  const res = await handler(new Request('http://localhost', {
    method: 'POST',
    body: '{"kind":"morning_checkins"}',
    headers: { Authorization: 'Bearer service-role-fake-12345' },
  }))
  // The downstream Supabase fetch will fail against the fake URL, so
  // processKind throws and lands in the catch. We assert the error
  // body is the redacted marker, not the raw exception text.
  if (res.status !== 500) return
  const body = (await res.json()) as { error?: unknown }
  assertEquals(body.error, 'internal')
})
