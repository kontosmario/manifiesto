# Release "próxima versión" — diseño de los 5 frentes (2026-07-08)

Orden de implementación por peso: **#4 FaceID (diagnóstico+fix quirúrgico) → #2 jardín familiar → #3 ingreso dinámico → #5 rating → #1 eslogan**. Los dos primeros tocan el core (auth y motor de rachas); los últimos son superficie.

---

## Frente A (pedido #4) — Re-prompt de Face ID en cada apertura

### Diagnóstico (evidencia en código)

- El **escaneo de Face ID en cada cold start es POR DISEÑO** ("front door" estilo banco): `isAppUnlocked` es estado de módulo en memoria (`mobile/features/auth/app-lock-state.ts:27`) y se resetea en cada arranque del runtime JS. La máquina enruta `hasSession && !isUnlocked && shouldUseBiometric → locked/biometric → prompt-biometric` (`auth-flow-machine.ts:188-192`). Re-lock adicional: >5 min en background, >15 min de inactividad.
- El **consent del sistema iOS** ("Manifiesto quiere usar Face ID") se muestra una vez por install y nada en el repo lo re-dispara. Si un usuario lo ve repetido, es reinstall/TestFlight/jetsam, no la app.
- El **push priming** no re-aparece tras `granted` (`isPushPrimeEligible` fail-closed) — descartado.
- **Bug real encontrado (H4)**: `use-login-submit.ts:224` llama SIEMPRE `persistBiometricCredentials(email, { shouldPromptSetup: true })`; `use-auth-biometric-controller.ts:77-87` muestra el prompt "Activa Face ID" cada vez que hay biometría disponible sin credenciales guardadas. Un usuario que **rechazó** el enrolamiento vuelve a ver el prompt en **cada login con password** — fricción real y consistente con el reporte.

### Cambio

1. **Fix H4**: respetar el rechazo — al declinar el prompt de enrolamiento, persistir `prime_dismissed_biometric` (cooldown 7 días, misma mecánica `permission-prime-cooldown.ts` que ya usa push) y gatear el prompt post-login con ese cooldown. No tocar el app-lock (por diseño).
2. **Documentar** el comportamiento by-design y las opciones de producto (persistir unlock con TTL / toggle en Ajustes) SIN implementarlas — decisión de postura de seguridad del owner.

### Tests

- Unit de la lógica pura de gating del prompt de enrolamiento: disponible+sin creds+sin dismissal → prompta; con dismissal <7d → no; >7d → sí; con creds guardadas → nunca.

---

## Frente B (pedido #2) — Racha/jardín compartida a nivel familia

Hoy TODO el motor es `(family_id, user_id)`: tabla `user_streaks`, trigger `trg_expenses_advance_streak`, escudos, `garden_recovered_days`, crons, RLS, snapshots y filtros de cliente (`created_by !== userId`). Objetivo: **una racha por familia** — el gasto o día-marcado de cualquier miembro cuenta para todos.

### Decisiones de diseño

| Decisión | Elección | Razón |
|---|---|---|
| Estrategia | **A: colapsar a nivel familia** (nueva tabla `family_streaks`, PK `family_id`) | La B (N filas sincronizadas) genera drift y N× writes |
| Timezone del "día" | **tz del dueño de la familia** (`family_local_timezone(family_id)`) | Determinística; un hogar comparte huso; evita discrepancias entre miembros |
| Escudos | **Pozo familiar** (cap 2, cadencia semanal, mismas reglas) | Coherente con "cuidar el jardín del hogar" |
| Logros streak_7..90 | **Se otorgan a TODOS los miembros no bloqueados** al cruzar el umbral | La racha es de todos; `on conflict do nothing` mantiene idempotencia |
| Seed de datos | `family_streaks` hereda el **máximo** entre miembros (`current_streak`, `longest_streak`, `last_logged_date`, `freeze_tokens` cap 2; `total_days_logged` = recuento de días únicos de actividad familiar) | Nadie pierde su racha con el cambio |
| `streak_marked_days` | Queda per-usuario (autoría), la **derivación** une por familia | Preserva historial y el RPC mark/unmark |
| `garden_recovered_days` | unicidad pasa a `(family_id, day)`; RLS `is_family_member` | El día recuperado es del hogar |
| Ancla del jardín | `families.created_at` (antes `profiles.created_at`) | El jardín es del hogar |
| Semana perfecta 7/7 | Se mantiene (actividad orgánica de cualquier miembro) | Es el punto del feature: florecer entre todos |
| `user_streaks` vieja | Se conserva (sin triggers que la escriban) como respaldo; el cliente deja de leerla | Rollback barato |

### Cambios DB (migración nueva `2026070812xxxx_family_streaks.sql`)

1. Tabla `family_streaks` (family_id PK/unique, mismas columnas de contador+escudos) + RLS SELECT `is_family_member(family_id)`.
2. `family_local_timezone(p_family_id)` → tz del owner (fallback UTC).
3. Reescribir motor: `_advance_streak_internal(p_family_id, p_event_date)` (sin user), `advance_streak`, `recompute_family_streak` (une expenses ∪ marked_days de TODA la familia), `expenses_trigger_advance_streak` (usa tz familiar; cualquier `created_by` avanza), `mark_no_expense_day`/`unmark_no_expense_day` (validan contra actividad familiar, recompute familiar).
4. `garden_recovered_days`: unique `(family_id, day)` + RLS familiar; auto-plant (Case 3 + cron) inserta por familia.
5. Crons `cron_emit_streak_broken/at_risk/recovery_nudge`: iterar `family_streaks`, tz familiar, notificar a todos los miembros no bloqueados.
6. Triggers de logros sobre `family_streaks`: otorgar `streak_N` a todos los miembros.
7. `gastos_snapshot`: `streak_row` desde `family_streaks` (solo family_id) y `marked_days` de toda la familia.
8. Seed: insertar `family_streaks` desde agregado de `user_streaks` + recuento de actividad.
9. Revokes/grants + `search_path` según convención de hardening.

### Cambios cliente

- `use-streak.ts`: leer `family_streaks` (sin `.eq('user_id')`), `weekActivity` sin filtro `created_by !== userId`, marked days de toda la familia.
- `use-garden.ts`: quitar filtro por `created_by`; `fetchRecoveredDays(familyId)`; ancla = `families.created_at` (viene de useFamily o query liviana).
- Query keys: `streakQueryKey(familyId)`, `markedDaysQueryKey(familyId)`, `gardenRecoveredQueryKey(familyId)` — sin userId (cache no fragmenta).
- `use-gastos-snapshot.ts`: seed con el nuevo shape.
- Copy: ajustar subtítulos del jardín a plural del hogar donde aplique (ES+EN).

### Tests

- `garden-model` (existentes) siguen verdes — la derivación pura no cambia de firma.
- Nuevos unit: `deriveStreak`/`weekActivity` cuenta gastos de OTRO miembro; marked day de otro miembro llena celda; recovered day compartido.
- Parity/contract: shape del seed de `gastos_snapshot`.

### Gate

**La migración NO se aplica a prod en esta sesión** — queda en el repo lista, con checklist de aplicación coordinada (igual patrón que el refactor de categorías).

---

## Frente C (pedido #3) — Modo "ingreso dinámico"

Perfil: usuario sin sueldo fijo; su balance se construye **agregando ingresos manuales** (`income_events`); necesita control de gasto diario.

### Bloqueos actuales

1. Onboarding step 4 (creator): `if (monthlyIncome <= 0) return false` → CTA muerto.
2. `cycle-disponible.ts` path sin override: el cupo diario **ignora** `cycleExtraIncome`.
3. Hero con income 0 = dead-end "Configura tu ingreso mensual" → Settings.
4. No existe flag de modo.

### Diseño

- **DB**: `family_finance.income_mode text not null default 'fixed' check (income_mode in ('fixed','dynamic'))`. Devuelto por `home_snapshot` (gotcha conocido: columna nueva → RPC) y editable vía el upsert de finance (no es derivada). En modo dinámico `last_salary_confirmed_at` se auto-mantiene (no hay "¿cobraste?"): el freeze por sueldo no aplica.
- **Onboarding**: en `StepIncome` (creator), opción explícita **"Mi ingreso es variable"** (toggle/selector). Al elegirla: se libera `canContinue` con monto 0, `income_mode='dynamic'` en el payload de finance, la contribución del owner queda 0, y el step de ciclo usa mes calendario (cycle_type `monthly` día 1). Copy nuevo `onboarding:income.dynamic*` (ES+EN) explicando "cargá tus ingresos a medida que entran".
- **Modelo de presupuesto** (`family-dashboard-model.ts` + `cycle-disponible.ts`): en modo dinámico el presupuesto del ciclo = `Σ income_events` de la ventana (bruto) y el cupo diario reparte el disponible restante sobre los **días restantes** (mismo tratamiento que el override DOWN, que ya está probado por el parity test). `incomeConfigured` pasa a `monthlyIncome > 0 || incomeMode === 'dynamic'`.
- **Hero Home**: en dinámico sin ingresos aún → estado "Cargá tu primer ingreso" con CTA a `/(app)/add-income` (no a Settings). Con ingresos → métricas normales.
- **Settings**: fila para cambiar de modo (fixed↔dynamic) en el grupo de ingreso/hogar, con confirmación.
- **Cierre de ciclo**: `apply_month_close_decision` ya suma `extra_income` al sobrante; verificación puntual de `mood`/`savings_delta` con base 0 (aceptar `mood null`).

### Tests

- Unit del modelo: dinámico sin ingresos → cupo 0 + `incomeConfigured` true (no dead-end); dinámico con 2 ingresos en ciclo → cupo = (ingresos − gasto − ahorro)/días restantes; fixed intacto (regresión parity).
- Unit de `canContinue` step 4 con modo dinámico.
- Contract del snapshot con `income_mode`.

### Gate

Migración (columna + `home_snapshot`) NO se aplica a prod en esta sesión.

---

## Frente D (pedido #5) — "Puntuar la app" en Settings

- **No es automático de App Store**: el modal nativo lo dispara la app con `SKStoreReviewController` → `expo-store-review` (no instalado; Expo SDK 54).
- **Diseño**: dep `expo-store-review`; `APP_STORE_URL`/`APP_STORE_REVIEW_URL` (`id6776033487`) en `mobile/lib/legal-urls.ts`; row "Calificar Manifiesto" (icono `star-outline`) en el grupo **Información** de Settings; handler: `StoreReview.requestReview()` si `isAvailableAsync()` (modal nativo con branding del producto encima), fallback al deep link `?action=write-review` (el sistema racionea el modal — máx. 3/año — así que el fallback garantiza que el tap siempre haga algo). Copy `settings:rate.*` ES+EN.
- **Nota**: dep nueva ⇒ `npx expo export --platform ios` antes de declarar verified (gotcha conocido).

### Tests

- Unit del handler puro (elige modal vs fallback según disponibilidad y errores).

---

## Frente E (pedido #1) — Eslogan "No estás simplemente agregando un gasto, estás creando un hábito"

EN: *"You're not just logging an expense — you're building a habit."*

Análisis meticuloso hecho (inventario completo en la exploración). Criterio: el eslogan vive donde ocurre **el acto de cargar** o donde se **celebra el hábito**; no se repite en cada pantalla (se gastaría). Superficies elegidas:

| Superficie | Key | Tratamiento |
|---|---|---|
| Celebración "El primer brote" (post primer gasto) | `achievements:catalog.first_expense.body` | **Frase exacta** — mejor fit del repo |
| Pantalla de alta de gasto | `home:addExpenseDashboard.habitTagline` (nueva) | **Frase exacta** como tagline sutil (visible cuando no hay alerta del asesor) |
| Empty state de Gastos | `gastos:emptyState.introBody` | Variante tejida ("Cargar tu primer gasto no es solo un registro: es el primer día de un hábito.") |
| Intro pre-auth slide 4 (jardín) | `onboarding:intro.slide4.subtitle` | Variante corta alineada a la metáfora del brote |

Descartadas (documentado): tours (tono instructivo), splash (tagline de marca global), push SQL (otro pipeline, riesgo alto para copy), billing (habla de acceso, no de hábito).

Guards que aplican: `guard:i18n-hardcoded` (obliga `t()`), `guard:i18n-keys` (key debe existir en ES), `guard:i18n-quality` (EN sin diacríticos españoles). Paridad ES/EN en ambos archivos. Suite completa (`npm run validate`) porque copy rompe tests en silencio (gotcha conocido).

### Tests

- No hay snapshots de bundles; correr suite completa + guards. Asegurar key nueva consumida solo vía `t()`.

---

## Validación final (todos los frentes)

1. `source ~/.nvm/nvm.sh` antes de todo (gotcha nvm).
2. `npm run validate` (typecheck + lint + test + 6 guards).
3. `npx expo export --platform ios` (hay dep nueva: expo-store-review).
4. `/code-review` en loop hasta 0 findings confirmados.
5. Docs afectados actualizados en el mismo cambio: `docs/sistemas/jardin-rachas.md`, doc nuevo del modo dinámico, nota FaceID.

## Pendientes gateados para el owner (NO se hacen en esta sesión)

- Aplicar a prod las migraciones de jardín familiar e income_mode (coordinado con build nuevo del cliente).
- Decidir si se quiere aflojar el app-lock (persistir unlock con TTL o toggle) — hoy es postura de seguridad intencional.
