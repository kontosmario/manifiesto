# control-advisor

Supabase Edge Function that generates 3–5 personalized weekly financial advice
tasks for the Control screen using the Claude API.

## Endpoint

`POST /functions/v1/control-advisor`

### Request

```json
{ "familyId": "uuid-of-family" }
```

Headers:
- `Authorization: Bearer <supabase-user-jwt>` (required)
- `Content-Type: application/json`

### Response (200 OK)

```json
{
  "tasks": [
    {
      "id": "reduce-ocio-w17",
      "emoji": "🍻",
      "cat": "Ocio",
      "title": "Bajá el gasto en salidas esta semana",
      "body": "Llevás $48.300 en Ocio este mes, 38% arriba del promedio. Si bajás una salida ahorrás $12.000.",
      "impact": "+$12.000 este ciclo",
      "impactRaw": 12000,
      "cta": "Ver detalle",
      "urgency": "media"
    }
  ],
  "generatedAt": "2026-04-24T17:30:00.000Z",
  "cached": false
}
```

Other shapes:
- `{ tasks: [], reason: "insufficient_data", generatedAt }` — 200, when family has no usable data.
- `{ tasks: [...fallback], generatedAt, cached: false, fallback: true }` — 502, Claude error / invalid shape.

## How caching works

There is **no DB cache layer**. We rely on **Anthropic prompt caching**: the
SYSTEM prompt is marked `cache_control: { type: "ephemeral" }`. It's identical
across every call for every family, so Anthropic caches those tokens and we only
pay full price for the (small) user message that carries the family's context.

## Data read from Supabase

- `family_finance.monthly_income`
- `velocity_snapshots` (latest row — optional, tolerated if missing)
- `monthly_summaries` (last 3)
- `expenses` + `categories` (top 5 by spend this calendar month)
- `fixed_expenses` active, due in the next 14 days (derived from `day_of_month`)
- `savings_goals` (latest active)

All reads go through the service-role client after membership verification on
`family_members`.

## Env vars

| Name | Source |
|---|---|
| `ANTHROPIC_API_KEY` | Supabase secrets — set with `supabase secrets set` |
| `SUPABASE_URL` | Provided by Edge runtime |
| `SUPABASE_ANON_KEY` | Provided by Edge runtime |
| `SUPABASE_SERVICE_ROLE_KEY` | Provided by Edge runtime |

## Deploy

```bash
# 1. Set the Anthropic key as a secret (only needed once)
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...

# 2. Deploy
supabase functions deploy control-advisor
```

## Local test

```bash
supabase functions serve control-advisor \
  --env-file ./supabase/.env.local \
  --no-verify-jwt

curl -X POST http://localhost:54321/functions/v1/control-advisor \
  -H "Authorization: Bearer <SUPABASE_USER_JWT>" \
  -H "Content-Type: application/json" \
  -d '{"familyId":"<YOUR_FAMILY_UUID>"}'
```

## Client-side type

The response `tasks[]` matches the mobile type `ControlAdvisorTask`:

```ts
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
```

## Notes

- Model: `claude-sonnet-4-6`, `max_tokens: 1500`, `temperature: 0.4`.
- System prompt forces Spanish rioplatense, strict JSON, data-grounded advice
  (no generic "ahorrá más").
- If Claude returns invalid JSON, the function logs the raw text via
  `console.error` and returns a hardcoded 3-task fallback with HTTP 502.
