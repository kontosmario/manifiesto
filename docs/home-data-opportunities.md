# 🏠 Home — Información disponible que hoy no estamos mostrando

> Inventario completo de datos que ya tenemos en cache / en DB / computados, organizados por valor de impacto si los surfaceamos en el Home tab.
>
> Snapshot 2026-04-29. Cada item indica: qué dato es, dónde vive hoy, cómo aparecería en Home, y qué señal le da al usuario.

---

## Tabla de contenidos

1. [Tier 1 — Alto impacto](#tier-1--alto-impacto-cierra-gaps-notorios)
2. [Tier 2 — Mid-impact](#tier-2--mid-impact-premiar-a-usuarios-engaged)
3. [Tier 3 — Insights nicho](#tier-3--insights-nicho-signals-contextuales)
4. [Tier 4 — Cognitive layer surfacing](#tier-4--cognitive-layer-surfacing)
5. [Tier 5 — Disponible pero no priorizable](#tier-5--ya-disponible-pero-no-priorizable)
6. [Recomendaciones de orden](#-recomendaciones-de-orden-de-adición)
7. [Anti-patterns](#-anti-patterns-a-evitar)

---

## Tier 1 — Alto impacto (cierra gaps notorios)

### 1. Velocity / momentum del ciclo

- **Dato**: `velocity_snapshots.stress_level` (`calm | watch | warn | critical`) + `momentum` (avg7/avg30) + `forecast_close_amount`. Cron diario lo pre-computa.
- **Hoy**: solo en Control y dentro del asistente.
- **Home**: chip o mini-banda en el hero indicando "Vas tranquilo" / "Acelerando" / "Muy rápido". Color codificado.
- **Por qué importa**: el "Disponible" de hoy es estático; el momentum dice si la tendencia es buena o mala. Un usuario con $40k disponibles y stress `critical` debería verlo de un vistazo.

### 2. Streak / racha

- **Dato**: `user_streaks.current_streak` + `longest_streak` + `freeze_tokens`. `view.racha` también disponible localmente.
- **Hoy**: un sheet en Home que se abre desde una CTA específica, escondido.
- **Home**: pill chiquita ("🔥 7 días") siempre visible, abriendo el sheet. Aparece en la family-strip o cerca del hero.
- **Por qué importa**: variable más adictiva del producto; sacarla del hidden state aumenta retention.

### 3. Forecast 7d sparkline

- **Dato**: `Forecast7Day` ya computado en `useControlV2Data` con baseline/optimistic/pessimistic + inflection days.
- **Hoy**: solo en `/asistente` header.
- **Home**: sparkline mini (40px alto) entre hero y MonthSummaryCard. "Próximos 7 días: 2 eventos importantes" + dot peach en cada inflection.
- **Por qué importa**: convierte Home en plataforma predictiva, no solo retrospectiva.

### 4. Próximo fijo a vencer

- **Dato**: `fixed_expenses.next_due_on` ya en cache.
- **Hoy**: en la pantalla Fijos.
- **Home**: pill o linea bajo MonthSummaryCard: "Próximo: Netflix · 3 días · $5.400". Tap → Fijos.
- **Por qué importa**: una de las preguntas mentales más comunes del usuario ("¿qué tengo que pagar pronto?") — hoy requiere navegar.

### 5. Trust Receipt

- **Dato**: `advisor_value_summary` view (live ya). `saved_quarter / saved_month / total_saved_lifetime / total_actions`.
- **Hoy**: pequeña strip en `/asistente`.
- **Home**: footer band o card secundario debajo del activity: "💚 Te ahorré $42k este trimestre · 6 decisiones". Tap → asistente.
- **Por qué importa**: prueba el ROI del asistente sin que el usuario tenga que descubrirlo.

---

## Tier 2 — Mid-impact (premiar a usuarios engaged)

### 6. Score de salud financiera (0–100)

- **Dato**: `view.score` + `view.scoreLabel` ya computados.
- **Hoy**: en Control hero (muy denso).
- **Home**: gauge mini al lado del "Disponible" o dentro del avatar como ring.
- **Riesgo**: agrega densidad — solo si funciona como ring sutil, no como número grande.

### 7. Top category del ciclo

- **Dato**: derivable instantáneo de `expenses` cache. `monthly_summaries.category_breakdown` ya tiene rollups históricos.
- **Hoy**: visible en Gastos.
- **Home**: chip bajo MonthSummaryCard panel "Variables": "Restaurantes lidera · 32%". Tap → Gastos filtrado.
- **Por qué importa**: contexto clave que hoy obliga al usuario a tap en Variables.

### 8. Comparación same-day vs ciclo anterior

- **Dato**: `monthly_summaries` history + cycle math. "Día 15 del ciclo pasado: $X · vos vas $Y".
- **Hoy**: solo en Control "Vs mes pasado" card.
- **Home**: micro-line sobre el hero "$Y · -8% vs igual día del mes pasado".
- **Por qué importa**: prueba progreso/regresión sin abrir otra pantalla.

### 9. Días sin gastar

- **Dato**: `view.diasSinGastar` (índices de días con $0 discrecional).
- **Hoy**: invisible.
- **Home**: chip en family-strip o cerca de la racha: "3 días sin gastos esta semana".
- **Por qué importa**: refuerzo positivo barato; los no-spend days son una métrica oculta de virtud.

### 10. Vault del ciclo

- **Dato**: `view.vault` — ahorro acumulado por estar bajo cupo.
- **Hoy**: en Control "Alcancía" card.
- **Home**: chip junto al "Disponible": "🪙 +$8.200 ahorrado".
- **Por qué importa**: hace concreto el "ahorrar gastando bien" en lugar de solo "ahorrar transfiriendo".

### 11. Fijos coverage

- **Dato**: `view.coberturaFijos` (días del mes que los fijos consumen) + `view.diasLibres` (días "libres").
- **Hoy**: en Control "Cobertura" card.
- **Home**: micro-text "Fijos cubren del 1 al 12 · libres del 13 al 30" debajo del MonthSummaryCard panel Fijos.
- **Por qué importa**: vista temporal que el panel actual no transmite.

### 12. Member spending balance

- **Dato**: derivable de `expenses` por `created_by` + `family_members`.
- **Hoy**: parcialmente en Gastos.
- **Home**: en family-strip, opcionalmente convertir cada avatar en un "spending dot" — anillo al rededor proporcional al gasto del miembro este ciclo. O un chip "vos +60% / pareja 40%".
- **Riesgo**: puede generar fricción interpersonal si se muestra mal — pensar tono.

---

## Tier 3 — Insights nicho (signals contextuales)

### 13. Peor / mejor DoW pattern

- **Dato**: `view.peorDow` / `view.mejorDow` (DoW averages).
- **Hoy**: detrás del asistente.
- **Home**: si HOY es el peor DoW, banner contextual "Los viernes promedio gastás +40%". Solo en días relevantes.
- **Por qué importa**: just-in-time advice, no permanente.

### 14. Per-category cap states

- **Dato**: `category_limits` joinedo con gasto del ciclo.
- **Hoy**: dentro del asistente como signals tipo `cap-*`.
- **Home**: chip en MonthSummaryCard "Variables" cuando hay un cap cerca: "🚧 Restaurantes 80% del tope".
- **Por qué importa**: avisa antes de superar caps, no después.

### 15. Notificaciones recientes preview (no asistente)

- **Dato**: `notifications` table — zombie/hike/cycle_closed/checkin.
- **Hoy**: solo dentro de la pantalla Notifications (badge en bell).
- **Home**: micro-feed encima de Activity con las 1-2 más recientes no leídas: "🧟 Spotify sin uso · hace 2h". Tap → notifications screen.
- **Por qué importa**: hoy el badge te dice "hay algo" pero no qué. Costo: añade densidad.

### 16. Average daily spending del ciclo

- **Dato**: `view.promedioDiario` (gasto medio por día cerrado).
- **Hoy**: en Gastos hero.
- **Home**: chip "Promedio: $4.200/día" junto al cupo diario. Comparación intuitiva.
- **Por qué importa**: cierra el loop "cupo es Y, gastando es X".

### 17. Salary days remaining countdown

- **Dato**: ya en `daysUntilPayday` (PaydayPillV2 lo muestra, pero como número plano).
- **Hoy**: pill numérico.
- **Home**: progress bar visual del ciclo (1 → diasMes), con marker de hoy.
- **Por qué importa**: visualización temporal del ciclo que hoy es solo un número.

---

## Tier 4 — Cognitive layer surfacing

### 18. Persona del usuario

Ya está en `/settings/asistente`. Mencionado por si alguna parte de Home quiera adaptar el lenguaje (no agregar UI nueva, sí usar para tono).

### 19. Top causal link detected

- **Dato**: `causalLinks` array de `useControlV2Data`.
- **Hoy**: en `/asistente` como signals causal-*.
- **Home**: si hay un link con confidence ≥ 0.7 Y el día actual es relevante, banner muy chiquito: "Patrón detectado: viernes → sábado +35%".
- **Riesgo**: puede contaminar Home si fire muchos.

### 20. Best win this cycle

- **Dato**: `view.mejor` (el mejor día — más sub-cupo del ciclo) + reduction win en categorías (`cat-win` signal).
- **Hoy**: en `/asistente`.
- **Home**: una vez por ciclo, banner positivo "💪 Tu mejor día: martes 12 · $1.200 bajo cupo".

---

## Tier 5 — Ya disponible pero no priorizable

Datos que tenemos pero **no aportarían** mucho en Home:

- **`fixed_expense_payments`** detail (lista de pagos del ciclo) — mejor en Fijos
- **`expenses` count total** — métrica vanidosa
- **Categorías sin gasto** — solo útil dentro de Gastos
- **`installments_paid / installments_total`** — Fijos screen
- **Notification list completa** — bell button ya cubre
- **Family members raw count** — ya está implícito en avatares

---

## 📐 Recomendaciones de orden de adición

Si tuviera que priorizar en sprints sucesivos:

| Sprint | Items | Razón |
|---|---|---|
| **1** | #1 Velocity chip · #2 Streak pill · #4 Próximo fijo | Cierran 3 gaps grandes con costo bajo. Solo data ya en cache. |
| **2** | #3 Forecast sparkline · #5 Trust Receipt | Convierte Home en superficie predictiva + prueba ROI |
| **3** | #6 Health score ring · #7 Top category · #10 Vault chip | Cognitive density polish |
| **4** | #14 Cap warnings · #13 DoW pattern · #19 Causal links | Just-in-time surfacing — solo cuando aplica |
| **Long tail** | #11 Fijos coverage · #12 Member balance · resto | Power-user / B2B familias |

---

## ⚠️ Anti-patterns a evitar

- **No agregar todo a la vez** — la fortaleza actual del Home es que el hero domina visualmente. 6+ chips compiten con esa jerarquía.
- **No reemplazar el hero, solo enriquecerlo** — el "Disponible $X" debe seguir siendo lo primero que el ojo encuentra.
- **No mostrar números sin contexto** — "Top categoría: Restaurantes" sin "32%" o "vs +X% mes pasado" es ruido.
- **Cuidado con conflict signals** — si Velocity dice "calm" pero Forecast pessimista dice "vas a quedar cero", son contradictorios. Resolver con jerarquía visual o filtrado.

---

## Resumen ejecutivo

**20 items inventoriados** entre 5 tiers. Los 5 de Tier 1 son los que cerrarían gaps de mayor valor con costo de implementación bajo (todos los datos ya están en cache).

**Recomendación**: arrancar con Tier 1 en bloques de 3 items por sprint, midiendo engagement antes de continuar. La densidad visual del Home es su mayor fortaleza — agregarle todo de una vez la rompe.

**Datos que ya están en cliente y no requieren nuevos round-trips**: 14 de 20 (los Tier 1, 2, 3, y 4 enteros — solo Tier 5 quedaría afuera porque ya está cubierto en otras pantallas).
