# Security Hardening Sprints E → I · COMPLETE (HISTÓRICO)

> ⚠️ **Este doc cubre solo hasta Sprint I (2026-06-10)**. El journey continuó con Sprints J → Q y Audits #3 a #11 hasta llegar al estado "audit-saturated". Ver:
>
> → **[`2026-06-11-security-hardening-FINAL.md`](2026-06-11-security-hardening-FINAL.md)** ← canónico actual
>
> **Fecha cierre original**: 2026-06-10
> **Tipo**: milestone — red team audit + remediation completo + re-audit + residual fixes.
> **Status**: ✅ Verde para Apple submit (parcial — siguió expandiéndose).

## TL;DR

| Audit pass | Findings | Status |
|---|---|---|
| **Red team audit #1** (5 agents, 7M tokens) | 5 Critical + 19 High + 28 Medium + 27 Low = **~80 findings** | ✅ Cerrados via Sprints E + F + G + H |
| **Red team audit #2 re-audit** (5 agents) | 1 High + 8 Medium + ~12 Low residuales | ✅ Cerrados via Sprint I |
| **Tests** | 718 unit tests | ✅ Pasando |
| **Typecheck + lint** | 0 errors, 12 pre-existing warnings | ✅ Sin regresiones |
| **Total commits** | 48 commits ahead de `origin/main` | Pendiente push |

## Sprint inventory

### Sprint E — Criticals + Apple nonce (BLOQUEANTE pre-submit)

6 commits. Owner-authorized via `/goal`.

| # | Issue | Commit | Files |
|---|---|---|---|
| C1 | `expenses.created_by` FK ON DELETE RESTRICT → account deletion impossible | `5056960` | `supabase/migrations/20260612000000_*.sql` |
| C2 | Seed passwords plain text en migrations | `45b7c83` | rotation out-of-band + placeholder en migrations |
| C3 | Android backup XMLs faltantes | `fa57e85` | `plugins/with-android-backup-rules.cjs` (Expo config plugin) |
| C4 | `request_account_deletion` V2 dropped owner-of-family guard | `7fe85e1` | V3 con guard restored |
| C5 | `apply_month_close_decision` cross-family `meta_goal_id` | `979d4e8` | V6 con family scope validation |
| H1 | Apple Sign-In sin nonce | `97da5b3` | `mobile/lib/auth-nonce.ts` + `social-sign-in.ts` |

### Sprint F — Top Highs (12 commits)

| Stream | Findings cerrados | Commits |
|---|---|---|
| F-DB | F3 owner check + F7 invite throttle + F8 column control + F9 audit deny + F10 cycle anchor + F12 profiles blocked + F13 invite canonical helper | `1908aed → bf83a96` (7) |
| F-CI | F11 workflow permissions + SHA pinning + Slack escape | `a49f4a3` |
| F-Edge | F4 push edge function + F5+F6 cost amplifier + 4 Mediums extra | `7dc3262` |
| F-EAS | F1 OTA code signing (ECDSA→RSA keypair + workflow + runbook) | `21e80d1` |
| F-Mobile | F2 PIN 6-digit + 600k iter + weak blocklist + F14 captcha + F15 biometric authority | `9f22661`, `7232869`, `023cd50` |

### Sprint G — Mediums (10 commits)

| Stream | Findings cerrados | Commits |
|---|---|---|
| G-Auth | reset-password reauth gap + captcha kill-switch + PIN server lockout mirror + callback timeout + getUser cleanup | `3b2b485`, `7a09b8e`, `d75845d`, `7c47b3a` |
| G-DB | audit_log writes en 5 financial RPCs + family_remove_member push cleanup + backdated expense trigger | `2e95885`, `c290d54`, `be646e3` |
| G-Infra | gitleaks rules expanded + EXPO_TOKEN split + sourcemap audit runbook | `c676cb1`, `d17ff79`, `37d4c53` |

### Sprint H — Lows (10 commits)

| Stream | Findings cerrados | Commits |
|---|---|---|
| H-AuthMobile | password policy + email enumeration + cancel_deletion rate limit + session memory + biometric requireAuth + push retry queue + reauth fallback config | `6ded675`, `a837ae8`, `ac7bf68`, `4790e30`, `c261227`, `c85a220` |
| H-EdgeDB | bearer parser strict + orchestrator OPTIONS + rate-limit error code + UUID validation + peek_invite generic error | `b56a09e`, `43dbb24`, `c019dce`, `e54de4e` |

### Sprint I — Re-audit residuals (10 commits)

| Stream | Findings cerrados | Commits |
|---|---|---|
| I-General | I-1 doc drift RSA/ECDSA + I-2 bearer regression in new edge fn + I-3 push queue cap + I-4 reset-password gate + I-5 per-family rate-limit owner fallback + I-6 captcha banner + service-role reject | `3e81526`, `5d0e697`, `2978770`, `ffbf03c`, `877717c`, `e3f29f2` |
| I-RLS | I-DB1 monthly_summary generic error + I-DB2 track_pin_failure rate limit + I-DB3 audit_log retention cron + I-DB4 create_family_invite rate limit | `0f7dc58`, `cb5d180`, `a66111f`, `adf3a8d` |

## Owner action items (críticos antes de Apple submit)

| # | Acción | Por qué |
|---|---|---|
| 1 | **Actualizar App Store Connect** → Información para revisión → Contraseña con el nuevo password de `apple.review@manifiestoapp.com` | Sprint E·C2 rotó el password en remote; el viejo (`AppleReview2026!`) ya no funciona |
| 2 | **Agregar `EXPO_UPDATE_PRIVATE_KEY` a GitHub Secrets** | Sprint F·F1: sin este secret, `ota-update.yml` falla loudly en el próximo push |
| 3 | Backup `keys/private-key.pem` a 1Password | Sin backup, perder el archivo = regen forzado de keypair |
| 4 | (Opcional) Generar `EXPO_BUILD_TOKEN` + `EXPO_UPDATE_TOKEN` en expo.dev y agregar a GitHub Secrets | Sprint G-Infra2: token scoping (backward-compat fallback ya está) |

## Findings residuales (Low/Info — acceptable risk)

Estos quedaron documented como follow-ups post-launch. Ninguno bloquea submit:

| # | Finding | Por qué deferred |
|---|---|---|
| Auth N1 | `markVerified` API surface | Sin callers actuales — refactor cosmético |
| Auth N2 | Auth callback retry race | Cosmetic, ya tiene `signOut()` defensive |
| Auth N3 | PIN server-mirror cold-start gap | Documented honestly como threat model |
| Auth N4 | Refresh token write failure swallowed | UX confuso, no exploitable |
| Mobile N3 | PIN auto-upgrade write race | Bounded por silent retry next time |
| Mobile N4 | Cert sin runtime pinning | Out of scope (mobile audit) |
| Edge L3 partial | 429/503 in control-advisor + register-push-subscription | Fixed in send-family-push; otros usan same helper |
| Edge L5 partial | UUID validation in send-family-push | Closed in control-advisor + register-push-subscription |
| Infra M-2 | postinstall scripts in CI | `patch-package` requires this — accepted residual |
| Infra N-3,4,5,6 | Various low-priority hygiene | Worth a follow-up sprint but not security-critical |
| DB N4-N8 | Trigger DISABLE bypass, audit_log retention metadata, mixed rate-limit semantics | Defense-in-depth follow-ups |

## Lo que esto desbloquea

✅ Apple submit (H8) puede proceder con confianza.

App Store Review típicamente:
- Verifica que "Delete Account" funciona end-to-end → **C1 cierra esto** (FK ON DELETE SET NULL)
- Loguea con la cuenta de Apple Review → necesita el password nuevo (owner action item #1)
- Verifica que features matchean la descripción → screenshots ya armados (milestone 2026-06-11)

## Métricas finales

- 48 commits sobre `origin/main`
- ~60 unique security findings cerrados
- 718 tests passing
- 0 type errors, 0 lint errors (12 pre-existing warnings, none introduced)
- 0 deuda técnica nueva
- 0 regresiones funcionales detectadas

## Referencias

- [Sprint plan](2026-06-10-security-hardening-sprints.md) — los 4 sprints planificados antes de ejecutar
- [App Store assembled](2026-06-11-app-store-assembled-ready-for-review.md) — milestone pre-audit
- [Runbook release automation](../operaciones/runbook-release-automation.md) — sección Apple Review credentials + EAS Update code signing + EXPO_TOKEN scoping
