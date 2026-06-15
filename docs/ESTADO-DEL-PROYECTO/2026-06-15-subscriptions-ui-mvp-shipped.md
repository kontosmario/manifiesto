# Suscripciones — UI redesign + estados + MVP super-admin · SHIPPED

> **Fecha**: 2026-06-15
> **Tipo**: milestone — rediseño integral de la UI de suscripciones, fixes de
> compliance/bugs, distinción comprador/cubierto, integrantes del hogar y un
> super-admin para acceso MVP. Branch `feature/subscription-ui-redesign` → main.
> **Doc canónico del sistema**: [`docs/sistemas/subscriptions.md`](../sistemas/subscriptions.md).
> **Checklist de launch**: [`docs/PRE-LAUNCH.md`](../PRE-LAUNCH.md).

## TL;DR

Toda la UI de suscripciones quedó rediseñada, alineada a la paleta de Ajustes,
compliant con Apple 3.1.2, con estados claros y un panel de super-admin. El
backend (migraciones + `validate-purchase`) está vivo en prod y verificado.

## Qué se hizo

### UI / UX
- **Rediseño** PaywallView + ManageView (sheets on-brand, RiseView, luciérnagas
  acotadas al hero+tiles), `FreePeriodNudge` en Home.
- **Downgrade diferido**: StoreKit no emite evento → banner OPTIMISTA con fecha +
  reconciliación con el server (refetch +4s/+9s); single-flight liberado rápido
  (evita "ya hay una compra en curso"). Hardening por revisión adversarial.
- **Paleta alineada a Settings**: fondo `DARK_TAB_CANVAS` + `AmbientBlobs`, cards
  `surfaceMuted`/`creamCard` + `line`, hero de membresía sin gradiente brillante.
  Hero/luciérnagas quedan solo en los plan-tiles + el mark de celebración.
- **Estados claros**: activa / "Habilitado hasta" / gracia / cortesía /
  **miembro cubierto** / **MVP**. a11y (roles link/button), dark-mode tokens.

### Compliance Apple 3.1.2
- Disclosure de auto-renovación completo en la paywall (cargo Apple ID ·
  renovación salvo cancelación 24hs · gestión en Ajustes), headline de gate
  neutral (sin "gratis" engañoso).

### Backend (vivo en prod)
- `is_purchaser` en el snapshot → comprador vs miembro cubierto.
- `signed_date` ordering: `validate-purchase` rechaza receipts sin signedDate.
- Estado **MVP** (`family_entitlements.mvp`): acceso total de por vida, resuelve
  por encima de todo. `is_super_admin()` (solo kontosmario@gmail.com) + RPCs
  `admin_search_users` / `admin_set_mvp` con gate como primera línea.
- Migraciones `20260620120000`→`150000` aplicadas. `validate-purchase` deployada.

### Features nuevas
- **Integrantes del hogar** en el manage: avatar + nombre + "Se unió el …" +
  badge "Dueño".
- **Panel super-admin** (Ajustes → "Cuentas MVP", visible solo para kontosmario):
  buscar por email + toggle MVP, con estado claro por usuario (titular paga /
  cubierto + quién paga / MVP / cortesía / prueba / sin plan).

## Verificación
- tsc 0 · lint limpio · 26 unit tests · `expo export` iOS bundlea en cada commit.
- e2e sandbox: alta, upgrade, downgrade, restore, renovación, cross-family 409.
- Backend: regresión de `resolve_entitlement` OK; gate admin → forbidden sin sesión.
- Auditoría adversarial multi-agente del fix de downgrade y del compliance.

## Commits
`feature/subscription-ui-redesign` (52 commits sobre main) — desde el spec/plan
del rediseño hasta el super-admin MVP y el fix defensivo del chip de acceso.

## Pendiente para LANZAR
Ver [`docs/PRE-LAUNCH.md`](../PRE-LAUNCH.md): build nuevo, Paid Apps Agreement,
enviar la suscripción a revisión, `APP_ENV→production`, limpiar test states,
re-habilitar captcha.
