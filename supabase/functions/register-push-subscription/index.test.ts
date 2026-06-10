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
    body: JSON.stringify({ token: 'ExponentPushToken[abcdefghijklmnopqrstuvwx]' }),
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
    body: JSON.stringify({ token: 'ExponentPushToken[abcdefghijklmnopqrstuvwx]' }),
    headers: { Authorization: 'Bearer fake-jwt-token' },
  }))
  // 401 (auth.getUser rejects) is the expected branch.
  assertEquals(res.status, 401)
})

Deno.test('rejects POST with raw (prefix-less) token as 401 — Sprint I · I-2', async () => {
  // Regression guard: prior bearer parser fell back to returning the raw
  // header value when the `Bearer ` prefix was absent, letting a bare
  // token authenticate. We now require the literal prefix per RFC 6750.
  const handler = await getHandler()
  const res = await handler(new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify({ token: 'ExponentPushToken[abcdefghijklmnopqrstuvwx]' }),
    headers: { Authorization: 'fake-jwt-token' },
  }))
  assertEquals(res.status, 401)
})

// ── Sprint J · Audit #3 J-Edge1 regression coverage ────────────────────

Deno.test('Sprint J · J-Edge1(b): rejects service-role bearer with 401', async () => {
  // Service-role key would otherwise resolve to a "user-shaped" payload
  // via auth.getUser and let the caller bypass rate limits + family
  // ownership checks. Must be rejected before any user lookup.
  const handler = await getHandler()
  const res = await handler(new Request('http://localhost', {
    method: 'POST',
    // Token format passes the tightened regex (22 url-safe base64 chars)
    body: JSON.stringify({ token: 'ExponentPushToken[abcdefghij_klmnopqrst-]' }),
    headers: { Authorization: 'Bearer service-role-fake-12345' },
  }))
  assertEquals(res.status, 401)
  const payload = await res.json()
  assertEquals(payload.error, 'Service-role token not permitted on this path')
})

Deno.test('Sprint J · J-Edge1(c): rejects web provider with non-allowlisted host (400)', async () => {
  const handler = await getHandler()
  const res = await handler(new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify({
      token: 'https://evil.example.com/notify/abc',
      provider: 'web',
      p256dh: 'somekey',
      auth: 'somekey',
    }),
    headers: { Authorization: 'Bearer some-jwt' },
  }))
  assertEquals(res.status, 400)
  const payload = await res.json()
  assertEquals(payload.error, 'Invalid web push endpoint host.')
})

Deno.test('Sprint J · J-Edge1(c): rejects web provider with http:// (400)', async () => {
  // Even if the host is allowlisted, non-https must be rejected.
  const handler = await getHandler()
  const res = await handler(new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify({
      token: 'http://fcm.googleapis.com/fcm/send/abc',
      provider: 'web',
      p256dh: 'somekey',
      auth: 'somekey',
    }),
    headers: { Authorization: 'Bearer some-jwt' },
  }))
  assertEquals(res.status, 400)
})

Deno.test('Sprint J · J-Edge1(c): rejects web provider with javascript: scheme (400)', async () => {
  const handler = await getHandler()
  const res = await handler(new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify({
      token: 'javascript:alert(1)',
      provider: 'web',
      p256dh: 'somekey',
      auth: 'somekey',
    }),
    headers: { Authorization: 'Bearer some-jwt' },
  }))
  assertEquals(res.status, 400)
})

Deno.test('Sprint J · J-Edge1(d): rejects Expo token with newline (400)', async () => {
  // The previous regex `[^\]]+` allowed newlines and control chars.
  // The tightened regex limits to url-safe base64 only; combined with
  // stripControlChars the newline is stripped, leaving a token that no
  // longer matches the `[...]` block (now missing payload between
  // brackets).
  const handler = await getHandler()
  const res = await handler(new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify({ token: 'ExponentPushToken[abc\n\rdef]' }),
    headers: { Authorization: 'Bearer some-jwt' },
  }))
  assertEquals(res.status, 400)
})

Deno.test('Sprint J · J-Edge1(d): rejects Expo token with non-base64 chars (400)', async () => {
  // `[^\]]+` previously accepted spaces, slashes, parens, etc. The
  // tightened regex limits to `[A-Za-z0-9_-]`.
  const handler = await getHandler()
  const res = await handler(new Request('http://localhost', {
    method: 'POST',
    // Length OK but contains '/' and ' ' which the new regex rejects.
    body: JSON.stringify({ token: 'ExponentPushToken[abc/def ghi/jkl]' }),
    headers: { Authorization: 'Bearer some-jwt' },
  }))
  assertEquals(res.status, 400)
})

Deno.test('Sprint J · J-Edge1(d): rejects Expo token shorter than 18 chars (400)', async () => {
  // Defense-in-depth: real Expo tokens are ~22 chars of base64. The
  // lower bound of 18 is generous but blocks trivially short tokens.
  const handler = await getHandler()
  const res = await handler(new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify({ token: 'ExponentPushToken[abc]' }),
    headers: { Authorization: 'Bearer some-jwt' },
  }))
  assertEquals(res.status, 400)
})

Deno.test('Sprint J · J-Edge1(d): accepts Expo token matching tightened regex (passes format check)', async () => {
  // 24 url-safe base64 chars — well within 18-200. Should pass format
  // validation. The downstream auth.getUser call will fail (401 or
  // network) but we only assert it is NOT a 400 (format rejection).
  const handler = await getHandler()
  const res = await handler(new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify({
      token: 'ExponentPushToken[abcdefghijklmnopqrstuvwx]',
    }),
    headers: { Authorization: 'Bearer fake-jwt-token' },
  }))
  // Token format passed if we don't see a 400 from the format branch.
  // 401 (auth.getUser rejected) or 500 (network error in test env) both
  // mean the format gate let us through.
  if (res.status === 400) {
    const payload = await res.json()
    throw new Error(`Expected non-400; got 400 with ${JSON.stringify(payload)}`)
  }
})
