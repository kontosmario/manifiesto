# Code Review Hardening — 2026-05-31 (Completed)

Status: ✅ Cerrado 2026-05-31. 41 commits. `npm run validate` exit 0 (367 tests, 0 motion-token regressions).

## Resumen ejecutivo

El 2026-05-31 se ejecutó un code review consolidado del proyecto entero (6 revisores en paralelo cubriendo backend, mobile arch, security, performance, code quality y tests/CI). Resultado: 6 buckets P0–P5 con ~30 items. Este documento es el cierre.

**Outcome:**
- **P0–P4 cerrados** end-to-end con verificación + gap finder por phase.
- **P5 backlog** (mega-screen controller extraction) explicitamente diferido — requiere planning per-screen, no es paralelizable.
- 41 commits sobre `main` desde origin (la rama está lista para push cuando el owner lo decida).

**Métricas de validación:**
- Lint: clean
- Typecheck: clean
- Tests: 367 passing, 0 failing, 11 skipped (integration que requieren supabase local)
- guard:legacy-spacing, guard:forbidden-copy, guard:motion-tokens: clean (22 legacy motion-token violations baselined con counts per-file que detectan regresión)

## Phase-by-phase

### P0 — Bloqueantes pre-prod (13 commits, plan: 2026-05-31-p0-codereview-hardening.md)
- `send-family-push` messages branch: requería service-role bearer (antes anyone could spam Expo pushes).
- `fixed_expense_payments` RLS: UPDATE/DELETE simétricas a fix de expenses del 22-may (paid_by=auth.uid OR owner).
- `notifications-orchestrator`: service-role gate (antes any authenticated user disparaba fan-out completo).
- Doc de rotación de credenciales `.env.supabase` (acción del owner).
- Vitest unblocked: `__DEV__` global + stub `expo-modules-core` + módulo `glossary` faltante.
- Motion-tokens: 3 sheen sweeps allowlisted + 10 archivos legacy en baseline con counts per-file.
- CI: `mobile-ci.yml` ahora corre tests + 3 guards en cada PR, con `if: always()` por step.
- Gap-finder follow-ups: constant-time bearer compare en ambas edge fns, baseline count-based detector de regresión.

### P1 — Hardening pre-release (12 commits, plan: 2026-05-31-p1-hardening.md)
- PIN: PBKDF2 100k + CSPRNG salt + lockout exponencial (30s/1m/2m/4m/8m). Throw en CSPRNG miss (no silent degradation). `hashPinAsync` yieldea un macrotask antes del block para que React renderice el spinner. Threat-model docstring actualizado.
- CORS: `send-family-push` restringido a `manifiesto.app` / `www.manifiesto.app` (antes `*`).
- `search_path` pinneado en 4 trigger fns (notify_income_event_change, prevent_categories_delete, profiles_bootstrap_fields, touch_advisor_signal_dismissals_updated_at). Migración idempotente con `do$$ exception when undefined_function`.
- `home_snapshot`: COMMENT documentando caveat del `limit 1` non-deterministic (multi-segmento la fixea cuando rewrite).
- `prepare` hook: `git config core.hooksPath .githooks` corre en `npm install`.
- Smoke tests Deno para los 2 service-role gates (throw si handler unexported).
- EAS: profiles `development`, `development-device`, `submit.production.ios` con `$EXPO_APPLE_ID` / `$EXPO_ASC_APP_ID` env-secrets.

### P2 — Performance (10 commits, plan: 2026-05-31-p2-performance.md)
- `memberById` Map en gastos-v2 renderItem (de O(n) por row × 6 members × 100 rows visible = 600 ops/frame, a O(1)).
- `expense-history-list`: `removeClippedSubviews` (iOS only por gating de plataforma), `entering` se omite past index 8.
- Exit gate de `FadeOut` en gastos-v2 row revertido (FlatList no unmounta en recycle — no había hit perf real y rompía el fade del delete-via-swipe).
- `notification-feed-list`: `renderItem` useCallback + Separator hoisted como module ref.
- Theme context split aditivo: `useThemeMode()` + `useThemeTokens()` para hot paths; `useAppTheme()` queda shim de backwards-compat. Migración de callers es opportunista (P3+).
- `refetchOnWindowFocus: false` en home y gastos snapshot (evita doble RPC en foreground).

### P3 — Architecture (4 commits, plan: 2026-05-31-p3-architecture.md)
- Ciclo `home ↔ telemetry` roto: helpers movidos a `mobile/lib/telemetry-session.ts`.
- Ciclo `expenses ↔ insights` roto: `formatDeltaPercent` movido a `mobile/utils/percent.ts`.
- Convención documentada en `docs/arquitectura/feature-layering-ui-vs-domain.md`: por qué `gastos/`+`expenses/` y `fijos/`+`fixed-expenses/` son CAPAS, no duplicados.
- Mega-screen controller extraction explicitamente diferido (5000+ LoC combinados across 4 screens — requiere planning per-screen).

### P4 — Polish (4 commits)
- Router `as any` casts documentados con comentarios estructurales (las rutas son strings server-provided que no pueden matchear el typed-route union estático).
- `DAY_MS` + `daysBetween` extraídos a `mobile/utils/time.ts` (consolida 3 defs + 5 magic numbers inline).
- 8 script huérfanos (medir-fern, preview-perro, preview-svgrepo, audit-avatar, etc.) movidos a `scripts/archive/`.
- 3 SQL one-shots (`_create-test-user`, `sanitize-*`) movidos de `scripts/` a `sql/`.
- Password min length 6 → 8 chars (4 sites: auth-flow, reset-password, signup + strength meter thresholds).

## Pendientes (acción del owner)

- 🔐 **Rotar `.env.supabase` tokens**: ver `docs/operaciones/2026-05-31-credential-rotation-required.md`.
- 🔧 **Setear EAS Secrets**: `EXPO_APPLE_ID`, `EXPO_ASC_APP_ID` antes de `eas submit`.
- 🚀 **Deploy a Supabase staging**: `npm run supabase:remote:db:push` (3 migraciones nuevas: 20260601000000 RLS payments, 20260601001000 search_path, 20260601002000 home_snapshot comment). Y `supabase functions deploy` para `send-family-push` + `notifications-orchestrator`.
- 🧪 **Smoke test post-deploy**: confirmar que `curl -X POST .../send-family-push -d '{"messages":[...]}'` sin bearer devuelve 401.

## Backlog post-P0–P4 (separately planned)

- Mega-screen controller extraction: `add-fijo-v2-screen.tsx` (1591 LoC), `gastos-v2-screen.tsx` (1474), `settings-screen.tsx` (1479), `asistente-screen.tsx` (851). Cada uno necesita planning dedicado per-screen.
- Control v2 snapshot RPC migration (god-hook `use-control-v2-data.ts` con 9 features dep): necesita backend RPC nuevo + cliente seed.
- Drenar `motion-tokens-baseline.json` (22 violations across 10 files): migrar callsites a tokens o agregar `@motion-allow` inline.
- Server-mirror del lockout del PIN: la versión local en SecureStore es wipeable via uninstall/reinstall (consistente con "casual lock" del threat model, pero P1 gap finder lo flaggeó como Important).
- Deno tests del orchestrator + send-family-push en CI: requiere `setup-deno` action en GitHub Actions.
- Supabase migration validation en CI: workflow nightly con `supabase db reset` + integration tests (requiere `SUPABASE_DB_PASSWORD` secret en GH y supabase CLI en runner).
- React Native Testing Library para hooks con estado (P3 testing del code review).

## Planes ejecutados (referencia)

- `docs/superpowers/plans/2026-05-31-p0-codereview-hardening.md`
- `docs/superpowers/plans/2026-05-31-p1-hardening.md`
- `docs/superpowers/plans/2026-05-31-p2-performance.md`
- `docs/superpowers/plans/2026-05-31-p3-architecture.md`

(P4 no tiene plan dedicado — items son ediciones mecánicas pequeñas, los commits documentan el cambio inline.)
