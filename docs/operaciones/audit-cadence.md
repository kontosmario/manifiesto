# Security Audit Cadence + Methodology

> **Origen**: la metodología que emergió durante el loop-until-dry de 2026-06-10 → 2026-06-11 (11 audit passes, 14 sprints, ~185 findings).
> **Para qué**: ejecutar audits futuros con el patrón que probó funcionar.

## TL;DR

- **Cuando audit-saturated**: el último audit explícitamente dice "no más findings de impacto práctico" — no audit nuevo a menos que cambie algo material.
- **Triggers para re-audit**: feature mayor nueva, dep upgrade material, vulnerability discloure pública en alguna dep, milestone de tiempo (cada 6 meses).
- **Single canonical doc**: el último FINAL milestone reemplaza al anterior. Ver [`docs/ESTADO-DEL-PROYECTO/2026-06-11-security-hardening-FINAL.md`](../ESTADO-DEL-PROYECTO/2026-06-11-security-hardening-FINAL.md).

## Patrón loop-until-dry

```
1. Audit pass (3-5 agents paralelos con diferentes ángulos)
   ↓
2. Sprint de remediation (1 agent por categoría, o monolítico si <8 fixes)
   ↓
3. Sprint commits → main → push
   ↓
4. Audit pass nuevo con ÁNGULOS DIFERENTES (no repetir los mismos)
   ↓
5. Si encuentra findings reales → repeat
   ↓
6. Si los agents dicen "audit-saturated" o solo encuentran lows acceptable → STOP
```

### Por qué funciona el patrón

- **Paralelismo de agents**: cada agent tiene contexto fresco, no se contamina con assumptions previas.
- **Ángulos diferentes por pass**: la diversidad fuerza a explorar zonas no cubiertas (ver tabla abajo).
- **Honesty calibration**: cada prompt explícitamente dice "if you find nothing real, state so". Sin esto, los agents inflan findings para parecer útiles.
- **Verdict explícito**: cada audit termina con GREEN / YELLOW / RED. Cuando hay 0 fixes reales por 2+ audits seguidos, parar.

## Ángulos de audit (los 11 que usamos)

| # | Audit angle | Lo que busca |
|---|---|---|
| 1 | Red team general (5 agents: auth, RLS, edge, mobile, infra/biz) | Foundation issues — coverage amplia |
| 2 | Re-audit verification | Confirma cierre del round 1 + nuevos issues introducidos por los fixes |
| 3 | Aggressive fresh hunt | Lo que el round 1 se perdió — agentes con bias "skeptical" |
| 4 | Sprint J verification | Específico al last sprint — busca regresiones |
| 5 | Adversary scenario + composition + paranoia | "Ex-pareja con acceso", chains de 2+ operaciones, side-channels específicos |
| 6 | Sprint L verification | Repeat del patrón verification |
| 7 | Time + DoS + Reverse engineering | Clock manipulation, resource exhaustion, IPA decompilation, deep link probes |
| 8 | i18n + Numerical + 3rd party trust | Unicode/bidi attacks, money math, compromised dep scenarios |
| 9 | Side channels + Crypto agility + Mobile platform quirks | Timing oracles, key rotation, iOS-specific attack vectors |
| 10 | Forensic + Operational + Code review | Logs/traces/caches, runbook misexecution, cross-cutting code review |
| 11 | (Final) Sprint Q verification | Saturación signal |

## Setup técnico

### Dispatch pattern

```typescript
// Cada audit agent corre paralelo via Agent tool con run_in_background: true
const auditAgents = [
  { angle: 'auth bypass', subagent_type: 'general-purpose', prompt: '...' },
  { angle: 'RLS escalation', subagent_type: 'general-purpose', prompt: '...' },
  // ...
]

for (const agent of auditAgents) {
  Agent({ ...agent, run_in_background: true })
}
// Esperar notifications de completion, consolidar findings
```

### Prompt template (para cada audit agent)

```
You are conducting audit pass #N on Manifiesto. Work in /Users/mario/apps/manifiesto.

## Context
[N-1 audits + Y sprints closed ~K findings. State current verdict.]

## Your specialty: [ANGLE]
[Why this angle hasn't been deeply explored before.]

## Specific attack vectors
[10-20 concrete vectors to probe — be specific.]

## Output format
- Severity (Critical/High/Medium/Low/Info)
- Concrete attack scenario
- Files/lines
- Why missed previously
- Mitigation

## Calibration
- Be ruthless about quality
- If you find nothing real, state so explicitly
- Drop weak findings — speculation is not a finding
- List what you VERIFIED CLEAN explicitly

Word limit: 2000-2500 words.
```

### Sprint dispatch pattern

```
Sprint = 1 fix agent monolítico si <8 fixes, sino split:
- DB migrations: 1 agent
- Edge functions: 1 agent
- Mobile: 1 agent
- Infra/CI: 1 agent
```

Cada sprint agent:
1. Recibe findings de un audit pass
2. Implementa migrations (idempotent, con header explicando finding ref)
3. Modifica mobile/edge files con scope limitado
4. Add tests donde aplique
5. Verify con `npm run typecheck && npm run lint && npx vitest run`
6. Verify migrations con `npx supabase db push --linked --include-all`
7. Commit each fix separately con reference al finding (Sprint X · Y-Z)
8. NO push to origin — el orchestrator pushea al final

## Reglas para findings (calibration)

### CRITICAL

- Account takeover (lo que sea — auth bypass, JWT mint, password recovery hijack)
- RCE en server (edge function, SQL injection)
- Data breach end-to-end (cross-tenant read/write)
- Service deletion (drop table, mass DELETE without WHERE)

### HIGH

- Privilege escalation (member→owner, regular user→service role)
- Money manipulation (negative amount injection, race condition double-spend)
- Significant DoS (account lockout poisoning, rate limit bypass at scale)
- Critical UX bug (P0 user-bricking — like Sprint J's PIN length issue)

### MEDIUM

- Information disclosure (timing oracle, error message leak)
- Privacy gap (PII in lock-screen, cross-device stale state)
- Defense-in-depth gap (no per-family rate limit, sanitize bypass)
- Operational fragility (no CI guard for cert expiry)

### LOW

- Hygiene (minor info leak, edge case in error handling)
- Code consistency (one function uses canonical helper, another uses raw column check)
- Cosmetic UX (banner copy could be better)

### INFO

- Inherent platform characteristics (Hermes bytecode preserves source paths)
- Documented trade-offs (ZWJ rejection vs emoji family rendering)
- Out-of-scope concerns (Apple's APNs is not E2E encrypted)

### NOT a finding (drop)

- Theoretical concerns sin attack path concreto
- "What if a future maintainer..." (move to runbook, not security)
- Reformulation de findings de audits previos
- "I would prefer X over Y" cuando ambos son aceptables

## Cuándo parar

Stop loop cuando uno o más de:

1. **2 audits consecutivos retornan 0 findings reales** (solo inherent/info)
2. **Audit agents explícitamente dicen "audit-saturated"** o similar
3. **El último sprint fix-rate es 0** (todos los findings dropped como invalid)
4. **Cost-benefit colapsa**: el último fix tomó 8 horas y cerró un Low

Cuando hayas parado:
- Update milestone canónico con verdict
- Update memoria (memory/) con "no más audits hasta cambio material"
- Document accepted residuals explícitamente

## Métricas históricas (2026-06-10 → 2026-06-11 journey)

| Pass | Findings | Sprint Response | Commits | Insight |
|---|---|---|---|---|
| 1 | ~80 | E+F+G+H | 38 | Foundation issues, ancho |
| 2 | 9 | I | 10 | Residuales del round 1 |
| 3 | 30 (incl P0) | J | 17 | Fresh hunt encontró cosas grandes |
| 4 | 6 | K | 4 | Verification del J |
| 5 | 14 | L | 8 | Composition + adversary scenarios |
| 6 | 0 | — | — | GREEN signal — pero no era el final |
| 7 | 14 | M | 9 | Time/DoS/RE ángulos nuevos abrieron camino |
| 8 | 5 | N+O | 12 | i18n + 3rd party encontró PII leak |
| 9 | 8 | P | 7 | Side channels + mobile platform |
| 10 | 8 (LOW only) | Q | 7 | Saturación señal |
| 11 | — | — | — | Audit-saturated verdict |

**Total**: 184 findings closed, 115+ security commits, 14 sprints.

## Cuándo NO correr audit

- **App pequeña en pre-launch sin users**: el costo de auditoría supera el valor. Espera a tener users reales.
- **Cambio cosmético/UX**: no afecta security model.
- **Solo bumpeaste deps minor sin breaking changes**: gitleaks + `npm audit` alcanzan.
- **Re-deploy sin code changes**: no aplica.

## Cuándo SÍ correr audit (post-launch)

- **Feature mayor nueva** (sobre todo si toca auth/RLS/edge functions): mini-audit focused al feature
- **Dep upgrade material** (Supabase SDK major bump, Expo SDK 54→55, etc): audit focado al diff
- **Vulnerabilidad pública en dep usada**: focused audit + dep upgrade
- **Cada 6 meses como cadence operacional**: light audit (1-2 agents, ángulos no cubiertos)
- **Pre-major-release** (v2.0 después de 6 meses de cambios): full 3-5 agent pass

## Referencias

- [Sprint hardening FINAL milestone](../ESTADO-DEL-PROYECTO/2026-06-11-security-hardening-FINAL.md) — el journey completo que generó esta metodología
- [Runbook release automation](runbook-release-automation.md) — rotación de secrets / cert expiry CI guards
