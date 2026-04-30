# 🗺️ Home — Mapa de slots disponibles

> Deliverable §4.2 del [Sprint 0 del roadmap](home-roadmap.md). Documenta las superficies del Home con capacidad y reglas de conflict resolution para que los Sprints 1-4 no choquen en producción.
>
> Snapshot 2026-04-29.

---

## 1. Slots actuales

Inventario tras la implementación P0/P1/P2/P3 del plan de remediación. Cada slot tiene una capacidad **dura** (cantidad máxima de elementos que puede sostener sin romper jerarquía).

| # | Slot | Ubicación física | Densidad actual | Capacidad libre | Tipo de elemento aceptado |
|---|---|---|---|---|---|
| **S1** | header | top, sobre family-strip | media (greeting + 3 botones) | 0 | — |
| **S2** | family-strip | sobre hero | media (avatares + payday-pill) | 1 chip extra | pill o chip 28pt |
| **S3** | hero overlay | dentro del hero card | alta (`Disponible` + 2 tiles) | 0 (saturado) | reemplazo de tile, no adición |
| **S4** | post-hero band | entre hero y MonthSummaryCard | vacío | 1-2 elementos | banda full-width o 1-2 chips inline |
| **S5** | MonthSummary chips | bajo cada panel (Variables / Fijos) | media (panel cap + trend) | 1 chip por panel (2 total) | chip pequeño 24pt o micro-text |
| **S6** | meta-card area | bajo MonthSummary | media (MetaCard o MetaEmptyCard) | 0 (slot ya tiene una card) | — |
| **S7** | pre-activity | sobre el header "ACTIVIDAD" | vacío | 1 banner contextual | banner dismissable |
| **S8** | activity footer | bajo Activity | vacío | 1 elemento permanente | strip o card secundario |

**Total capacidad agregable**: 5 elementos máximos. Si se sobrepasa, el hero deja de dominar visualmente y el Home se rompe (anti-pattern del propio inventario).

---

## 2. Asignación por Sprint del roadmap

| Sprint | Item | Slot asignado | Justificación |
|---|---|---|---|
| **1** | #17 Progress bar del ciclo | **S4** post-hero band | Slot vacío, slot full-width necesario para barra horizontal. Lectura natural después de "te quedan $X" → "estás en este punto del mes". |
| **2** | #7 Top category (probable) | **S5** bajo Variables panel | Panel ya muestra el total — agregar contexto categórico al lado correcto. |
| **2 alt** | #4 Próximo fijo | **S5** bajo Fijos panel | Análogo: el panel Fijos lista total, el chip dice "qué viene". |
| **3** | #3 Forecast simplificado | **S3** hero overlay | Reemplaza una tile (probablemente "vas a cerrar con") — no agrega densidad, sustituye. |
| **4** | #11 Fijos coverage | **S5** bajo Fijos panel (micro-text) | Si Sprint 2 usó S5/Fijos para Próximo fijo, Fijos coverage va como **micro-text en footer del panel** (no chip), o se mueve a S7. |
| **Banners contextuales** | #13 #14 #19 | **S7** pre-activity | Slot único compartido. Solo 1 a la vez. Sistema de prioridad necesario (ver §3.3). |
| **Long-tail** | #5 Trust Receipt | **S8** activity footer | Permanente, baja densidad visual, rol de "cierre" emocional al fin del scroll. |

**Slots no asignados**: S1 (header — saturado), S2 (family-strip — reservado para streak pill futuro), S6 (meta-card area — solo MetaCard).

---

## 3. Reglas de conflict resolution

### 3.1 Slot ya ocupado

Si dos items quieren el mismo slot, el orden de prioridad es:

1. **Crítico contextual** — banners que aparecen solo cuando hay urgencia (income-missing, recovery-hard) ganan automáticamente.
2. **Sprint en curso** — el item del Sprint que se está midiendo gana hasta cumplir o no su threshold.
3. **Confidence** — entre items contextuales del mismo nivel, gana el de mayor confidence (ej: forecast con `confidence ≥ 0.85` > causal link con `0.75`).
4. **Recencia** — entre empates, el item que el usuario no vio en los últimos 7 días gana. Evita repetir el mismo banner.

### 3.2 Slot S5 (MonthSummary chips) — reglas específicas

Cada panel (Variables / Fijos) puede tener **un solo elemento secundario activo**:

- **Variables**: Top category > Cap warning del Variable cap > vacío
- **Fijos**: Próximo fijo > Fijos coverage micro-text > vacío

Si Cap warning fire (categoría >80% del cap), reemplaza temporalmente al Top category mientras esté activa. Reglas de "active":

- Cap warning persiste mientras la categoría siga >80% del cap o hasta que se reinicie el ciclo.
- Top category vuelve cuando el warning se desactiva.

### 3.3 Slot S7 (pre-activity) — sistema unificado de banners contextuales

S7 es el ÚNICO slot para banners contextuales. Acepta máximo 1 a la vez. Implementación: un `<HomeContextualBanner />` que internamente decide qué mostrar usando esta prioridad:

```
1. income-missing            (urgency: alta, surface-immediately)
2. recovery-hard             (urgency: alta)
3. cap warning ≥80%          (urgency: media, día-de el cap)
4. forecast-payday-gap       (urgency: alta)
5. peor DoW pattern (#13)    (solo el día que aplica)
6. causal link top (#19)     (confidence ≥ 0.75, dismissable, 1 cada 7 días)
7. best win this cycle (#20) (1× por ciclo, post-cierre)
```

Si ninguno aplica → S7 vacío (sin filler).

**Dismissal**: cuando el usuario dismissea un banner, se persiste con TTL del signal correspondiente (ya manejado por `control-dismiss-store.ts`). El siguiente banner en la prioridad sube.

**Rate limit global**: máximo 1 banner nuevo por sesión Home. Si dismissé el de hoy, el próximo aparece la siguiente sesión.

### 3.4 Slot S2 (family-strip) — pill de racha

Si el RFC desbloquea #2 Streak, va a S2 al lado del payday-pill. S2 nunca sostiene 2 pills simultáneas — si streak entra, se mide su engagement. Si funciona, queda; si no, se retira y S2 vuelve a 0 chips extra.

---

## 4. Densidad acumulada esperada

Después de los 4 Sprints + sistema de banners:

| Slot | Pre-Sprint | Post-Sprint 4 |
|---|---|---|
| S1 header | 4 elementos | 4 elementos |
| S2 family-strip | 2 elementos | 3 elementos (+ streak pill si entra) |
| S3 hero | 3 elementos | 3 elementos (1 reemplazado) |
| S4 post-hero | 0 | 1 (progress bar) |
| S5 MonthSummary | 4 elementos | 6 elementos (+2 chips) |
| S6 meta-card | 1 | 1 |
| S7 pre-activity | 0 | 0-1 (contextual, transitorio) |
| S8 activity footer | 0 | 1 (Trust Receipt si entra long-tail) |
| **Total visible** | ~14 | ~17-19 |

**Anti-pattern threshold**: si Total visible supera 22, el Home está roto. Cada nuevo elemento que aspire a entrar después del Sprint 4 tiene que retirar a otro (criterio de retiro del RFC).

---

## 5. Estados vacíos por slot

Cada slot tiene comportamiento definido cuando su contenido natural no está disponible:

| Slot | Estado vacío |
|---|---|
| S2 streak pill | Esconder completamente (no placeholder). El payday-pill mantiene espacio. |
| S4 progress bar | Nunca vacío — siempre hay un día actual del ciclo. Estado degradado: ciclo no anclado → barra opaca con CTA "Confirmar cobro". |
| S5 Top category | Esconder si <2 semanas de historia. El panel queda con su trend pill solo. |
| S5 Próximo fijo | Esconder si no hay fijos cargados → reemplazar por CTA "Cargar tus fijos". |
| S5 Fijos coverage | Esconder si fijosMes = 0. CTA "Cargar tus fijos" prevalece. |
| S7 banner contextual | Esconder cuando no hay match en la prioridad. Sin filler. |
| S8 Trust Receipt | Esconder si totalActions === 0 (ya implementado). |

**Regla cross-slot**: nunca renderizar un slot con estado degradado / placeholder educacional. Si no hay contenido, esconder. La excepción es CTAs de setup (#fijos, #income-missing) cuando el dato falta porque el usuario no completó algo.

---

## 6. Cambios futuros — proceso

Antes de agregar un nuevo elemento a cualquier slot:

1. Identificar slot target en esta tabla.
2. Verificar capacidad libre — si está saturado, identificar candidato a retirar (per criterios del RFC §criterios de retiro).
3. Documentar el cambio en este doc en un PR separado del feature PR.
4. Threshold de retiro pre-acordado (per RFC).

Si el slot necesario no existe, **no se crea sin antes auditar la jerarquía visual del Home** — el cambio escala más allá de un Sprint.
