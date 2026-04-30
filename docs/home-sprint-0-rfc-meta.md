# 📋 Home — RFC: meta-decisiones del Sprint 0

> Deliverable §4.3 del [Sprint 0 del roadmap](home-roadmap.md). Resuelve las 4 preguntas que bloquean los Sprints 1-4 si no se contestan upfront: estados vacíos, criterios de retiro, segmentación por persona, definición de racha.
>
> Snapshot 2026-04-29. Decisiones que aplican cross-Sprint, no por item.

---

## D1. Estados vacíos — ¿qué ve el usuario que no tiene data suficiente?

**Pregunta**: usuario nuevo con 3 días de historia abre Home. ¿Qué pasa con velocity, forecast, vault, DoW patterns, causal links?

### Decisión

**Default: esconder el chip por completo**. Sin placeholder educacional, sin estado degradado.

Excepciones:

- **Setup-blocking** (income-missing, no fijos cargados): mostrar CTA explícita ("Configurá tu ingreso", "Cargar tus fijos"). Estos son setup, no fallback.
- **Progress bar del ciclo (#17)**: nunca vacío. Si el ciclo no está anclado, barra opaca con CTA "Confirmar cobro" (que abre el sheet existente).

### Razonamiento

- **Placeholder educacional** ("En 30 días vas a ver tu velocity") da la sensación de "esto está roto" — el usuario lo dismissea mentalmente y nunca vuelve a mirarlo. Es ruido sin valor.
- **Estado degradado** ("Pocos datos todavía") fuerza a renderizar un chip vacío que compite con el hero. El anti-pattern del propio inventario — densidad sin información.
- **Esconder** mantiene el Home limpio mientras el usuario gana data. Cuando alcanza el threshold, el chip aparece naturalmente — es un momento de progreso, no un fallback.

### Thresholds de aparición por item

| Item | Threshold mínimo |
|---|---|
| #1 Velocity / momentum | 14 días cerrados (ya gateado por `rampOneCycle`) |
| #3 Forecast | 7 días cerrados (engine ya retorna `null` debajo) |
| #7 Top category | 14 días + ≥10 transacciones discrecionales |
| #10 Vault | 7 días cerrados con cupo definido |
| #11 Fijos coverage | 1 fijo activo cargado |
| #13 DoW pattern | 21 días cerrados (`rampThreeWeeks`) |
| #19 Causal link | 21 días + confidence ≥ 0.75 |
| #20 Best win | 7 días cerrados |
| #2 Streak | ver D4 (definición pendiente) |

---

## D2. Criterios de retiro — ¿cuándo se va un chip que no funcionó?

**Pregunta**: agregamos un chip y a las 4 semanas <5% de usuarios interactúa. ¿Qué pasa?

### Decisión

**Cada PR de un nuevo item al Home debe declarar en su descripción**:

```
Threshold de retiro: TAP_RATE < {X}% en {N} semanas → retiro automático
Métrica de éxito secundaria: {dwell_time | derived_navigation | survey}
Owner del retiro: {nombre}
Próxima review: {fecha}
```

Sin estos campos en el PR description → el PR no se mergea.

### Thresholds default por tipo de elemento

| Tipo | Threshold de retiro | Plazo |
|---|---|---|
| **Chip accionable** (Top category, Próximo fijo, Vault) | tap_rate < 8% | 4 semanas |
| **Chip informativo** (Forecast simplified, Velocity) | tap_rate < 5% AND dwell_time < 800ms | 6 semanas |
| **Banner contextual** (DoW, cap warning, causal link) | dismiss_rate > 70% | 4 semanas (tras cumplir 200 vistas mínimas) |
| **Surface permanente sin tap** (progress bar, fijos coverage micro-text) | encuesta post-release con NPS-like ≤ 6/10 | 6 semanas |
| **Trust Receipt / refuerzo positivo** | mostrado_rate < 3% (post-30d) | 8 semanas |

### Loop de retiro

1. Cumplido el plazo, el owner revisa métricas.
2. Si threshold no se cumple, **se retira sin discusión** — el criterio se acordó upfront.
3. Si threshold se cumple, el chip queda permanente y libera al owner.
4. Si threshold queda en "borderline" (ej: 7.5% vs threshold 8%), se da 1 extensión de 2 semanas, no más.

**Regla anti-acumulación**: el Home no puede tener más de 22 elementos visibles totales (per slot map §4). Si el Sprint 5+ propone un chip nuevo y el Home está cerca del cap, hay que **retirar uno antes de agregar el nuevo**, aunque el viejo cumplía threshold. La pregunta no es "¿este chip funciona?" sino "¿este chip funciona MEJOR que el de menor performance?".

---

## D3. Segmentación por persona — ¿Home único o gateable?

**Pregunta**: persona ya existe en `useInteractionStats` + `inferPersona`. ¿Se usa para decidir qué chips aparecen en Home?

### Decisión

**Para Sprints 1-4: NO usar persona como gating en Home**. Mismo Home para todos.

**Decisión revisable post-Sprint 4** con datos reales de uso.

### Razonamiento

1. **Datos para inferir persona son parciales hoy**. La inference necesita ≥10 `advisor_interactions` registradas. Usuarios nuevos siempre son `'planner'` por default. Gatear contenido del Home por una persona inferida con 10 interacciones del asistente es prematuro.

2. **El Home tiene que funcionar para nuevos** sin sesgo. El mismo usuario puede pasar de `'avoider'` a `'planner'` en 3 semanas y el Home no debería cambiar drásticamente — confunde al mental model.

3. **Lo que sí va a usar persona**: el **tono del copy** (loss / gain / neutral framing) en chips que tengan copy variant — ya implementado en `control-signals-copy.ts`. Eso es transparente para el usuario y no requiere decisión arquitectónica.

4. **Override manual** sin gating es un setting "dead" — el usuario no tiene razón para tocarlo. Convertirlo en "elige qué chips ver" es complejidad sin valor demostrado.

### Cuándo revisitar

Después del Sprint 4 + 8 semanas de telemetría. Si la data muestra:

- Persona X tiene tap_rate < 50% del promedio en chip Y consistentemente → considerar gating de Y por persona.
- Persona X dismissea repetitivamente banner Z → revisar si Z debería aparecer para esa persona.

**No antes**. Decidir esto pre-data es over-engineering.

---

## D4. Definición de "racha" — ¿qué cuenta exactamente?

**Pregunta**: si #2 Streak entra al Home, ¿qué cuenta como un día de racha?

### Decisión

**Racha = días consecutivos cerrados en los que el gasto discrecional fue ≤ cupoDiario**.

Esta definición es la que ya usa `view.racha` en el código actual (`control-signals.ts > buildStreakEncouragement`). El RFC la ratifica explícitamente para que no haya ambigüedad cuando el chip suba a Home.

### Reglas de cálculo

| Caso | Racha cuenta |
|---|---|
| Día con $0 gastado | ✅ — gasto < cupo |
| Día con gasto ≤ cupo | ✅ |
| Día con gasto > cupo | ❌ rompe racha |
| Día con cupo no calculable (ej: ingreso = 0) | ⏸️ excluido del cálculo (no rompe ni suma) |
| Día actual (en curso, no cerrado) | ⏸️ excluido — racha solo de días cerrados |
| Día sin transacciones cargadas | ✅ asumimos $0 (matchea convención del producto) |

### Lo que NO cuenta como racha

- Días que abriste la app
- Días que registraste un gasto (cualquier gasto)
- Días de "no-spend" si el usuario olvidó cargar (esto es ambiguo pero se decide a favor del usuario por simplicidad)

### Reset

La racha se resetea cuando un día cerrado tuvo `gasto > cupo`. No se preserva con freeze tokens en V1.

**V2 future**: `freeze_tokens` (ya existe en `user_streaks` schema) puede usarse para "perdonar" un día. Cuando entre, el RFC se actualiza con criterios de gasto de tokens.

### Ambigüedad resuelta — under-spending no siempre es saludable

El doc original señaló: "no siempre under-spending es saludable". Resolución: **el chip de racha NO premia under-spending absoluto** — premia "estuvo dentro del cupo planeado". Si el usuario configuró un cupo realista, mantenerse en él ES saludable. Si el cupo es absurdamente bajo, el problema es la configuración del cupo, no la racha. Out of scope.

---

## D5. Telemetría — qué stack usar para medir todo lo anterior

**Pregunta no estaba en el RFC original** pero emerge porque el proyecto **no tiene SDK de analytics** instalado (sin PostHog, Mixpanel, Amplitude, Firebase Analytics). El cognitive layer ya implementó un pattern propio: `log_advisor_interaction` → tabla Supabase + RPC.

### Decisión

**Reusar el pattern de `advisor_interactions`** para telemetría del Home. Crear tabla `home_telemetry` con shape parecida + RPC `log_home_event()`.

Detalles en [home-sprint-0-telemetry-spec.md](home-sprint-0-telemetry-spec.md).

### Razonamiento

1. **Costo $0** — no SDK fees, no third-party data sharing.
2. **Privacy-first** — los datos quedan en nuestra infra, sujetos a RLS, controlables.
3. **Pattern probado** — `advisor_interactions` ya funciona, conoce los pitfalls (RLS policies, cron pruning, fire-and-forget).
4. **Sin nueva dep nativa** — no necesitamos rebuild para shippear el Sprint 0.

**Trade-off conocido**: perdemos features avanzadas de un SDK comercial (funnels visuales, retention curves automáticas, A/B framework). Para el scope del Sprint 0 (4 Sprints, 4-6 elementos a medir, 8-12 semanas) no las necesitamos. Si en 6+ meses el equipo crece y la complejidad de análisis lo amerita, **se evalúa instalar PostHog o similar** y migrar la tabla a un schema compatible.

---

## Resumen ejecutivo

| Decisión | Resolución |
|---|---|
| **D1 Estados vacíos** | Esconder el chip cuando no hay data. Sin placeholder educacional. CTAs solo para setup-blocking. |
| **D2 Criterios de retiro** | Cada PR declara threshold + plazo + owner. Defaults: chip accionable 8%/4w, informativo 5%+800ms/6w, banner 70% dismiss/4w, permanente NPS 6/10/6w, refuerzo 3%/8w. Cap total 22 elementos. |
| **D3 Persona gating** | NO en Sprints 1-4. Persona se usa solo para tono del copy. Revisable post-Sprint 4 con data. |
| **D4 Racha** | Días consecutivos cerrados con `gasto ≤ cupoDiario`. Día actual excluido. Días sin tx cuentan como $0 (gasto < cupo). Reset al primer día sobre cupo. |
| **D5 Telemetría stack** | Reusar pattern `advisor_interactions`. Tabla `home_telemetry` + RPC `log_home_event()`. Sin SDK comercial. |

---

## Aprobación requerida

Cada decisión bloquea Sprints específicos hasta ser firmada:

- **D1, D2** — bloquean cualquier Sprint que ship-ee elementos visibles.
- **D3** — bloquea solo Sprints que quieran gatear contenido por persona (ninguno en el roadmap actual — desbloqueado).
- **D4** — bloquea el desbloqueo de #2 Streak del backlog.
- **D5** — bloquea el Sprint 0 §4.1 (telemetría).

Decisión meta: este RFC se firma 1× y queda como referencia. Si una decisión se revisita, abrir un RFC nuevo con número incremental, no editar este.
