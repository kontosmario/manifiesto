# Security Hardening Sprints E → F → G → H

> **Source**: Red team audit 2026-06-10 (5 agents, 7M tokens), encontró 5 Critical + 12 High + ~22 Medium + ~25 Low.
> **Goal**: Cerrar 100% de findings + re-audit antes de App Store submit.
> **Owner authorization**: `/goal utilizando los MEJORES agentes arregla TODOS los puntos` (2026-06-10).

## Sprint E — Criticals + Apple nonce (BLOQUEANTE para submit)

| # | Issue | Severity | Approach | Files |
|---|---|---|---|---|
| E1 | `expenses.created_by` FK ON DELETE RESTRICT → account deletion no funciona | C | Migration: `expenses.created_by` nullable + `ON DELETE SET NULL`. Same para `month_close_decisions.decided_by` + audit todas las FKs a `auth.users(id)` | `supabase/migrations/` |
| E2 | Seed account passwords en plain text en migrations committed a prod | C | Rotar passwords via SQL directo (no migration), actualizar app store review notes + memory | App Store Connect + memory |
| E3 | Android backup XMLs faltantes | C | Crear `secure_store_backup_rules.xml` + `secure_store_data_extraction_rules.xml` en `res/xml/` con excludes apropiados | `android/app/src/main/res/xml/` |
| E4 | `request_account_deletion` V2 dropped owner-of-family guard | C | Migration: re-agregar el block en V2 antes del idempotency check | `supabase/migrations/` |
| E5 | `apply_month_close_decision` no valida cross-family `meta_goal_id` | C | Migration: agregar pre-check de family scope | `supabase/migrations/` |
| E6 (H1) ✅ | Apple Sign-In sin nonce → identity token replay possible | H (urgent) | **DONE 2026-06-10**: Helper `mobile/lib/auth-nonce.ts` (CSPRNG 32B + sha256 via js-sha256). `signInWithApple` ahora pasa `nonce: hashedNonce` a Apple y `nonce: rawNonce` a Supabase. Tests: `tests/unit/auth-nonce.test.ts` (6). Apple display_name patch ahora condicionado a `user_metadata.display_name` vacío para no pisar nombre custom. Google sigue sin nonce (la API native `signIn()` v16 no lo expone — sólo en OneTap paid tier; documentado en código). | `mobile/features/auth/`, `mobile/lib/auth-nonce.ts` |

## Sprint F — Top Highs (defense in depth)

| # | Issue | Approach |
|---|---|---|
| F1 | EAS Updates sin code signing → OTA hijack | `npx expo-updates codesigning:generate` + integrar en `app.config.ts` + sign en CI |
| F2 | PIN 4-digit + 100k PBKDF2 brute-force offline | Permitir PIN 6+ digits + bump a 600k iterations (OWASP 2023) + reject weak PINs (0000, 1234, etc) |
| F3 | `apply_month_close_decision` y `apply_reserve_decision` no checkean owner | Migration: agregar `is_family_owner` check |
| F4 | Push subscriptions upsert directo desde mobile | Edge function `register-push-subscription` que usa `auth.uid()` server-side |
| F5+F6 | `control-advisor` y `send-family-push` cost amplifier (per-user only) | Agregar per-family rate limit bucket |
| F7 | `consume_family_invite` idempotent shortcut bypasea rate limit | Mover throttle a antes del shortcut |
| F8 | `savings_goals.current_amount` writable direct por owner | Column-level grant deny + CHECK >= 0 + funnel via RPC |
| F9 | `audit_log` sin policies UPDATE/DELETE explicit deny | Policies `for update using (false)` + `for delete using (false)` |
| F10 | `p_new_cycle_anchor` acepta '9999-12-31' | Validar `between current_date - 7 and current_date + 45` |
| F11 | Workflows GitHub Actions sin `permissions:` block | Agregar `permissions: { contents: read }` + pin actions a SHAs |
| F12 | `profiles_select_same_family_or_self` no filtra `blocked` | Update policy |
| F13 | `create_family_invite` usa `blocked_at IS NULL` vs canonical helper | Update policy |
| F14 | `usePasswordSignIn` no pasa `captchaToken` | Pasar captchaToken |
| F15 | Biometric flag en AsyncStorage permite bypass de Keychain integrity | Make Keychain authoritative |

## Sprint G — Mediums

| # | Topic | Items |
|---|---|---|
| G1 | Edge functions | M1 CORS threading control-advisor / M2 orchestrator error leak / M3 send-family-push error leak / M5 messages batch sanitization |
| G2 | Auth | reset-password reauth gap / captcha kill-switch / PIN lockout server mirror / callback timeout cleanup / getUser unnecessary |
| G3 | Mobile | push token edge function (F4 ya cubre) / Apple first-name conditional / reset-password origin telemetry |
| G4 | Database | F2 profiles blocked filter (F12 ya cubre) / F3 invite blocked check (F13) / F6 SECDEF audit gap / family_remove_member push subs cleanup / backdated expense closed month guard |
| G5 | Infra | gitleaks rules tighter / EXPO_TOKEN split build/update / sourcemap visibility |

## Sprint H — Lows (hygiene)

| Topic | Items |
|---|---|
| Password & PIN policies | Min 10 char password + cap 72 + weak PIN blocklist (0000, 1234, 1111, 9876, repeats) |
| Error message hardening | Login error generic + reset password device prove + cancel_account_deletion rate limit |
| Misc | bearer parser stricter + rate-limit error code differentiation + UUID format validation + `requireAuthentication: true` on refresh token + tearDownPushNotifications retry queue + RequireReauthSheet fallback hierarchy |

## Re-audit

Después de cerrar Sprints E+F+G+H:
- Disparar los mismos 5 red team agents
- Verificar que los findings ya no existen
- Documentar findings residuales (si los hay)
- Si hay nuevos Criticals: nuevo sprint correctivo
- Sino: ✅ verde para submit
