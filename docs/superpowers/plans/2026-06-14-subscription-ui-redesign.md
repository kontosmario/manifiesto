# Rediseño UI de Suscripciones — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rediseñar toda la UI de suscripciones de Manifiesto (paywall, mi-suscripción, sheets, gate, nudges) en la dirección aprobada (A+C · luciérnagas · light/dark · logo helecho), pegada al design system, con motion craft (emil) y sheets via ModalCard.

**Architecture:** Una ruta adaptativa (Ajustes→Plan) que elige `PaywallView` (Estado A) vs `ManageView` (Estado B) según `useEntitlement().source`. Componentes nuevos en `mobile/components/billing/`, lógica pura testeable separada de la UI. El backend de entitlement (validate-purchase/webhook) NO cambia; solo el snapshot RPC gana 2 campos.

**Tech Stack:** React Native + Expo, Reanimated v4, react-native-svg, expo-iap, Supabase RPC, react-query, vitest (env node).

**Referencias:** Spec `docs/superpowers/specs/2026-06-14-subscription-ui-redesign-design.md`. Mockups aprobados en `.superpowers/brainstorm/stable-session/content/` (00-08). Design system: tokens en `mobile/theme/`, motion en `mobile/lib/motion/tokens.ts`.

**Convenciones globales (aplican a TODO componente):**
- Colores SOLO vía `useThemeTokens()` / `theme.colors.*` — nunca hex hardcodeado (excepto los gradientes forest `heroGradient` y el crema de luciérnagas que ya son tokens).
- Entrada de contenido: envolver bloques en `<RiseView delay={i*40}>` (stagger). Pantallas: `<Screen canGoBack title=…>` con chevron en header.
- Animaciones: solo `transform`/`opacity`. Respetar `useReducedMotion()`.
- Tras cada task de UI: `npx tsc --noEmit` + `npm run lint` deben pasar. Tras cada fase: `npx expo export --platform ios` debe bundlear (memoria: validate ≠ bundle).
- Commits: `feat(subscriptions): …` con `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## FASE 0 — Backend + capa de datos

### Task 0.1: Migración — `auto_renew` + `grace_expires_at` en el snapshot RPC

**Files:**
- Create: `supabase/migrations/20260620120000_snapshot_autorenew_grace.sql`

- [ ] **Step 1: Escribir la migración** (redefine la función agregando 2 columnas; ambas ya existen en `family_entitlements`)

```sql
-- supabase/migrations/20260620120000_snapshot_autorenew_grace.sql
-- Rediseño UI suscripciones: el snapshot expone auto_renew y grace_expires_at
-- para la fila "Renovación automática", la variante "Habilitado hasta" (auto
-- renovación off) y el estado de gracia ("reintentando hasta …"). Sin cambios
-- de escritura; ambas columnas ya existen en family_entitlements.
drop function if exists public.family_entitlement_snapshot();
create or replace function public.family_entitlement_snapshot()
returns table(
  source text, plan text, has_access boolean, days_left int,
  trial_days_left int,
  expires_at timestamptz, subscription_status text,
  member_cap int, member_count int, pending_product_id text,
  auto_renew boolean, grace_expires_at timestamptz
) language plpgsql security definer stable set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_family_id uuid;
  v_created_at timestamptz;
  v_trial_days int;
  v_trial_left int;
  r record;
begin
  if v_user_id is null then raise exception 'Not authenticated'; end if;
  select * into r from public.resolve_entitlement(v_user_id);

  select p.created_at, p.trial_days into v_created_at, v_trial_days
    from public.profiles p where p.id = v_user_id;
  v_trial_left := greatest(0, coalesce(v_trial_days,30) - (now()::date - v_created_at::date));

  select fm.family_id into v_family_id from public.family_members fm
    where fm.user_id = v_user_id and coalesce(fm.role,'') <> 'blocked' limit 1;
  return query
    select r.source, r.plan, r.has_access, r.days_left,
      v_trial_left,
      fe.expires_at, fe.subscription_status,
      (case when fe.product_id like '%yearly%' then 4 else 2 end)::int as member_cap,
      (select count(*)::int from public.family_members m
        where m.family_id = v_family_id and coalesce(m.role,'') <> 'blocked') as member_count,
      fe.pending_product_id,
      fe.auto_renew, fe.grace_expires_at
    from public.family_entitlements fe where fe.family_id = v_family_id;
end;
$$;
revoke all on function public.family_entitlement_snapshot() from public;
grant execute on function public.family_entitlement_snapshot() to authenticated;
```

- [ ] **Step 2: Aplicar a prod** vía Management API (el owner ya autorizó cambios con `.env.supabase`). Verificar que el snapshot devuelve las 2 columnas nuevas con una llamada de prueba como la familia `61bdc187`.

Run (verificación):
```bash
/tmp/sbq.sh "select * from family_entitlement_snapshot()"  # corrido como la sesión del owner, o un select directo de las columnas en family_entitlements
```
Expected: la función existe y retorna `auto_renew`, `grace_expires_at`.

- [ ] **Step 3: Commit**
```bash
git add supabase/migrations/20260620120000_snapshot_autorenew_grace.sql
git commit -m "feat(subscriptions): snapshot expone auto_renew + grace_expires_at"
```

### Task 0.2: Extender `EntitlementSnapshot` (autoRenew, graceExpiresAt)

**Files:**
- Modify: `mobile/features/billing/entitlement-snapshot.ts`
- Test: `tests/unit/entitlement-snapshot-shape.test.ts` (ya existe — agregar casos)

- [ ] **Step 1: Test que falla** (agregar al test existente)
```ts
import { normalizeEntitlementSnapshot, BLOCKED_ENTITLEMENT } from '@/features/billing/entitlement-snapshot'

it('mapea auto_renew y grace_expires_at del row', () => {
  const snap = normalizeEntitlementSnapshot({
    source: 'subscription', plan: 'yearly', has_access: true,
    auto_renew: false, grace_expires_at: '2026-06-18T00:00:00Z',
  })
  expect(snap.autoRenew).toBe(false)
  expect(snap.graceExpiresAt).toBe('2026-06-18T00:00:00Z')
})

it('default bloqueado: autoRenew true, graceExpiresAt null', () => {
  expect(BLOCKED_ENTITLEMENT.autoRenew).toBe(true)
  expect(BLOCKED_ENTITLEMENT.graceExpiresAt).toBeNull()
})
```

- [ ] **Step 2: Correr y ver fallar** — `npx vitest run tests/unit/entitlement-snapshot-shape.test.ts` → FAIL (`autoRenew` undefined).

- [ ] **Step 3: Implementar** — en `entitlement-snapshot.ts`:
  - Agregar al `interface EntitlementSnapshot`: `autoRenew: boolean` y `graceExpiresAt: string | null`.
  - Agregar a `BLOCKED_ENTITLEMENT`: `autoRenew: true, graceExpiresAt: null`.
  - Agregar al `normalizeEntitlementSnapshot` return: `autoRenew: row.auto_renew == null ? true : Boolean(row.auto_renew),` y `graceExpiresAt: (row.grace_expires_at as string) ?? null,`.

- [ ] **Step 4: Correr y ver pasar** — `npx vitest run tests/unit/entitlement-snapshot-shape.test.ts` → PASS. `npx tsc --noEmit` OK.

- [ ] **Step 5: Commit** — `feat(subscriptions): snapshot type expone autoRenew + graceExpiresAt`.

### Task 0.3: Hook de iniciales de miembros del hogar

**Files:**
- Investigar primero: `grep -rl "family_members\|useHousehold\|useFamilyMembers\|members" mobile/features mobile/hooks` para encontrar el hook existente de miembros.
- Create (si no existe uno reusable): `mobile/features/billing/use-household-initials.ts`
- Test: `tests/unit/household-initials.test.ts`

- [ ] **Step 1: Test de la función pura de iniciales**
```ts
import { toInitials } from '@/features/billing/use-household-initials'
it('toma iniciales de nombre y apellido', () => {
  expect(toInitials('Mario Kontos')).toBe('MK')
  expect(toInitials('Lucía')).toBe('L')
  expect(toInitials('')).toBe('?')
})
```
- [ ] **Step 2: Ver fallar.**
- [ ] **Step 3: Implementar** `toInitials(name: string): string` (primer char de hasta 2 palabras, uppercase; `'?'` si vacío) + el hook `useHouseholdInitials()` que reusa el hook/datos de miembros existente y devuelve `{ initials: string[]; count: number }`. Si ya hay un hook de miembros, este solo lo envuelve para mapear a iniciales.
- [ ] **Step 4: Ver pasar.**
- [ ] **Step 5: Commit** — `feat(subscriptions): hook de iniciales de miembros del hogar`.

---

## FASE 1 — Primitivas de marca

### Task 1.1: `FernMark` (logo helecho en react-native-svg)

**Files:**
- Create: `mobile/components/billing/fern-mark.tsx`
- Reusar artwork: copiar los paths del SVG `assets/brand/manifiesto-fern-v2-transparent.svg` (silueta + 2 hojas) al componente.

**Props:** `{ variant?: 'cream' | 'forest' | 'mint'; size?: number; style?: ViewStyle }`. `variant` define los 2 fills: cream = silueta `#FDFEF9` / hojas `#A9D57F`; forest = `#1F590D` / `#297811`; mint = `#A6EF8F` / `#77E755`. Default `cream`. `size` controla width (height = size * 742/841).

- [ ] **Step 1: Implementar** con `react-native-svg` (`Svg`, `Path`, `G`, `ClipPath`, `Rect`, `Defs`). Aplicar el patrón Raw + `React.FC` cast para los children de `Defs`/`ClipPath` (memoria `react_native_svg_typing`). Marcar el View contenedor `accessibilityElementsHidden` (decorativo). viewBox `0 0 841 742`.
- [ ] **Step 2: Verificar** `npx tsc --noEmit` + lint OK. Render manual: agregar temporalmente a una pantalla dev y ver las 3 variantes.
- [ ] **Step 3: Commit** — `feat(subscriptions): FernMark (logo helecho SVG, 3 variantes)`.

### Task 1.2: `BrandLockup`

**Files:** Create: `mobile/components/billing/brand-lockup.tsx`

**Props:** `{ tone?: 'onCream' | 'onForest' }`. Render: fila con `<FernMark variant={tone==='onCream'?'forest':'cream'} size={17} />` + Text "Manifiesto" (peso 900, color `text` en cream / `#F2EAD3` en forest) + Text "Hogar" (`theme.typography.eyebrow`, color `textMuted`/mint). Layout según mockup 08 `.lock`.

- [ ] **Step 1: Implementar.** **Step 2: tsc+lint.** **Step 3: Commit** — `feat(subscriptions): BrandLockup`.

### Task 1.3: `MemberAvatars`

**Files:** Create: `mobile/components/billing/member-avatars.tsx`

**Props:** `{ initials: string[]; max?: number }`. Render: círculos solapados (margin-left -6) con iniciales, borde del color del surface, fondo mint (light) / primary (dark). Si `initials.length > max`, último círculo "+N". Ver mockup 06 `.av6`.

- [ ] **Step 1: Implementar.** **Step 2: tsc+lint.** **Step 3: Commit** — `feat(subscriptions): MemberAvatars`.

---

## FASE 2 — Vista "Mi suscripción" (Estado B)

### Task 2.1: Mapper puro estado→variante del hero

**Files:**
- Create: `mobile/features/billing/membership-state.ts`
- Test: `tests/unit/membership-state.test.ts`

**Contrato:** `membershipVariant(snap: Pick<EntitlementSnapshot,'source'|'subscriptionStatus'|'autoRenew'|'expiresAt'|'graceExpiresAt'>): MembershipVariant` donde
```ts
export type MembershipVariant = {
  tone: 'active' | 'warn' | 'comped'
  statusLabel: string          // 'ACTIVA' | 'NO SE RENOVARÁ' | 'PROBLEMA DE PAGO' | 'CORTESÍA'
  heroLine: string             // 'Se renueva el 14 jun 2027' | 'Habilitado hasta …' | 'Reintentando hasta …'
  primaryAction: 'change' | 'reactivate' | 'fixPayment' | null
}
```

- [ ] **Step 1: Tests** (cubrir: subscription+autoRenew → active/"Se renueva el …"/change; subscription+!autoRenew → warn/"NO SE RENOVARÁ"/"Habilitado hasta …"/reactivate; grace → warn/"PROBLEMA DE PAGO"/"Reintentando hasta …"/fixPayment; comped → comped/"CORTESÍA"/null). Incluir el formateo de fecha (es-AR: "14 jun 2027").
- [ ] **Step 2: Ver fallar.**
- [ ] **Step 3: Implementar** `membershipVariant` + helper `formatDate(iso)` (es-AR, `day mon yyyy`). DRY: reusar `getStateTokens` para el color del tono en el componente (no acá).
- [ ] **Step 4: Ver pasar** + tsc.
- [ ] **Step 5: Commit** — `feat(subscriptions): membershipVariant mapper`.

### Task 2.2: `MembershipHero`

**Files:** Create: `mobile/components/billing/membership-hero.tsx`

**Props:** `{ planName: string; variant: MembershipVariant }`. Estructura (mockup 06/08 `.hero`): card gradiente `heroGradient` (forest), `overflow:hidden`, con:
- `<CardParticles count={5} color="#FFFBF2" accentColor="#A6EF8F" />` (z entre fondo y contenido).
- `<FernMark variant="cream" size={104} style={watermark}/>` posición absoluta esquina sup-der, `opacity:0.13`, z=1.
- Fila: eyebrow "Tu membresía" + pill de estado (color por `variant.tone` vía `getStateTokens`).
- Plan name (peso 900) + `variant.heroLine`.
- Para `tone==='warn'` usar borde/acento ámbar (`getStateTokens('caution')`).

- [ ] **Step 1: Implementar** (parent `overflow:hidden` para las luciérnagas; contenido `zIndex:3`). **Step 2: tsc+lint.** **Step 3: Render manual** (los 3 tonos). **Step 4: Commit** — `feat(subscriptions): MembershipHero con luciérnagas + watermark`.

### Task 2.3: `SubscriptionDetailRows`

**Files:** Create: `mobile/components/billing/subscription-detail-rows.tsx`

**Props:** `{ renewLabel: string; renewValue: string; initials: string[]; memberCount: number; memberCap: number; autoRenew: boolean; priceLabel: string }`. Render: card con filas (mockup 06 `.rows`): 📅 Próxima renovación · 👥 Miembros del hogar (`{memberCount} de {memberCap} personas` + `<MemberAvatars>`) · 🔄 Renovación automática (`autoRenew ? 'Activada' : 'Desactivada'`) · 🏷️ Precio. Íconos = `MaterialIcons` (event, group, autorenew, sell), no emojis.

- [ ] **Step 1: Implementar.** **Step 2: tsc+lint.** **Step 3: Commit** — `feat(subscriptions): SubscriptionDetailRows`.

### Task 2.4: `MembershipActions`

**Files:** Create: `mobile/components/billing/membership-actions.tsx`

**Props:** `{ variant: MembershipVariant; onChangePlan(): void; onRestore(): void }`. Render: `<AppButton variant="secondary" label="Cambiar de plan" onPress={onChangePlan}/>` + acción primaria condicional por `variant.primaryAction` (reactivate/fixPayment → texto correspondiente) + `<AppButton variant="ghost" label="Administrar o cancelar en App Store" onPress={openManageSubscriptions}/>` + link "Restaurar compras".

`openManageSubscriptions`: usar el API de expo-iap si existe (`deepLinkToSubscriptions`/`showManageSubscriptions`), si no `Linking.openURL('https://apps.apple.com/account/subscriptions')`. (Follow-up §14.)

- [ ] **Step 1: Implementar.** **Step 2: tsc+lint.** **Step 3: Commit** — `feat(subscriptions): MembershipActions + deep-link a manage`.

### Task 2.5: `ManageView`

**Files:** Create: `mobile/components/billing/manage-view.tsx`

**Props:** `{ snap: EntitlementSnapshot; onChangePlan(): void; onRestore(): void }`. Compone: `<BrandLockup/>` → `<MembershipHero planName variant/>` → `<SubscriptionDetailRows/>` → `<MembershipActions/>` → footer (Términos·Privacidad de `@/lib/legal-urls`). Calcula `variant = membershipVariant(snap)`, `initials` de `useHouseholdInitials()`, `planName`/`priceLabel` de `BILLING_PLANS` por `snap.plan`. Cada bloque en `<RiseView delay={i*40}>`.

- [ ] **Step 1: Implementar.** **Step 2: tsc+lint.** **Step 3: Commit** — `feat(subscriptions): ManageView`.

---

## FASE 3 — Paywall (Estado A)

### Task 3.1: `PlanTiles`

**Files:** Create: `mobile/components/billing/plan-tiles.tsx`

**Props:** `{ selected: BillingPlanId; onSelect(id): void; productPrices?: Record<string,string> }`. Render (mockup 03/08 `.tl`): 2 tiles lado a lado. Mensual = quiet (cream/`creamCard`). Anual = forest gradiente + `<CardParticles count={4}/>` + `<FernMark variant="cream" size={62} watermark/>` + badge "RECOMENDADO". Precio = `productPrices?.[productId] ?? '$'+priceUsd` (fallback). Selección animada: borde/scale con `withSpring`. Tap → `onSelect`.

- [ ] **Step 1: Implementar** (tile anual `overflow:hidden`). **Step 2: tsc+lint.** **Step 3: Commit** — `feat(subscriptions): PlanTiles con luciérnagas`.

### Task 3.2: `SavingsRibbon`

**Files:** Create: `mobile/components/billing/savings-ribbon.tsx`
**Props:** `{ savingsUsd: number; savingsPercent: number }`. Render: "Ahorrás $X al año · −Y%" (mint tint). Solo visible si `savingsUsd > 0`.
- [ ] **Step 1: Implementar.** **Step 2: tsc+lint.** **Step 3: Commit** — `feat(subscriptions): SavingsRibbon`.

### Task 3.3: `FreePeriodBanner`

**Files:** Create: `mobile/components/billing/free-period-banner.tsx`
**Props:** `{ daysLeft: number }`. Render (mockup 04 `.fp`): banner forest con `<CardParticles count={3}/>` + ícono lock-open + "Acceso completo" / `freeAccessBadgeLabel(daysLeft)` (reusar de `free-access-nudge.ts`). NUNCA "prueba"/"gratis".
- [ ] **Step 1: Implementar.** **Step 2: tsc+lint.** **Step 3: Commit** — `feat(subscriptions): FreePeriodBanner`.

### Task 3.4: `PaywallView`

**Files:** Create: `mobile/components/billing/paywall-view.tsx`
**Props:** `{ snap: EntitlementSnapshot; lockMode?: boolean; isPurchasing: boolean; onPurchase(plan: BillingPlan): void; onRestore(): void }`. Compone: (si `lockMode`) chip "🔒 ACCESO PAUSADO" + headline "Tu mes gratis terminó"; (si `snap.source==='trial'`) `<FreePeriodBanner daysLeft={snap.daysLeft}/>`; `<BrandLockup/>` → headline → `<PlanTiles/>` (estado `selected` local) → `<SavingsRibbon/>` → features (de `BILLING_PLANS[selected].highlights`) → `<AppButton label="Suscribirme por $X" loading={isPurchasing} onPress={()=>onPurchase(plan)}/>` → micro disclosure → footer (Restaurar·Términos·Privacidad). Bloques en `<RiseView>`.
- [ ] **Step 1: Implementar.** **Step 2: tsc+lint.** **Step 3: Commit** — `feat(subscriptions): PaywallView (A1 + lockMode)`.

---

## FASE 4 — Contenedor adaptativo + gate

### Task 4.1: Refactor `billing-screen.tsx` → contenedor adaptativo

**Files:** Modify: `mobile/screens/settings/billing-screen.tsx`

Reescribir: `<Screen canGoBack title="Plan del hogar">` que lee `useEntitlement(userId)` + `useBilling()`, y renderiza:
- `source==='subscription'||'family'` → `<ManageView snap onChangePlan onRestore/>`
- `source==='comped'` → `<ManageView/>` (variante comped)
- else (trial/free) → `<PaywallView snap isPurchasing onPurchase onRestore lockMode={prop}/>`
Mantener prop `lockMode` (lo pasa el gate). El `onChangePlan` abre `PlanTiles` (sheet o inline) → al confirmar, `purchasePlan`. Borrar los componentes viejos inline (CompactHero, BillingCyclePicker, etc.) que queden sin uso.
- [ ] **Step 1: Implementar.** **Step 2: tsc+lint.** **Step 3: Commit** — `refactor(subscriptions): billing-screen contenedor adaptativo`.

### Task 4.2: Restyle `subscription-gate.tsx`

**Files:** Modify: `mobile/components/billing/subscription-gate.tsx`
Mantener el `Modal` fullScreen no descartable; renderizar `<BillingScreen lockMode/>` (o `<PaywallView lockMode/>` directo). Verificar copy del gate y que NO haya back/X.
- [ ] **Step 1: Implementar.** **Step 2: tsc+lint.** **Step 3: Commit** — `feat(subscriptions): gate restyle`.

---

## FASE 5 — Sheets + wiring de compra

### Task 5.1: `PurchaseResultSheet`

**Files:** Create: `mobile/components/billing/purchase-result-sheet.tsx`
**Props:** `{ visible: boolean; variant: 'success'|'error'|'restored'|'restoreError'; planName?: string; reason?: string; onClose(): void; onRetry?(): void }`. Render con `<ModalCard visible title subtitle onClose>`:
- `success`: marca celebratoria = `<FernMark variant="cream" size={34}/>` en círculo forest con glow + `<CardParticles/>` + `<ConfettiBurst/>` one-shot. Animar el helecho con `scale 0.9→1` + opacity (spring `motionSprings.celebrate`) — NUNCA scale(0). Título "¡Bienvenido al hogar!", CTA "Empezar".
- `error`: ícono warn (`getStateTokens('caution')`), "No pudimos confirmar tu compra · no se te cobró nada", botones Reintentar (`onRetry`)/Cerrar.
- `restored`: check + "Recuperamos tu suscripción", CTA "Listo".
- `restoreError`: igual a error con `reason`.
Respetar reduced-motion (sin confetti/scale).
- [ ] **Step 1: Implementar.** **Step 2: tsc+lint.** **Step 3: Commit** — `feat(subscriptions): PurchaseResultSheet (ModalCard, success celebra)`.

### Task 5.2: Wire `use-billing` → sheet + autoRenew + gotcha modal-chain

**Files:** Modify: `mobile/features/billing/use-billing.ts`, `mobile/screens/settings/billing-screen.tsx`

- `useBilling().status` ya deriva del snapshot — agregar `autoRenew` al `BillingStatus` desde `entitlementQuery.data.autoRenew`.
- En vez de devolver solo `{ok, reason}`, exponer estado de resultado para el sheet: el screen mantiene `const [resultSheet, setResultSheet] = useState<…>()`. Al resolver `purchasePlan`/`restore`, el screen setea la variante.
- **Gotcha modal-chain (memoria `ios_modal_chain_dismiss`):** la hoja de StoreKit se cierra antes de mostrar el sheet de éxito → envolver el `setResultSheet({variant:'success'})` en `InteractionManager.runAfterInteractions(() => setResultSheet(...))`.
- "Cancelaste" (`reason===CANCELLED_REASON`) → NO abrir sheet; disparar un toast sutil (Task 5.3 si no hay toast; si hay, usarlo).
- Quitar los 4 `Alert.alert` de `billing-screen.tsx`.
- [ ] **Step 1: Implementar.** **Step 2: tsc+lint.** **Step 3: Render manual** (success/error/restore). **Step 4: Commit** — `feat(subscriptions): sheets reemplazan Alerts + InteractionManager gotcha`.

### Task 5.3: Toast "Cancelaste" (solo si no existe uno reusable)

**Files:** Investigar `grep -rl "Toast\|toast\|Snackbar" mobile/components`. Si existe, usarlo y SKIP este task. Si no:
- Create: `mobile/components/ui/toast.tsx` (mínimo: mensaje, auto-dismiss 3.5s, entrada `RiseView` desde abajo, `aria-live`).
- [ ] **Step 1: Implementar o reusar.** **Step 2: tsc+lint.** **Step 3: Commit** — `feat(ui): toast mínimo para feedback no-bloqueante`.

---

## FASE 6 — Nudges

### Task 6.1: `FreePeriodNudge` + montaje en Home

**Files:** Create: `mobile/components/billing/free-period-nudge.tsx`; Modify: la pantalla Home (`grep -l "export default function Home" mobile/screens` para ubicarla).
**Props:** `{ daysLeft: number; onSeePlans(): void }`. Render escalado (mockup 07 nudges): `daysLeft>=7` calmo (cream) · `3..6` mint tint · `<=2` forest + `<CardParticles count={2}/>` "Último día · Suscribirme". Texto vía `freeAccessBadgeLabel`. Dismissible (estado local).
Montaje: en Home, gatear con `shouldShowFreeAccessBanner(snap, lastThreshold)` (ya existe) y `source==='trial'`. `onSeePlans` → `router.push('/settings/plan')`.
- [ ] **Step 1: Implementar + montar.** **Step 2: tsc+lint.** **Step 3: Commit** — `feat(subscriptions): FreePeriodNudge en Home`.

---

## FASE 7 — Validación de integración

### Task 7.1: Bundle + checklist manual + limpieza

- [ ] **Step 1: Bundle** — `npx expo export --platform ios` debe completar sin errores (deps nativas: react-native-svg ya está; expo-iap ya está).
- [ ] **Step 2: Suite** — `npm run validate` (vitest+tsc+lint); baseline de 3 fallas infra pre-existentes es aceptable (memoria `vitest_no_react_renderer`).
- [ ] **Step 3: Checklist manual** en dev client, **light y dark**:
  - Estado trial → paywall + banner "Acceso completo"; nudges 7/3/1 en Home.
  - Estado subscription activo → ManageView (hero "Se renueva el …", miembros con avatares, auto-renew Activada).
  - auto_renew off → "Habilitado hasta …" + Reactivar.
  - grace → hero ámbar + Actualizar método de pago.
  - Compra → sheet de éxito (helecho + confetti + luciérnagas); error → sheet error; restore → sheet restored; cancelar → toast.
  - Gate (sin acceso) → bloqueo no descartable, sin back.
  - Back chevron alineado al header en paywall/manage.
  - **Reduced motion ON** → sin movimiento de posición.
- [ ] **Step 4: Docs** — actualizar `docs/sistemas/` si hay doc de billing (memoria `keep_docs_in_sync`).
- [ ] **Step 5: Commit** — `chore(subscriptions): validación de integración + docs`.

---

## Self-review (coverage vs spec)

- §3 estados A/B/comped/gate → Tasks 4.1/4.2 ✓
- §4 período libre compliant (banner, sin "gratis" en CTA) → 3.3/3.4 ✓
- §5 visual (A+C, luciérnagas, logo, light/dark) → 1.1–3.4 ✓
- §6 motion (RiseView/springs/CardParticles/celebrate/reduced-motion) → convenciones globales + 2.2/3.1/5.1 ✓
- §7 back-buttons en header → convención global + 4.1 ✓
- §8 superficies (paywall, manage, gate, sheets, nudges) → Fases 2–6 ✓
- §9 sheets/ModalCard + gotcha → 5.1/5.2 ✓
- §11 backend (auto_renew + grace) → 0.1/0.2 ✓
- §13 testing (vitest + expo export) → 7.1 + por-task ✓
