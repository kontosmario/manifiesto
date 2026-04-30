# 🏠 Home — Propuesta de roadmap (auditoría del inventario)

> Análisis crítico del documento "Información disponible que hoy no estamos mostrando" + propuesta de re-priorización.
>
> Snapshot 2026-04-29. Asume que la implementación P0/P1 del plan de remediación ya está hecha o en curso.

---

## TL;DR

El inventario de 20 items es exhaustivo y está bien fundamentado en datos ya disponibles en cache. Pero **el plan de adición tal como está propuesto tiene 4 problemas estructurales** que conviene resolver antes de tocar código:

1. **Sprint 1 viola el anti-pattern del propio documento** — propone agregar 3 chips a la vez después de advertir explícitamente que no hay que hacerlo.
2. **Es un inventario de oferta, no de demanda** — prioriza por "qué tenemos disponible" sin pasar por "qué pregunta del usuario resuelve".
3. **Hay items redundantes entre sí** — Velocity ↔ Forecast, Streak ↔ Vault, Notifications preview ↔ Bell.
4. **Falta el meta-trabajo** — estados vacíos, mapa de slots, criterios de retiro, segmentación por persona.

La propuesta de este documento: **un Sprint 0 de pre-trabajo** (1 semana de telemetría + meta-decisiones), después **un solo item por Sprint** durante 4 sprints, midiendo antes de continuar.

---

## 1. Lo que está bien del inventario original

Antes de las críticas, vale reconocer lo sólido:

- **Filtro "todo en cache, sin round-trips"** — define un ceiling de costo claro. 14 de 20 items no requieren network nuevo.
- **Sección de anti-patterns** — "no reemplazar el hero, solo enriquecerlo" es la regla correcta para mantener la jerarquía visual del Home.
- **Flag de conflict signals** — la advertencia sobre Velocity calm contradiciendo Forecast pessimista muestra que se pensó el problema sistémico, no solo items aislados.
- **#18 Persona como "no agregar UI, sí usar para tono"** — exactamente el criterio que evita feature creep.
- **Tier 5 explícito** — listar lo que NO vale la pena surfacear es tan importante como listar lo que sí.

---

## 2. Problemas con el plan propuesto

### 2.1 Sprint 1 viola el anti-pattern del propio documento

El doc dice en la sección de anti-patterns:

> "No agregar todo a la vez — la fortaleza actual del Home es que el hero domina visualmente. 6+ chips compiten con esa jerarquía."

Y después propone Sprint 1 con **tres chips nuevos** simultáneos (#1 Velocity + #2 Streak + #4 Próximo fijo). Tres elementos visuales nuevos en una sola release **es** agregar todo a la vez en escala reducida. Y peor: si los 3 fallan en engagement, no sabemos cuál fue, y si los 3 funcionan, tampoco sabemos cuál llevó el peso.

**Sprint 1 debería ser un solo item con telemetría.**

### 2.2 Es un inventario de oferta, no de demanda

Los 20 items están priorizados por "qué tenemos disponible en cache" sin pasar por "qué pregunta del usuario resuelve al abrir el Home". Para cada item Tier 1 deberíamos poder responder:

- ¿Qué porcentaje de usuarios abre el Home y se va sin la respuesta que necesitaba?
- ¿Cuál es el primer tap que hacen después de aterrizar?
- ¿Cuántos vuelven a abrir el Home en la misma sesión (señal de que no encontraron lo que buscaban)?

Sin ese dato, la priorización es educated guess. Una semana de telemetría sobre el Home actual reordena el inventario por completo.

### 2.3 Items redundantes

**#1 Velocity y #3 Forecast son redundantes.** Si tenés un sparkline de 7 días con baseline/optimista/pesimista, el momentum es derivable visualmente — la pendiente de la línea ES la velocity. Tenerlos a los dos crea dos sources of truth que pueden contradecirse y duplicar contenido cognitivo. Elegir uno: Forecast comunica más en el mismo espacio.

**#2 Streak y #10 Vault premian lo mismo.** Streak (días sin gastar discrecional) y Vault (ahorro acumulado por estar bajo cupo) son la misma señal expresada de dos formas. Mostrar ambas duplica el incentivo de under-spending sin agregar información.

Más crítico: el doc no aclara **qué cuenta** la racha. ¿Días sin gastos discrecionales? ¿Días que abriste la app? ¿Días que registraste un gasto vs no? La diferencia es enorme. Si premia "días sin gastar", en una app de finanzas eso es ambiguo — no siempre under-spending es saludable. Esa decisión hay que tomarla antes de surfacearlo.

**#15 Notifications preview duplica el bell.** El bell ya da el feed completo a un tap. Si el bell no es suficiente, el fix es mejorar el bell (preview en hover, label en el icon, dot con kind), no agregar una segunda superficie de notificaciones en Home. Esto es deuda visual sin upside.

### 2.4 Items subestimados (subir de tier)

| Item original | Tier original | Tier propuesto | Por qué |
|---|---|---|---|
| #17 Progress bar del ciclo | T3 | **T1** | Probablemente la adición de mayor valor por menor costo de toda la lista. Cambia el mental model de "faltan 12 días" (número abstracto) a "estoy en este punto del ciclo" (estado visual). Una sola pieza, baja densidad. |
| #7 Top category | T2 | **T1** | Si encuestás usuarios sobre qué quieren saber al abrir una app de finanzas, "¿en qué se me va la plata?" está top 3. Hoy obliga a navegar a Variables. |
| #11 Fijos coverage | T2 | **T1** | "Fijos cubren del 1 al 12 · libres del 13 al 30" es insight transformador — cambia "fijos = total $X" a "fijos = ocupan tu mes". El doc lo trata como polish. |

### 2.5 Items con riesgo no resuelto

**#12 Member spending balance.** El doc reconoce el riesgo ("fricción interpersonal") pero no propone resolución. En una app familiar, "vos 60% / pareja 40%" puede generar peleas reales. Este item necesita:

- Opt-in explícito de ambos miembros antes de mostrar
- Framing de "balance" no "comparación" (ej: "balance del hogar" sin números individuales por defecto)
- Test cualitativo con 5-10 familias reales antes de release

Sin eso, no es Tier 2 — es backlog hasta tener research.

**#19 Causal link en Home.** "Patrón detectado: viernes → sábado +35%" es poderoso pero contamina rápido si fire mal. Necesita guardrails concretos:

- Confidence ≥ 0.75 (no 0.7 — el upside de un mensaje correcto no compensa el downside de uno incorrecto en este contexto)
- Dismissal por usuario que persiste
- Rate limit: máximo 1 a la vez, 1 nuevo cada 7 días
- Telemetría de "fue útil/no fue útil" inline (thumbs)

El doc lo menciona como riesgo sin proponer guardrails. Sin guardrails, no debería salir.

---

## 3. Lo que falta en el plan

### 3.1 Estados vacíos para new users

Un usuario nuevo con 3 días de historia no puede ver velocity, ni forecast, ni causal links, ni vault, ni DoW patterns — todos requieren 30+ días de data. ¿Qué ve ese usuario en Home?

El plan no lo aborda. Sin estados vacíos diseñados, el Home de new users termina con chips dormidos o vacíos que parecen bugs. Decisiones a tomar:

- ¿Esconder el chip hasta que haya data suficiente?
- ¿Mostrar un placeholder educacional ("En 30 días vas a ver tu velocity")?
- ¿Mostrar el chip con un estado degradado ("Pocos datos todavía")?

La respuesta debería ser consistente entre items, no decidida ad-hoc.

### 3.2 Criterios de retiro

Si agregás un chip y a las 4 semanas <5% de usuarios interactúa, ¿qué pasa? El plan no tiene loop de remoción. Esto crea acumulación: cada feature suma, ninguna resta. En 6 meses el Home está saturado y nadie tiene autoridad para limpiar.

**Propuesta**: cada item nuevo se releasea con un threshold de retiro pre-acordado. Ej: "si <8% de usuarios tap-ea este chip en 4 semanas, se remueve". Forzar la decisión upfront elimina la inercia de "ya está, dejémoslo".

### 3.3 Métrica de éxito por item

Cada chip debería tener una métrica explícita antes del release:

- **Tap rate** — % de sesiones en Home que generan tap en el chip
- **Dwell time** — tiempo que el chip retiene la mirada (proxy: tiempo entre aparecer en viewport y siguiente acción)
- **Navegación derivada** — % de taps que llevan a una acción concreta vs solo curiosidad

Sin esto, no hay forma de saber si el chip funcionó.

### 3.4 Mapa de slots disponibles

El doc dice "chip cerca del hero" o "debajo de MonthSummaryCard" sin contar slots. Hoy el Home tiene un número finito de superficies:

| Slot | Ubicación | Densidad actual | Capacidad |
|---|---|---|---|
| family-strip | top, sobre hero | media | 1 chip extra |
| hero overlay | dentro del hero card | alta (hay 2 tiles) | 0 — saturado |
| post-hero band | entre hero y MonthSummaryCard | vacío | 1-2 elementos |
| MonthSummaryCard chips | bajo cada panel | media | 1 chip por panel |
| pre-activity | sobre Activity header | vacío | 1 banner contextual |
| activity footer | bajo Activity | vacío | 1 elemento permanente |

Cada item necesita slot asignado y conflict resolution si dos items quieren el mismo. Sin ese mapa, los Sprints chocan en producción.

### 3.5 Segmentación por persona

Persona ya existe en `/settings/asistente` pero no se usa para gating en Home. Un "minimalista" no quiere ver 6 chips. Un "power user" sí.

Decisión a tomar: ¿el Home es único para todos, o gateable por persona? La respuesta correcta probablemente es **default por persona + override del usuario en settings**. Esa decisión arquitectónica conviene tomarla antes de empezar a agregar chips.

---

## 4. Sprint 0 — Pre-trabajo (1 semana)

> **Estado** (2026-04-29): Sprint 0 IMPLEMENTADO end-to-end. Telemetría live en Supabase remoto (2 migrations aplicadas), 9 elementos del Home actual instrumentados, 7 baseline events fluyendo, 10 tests pasan, 4 P0/P1 del code-review aplicados.
>
> Falta solo: capturar 5-7 días de baseline sobre el Home actual y producir la matriz de demanda (queries §5.1-§5.4 del spec) para reordenar los Sprints 1-4 con data en mano.
>
> Documentos:
> - [home-sprint-0-telemetry-spec.md](home-sprint-0-telemetry-spec.md) — eventos, schema, RPC, cliente, queries de análisis · ✅ implementado
> - [home-sprint-0-slot-map.md](home-sprint-0-slot-map.md) — 8 slots con capacidad y reglas de conflict resolution · referenced en wiring
> - [home-sprint-0-rfc-meta.md](home-sprint-0-rfc-meta.md) — D1 estados vacíos, D2 retiro, D3 persona, D4 racha, D5 stack telemetría · firmable

Antes de tocar código del Home, una semana de trabajo no-visible que descomprime todos los Sprints siguientes:

### 4.1 Telemetría sobre el Home actual

Capturar durante 5-7 días:

- Tap rate por elemento existente (hero, family-strip, MonthSummaryCard variables/fijos, MetaCard, cada Activity row, "Ver todos")
- Sesiones que abren Home y cierran sin tap (% de "rebote")
- Primer tap después de aterrizar en Home (heatmap de intención)
- Re-aperturas de Home en la misma sesión (señal de "no encontré lo que buscaba")
- Tiempo medio en Home antes del primer tap

Output: una matriz que dice "los usuarios abren el Home buscando X, Y, Z" — esto reordena el inventario por evidencia.

### 4.2 Mapa de slots con capacidad

Documento corto (1 página) con la tabla de §3.4 + reglas de conflict resolution. Si dos items quieren el mismo slot, ¿cuál gana? ¿Por persona? ¿Por relevancia contextual?

### 4.3 Decisiones meta

Tomar y documentar (en RFC corto, no en chat):

- **Estados vacíos**: ¿esconder, placeholder educacional, o estado degradado? Default cross-item.
- **Criterios de retiro**: threshold de tap rate y plazo de evaluación.
- **Segmentación por persona**: ¿gating por persona con override, o Home único?
- **Definición de "racha"**: si #2 Streak entra al backlog, ¿qué cuenta exactamente?

### 4.4 Aclaraciones de items con riesgo

Para los items con riesgo no resuelto (#12 Member balance, #19 Causal links), bloquearlos del roadmap hasta que su research esté hecho. No deben aparecer en sprints planificados sin guardrails definidos.

---

## 5. Roadmap propuesto (post Sprint 0)

**Regla**: un solo item nuevo por sprint, 2 semanas de medición antes del siguiente. Si las métricas no cumplen el threshold, no avanzamos al siguiente — iteramos o retiramos.

### Sprint 1 — Progress bar del ciclo (#17) ❌ retirado 2026-04-29

**Decisión post-merge**: el chip de payday del hero card ya cubre la información temporal del ciclo ("En N días" / "Cobrás hoy"). La barra de progreso era redundante con esa señal y agregaba ruido vertical sin aportar dato nuevo. Componentes, helpers y tests eliminados. `cycle_progress_bar` removido del enum de telemetría.



**Por qué primero**: bajo costo de implementación (slot vacío entre hero y MonthSummary, 1 elemento, no compite con el hero), alto impacto cognitivo (cambia mental model), no requiere data nueva.

**Slot**: post-hero band (S4).

**Métrica de éxito**: ningún tap rate específico (es contextual, no accionable). En vez, medir si reduce re-aperturas de Home en la misma sesión (proxy de "el usuario entendió dónde está sin tener que insistir").

**Estado vacío**: no aplica — siempre hay un día actual del ciclo. Excepción: cuando `paydayPending=true`, la barra se atenúa (0.92 opacity) y muta a CTA "Cobrá hoy" → abre el cycle prompt sheet.

**Implementación shipped**:

| Componente | Archivo | Detalle |
|---|---|---|
| Componente | `home-cycle-progress.tsx` | Barra horizontal animada con `withTiming(scaleX, 700ms, ease-out cubic)` + `transformOrigin: 'left'`. `React.memo`. Reduced-motion respetado. Tabular nums. `maxFontSizeMultiplier: 1.4`. |
| Helpers puros | `home-cycle-progress-helpers.ts` | `computeCycleProgress` (clamp + floor) + `cycleProgressLabels` (headline/sub/a11y por estado). Sin RN deps. |
| Wiring | `home-dashboard.tsx` | `<HomeCycleProgress />` entre HeroCard y MonthSummary. `useTrackElement` con `elementId='cycle_progress_bar'`, `slot='S4'`. `onPress` solo seteado cuando `paydayPending=true` → `handleChipConfirm`. |
| Tests | `tests/unit/home-cycle-progress-helpers.test.ts` | 12 tests: normal mid-cycle, clamp 0/negative/past-total, floor, last-day → "Último día", first-day, plural/singular "día", payday-pending consistency. |

**Code-review fixes aplicados (post-review)**:

- **P0-1** Guard sessionId vacío en `useTrackElement` — early-return en effect + onTap + onDismiss
- **P1-1** "Faltan 0 días" → "Último día del ciclo" en remaining=0
- **P1-2** `accessibilityValue.text` con "X de Y" en lugar de "X/Y" (VoiceOver no lee "slash")
- **P2-1** `useTrackElement` retorna handle memoizado (`useMemo`) — fix correctness del `React.memo` del componente

**Estado actual**: 22 tests pasan (12 nuevos del progress + 10 del telemetry helper anterior). Type-check limpio. 190/195 tests del suite total — 5 fails idénticos a `main`, sin regresiones.

**Próximo paso de medición**: con la telemetría del Sprint 0 ya live, el progress bar emite `home.element_shown` cuando entra al viewport (1 vez por sesión vía `SHOWN_KEYS` Map). Tap solo en estado paydayPending. Esperar 2 semanas + analizar reducción de re-aperturas Home/sesión vs baseline.

### Sprint 2 — Top category Y Próximo fijo (#7 + #4) ✅ shipped 2026-04-29

**Decisión**: en lugar de elegir uno u otro, se shipped **ambos** porque viven en sub-slots diferentes (Variables panel vs Fijos panel) y no compiten visualmente. La decisión "cuál priorizar" desaparece — la telemetría va a medir cada chip independientemente y los criterios de retiro deciden.

**Slot**: S5 chip bajo cada panel del MonthSummaryCard.

**Métrica de éxito**: tap rate ≥ 12% sobre sesiones, navegación derivada > 60%.

**Estado vacío**:
- Top category: usuarios <14 días o con <4 transacciones del ciclo no ven el chip.
- Próximo fijo: usuarios sin fijos activos con vencimiento en los próximos 14 días no ven el chip.

**Implementación shipped (2A — Top category)**:

| Componente | Archivo | Detalle |
|---|---|---|
| Helpers puros | `home-top-category-helpers.ts` | `computeTopCategory` (filtra cycle window + skip commitment_id + threshold de 14d/4tx) y `formatTopCategoryShare`. |
| Tests | `tests/unit/home-top-category-helpers.test.ts` | 9 tests: top match, threshold gates, commitment_id skip, cycle window exclusion, "Sin categoría" fallback, format share. |

**Implementación shipped (2B — Próximo fijo)**:

| Componente | Archivo | Detalle |
|---|---|---|
| Helpers puros | `home-next-fixed-helpers.ts` | `computeNextFixed` (active + within horizon 14d) y `formatDaysUntilDue` (Vence hoy / Mañana / En N días). Reusa `parseFixedExpenseDate` para evitar el bug timezone. |
| Tests | `tests/unit/home-next-fixed-helpers.test.ts` | 10 tests: soonest + horizon + inactive skip + past-due skip + same-day handling + format. |

**Refactor follow-up — chips unificados al MonthSummaryCard (2026-04-29)**: los componentes standalone `home-top-category-chip.tsx` y `home-next-fixed-chip.tsx` se reemplazaron por sub-rows internas de cada panel del `MonthSummaryCard`. Cada panel ahora tiene dos zonas de tap independientes (head + chip), separadas por divider hairline, sin Pressables anidados. La pill existente (`↑12% vs mes anterior` / `X pendientes`) se reemplaza por el chip cuando hay datos; cuando no, vuelve la pill. `✓ Todos pagados` siempre gana sobre el chip de próximo fijo. Telemetría intacta — los element_ids `top_category_chip` y `next_fixed_chip` siguen disparando con el mismo slot S5 desde el handler interno del panel.

**Bug class fix descubierto durante esta Sprint** (P0 del code-review aplicado): `new Date('YYYY-MM-DD')` se parsea como UTC midnight → en zonas UTC- los fijos aparecen vencidos 24h antes. Fix:
- `forecast-engine.ts:148` (fixed-payments en 7d window) — migrado a `parseFixedExpenseDate`
- `control-signals.ts:559` (signal `stress-week`) — migrado a `parseFixedExpenseDate`

### Sprint 3 — Forecast simplificado (descartando #1 Velocity) ✅ shipped 2026-04-29

**Por qué descartar Velocity**: redundante con Forecast. La pendiente del forecast ES la velocity. Mostrar ambos duplica señal y crea riesgo de contradicción.

**Slot**: hero overlay — enriquece la tile "Vas a cerrar con" con flecha de tendencia + delta vs ciclo anterior.

**Métrica de éxito**: tap rate ≥ 8% (informativo más que accionable).

**Estado vacío**: usuarios <30 días o sin baseline previo ven el fallback "si seguís este ritmo" existente.

**Implementación shipped**:

| Componente | Archivo | Detalle |
|---|---|---|
| Hero card edits | `home-hero-card.tsx` | Nueva prop `projectedCloseTrend?: number \| null`. Cuando provista AND `projectionReliable`, render de flecha `trending-up/down/flat` + signed % vs ciclo anterior. Color codificado: peach para positivo (más gasto = peor), mint para negativo. Estilo `tileTrendRow` con `gap: 3` y tabular nums. Fallback "si seguís este ritmo" preservado. |
| Wiring | `home-dashboard.tsx` | `<HomeHeroCard projectedCloseTrend={homeMetrics.monthSummary.variableTrend} />`. `useTrackElement` con `elementId='forecast_summary'`, `slot='S3'`, `isVisible: projectionReliable && variableTrend != null`. |

### Sprint 4 — Fijos coverage (#11) ❌ retirado 2026-04-29

**Decisión post-merge**: el insight "fijos ocupan N de 30 días" no resultó accionable ni cambió el mental model en uso real. El panel Fijos del MonthSummary ya comunica el peso vía total + status pill ("X pendientes" / "✓ Todos pagados"); la traducción a días era ruido informativo extra. Componentes, helpers y tests eliminados. `fijos_coverage_microtext` removido del enum de telemetría.



**Por qué cuarto**: insight transformador pero requiere los 3 anteriores como contexto. Una vez que el usuario entendió ciclo (Sprint 1) y dónde se va la plata (Sprint 2), "Fijos ocupan 12 de 30 días" tiene un marco mental para asentarse.

**Slot**: micro-text bajo MonthSummaryCard, debajo del próximo fijo chip.

**Métrica de éxito**: informativo puro, no accionable. Medir survey post-release ("¿este Home te ayuda a entender mejor tu mes?") más que tap rate.

**Estado vacío**: render null cuando income no configurado, sin fijos cargados, o coveredDays = 0 (signal degenerado).

**Implementación shipped**:

| Componente | Archivo | Detalle |
|---|---|---|
| Helpers puros | `home-fijos-coverage-helpers.ts` | `computeFijosCoverage` con grammar agreement Spanish completa (singular "1 día libre" vs plural "N días libres"). |
| Componente | `home-fijos-coverage.tsx` | `accessibilityRole="text"` no-interactive. 11pt mono caption, marginTop 6. |
| Tests | `tests/unit/home-fijos-coverage-helpers.test.ts` | 7 tests: standard, singular/plural completos, gates (income / hasFijos / coveredDays=0), clamps, floor. |

### Resumen consolidado de los 4 Sprints

**Estado final post-cleanup (2026-04-29)**: 2/4 Sprints retenidos (2A Top category + 2B Próximo fijo, ambos absorbidos en MonthSummaryCard como sub-rows del panel correspondiente). Sprint 1 (cycle progress) y Sprint 4 (fijos coverage) eliminados completamente por redundancia. Sprint 3 (forecast trend) se mantiene integrado al hero. Tests post-cleanup: 196/201 pass — 5 fails idénticos a `main`, 0 nuevas regresiones.

**Code-review consolidado** (Sprints 2-4) aplicó:

- **P0**: bug class `parseLocalDate` propagado a `forecast-engine.ts:148` + `control-signals.ts:559` (mismo bug del Sprint 2B, mismo fix con `parseFixedExpenseDate`)
- **P1-2**: grammar Spanish "1 día libre" (singular agreement completo)
- **P1-4**: comment explícito sobre el contrato `categoryId: ''` en Top category helper

**Wiring de telemetría completado** — los 5 nuevos elementos del Home (1 del Sprint 1 + 4 de Sprints 2-4) reportan eventos en el sistema del Sprint 0:

| Element | Slot | Sprint | Eventos |
|---|---|---|---|
| `cycle_progress_bar` | S4 | 1 | shown + tapped (solo en paydayPending) |
| `top_category_chip` | S5 | 2A | shown + tapped (→ /expenses filtrado) |
| `next_fixed_chip` | S5 | 2B | shown + tapped (→ /fixed-expenses focused) |
| `forecast_summary` | S3 | 3 | shown |
| `fijos_coverage_microtext` | S5 | 4 | shown |

### Backlog explícito (no entran al roadmap hasta resolver bloqueos)

| Item | Bloqueo | Acción para desbloquear |
|---|---|---|
| #2 Streak | Definición de qué cuenta + decisión sobre si premiar under-spending | RFC corto en Sprint 0 |
| #5 Trust Receipt | Probablemente debería ser notificación mensual, no permanente en Home | Re-evaluar el slot correcto |
| #12 Member balance | Riesgo de fricción interpersonal | Research con 5-10 familias + opt-in design |
| #19 Causal links | Sin guardrails | Confidence threshold + dismissal + rate limit |
| #20 Best win this cycle | Frecuencia de aparición no clara | Definir cadencia (1×/ciclo según el doc, validar) |

### Descartados explícitamente

| Item | Razón |
|---|---|
| #1 Velocity (como chip independiente) | Redundante con #3 Forecast |
| #10 Vault (como chip permanente) | Redundante con #2 Streak. Si #2 entra y funciona, este no aporta. |
| #15 Notifications preview | Duplica el bell. Si bell no es suficiente, fix bell. |

### Solo cuando aplique con guardrails (no permanentes)

Estos no son chips fijos del Home, sino banners contextuales que aparecen cuando hay condiciones específicas:

- **#13 Peor DoW pattern** — solo el día que aplica, máximo 1×/semana
- **#14 Cap warnings** — solo cuando una categoría está ≥80% del cap, máximo 1 a la vez
- **#19 Causal links** — solo con confidence ≥ 0.75, dismissable, 1 cada 7 días

Implementar como sistema unificado de "contextual banners" después del Sprint 4, no como items individuales.

---

### Cuenta de testing del Home (shipped 2026-04-29)

Migración: `supabase/migrations/20260503000000_seed_home_test_account.sql`. Creada para QA manual de los 5 elementos shipeados en este roadmap, usando **el mismo set de categorías por defecto** que recibe un usuario real al darse de alta (`category_templates` consolidado en 18 expense + 8 fixed_expense).

| Campo | Valor |
|---|---|
| Email | `home.test@manifiesto.app` |
| Password | `HomeTest2026` |
| Family code | `HOMETEST` |
| Income / Savings | 2.5M / 500K (20%) ARS |
| Salary day | 1 (cycle = mes calendario, ya confirmado) |

**Datos sembrados**:

- **Variables**: 45 días de gastos (~80–100 transacciones, sesgo Mercado para que Top category tenga ganador claro).
- **Fijos** (5 activos, ≈892K mensuales): Spotify (mañana, peach imminent), Tarjeta Visa (today+5), Prepaga (today+8), Internet+celular (today+11), Alquiler (today+14, borde del horizonte). Pagos: dos ciclos previos completos, ciclo actual sin pagar.
- **Savings goal**: "Vacaciones 2027" (1.2M target, 320K acumulados).

**Cobertura por sprint**:

| Sprint | Element | Estado verificable con esta cuenta |
|---|---|---|
| 1 | `cycle_progress_bar` | Día ~29/30 del ciclo, salario confirmado → barra en estado normal (no paydayPending). |
| 2A | `top_category_chip` | ≥28 días cerrados + ≥40 transacciones → gate satisfecho, Mercado gana. |
| 2B | `next_fixed_chip` | Spotify mañana → renderiza con tono peach (imminent). |
| 3 | `forecast_summary` (trend) | Ciclo previo cerrado + 30+ días de historia → engine proyecta y compara cycle-over-cycle. |
| 4 | `fijos_coverage_microtext` | Income + fijos activos → renderiza ~11 días cubiertos / 19 libres. |

Idempotente: re-correr la migración no duplica el seed.

---

## 6. Impacto esperado

Si se sigue este roadmap (Sprint 0 + 4 sprints + iteración):

| Eje | Mejora esperada | Cómo se mide |
|---|---|---|
| Comprensión temporal del ciclo | "¿En qué momento del mes estoy?" responde de un vistazo | Reducción de re-aperturas Home/sesión |
| Comprensión de gastos | "¿En qué se me va la plata?" responde sin navegar | Tap rate de Top category + reducción de navegación a Variables |
| Visión predictiva | Home deja de ser solo retrospectivo | Tap rate de Forecast + survey de utilidad percibida |
| Mental model de fijos | "Los fijos no son un total, son un período" | Survey post-release |
| Densidad del Home | Controlada — máximo 4 elementos nuevos en 2 meses | Inventario explícito + criterios de retiro activos |
| Engagement de new users | Sin chips rotos o vacíos en estado early | Estado vacío diseñado por item |

**Total**: Home más legible, más predictivo, sin perder la jerarquía visual del hero, con loop de evaluación explícito que evita acumulación silenciosa.

---

## 7. Resumen de decisiones clave

1. **Sprint 0 obligatorio antes de cualquier código** — telemetría + meta-decisiones + mapa de slots.
2. **Un item por sprint, no tres** — respeta el anti-pattern del propio inventario.
3. **Reorden de tiers** — #17 Progress bar, #7 Top category y #11 Fijos coverage suben a T1; #1 Velocity y #15 Notifications preview se descartan.
4. **Backlog explícito con bloqueos** — items con riesgo no resuelto no entran al roadmap hasta resolver bloqueo.
5. **Contextual banners como sistema unificado** — #13, #14, #19 no son chips, son un sistema separado con guardrails compartidos.
6. **Criterios de retiro upfront** — cada item nuevo se releasea con threshold de remoción pre-acordado.
7. **Persona como gating** — decisión arquitectónica antes de agregar chips.

---

## 8. Próximos pasos concretos

Si el equipo está alineado con esta propuesta, la primera semana se ve así:

1. Día 1-2: setup de telemetría sobre Home actual.
2. Día 2-3: documentar mapa de slots con capacidades.
3. Día 3-4: RFC sobre estados vacíos, criterios de retiro, segmentación por persona, definición de racha.
4. Día 5-7: análisis de telemetría, decisión final del orden de Sprints 1-4 con data en mano.

Recién al final de esa semana tiene sentido empezar Sprint 1.

---

## 9. Anexo — Cross-reference con UI/UX rules (skill `ui-ux-pro-max`)

Cada Sprint toca una o más Quick Reference categories. Antes del merge, cada uno tiene que pasar el subset relevante del Pre-Delivery Checklist.

### Sprint 1 — Progress bar del ciclo

| Quick Reference | Aplica | Por qué |
|---|---|---|
| §1 `color-not-only` | ✅ | El progreso no puede comunicarse solo por color de la barra — agregar texto inline ("día 12 de 30") y/o icono de marker |
| §6 `color-accessible-pairs` | ✅ | Fill vs background ≥3:1; el marker de "hoy" ≥4.5:1 contra el fill |
| §7 `transform-performance` + `motion-meaning` | ✅ | Si la barra anima al cambiar de día, usar `transform: scaleX` con duración 200–300ms; la animación expresa "pasó un día" |
| §6 `number-tabular` | ✅ | "Día 12 / 30" debe usar tabular-nums para que el número no tiemble |
| App Common Rules — Layout / `8dp spacing rhythm` | ✅ | Espaciado del slot post-hero debe respetar el ritmo 8dp ya establecido en el resto del Home |

**Out-of-scope para Sprint 1**: animación de entrada (`stagger-sequence`) — la barra ya entra con el `RiseView` del wrapper, no necesita su propia entrada.

### Sprint 2 — Top category / Próximo fijo

| Quick Reference | Aplica | Por qué |
|---|---|---|
| §2 `touch-target-size` | ✅ | El chip es tappable — debe medir ≥44×44pt (extender hitSlop si visualmente es más chico) |
| §4 `no-emoji-icons` + `icon-style-consistent` | ✅ | El icono de la categoría debe ser SVG (Material/Lucide) — no emoji. Mismo stroke width que el resto del Home |
| §6 `truncation-strategy` | ✅ | Nombres de categoría largos ("Restaurantes y comida") wrapean en 2 líneas o truncan con ellipsis |
| §1 `aria-labels` / `accessibilityLabel` | ✅ | "Restaurantes lidera, 32% del ciclo. Tap para ver detalle" |
| §10 `pattern-texture` | ⚠️ | Si en el futuro se muestra mini-bar comparativa, NO comunicar solo por color (colorblind-safe) |

### Sprint 3 — Forecast en hero overlay

| Quick Reference | Aplica | Por qué |
|---|---|---|
| §10 `chart-type` + `screen-reader-summary` | ✅ | La flecha + número son chart simplificado — `accessibilityLabel` con summary ("Cierre proyectado: 42 mil pesos, 8% menos que el mes pasado") |
| §4 `state-clarity` | ✅ | Estado positivo (cierre con sobrante) vs negativo (cierre por encima) debe diferenciarse por color + icono direccional, no solo color |
| §6 `color-accessible-pairs` | ⚠️ | Reemplaza una tile existente — verificar contraste sobre el gradiente forest-green del hero (ya validado para el `availableToday`, repetir para el nuevo número) |
| §7 `duration-timing` | ✅ | Si el número anima al cambiar (CountUpText), 1.6s match con el hero existente |
| §10 `tooltip-on-interact` | ⚠️ | Tap en el chip → expand inline o navegar — definir antes del implement |

### Sprint 4 — Fijos coverage

| Quick Reference | Aplica | Por qué |
|---|---|---|
| §6 `whitespace-balance` | ✅ | Es micro-text; debe respirar abajo del panel Fijos sin competir con el value/sub del panel mismo |
| §6 `text-styles-system` | ✅ | Usar el preset `caption` o `label` del theme, no magic number |
| §1 `accessibilityLabel` | ✅ | "Fijos cubren del día 1 al 12. Días libres del 13 al 30" — no leer literal el dash range |
| §5 `content-priority` | ⚠️ | Si el usuario no tiene fijos cargados, el slot pasa a CTA "Cargar tus fijos" — define la prioridad de la pantalla en estado vacío |

### Pre-Delivery checklist comprimido (aplicable a cada Sprint)

Antes de cualquier merge, validar:

- [ ] No emojis como icons (todos los iconos del nuevo elemento son SVG)
- [ ] Touch targets ≥44pt si es interactivo
- [ ] `accessibilityRole` y `accessibilityLabel` definidos
- [ ] Light/dark mode validados independientemente (no inferir uno del otro)
- [ ] Reduced motion respetado — si hay loop animation, debe cancelarse
- [ ] Dynamic Type cap (1.4) si el texto tiene tamaño grande
- [ ] Estado vacío diseñado y testeado (per la regla §3.1 del roadmap)
- [ ] Telemetría conectada antes del release (per §3.3)
- [ ] Threshold de retiro documentado en el PR description (per §3.2)
- [ ] Slot asignado en el mapa de §3.4 sin colisión con items existentes

### Decisión meta de skill — design system

No se invoca `--design-system` script porque:

1. El sistema visual del Home (gradient hero, mint accents, cream surfaces, 8dp rhythm) ya está definido y probado.
2. Cada Sprint reusa primitives existentes (RiseView, BreatheDot, ShineOverlay, MaterialIcons family).
3. La decisión es de información y jerarquía, no de identidad visual.

Si en algún Sprint se considera introducir un primitive nuevo (ej: chart type que el sistema no tiene), ahí sí corresponde correr el script para validar consistencia con la categoría de producto ("personal finance · family · cyan-mint accent").

---

*Si querés profundizar en alguno de los tres deliverables del Sprint 0 (setup de telemetría con eventos específicos, mapa de slots con conflict resolution detallado, o diseño de estados vacíos por item), cualquiera funciona como siguiente paso natural.*
