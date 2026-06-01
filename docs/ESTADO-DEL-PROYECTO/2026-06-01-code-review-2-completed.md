# Code Review #2 — 2026-06-01 (Completed)

Status: ✅ Cerrado 2026-06-01. 15 commits adicionales sobre el ciclo del 2026-05-31. `npm run validate` exit 0. `npx expo export --platform ios` bundle OK. Lock+resume runtime confirmed por el owner.

## Resumen ejecutivo

Tras el deploy del ciclo del 2026-05-31 (43 commits sobre main, todo deployed a prod), el owner reportó un runtime error en iOS al bloquear/desbloquear el device. Se identificó como root cause y se fixeó, después se ejecutó un segundo round de code review con los mismos 6 revisores especializados pero con verificación reforzada (incluyendo bundle check).

**Outcome:**
- 1 runtime fix (SecureStore lock+resume).
- 8 Important items cerrados (review #2 surfaced 8 nuevos hallazgos que el review #1 no detectó).
- 5 Minor items cerrados.
- 2 nuevas migraciones + 2 edge functions desplegadas a prod, smoke-tested.
- Verificación completa: validate + Metro bundle + runtime confirmation.

**Estado vs prod:** 58 commits totales sobre origin/main. Listos para `git push origin main` cuando el owner lo decida.

## Runtime fix (pre-review)

### `auth/SecureStore lock+resume error` (commit ad728f0)

**Síntoma:** Console error rojo cada vez que el device se bloqueaba y volvía:
```
Auto refresh tick failed with error. ...
Error: Calling the 'getValueWithKeyAsync' function has failed
→ Caused by: User interaction is not allowed.
```

**Root cause:** Supabase auth-js corre un timer de 50min para auto-refresh de la session. Con `keychainAccessible: WHEN_UNLOCKED_THIS_DEVICE_ONLY` en `supabase-secure-storage.ts`, el timer dispara mientras el device está bloqueado → Keychain rechaza la lectura → Supabase logea como `console.error`. No había AppState wiring para pausar el auto-refresh en background.

**Fix dos capas:**
1. `supabase-secure-storage.ts`: `WHEN_UNLOCKED_THIS_DEVICE_ONLY` → `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY` (nivel recomendado por Apple para tokens con background access). Misma garantía anti-forensics. El PIN hash queda en WHEN_UNLOCKED porque solo se chequea en user interaction.
2. `supabase.ts`: AppState listener pausa `auth.startAutoRefresh()` cuando app va a background, resume al volver (patrón oficial de Supabase docs).

**Verificación:** Owner confirmó en runtime que el error desapareció.

## Review #2 — Important (8 cerrados)

### Backend (2 fixes)
- **I1**: `notifications` DELETE policy asimétrica (mismo bug que ya cerramos en `expenses` y `fixed_expense_payments`). Migración `20260601003000` simétrica al UPDATE de `20260510000000`. Deployed.
- **B2**: `fixed_expenses` sin `created_by` → documentado como decisión intencional de producto (shared family resource). Migración `20260601004000` con `comment on table`. Deployed.

### Architecture (2 ciclos rotos)
- **I2a**: ciclo `home ↔ expenses` via `add-expense-model` → `rankCategoriesByUsage` y `pickTopCategoryDescriptions` movidas a `mobile/features/expenses/category-ranking.ts`. Re-export thin para callers existentes.
- **I2b**: ciclo `home ↔ family` via `homeSnapshotQueryKey` → `use-family-actions` ahora importa del leaf existente `mobile/features/home/home-snapshot-query-keys.ts`.

### Performance (3 mejoras)
- **I3**: theme split adoption — 7 row components calientes migrados de `useAppTheme()` a `useThemeTokens()` (swipe-row, gasto-row, expense-history-row + 2 sub-files, fijo-row, notification-feed-list). Cada uno verificado NO consumir `preference`/`setPreference`. Ahora toggle de tema preference no re-renderea esas listas.
- **I4**: `home-activity-section.tsx` mismo bug `members.find()` × N rows que fixeé en gastos-v2. Resuelto con `memberById` Map.
- **I5**: DAY_MS extraction completada — 6 archivos en `mobile/features/insights/` + `pay-cycle.ts` migrados a `@/utils/time`. `DAY_MS_LOCAL` en `control-signals.ts:1558` también consolidado.

### Tests/CI (3 mejoras)
- **I6**: `npx expo export --platform ios` ahora corre en CI como bundle regression guard. Habría capturado el `pbkdf2/events` que rompió el bundle el 2026-05-31.
- **I7**: tests RFC 6070 PBKDF2-HMAC-SHA256 test vectors agregados (c=1, c=2, c=4096). Los 3 vectors pasan → confirma que la implementación manual matchea el spec, no solo self-consistency.
- **I8**: `setup-deno` action agregado a CI; los smoke tests de send-family-push y notifications-orchestrator ahora corren en cada PR (antes eran dead code).

## Review #2 — Minor (5 cerrados)

- `control-advisor` CORS `*` → `manifiesto.app` allowlist (mirror de send-family-push). Deployed.
- `ROW_STAGGER_CAP` hoisted a module scope en `expense-history-list.tsx`.
- `.tmp_*` agregado a `.gitignore` para per-conversation scratch.
- AppState subscription en `supabase.ts` ahora retain'd en `globalThis` para HMR cleanup.
- `home-telemetry-helpers.ts` re-export shim eliminado; los 2 callers (use-home-telemetry + test) importan directo de `@/lib/telemetry-session`.

## Minor diferidos al backlog

- `formatMoney` shadowing en 3 archivos: requiere review de equivalencia semántica vs `mobile/utils/money.ts`. No es obvio si los 3 locales tienen formato distinto a propósito.
- `formatDeltaPercent` vs `formatDeltaPct` en `control-hero-preview`: semánticas distintas (uno opera sobre fracción, otro sobre %), no es pure dedup.
- `pin-lock` swallowed catches → `console.warn`: defer porque no hay Sentry hook todavía. Cuando se instale Sentry, prendemos los warns.
- Tests dedicated para `mobile/utils/percent.ts` + `time.ts`: bajo prio (utils son 5-25 LoC pure, ya ejercitados via callers).
- `refetchOnWindowFocus: false` "redundantes" en home/gastos/dev-health snapshots: queda como documentación de intent (no son ruido).

## Cosas que NO cambiaron (verificadas OK por review #2)

- Implementación manual de PBKDF2-HMAC-SHA256: cryptographically correcta per RFC 8018, 3 test vectors confirman.
- Los 3 gates de seguridad del review #1 (send-family-push, fixed_expense_payments RLS, notifications-orchestrator) siguen en pie sin regresión.
- Theme split aditivo: `useAppTheme` sigue funcionando para los 444 callers no migrados.
- Bundle de iOS: 5.58 MB hbc, 2803 modules, exporta limpio.

## Cosas verificadas pero NO actionables (snapshots de estado)

- 22 motion-token legacy violations baselined siguen ahí (drenarlos = chunk de UI polish separado).
- Mega-screens: gastos-v2 (1474 LoC), add-fijo-v2 (1591), settings (1479), asistente (851) — sin nuevos antipatterns, sin extracción de controllers todavía (backlog post-P4).
- God-hooks: `use-control-v2-data.ts` (640 LoC), `use-home-snapshot.ts` (457), `use-family-actions.ts` (324) — sin growth desde el ciclo anterior. Snapshot RPC pattern los mantiene bounded.

## Deploy status (prod Supabase)

| Acción | Estado |
|--------|--------|
| Migrations P0/P1 (3 del ciclo anterior) | ✅ deployed 2026-05-31 |
| `send-family-push` v2 (gate + CORS + timing-safe) | ✅ deployed 2026-05-31 |
| `notifications-orchestrator` v2 (gate + timing-safe) | ✅ deployed 2026-05-31 |
| Migration `20260601003000` (notifications DELETE) | ✅ deployed 2026-06-01 |
| Migration `20260601004000` (fixed_expenses comment) | ✅ deployed 2026-06-01 |
| `control-advisor` v2 (CORS allowlist) | ✅ deployed 2026-06-01 |

## Verificación end-to-end

- `npm run validate` → 370 tests pass, 0 motion regressions ✅
- `npx expo export --platform ios` → 5.58 MB hbc, 2803 modules ✅ (regression guard agregado a CI)
- Runtime iOS: lock+resume sin errors ✅ (confirmado por owner)
- CORS smoke test prod: control-advisor rechaza origins no permitidos, echoea manifiesto.app ✅

## Lección persistente (memoria del proyecto)

Memoria `feedback_validate_is_not_bundle.md` ya guardada el 2026-05-31. Reforzada en review #2 con el bundle check en CI (commit 98a2625).

## Pendientes del owner (no puedo hacerlos)

- 🔐 Rotar `.env.supabase` tokens (omitido por pedido del owner; documento queda como referencia).
- 🔧 EAS Secrets: `eas secret:create --name EXPO_APPLE_ID` + `EXPO_ASC_APP_ID` antes de `eas submit`.
- 🚀 `git push origin main` cuando quieras subir los 58 commits.
