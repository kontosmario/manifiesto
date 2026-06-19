import { createClient } from 'npm:@supabase/supabase-js@2.57.0'

/**
 * usd-rate — devuelve la cotización USD para la moneda del hogar.
 *
 * Para ARS pega a dolarapi (dólar BLUE — el valor real de la calle; el oficial
 * está intervenido y daría un número irreal). Para el resto de LatAm usa
 * open.er-api (su oficial = el real). USD → 1 (identidad). Cachea en
 * `usd_rate_cache` con TTL de 3h para no martillar a los terceros; si la fuente
 * está caída devuelve el último valor cacheado (stale) en vez de romper.
 *
 * `rate_per_usd` = unidades de moneda local por 1 USD. Conversión en el cliente:
 * usd = montoLocal / ratePerUsd.
 */

const denoGlobal = globalThis as {
  Deno?: {
    serve: (handler: (request: Request) => Promise<Response>) => void
    env: { get: (key: string) => string | undefined }
  }
}

const env = denoGlobal.Deno?.env
const supabaseUrl = env?.get('SUPABASE_URL') ?? ''
const supabaseAnonKey = env?.get('SUPABASE_ANON_KEY') ?? ''
const supabaseServiceRoleKey = env?.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const ALLOWED_CURRENCIES = new Set([
  'ARS', 'CLP', 'COP', 'MXN', 'UYU', 'PEN', 'BRL', 'USD',
])
const CACHE_TTL_MS = 3 * 60 * 60 * 1000 // 3 horas

const ALLOWED_ORIGINS = new Set([
  'https://manifiestoapp.com',
  'https://www.manifiestoapp.com',
])

function corsHeadersFor(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.has(origin) ? origin : ''
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}

function jsonResponse(
  payload: unknown,
  status = 200,
  cors: Record<string, string> = corsHeadersFor(null),
): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

function extractBearerToken(authorizationHeader: string | null): string | null {
  if (!authorizationHeader) return null
  const normalized = authorizationHeader.trim()
  const bearerPrefix = 'bearer '
  if (!normalized.toLowerCase().startsWith(bearerPrefix)) return null
  return normalized.slice(bearerPrefix.length).trim() || null
}

interface RateResult {
  currency: string
  ratePerUsd: number
  source: string
  asOf: string
}

async function fetchRate(currency: string): Promise<RateResult> {
  const nowIso = new Date().toISOString()

  if (currency === 'USD') {
    return { currency, ratePerUsd: 1, source: 'identity', asOf: nowIso }
  }

  if (currency === 'ARS') {
    const res = await fetch('https://dolarapi.com/v1/dolares/blue')
    if (!res.ok) throw new Error(`dolarapi ${res.status}`)
    const data = (await res.json()) as {
      venta?: number
      fechaActualizacion?: string
    }
    const rate = Number(data.venta)
    if (!Number.isFinite(rate) || rate <= 0) {
      throw new Error('dolarapi: venta inválida')
    }
    return {
      currency,
      ratePerUsd: rate,
      source: 'dolarapi:blue',
      asOf: data.fechaActualizacion ?? nowIso,
    }
  }

  // Resto: open.er-api (base USD; su oficial = el real, sin brecha).
  const res = await fetch('https://open.er-api.com/v6/latest/USD')
  if (!res.ok) throw new Error(`open.er-api ${res.status}`)
  const data = (await res.json()) as {
    result?: string
    rates?: Record<string, number>
    time_last_update_utc?: string
  }
  if (data.result !== 'success') throw new Error('open.er-api: result != success')
  const rate = Number(data.rates?.[currency])
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error(`open.er-api: sin rate para ${currency}`)
  }
  const asOf = data.time_last_update_utc
    ? new Date(data.time_last_update_utc).toISOString()
    : nowIso
  return { currency, ratePerUsd: rate, source: 'open.er-api', asOf }
}

export async function handler(request: Request): Promise<Response> {
  const cors = corsHeadersFor(request.headers.get('Origin'))
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors })
  }
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405, cors)
  }

  // JWT (defense-in-depth; el gateway ya valida con verify_jwt=true).
  const bearer = extractBearerToken(request.headers.get('Authorization'))
  if (!bearer) return jsonResponse({ error: 'Unauthorized' }, 401, cors)
  const userClient = createClient(supabaseUrl, supabaseAnonKey)
  const authRes = await userClient.auth.getUser(bearer)
  if (authRes.error || !authRes.data.user) {
    return jsonResponse({ error: 'Unauthorized' }, 401, cors)
  }

  let body: { currency?: unknown } = {}
  try {
    body = (await request.json()) as { currency?: unknown }
  } catch {
    body = {}
  }
  const currency =
    typeof body.currency === 'string' ? body.currency.toUpperCase().trim() : 'ARS'
  if (!ALLOWED_CURRENCIES.has(currency)) {
    return jsonResponse({ error: 'Moneda no soportada.' }, 400, cors)
  }

  const admin = createClient(supabaseUrl, supabaseServiceRoleKey)

  // 1. ¿cache fresca?
  const cacheRes = await admin
    .from('usd_rate_cache')
    .select('currency, rate_per_usd, source, as_of, updated_at')
    .eq('currency', currency)
    .maybeSingle()
  const cached = cacheRes.data as
    | { rate_per_usd: number; source: string; as_of: string; updated_at: string }
    | null

  if (cached && Date.now() - new Date(cached.updated_at).getTime() < CACHE_TTL_MS) {
    return jsonResponse(
      {
        currency,
        ratePerUsd: Number(cached.rate_per_usd),
        source: cached.source,
        asOf: cached.as_of,
        cached: true,
      },
      200,
      cors,
    )
  }

  // 2. fetch fresco + upsert cache
  try {
    const result = await fetchRate(currency)
    await admin.from('usd_rate_cache').upsert(
      {
        currency: result.currency,
        rate_per_usd: result.ratePerUsd,
        source: result.source,
        as_of: result.asOf,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'currency' },
    )
    return jsonResponse({ ...result, cached: false }, 200, cors)
  } catch (e) {
    // 3. fallback: último valor cacheado (aunque esté viejo) en vez de romper.
    if (cached) {
      return jsonResponse(
        {
          currency,
          ratePerUsd: Number(cached.rate_per_usd),
          source: cached.source,
          asOf: cached.as_of,
          cached: true,
          stale: true,
        },
        200,
        cors,
      )
    }
    console.error('[usd-rate] fetch falló y no hay cache', String(e))
    return jsonResponse({ error: 'No pudimos traer la cotización.' }, 502, cors)
  }
}

if (!denoGlobal.Deno?.serve) {
  throw new Error('This function must run on Deno runtime.')
}

denoGlobal.Deno.serve(handler)
