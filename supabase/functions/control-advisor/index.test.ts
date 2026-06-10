// Deno tests for control-advisor. Covers CORS threading + bearer
// auth gate. Closes regression risk for M-edge1 (CORS headers not
// threaded to success/error paths) and F5 (per-family rate limit
// requires the gate to land before any expensive work).
//
// Run with: `cd supabase/functions/control-advisor && deno test`

import { assertEquals } from 'jsr:@std/assert@1'

Deno.env.set('SUPABASE_URL', 'https://test.supabase.co')
Deno.env.set('SUPABASE_ANON_KEY', 'anon-key-fake')
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'service-role-fake-12345')
Deno.env.set('ANTHROPIC_API_KEY', 'sk-ant-fake')

async function getHandler(): Promise<(r: Request) => Promise<Response>> {
  const mod = await import('./index.ts')
  const handler = (mod as unknown as { handler?: (r: Request) => Promise<Response> }).handler
  if (typeof handler !== 'function') {
    throw new Error('handler not exported from index.ts — smoke tests cannot run')
  }
  return handler
}

Deno.test('rejects non-POST (405) with CORS', async () => {
  const handler = await getHandler()
  const res = await handler(new Request('http://localhost', {
    method: 'GET',
    headers: { origin: 'https://manifiestoapp.com' },
  }))
  assertEquals(res.status, 405)
  // M-edge1: error paths must carry the matched CORS origin so the
  // browser surfaces the response instead of a generic CORS error.
  assertEquals(res.headers.get('Access-Control-Allow-Origin'), 'https://manifiestoapp.com')
})

Deno.test('rejects invalid JSON (400) with CORS', async () => {
  const handler = await getHandler()
  const res = await handler(new Request('http://localhost', {
    method: 'POST',
    body: 'not json',
    headers: { origin: 'https://manifiestoapp.com' },
  }))
  assertEquals(res.status, 400)
  assertEquals(res.headers.get('Access-Control-Allow-Origin'), 'https://manifiestoapp.com')
})

Deno.test('rejects missing familyId (400)', async () => {
  const handler = await getHandler()
  const res = await handler(new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify({}),
  }))
  assertEquals(res.status, 400)
})

Deno.test('rejects missing bearer (401)', async () => {
  const handler = await getHandler()
  const res = await handler(new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify({ familyId: '00000000-0000-0000-0000-000000000000' }),
  }))
  assertEquals(res.status, 401)
})

Deno.test('CORS preflight blocks unknown origin', async () => {
  const handler = await getHandler()
  const res = await handler(new Request('http://localhost', {
    method: 'OPTIONS',
    headers: { origin: 'https://evil.example.com' },
  }))
  assertEquals(res.headers.get('Access-Control-Allow-Origin'), '')
})

// H-8 (red-team 2026-06-10): tighten bearer parser; a raw token must
// NOT authenticate.
Deno.test('rejects raw token without Bearer prefix (401)', async () => {
  const handler = await getHandler()
  const res = await handler(new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify({ familyId: '00000000-0000-0000-0000-000000000000' }),
    headers: { Authorization: 'some-raw-jwt' },
  }))
  assertEquals(res.status, 401)
})

// H-11 (red-team 2026-06-10): non-UUID familyId is rejected BEFORE
// the rate-limit bucket is consumed. We assert on the 400 status; the
// "before rate limit" property is enforced by ordering in the handler
// — the test exercises the regex gate landing first.
Deno.test('rejects non-UUID familyId (400) before rate-limit', async () => {
  const handler = await getHandler()
  const res = await handler(new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify({ familyId: 'not-a-uuid' }),
    headers: { Authorization: 'Bearer some-jwt', origin: 'https://manifiestoapp.com' },
  }))
  assertEquals(res.status, 400)
  assertEquals(res.headers.get('Access-Control-Allow-Origin'), 'https://manifiestoapp.com')
})

Deno.test('accepts well-formed UUID familyId past the regex gate', async () => {
  // Just past the regex gate, the handler falls into auth (which will
  // fail against the fake env). 401 is the expected outcome; the key
  // assertion is "not 400 from the UUID gate".
  const handler = await getHandler()
  const res = await handler(new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify({ familyId: '00000000-0000-0000-0000-000000000000' }),
    headers: { Authorization: 'Bearer some-jwt' },
  }))
  if (res.status === 400) {
    throw new Error('UUID gate rejected a valid UUID')
  }
})
