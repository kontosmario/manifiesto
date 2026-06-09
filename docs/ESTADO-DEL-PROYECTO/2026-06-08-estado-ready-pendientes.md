# Estado del proyecto · 2026-06-08

> **Snapshot inmediatamente actionable**: qué está READY (mergeable / shippeable hoy) vs qué queda PENDIENTE.
>
> **HEAD**: `814925f fix(cr-v3): findings de la skill-driven code review (3rd pass)`.
> Branch `main`, 34 commits adelante de `origin/main` (sin push pendiente bloqueante — el push lo decide el owner).
>
> **Foto canónica de pantallas/sistemas**: sigue siendo [`2026-05-21-estado-actual/`](2026-05-21-estado-actual/00-INDICE.md). Este doc es el *delta y plan*, no reemplaza la foto exhaustiva — sólo la complementa para el período post-2026-05-21.

---

## 0 · TL;DR

Producto feature-complete (desde 2026-05-09) **+ 1 mes de hardening + Spec B mergeado**. Pasamos por **3 rondas de code review** (78 + 46 + 9 findings, todos cerrados), 4 sprints (data layer / SQL / CI / cleanup), un backlog de tests (+113) y un ciclo de bugfixes Wrapped/UX. Tests verdes 654/654, lint 0, typecheck clean, bundle iOS OK, 12 migrations aplicadas y verificadas en remote desde el 5 de junio. **No quedan bloqueantes técnicos para empezar la sprint a App Store** — el bloqueo restante es **legal + assets de tienda + push iOS production wiring**, todo P0 del roadmap del 2026-05-31.

---

## 1 · READY (mergeable hoy)

### 1.1 · Features completos

| Feature | Estado | Fuente / docs |
|---|---|---|
| **Spec B — month-close leftover decision** (`meta` / `acumular` / `reserva` / `skip`) persistido en `month_close_decisions` con UNIQUE por `monthly_summary_id` | ✅ LIVE | [`docs/sistemas/month-close-decision.md`](../sistemas/month-close-decision.md) · [`mobile/features/month-close/use-month-close-decision.ts`](../../mobile/features/month-close/use-month-close-decision.ts) · [`supabase/migrations/20260605120000..20260608140000`](../../supabase/migrations/) |
| **Reserva management** — RPC `apply_reserve_decision` atómica (WHERE-guard MVCC) + ReserveBlock en Control v2 (Sumar al mes / A una meta) | ✅ LIVE | [`docs/sistemas/reserva.md`](../sistemas/reserva.md) · [`mobile/components/control-v2/control-v2-alcancia-card.tsx:471+`](../../mobile/components/control-v2/control-v2-alcancia-card.tsx) |
| **Meta wizard 4-step + Settings read-only/lifecycle** + nuevo `useLatestSavingsGoal` | ✅ LIVE | [`docs/sistemas/savings-goal.md`](../sistemas/savings-goal.md) · [`mobile/components/savings-goals/create-savings-goal-wizard-sheet.tsx`](../../mobile/components/savings-goals/create-savings-goal-wizard-sheet.tsx) · [`mobile/screens/settings/savings-goal-screen.tsx`](../../mobile/screens/settings/savings-goal-screen.tsx) |
| **Wrapped Closing Scene integrada** (pending = 3 OptionCards + CTA; past = read-only; confetti post-await) + bridge re-trigger guard 1.5s | ✅ LIVE | [`docs/sistemas/cycle-wrapped.md`](../sistemas/cycle-wrapped.md) · [`mobile/components/wrapped/cycle-wrapped-modal.tsx:884+`](../../mobile/components/wrapped/cycle-wrapped-modal.tsx) |
| Activity OCR + Import Review (Phases A-D, 8 bancos, 4 forms migrados al patrón de validación) | ✅ LIVE | [`2026-06-03-activity-ocr-shipped.md`](2026-06-03-activity-ocr-shipped.md) |
| Día sin gasto + Plans/Billing redesign + Gastos cronología fixes | ✅ LIVE | [`2026-06-01-no-spend-day-feature-shipped.md`](2026-06-01-no-spend-day-feature-shipped.md), [`2026-06-02-plans-ui-redesign-shipped.md`](2026-06-02-plans-ui-redesign-shipped.md), [`2026-06-04-gastos-cronologia-fixes-shipped.md`](2026-06-04-gastos-cronologia-fixes-shipped.md) |

### 1.2 · Hardening completo (3 rondas de CR)

| Round | Reviewers | Findings | Estado |
|---|---|---|---|
| CR v1 (Sprint A-D + Backlog) | 5 paralelos (backend / data layer / UI / screens / cross) | 78 (4C / 18H / 31M / 25L) | ✅ Todos closed |
| CR v2 (fix-round) | 5 paralelos | ~46 (0C / 6H / 25M / 15L) | ✅ Todos closed |
| CR v3 (skill-driven, `superpowers:requesting-code-review`) | 1 reviewer focal | 9 (I1-I3 + M1-M2 + nits) | ✅ Todos closed en `814925f` |

**Resumen de impacto sistémico** ([`2026-06-08-codereview-hardening-completed.md`](2026-06-08-codereview-hardening-completed.md)):

| Cambio | Impacto |
|---|---|
| `syncAllAfterMutation` adoption sistémica | 12 hooks de mutation usan el helper canónico; grafo de dependencias por scope declarado en [`mobile/lib/sync-after-mutation.ts`](../../mobile/lib/sync-after-mutation.ts). Doc: [`docs/arquitectura/sync-after-mutation-pattern.md`](../arquitectura/sync-after-mutation-pattern.md) |
| `is_family_member` excluye `blocked` | Cubre 40+ RLS policies en un solo cambio. Verificado por [`tests/integration/blocked-member-rls.test.ts`](../../tests/integration/blocked-member-rls.test.ts) |
| Fixed-payment RPCs filtran blocked inline | Defense-in-depth para los 2 RPCs que no usan el helper |
| `useFocusEffect` reemplazó `useEffect([])` en visit counters | Badge del tab control ya no queda stale al volver desde otra screen |
| Cleanup masivo | **19 archivos huérfanos** eliminados (~2280 LOC), `pointerEvents` migrado a prop en 11 components, `console.log` gateado en `__DEV__`, `legacy-web-src` config purgado |
| Dual-key rollback (best-in-class) | `useUpsertSavingsGoal` snapshotea ambos `savings-goal` + `savings-goal-latest` en `onMutate`; rollback consistente |
| Scopes nuevos en helper | `categories`, `profile`, `wrapped` (este último agregado en CR v3 I2) |

### 1.3 · Migrations remote-verified (12 nuevas desde 2026-06-05)

```
20260605120000_month_close_decision.sql
20260605130000_fix_month_close_anchor_cast.sql
20260605140000_month_close_v2_summary_ref.sql
20260607230000_fix_acumular_preserves_salary.sql
20260608000000_apply_reserve_decision.sql
20260608010000_home_snapshot_includes_monthly_reserve.sql
20260608030000_harden_reserve_and_acumular_atomic.sql
20260608040000_apply_reserve_atomic_where_guard.sql
20260608100000_harden_is_family_member.sql
20260608110000_harden_fixed_payment_blocked_filter.sql
20260608130000_apply_reserve_multifamily_guard.sql
20260608140000_document_month_close_meta_reserva_assumption.sql
```

Aplicadas y verificadas contra remote production. No quedan migrations sin aplicar.

### 1.4 · Tests / CI

| Métrica | Valor |
|---|---|
| Unit + integration tests | **654 / 654** ✅ (11 skipped en local sin Supabase up) |
| Lint | **0 errors** (warnings sólo en `react-hooks/preserve-manual-memoization`, intencional) |
| Typecheck | clean |
| Bundle iOS (`npx expo export --platform ios`) | OK |
| Guards (`legacy-spacing`, `forbidden-copy`, `motion-tokens`) | clean |
| CI workflow | unit + integration corren en push a main y en PRs vía `dorny/paths-filter`. Supabase local en Docker, boot ~2-3 min, suite ~30 s |

### 1.5 · Docs sincronizados contra código (2026-06-08)

| Doc | Estado |
|---|---|
| [`2026-06-08-codereview-hardening-completed.md`](2026-06-08-codereview-hardening-completed.md) | ✅ Sincronizado (cubre CR v1 + Sprints A-D + Backlog + CR v2 fix-rounds) |
| [`2026-06-08-spec-b-leftover-decision-shipped.md`](2026-06-08-spec-b-leftover-decision-shipped.md) | ✅ Sincronizado (75 commits, 8 migrations, 3 CR rounds) |
| [`docs/sistemas/month-close-decision.md`](../sistemas/month-close-decision.md), [`reserva.md`](../sistemas/reserva.md), [`savings-goal.md`](../sistemas/savings-goal.md), [`cycle-wrapped.md`](../sistemas/cycle-wrapped.md) | ✅ Canónicos |
| [`docs/arquitectura/sync-after-mutation-pattern.md`](../arquitectura/sync-after-mutation-pattern.md) | ✅ Actualizado en CR v3 (nombres reales de hooks: `useUpdateDisplayName`, `useUpdateAvatarAnimal`, `useCreateCategory`, `useRenameCategory`, `useDeleteCategory`) |

---

## 2 · PENDIENTES

### 2.1 · High priority — siguiente sprint útil

| # | Item | Effort | Notas |
|---|------|--------|-------|
| H1 | **P0 App Store completo** (delete-account UI, Apple Sign-In login, password reset, email confirm resend, permission priming, legal hosting + wiring, version/about, support link, push iOS production, screenshots, listing copy, privacy nutrition, age rating) | 3-4 semanas | Roadmap completo en [`2026-05-31-roadmap-priorizado.md`](2026-05-31-roadmap-priorizado.md) §2. **Ningún item de P0 se trabajó en el ciclo de junio** — el sprint fue de hardening del producto, no de compliance |
| H2 | **APNs key + entitlements + token registration backend → APNs** (P0.13-15) | 1.5 d total | Doc fuente: [`push-notifications-ios-setup.md`](../operaciones/push-notifications-ios-setup.md). Bloqueado por Apple Dev (ya pago) |
| H3 | **Privacy Policy + Terms redactados y hosteados** + first-launch disclosure (P0.7-10) | 1-2 sem legal / 1 d template | Owner action: redacción o contratación |

### 2.2 · Medium priority — tech debt / mejoras

| # | Item | Effort | Notas |
|---|------|--------|-------|
| M1 | **`useUpdateExpense` / `useDeleteExpense` migrar a `syncAllAfterMutation` full** | 1 d | Hoy patchean directo + invalidate parcial — funcional, pero alinear al patrón completo simplificaría adds futuras. Listado como pendiente en [`2026-06-08-codereview-hardening-completed.md:371`](2026-06-08-codereview-hardening-completed.md#L371) |
| M2 | **Test guard para scopes de `syncAllAfterMutation`** | 4 h | Test que falle si un scope nuevo no incluye `homeSnapshotQueryKey` — guard contra el bug histórico de "MetaCard no aparece post-create" |
| M3 | **E2E (Playwright) en CI** | 1-2 d | Hoy sólo unit + integration. El costo de headless browser amerita planning aparte |
| M4 | **Drenar `motion-tokens-baseline.json`** | 1 d | 22 violations across 10 files — migrar callsites a tokens o agregar `@motion-allow` inline |
| M5 | **P1 hardening backend pre-prod** (password policy 10c, HIBP, network restrictions, captcha, re-auth destructive, rate limiting RPCs, service-role audit, `audit_log` / `invitations` / `devices` tables) | 6-8 d | Roadmap §3. Mayoría son toggles Supabase de 30 s. Captcha + rate limiting son los más serios |
| M6 | **P3 testing pre-launch** (auth integration, expense CRUD vs Supabase, fixed lifecycle, push delivery, VoiceOver accessibility, visual regression, perf baseline) | 8-10 d | Roadmap §5. Paralelizable con P0 |
| M7 | ~~P2 DevEx / EAS automation~~ → **DONE 2026-06-09** (Sprint C completo: EAS release + TestFlight + OTA + feature flags + gitleaks). Sentry sourcemap → SKIPPED (decisión owner) | — | Sprint C entregó 12/13 items; C8 Sentry skipped sin pendientes técnicos |

### 2.3 · Low priority / opcional

| # | Item | Notas |
|---|------|-------|
| L1 | **AI Coach LLM (Claude augmentation)** | 100% heurístico hoy. Activar cuando ≥500 MAU |
| L2 | **i18n** | Hoy 100% es-AR. Re-evaluar si hay tracción fuera de AR |
| L3 | **Biometric auto-sign-in en mount** | En pausa, decisión por fricción cold-start medida |
| L4 | **Verificar usuario test `aye.tello18@gmail.com`** | 1 minuto query manual ([`pendientes-seguridad.md:109`](../operaciones/pendientes-seguridad.md#L109)) |
| L5 | **Android prebuild + AndroidManifest audit** | Pre-Play Store |
| L6 | **Gift subscription IAP** + **Win-back flow** | Bucket B monetización, post P5 |

### 2.4 · Deferred decisions (owner debe decidir)

| # | Decisión | Bloquea | Notas |
|---|----------|---------|-------|
| D1 | **Monetización en v1.0 o v1.1?** | P5 (paywalls + RevenueCat) | UI ya está rediseñada (2026-06-02). Falta sólo SDK + persistencia. Si va en v1.0 bloquea el submit |
| D2 | ~~Sentry + PostHog antes o después de submit?~~ → **DECIDIDO 2026-06-09: no por ahora.** Sentry skipeado. PostHog queda como D2.b (más tarde) | — | Sentry → `[-] SKIPPED` en execution plan (C8). Re-evaluar cuando >1000 MAU o primer crash sin repro |
| D3 | **Owner actions blocked por owner** | varios P0 | Redactar/contratar Privacy/Terms, habilitar GitHub Pages + DNS `manifiesto.app`, crear inbox `soporte@manifiesto.app`, contratar/self-make screenshots + App Preview video |
| D4 | **Push origin/main vs PR review** | publicar el ciclo | 34 commits ahead — owner decide cómo se publica (push directo, PR de catch-up, o squash) |

---

## 3 · Camino a App Store

Roadmap fuente: [`2026-05-31-roadmap-priorizado.md`](2026-05-31-roadmap-priorizado.md).

| Bloque | Effort original | Status al 2026-06-08 |
|--------|-----------------|----------------------|
| **P0** Compliance + assets + push iOS | 3-4 sem | 🟡 **0% hecho** — sprint de junio fue hardening, no compliance |
| **P1** Hardening backend pre-prod | 1-2 sem | 🟡 **30% hecho** — RLS hardening (`is_family_member` + fixed-payment) ya está, falta captcha / rate limiting / re-auth destructive / schema tables |
| **P2** DevEx + CI + EAS | — | ✅ **DONE 2026-06-09** (Sprint C, 12/13 items). Sentry sourcemap SKIPPED — decisión owner |
| **P3** Quality / testing pre-launch | 8-10 d | 🟡 **20% hecho** — backlog de tests (+113) cubrió wrapped / streaks / billing / notifications / fijos / query-keys. Falta auth integration, expense CRUD vs Supabase, accessibility, visual regression, perf baseline |
| **P4** Observability | 1 sem | 🔴 0% hecho — owner decision pendiente |
| **P5** Monetización | 6-8 d | 🟡 UI lista, SDK + persistencia + paywall sheets pendientes — owner decision |
| **P6** iOS features desbloqueadas | 2-3 sem | 🔴 0% hecho — Apple Dev ya está pago, sin bloqueante técnico |
| **P7** Backlog largo | varios | OCR ✅ (shipped 2026-06-03 con ML Kit en vez de Gemini, decisión revisada) |

**Lectura ejecutiva**: el sprint de junio NO movió la aguja de P0 (compliance) pero sí dejó el producto en su mejor estado de hardening histórico. **El camino al submit sigue siendo ~3-4 semanas** sobre el plan original del roadmap, con la confianza extra de que el hardening está cubierto.

---

## 4 · Bloqueantes

**Ninguno técnico conocido**. Los bloqueantes son del tipo "owner action + tiempo":

- Push de los 34 commits al remote (decisión owner)
- Redacción legal (Privacy + Terms)
- Owner actions de OWN.3 / OWN.4 / OWN.5 / OWN.6 del roadmap (DNS, inbox, screenshots, video)
- Decisiones D1 / D2 (timing monetización + observability)

<!-- ✓ Sincronizado contra código el 2026-06-08, HEAD=814925f -->
