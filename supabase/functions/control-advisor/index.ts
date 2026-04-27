import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.57.0'

/**
 * control-advisor
 * ---------------
 * Generates 3-5 personalized weekly financial advice tasks for the Control
 * screen using Claude. The SYSTEM prompt is marked cache_control=ephemeral so
 * Anthropic caches the identical tokens across every family call (prompt
 * caching is our only cache layer; there is no DB cache table).
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
  name: string
  target_amount: number
  current_amount: number
  target_date: string | null
}

interface FamilyContext {
  familyId: string
  generatedAt: string
  monthlyIncome: number
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

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function extractBearerToken(authorizationHeader: string | null): string | null {
  if (!authorizationHeader) return null
  const normalized = authorizationHeader.trim()
  if (!normalized) return null
  const bearerPrefix = 'bearer '
  if (normalized.toLowerCase().startsWith(bearerPrefix)) {
    return normalized.slice(bearerPrefix.length).trim() || null
  }
  return normalized
}

function isServerReady(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey && supabaseServiceRoleKey && anthropicApiKey)
}

// ─── Prompt (SYSTEM is cacheable, USER is not) ───────────────────────────────

const SYSTEM_PROMPT = `Sos un experto asesor financiero que le escribe a una familia argentina como un amigo cercano. Hablás en español rioplatense: "vos", "tenés", "mirá", "fijate", "laburo", "ponele". Nada de tono corporativo, nada de inglés, nada de jerga yanqui.

Tu trabajo: a partir del CONTEXTO JSON que te pasan, generar entre 3 y 5 tareas accionables y específicas para que la familia mejore su situación financiera esta semana.

REGLAS INQUEBRANTABLES:
1. Respondés SOLO con un JSON array válido. Sin texto antes ni después. Sin backticks. Sin \`\`\`json. Nada. Solo el array.
2. Cada tarea es un objeto con ESTA forma EXACTA:
   {
     "id": string,            // corto, slug-ish, único dentro del array (p. ej. "reduce-ocio-w17")
     "emoji": string,         // UN solo emoji, relacionado al tema
     "cat": string,           // categoría ("Ocio", "Suscripciones", "Alimentación", "Fijos", "Ahorro", "Transporte", etc.)
     "title": string,         // frase de acción corta, máx 60 caracteres, SIN emojis
     "body": string,          // 2 oraciones con números CONCRETOS del contexto, máx 200 caracteres, SIN emojis
     "impact": string,        // estimación en pesos con signo, p. ej. "+$8.400 por mes" o "-$12.000 este ciclo"
     "impactRaw": number,     // entero en ARS, positivo = ahorro/ganancia, negativo = gasto evitado como negativo
     "cta": string,           // label de botón, máx 12 caracteres (p. ej. "Revisar", "Ver detalle", "Ajustar")
     "urgency": "alta" | "media" | "baja"
   }
3. Los números del body y del impact TIENEN que salir del contexto real. Nada de "ahorrá más", "controlá tus gastos", "armá un presupuesto": eso está PROHIBIDO. Si una tarea no se sostiene con datos concretos, no la escribas.
4. Usá separador de miles con punto (formato AR): $8.400, $12.500, $120.000. Nada de comas.
5. Priorizá: gastos en categorías top que se dispararon, suscripciones o fijos inminentes, metas de ahorro en riesgo, oportunidades de redistribuir cuando el forecast está holgado.
6. Si "urgency" es "alta", es porque hay algo que vence en pocos días o el stress_level está rojo. "media" para optimizaciones claras. "baja" para mejoras suaves.
7. Nunca inventes categorías ni montos que no estén en el contexto. Mejor menos tareas y bien fundadas, que 5 tareas genéricas.
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
    .select('monthly_income')
    .eq('family_id', familyId)
    .maybeSingle()
  const monthlyIncome = Number(financeRes.data?.monthly_income ?? 0)

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

  // Top 5 categories this cycle
  const expensesRes = await admin
    .from('expenses')
    .select('amount, category_id, categories:category_id(name)')
    .eq('family_id', familyId)
    .gte('occurred_at', cycleStart)
    .lte('occurred_at', cycleEnd)
  type ExpenseRow = {
    amount: number | string
    category_id: string | null
    categories?: { name?: string | null } | null
  }
  const expenseRows = (expensesRes.data ?? []) as ExpenseRow[]
  const aggMap = new Map<string, CategoryAggRow>()
  for (const row of expenseRows) {
    const catId = row.category_id ?? 'uncategorized'
    const catName = row.categories?.name ?? 'Sin categoría'
    const amt = Number(row.amount) || 0
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

  // Fixed expenses — pending in next 14 days
  const fixedRes = await admin
    .from('fixed_expenses')
    .select('id, name, amount, day_of_month, category, active')
    .eq('family_id', familyId)
    .eq('active', true)
  type FixedRow = {
    id: string
    name: string
    amount: number | string
    day_of_month: number | null
    category: string | null
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
        category: fe.category,
      })
    }
  }
  upcomingFixedExpenses.sort((a, b) =>
    (a.next_due_date ?? '').localeCompare(b.next_due_date ?? ''),
  )

  // Active savings goal
  const goalRes = await admin
    .from('savings_goals')
    .select('id, name, target_amount, current_amount, target_date, active')
    .eq('family_id', familyId)
    .eq('active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const activeSavingsGoal: SavingsGoalRow | null = goalRes.data
    ? {
        id: goalRes.data.id as string,
        name: goalRes.data.name as string,
        target_amount: Number(goalRes.data.target_amount) || 0,
        current_amount: Number(goalRes.data.current_amount) || 0,
        target_date: (goalRes.data.target_date as string | null) ?? null,
      }
    : null

  return {
    familyId,
    generatedAt,
    monthlyIncome: Math.round(monthlyIncome),
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
    tasks.push({
      id: o.id,
      emoji: o.emoji,
      cat: o.cat,
      title: o.title,
      body: o.body,
      impact: o.impact,
      impactRaw: Math.round(o.impactRaw),
      cta: o.cta,
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
      title: 'Repasá tus gastos fijos del mes',
      body: 'Hoy no pudimos analizar tu historial a fondo. Revisá los fijos que vienen para no quedarte corto.',
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
      body: 'Fijate cómo venís contra tu meta y ajustá si hace falta. Pequeños aportes semanales mueven la aguja.',
      impact: '+$0',
      impactRaw: 0,
      cta: 'Ver meta',
      urgency: 'baja',
    },
    {
      id: 'fallback-top-cat',
      emoji: '🔍',
      cat: 'Gastos',
      title: 'Chequeá tu categoría más cara',
      body: 'Entrá a Gastos y mirá dónde se te va la plata esta semana. Detectar el pico es el primer paso para recortar.',
      impact: '+$0',
      impactRaw: 0,
      cta: 'Abrir',
      urgency: 'media',
    },
  ]
}

// ─── Handler ─────────────────────────────────────────────────────────────────

async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405)
  }

  if (!isServerReady()) {
    return jsonResponse(
      {
        error:
          'Missing env vars (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY).',
      },
      500,
    )
  }

  let body: RequestBody
  try {
    body = (await request.json()) as RequestBody
  } catch {
    return jsonResponse({ error: 'Invalid JSON payload.' }, 400)
  }

  const familyId = (body.familyId ?? '').trim()
  if (!familyId) return jsonResponse({ error: 'familyId is required.' }, 400)

  // Auth
  const token = extractBearerToken(
    request.headers.get('Authorization') ?? request.headers.get('authorization'),
  )
  if (!token) return jsonResponse({ error: 'Unauthorized (missing token).' }, 401)

  const userClient = createClient(supabaseUrl, supabaseAnonKey)
  const authUserResponse = await userClient.auth.getUser(token)
  if (authUserResponse.error || !authUserResponse.data.user) {
    return jsonResponse({ error: 'Unauthorized (invalid token).' }, 401)
  }
  const actorUserId = authUserResponse.data.user.id

  const admin = createClient(supabaseUrl, supabaseServiceRoleKey)

  // Family membership
  const membershipResponse = await admin
    .from('family_members')
    .select('family_id')
    .eq('family_id', familyId)
    .eq('user_id', actorUserId)
    .maybeSingle()

  if (membershipResponse.error || !membershipResponse.data) {
    return jsonResponse({ error: 'User is not a member of this family.' }, 403)
  }

  // Load context
  let ctx: FamilyContext
  try {
    ctx = await loadFamilyContext(admin, familyId)
  } catch (error) {
    console.error('[control-advisor] loadFamilyContext failed:', error)
    return jsonResponse({ error: 'Failed to load family context.' }, 500)
  }

  if (!hasEnoughData(ctx)) {
    return jsonResponse({ tasks: [], reason: 'insufficient_data', generatedAt: ctx.generatedAt })
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
    )
  }

  return jsonResponse({
    tasks,
    generatedAt: ctx.generatedAt,
    cached: false, // prompt caching happens on Anthropic's side; no local cache
  })
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
