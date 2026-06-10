# Estado del proyecto · 2026-06-08 (actualizado 2026-06-10)

> **Snapshot inmediatamente actionable**: qué está READY (mergeable / shippeable hoy) vs qué queda PENDIENTE.
>
> **HEAD (2026-06-10)**: dominio `manifiestoapp.com` LIVE con Privacy + Terms hosteados + email forwarding + OTA aplicado al TestFlight build. Items H1 + H2 cerrados.
> Branch `main`, sincronizado con `origin/main`. Sprints A-D + CR rounds + Apple Dev setup + dominio+sitio legal completos. 0 deuda técnica. Solo pending: assets visuales (screenshots, video) + cuestionarios de App Store Connect + submit final.
>
> **🎯 Source of truth para "qué hay que hacer ahora"**: sección 2 abajo (PENDIENTES). Todo lo que está ahí es owner action, no requiere desarrollo.
>
> **Foto canónica de pantallas/sistemas**: sigue siendo [`2026-05-21-estado-actual/`](2026-05-21-estado-actual/00-INDICE.md). Este doc es el *delta y plan*, no reemplaza la foto exhaustiva — sólo la complementa para el período post-2026-05-21.

---

## 0 · TL;DR

Producto feature-complete (desde 2026-05-09) **+ Sprints A→D shippeados + 4 CR rounds cerrados + Apple Developer setup completo + build en TestFlight**.

| Métrica | Valor (2026-06-09 EOD) |
|---|---|
| Tests unit | **677/677** ✅ |
| Tests integration | **24 nuevos + 1 todo**, verde local |
| Lint errors | **0** |
| Typecheck | clean |
| Migrations aplicadas remote | **22** (las últimas 9 del wizard + sprints A-D) |
| Build production en TestFlight | ✅ 1.0.0 (1) instalado en device |
| Dominio público `manifiestoapp.com` | ✅ LIVE con Privacy + Terms hosteados |
| Email `soporte@manifiestoapp.com` | ✅ forwarding LIVE → gmail |
| OTA propagado a TestFlight | ✅ `64b2bb9a-884e-4920-b736-a2de70324766` (2026-06-10) |
| Deuda técnica de código | **0** para shippeo a App Store |

**🚀 Camino crítico al App Store**: solo restan **owner actions de contenido** (Privacy Policy hosting, screenshots, listing copy, age rating, privacy nutrition). Ningún item de código bloquea. Ver sección 2.

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

## 2 · PENDIENTES (actualizado 2026-06-09 post wizard Apple Dev)

> **🎉 Cambio mayor 2026-06-09**: Apple Developer setup completo + EAS + GitHub Secrets wireados + build 1.0.0 (1) en TestFlight, instalado en device. Ver [milestone doc](2026-06-09-apple-dev-setup-completed.md).
>
> **Resultado**: el grueso de los items "blocked by Apple Dev" están desbloqueados. Lo único que queda es **contenido del owner** (legal, screenshots, listing copy) — ninguna deuda técnica de código.

### 2.1 · High priority — Owner content para Apple submit

Todos son **owner actions**, no requieren código:

| # | Item | Effort | Notas |
|---|------|--------|-------|
| ~~H1~~ | ~~**Privacy Policy + Terms redactados y hosteados**~~ | — | ✅ **DONE 2026-06-10**. Sitio LIVE en `manifiestoapp.com` (Cloudflare Pages). Ver [milestone doc](2026-06-10-domain-and-legal-site-completed.md) |
| ~~H2~~ | ~~**Email forwarding `soporte@manifiestoapp.com` → gmail**~~ | — | ✅ **DONE 2026-06-10**. Cloudflare Email Routing (`soporte@` + `support@` → gmail) |
| H3 | **Screenshots App Store** (6.7" + 5.5" iPhone) | 1-2 d self-made / USD 100-300 contratado | Apple requiere mínimo 2 sets de tamaños para iPhone. iPad opcional pero recomendado. Tools: simulator de Xcode (screenshots vacíos) o un device físico con cuenta poblada |
| ~~H4~~ | ~~**Privacy Nutrition labels**~~ | — | ✅ **DONE 2026-06-10**. 7 tipos de datos declarados (Nombre, Email, Otra info financiera, Atención al cliente, Otro contenido del user, ID de usuario, ID del dispositivo). Todos atados a Funcionalidad de la app + linked al user + NO tracking. Publicado en App Store Connect |
| H5 | **Listing copy** (descripción es-MX, keywords, qué hay nuevo) | 2-4 h | App Store Connect → app → Distribución → Versión 1.0. Hay placeholder pero requiere copy final |
| ~~H6~~ | ~~**Age rating survey**~~ | — | ✅ **DONE 2026-06-10**. Rating: **4+** en 173 países (equivalencias regionales para Brasil "AL" y Corea "ALL"). 7 pasos del cuestionario, todas las categorías sin contenido sensible |
| H7 | **App Preview video** (opcional) | 1 d | Boost del conversion rate en App Store. Si no, usar solo screenshots |
| H8 | **Submit for Review** + esperar Apple (~1-3 días) | 1 click → wait | Una vez todo lo anterior listo |

### 2.2 · Medium priority — Tech debt residual

> **Nota**: las antiguas categorías M1-M7 ya están DONE. Los items que quedan son de baja urgencia.

| # | Item | Effort | Notas |
|---|------|--------|-------|
| M1 | **C13 perf baseline FPS table** | 1 h | Procedure documentado en `docs/operaciones/perf-baseline.md` — falta correr Instruments en device físico (ahora desbloqueado con TestFlight) |
| M2 | **C11 manual VoiceOver pass** | 2 h | Audit estático completo en `docs/sistemas/accessibility-checklist.md`. Pass manual en device físico desbloqueado con TestFlight |
| M3 | **C12 Storybook + Chromatic** | 2-3 d | Plan en `docs/operaciones/visual-regression.md`. Deferred hasta post-D refactor (cumplido). Activar si valor visual regression supera setup cost |
| M4 | **Cleanup secrets deprecados** (`EXPO_APPLE_ID`, `EXPO_ASC_APP_ID`) | 5 min | Se pueden borrar de GitHub Secrets — ya no se leen. Sin urgencia, no causan daño activo |

### 2.3 · Low priority / opcional (sin cambios)

| # | Item | Notas |
|---|------|-------|
| L1 | **AI Coach LLM (Claude augmentation)** | 100% heurístico hoy. Activar cuando ≥500 MAU |
| L2 | **i18n** | Hoy 100% es-AR. Re-evaluar si hay tracción fuera de AR |
| L3 | **Biometric auto-sign-in en mount** | En pausa, decisión por fricción cold-start medida |
| L4 | **Verificar usuario test `aye.tello18@gmail.com`** | 1 minuto query manual ([`pendientes-seguridad.md:109`](../operaciones/pendientes-seguridad.md#L109)) |
| L5 | **Android prebuild + AndroidManifest audit** | Pre-Play Store |
| L6 | **Gift subscription IAP** + **Win-back flow** | Bucket B monetización, post P5 |
| L7 | **Registrar UDIDs + setup preview profile** | Solo si querés builds ad-hoc para testers sin TestFlight. Hoy TestFlight cubre el caso |

### 2.4 · Deferred decisions (owner)

| # | Decisión | Bloquea | Notas |
|---|----------|---------|-------|
| D1 | **Monetización en v1.0 o v1.1?** | P5 (paywalls + RevenueCat) | UI ya rediseñada. Decisión clave: si va en v1.0 → +1 sem de SDK integration. Si v1.1 → submit más rápido pero sin revenue desde día 1 |
| D2 | ~~Sentry + PostHog~~ → **DECIDIDO 2026-06-09: no por ahora** | — | Re-evaluar cuando >1000 MAU |
| D3 | ~~Apple Dev + APNs + ASC~~ → **DONE 2026-06-09 wizard** | — | Ver [milestone doc](2026-06-09-apple-dev-setup-completed.md) |
| D4 | **Push origin/main vs PR review** | — | RESUELTO: pusheamos directo a main durante el ciclo. Si querés PR-review en próximas releases, hay que crear protection rule |

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
