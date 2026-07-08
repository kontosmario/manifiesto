import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.57.0'

/**
 * control-advisor
 * ---------------
 * Generates 3-5 personalized weekly financial advice tasks for the Control
 * screen using Claude. The SYSTEM prompt is marked cache_control=ephemeral so
 * Anthropic caches the identical tokens across every family call (prompt
 * caching is our only cache layer; there is no DB cache table).
 *
 * ┌─ ESTADO: DORMIDO (capa OPCIONAL, preparada para el futuro) ──────────────┐
 * │ Decisión owner 2026-06-15: el asistente es 100% HEURÍSTICO (las señales  │
 * │ se calculan en el cliente, control-signals.ts). Este LLM es una capa     │
 * │ opcional que REEMPLAZA las tareas heurísticas, gateada por el feature    │
 * │ flag `ai_coach` (default FALSE) — ver mobile/features/flags.             │
 * │ Hoy NO corre: falta el secret ANTHROPIC_API_KEY (isServerReady() = false │
 * │ sin él → 500). El SYSTEM_PROMPT ya está escrito con la voz comprensible  │
 * │ (ver docs/superpowers/specs/2026-06-15-asistente-voz-comprensible).      │
 * │                                                                          │
 * │ PARA ACTIVARLO EN EL FUTURO (3 pasos):                                   │
 * │  1. supabase secrets set ANTHROPIC_API_KEY=sk-ant-...  (vía Management    │
 * │     API o `supabase secrets set`).                                       │
 * │  2. Prender el flag `ai_coach` (FEATURE_FLAGS en feature-flag-keys.ts,   │
 * │     o el override remoto si existe).                                     │
 * │  3. Redeployar: npm run supabase:remote:functions:deploy (config.toml ya │
 * │     fija verify_jwt; la función valida el JWT con auth.getUser).         │
 * │ Costo: Claude Sonnet ~1500 tokens/llamada, rate-limited 5/h por usuario  │
 * │ y 8/h por familia.                                                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * POST  /functions/v1/control-advisor
 * Body  { familyId: string }
 * Auth  Supabase JWT (user must be a member of familyId)
 */

// ─── Types ───────────────────────────────────────────────────────────────────

interface RequestBody {
  familyId?: string
}

interface ControlAdvisorTask {
  id: string
  emoji: string
  cat: string
  title: string
  body: string
  impact: string
  impactRaw: number
  cta: string
  urgency: 'alta' | 'media' | 'baja'
}

interface VelocityRow {
  stress_level?: number | string | null
  forecast?: number | null
  momentum?: number | null
}

interface MonthlySummaryRow {
  period_label: string
  period_start: string
  period_end: string
  total_spent: number
  monthly_income: number
  savings_delta: number
  mood: string | null
  delta_vs_previous_percent: number | null
}

interface CategoryAggRow {
  category_id: string
  category_name: string
  total: number
  count: number
}

interface FixedExpenseRow {
  id: string
  name: string
  amount: number
  day_of_month: number | null
  next_due_date?: string | null
  category?: string | null
}

interface SavingsGoalRow {
  id: string
  title: string
  goal_amount: number
  current_amount: number
  target_months: number | null
}

interface FamilyContext {
  familyId: string
  generatedAt: string
  monthlyIncome: number
  /** 'dynamic' = hogar sin sueldo fijo: se fondea con income_events.
   *  El prompt instruye a usar cycleIncome como referencia de ingreso
   *  y a no hablar de "sueldo" en ese caso. */
  incomeMode: 'fixed' | 'dynamic'
  /** Ingresos reales registrados en el ciclo (income_events). */
  cycleIncome: number
  fijosMes: number
  velocity: VelocityRow | null
  monthlySummaries: MonthlySummaryRow[]
  topCategories: CategoryAggRow[]
  upcomingFixedExpenses: FixedExpenseRow[]
  activeSavingsGoal: SavingsGoalRow | null
}

// ─── Env / Deno bootstrap ────────────────────────────────────────────────────

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
const anthropicApiKey = env?.get('ANTHROPIC_API_KEY') ?? ''

// Mirrors send-family-push: only echo Origin for the production
// site. Mobile callers don't read CORS at all, so this is purely
// defense-in-depth against browser-origin abuse.
const ALLOWED_ORIGINS = new Set([
  'https://manifiestoapp.com',
  'https://www.manifiestoapp.com',
])

function corsHeadersFor(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.has(origin) ? origin : ''
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}

function jsonResponse(
  payload: unknown,
  status = 200,
  corsHeadersOverride: Record<string, string> = corsHeadersFor(null),
): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeadersOverride, 'Content-Type': 'application/json' },
  })
}

// RFC 6750 §2.1 bearer parser — requires the literal `Bearer ` prefix
// (case-insensitive, per RFC). Reject anything without the prefix.
// All known callers (mobile via `supabase.functions.invoke`) emit the
// prefix; tightening this is safe. H-8 (red-team 2026-06-10).
function extractBearerToken(authorizationHeader: string | null): string | null {
  if (!authorizationHeader) return null
  const normalized = authorizationHeader.trim()
  if (!normalized) return null
  const bearerPrefix = 'bearer '
  if (!normalized.toLowerCase().startsWith(bearerPrefix)) return null
  return normalized.slice(bearerPrefix.length).trim() || null
}

// Constant-time string equality. Used for the service-role reject
// below — `===` short-circuits on first byte mismatch, leaking match
// progress through response timing. Risk over the public internet is
// minimal but the cost of doing it right is one helper. Mirrors
// send-family-push and register-push-subscription. Sprint J · Audit #3
// J-Edge2 (2026-06-10).
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return mismatch === 0
}

// RFC 4122 UUID format (any version, any variant). The control-advisor
// per-user rate-limit bucket is consumed BEFORE the membership /
// family-existence checks, so a non-UUID `familyId` was burning a
// 5/hour slot before failing downstream. Validate up front. H-11
// (red-team 2026-06-10).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isServerReady(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey && supabaseServiceRoleKey && anthropicApiKey)
}

// ─── Prompt (SYSTEM is cacheable, USER is not) ───────────────────────────────

const SYSTEM_PROMPT = `Sos un asesor financiero que le escribe a una familia argentina como un amigo cercano. Le escribís a alguien que NO sabe nada de finanzas ni es bueno con la matemática. Tu superpoder: que te entienda CUALQUIERA, sin tener que ser contador. Hablás en español rioplatense: "vos", "tenés", "mirá", "fijate", "laburo", "ponele". Nada de tono corporativo, nada de inglés.

Tu trabajo: a partir del CONTEXTO JSON que te pasan, generar entre 3 y 5 tareas accionables y específicas para que la familia mejore su plata esta semana.

═══ CÓMO ESCRIBIR (lo más importante) ═══
A. PESOS PRIMERO, porcentaje después (solo si suma). NUNCA un porcentaje o un "1.4×" solo. El monto en pesos es el protagonista; el % va entre paréntesis como contexto.
   MAL: "Restaurantes son el 38% del gasto". BIEN: "Gastaste $45.000 en restaurantes (casi 4 de cada 10 pesos del mes)".
B. CERO MATEMÁTICA MENTAL. Si dos números se relacionan, decí el resultado, no pidas que lo calculen.
   MAL: "el cierre es $120.000, te vas $20.000 por encima". BIEN: "a este ritmo vas a gastar $20.000 más de lo que tenías pensado".
C. PALABRAS PROHIBIDAS (jerga que nadie entiende fuera de un banco): ratio, velocidad, momentum, baseline, percentil, aceleración, dominancia, apalancamiento, cupo, tope, ciclo, sobrante, excedente, margen, aire, forecast, proyección, volatilidad, sobregiro, comprometido, holgado, prorrateo, drenaje, filtraciones. Si un término técnico es inevitable, explicalo al lado en pesos: "tus gastos fijos (alquiler, servicios, suscripciones)".
D. TODO número lleva un ancla de la vida real: la diferencia en pesos, cuántos días de gasto, o algo tangible ("eso paga 2 meses de Netflix", "es casi un día de laburo").
E. Decí SIEMPRE si es bueno o malo y QUÉ HACER. El usuario no tiene que adivinar. Terminá en una acción concreta que se entiende sin googlear.
F. UMBRALES sin número mágico: no digas "lo sano es menos del 50%". Decí la consecuencia: "tus gastos fijos se comen más de la mitad del sueldo, te queda muy poco para el día a día y para guardar".
G. TONO: si hay un problema, directo y tranquilizador, sin metáforas ("hoy gastaste de más, cuidá los próximos días"). Si hay una buena noticia, ahí sí cálido ("¡vas bárbaro, te sobran $5.000!").
H. INGRESO VARIABLE: si "incomeMode" es "dynamic", este hogar NO tiene sueldo fijo (monthlyIncome va a ser 0 y es normal, no un problema). Su ingreso real del período es "cycleIncome" (lo que registraron a mano). Usá cycleIncome como referencia de ingreso, nunca digas "sueldo" ni sugieras "configurar tu ingreso"; si cycleIncome es bajo o 0, sugerí registrar los ingresos a medida que entran.

═══ FORMATO (inquebrantable) ═══
1. Respondés SOLO con un JSON array válido. Sin texto antes ni después. Sin backticks. Sin \`\`\`json. Solo el array.
2. Cada tarea es un objeto con ESTA forma EXACTA:
   {
     "id": string,            // corto, slug-ish, único dentro del array (p. ej. "reduce-ocio-w17")
     "emoji": string,         // UN solo emoji, relacionado al tema
     "cat": string,           // categoría ("Ocio", "Suscripciones", "Alimentación", "Fijos", "Ahorro", "Transporte", etc.)
     "title": string,         // frase de acción corta, máx 60 caracteres, SIN emojis, en lenguaje llano
     "body": string,          // 2 oraciones con números CONCRETOS en pesos, máx 200 caracteres, SIN emojis. Seguí A–G de arriba.
     "impact": string,        // estimación en pesos con signo, p. ej. "+$8.400 por mes" o "-$12.000 este mes"
     "impactRaw": number,     // entero en ARS, positivo = ahorro/ganancia, negativo = gasto evitado como negativo
     "cta": string,           // label de botón, máx 12 caracteres (p. ej. "Revisar", "Ver detalle", "Ajustar")
     "urgency": "alta" | "media" | "baja"
   }
3. Los números del body y del impact TIENEN que salir del contexto real. Nada de "ahorrá más" o "controlá tus gastos": PROHIBIDO. Si una tarea no se sostiene con datos concretos en pesos, no la escribas.
4. Separador de miles con punto (formato AR): $8.400, $12.500, $120.000. Nada de comas.
5. Priorizá: categorías donde gastaron mucho más que de costumbre, suscripciones o pagos fijos que vencen pronto, metas de ahorro en riesgo, y cuando va a sobrar plata a fin de mes, sugerir dónde guardarla.
6. "urgency" alta = algo vence en pocos días o el mes viene muy ajustado. "media" = una mejora clara. "baja" = un ajuste suave.
7. Nunca inventes categorías ni montos que no estén en el contexto. Mejor menos tareas y bien fundadas que 5 genéricas.
8. "title" y "body" nunca llevan emojis. El emoji va SOLO en el campo "emoji".

Salida esperada: un JSON array de 3 a 5 objetos con esa forma. Nada más.`

function buildUserMessage(ctx: FamilyContext): string {
  return `Acá va el contexto de la familia. Generá las tareas para esta semana.

${JSON.stringify(ctx, null, 2)}`
}

// ─── Supabase queries ────────────────────────────────────────────────────────

async function loadFamilyContext(
  admin: SupabaseClient,
  familyId: string,
): Promise<FamilyContext> {
  const generatedAt = new Date().toISOString()
  const now = new Date()
  const cycleStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const cycleEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)
  const in14Days = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  // Family finance (income + fijos already aggregated? we re-sum fijos below)
  const financeRes = await admin
    .from('family_finance')
    .select('monthly_income, income_mode')
    .eq('family_id', familyId)
    .maybeSingle()
  const monthlyIncome = Number(financeRes.data?.monthly_income ?? 0)
  const incomeMode: 'fixed' | 'dynamic' =
    (financeRes.data as { income_mode?: string } | null)?.income_mode === 'dynamic'
      ? 'dynamic'
      : 'fixed'

  // Ingresos reales del ciclo (income_events). En modo dinámico es LA
  // referencia de ingreso (monthly_income es 0 por diseño); en fixed es
  // contexto extra (bonos/ventas).
  let cycleIncome = 0
  try {
    const incomeRes = await admin
      .from('income_events')
      .select('amount')
      .eq('family_id', familyId)
      .gte('event_date', cycleStart)
      .lt('event_date', cycleEnd)
    if (!incomeRes.error && incomeRes.data) {
      cycleIncome = incomeRes.data.reduce(
        (sum: number, row: { amount: number | string | null }) =>
          sum + (Number(row.amount) || 0),
        0,
      )
    }
  } catch (_err) {
    cycleIncome = 0
  }

  // Velocity snapshot (optional — table may or may not exist)
  let velocity: VelocityRow | null = null
  try {
    const velRes = await admin
      .from('velocity_snapshots')
      .select('stress_level, forecast, momentum')
      .eq('family_id', familyId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!velRes.error && velRes.data) velocity = velRes.data as VelocityRow
  } catch (_err) {
    velocity = null
  }

  // Last 3 monthly summaries
  const summariesRes = await admin
    .from('monthly_summaries')
    .select(
      'period_label, period_start, period_end, total_spent, monthly_income, savings_delta, mood, delta_vs_previous_percent',
    )
    .eq('family_id', familyId)
    .order('period_end', { ascending: false })
    .limit(3)
  const monthlySummaries = (summariesRes.data ?? []) as MonthlySummaryRow[]

  // Top 5 categories this cycle.
  // NOTE (CR v2 C1): la tabla `expenses` usa `price` y `created_at`
  // (no `amount`/`occurred_at`). Ver migration 20260413154000_mobile_baseline.sql.
  const expensesRes = await admin
    .from('expenses')
    .select('price, category_id, categories:category_id(name)')
    .eq('family_id', familyId)
    .gte('created_at', cycleStart)
    .lte('created_at', cycleEnd + 'T23:59:59.999Z')
  type ExpenseRow = {
    price: number | string
    category_id: string | null
    categories?: { name?: string | null } | null
  }
  const expenseRows = (expensesRes.data ?? []) as ExpenseRow[]
  const aggMap = new Map<string, CategoryAggRow>()
  for (const row of expenseRows) {
    const catId = row.category_id ?? 'uncategorized'
    const catName = row.categories?.name ?? 'Sin categoría'
    const amt = Number(row.price) || 0
    const existing = aggMap.get(catId)
    if (existing) {
      existing.total += amt
      existing.count += 1
    } else {
      aggMap.set(catId, { category_id: catId, category_name: catName, total: amt, count: 1 })
    }
  }
  const topCategories = Array.from(aggMap.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, 5)
    .map((row) => ({ ...row, total: Math.round(row.total) }))

  // Fixed expenses — pending in next 14 days.
  // NOTE (CR v2 C1): la tabla `fixed_expenses` usa `status` (no `active`),
  // `category_id` (no `category`). El nombre legible de la categoría se
  // resuelve vía join con `categories`. Ver migration
  // 20260419193000_expand_fixed_expenses_to_commitments.sql.
  const fixedRes = await admin
    .from('fixed_expenses')
    .select('id, name, amount, day_of_month, category_id, categories:category_id(name), status')
    .eq('family_id', familyId)
    .eq('status', 'active')
  type FixedRow = {
    id: string
    name: string
    amount: number | string
    day_of_month: number | null
    category_id: string | null
    categories?: { name?: string | null } | null
  }
  const allFixed = (fixedRes.data ?? []) as FixedRow[]
  const fijosMes = allFixed.reduce((sum, fe) => sum + (Number(fe.amount) || 0), 0)

  const upcomingFixedExpenses: FixedExpenseRow[] = []
  for (const fe of allFixed) {
    if (fe.day_of_month == null) continue
    // Next occurrence: this month if day >= today's day, else next month
    const candidate = new Date(now.getFullYear(), now.getMonth(), fe.day_of_month)
    if (candidate < now) candidate.setMonth(candidate.getMonth() + 1)
    const candidateISO = candidate.toISOString().slice(0, 10)
    if (candidateISO <= in14Days) {
      upcomingFixedExpenses.push({
        id: fe.id,
        name: fe.name,
        amount: Math.round(Number(fe.amount) || 0),
        day_of_month: fe.day_of_month,
        next_due_date: candidateISO,
        category: fe.categories?.name ?? null,
      })
    }
  }
  upcomingFixedExpenses.sort((a, b) =>
    (a.next_due_date ?? '').localeCompare(b.next_due_date ?? ''),
  )

  // Active savings goal.
  // NOTE (CR v2 C1): la tabla `savings_goals` usa `title`, `goal_amount`,
  // `target_months`, `is_active` (no `name`/`target_amount`/`target_date`/`active`).
  // Ver migration 20260422235900_home_redesign_savings_goals_and_fixed_payments.sql.
  const goalRes = await admin
    .from('savings_goals')
    .select('id, title, goal_amount, current_amount, target_months, is_active')
    .eq('family_id', familyId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const activeSavingsGoal: SavingsGoalRow | null = goalRes.data
    ? {
        id: goalRes.data.id as string,
        title: goalRes.data.title as string,
        goal_amount: Number(goalRes.data.goal_amount) || 0,
        current_amount: Number(goalRes.data.current_amount) || 0,
        target_months: (goalRes.data.target_months as number | null) ?? null,
      }
    : null

  return {
    familyId,
    generatedAt,
    monthlyIncome: Math.round(monthlyIncome),
    incomeMode,
    cycleIncome: Math.round(cycleIncome),
    fijosMes: Math.round(fijosMes),
    velocity,
    monthlySummaries,
    topCategories,
    upcomingFixedExpenses,
    activeSavingsGoal,
  }
}

function hasEnoughData(ctx: FamilyContext): boolean {
  return (
    ctx.monthlyIncome > 0 ||
    ctx.cycleIncome > 0 ||
    ctx.topCategories.length > 0 ||
    ctx.upcomingFixedExpenses.length > 0 ||
    ctx.activeSavingsGoal !== null
  )
}

// ─── Claude call ─────────────────────────────────────────────────────────────

interface AnthropicContentBlock {
  type: string
  text?: string
}
interface AnthropicResponse {
  content?: AnthropicContentBlock[]
  error?: { message?: string }
}

async function callClaude(ctx: FamilyContext): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': anthropicApiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      temperature: 0.4,
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        {
          role: 'user',
          content: buildUserMessage(ctx),
        },
      ],
    }),
  })

  if (!response.ok) {
    const errText = await response.text().catch(() => '')
    throw new Error(`Anthropic error ${response.status}: ${errText}`)
  }

  const data = (await response.json()) as AnthropicResponse
  const text = (data.content ?? [])
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text as string)
    .join('')

  if (!text.trim()) throw new Error('Empty Claude response')
  return text
}

// ─── Validation ──────────────────────────────────────────────────────────────

// Sprint J-Med · J-Med5 (2026-06-10): sanitize user-facing fields from
// the Claude response before forwarding to the mobile UI. The prompt
// context includes user-controlled DB content (savings_goals.title,
// expense category names) so an attacker could nudge Claude into
// echoing crafted payloads (e.g. deep-link injection in `cta` like
// "manifiesto://transfer/?to=:attacker"). We strip control chars, cap
// length, and reject suspicious patterns. Anything malformed → null
// so the caller falls back to a generic safe task.
//
// Sprint O · Audit #8 O-2 (2026-06-14): extend the regex to also strip
// Unicode `Cf` "format" characters (zero-width spaces, bidi marks/
// overrides, BOM). Claude can be coaxed into echoing them — and the
// mobile UI rendering would then re-order digits (RLO trick) or
// silently absorb them (ZWSP). We also reject any of these from
// `sanitizeEmoji` (see below).
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_RE = new RegExp(
  '[\\x00-\\x1F\\x7F\\u200B-\\u200F\\u202A-\\u202E\\u2066-\\u2069\\uFEFF]',
  'gu',
)

export function stripControlChars(input: string): string {
  return input.replace(CONTROL_CHARS_RE, '')
}

function sanitizeText(input: string, maxLen: number): string | null {
  const cleaned = stripControlChars(input).trim()
  if (cleaned.length === 0) return null
  if (cleaned.length <= maxLen) return cleaned
  // Slice on UTF-16 unit; safer than splitting astral pairs would be
  // nice but for our cap (≤240 chars) the risk is cosmetic.
  return cleaned.slice(0, maxLen)
}

function sanitizeCta(input: string): string | null {
  const cleaned = sanitizeText(input, 24)
  if (!cleaned) return null
  // Reject anything that smells like a deep-link / URL injection. The
  // mobile UI treats `cta` as plain button text; a payload like
  // "manifiesto://" or "https://" never makes sense here.
  if (cleaned.includes(':') || cleaned.includes('//')) return null
  return cleaned
}

function sanitizeEmoji(input: string): string | null {
  const cleaned = stripControlChars(input).trim()
  if (cleaned.length === 0) return null
  // Sprint O · Audit #8 O-2 (2026-06-14): stripControlChars already
  // removes bidi marks / overrides, zero-width chars and BOM (including
  // ZWJ U+200D). That trades the ability to render multi-codepoint ZWJ
  // sequences (e.g. family emoji) for a guarantee that the field can't
  // smuggle text direction or invisible characters into the mobile UI.
  // Single-codepoint emoji — the overwhelming majority of what Claude
  // returns here — still pass. We additionally reject any leftover Cf
  // codepoint as a defense-in-depth check in case the regex above is
  // ever loosened.
  const codepoints = Array.from(cleaned)
  if (codepoints.length > 4) return null
  for (const cp of codepoints) {
    const code = cp.codePointAt(0) ?? 0
    // Reject ASCII letter / digit / punctuation — emoji codepoints
    // fall outside that range.
    if (code < 0x80) return null
    // Defense-in-depth: explicitly reject Cf format chars even if a
    // future regex change misses them.
    if (
      (code >= 0x200b && code <= 0x200f) ||
      (code >= 0x202a && code <= 0x202e) ||
      (code >= 0x2066 && code <= 0x2069) ||
      code === 0xfeff
    ) {
      return null
    }
  }
  return codepoints.join('')
}

function parseAndValidate(raw: string): ControlAdvisorTask[] | null {
  // Strip code fences if Claude slipped up
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim()

  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    return null
  }

  if (!Array.isArray(parsed)) return null
  if (parsed.length < 1 || parsed.length > 6) return null

  const validUrgencies = new Set(['alta', 'media', 'baja'])
  const tasks: ControlAdvisorTask[] = []
  for (const item of parsed) {
    if (!item || typeof item !== 'object') return null
    const o = item as Record<string, unknown>
    if (
      typeof o.id !== 'string' ||
      typeof o.emoji !== 'string' ||
      typeof o.cat !== 'string' ||
      typeof o.title !== 'string' ||
      typeof o.body !== 'string' ||
      typeof o.impact !== 'string' ||
      typeof o.cta !== 'string' ||
      typeof o.urgency !== 'string' ||
      typeof o.impactRaw !== 'number' ||
      !validUrgencies.has(o.urgency)
    ) {
      return null
    }
    // Sprint J-Med · J-Med5 (2026-06-10): sanitize each user-facing
    // string field. If any required field comes back empty or
    // rejected after sanitization, drop the whole batch — we'd rather
    // fall back to the static `fallbackTasks()` than ship partial /
    // unsafe content.
    const safeTitle = sanitizeText(o.title, 80)
    const safeBody = sanitizeText(o.body, 240)
    const safeCta = sanitizeCta(o.cta)
    const safeCat = sanitizeText(o.cat, 32)
    const safeEmoji = sanitizeEmoji(o.emoji)
    const safeImpact = sanitizeText(o.impact, 32)
    if (
      !safeTitle ||
      !safeBody ||
      !safeCta ||
      !safeCat ||
      !safeEmoji ||
      !safeImpact
    ) {
      return null
    }
    tasks.push({
      id: o.id,
      emoji: safeEmoji,
      cat: safeCat,
      title: safeTitle,
      body: safeBody,
      impact: safeImpact,
      impactRaw: Math.round(o.impactRaw),
      cta: safeCta,
      urgency: o.urgency as 'alta' | 'media' | 'baja',
    })
  }
  return tasks
}

function fallbackTasks(): ControlAdvisorTask[] {
  return [
    {
      id: 'fallback-review-fijos',
      emoji: '📋',
      cat: 'Fijos',
      title: 'Repasá tus pagos fijos del mes',
      body: 'Hoy no pudimos mirar bien tus números. Repasá los pagos fijos (alquiler, servicios, suscripciones) que se vienen para no quedarte corto.',
      impact: '+$0',
      impactRaw: 0,
      cta: 'Revisar',
      urgency: 'media',
    },
    {
      id: 'fallback-check-meta',
      emoji: '🎯',
      cat: 'Ahorro',
      title: 'Mirá tu meta de ahorro',
      body: 'Mirá cómo venís con tu meta y ajustá si hace falta. Guardar un poco cada semana suma más de lo que parece.',
      impact: '+$0',
      impactRaw: 0,
      cta: 'Ver meta',
      urgency: 'baja',
    },
    {
      id: 'fallback-top-cat',
      emoji: '🔍',
      cat: 'Gastos',
      title: 'Mirá en qué gastás más',
      body: 'Entrá a Gastos y mirá en qué se te va más plata esta semana. Verlo es el primer paso para gastar menos.',
      impact: '+$0',
      impactRaw: 0,
      cta: 'Abrir',
      urgency: 'media',
    },
  ]
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function handler(request: Request): Promise<Response> {
  const cors = corsHeadersFor(request.headers.get('origin'))
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: cors })
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405, cors)
  }

  if (!isServerReady()) {
    return jsonResponse(
      {
        error:
          'Missing env vars (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY).',
      },
      500,
      cors,
    )
  }

  let body: RequestBody
  try {
    body = (await request.json()) as RequestBody
  } catch {
    return jsonResponse({ error: 'Invalid JSON payload.' }, 400, cors)
  }

  const familyId = (body.familyId ?? '').trim()
  if (!familyId) return jsonResponse({ error: 'familyId is required.' }, 400, cors)
  // H-11 (red-team 2026-06-10): validate UUID format BEFORE the
  // expensive rate-limit / membership work. Without this, a non-UUID
  // value burns a 5/hour rate-limit slot before failing at the DB
  // layer (where Postgres rejects the cast with a generic 500).
  if (!UUID_RE.test(familyId)) {
    return jsonResponse({ error: 'familyId must be a UUID.' }, 400, cors)
  }

  // Auth
  const token = extractBearerToken(
    request.headers.get('Authorization') ?? request.headers.get('authorization'),
  )
  if (!token) return jsonResponse({ error: 'Unauthorized (missing token).' }, 401, cors)

  // Sprint I · I-6 — defense in depth. supabase-js' `auth.getUser`
  // recognizes the service-role JWT and returns a "user-shaped" payload
  // for the service principal, which would let a caller in possession of
  // the service role key impersonate any family without going through
  // the per-user / per-family rate limits. Reject explicitly so that
  // path can never succeed via this entry point. Sprint J · Audit #3
  // J-Edge2 (2026-06-10): switched `===` to `timingSafeEqual` for parity
  // with send-family-push / register-push-subscription.
  if (timingSafeEqual(token, supabaseServiceRoleKey)) {
    return jsonResponse({ error: 'Unauthorized (invalid token).' }, 401, cors)
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey)
  const authUserResponse = await userClient.auth.getUser(token)
  if (authUserResponse.error || !authUserResponse.data.user) {
    return jsonResponse({ error: 'Unauthorized (invalid token).' }, 401, cors)
  }
  const actorUserId = authUserResponse.data.user.id

  const admin = createClient(supabaseUrl, supabaseServiceRoleKey)

  // Aggressive rate limit BEFORE any DB work or Anthropic call.
  // Each invocation costs ~1500 Claude tokens; an unbounded caller
  // could rack up multi-thousand-USD bills per hour. Cap at 5/hour
  // per user — comfortably above the legitimate "manual refresh"
  // pattern and well below abuse territory.
  const rateLimitResponse = await admin.rpc('enforce_rate_limit_for_user', {
    p_user_id: actorUserId,
    p_action: 'control_advisor',
    p_max_attempts: 5,
    p_window_seconds: 3600,
  })
  if (rateLimitResponse.error) {
    // RFC 7231: Retry-After en segundos = ventana del rate-limit (1h).
    return jsonResponse(
      { error: 'Rate limit exceeded. Refresh in ~1 hour.' },
      429,
      { ...cors, 'Retry-After': '3600' },
    )
  }

  // Family membership (active members only).
  const membershipResponse = await admin
    .from('family_members')
    .select('family_id, role, blocked_at')
    .eq('family_id', familyId)
    .eq('user_id', actorUserId)
    .maybeSingle()

  if (membershipResponse.error || !membershipResponse.data) {
    return jsonResponse({ error: 'User is not a member of this family.' }, 403, cors)
  }
  const member = membershipResponse.data as {
    role?: string | null
    blocked_at?: string | null
  }
  if (member.role === 'blocked' || member.blocked_at) {
    return jsonResponse({ error: 'Forbidden: blocked member.' }, 403, cors)
  }

  // Per-family rate limit (F5, red-team 2026-06-10): the per-user
  // bucket of 5/hour above caps a single attacker, but an attacker
  // with N puppet accounts inside the same family could drive Nx
  // Claude calls. Each call is ~1500 tokens — a 4-member family
  // could rack up 20 calls/hour by abusing the per-user bucket.
  // Cap the family aggregate at 8/hour. We seed the bucket with
  // the family owner's user_id (stable, unique per family thanks
  // to family_members_one_owner_per_family) so every member's
  // call lands in the same row.
  const ownerResponse = await admin
    .from('family_members')
    .select('user_id')
    .eq('family_id', familyId)
    .eq('role', 'owner')
    .maybeSingle()
  // Sprint I · I-5 — if no owner is returned (ownership transition
  // window, malformed family row, race with member promotion) we used
  // to silently SKIP the bucket. That let an attacker exploiting the
  // window burst past the family cap. Reject with 503 instead — every
  // healthy family has exactly one owner per the
  // `family_members_one_owner_per_family` constraint, so a null result
  // here is a transient inconsistency. Falling back to `family_id` as
  // the bucket seed would FK-violate against rpc_rate_limits.user_id
  // (which references auth.users), so 503 + retry is the safe move.
  const familyBucketSeed = ownerResponse.data?.user_id ?? null
  if (!familyBucketSeed) {
    console.error('[control-advisor] no owner for family — refusing call', {
      familyId,
    })
    // Sprint J-Med · J-Med4 (2026-06-10): generic public message,
    // detailed reason already in console.error above for ops.
    return jsonResponse(
      { error: 'Temporarily unavailable. Try again shortly.' },
      503,
      cors,
    )
  }
  const familyRateLimitResponse = await admin.rpc(
    'enforce_rate_limit_for_user',
    {
      p_user_id: familyBucketSeed,
      p_action: 'control_advisor_family',
      p_max_attempts: 8,
      p_window_seconds: 3600,
    },
  )
  if (familyRateLimitResponse.error) {
    return jsonResponse(
      { error: 'Rate limit exceeded (family). Refresh in ~1 hour.' },
      429,
      { ...cors, 'Retry-After': '3600' },
    )
  }

  // Load context
  let ctx: FamilyContext
  try {
    ctx = await loadFamilyContext(admin, familyId)
  } catch (error) {
    console.error('[control-advisor] loadFamilyContext failed:', error)
    return jsonResponse({ error: 'Failed to load family context.' }, 500, cors)
  }

  if (!hasEnoughData(ctx)) {
    return jsonResponse(
      { tasks: [], reason: 'insufficient_data', generatedAt: ctx.generatedAt },
      200,
      cors,
    )
  }

  // Claude
  let rawText: string
  try {
    rawText = await callClaude(ctx)
  } catch (error) {
    console.error('[control-advisor] Claude call failed:', error)
    return jsonResponse(
      {
        tasks: fallbackTasks(),
        generatedAt: ctx.generatedAt,
        cached: false,
        fallback: true,
      },
      502,
      cors,
    )
  }

  const tasks = parseAndValidate(rawText)
  if (!tasks) {
    console.error('[control-advisor] Claude returned invalid JSON shape. Raw:', rawText)
    return jsonResponse(
      {
        tasks: fallbackTasks(),
        generatedAt: ctx.generatedAt,
        cached: false,
        fallback: true,
      },
      502,
      cors,
    )
  }

  return jsonResponse(
    {
      tasks,
      generatedAt: ctx.generatedAt,
      cached: false, // prompt caching happens on Anthropic's side; no local cache
    },
    200,
    cors,
  )
}

if (!denoGlobal.Deno?.serve) {
  throw new Error('This function must run on Deno runtime.')
}

denoGlobal.Deno.serve(handler)

/* ─── Local test ──────────────────────────────────────────────────────────────
Invoke locally with:

  supabase functions serve control-advisor --env-file ./supabase/.env.local --no-verify-jwt

  curl -X POST http://localhost:54321/functions/v1/control-advisor \
    -H "Authorization: Bearer <SUPABASE_USER_JWT>" \
    -H "Content-Type: application/json" \
    -d '{"familyId":"<YOUR_FAMILY_UUID>"}'

Deploy:

  supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
  supabase functions deploy control-advisor
────────────────────────────────────────────────────────────────────────────── */
