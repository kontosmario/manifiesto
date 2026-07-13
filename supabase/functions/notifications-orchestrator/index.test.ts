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

// ─── Coalescing (2026-07) ───────────────────────────────────────────
// Pure logic of buildCoalescedMessages / combineBody. These do not touch
// the network, so we import + call them directly.

interface CRow {
  id: string
  family_id: string
  user_id: string | null
  title: string
  body: string
  kind: string
  severity: string
  metadata: Record<string, unknown>
  created_at: string
}

function crow(over: Partial<CRow>): CRow {
  return {
    id: 'r',
    family_id: 'f1',
    user_id: 'u1',
    title: 'T',
    body: 'B',
    kind: 'price_hike',
    severity: 'info',
    metadata: {},
    created_at: '2026-07-13T12:00:00Z',
    ...over,
  }
}

async function coalescing(): Promise<{
  buildCoalescedMessages: (
    rows: CRow[],
    tokens: Array<{ family_id: string; user_id: string; endpoint: string }>,
  ) => { messages: Array<{ to: string; title: string; body: string; data: unknown }>; rowIdsByIndex: string[][] }
  combineBody: (rows: CRow[]) => string
  COMBINED_PUSH_TITLE: string
}> {
  const mod = await import('./index.ts')
  return mod as unknown as Awaited<ReturnType<typeof coalescing>>
}

Deno.test('coalescing: 2 filas del mismo usuario → 1 push combinado', async () => {
  const { buildCoalescedMessages, COMBINED_PUSH_TITLE } = await coalescing()
  const rows = [
    crow({ id: 'r1', title: 'Netflix vence hoy', created_at: '2026-07-13T12:00:00Z', severity: 'medium', metadata: { route: '/fixed' } }),
    crow({ id: 'r2', title: 'Subió Seguro auto', created_at: '2026-07-13T12:05:00Z', severity: 'low', metadata: { route: '/control' } }),
  ]
  const tokens = [{ family_id: 'f1', user_id: 'u1', endpoint: 'tok1' }]
  const { messages, rowIdsByIndex } = buildCoalescedMessages(rows, tokens)
  assertEquals(messages.length, 1)
  assertEquals(messages[0].title, COMBINED_PUSH_TITLE)
  assertEquals(messages[0].body, 'Netflix vence hoy · Subió Seguro auto')
  // ruta del combinado = la de mayor severidad (medium > low)
  assertEquals(messages[0].data, { route: '/fixed' })
  assertEquals([...rowIdsByIndex[0]].sort(), ['r1', 'r2'])
})

Deno.test('coalescing: 1 fila → push individual (título de la fila, no el combinado)', async () => {
  const { buildCoalescedMessages, COMBINED_PUSH_TITLE } = await coalescing()
  const rows = [crow({ id: 'r1', title: '$12.000 para hoy', body: 'cuerpo' })]
  const tokens = [{ family_id: 'f1', user_id: 'u1', endpoint: 'tok1' }]
  const { messages } = buildCoalescedMessages(rows, tokens)
  assertEquals(messages.length, 1)
  assertEquals(messages[0].title, '$12.000 para hoy')
  assertEquals(messages[0].title === COMBINED_PUSH_TITLE, false)
  assertEquals(messages[0].body, 'cuerpo')
})

Deno.test('coalescing: fila family-wide (user_id null) explota a cada miembro con token', async () => {
  const { buildCoalescedMessages } = await coalescing()
  const rows = [crow({ id: 'fw', user_id: null, title: 'Fijo del hogar' })]
  const tokens = [
    { family_id: 'f1', user_id: 'u1', endpoint: 'tokA' },
    { family_id: 'f1', user_id: 'u2', endpoint: 'tokB' },
    { family_id: 'f2', user_id: 'u3', endpoint: 'tokC' }, // otra familia → no la recibe
  ]
  const { messages, rowIdsByIndex } = buildCoalescedMessages(rows, tokens)
  assertEquals(messages.length, 2)
  assertEquals(new Set(messages.map((m) => m.to)), new Set(['tokA', 'tokB']))
  assertEquals(rowIdsByIndex.every((ids) => ids.length === 1 && ids[0] === 'fw'), true)
})

Deno.test('coalescing: dos usuarios distintos → un push por usuario (no cruzados)', async () => {
  const { buildCoalescedMessages, COMBINED_PUSH_TITLE } = await coalescing()
  const rows = [
    crow({ id: 'a1', user_id: 'u1', title: 'A1' }),
    crow({ id: 'a2', user_id: 'u1', title: 'A2' }),
    crow({ id: 'b1', user_id: 'u2', title: 'B1' }),
  ]
  const tokens = [
    { family_id: 'f1', user_id: 'u1', endpoint: 'tok1' },
    { family_id: 'f1', user_id: 'u2', endpoint: 'tok2' },
  ]
  const { messages } = buildCoalescedMessages(rows, tokens)
  assertEquals(messages.length, 2)
  const u1 = messages.find((m) => m.to === 'tok1')!
  const u2 = messages.find((m) => m.to === 'tok2')!
  assertEquals(u1.title, COMBINED_PUSH_TITLE) // u1 tiene 2 → combinado
  assertEquals(u2.title, 'B1') // u2 tiene 1 → individual
})

Deno.test('combineBody: cap 3 + "y N más", ordenado por hora', async () => {
  const { combineBody } = await coalescing()
  const rows = [1, 2, 3, 4, 5].map((n) =>
    crow({ id: `r${n}`, title: `T${n}`, created_at: `2026-07-13T12:0${n}:00Z` }),
  )
  assertEquals(combineBody(rows), 'T1 · T2 · T3 y 2 más')
})
