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

// H-8 (red-team 2026-06-10): a raw token without the `Bearer ` prefix
// must NOT authenticate. RFC 6750 requires the prefix; the previous
// parser silently accepted bare tokens. We assert on both the batch
// and non-batch paths.
Deno.test('messages[] rejects raw token (no Bearer prefix) (401)', async () => {
  const handler = await getHandler()
  const res = await handler(new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify({ messages: [{ to: 'ExponentPushToken[x]', title: 't', body: 'b' }] }),
    headers: { Authorization: 'service-role-fake-12345' },
  }))
  assertEquals(res.status, 401)
})

Deno.test('non-batch path rejects raw token (no Bearer prefix) (401)', async () => {
  const handler = await getHandler()
  const res = await handler(new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify({ familyId: '00000000-0000-0000-0000-000000000000', title: 'hi' }),
    headers: { Authorization: 'some-raw-jwt' },
  }))
  assertEquals(res.status, 401)
})

// Sprint O · Audit #8 O-2 (2026-06-14): sanitizeText must strip Unicode
// `Cf` format chars (bidi marks/overrides, zero-width, BOM). An
// attacker planting U+202E in an expense description would otherwise
// flip digits in the push body the family sees on the lock screen.
// Test inputs use `\u{...}` escapes to keep the source grep-friendly
// (no literal invisible chars embedded inline).
Deno.test('sanitizeText strips bidi override (U+202E)', async () => {
  const mod = await import('./index.ts')
  const sanitize = (mod as unknown as {
    sanitizeText?: (v: string | undefined, n: number) => string
  }).sanitizeText
  if (typeof sanitize !== 'function') {
    throw new Error('sanitizeText not exported — Sprint O O-2 regression test cannot run')
  }
  // RIGHT-TO-LEFT OVERRIDE — flips visual reading order of "100" → "001"
  const result = sanitize(`$\u{202E}100`, 240)
  assertEquals(result.includes('\u{202E}'), false)
  // Char dropped, surrounding text preserved (and trimmed/collapsed).
  assertEquals(result.replace(/\s+/g, ''), '$100')
})

Deno.test('sanitizeText strips zero-width + BOM + LRM/RLM + isolates', async () => {
  const mod = await import('./index.ts')
  const sanitize = (mod as unknown as {
    sanitizeText?: (v: string | undefined, n: number) => string
  }).sanitizeText
  if (typeof sanitize !== 'function') {
    throw new Error('sanitizeText not exported')
  }
  const cfChars = [
    '\u{200B}', '\u{200C}', '\u{200D}', // zero-width space / non-joiner / joiner
    '\u{200E}', '\u{200F}',             // LRM / RLM
    '\u{202A}', '\u{202B}', '\u{202C}', '\u{202D}', '\u{202E}', // embedding/override family
    '\u{2066}', '\u{2067}', '\u{2068}', '\u{2069}', // bidi isolates
    '\u{FEFF}', // BOM / zero-width no-break space
  ]
  const input = `a${cfChars.join('b')}c`
  const result = sanitize(input, 240)
  for (const ch of cfChars) {
    assertEquals(result.includes(ch), false, `${ch.codePointAt(0)?.toString(16)} should be stripped`)
  }
})
