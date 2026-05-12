# Asistente Financiero — notas de augmentation con LLM

**Fecha del doc:** 2026-05-12
**Estado del Asistente:** 100% heurístico, determinista, en producción.
**Decisión del owner:** mantenerlo heurístico por ahora. Este doc captura
oportunidades de mejora con LLM para cuando se reabra la decisión.

---

## 1. Por qué mantenerlo heurístico hoy

| Ventaja heurística actual | Costo de LLM si lo reemplazamos hoy |
|---|---|
| **Transparencia total** — cada regla es un threshold visible y testeable. Un usuario puede preguntar "¿por qué me dijo esto?" y la respuesta es un número (`70%`, `1.4×`, `40%`). | LLM = caja negra. Auditar "por qué surgió este consejo" requiere herramientas extra. |
| **Cero costo marginal por usuario** — el cómputo corre client-side + server SQL ya pagado. | Anthropic/OpenAI tokens cuestan por request. A 7 MAU es despreciable; a 5K MAU son ~USD 50-200/mes (ver §5). |
| **Latencia <50ms** — todo es derivación de datos en memoria. | LLM ronda 800ms-3s por request. Hay UX pattern para mitigarlo (streaming + skeleton) pero ya no es "instantáneo". |
| **Privacy** — los números de los gastos del usuario nunca salen a un tercero. | Aunque Anthropic/OpenAI no entrenan sobre tu prompt, los datos financieros pasan por un proveedor externo. Cambia la Privacy Policy. |
| **Determinismo** — la misma entrada produce la misma sugerencia siempre. Testeable. | Variabilidad inherente, requiere temperature=0 + golden tests con tolerancia. |
| **Offline-friendly** — la mayoría del cómputo es client-side, sirve sin red. | LLM requiere red activa. Pierde una de las propiedades calmas del producto. |

**Conclusión:** la heurística actual es **buena por mérito propio**, no un workaround.
Si reabrimos LLM, debe ser en puntos donde **claramente** suma valor que el
determinismo no puede dar — no "modernización por defecto".

---

## 2. Estado actual del sistema (resumen referencia)

> Detalle exhaustivo en mapa interno (file paths + line numbers).
> Esta sección es el TL;DR para situarse.

### Arquitectura de capas

```
┌──────────────────────────────────────────────────────────────────┐
│ A. INPUTS (data sources)                                          │
│   - expenses, fixed_expenses, family_finance, category_limits     │
│   - monthly_summaries (6 ciclos), velocity_snapshots (server cron)│
│   - user_streaks, savings_goals, notifications (zombie/hike)      │
│   - advisor_interactions (telemetry → persona inference)          │
│   - advisor_signal_dismissals (TTL + escalation por user/signal)  │
│   - signal_blocklist (mute hard de familias)                      │
└────────────────────────────────────────┬─────────────────────────┘
                                         ↓
┌──────────────────────────────────────────────────────────────────┐
│ B. HEURISTIC ENGINE — mobile/features/insights/control-signals.ts │
│   - 20+ builders, 1 por cada tipo de señal                        │
│   - thresholds hardcoded (después calibrados con user-baselines   │
│     a partir de 3 ciclos cerrados — P75 personales reemplazan     │
│     defaults globales)                                            │
│   - confidence ramp T0 → T1 → T2 → T3 según historial             │
│   - signal fusion (start-splurge + velocity → uno solo)           │
│   - super-signal composition (perfect-storm, savings-momentum,    │
│     hidden-drain → meta-señales que combinan ≥2 sub-señales)      │
│   - scoring: urgencyWeight × annualizedImpact × confidence        │
│   - diversity budget: max 3 alta + 3 media + 3 baja, max 1        │
│     reinforcement positivo, max 2 super-signals                   │
└────────────────────────────────────────┬─────────────────────────┘
                                         ↓
┌──────────────────────────────────────────────────────────────────┐
│ C. PERSONA / COPY FRAMING — persona.ts + control-signals-copy.ts  │
│   - 4 personas: planner / firefighter / avoider / optimizer       │
│   - Inferidas de interaction stats (CTR por familia, sample size) │
│   - 3 framings de copy: loss / gain / neutral                     │
│   - HOY solo 4 señales tienen variantes de copy (recovery-hard,   │
│     velocity, fijos-ratio, positive-forecast). El resto usan      │
│     copy default hardcoded.                                       │
└────────────────────────────────────────┬─────────────────────────┘
                                         ↓
┌──────────────────────────────────────────────────────────────────┐
│ D. OUTPUT SURFACES                                                │
│   - Home Control V2 Card (teaser, primera señal + constelación)   │
│   - Asistente full-screen (todas las señales como chat bubbles)   │
│   - Push notifications (sync de alta confianza, 18h cooldown)     │
│   - Settings Preferences (persona inferida + blocklist)           │
└──────────────────────────────────────────────────────────────────┘
```

### Lo crítico que NO se debe romper si se introduce LLM

- **Datos grounded.** Toda señal hoy se apoya en un número que el usuario puede ver y rastrear. Si LLM redacta, tiene que recibir los números literales (no inferirlos).
- **Determinismo del trigger.** El LLM puede mejorar la EXPLICACIÓN o el TONO, pero **qué señales se disparan debe seguir siendo determinista** (regla → impacto → urgencia → score). El "qué" no se delega al LLM.
- **Confidence ramp y diversity budget.** El sistema actual modera la cantidad y la frecuencia de mensajes; un LLM sin esa guard-rail genera spam.
- **Dismissals + persona feedback loop.** Cualquier copy generado debe respetar los datos de dismissal (no insistir) y alimentar la inferencia de persona.

---

## 3. Puntos de augmentación con LLM, ordenados por ROI

### Tier 1 — alto valor, bajo riesgo

#### 3.1 Copy depth adaptativo a persona

**Hoy:** solo 4 señales tienen variantes loss/gain/neutral. El resto usa el mismo copy para todos los personas.

**Con LLM:** generar el `body` de cada señal en tiempo real, recibiendo:
- el contexto exacto (números, fechas, categorías)
- la persona inferida
- el historial reciente del usuario con esa familia de señal

**Por qué vale la pena:** el copy es el "punto de contacto" con el usuario. Una explicación que matchea su modelo mental (loss-averse, optimizador, etc.) tiene 2-3× más CTR en apps de finanzas que el copy genérico.

**Cómo encaja sin romper:**
- El builder sigue siendo determinista (decide QUÉ disparar)
- Un nuevo paso "copy generator" recibe `(signalCode, context, persona, recentInteractions)` y devuelve `{ headline, body, cta_label }`
- Fallback al copy hardcoded si LLM falla o tarda > 1.5s

**Riesgo:** medio — hay que asegurar el modelo no invente números. Strategy: prompt con datos literales + temperature=0 + JSON output mode + regex validation del output contra los inputs.

**Costo:** 1 request por sesión-asistente (cachear el copy generado por (signal_id, persona, día)). A 7 MAU: ~$0.50/mes. A 5K MAU: ~$30/mes con Haiku 4.5.

---

#### 3.2 Recovery plan synthesis para super-perfect-storm

**Hoy:** cuando se dispara `super-perfect-storm` (≥2 alertas críticas concurrentes), el copy es genérico: "varios indicadores en rojo, conviene un plan integral".

**Con LLM:** dado el cocktail específico de señales activas (e.g. fijos-ratio 0.72 + velocity 1.3× + recovery-hard 38%), generar un plan accionable rankeado:
1. "Pausá el aporte a 'Vacaciones' este ciclo (libera $32k)"
2. "Renegociá el plan de internet (ahorrás ~$8k/mes en fijos)"
3. "Postergá la compra del lavarropas 2 semanas hasta nuevo cobro"

**Por qué vale la pena:** cuando todo se prende en rojo el usuario está MÁS expuesto a sentirse perdido. Un plan concreto evita parálisis. Es el momento donde más se nota la diferencia entre "alerta" y "compañía".

**Constraints:**
- Las acciones propuestas deben mappear a CTAs reales del producto (`action.kind`)
- LLM debe recibir: lista de fijos del usuario, metas activas, gastos discretos top, monto del déficit estimado
- Output validado: cada paso del plan debe poder traducirse a un `ControlAdvisorTask` que el dispatcher ya sabe ejecutar (sino → no se muestra)

**Costo:** raro (solo cuando se dispara perfect-storm). Cap a 1 plan generado por ciclo por usuario. Ínfimo.

---

#### 3.3 Anomaly explanation cuando el spike es inexplicable por reglas

**Hoy:** la heurística detecta patrones (cat-accel, weekly-pattern, end-of-cycle). Cuando un día rompe MUCHOS patrones a la vez sin caer en una regla específica, el sistema queda mudo.

**Con LLM:** dar al modelo el spike (e.g. "ayer cargaste $45k en supermercado, 4.2× tu mediana de jueves") y el contexto disponible (categoría, hora, día, último viaje fuera de la ciudad detectado por geo si llegamos a tenerla) → narrar el porqué probable + sugerir verificación.

**Por qué vale la pena:** explica un fenómeno que la heurística no puede explicar (porque no hay regla para "viajaste el fin de semana y volviste con stock de comida"). Útil sobre todo para usuarios optimizadores que valoran insight.

**Riesgo:** alto si el LLM inventa el contexto. Mitigación: solo proponer hipótesis si hay señal corroborante en los datos (e.g. "varios gastos seguidos en la misma categoría", "compras en un POS distinto al habitual"). Sino → no decir nada.

**Costo:** raro. Trigger explícito por la heurística cuando un día supera un threshold X sin matchear ninguna regla.

---

### Tier 2 — valor medio, requiere infra adicional

#### 3.4 Conversational Q&A sobre la propia historia financiera

**Visión:** el usuario abre el asistente y puede preguntar "¿en qué gasté más este mes?" o "¿cuánto me gasté en cafeterías el año pasado?" o "¿si dejara de pedir Rappi ahorraría suficiente para mi meta?".

**Por qué vale la pena:** los datos están todos ahí. Hoy el usuario tiene que navegar Gastos + filtros + cálculo mental. La conversación corta esa fricción.

**Constraints técnicas:**
- LLM con tool-calling: function-call `query_expenses(filters)`, `query_summary(period)`, `simulate_savings(category, monthly_reduction)`. Las funciones quedan determinitas, el LLM solo orquesta.
- RPCs SQL bien gateadas (no permitir que el LLM proponga queries arbitrarias)
- Rate limit estricto (10 turnos/día por usuario, por costo)
- Privacy: prompt con datos del usuario actual + family, NUNCA con otros usuarios

**Riesgo:** alto en setup pero acotado. La superficie expuesta al LLM se limita a tools determinitos.

**Costo:** medio. Trade-off: si la calidad es alta, justifica el premium pricing (Bucket B Monetization gateado a Pro).

---

#### 3.5 Smart categorization

**Hoy:** el usuario elige categoría manualmente. La app no autocategoriza.

**Con LLM:** sugerir categoría al cargar un gasto. Input: descripción + monto + hora + ubicación (si la hay). Output: top 3 categorías probables.

**Por qué vale la pena:** el quick-add baja de "5 segundos + decisión" a "3 segundos + confirm tap". A escala (gastos diarios), es uno de los mayores quick-wins de UX.

**Constraints:**
- Tiene que ser MUY rápido (<500ms). Streaming no aplica acá — necesitás la respuesta antes del próximo tap.
- Cachear lookups idénticos (descripción + monto en una ventana de tiempo).
- Privacy-aware: enviamos descripción libre que el user escribió. Disclaimer explícito en privacy.

**Alternativa heurística más simple primero:** ranking por `pickTopCategoryDescriptions` (ya existe). Si esa cubre 80% de los casos, LLM no aporta tanto. Medir antes.

---

### Tier 3 — experimental, validar con métricas

#### 3.6 Causal narrative storytelling

**Hoy:** `causal-engine` detecta vínculos (Friday → Saturday, paired impulse, stress spending). El copy es plano: "patrón viernes → sábado".

**Con LLM:** transformar el patrón seco en una narrativa breve. "Notamos algo curioso: los viernes que salís a comer afuera, los sábados gastás 30% más en compras. Como si la dopamina del viernes se extendiera. ¿Quisieras intentar romper la cadena un sábado?"

**Hipótesis:** narrar el patrón aumenta significativamente la acción. Pero es una hipótesis no validada. **Validar con A/B antes de generalizar.**

**Riesgo:** "psicologizar" puede sentirse intrusivo. Tono crucial. Definir tone-of-voice estricto en el system prompt.

---

#### 3.7 Proactive nudges

**Visión:** "Estás por entrar al fin de semana con el cupo justo. Si tenés planeado salir, hoy es buen momento para evaluar."

**Diferencia con heurística actual:** la heurística reacciona a estado actual; el LLM proyecta intenciones + sugiere proactividad.

**Riesgo:** alto si se equivoca de timing. Pasa rápido de "útil" a "invasivo". Cap de notifs/semana + opt-in explícito.

---

#### 3.8 Multi-language / cultural adaptation

**Hoy:** Argentina-Spanish-only. Tuteo voseante, "ciclo", "fijos", "sobregiro", "cuotas", paritarias.

**Con LLM:** futura expansión Latam con tono regional (chileno, colombiano, mexicano). El LLM adapta voseo↔tuteo, vocabulario, ejemplos culturales sin re-traducir todo el catálogo.

**Cuándo:** post-launch sólido en Argentina. No urgente.

---

## 4. Implementación tentativa (cuando se reabra)

### 4.1 Capa de infraestructura compartida

Si se introduce LLM, **construir UNA infraestructura común** y reusar en cada punto:

```
mobile/features/llm/                          (capa cliente)
  use-llm-completion.ts                       (hook reusable)
  llm-types.ts                                (request/response shapes)
  llm-cache.ts                                (key-based cache, TTL)
  llm-error.ts                                (graceful fallback to heuristic)

supabase/functions/llm-proxy/                 (edge function)
  index.ts                                    (auth + rate limit + provider call)
  prompts/                                    (system prompts por uso)
    copy-generator.md
    recovery-plan.md
    anomaly-explainer.md
    qa-conversational.md
    categorizer.md
```

**Por qué edge function (no llamar al provider directo desde mobile):**
1. Auth: el API key del provider nunca toca el cliente.
2. Rate limiting per-user a nivel server (no se puede saltar).
3. Auditabilidad: queda log centralizado de qué prompts se usaron.
4. Cambio de provider transparente (Anthropic → OpenAI → Mistral) sin redeploy mobile.

### 4.2 Decisión de modelo

| Caso | Modelo recomendado | Por qué |
|---|---|---|
| Copy generation (3.1) | Haiku 4.5 | Latencia baja, calidad suficiente, $1/Mtok input |
| Recovery plan (3.2) | Sonnet 4.6 | Reasoning más profundo, raro |
| Anomaly explanation (3.3) | Haiku 4.5 | Latencia importa |
| Conversational Q&A (3.4) | Sonnet 4.6 con tool use | Necesita planificar tool calls |
| Smart categorization (3.5) | Haiku 4.5 (o un classifier propio fine-tuned si crece volumen) | Latencia crítica |

### 4.3 Prompt caching

Todos los prompts deberían usar **prompt caching** de Anthropic (system prompt + ejemplos cacheables). Reduce costo ~90% y latencia ~85%. El system prompt de cada caso debería ser estable y reutilizado por miles de llamadas.

### 4.4 Failure mode siempre = fallback heurístico

Si el LLM falla (timeout, error, output malformado), el sistema **debe retornar al copy heurístico actual**. El asistente nunca queda mudo por culpa del LLM.

```typescript
async function generateCopy(args) {
  try {
    const llmCopy = await callLLM(args, { timeoutMs: 1500 })
    if (validate(llmCopy, args)) return llmCopy
  } catch {}
  return fallbackHardcodedCopy(args)
}
```

---

## 5. Costos proyectados

Asumimos pricing Anthropic (mayo 2026):
- Haiku 4.5: $1/Mtok input · $5/Mtok output
- Sonnet 4.6: $3/Mtok input · $15/Mtok output
- Cache hit: 10% del precio input

### 5.1 Escenario "copy generation only" (Tier 1 más light)

| Asunción | Valor |
|---|---|
| Avg signal copy: 500 input tok, 200 output tok | |
| Cache hit rate (system prompt + ejemplos): 90% | |
| Effective input cost: $0.10/Mtok | |
| Avg sessions/user/mes que abren asistente: 8 | |
| Avg signals shown/session: 3 | |
| MAU: 5K | |

```
Requests/mes = 5000 × 8 × 3 = 120,000
Input tokens = 120,000 × 500 = 60M tokens
Output tokens = 120,000 × 200 = 24M tokens
Cost input cached = 60M × $0.10/M = $6
Cost output = 24M × $5/M = $120
TOTAL ≈ $126/mes a 5K MAU
```

A 7 MAU (hoy): ~$0.20/mes. Negligible.

### 5.2 Escenario "todo Tier 1 + 2"

Conversational Q&A es lo más caro (Sonnet + multi-turn). Cap a 10 turnos/día por user activo (10% del total):

```
A 5K MAU: 500 active conv users × 10 turns × 30 días = 150K turns
Avg turn: 2000 input + 800 output (con tool use)
Cost ≈ $600-900/mes
```

Total Tier 1+2 a 5K MAU: **~$700-1000/mes**. Razonable si el Asistente Pro está gated en monetization.

### 5.3 Trigger de decisión

| Métrica | Threshold para considerar LLM |
|---|---|
| MAU | ≥500 (antes no justifica setup) |
| Open-rate Asistente | ≥40% sesiones (signal de que el usuario lo busca) |
| Dismiss rate por copy default | ≥30% (signal de que el copy actual no engancha) |
| Bucket B monetización activo | Sí (ingreso para amortizar) |

Hoy ninguno se cumple. Por eso heurístico es la decisión correcta.

---

## 6. Recommended next steps SI se reabre

1. **Validar el dolor primero.** ¿Qué señales tienen el peor CTR? Esas son las candidatas a copy LLM (Tier 1.1). No empezar generalizado.
2. **Empezar con 1 señal cobaya** (e.g. `recovery-hard` que tiene loss/gain/neutral pero podría tener N variantes). Generar con LLM, A/B contra el copy hardcoded por 2 semanas.
3. **Medir CTR + dismiss rate + time-to-action**. Si la mejora justifica el costo, expandir. Sino, descartar y dejar heurístico.
4. **Bucket B (RevenueCat) tiene que estar live ANTES** de Tier 2 (Q&A, categorization). Sin monetización, el costo no se ata a revenue y la decisión se vuelve fragil.

---

## 7. Resumen ejecutivo

| Punto | Estado actual | Si reabrimos LLM |
|---|---|---|
| Lógica de qué señal disparar | Heurístico ✅ — quedarse | NO tocar, el LLM no decide qué disparar |
| Copy de las señales | Plantillas hardcoded + 4 con persona variants | **Punto #1 de augmentation** — copy dinámico por persona |
| Recovery plan synthesis | Genérico cuando se dispara super-perfect-storm | **Punto #2** — alto valor en momentos críticos |
| Anomaly explanation | Mudo cuando rompe múltiples patrones | **Punto #3** — para optimizers |
| Q&A conversacional | No existe | **Punto #4** — feature nuevo, gate a Pro |
| Categorización auto | No existe | **Punto #5** — UX win al cargar gastos |
| Causal narrative | "patrón viernes → sábado" plano | **Punto #6** — experimental |
| Proactive nudges | No existe | **Punto #7** — riesgoso, validar |
| Multi-language | Argentina only | **Punto #8** — post-launch |

**Decisión actual (2026-05-12):** mantenemos heurístico. Este doc espera al
momento donde MAU + monetización justifican introducir LLM.
