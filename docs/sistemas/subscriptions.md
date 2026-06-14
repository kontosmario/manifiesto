# Suscripciones — comportamiento real

> **Estado**: Fase 1 LIVE en branch `feature/subscriptions` (2026-06-12).
> Backbone de entitlement + enforcement. **Sin IAP real todavía** (Fases 2-4
> pendientes: expo-iap, validate-purchase, webhook ASSN v2, App Store Connect).
> Spec canónico: [docs/superpowers/specs/2026-06-12-apple-subscriptions-design.md](../superpowers/specs/2026-06-12-apple-subscriptions-design.md).
>
> **Update 2026-06-14**: IAP real verificado e2e en sandbox (compra / webhook /
> restore / renovación) y **UI de suscripciones rediseñada** (branch
> `feature/subscription-ui-redesign`). Ver §"UI de suscripciones" abajo + spec
> [2026-06-14-subscription-ui-redesign-design.md](../superpowers/specs/2026-06-14-subscription-ui-redesign-design.md).

## UI de suscripciones (rediseño 2026-06-14)

Una ruta adaptativa — Ajustes → "Plan del hogar" (`billing-screen.tsx`) — que
según `useEntitlement().source` muestra:

- **PaywallView** (Estado A, no-suscripto): trial/free. En período libre agrega
  `FreePeriodBanner` ("Acceso completo · N días" — NUNCA "prueba/gratis",
  compliant). `lockMode` = gate duro (chip "ACCESO PAUSADO", sin back).
- **ManageView** (Estado B, suscripto): subscription/family/comped. Hero de
  membresía + filas (renovación, miembros con avatares, auto-renovación, precio)
  + acciones (cambiar plan, administrar/cancelar en App Store, restaurar). La
  variante de estado (activa / "Habilitado hasta" / gracia / cortesía) la calcula
  `membership-state.ts`.

Componentes (`mobile/components/billing/`): `fern-mark`, `brand-lockup`,
`member-avatars`, `plan-tiles`, `savings-ribbon`, `free-period-banner`,
`membership-hero`, `subscription-detail-rows`, `membership-actions`,
`purchase-result-sheet` (sheets via `ModalCard`; success celebra con helecho +
luciérnagas + confetti; gotcha modal-chain con `InteractionManager`),
`free-period-nudge` (Home). Identidad: A+C + luciérnagas (`CardParticles`) + logo
helecho + light/dark. El snapshot RPC suma `auto_renew` + `grace_expires_at`.

## Qué resuelve

Monetización con suscripciones nativas de Apple. Período libre de 30 días por
usuario; al vencer sin pago, paywall duro. Entitlement resuelto server-side
con prioridad; el cliente nunca decide su propio acceso.

## Modelo (Fase 1, vivo en prod)

### Trial monotónico per-usuario

Derivado de `profiles.created_at` (no es un contador guardado):
`days_left = greatest(0, trial_days − (now()::date − created_at::date))`.
Anclar a `created_at` hace el exploit de "entro a una familia paga, salgo y
reinicio mi prueba" **imposible por diseño** — no hay estado que resetear.
`profiles.trial_days` (default 30) permite variar por cohorte; el backfill
del deploy dio piso de ≥30 días a las cuentas existentes.

### Suscripción per-familia

Tabla `family_entitlements` (una fila por familia, seed vía trigger en
`families`). Guarda el estado de la sub de Apple: `subscription_status`
(none/active/grace/expired), `original_transaction_id` (ancla de routing),
`product_id`, `expires_at`, `grace_expires_at`, `pending_product_id`
(downgrade), `last_applied_signed_date` (ordering), `comped` (acceso manual),
`environment`. **RLS**: miembros leen su familia; escritura solo edge
functions (Fase 2+). `subscription_events` (dedup + ordering + audit) es
solo service_role.

### Resolución en cascada

`resolve_entitlement(user_id)` — cálculo puro de DB, NO consulta StoreKit:

```
1. comped                          → acceso
2. familia con sub active/grace    → acceso (source 'family')
3. trial monotónico (days_left>0)  → acceso (source 'trial')
4. else                            → BLOQUEADO (source 'free')
```

`family_entitlement_snapshot()` lo envuelve y agrega `member_cap`,
`member_count`, `pending_product_id`, `trial_days_left` (estado del período
libre personal aunque el acceso venga del hogar — lo usa el aviso de salir).

### Path de escritura unificado

`apply_subscription_transaction(...)` con ordering por `signed_date`: lo
compartirán `validate-purchase` (Fase 2) y el webhook (Fase 3) para no
clobberearse. Idempotente: nunca pisa estado más nuevo con más viejo.

## Enforcement (cliente)

- **`SubscriptionGate`** ([mobile/components/billing/subscription-gate.tsx](../../mobile/components/billing/subscription-gate.tsx)):
  montado en el layout de tabs (corre DESPUÉS del unlock, como `ShareImportHost`).
  Lee el snapshot vía `useEntitlement`; si `has_access:false` monta
  `billing-screen` en `lockMode` como overlay no descartable.
- **`use-entitlement`** ([mobile/features/billing/use-entitlement.ts](../../mobile/features/billing/use-entitlement.ts)):
  hook React Query del snapshot. Default a prueba de fallos = BLOQUEADO.
  Lógica pura testeable en [entitlement-snapshot.ts](../../mobile/features/billing/entitlement-snapshot.ts).
- **Nudge del período libre** ([free-access-nudge.ts](../../mobile/features/billing/free-access-nudge.ts)):
  badge "Acceso completo: N días restantes" (copy neutro — NUNCA "Prueba"/
  "trial") + banner por umbrales [7,3,1] una vez por umbral. Solo cuando
  `source==='trial'` (miembros de familia / pagos nunca ven el contador).
- **Cap check** en `create_family_invite`: no se invita por encima del cap
  del plan vigente (2 free/mensual, 4 anual). Downgrade grandfathering: no
  expulsa a nadie, solo bloquea nuevas invitaciones.
- **Aviso al salir de familia**: si `source==='family'` y `trialDaysLeft===0`,
  el `Alert.alert` de `leave_current_family` advierte que pasará al plan
  gratuito.

## Artefactos (Fase 1)

- Migraciones: `20260615060000` (modelo) · `20260615061000` (resolución) ·
  `20260615062000` (cap check) · `20260615063000` (trial_days_left).
- Cliente: `use-entitlement.ts`, `entitlement-snapshot.ts`, `free-access-nudge.ts`,
  `subscription-gate.tsx`, `billing-screen.tsx` (lockMode), `settings-screen.tsx`
  (aviso leave), `(tabs)/_layout.tsx` (montaje del gate).
- Tests: `entitlement-snapshot-shape.test.ts` (3), `free-access-nudge.test.ts` (8).

## Qué falta (Fases 2-4)

2. **expo-iap + `validate-purchase`**: compra real, verificación JWS, mapping
   `original_transaction_id → family_id`, restore con error distinguible.
3. **Webhook ASSN v2**: ciclo de vida (renovación, gracia, refund, downgrade),
   guard de environment, bootstrap del mapping en initial buy, reconciliación.
4. **App Store Connect**: IAP key, productos, URLs del webhook, sandbox
   testers, elementos compliance del paywall, cuenta demo comped, build + submit.

> El gate y los nudges NO se validan en device hasta una build nueva (código
> nativo-RN, no viaja por OTA). En Fase 1 el paywall se puede ejercitar con
> `comped` (setear `family_entitlements.comped=true`) o con un usuario cuyo
> `trial_days_left` se fuerce a 0.

<!-- ✓ Sincronizado contra código el 2026-06-12 (Fase 1) -->
