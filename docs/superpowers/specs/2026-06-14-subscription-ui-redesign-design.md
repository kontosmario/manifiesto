# Rediseño integral de la UI de Suscripciones — Design Spec

**Fecha:** 2026-06-14
**Estado:** Aprobado visualmente (mockups validados en localhost, light/dark, con logo). Listo para plan de implementación.
**Branch objetivo:** `feature/subscription-ui-redesign`

---

## 1. Goal

Rediseñar **toda** la UI de suscripciones/pagos de Manifiesto (RN/Expo) en una identidad elegante y propia, **100% coherente con el design system actual** (no desacoplar). Cubrir cada superficie y estado que un usuario necesita: paywall, plan activo, renovación/vencimiento, período libre, miembros del hogar, sheets de compra/restore, gate de bloqueo, nudges. Reemplazar los `Alert` nativos por sheets on-brand. Motion con la craft de emil-design-eng. Logo helecho integrado.

**No cambia el backend de entitlement ya verificado** (validate-purchase / webhook / cascada). Sí requiere **dos campos nuevos** en el snapshot (§11).

## 2. Scope

**Dentro:**
- Paywall (Estado A), vista "Mi suscripción" (Estado B), banner de período libre, gate de bloqueo, sheets de compra/restore, nudges (7/3/1 días). Todo light + dark. Logo helecho.

**Fuera (explícito):**
- Migrar a un **free trial real de StoreKit** (introductory offer). Se mantiene el **período libre app-managed** (§4). Decisión del owner 2026-06-14.
- Cambios al flujo de compra/validación server-side (ya verificado e2e).
- Onboarding/welcome screen (se menciona el "30 días" ahí, pero su rediseño es otro spec).

## 3. Arquitectura y routing

Una sola ruta — **Ajustes → "Plan del hogar"** (`app/(app)/settings/plan.tsx` → `BillingScreen`) — que **se adapta al estado del entitlement** (`useEntitlement(userId).source` / `.hasAccess`):

| Estado | Condición | Qué se renderiza |
|---|---|---|
| **A · No suscripto, con acceso** | `source==='trial'` (período libre activo) | **Paywall** + banner "Acceso completo · N días" arriba |
| **A · No suscripto, sin acceso** | `source==='free'` && `!hasAccess` | **Gate** (paywall en `lockMode`, no descartable) — montado en tabs layout |
| **B · Suscripto** | `source==='subscription'` o `'family'` | **"Mi suscripción"** (gestión) — nunca el paywall de venta |
| **Comped** | `source==='comped'` | "Mi suscripción" variante cortesía (sin precio/renovación) |

El **gate** sigue montándose en `app/(app)/(tabs)/_layout.tsx` (overlay `Modal` fullScreen, no descartable) cuando `!hasAccess`. La pantalla de Ajustes→Plan elige `PaywallView` vs `ManageView`.

## 4. Modelo de período libre + compliance de Apple

**Modelo:** período libre **app-managed** de 30 días (server-computed: `now − profiles.created_at` vs `profiles.trial_days`). **NO** es un free trial de StoreKit; los productos en ASC **no** tienen introductory offer.

**Reglas (compliant):**
- El paywall **nunca** dice "prueba gratis" / "30 días gratis" pegado al CTA. El botón cobra de inmediato → no hay claim de trial que disclosear (Apple 3.1.2 exige que "free trial" en el paywall corresponda a un intro offer real).
- El período libre se muestra como **estado de cuenta**: banner "**Acceso completo · N días restantes**" (nunca "prueba"/"trial"), + nudges 7/3/1, + welcome de onboarding (otro spec).
- CTA siempre limpio: "Suscribirme por $X · se renueva automáticamente · cancelás cuando quieras".
- **Implicancia App Review (positiva):** los reviewers prueban IAP en sandbox sobre el binario de prod; la compra inicial la acredita `validate-purchase` (sin guard de environment), así que **la review pasa**.

## 5. Lenguaje visual

Dirección aprobada: **A+C** — editorial cálido (aire, jerarquía, precio protagonista) + estructura bento (tiles comparables, ribbon de ahorro, features con checks). Todo con **tokens reales** (`useThemeTokens()`), light + dark automático.

- **Color:** semantic tokens (`primary` #297811 / dark mint #A6EF8F, `text`, `textMuted`, canvas #F4F2ED / dark #12211A, `creamCard` #FFFBF2, danger, warning). Heros forest = gradiente `heroGradient` (#244235→#1F590D→#297811). Nunca hex hardcodeado en componentes.
- **Tipografía:** presets de `theme.typography` (eyebrow uppercase, hero/display 900, body). Precio = peso 900, letter-spacing negativo, tabular nums.
- **Radii/spacing/elevation:** `theme.radii` (tiles 16, cards 20–28), `theme.spacing`, `buildElevationStyle`.
- **Luciérnagas (`CardParticles`):** sobre cada superficie forest (tile anual, hero de membresía, gate, sheet de éxito, nudge de 1 día). count 4–6, color crema `#FFFBF2` + accent mint `#A6EF8F`. Z entre fondo y contenido; `pointerEvents="none"`; parent `overflow:hidden`.
- **Logo helecho (`react-native-svg`):** 3 usos — (a) **lockup** en headers (variante forest sobre crema, crema sobre forest/oscuro), (b) **watermark** sutil (~13% opacidad, bleed de esquina) tras heros forest, (c) **marca celebratoria** en el sheet de compra exitosa (helecho crema en círculo forest con glow). Variantes de color: silueta `#FDFEF9`/hojas `#A9D57F` (original, forest), `#1F590D`/`#297811` (sobre crema), `#A6EF8F`/`#77E755` (acento). Componente `<FernMark variant="cream|forest|mint" />` que parametriza fills.

## 6. Motion & transiciones (emil-design-eng → motion tokens)

Principio rector (emil framework): **¿debe animar? → ¿propósito? → easing → duración**, y respetar `useReducedMotion`. Las superficies de suscripción son **ocasionales** (no se ven 100×/día) → animación estándar; la **compra exitosa es rara/primera-vez** → permite *delight*. Todo anima solo `transform`/`opacity`.

| Superficie / elemento | Decisión emil | Implementación (tokens reales) |
|---|---|---|
| Entrada de pantalla (paywall, mi-suscripción) | Entrante → ease-out fuerte, <320ms, stagger 30–80ms | `useScreenEntrance` + `<RiseView>` (easing `enterSmooth` = bezier 0.16,1,0.3,1 ≈ ease-out-expo), stagger `motionStagger.listItem` (40ms) por bloque |
| Tiles de plan / filas / ribbon | Stagger en cascada | `<RiseView delay={i*40}>` por item |
| Sheets (compra/restore) — enter | Modal: spring, entra desde abajo (spatial consistency), centrado en su eje | `ModalCard` (ya existe): spring `motionSprings.sheet` (damping22/stiffness200), translateY desde 100% |
| Sheets — exit / drag-dismiss | Exit más rápido que enter; drag **interrumpible** con momentum | `ModalCard` Gesture (Reanimated, UI-thread); dismiss por distancia 120px **o** velocidad (emil: flick > umbral); snap-back `motionSprings.sheetDismiss` (damping32/stiffness240); exit `motionDurations.exitModal` 220ms (<enter 320) |
| **Compra exitosa (celebración)** | Rara → delight. **Nunca `scale(0)`** | Helecho: `scale 0.9→1` + opacity, spring `motionSprings.celebrate` (damping14/stiffness260/mass0.8, bounce sutil); + `<CardParticles>` luciérnagas; + `<ConfettiBurst>` (ya existe) one-shot |
| CTA / botones | Feedback de press, snappy 100–160ms, scale 0.95–0.98 | `<AppButton>` ya hace `scale 0.97` press (spring `motionSprings.press`). Sin cambios |
| Precio | Perceived performance: roll premium | `<BillingPriceDigits>` (ya existe), spring `motionSprings.value` |
| Selección de plan (tile) | Cambio de estado animado, no snap | Border/elevation/scale con `withSpring(value)` al togglear; no animar layout |
| Luciérnagas | Decorativo ambient, continuo, lento | `CardParticles` (wave 10s lineal); respeta reduced-motion (glow estático) |
| Nudges (Home) | Ocasional, entra/sale mismo eje | `<RiseView>` enter; salida 70% de enter |
| Navegación back | Stack estándar | `motionDurations.enterStack` 280 / `exitStack` 200 (navigator) |

**Reduced motion (emil + `useReducedMotion`):** se conservan opacity/color; se quitan movimientos de posición. `CardParticles` → glow tenue estático; `RiseView` → opacity-only sin translate; celebración → fade sin scale/confetti. Ya soportado por los componentes base.

**Asimetría (emil):** deliberado donde el usuario decide (entrada de pantalla 320ms), snappy donde el sistema responde (press 120ms, dismiss 200ms).

## 7. Navegación y convención de back-button

**Regla:** toda pantalla de suscripción usa `<Screen canGoBack title="…">`; el back es un **ícono chevron** en el header (no un botón literal "Volver"), **alineado con el título de la sección** (lo maneja `ScreenHeader`). Coherente con el patrón de la vista "Recuperar acceso".

- **Paywall / Mi suscripción** (vía Ajustes→Plan): `<Screen canGoBack title="Plan del hogar">` → chevron `IconButton` (`chevron-left` / `arrow-back-ios`) a la izquierda del header, centrado verticalmente con el título.
- **Gate (bloqueo):** **sin back** (no descartable). El chip "🔒 ACCESO PAUSADO" explica por qué; no hay header de navegación.
- **Sheets (`ModalCard`):** sin back; drag-to-dismiss + CTA ("Empezar"/"Listo"/"Cerrar"). El grabber comunica el dismiss.

## 8. Superficies (componentes, layout, datos, estados)

### 8.1 Paywall — `PaywallView` (Estado A)
- **Layout:** `BrandLockup` (helecho + "Manifiesto · Hogar") → headline editorial → `PlanTiles` (mensual quiet / **anual forest + luciérnagas + watermark + RECOMENDADO**) → `SavingsRibbon` → features con checks → `AppButton` CTA "Suscribirme por $X" → micro disclosure → footer (Restaurar · Términos · Privacidad).
- **Datos:** `BILLING_PLANS` (precio localizado vía `getProducts()` con fallback a `priceUsd`), `selectedPlan` (default anual/recomendado).
- **Variante A1 (período libre):** `FreePeriodBanner` ("Acceso completo · N días") arriba del lockup.
- **Compra:** `purchasePlan(selectedPlan)` → al resolver, `PurchaseResultSheet`.

### 8.2 Mi suscripción — `ManageView` (Estado B)
- **Layout:** `BrandLockup` → `MembershipHero` (forest + luciérnagas + watermark helecho · pill estado · plan · "Se renueva el …") → `SubscriptionDetailRows` → `MembershipActions` → footer.
- **`SubscriptionDetailRows`:** Próxima renovación (fecha) · **Miembros del hogar (N de cap + avatares con iniciales)** · Renovación automática (Activada/Desactivada) · Precio.
- **`MembershipActions`:** "Cambiar de plan" (→ `PlanTiles` en sheet/inline) · "Administrar o cancelar en App Store" (deep-link `Linking.openURL('https://apps.apple.com/account/subscriptions')` o `showManageSubscriptions` de expo-iap) · "Restaurar compras".
- **Estados (mismo componente):**
  - `auto_renew=false` (canceló, sigue activa): hero → "**Habilitado hasta** 14 jun 2027" + pill ámbar "NO SE RENOVARÁ" + acción "Reactivar".
  - `subscription_status='grace'` (falló cobro): hero **ámbar** "Problema con el pago · reintentando hasta {grace_expires_at}" + "Actualizar método de pago en App Store".
  - `expired`: cae a Estado A (paywall).
  - `comped`: hero "Acceso de cortesía" sin precio/renovación.

### 8.3 Gate — `SubscriptionGate` (restyle)
- `Modal` fullScreen no descartable (ya montado). Renderiza `PaywallView` con `lockMode`: chip "🔒 ACCESO PAUSADO" + headline "Tu mes gratis terminó" + tiles + CTA. Sin back, sin X.

### 8.4 Sheets de compra/restore — `PurchaseResultSheet` (`ModalCard`)
Variantes: `success` (celebración: helecho + luciérnagas + confetti, "¡Bienvenido al hogar!") · `error` ("No pudimos confirmar tu compra · no se te cobró nada", Reintentar/Cerrar) · `restored` ("Recuperamos tu suscripción", Listo) · `restoreError`. **"Cancelaste" NO es sheet** → toast sutil (no es error).

### 8.5 Nudges — `FreePeriodNudge` (Home)
Banner inline; escala suave: 7 días calmo (cream) → 3 días (mint tint) → 1 día (forest + luciérnagas, "Último día · Suscribirme"). Dispara con `shouldShowFreeAccessBanner` (umbrales [7,3,1], ya existe). Dismissible.

## 9. Integración de sheets/modales (detalle)

- **Reemplazar los 4 `Alert.alert`** (compra ok/err, restore ok/err) por `PurchaseResultSheet` (variante).
- **Gotcha modal-chain iOS** (memoria `feedback_ios_modal_chain_dismiss`): la hoja de compra de StoreKit se cierra y **recién entonces** presentamos nuestro sheet. Presentar un `Modal` mientras otro se descarta se pierde silenciosamente → envolver el `present()` en `InteractionManager.runAfterInteractions(() => setSheet(...))`. **Obligatorio** para el sheet de éxito post-compra.
- **`ModalCard`:** usar `inline` si el host ya es modal (evita latencia de UIViewController anidado); footer pinneado para el CTA; drag-to-dismiss ya implementado.
- **Toast "Cancelaste":** componente liviano (o el toast existente si lo hay) — `aria-live`/no roba foco; auto-dismiss 3–4s.

## 10. Estructura de archivos

**Nuevos** (`mobile/components/billing/`):
- `fern-mark.tsx` — helecho `react-native-svg`, prop `variant` (cream/forest/mint).
- `brand-lockup.tsx` — `FernMark` + wordmark "Manifiesto · Hogar".
- `plan-tiles.tsx` — tiles mensual/anual (anual = forest + `CardParticles` + watermark + badge); selección animada.
- `savings-ribbon.tsx` — "Ahorrás $X · −33%" (reusa lógica de `BillingSavingsRibbon`).
- `free-period-banner.tsx` — Estado A1 ("Acceso completo · N días").
- `membership-hero.tsx` — hero forest + `CardParticles` + watermark + pill estado + plan + renovación/habilitado-hasta.
- `subscription-detail-rows.tsx` — filas (renovación, miembros+avatares, auto-renew, precio).
- `membership-actions.tsx` — cambiar plan / administrar / restaurar.
- `purchase-result-sheet.tsx` — `ModalCard` con variantes success/error/restored/restoreError (success = `ConfettiBurst` + `CardParticles` + `FernMark`).
- `free-period-nudge.tsx` — nudge Home escalado.
- `member-avatars.tsx` — círculos con iniciales (reusa datos de household).

**Modificados:**
- `mobile/screens/settings/billing-screen.tsx` → contenedor adaptativo: elige `PaywallView` (extraído) vs `ManageView` según entitlement; `lockMode` para el gate. Probablemente se parte en `paywall-view.tsx` + `manage-view.tsx`.
- `mobile/components/billing/subscription-gate.tsx` → restyle, usa `PaywallView lockMode`.
- `mobile/features/billing/use-billing.ts` → expone `autoRenew`; dispara `PurchaseResultSheet` en vez de `Alert`; `InteractionManager` para el sheet post-compra.
- `mobile/features/billing/use-entitlement.ts` + `entitlement-snapshot.ts` → mapear `autoRenew` y `graceExpiresAt` del snapshot.
- `billing-plans.ts` → copy de highlights/members (menor).
- Home → montar `<FreePeriodNudge>`.
- Reusar tal cual: `CardParticles`, `ModalCard`, `AppCard`, `AppButton`, `IconButton`, `Screen`, `RiseView`, `BillingPriceDigits`, `ConfettiBurst`, `getStateTokens`.

## 11. Datos & cambios de backend

El snapshot RPC `family_entitlement_snapshot` hoy devuelve: `source, plan, hasAccess, daysLeft, trialDaysLeft, expiresAt, subscriptionStatus, memberCap, memberCount, pendingProductId`. **Faltan dos campos** que la UI necesita:
1. **`auto_renew`** (boolean) — para la fila "Renovación automática" y la variante "Habilitado hasta" / "Reactivar".
2. **`grace_expires_at`** (timestamptz) — para el estado de gracia ("reintentando hasta …").

→ **Migración chica:** extender `family_entitlement_snapshot` para incluir `auto_renew` y `grace_expires_at` desde `family_entitlements` (ambas columnas ya existen en la tabla). Sin cambios de escritura.

**Avatares de miembros:** las iniciales salen de los miembros del hogar (`family_members` + perfiles). Reusar el hook/datos de household existentes (no recargar desde el snapshot); el snapshot solo da `memberCount`/`memberCap`.

## 12. Accesibilidad

- `accessibilityLabel` en CTAs e íconos; el helecho decorativo `accessibilityElementsHidden`.
- Contraste AA verificado en ambos modos (tokens ya cumplen).
- `useReducedMotion` respetado en todas las animaciones (§6).
- Touch targets ≥44pt (`buildMinimumTouchTargetHitSlop`).
- Sheets no roban foco para lectores; el gate anuncia el bloqueo.

## 13. Testing

- **vitest (env node, módulos puros):** mapeo estado→variante del hero, `freeAccessBadgeLabel`/`shouldShowFreeAccessBanner` (ya), normalización del snapshot con `autoRenew`/`graceExpiresAt`, lógica de selección de plan, formato de fechas de renovación.
- **Bundle:** `npx expo export --platform ios` antes de declarar verificado (memoria `feedback_validate_is_not_bundle`).
- **Manual (dev client, light+dark):** los 6 estados (trial / active / auto-renew-off / grace / comped / expired→gate), compra→sheet de éxito, restore, nudges 7/3/1, navegación back alineada.
- **Reduced motion ON:** verificar que no hay movimiento de posición.

## 14. Open questions / follow-ups

- **"Cambiar de plan" (upgrade/downgrade):** la UI lleva a `PlanTiles`; la compra del otro producto usa `requestPurchase` (StoreKit maneja proration dentro del grupo). Confirmar UX del cambio (¿inmediato vs fin de ciclo?) en el plan.
- **Toast component:** confirmar si existe uno reusable; si no, crear uno mínimo para "Cancelaste".
- **`showManageSubscriptions`:** preferir el API nativo de expo-iap si está disponible vs el deep-link URL.
