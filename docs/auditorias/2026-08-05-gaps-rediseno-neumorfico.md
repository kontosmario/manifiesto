# Auditoría de gaps del rediseño neumórfico — 2026-08-05

Auditoría de cobertura del rediseño neumórfico sobre **todas las rutas vivas de `app/`**
(excluyendo `settings/dev/*`), bajando por el árbol de imports completo de cada ruta y
contrastando cada superficie contra la fundación (`neoTokens` / `neoInk` / `neoMaterial`,
`nunitoFamily`, `NeoSurface`/`NeoButton`/`NeoStateBlock`, `ModalCard skin="neo"`) y los
handoffs de `design/` (`rediseno-2026-07`, `home-final-2026-07`, `fijos-2026-07`,
`gastos-2026-08-v2`). Dieciséis pasadas por área produjeron 114 hallazgos crudos; este
documento los consolida en **52 gaps** (los duplicados entre áreas se fusionaron — que dos
o tres auditores independientes reportaran lo mismo es corroboración, no gaps separados),
los ordena por categoría y severidad, y propone el orden de ejecución.

> ## ESTADO: EJECUTADO — 2026-08-05
>
> El owner ordenó integrar el plan completo de punta a punta y resolvió las decisiones
> abiertas (ver "Decisiones del owner" más abajo). **Las 5 fases se ejecutaron el mismo
> día**: los 52 gaps están cerrados en el working tree de `feat/ui-redesign`.
>
> Lo que quedó, con su verificación: `tsc --noEmit` limpio · `eslint` 0 errores ·
> **1526/1526 tests** · guards de i18n (keys, hardcoded, quality), copy y spacing en
> verde · `expo export --platform ios` bundlea. El guard `motion-tokens` sigue en rojo
> pero **mejoró**: 26 violaciones preexistentes → 19 (ninguna nueva; el resto vive en
> archivos fuera del alcance de estos gaps).
>
> Cambios: 329 archivos (6.8k inserciones, 7.8k borrados), 18 archivos nuevos y 26
> retirados.
>
> Después de la integración corrió una **revisión adversarial** en 4 zonas de riesgo
> (comportamiento, primitivas compartidas, pantallas reconstruidas, fallbacks y tokens
> globales). Encontró 13 hallazgos; 4 de ellos —los de "el pozo desaparece en Android
> API<29"— resultaron **ramas inalcanzables**: `app.config.ts` fija
> `minSdkVersion: 29`, así que `SUPPORTS_INSET_SHADOW` es siempre `true` en cualquier
> device donde la app instala. Los reales quedaron arreglados:
>
> - **`useUpdateExpense` no revertía los caches paginados** en el rollback (solo las
>   listas clásicas). Con el historial retirado y la edición mudada al feed, un guardado
>   fallido dejaba la fila y el total del día mostrando un monto que nunca se guardó.
>   Ahora snapshotea y restaura como sus mutaciones hermanas.
> - **El swatch del hero de Gastos se sembraba con el nombre localizado**: en inglés la
>   misma categoría salía de dos colores distintos según la superficie. `CategoryWeightRow`
>   lleva ahora `rawName` y el pastel se hashea siempre sobre el nombre crudo.
> - **`neoInk()` devolvía un objeto nuevo por llamada**, lo que rearmaba el mapper de
>   Reanimated en cada render (deps comparadas por identidad). Pasó a singletons por modo,
>   igual que `neoTokens`.
> - **El autofix de la regla ESLint nueva** resolvía `nunitoFamily` con un regex sobre el
>   texto crudo: una mención en un comentario habilitaba un fix que dejaba el archivo sin
>   compilar. Ahora resuelve sobre los `ImportDeclaration` (verificado ejecutándolo).
> - `CountUpText` sin `flourish` dejaba un `useFrameCallback` registrado para siempre;
>   ahora vive solo mientras dura el conteo. Doble háptico en el long-press del feed,
>   `starColors()` alocando por render, y el slide 4 del intro mostrando helechos donde la
>   celebración real ya muestra mini-Brots (ahora reusa el `DayBrot` real).
>
> **Sin verificación en device** — en Apple Silicon el proyecto solo corre en device por
> ML Kit, así que falta la pasada visual en claro/oscuro. Ese es el único trabajo
> pendiente real.
>
> Cada `### Gxx` de abajo describe el estado **previo** a la ejecución: se conserva como
> registro de qué se encontró y por qué se hizo lo que se hizo.

## Resumen ejecutivo

| Categoría | Gaps | Alta | Media | Baja |
|---|---|---|---|---|
| A — Pantallas completas legacy | 7 | 5 | 1 | 1 |
| B — Flujos parciales (carcasa neo, tripa V1) | 14 | 4 | 6 | 4 |
| C — Primitivas y componentes compartidos | 19 | 6 | 10 | 3 |
| D — Shell y navegación | 1 | 1 | 0 | 0 |
| E — Vocabulario Brot y partículas | 4 | 0 | 2 | 2 |
| F — Transversales | 7 | 1 | 3 | 3 |
| **Total** | **52** | **17** | **22** | **13** |

Hallazgo que corrige la premisa del encargo: **el chat del Asistente YA está neo**
(`mobile/screens/home/asistente-screen.tsx` migró completo en la tanda de overlays del
2026-08-04, con decisiones de contraste documentadas inline). El gap pantalla-completa
real del área es **Coach Mode** (`/coach/[signalId]`), que quedó 100% V1 y además es
siempre-oscuro: ignora el tema claro Salvia.

Las 5 vistas de referencia (Home, Gastos, Fijos, Control, Notificaciones) están neo de
punta a punta con **restos puntuales de componentes compartidos** (SwipeRow revelado,
ErrorState/EmptyState, skeletons, banners, avatares) — el patrón dominante no es
"pantalla sin migrar" sino **"carcasa neo con órganos V1"**: sheets que ya pasan
`skin="neo"` pero adentro montan AppButton/TextField/StepAvatar de la piel vieja. Por eso
la Categoría C es el multiplicador: cada primitiva convertida elimina restos en varias
vistas a la vez.

## Mapa maestro ruta → estado

Rutas vivas de `app/` (excluyendo `settings/dev/*`), verificadas contra el árbol real:

| Ruta | Pantalla montada | Estado | Gap |
|---|---|---|---|
| `/` (index) | BootScreen (+ NeoPinLockPanel) | neo | — |
| `/(auth)/welcome` | NeoWelcomeScreen | neo | G32 (banner eliminación) |
| `/(auth)/login` | NeoLoginScreen | neo | G32, G37 |
| `/(auth)/signup` | NeoSignupScreen | neo | G37 |
| `/(auth)/forgot-password` | NeoForgotPasswordScreen | neo | G37 |
| `/(auth)/intro` | IntroScreen (5 slides) | mixto | G08 |
| `/(auth)/join` | JoinScreen | legacy | G04 |
| `/auth/callback` | AuthCallbackScreen | legacy | G05, G25 |
| `/auth/reset-password` | ResetPasswordScreen | legacy | G05, G25 |
| `/(app)/(tabs)/home` | NeoHomeScreen | neo (restos) | G16, G24, G28, G29, G32, G33, G34, G45 |
| `/(app)/(tabs)/expenses` | NeoGastosScreen | neo (restos) | G19, G24, G28 |
| `/(app)/(tabs)/fixed-expenses` | NeoFijosScreen | neo (restos) | G15, G20, G24, G28, G50 |
| `/(app)/(tabs)/insights` | NeoControlScreen | neo (restos) | G13, G50 |
| `/(app)/(tabs)/add` | FAB + overlay de acciones | neo | G50 (scan-bar) |
| `/(app)/add-expense` | AddGastoV2Screen (wizard) | neo | G24, G49 |
| `/(app)/add-income` | AddIncomeV2Screen (wizard) | neo (nominal — ver Apéndice 3) | — |
| `/(app)/add-fixed-expense` | AddFijoV2Screen (wizard) | neo | G20 (hint cuotas) |
| `/(app)/asistente` | AsistenteScreen | neo | G42, G49 |
| `/(app)/coach/[signalId]` | CoachModeScreen | **legacy** | G01 |
| `/(app)/notifications` | NeoNotificationsScreen | neo (restos) | G18, G34, G48 |
| `/(app)/garden` | GardenScreen | **legacy** | G02 |
| `/(app)/expenses-history` | ExpensesHistoryScreen | **legacy** (huérfana) | G06 |
| `/(app)/expense-categories` | ExpenseCategoriesScreen | neo | — |
| `/(app)/expense-filters` | ExpenseFiltersScreen | neo (solo alcanzable vía historial huérfano) | G06 |
| `/(app)/onboarding` | NeoOnboardingScreen | neo | — |
| `/(app)/onboarding-success` | NeoOnboardingSuccessScreen | neo | — |
| `/(app)/pin-setup` | NeoPinSetupScreen | neo | — |
| `/(app)/biometric-setup` | NeoBiometricSetupScreen | neo | G25 (loading) |
| `/(app)/trial-welcome` | BillingScreen welcomeMode | neo (fondo V1) | G41 |
| `/(app)/household-setup` | HouseholdSetupScreen | mixto | G11 |
| `/(app)/savings-goal` | SavingsGoalScreen | mixto | G10, G35 |
| `/(app)/settings` | SettingsScreen (root) | neo (restos) | G22, G30, G32, G46 |
| `/settings/about` | AboutScreen | neo | G36, G52 |
| `/settings/achievements` | AchievementsGalleryScreen | neo (restos) | G14, G27 |
| `/settings/admin` | AdminScreen | neo | G47, G52 |
| `/settings/asistente` | AsistentePreferencesScreen | neo | G47 |
| `/settings/delete-account` | DeleteAccountScreen | neo | G22, G35 |
| `/settings/editions` | EditionsScreen | neo (restos) | G44, G51 |
| `/settings/family-admin` | FamilyAdminScreen | neo | G47 |
| `/settings/notifications` | NotificationsPreferencesScreen | neo | G38 |
| `/settings/plan` | BillingScreen (A paywall / B gestión) | mixto (A neo / B legacy) | G03, G36 |
| `/settings/dev-health` | DevHealthScreen (solo `__DEV__`) | legacy | G07 |

Superficies globales sin ruta propia (montadas por el shell):

| Superficie | Estado | Gap |
|---|---|---|
| Tab bar (NeoTabBarLive) + FAB neo | neo | — |
| Layouts / canvas del shell (root, stacks, tabs, (auth)) | **legacy** (canvas V1) | G41 |
| BlockingScreenView (guards, gates, callback/reset) | **legacy** | G25 |
| ShareImportHost + wizard de import | carcasa neo, tripa V1 | G09 |
| Cycle Wrapped (bridges + escenas) | carcasa neo, escenas V1 | G12 |
| Week-close-celebration / Floración | neo | G43 (Brot cheer) |
| GlobalAdvisorActionHost (5 sheets) | neo | G50 (restos) |
| NoSpendConfirmSheet + toast-host + neoConfirm | neo | G50 (warnInk) |
| SubscriptionGate (paywall duro) | neo (backdrop V1) | G41 |
| CaptchaModal (hCaptcha) | vendor default | G37 |
| RootErrorBoundary | legacy | G40 |

---

## Categoría A — Pantallas completas legacy

### G01 — Coach Mode entero en V1 [alta · L]
**Superficie**: `/coach/[signalId]` — destino del action kind `open-coach-mode`
(super-perfect-storm, super-hidden-drain; `control-signals.ts:483`).
**Archivos**: `mobile/screens/home/coach-mode-screen.tsx`,
`mobile/components/control-v2/asesor-bubble-meta.ts`, `app/(app)/coach/[signalId].tsx`.
**Estado actual**: Carcasa forest siempre-oscura (`SHELL_GRADIENT` con
expo-linear-gradient), paleta Mint Saturado vía `TYPE_TONES`, chips con borde 1px, CTA
`#C7EE9C`, sombras viejas, sin Nunito y sin Brot. Ignora por completo el tema claro
Salvia. Está viva de verdad: el dispatcher rutea acá las super-señales.
**Evidencia**: `coach-mode-screen.tsx` (SHELL_GRADIENT + hexes inline);
`asesor-bubble-meta.ts` (TYPE_TONES, último consumidor); `control-signals.ts:483`.
**Referencia de diseño**: sin referencia — diseñar primero; gate de aprobación del owner.
Vocabulario más cercano: `design/rediseno-2026-07/handoff-README.md` L127 (Brot pose
coach 104px + burbuja) y la pantalla Asistente ya migrada como precedente.
**Plan**:
1. Diseñar primero: mockup HTML en `design/` (claro+oscuro) — hero sobre `neo.sheet`,
   Brot pose coach + burbuja como narrador de la señal, jerarquía de super-señal.
2. Portar la carcasa: matar SHELL_GRADIENT/LinearGradient → `neo.sheet` + partículas
   (extraer TwinklingStars de asistente-screen a componente compartido), grab handle
   `neo.sheetHandle`.
3. Hero card → `cssGradient(raisedGradientCss)` + `neo.shadows.raisedXl`, tile de ícono
   con pastel de categoría (extraer TYPE_PASTEL + positiveInk del Asistente a un módulo
   compartido `asesor-neo-meta`), chips por relieve (insetSm/raisedSm) sin borde 1px,
   Nunito 800/900 con letter-spacing negativo.
4. Brot coach + burbuja arriba del hero; Brot worried/think en el empty state.
5. Filas de constituyentes → tiles neo (surface + raisedSm + fallback
   SUPPORTS_INSET_SHADOW); CTA → receta radial ctaGradient + `neo.shadows.cta` idéntica
   al replyCta del Asistente.
6. Borrar TYPE_TONES de asesor-bubble-meta.ts y verificar contraste AA en ambos temas.
**Depende de**: gate del owner (mockup previo); decisión: ¿Coach hereda tema del sistema
o queda dark fijo? La extracción de TwinklingStars/TYPE_PASTEL toca asistente-screen.tsx
(refactor sin cambio visual).

### G02 — Mi jardín entera en la V1 pre-neo [alta · L]
**Superficie**: `/(app)/garden` (entrada viva: header de Gastos neo).
**Archivos**: `mobile/screens/garden/garden-screen.tsx`,
`mobile/components/garden/garden-hero.tsx`, `mobile/components/garden/garden-grid.tsx`,
`mobile/components/garden/week-close-banner.tsx`.
**Estado actual**: Hero con expo-linear-gradient sobre `theme.colors.heroGradient`, grid
de días con colores `gardenSoil*` del theme viejo, banner con creamCard/surfaceMuted,
fondo DARK_TAB_CANVAS/AmbientBlobs y cero Brot. Paradoja: los overlays de la MISMA
superficie (floracion-view, week-close-celebration) ya son 100% neo.
**Evidencia**: `garden-screen.tsx` + los 3 componentes (nada usa
neoMaterial/neoInk/cssGradient); `sprout.tsx:149` (stickers PNG = pedido explícito previo
del owner).
**Referencia de diseño**: `design/rediseno-2026-07/screens/3g.html` (claro + oscuro,
incluye el cierre de semana) + `handoff-README.md` líneas 81, 92 y 128.
**Plan**:
1. Kit neo del jardín transcribiendo 3g.html: hero `NeoSurface variant='hero'` (radio 32,
   cssGradient heroGradientCss) + CardParticles con `neoParticlePresets.hero` clipeadas
   al radio + tira JARDÍN/RÉCORD/SEMILLAS con CountUpText.
2. Chrome: fondo `neo.bg`, header con BrotMascot pose='wave' size 52 reemplazando el
   avatar FernMark.
3. Banner 'Semana perfecta': card raisedLg radio 24 con BrotMascot cheer 52 + CTA radial
   verde con sombra cta ('Ver cierre ›') que abre la week-close-celebration ya neo.
4. Grid: card raised radio 28; celdas como pozos hundidos radio 14 (`neo.well` +
   insetSm), HOY con borde dashed 2.5 durazno; **consultar al owner** si los stickers PNG
   actuales se reemplazan por mini-Brots (idle/wilted/seed 32px, `animated=false`) como
   pide 3g — es la única decisión abierta.
5. Purgar theme.colors/DARK_TAB_CANVAS/expo-linear-gradient del cluster y pasar la
   tipografía a nunitoFamily (números 900 con tracking negativo, labels 11/800).
6. QA claro/oscuro en device (gate boxShadow Android) + gate de aprobación del owner
   (réplica en Settings→Dev).
**Depende de**: decisión del owner stickers vs mini-Brots (ver Decisiones); poses de Brot
y week-close-celebration neo ya existen.

### G03 — Plan del hogar Estado B (ManageView) + sheets de compra enteros en V1 [alta · XL]
**Superficie**: `/settings/plan` cuando el entitlement resuelve suscripto/cubierto/
cortesía/MVP — lo que ve TODO suscriptor activo — más los sheets de cambio de plan y de
resultado de compra/restore (también disparados desde el paywall neo).
**Archivos**: `mobile/components/billing/manage-view.tsx`, `membership-hero.tsx`,
`subscription-detail-rows.tsx`, `household-members-list.tsx`, `membership-actions.tsx`,
`member-avatars.tsx`, `brand-lockup.tsx`, `change-plan-sheet.tsx`, `plan-tiles.tsx`,
`purchase-result-sheet.tsx`.
**Estado actual**: El contenedor (billing-screen) y el Estado A (NeoPaywallView, réplica
4m/4mo) son neo, pero el 100% del árbol de gestión es piel vieja: cards
creamCard/surfaceMuted con borde, pills de getStateTokens, AppButton legacy. Los 3 sheets
montan ModalCard SIN `skin="neo"`; plan-tiles usa expo-linear-gradient con
heroGradient/heroAccent viejos y purchase-result-sheet hace el glow celebratorio con
shadowColor. Deferral documentado: `neo-paywall-view.tsx:36` ('sheet de resultado
incluido — no está rediseñado y se mantiene').
**Evidencia**: `manage-view.tsx` y hermanos (cero neoMaterial/neoInk/boxShadow);
`subscription-detail-rows.tsx:12` (el único mockup de Estado B es PRE-neo, vive fuera de
`design/`); `neo-paywall-view.tsx:36`.
**Referencia de diseño**: sin referencia para ManageView — diseñar primero; gate de
aprobación del owner. Para los tiles de plan sí: `design/rediseno-2026-07/screens/4m.html`
+ `4mo.html`, ya implementados en `mobile/components/redesign/auth/auth-plan-hogar.tsx`
(PLAN_SPEC).
**Plan**:
1. Diseñar Estado B con el vocabulario existente y validarlo como réplica en Settings→Dev:
   hero de membresía como card raisedLg radio 24–28 (o NeoSurface hero 32 con
   CardParticles), filas de detalle como grupo raisedLg con divisores `neo.sheetDivider`
   (receta de settings-grouped-list), pozo insetSm para el monto, pill de estado con
   accent de status.
2. household-members-list → NeoSurface raisedLg con sub-tiles raisedSm;
   member-avatars a neo.well/selectedTint; brand-lockup parametrizado por props.
3. membership-actions → NeoButton + links con neoInk.
4. Sheets: pasar `skin="neo"` a los 3; extraer los tiles de plan de AuthPlanHogar
   (PLAN_SPEC + ringSelected) a componente compartido paywall↔sheet — nunca
   expo-linear-gradient; en purchase-result-sheet, glow → boxShadow del vocabulario,
   CelebrationMark con Brot celebratorio + BrotParticles (ya usados en
   auth-plan-hogar.tsx:22); conservar ConfettiBurst/CardParticles.
5. COMPLIANCE intacto: disclosure 3.1.2, 'acceso completo' (jamás 'gratis/prueba'), links
   Términos/Privacidad/Restaurar, deep-link `apps.apple.com/account/subscriptions`,
   salidas del lockMode (5.1.1(v)) — tocar SOLO piel; conservar reduced-motion, el spring
   celebrate y el gotcha presentAfterNativeUI.
6. QA sandbox completo: compra, upgrade inmediato, downgrade diferido, cancelación de
   downgrade, restore; verificar banner optimista y modal-chain.
**Depende de**: gate del owner (réplica primero); G22 (qué botón neo usan los sheets).

### G04 — JoinScreen (crear hogar / unirse con código) entera en el sistema viejo [alta · M]
**Superficie**: `/(auth)/join` — destino del bridge auth-flow para sesión sin familia
(`resolve-destination.ts:17`, `guards.tsx:62`); desde acá nace el household-setup. El
usuario aterriza desde el soar-away del overlay neo en una pantalla del diseño anterior.
**Archivos**: `app/(auth)/join.tsx`, `mobile/screens/auth/join-screen.tsx`.
**Estado actual**: No existe neo-join-screen. La ruta monta la legacy completa: Screen +
BrandedPanel (LinearGradient + buildElevationStyle) + SegmentedControl + AppButton +
TextField viejos + AmbientBackdrop, todo con theme.colors y radii de la paleta vieja. Es
la única ruta de `/(auth)` sin swap neo — sus hermanas ya montan neo-login/signup/
welcome/forgot.
**Evidencia**: `join-screen.tsx` (kit ui viejo completo); `resolve-destination.ts:17` y
`guards.tsx:62` (rutas de llegada).
**Referencia de diseño**: parcial — el ramal crear/unirse YA existe en neo:
`design/rediseno-2026-07/screens/5c.html` + `5co.html` y la réplica viva
`mobile/components/redesign/onboarding/onb-5c-hogar.tsx` (máquina mode→root/join→
created/joined con failure state Brot worried). Como pantalla standalone no hay maqueta —
adaptar ese vocabulario y pasar por el gate.
**Plan**:
1. Crear `mobile/screens/auth/neo/neo-join-screen.tsx` sobre AuthScreenShell (auth-kit) +
   AUTH_SPEC, patrón exacto de neo-forgot-password.
2. Reusar Onb5cHogar (o extraer sus paneles a componente compartido) para los estados
   crear/unirse + input de código como pozo hundido (patrón auth-4b).
3. Cablear `useJoinController` intacto (misma semántica createFamily/joinWithCode;
   errores como failure state Brot worried en el panel activo).
4. Conservar RequireGuest allowFamilylessSession y useSignalDestinationReady en la ruta.
5. Swap en `app/(auth)/join.tsx`; join-screen.tsx queda sin ruta como rollback.
6. Gate de aprobación del owner (réplica en Settings→Dev primero).
**Depende de**: gate del owner; decidir si Onb5cHogar se extrae a kit compartido o se
duplica; ideal encararla junto a G11 para que la cadena join → crear hogar → setup quede
consistente.

### G05 — ResetPassword + AuthCallback: el funnel secundario de auth en legacy [alta · M]
**Superficie**: `/auth/reset-password` (deep link del mail de recovery — 6 estados:
exchanging/reauth/fricción fresh-install/form/éxito/error/timeout) y `/auth/callback`
(retorno OAuth PKCE / confirm-link, con estados timeout/error). El flujo forgot-password
neo desemboca acá y el seam es evidente; Google OAuth desemboca en callback.
**Archivos**: `app/auth/reset-password.tsx`, `mobile/screens/auth/reset-password-screen.tsx`,
`mobile/components/auth/auth-scaffold.tsx`, `app/auth/callback.tsx`,
`mobile/screens/auth/auth-callback-screen.tsx`,
`mobile/components/auth/fresh-install-reset-friction.tsx`,
`mobile/components/ui/password-field.tsx`.
**Estado actual**: Todos los estados de reset renderizan sobre AuthShell (auth-scaffold
legacy: Screen viejo + FernLogo chico + theme.colors) con PasswordField/AppButton/
FeedbackPill viejos. El callback usa BlockingScreen (splash verde `#0E3A26`) para
processing y Screen + BrandedPanel variant accent + AppButton para timeout/error.
**Evidencia**: `reset-password-screen.tsx` (máquina de stages entera sobre scaffold V1);
`auth-callback-screen.tsx` (BlockingScreen + BrandedPanel).
**Referencia de diseño**: sin pantalla específica — diseñar con el kit; gate de
aprobación del owner. Vocabulario: `design/rediseno-2026-07/screens/4a.html` (wells de
contraseña hundidos + strength meter, réplica auth-4a-crear-cuenta), el estado fail de
`auth-bridge.tsx` (65% durazno + Reintentar) y AuthOffline (Brot worried).
**Plan**:
1. `neo-reset-password-screen.tsx` sobre AuthScreenShell + AUTH_SPEC conservando la
   máquina de stages INTACTA (lógica de seguridad auditada — solo cambia la piel).
2. Form: wells hundidos + strength/match indicator reusando los parts de
   auth-4a-crear-cuenta; estados error/timeout/success con el patrón fail del bridge y
   BrotSuccess para el éxito; los sheets de reauth/fricción quedan como están.
3. `neo-auth-callback-screen.tsx`: processing pinta la superficie del boot neo
   (AUTH_SPEC welcomeBg + BrotParticles + FernLogo — idéntica al BootScreen para que el
   seam OAuth→bridge sea invisible); timeout/error sobre AuthScreenShell con CTA
   'Reintentar' + secundario hundido 'Volver al login'.
4. Conservar entera la lógica PKCE/timeout/signOut defensivo.
5. Swap en las 2 rutas; auth-scaffold.tsx queda muerto (verificar que nadie más lo
   importe). Gate de aprobación del owner.
**Depende de**: conviene resolver antes o junto G25 (BlockingScreenView) para el estado
'exchanging'/'processing'; comparte kit entre ambas pantallas.

### G06 — Historial de gastos + editor de gasto: superficie completa en V1 y huérfana [media · M]
**Superficie**: `/(app)/expenses-history`. Ninguna superficie viva navega a ella (la
única referencia es la vieja expenses-screen, dead code de rollback); queda alcanzable
solo por deep-link. Pero conserva la ÚNICA edición de gasto de la app
(ExpenseEditorModal) — retirar la ruta sin darle casa nueva a esa capacidad es una
regresión funcional. `expense-filters` (ya neo) solo es alcanzable vía este historial.
**Archivos**: `app/(app)/expenses-history.tsx`,
`mobile/screens/home/expenses-history-screen.tsx`,
`mobile/components/home/expense-history-hero-card.tsx`, `expense-history-content-card.tsx`,
`expense-history-toolbar.tsx`, `expense-history-row.tsx`, `expense-history-row-card.tsx`,
`expense-history-row-actions.tsx`, `expense-history-section-header.tsx`,
`expense-editor-modal.tsx`, `mobile/components/ui/branded-panel.tsx`.
**Estado actual**: Pantalla V1 completa: hero BrandedPanel con breakdown por categoría,
lista agrupada con editar/borrar, toolbar, AmbientBackdrop, y el editor rápido en
ModalCard sin skin con AppButton/TextField viejos. Su función de 'meses pasados' ya la
absorbieron las ediciones cerradas del neo-gastos (F4/CycleDropdown).
**Evidencia**: `expenses-history-screen.tsx` + componentes (todo theme.colors); grep de
navegación: cero callers vivos.
**Referencia de diseño**: sin pantalla propia en el handoff — `design/gastos-2026-08-v2`
absorbe los ciclos cerrados en la propia Gastos. Hay que diseñar solo la EDICIÓN de gasto
si se conserva.
**Plan**:
1. **Confirmar con el owner**: ¿el historial quedó absorbido por las ediciones del
   neo-gastos y la ruta se retira?
2. Diseñar una sheet neo de 'editar gasto' (monto/categoría/descripción) reusando
   ModalCard skin="neo" + AmountCard rama neo + CategoryHorizontalRail bajo
   WizardSkinProvider.
3. Cablearla como acción del feed (long-press o segunda acción del SwipeRow) con las
   mismas mutaciones de use-expense-history-controller.
4. Retirar `app/(app)/expenses-history.tsx` + expense-filters (su único caller) y mover
   la pantalla + sus componentes + branded-panel (si no queda otro consumidor) a dead
   code.
5. Si el owner prefiere conservar la pantalla: reconstruirla con el patrón de
   expense-filters-screen (NeoSurface/neoTokens/nunitoFamily) reusando las filas del kit
   v2 — el esfuerzo pasa a L.
**Depende de**: decisión de producto del owner (retirar vs rediseñar + dónde vive la
edición de gasto — hoy el swipe del feed neo solo borra); G28 si la edición entra como
acción del swipe.

### G07 — dev-health-screen 100% V1 (solo `__DEV__`) [baja · S]
**Superficie**: `/settings/dev-health` — Redirect a `/settings` en builds de producción.
No la ve ningún usuario final; sí la ve el owner en dev junto al resto de Ajustes ya neo.
**Archivos**: `mobile/screens/dev-health-screen.tsx`.
**Estado actual**: Toda la pantalla en paleta vieja (creamCard/line/primary + radii del
palette).
**Referencia de diseño**: sin referencia — herramienta interna; basta el vocabulario
(grupos raisedLg + pozos insetSm).
**Plan**:
1. Opcional/última prioridad: swap mecánico theme.colors→neoTokens y cards→NeoSurface.
2. Alternativa válida: dejarla explícitamente fuera del rediseño con un comentario, como
   las previews de dev.
**Depende de**: nada.

---

## Categoría B — Flujos parciales (carcasa neo, tripa V1)

### G08 — Intro pre-auth: los slides showcase muestran la app VIEJA [alta · L]
**Superficie**: `/(auth)/intro` — 5 slides pre-auth, primer contacto de todo usuario
nuevo. El intro le promete al usuario un diseño que nunca va a ver.
**Archivos**: `mobile/screens/auth/intro/intro-screen.tsx`,
`mobile/screens/auth/intro/intro-slides.tsx`,
`mobile/features/onboarding-intro/illustrative-data.ts`,
`mobile/components/home/home-hero-card.tsx`, `mobile/components/fijos/fijos-hero-card.tsx`,
`mobile/components/gastos/gasto-row.tsx`, `mobile/components/gastos/income-row.tsx`.
**Estado actual**: El slide 5 ya monta NeoWelcomeScreen (forceMode dark) — bien. Pero los
slides 2-4 montan los componentes REALES de ANTES del rediseño: HomeHeroCard,
FijosHeroCard (expo-linear-gradient + theme.colors.heroGradient + CardParticles con
authTokens.peach), GastoRow, IncomeRow. El chrome (fondo, dots, CTA Seguir, partículas)
usa authTokens.welcomeBg `#0E3A26` y hexes que no matchean AUTH_SPEC (`#0F1E14`). El
slide 3 es además lo único que mantiene vivo fijos-hero-card.tsx.
**Evidencia**: `intro-slides.tsx:345` (`<FijosHeroCard {...INTRO_FIJOS_PROPS} />`);
chrome con authTokens.welcomeBg vs AUTH_SPEC.
**Referencia de diseño**: parcial — la paleta de partículas de bienvenida y las
superficies neo que los slides deberían mostrar están en
`design/rediseno-2026-07/handoff-README.md` (3b Inicio, 3d Gastos, 3e Fijos, 3g Jardín);
la composición de los slides en sí no tiene mockup — recomponerla con las piezas neo.
**Plan**:
1. Alinear la superficie: root/backdrop del pager a AUTH_SPEC dark welcomeBg (`#0F1E14`)
   + partículas del handoff (`#A4E3A6`, `#F2A87E`, `#F1EEDD`) para que el slide 5 sea
   continuo con el resto.
2. Slide 2: HomeHeroCard → hero neo de la Home (kit redesign/home) con los mismos datos
   ilustrativos.
3. Slide 3: FijosHeroCard → FijosHero del kit en modo estático (variant default,
   `animated={false}`, paused fuera de foco — los fixtures del kit son el mockup
   aprobado); GastoRow/IncomeRow → filas del handoff gastos v2 (kit compartido
   preview↔live ya existe). Verificar clipping del carrusel (radio 32 + boxShadow
   multi-string).
4. Slide 4: portar el preview de cierre de semana al lenguaje neo (mini-Brots si 3g lo
   pide — misma decisión que G02).
5. Chrome: dots y CTA 'Seguir' con tokens del AUTH_SPEC.
6. Retirar gasto-row/income-row/home-hero-card/fijos-hero-card a dead code (el intro era
   su último consumidor vivo). QA del pager + reduced motion. Gate del owner slide por
   slide.
**Depende de**: los heroes neo de Home/Fijos y las filas v2 montables con data
ilustrativa (el kit preview↔live de gastos v2 ya lo permite; verificar los heroes); gate
del owner.

### G09 — Wizard de import-review: las 7 piezas internas en V1 dentro de la carcasa neo [alta · L]
**Superficie**: Sheet de revisión de movimientos importados por OCR — el flujo estrella
de captura (FAB → 'Importar captura' y share-to-import vía ShareImportHost, montado en
`app/(app)/(tabs)/_layout.tsx:35`).
**Archivos**: `mobile/components/import-review/import-review-sheet.tsx`,
`import-review-row.tsx`, `import-review-footer.tsx`, `import-review-header.tsx`,
`import-review-step-indicator.tsx`, `import-review-summary.tsx`,
`import-review-empty.tsx`, `cycle-date-slider.tsx`.
**Estado actual**: La carcasa (ModalCard skin="neo" + neoTokens) y el InAppNumpad ya son
neo, pero todo el contenido es V1: theme.colors por todos lados, radios 12-16 fuera de
escala, CTA plano, tipografía sin nunitoFamily. Como nadie monta WizardSkinProvider, los
compartidos skin-aware (AmountCard, CategoryHorizontalRail, TileRail) caen a su rama
classic — el docblock de `app/(app)/add-expense.tsx` lo lista explícitamente como
consumidor que 'sigue cayendo a su rama de siempre'.
**Evidencia**: `import-review-sheet.tsx:13,72,361` (carcasa neo); docblock de
add-expense.tsx (consumidores sin provider).
**Referencia de diseño**: parcial — `design/rediseno-2026-07/screens/3c.html` cubre la
ENTRADA ('Importar captura') y el vocabulario de los sheets de carga (CTA deshabilitado
hundido + Brot think); los pasos del wizard de revisión NO están dibujados — diseñar
derivando del kit wizard vivo (add-gasto/add-fijo v2); gate del owner.
**Plan**:
1. Montar WizardSkinProvider (mode del tema) alrededor del contenido del sheet —
   AmountCard/CategoryHorizontalRail/TileRail flipean solos a neo, cero cambios en ellos.
   Antes, verificar la lista de consumidores del docblock de add-expense.tsx para no
   arrastrar a otros.
2. ImportReviewFooter → WizardCTA + WizardFooterHelper del kit ('nunca disabled'; Brot
   think en el helper de faltantes según 3c).
3. Step-indicator → barra de progreso de wizard/parts/step-header
   (progressDone/progressPending).
4. Row: TextField → description-field neo (gastos/add-gasto-parts), NotesRow → pozo de
   notas de step2-summary; skip-card y KindToggle a NeoSurface con chips extruidos y
   tinta neoInk; estado de fila (válida/incompleta/skip) al lenguaje de relieve
   (ringSelected/inset) en vez de bordes de color; tipografía a nunitoFamily.
5. CycleDateSlider: rediseñar como riel hundido (insetMd) con tile seleccionado raised +
   ringSelected — sin referencia, diseñar.
6. Header/summary/empty a neoInk + escalas neo; QA con un import real de OCR en device,
   claro/oscuro + fallback SUPPORTS_INSET_SHADOW.
**Depende de**: kit wizard existente; coordinar con el área de altas si se extrae el
editor de notas a componente compartido. Ojo: la rama classic de AmountCard NO queda
muerta tras esto (numeric-edit-sheet vivo la usa — `amount-card.tsx:70-74`).

### G10 — Meta de ahorro completa: wizard de 4 pasos + MetaCard + restos de pantalla [alta · XL]
**Superficie**: `/(app)/savings-goal` (fila 'Meta de ahorro' del root de Ajustes:1264,
también linkeada desde el jardín del home neo) + CreateSavingsGoalWizardSheet, que se
abre desde la alcancía del Control, desde la pantalla de meta (empty y 'Crear próxima
meta') y desde el flujo de reserva.
**Archivos**: `mobile/components/savings-goals/wizard-steps/step-1-title-emoji.tsx`,
`step-2-amount.tsx`, `step-3-months.tsx`, `step-4-summary.tsx`, `wizard-step-header.tsx`,
`mobile/components/home/meta-card.tsx`, `mobile/screens/settings/savings-goal-screen.tsx`,
`mobile/components/home/ambient-blobs.tsx`, `mobile/components/ui/loading-block.tsx`.
**Estado actual**: La hoja del wizard (scrim, handle, sombra, NeoButton CTA) ya es neo,
pero TODO el contenido de los 4 pasos estila con theme.colors y typography V1 — nada de
Nunito ni un token neo en los 5 archivos. El hero de la pantalla es la MetaCard V1
completa: expo-linear-gradient con ACCENT_GRADIENT `#77E755`→`#F2A78C` — exactamente los
saturados mint/coral que el owner rechazó —, acentos lime rgba(166,239,143,…). Alrededor,
el esqueleto de la pantalla es neo pero con AppButton V1, AmbientBlobs V1, LoadingBlock
V1, estilos sin Nunito y `theme.radii.xl`.
**Evidencia**: step-1 L3 (TextField V1) y L92-98; step-2 L59-110; step-3 L103-253 (incl.
`'#FFFFFF'` L252); step-4 L31/L89-94; header L43-72; `meta-card.tsx` L4/L47;
`savings-goal-screen.tsx` L9/L151/L337 (AppButton), L121/L306 (AmbientBlobs), L488-530
(sin fontFamily), L129/L321 (radii V1); `neo-home-screen.tsx:84` ('de la MetaCard
vieja' — el home ya la reemplazó).
**Referencia de diseño**: parcial — `design/rediseno-2026-07/screens/5e2.html` (paso de
meta del onboarding: sugeridas de un toque + cuota calculada; onb-5e2-meta.tsx ya lo
replica) y `screens/3c.html` (hoja). No hay maqueta 1:1 del wizard de 4 pasos ni del hero
de la pantalla — conversión por vocabulario + kit; gate del owner.
**Plan**:
1. step-1: TextField → NeoField (control-v2, hecho para esto); picker de stickers a tiles
   raisedSm/ringSelected + selectedTint (patrón OptionCard del month-close-decision-sheet).
2. step-2: display del monto como pozo insetLg sobre neo.well con número Nunito 900
   letter-spacing negativo (NumpadGrid ya es neo, no tocar).
3. step-3: chips de plazo 3/6/12/24 al patrón chip neo (raisedSm inactivo /
   ringSelected+selectedTint activo, estilo del stepper de daily-goal-sheet L310-326).
4. step-4: summary card con cssGradient(raisedGradientCss)+raisedMd y jerarquía neoInk;
   wizard-step-header: eyebrow 11/800 mayúsculas con tracking + título Nunito 900,
   chevron como pozo insetSm. Fallback Android con neo.sheetDivider.
5. Hero: decidir con el owner si reusa el frasco de ControlAlcancia (variantes
   enMarcha/cumplida con Brot love ya implementadas) o un card raisedXl nuevo con barra
   de progreso en pozo insetSm; crear MetaCardNeo junto al kit (o extraer la card de meta
   neo del home como compartida) — sin lime ni peach V1. NO tocar meta-card.tsx en sitio
   (lo montan pantallas dead de rollback); dejarlo morir con ellas.
6. Pantalla: AppButton → NeoButton; retirar AmbientBlobs (o retintar — ver G36);
   nunitoFamily en los estilos locales; theme.radii.xl → neoRadii; LoadingBlock →
   skeleton neo. Entregar la pantalla completa en una sola pasada.
**Depende de**: gate del owner sobre la forma del hero; G22 (NeoButton), G23 (NeoField
para step-1), G29 (skeleton). Reusa control-alcancia.tsx, BrotMascot, NumpadGrid,
onb-5e2-meta como referencia visual.

### G11 — household-setup: wizard del hogar mitad V1 (BrandedPanel/SegmentedControl/AppButton/SectionHeader) [alta · M]
**Superficie**: `/(app)/household-setup` (modal de 3 pasos; también flujo inicial
post-'Crear mi hogar' con `initial=1` — la primera pantalla de un usuario que re-crea su
hogar).
**Archivos**: `mobile/screens/settings/household-setup-screen.tsx`,
`mobile/components/ui/branded-panel.tsx`, `mobile/components/ui/section-header.tsx`,
`mobile/components/ui/segmented-control.tsx`, `mobile/components/ui/loading-block.tsx`.
**Estado actual**: Mixto tras cbf19915: NumpadField ya es pozo neo
(insetLg/ringSelected), household-setup-sections y settings-primitives usan neoTokens,
NeoStateBlock en las ramas de error — pero las superficies contenedoras son V1: 5-6
BrandedPanel (AppCard + expo-linear-gradient + buildElevationStyle) como contenedores de
cada paso, 5 SectionHeader con tinta vieja, SegmentedControl V1 para el buffer, AppButton
como CTAs, LoadingBlock V1 y AmbientBackdrop en claro.
**Evidencia**: `household-setup-screen.tsx` (neoTokens en L193 conviviendo con el
esqueleto V1).
**Referencia de diseño**: sin referencia directa del paso a paso — vocabulario análogo en
`design/rediseno-2026-07/screens/5d–5f` (wizard de onboarding con progreso segmentado) y
el kit `mobile/components/wizard/`; canon: settings-screen.tsx.
**Plan**:
1. Cada BrandedPanel → NeoSurface raisedLg radio card ('hero' para el resumen — la card
   accent ya es casi un pozo insetSm con HeroStats).
2. SectionHeader → patrón eyebrow del área (11/800 mayúsculas neo.textMuted, como
   SettingsGroup).
3. SegmentedControl del buffer → el segmented neo (G30).
4. AppButton → NeoButton/WizardCTA y LoadingBlock → skeleton neo.well + insetSm (como el
   de achievements). Quitar AmbientBackdrop (el fondo neo es el del tema).
5. Verificar las 4 ramas de render (loading/error/formulario/éxito) con presentedAsSheet
   en device, claro y oscuro. Revisar los sheets que abre (share-invite ya skin=neo).
**Depende de**: G30 (SegmentedControl neo), G22 (NeoButton), G38 (SectionHeader);
coordinar con G04 para la cadena join → crear hogar → setup.

### G12 — Wrapped: escenas del cierre de ciclo en paleta V1 hardcodeada (parcial deliberado) [media · L]
**Superficie**: Replay mensual del cierre de ciclo — momento emocional clave, una vez por
ciclo. Vivo por tres puertas: CycleWrappedBridge/WeekCloseBridge en
`app-stack-shell.tsx:174-176`, launch desde `neo-control-screen.tsx:153` y replay desde
`editions-screen.tsx:98`.
**Archivos**: `mobile/components/wrapped/cycle-wrapped-modal.tsx`,
`scenes/cover-scene.tsx`, `verdict-scene.tsx`, `top-category-scene.tsx`,
`top-expense-scene.tsx`, `closing-scene.tsx`, `leftover-option-card.tsx`,
`cycle-wrapped-cta.tsx`, `detail-styles.ts`, `closing-styles.ts`, `wrapped-constants.ts`.
**Estado actual**: El chrome del modal ya consume neoTokens (neo.bg/neo.scrim L139/380) y
neoParticlePresets.celebrationDark (L544), pero las 6 escenas definen fondos y tintas con
la paleta V1 'jardín' hardcodeada: cream `#FFFBF2` + forest `#0F2E1F` + `#1F590D`
(cover-scene.tsx:13-20), lime `#A6EF8F` por todos lados (closing-scene.tsx:32-199,
leftover-option-card.tsx:69-137), verdict con pares `#E3F2D2`/`#1F4530` y
`#F8D1C3`/`#4A2418` (verdict-scene.tsx:26-49), sombras shadowColor `#A6EF8F`
(leftover-option-card.tsx:79, cycle-wrapped-cta.tsx:108), CERO Nunito (grep nunitoFamily
vacío) y sin Brot. Es un parcial DELIBERADO: `cycle-wrapped-modal.tsx:63-70` documenta
que re-skinearlas 'requiere decisión del owner, no una migración de material'.
**Referencia de diseño**: sin referencia — hay que diseñar; gate del owner. El handoff
cubre Ediciones (3h) y el cierre de semana (3g), no el wrapped de ciclo. Vocabulario
aplicable: heroGradient/heroText de neoTokens, neoParticlePresets, CTA crema del login,
Brot cheer/zen.
**Plan**:
1. Llevar al owner la decisión explícita: mantener la estética editorial committed (y
   cerrarla como excepción documentada del sistema) o diseñar la versión neo de las
   escenas (cover sobre neo.bg claro, verdict positivo sobre heroGradient, negativo sobre
   warm/danger del sistema, closing sobre el forest del oscuro neo).
2. Mientras tanto, consolidar la paleta de escenas en wrapped-constants.ts como single
   source (hoy duplicada por archivo y copiada a mano en resolveTone de Ediciones — G51).
3. Migrar tipografía de detail-styles/closing-styles a nunitoFamily (los números ya usan
   900/-1.4, solo falta la face).
4. Los 2 glows shadowColor animados: si se mantienen, documentarlos como excepción
   consciente (Reanimated anima shadow*, no strings boxShadow); si no, halo estático
   boxShadow con fade de opacity del wrapper.
5. Si el owner aprueba re-skin: transcribir escena por escena con gate, empezando por
   cover/closing; sumar Brot a la escena de cierre (cheer si hubo sobrante, zen si cerró
   en paz). QA de la interpolación de color de fondo por shared value con los tonos
   nuevos.
**Depende de**: decisión del owner (ver Decisiones). La carcasa y el emitter no se tocan.

### G13 — Rama vacía del Control (cuenta nueva) en V1 dentro de la pantalla neo [media · M]
**Superficie**: Tab Control sin ingreso configurado / ingreso dinámico sin ingresos — la
primera impresión del Control para toda cuenta nueva, bajo un ControlHeader ya neo (con
Brot wave).
**Archivos**: `mobile/components/control-v2/control-v2-empty-state.tsx`,
`mobile/screens/home/neo/neo-control-screen.tsx`.
**Estado actual**: El propio neo-control-screen lo documenta: 'conserva el
ControlV2EmptyState funcional (guía de setup); re-skin pendiente' (L105). El componente
usa theme.colors.surfaceMuted/text/textMuted/line/creamCard (L45-48, 76, 102, 142), hexes
viejos (`#FFFBF2` L45, `#244235`/`#D5E6DF` L46, stroke `#FFFBF2` L196), botón plano radio
14, sin sombras neo, sin Nunito y sin Brot.
**Referencia de diseño**: sin referencia — hay que diseñar (3f solo dibuja el Control con
datos); gate del owner. Vocabulario: header + cards del kit redesign/control y el patrón
de empty neo de Notificaciones (7b: pedestal raised + pozo + Brot).
**Plan**:
1. Diseñar la variante vacía con el vocabulario 3f/7b: card raisedLg con cssGradient,
   Brot seed o wave como protagonista (cuenta que recién germina), CTA con el material
   cta del sistema.
2. Crear `control-empty.tsx` en components/redesign/control/parts consumiendo
   CONTROL_SPEC; checklist (ingreso ✓ / primer gasto ✓) como filas con pozos insetSm y
   check verde del sistema.
3. Réplica en Settings→Dev para el gate del owner.
4. Swap del import en neo-control-screen (las 3 ramas: noConfig, dynamicNoIncome,
   gathering) y retirar el componente viejo.
**Depende de**: gate del owner. Reusa CONTROL_SPEC, BrotMascot, NeoSurface/NeoStateBlock.

### G14 — Galería de logros: tiles con borde plano y glow con API de sombras vieja [media · M]
**Superficie**: `/settings/achievements` (grilla principal). El hero ya es NeoSurface
correcto.
**Archivos**: `mobile/screens/settings/achievements-gallery-screen.tsx`,
`mobile/features/achievements/achievement-tiers.ts`.
**Estado actual**: Cada BadgeTile es una card plana con borderWidth 1 (el 'parche de piel
vieja'): earned = tint+borde, locked = neo.well+borde SIN insetSm (el comentario de la
línea 260 dice 'pozo' pero no hay sombra inset). El glow premium usa
shadowColor/shadowOpacity/elevation en vez de boxShadow; hexes inline fuera de token y
radii.pill del palette viejo. tierTone gold claro `#9E7C12` = 2.90:1 como texto.
**Referencia de diseño**: sin referencia — la galería no está en el handoff; patrón tile
18 raisedSm/insetSm de neo-tokens y las 12 pantallas de Ajustes convertidas.
**Plan**:
1. BadgeTile earned → NeoSurface raisedSm radio tile 18 con tint del tier encima del
   material; locked → neo.well + insetSm real.
2. Glow premium → boxShadow string multi-capa estático (es un halo fijo, no se anima).
3. Tokenizar rgba/hex inline; radii.pill → 999 literal o neoRadii; nunitoFamily en los
   Text.
4. Centralizar la paleta de tiers en achievement-tiers.ts con nombres del vocabulario
   (la comparte el BadgeDetailSheet — G27); tierTone gold claro → oscurecer (~`#7A5F0B`)
   si se usa como texto, o gatearlo a bordes/fondos.
**Depende de**: G27 (mismo sprint recomendado).

### G15 — Tendencia de precio de Fijos sin rama neo: TrendBadge y FijoTrendSpark [media · S]
**Superficie**: Fila de fijo en la lista neo (strip inferior mes·estado·variación y
bloque del monto) + pozo de tendencia del panel expandido.
**Archivos**: `mobile/components/fijos/fijo-row-parts/trend-badge.tsx`,
`mobile/components/fijos/fijo-trend-spark.tsx`, `mobile/components/fijos/fijo-row.tsx`,
`mobile/components/fijos/fijo-row-parts/fijo-row-detail-panel.tsx`.
**Estado actual**: Ambos se renderizan dentro de la fila neo (fijo-row.tsx:416 y
:527-540, detail-panel:260) pero NO leen useFijosSkin: hexes V1 hardcodeados y
theme.colors.textMuted incondicionales. En oscuro el 'bajó' se pinta `#A6EF8F` (verde
neón V1) y el stroke plano de la spark es el mismo token — exactamente el que el docblock
de fijos-skin.tsx:296-300 prohíbe en la piel neo. El badge es una pill plana radio 999
con fondos alpha V1 al lado de chips que en neo son pozos inset con Nunito 900.
**Referencia de diseño**: `design/fijos-2026-07/Fijos Manifiesto.dc.html` — las filas de
'AUMENTOS Y RECORDATORIOS' definen el vocabulario (terracota aumentoNameInk
`#C25B33`/`#F0A47E`, verde `#2E7C39`/`#A4E3A6`); el chip individual no está dibujado →
derivar de los pares tag* del spec.
**Plan**:
1. Agregar a FijosNeoSkin un cluster `trend` en buildNeoSkin: up = tagOverdueInk/
   tagOverdueBackground, down = rowMetaOkInk/tagUpcomingBackground, arrears =
   accentClayInk sobre tagOverdueBackground, flat = faint.
2. TrendBadge: leer useFijosSkin y en neo aplicar neoChipStyle (pozo inset radio 12 +
   Nunito 900, como los chips vecinos); classic queda literal.
3. FijoTrendSpark: stroke desde el cluster trend (flat = faintInk, nunca
   theme.colors.textMuted).
4. Verificar en device oscuro que el neón desapareció de la lista y del pozo; queda listo
   para Gastos si comparte spark.
**Depende de**: nada — solo tokens que ya existen en FIJOS_SPEC/fijos-skin.

### G16 — StartingBalanceCta en la piel vieja dentro de la Home neo [media · S]
**Superficie**: Home → barra 'Confirmá tu saldo inicial' (onboarding del ciclo, gate
isOnboardingFlow + monthlyIncome>0; `neo-home-screen.tsx:1513-1524`).
**Archivos**: `mobile/components/home/starting-balance-cta.tsx`.
**Estado actual**: Componente v1 tal cual: expo-linear-gradient con
theme.colors.heroGradient, tinta heroText/heroAccent, hex suelto PILL_TEXT `#0F2E1F`,
borderRadius 14 con borderWidth 1.5 (el neo no separa con bordes de 1px), tipografía
13.5/700 fuera de la escala Nunito 800/900.
**Referencia de diseño**: `design/home-final-2026-07/PLAN-CABLEADO.md:118` (G4: 're-skin
card raise + CTA crema') + vocabulario ctaCream*/heroGradientCss ya transcripto en
`home-spec.ts` (:289-291 claro / :441-443 oscuro). Sin mockup dedicado de la barra — la
dirección está escrita, el pixel no.
**Plan**:
1. LinearGradient → `experimental_backgroundImage` con HOME_SPEC[mode].heroGradientCss +
   boxShadow heroShadow (el forest del hero, intención original del componente).
2. Pill 'Confirmar' → reusar el CtaPill del kit (ctaCreamGradientCss/ctaCreamInk/
   ctaCreamShadow) en vez del heroAccent lime.
3. Tipografía a Nunito 800 con letter-spacing -0.2, radio 18-24.
4. Portar el useBorderGlow al lime del spec (heroDot) o retirarlo; fallback hairline para
   Android<28 (patrón flatFallback).
5. No tocar TourTarget ni CollapsingReveal; QA claro/oscuro en device.
**Depende de**: nada.

### G17 — cycle-config-section V1 dentro del sheet neo de configuración de ciclo [media · S]
**Superficie**: Sheet edit-cycle-config (Ajustes), con carcasa `skin="neo"`.
**Archivos**: `mobile/components/finance/cycle-config-section.tsx`,
`mobile/components/settings/sheets/edit-cycle-config-sheet.tsx`.
**Estado actual**: El shell del sheet ya es neo pero el cuerpo (cycle-config-section)
estila con theme.colors — otro caso del patrón 'carcasa neo con órganos V1' detectado por
el barrido transversal.
**Referencia de diseño**: sin referencia por pieza — vocabulario del handoff: chips/
inputs neo (NeoField + tiles), cards raisedMd/insetSm.
**Plan**:
1. Portar cycle-config-section a chips/inputs neo (NeoField + tiles raisedSm con
   ringSelected).
2. Tintas neoInk; fallback Android estándar.
3. QA del sheet completo desde Ajustes en claro/oscuro.
**Depende de**: G23 (NeoTextField/NeoField) si el campo lo necesita.

### G18 — Pill de severidad de Notificaciones con la paleta de estado vieja [baja · S]
**Superficie**: Cards de notificación con severity success/warning/alert.
**Archivos**: `mobile/utils/notifications.ts`,
`mobile/components/redesign/notifications/notif-screen.tsx`.
**Estado actual**: NotifCard llama pillForSeverity (notif-screen.tsx:143, render en
187-193), que devuelve hexes PRE-rediseño (claro `#2E7D5B`/`#C25A3E`/`#C03A2A`, oscuro
`#9EE0B2`/`#F2B58A`/`#E88A70`; utils/notifications.ts:119-139). El vocabulario neo define
green `#2E7C39`/`#A4E3A6` y danger `#C25B33`/`#E08765` (neo-tokens.ts:168-206) — matices
casi-iguales-pero-distintos dentro de una card 100% neo.
**Referencia de diseño**: sin referencia — 7a no muestra pills de severidad (arrastre
semántico del feed vigente); decidir el mapping o eliminarlas.
**Plan**:
1. Confirmar con el owner si la pill sobrevive en la vista neo (7a no la dibuja).
2. Si queda: pillForSeverityNeo en notif-spec.ts con surface/ink de neoTokens
   (success=green, alert=danger, warning=durazno `#D97E4F`/`#F2A87E` ya presentes como
   chipDot); cambiar notif-screen.tsx:143 a la variante neo.
3. Marcar pillForSeverity @deprecated ligada al feed legacy; verificar AA de los inks.
**Depende de**: confirmación del owner.

### G19 — Swatches de categoría del hero de Gastos pintan el catálogo saturado V1 (+ '#888' inline) [baja · S]
**Superficie**: Tab Gastos — top 3 categorías del hero (ciclo vivo y ediciones cerradas).
**Archivos**: `mobile/screens/home/neo/neo-gastos-screen.tsx`,
`mobile/features/gastos/use-gastos-controller.ts`,
`mobile/components/redesign/gastos/gastos-screen.tsx`.
**Estado actual**: El kit del handoff v2 traía swatches PASTELES demo ('pasteles que
rinden sobre el hero forest', gastos-screen.tsx:178-184). Al cablear, el color pasó a ser
el category.color crudo de la DB (catálogo V1 saturado) con fallback `'#888'` inline.
Inconsistencia interna con expense-categories-screen, que ya mapea esos saturados ('que
el owner rechaza') a neoCategoryPastels con hash determinista.
**Referencia de diseño**: `design/gastos-2026-08-v2/Gastos Manifiesto.dc.html` (swatches
pasteles: `#A9D57F`/`#9DB4E8`/`#F3C29A`) + neoCategoryPastels en `mobile/theme/neo-tokens.ts`.
**Plan**:
1. Promover categoryPastel (hash sobre rawName) de expense-categories-screen a
   theme/neo-tokens o helper compartido.
2. Mapear el color en la capa VM (heroCategories y closedCategories) con pastelDarkSolid
   en oscuro, igual que la pantalla de categorías.
3. Reemplazar los dos `'#888'` por un token neutro; verificar contraste del swatch sobre
   el hero forest en ambos modos.
**Depende de**: confirmar con el owner que el swatch chico también cae bajo la regla
anti-saturados (el kit demo sugiere que sí).

### G20 — Restos V1 menores en Fijos: pill 'Pagar' y hint de cuotas [baja · S]
**Superficie**: Botón Pagar inline de cada fila pendiente/vencida y CTA de la card
expandida; hint 'N cuotas de $X (total $Y)' del paso 1 del alta de fijo.
**Archivos**: `mobile/components/fijos/fijo-row-parts/inline-pay-button.tsx`,
`mobile/components/fijos/add-fijo-parts/step1-form.tsx`.
**Estado actual**: El pill Pagar gana radio y sombra del skin pero fill y tinta siguen
siendo theme.colors.text + creamCard incondicionales (inline-pay-button.tsx:59, 78-80) —
en oscuro `#F2EAD3` sobre `#305A47`, el par V1, cuando el spec ya define el par invertido
del sistema (tabActiveBackground/tabActiveInk `#F1EEDD`/`#16271C`, hoyPill*). El hint de
cuotas es el único texto del paso 1 sin override neo (`step1-form.tsx:144-151`,
`theme.colors.textMuted` pelado → `#A6EF8F` neón en oscuro); su gemelo cuotaFootnote
(:260-271) SÍ tiene rama neo.
**Referencia de diseño**: `design/fijos-2026-07/Fijos Manifiesto.dc.html` — par invertido
ya transcrito en FIJOS_SPEC; criterio interno cuotaFootnoteNeo (step1-form L263-270).
**Plan**:
1. Agregar ink/background a skin.pay en buildNeoSkin tomando
   s.tabActiveBackground/s.tabActiveInk; InlinePayButton rama neo usa esos campos
   (classic literal); chequear AA del label 14/800 y los 2 call-sites (inline y
   fullWidth).
2. Hint de cuotas: agregar el término neo al array (`neo.mutedInk` + `neo.font('700')`);
   verificar en oscuro. Un solo edit.
**Depende de**: nada.

### G21 — El path del picker (FAB → Importar) no muestra el overlay 'Leyendo tu captura…' [baja · S]
**Superficie**: Entre elegir la imagen y que aparezca el wizard corre el OCR (segundos)
sin feedback visual — el mismo flujo por share sí muestra la card neo con
ActivityIndicator. Dos entradas al mismo wizard, solo una con estado de lectura.
**Archivos**: `mobile/components/navigation/add-expense-tab-button.tsx`,
`mobile/components/import-review/share-import-host.tsx`.
**Estado actual**: add-expense-tab-button.tsx (~:260) hace `await openImportFlow(...)` y
recién al resolver setea el estado del sheet; no hay fase 'parsing' visible.
ShareImportHost:91-121 sí renderiza el overlay neo (NeoSurface raisedLg + scrim neo).
**Referencia de diseño**: no requiere diseño — reusar tal cual la card overlay de
ShareImportHost.
**Plan**:
1. Extraer el overlay 'parsing' de ShareImportHost a componente compartido
   (`import-parsing-overlay.tsx`).
2. Agregar estado phase='parsing' en el handler de Importar del FAB y montarlo mientras
   corre openImportFlow.
3. Unificar la key i18n (`gastos:shareImport.reading`); verificar que no colisione con el
   dismiss del picker (InteractionManager, gotcha modal-chain iOS).
**Depende de**: nada.

---

## Categoría C — Primitivas y componentes compartidos

El multiplicador: estas piezas se ven DENTRO de superficies ya neo. Cada una convertida
elimina restos en varias vistas a la vez.

### G22 — AppButton V1 como CTA dentro de sheets y pantallas neo [alta · M]
**Superficie**: 10+ sheets de Ajustes con skin neo (share-invite,
destroy-family-confirm, member-action, edit-avatar, edit-cycle-config, edit-display-name,
edit-payday, income-mode-confirm, category-editor-modal) + delete-account (×7),
household-setup, savings-goal, banners de eliminación, billing.
**Archivos**: `mobile/components/ui/button.tsx` + los sheets de
`mobile/components/settings/sheets/`, `mobile/components/settings/category-editor-modal.tsx`,
`mobile/screens/settings/delete-account-screen.tsx`, `household-setup-screen.tsx`,
`savings-goal-screen.tsx`.
**Estado actual**: Los shells pasaron a `skin="neo"` pero sus CTAs siguen siendo
AppButton: fill flat theme.colors.primary/danger + `'#FFFFFF'` (button.tsx:50-72), borde
1px, radios y tipografía viejos — un botón de la piel vieja flotando sobre una hoja
neumórfica. NeoButton ya existe (`mobile/components/ui/neo-button.tsx`, Nunito + material
neo) y es el patrón en los sheets de home/gastos; en settings hay 0 usos de NeoButton y
10 archivos con AppButton.
**Referencia de diseño**: NeoButton ya transcribe el CTA del handoff
(`design/rediseno-2026-07/screens/3c.html` L34) con variantes primary/danger/warm/ghost.
**Plan**:
1. Mapear variantes: primary→primary, danger→danger, secondary/ghost→ghost,
   accent→primary (warm según caso).
2. Swap mecánico archivo por archivo empezando por los sheets destructivos
   (destroy-family, member-action, delete-account), donde el danger V1 es más disonante.
3. Conservar props loading/disabled/haptic — verificar paridad de API y agregar lo que
   falte a NeoButton en vez de mantener dos botones.
4. Dejar AppButton solo para pantallas legacy vivas (join, reset-password) y marcarlo
   @deprecated. Pasada visual claro/oscuro por los 11 sheets desde Ajustes.
**Depende de**: nada. G03/G10/G11/G32 lo consumen.

### G23 — TextField V1 dentro de sheets neo: falta la primitiva NeoTextField [alta · M]
**Superficie**: edit-display-name-sheet, category-editor-modal, import-review (filas),
wizard de meta de ahorro (step-1).
**Archivos**: `mobile/components/ui/text-field.tsx`,
`mobile/components/settings/sheets/edit-display-name-sheet.tsx`,
`mobile/components/settings/category-editor-modal.tsx`,
`mobile/components/import-review/import-review-row.tsx`,
`mobile/components/savings-goals/wizard-steps/step-1-title-emoji.tsx`.
**Estado actual**: Sheets con carcasa neo montan el input V1: borde animado line→primary
de la paleta vieja, sin pozo inset, radii V1. No existe un input de texto neo compartido
(el kit wizard solo tiene numpad-field para montos).
**Referencia de diseño**: `design/rediseno-2026-07/handoff-README.md` §inputs (pozo
insetLg, radio 18) + `screens/3c.html` (input well del sheet); numpad-field.tsx ya
implementa la receta para montos.
**Plan**:
1. Crear `ui/neo-text-field.tsx`: pozo neo.well + insetLg + radio neoRadii.input, label
   11/800 uppercase, foco = ringSelected en vez de borde, fallback
   SUPPORTS_INSET_SHADOW.
2. Reusar la solución de placeholder propio de TextField (bug iOS de placeholder
   bottom-aligned).
3. Swap en los 4 callsites neo.
4. Dejar TextField para auth legacy viva y deprecar.
**Depende de**: nada. G09/G10/G17 lo consumen.

### G24 — ErrorState/EmptyState V1 en las 4 vistas neo cuando NeoStateBlock ya existe [alta · S]
**Superficie**: neo-home (error del dashboard y del feed), neo-gastos (error de snapshot
y error duro), neo-fijos (error de carga), alta de gasto (error catálogo / sin
categorías).
**Archivos**: `mobile/components/ui/error-state.tsx`, `mobile/components/ui/empty-state.tsx`,
`mobile/screens/home/neo/neo-home-screen.tsx`, `neo-gastos-screen.tsx`,
`neo-fijos-screen.tsx`, `mobile/screens/home/add-gasto-v2-screen.tsx`.
**Estado actual**: Las ramas de error de las 4 vistas rediseñadas renderizan la card V1
(surfaceMuted + hairline de 1px — anti-patrón neo — + theme.typography). NeoStateBlock
(`mobile/components/ui/neo-state-block.tsx`, promovido desde expense-categories y ya
aprobado en Ajustes) no se retro-aplicó a las vistas.
**Evidencia**: neo-home-screen.tsx:533-543 y :1683-1691; neo-fijos-screen.tsx:777-786;
las ramas del wizard en add-gasto-v2-screen.
**Referencia de diseño**: NeoStateBlock existente (patrón aprobado) +
`design/home-final-2026-07/estados.dc.html`.
**Plan**:
1. Swap ErrorState→NeoStateBlock tone='error' en las 4 vistas (props casi idénticas:
   icon/title/description/actionLabel; mismo copy/acción de refetch).
2. Swap EmptyState→NeoStateBlock en add-gasto-v2 (los estados sin botón propio — el CTA
   vive en el footer del wizard).
3. Cubrir el caso stateKey/ícono del EmptyState en NeoStateBlock si falta; evaluar
   variante con Brot worried (dirección de G13/handoff) como iteración posterior con
   gate.
4. Verificar ambos modos y el fallback Android API<29 (ya resuelto dentro de
   NeoStateBlock). Deprecar ErrorState/EmptyState cuando expenses-history (último caller
   legacy vivo) migre o se retire (G06).
**Depende de**: nada.

### G25 — BlockingScreenView: la superficie de carga global sigue siendo el splash del diseño anterior [alta · S]
**Superficie**: App entera — loading de RequireAuth/RequireGuest, app-stack-shell
(snapshot sin seed), onboarding fallback, family-admin, biometric-setup, y los estados
'processing' de auth-callback/reset-password. Es lo que se revela cuando el splash neo se
desvanece.
**Archivos**: `mobile/components/ui/blocking-screen-view.tsx`,
`mobile/components/guards.tsx`, `mobile/components/root/app-stack-shell.tsx`,
`mobile/screens/shared/blocking-screen.tsx`,
`mobile/screens/auth/neo/neo-biometric-setup-screen.tsx`.
**Estado actual**: Renderiza WarmFernLogo sobre authTokens.welcomeBg (`#0E3A26`, verde
del diseño anterior; palette.ts:291), theme-blind: en light flashea una pantalla verde
oscura vieja entre superficies neo crema. El propio `app/(app)/onboarding.tsx:29` lo
llama 'el launch splash VIEJO' y lo esquiva a mano. Rompe el invariante 4 del rediseño
(superficies idénticas en cada seam): el boot neo es AUTH_SPEC welcomeBg (`#E9EBE0` claro
/ `#0F1E14` oscuro) + FernLogo + BrotParticles.
**Evidencia**: blocking-screen-view.tsx:44/:53; montado en app-stack-shell.tsx:153 y
guards.tsx:41/89; contraste con boot-screen.tsx:62-72.
**Referencia de diseño**: `design/rediseno-2026-07/arranque` + la implementación viva en
`mobile/screens/boot/boot-screen.tsx:62-72` y `neo-launch-splash.tsx`.
**Plan**:
1. Reescribir el cuerpo con la superficie del boot neo: useThemeMode +
   AUTH_SPEC[mode].welcomeBg + FernLogo(palette del spec) + BrotParticles 16 en estático
   (o sin partículas, como NeoLaunchSplash estático, para no duplicar loops) —
   literalmente el mismo trío que boot-screen para que todos los seams queden invisibles.
2. Mantener la firma (prop message ignorada) para no tocar los call sites.
3. Borrar (o dejar — ambas superficies matchean) la rama especial de
   app/(app)/onboarding.tsx que lo esquivaba.
4. Verificar en device los seams: cold start→guard con red lenta, FaceID→home,
   signup→onboarding, splash→blocking→destino sin cambio de color perceptible.
5. Retirar WarmFernLogo/authTokens.welcomeBg si quedan sin consumidores vivos.
**Depende de**: nada; G05 lo necesita para 'exchanging'/'processing'.

### G26 — StepAvatar (grilla de avatares V1) dentro del sheet neo de editar avatar [alta · M]
**Superficie**: edit-avatar-sheet (Ajustes → perfil, vía GlobalSettingsModalsHost). Es el
único de los 11 sheets migrados cuyo cuerpo quedó V1 entero.
**Archivos**: `mobile/components/home/onboarding/step-avatar.tsx`,
`mobile/components/settings/sheets/edit-avatar-sheet.tsx`,
`mobile/components/ui/avatar-animal.tsx`.
**Estado actual**: El ModalCard es skin="neo" pero todo el contenido es StepAvatar del
onboarding viejo: hero creamCard + border line, celdas creamCard/primarySurface,
selección por borde primary V1, y AvatarAnimal con fallback creamCard/creamSoft.
**Referencia de diseño**: `design/rediseno-2026-07/screens/5b.html` (grilla de avatares
sobre tarjetas pastel; también 5e/5f: pedestal + medallón); neoCategoryPastels +
pastelDarkSolid() ya existen en neo-tokens.
**Plan**:
1. Convertir StepAvatar al vocabulario 5b/5e/5f (o crear variante skin): hero del avatar
   elegido como pedestal NeoSurface raisedLg, celdas raisedSm con pastel por avatar
   (pastelDarkSolid en oscuro), selección = ringSelected + selectedTint.
2. Parametrizar backgroundTint de AvatarAnimal con neo.well/neo.selectedTint.
3. Como StepAvatar es compartido, la conversión arregla onboarding y settings a la vez.
4. CTA → NeoButton (G22). Contraste AA del glifo sobre cada pastel (la fórmula de 5b ya
   lo garantiza).
**Depende de**: coordinar con la conversión del onboarding (StepAvatar compartido); G34.

### G27 — BadgeDetailSheet: sheet V1 completo dentro de la galería de logros neo [alta · S]
**Superficie**: `/settings/achievements` al tocar cualquier medalla.
**Archivos**: `mobile/components/achievements/badge-detail-sheet.tsx`.
**Estado actual**: ModalCard sin skin="neo" (cae en 'classic', modal-card.tsx:125) y todo
el contenido con paleta vieja: surfaceMuted/creamCard/line/surfaceStrong/borderStrong/
textSoft + `#FFFBF2` y `#FFFFFF` inline + radii del palette viejo — choca contra la
pantalla huésped ya neo.
**Referencia de diseño**: sin referencia — la galería no está en el handoff; seguir la
fundación skin='neo' de ModalCard y el vocabulario de sheets de la tanda de Ajustes.
**Plan**:
1. `skin="neo"` en el ModalCard.
2. Icon-wrap → NeoSurface raisedSm (earned) / pozo neo.well+insetSm (locked), tintas del
   tier vía tierTone compartido (G14).
3. Textos → neoInk (title 800 Nunito, body neo.textMuted); chip de tier → receta de
   chips del vocabulario (radio 14-22, 11/800 tracking); radii → neoRadii y hexes →
   tokens.
4. Validar contraste de tierTone sobre los fills neo; sanity en el dev preview de logros
   en claro y oscuro.
**Depende de**: G14 (centralización de tierTone) recomendado en el mismo sprint; G22.

### G28 — SwipeRow: panel de acciones y chip 'Procesando' en paleta V1 dentro de las listas neo [media · M]
**Superficie**: Actividad de neo-home (swipe-to-delete; neo-home-screen.tsx:1731-1744),
movimientos de neo-gastos (MovementRow, neo-gastos-screen.tsx:919), filas de neo-fijos
(fijo-row.tsx:283). El resto V1 más visible dentro de las 3 listas vivas.
**Archivos**: `mobile/components/ui/swipe-row.tsx`,
`mobile/components/gastos/gastos-movement-row.tsx`, `mobile/components/fijos/fijo-row.tsx`.
**Estado actual**: La carcasa de cada fila ya es neo (wrappers con background+shadow del
spec, radios 22/26), pero al deslizar se revela el panel V1: botón de acción con
theme.colors.danger saturado (`#C23A2F` claro / `#F06A6A` oscuro — el rojo V1, no el
terracota del sistema) + textOnPrimary, y el chip 'Procesando…' con creamCard +
borderColor line (swipe-row.tsx:379-387, 456-462).
**Referencia de diseño**: sin referencia directa — ni home-final ni gastos-2026-08-v2 ni
fijos-2026-07 dibujan el panel revelado. Vocabulario a usar: el rojo-tierra del propio
sistema (neo.danger/excess `#A84A2F`/`#F3C9BC`, terracota `#C25B33`/`#D97355`; criterio
computeAccent — el owner rechaza colores fuera del sistema).
**Plan**:
1. Definir con el owner el accent del panel danger sobre paleta neo (candidato:
   rojo-tierra/terracota del sistema).
2. Agregar prop `skin?: 'classic' | 'neo'` opt-in a SwipeRow (mismo patrón que
   ModalCard), con tokens desde neoTokens — sin acoplar contextos de área adentro de
   ui/: acción danger = warm/terra + tinta AA por modo, processing chip = pozo insetSm
   sobre neo.well (o NeoSurface raisedSm) sin borde, radio del clip a neoRadii.tile.
3. Pasar skin="neo" desde los 3 consumidores neo (home, gastos, fijos), de a uno con
   flag para no tocar otro sin querer; superficies V1 vivas quedan en classic.
4. Mantener worklets/gestos intactos (React.memo + pan ya calibrados).
5. QA en device claro/oscuro + Android<28 fallback; contraste del label sobre el fill.
**Depende de**: decisión del owner sobre el accent; G06 si la edición de gasto entra como
segunda acción del swipe.

### G29 — Loaders y skeletons V1 en superficies neo: falta la primitiva de carga [media · M]
**Superficie**: neo-home (skeleton del feed de actividad, visible en cold load),
savings-goal, household-setup, plan-tiles de billing, y hasta el paywall del rediseño
(auth-plan-hogar importa SkeletonBox V1).
**Archivos**: `mobile/components/ui/loading-block.tsx`, `skeleton-box.tsx`,
`skeleton-block.tsx`, `skeleton-layouts.tsx`, `mobile/screens/home/neo/neo-home-screen.tsx`,
`mobile/screens/settings/savings-goal-screen.tsx`, `mobile/components/billing/plan-tiles.tsx`,
`mobile/components/redesign/auth/auth-plan-hogar.tsx`.
**Estado actual**: Todos los estados de carga comparten piezas V1: LoadingBlock
(surfaceMuted + border), SkeletonBox (surfaceMuted) y el shimmer de SkeletonBlock tintado
con theme.colors.textMuted/primary — grises viejos sobre el canvas salvia
(neo-home-screen.tsx:1678-1682 vía ListRowSkeleton).
**Referencia de diseño**: sin referencia — el handoff no maqueta estados de carga
(PLAN-CABLEADO.md:127: 'restyle genérico neo en pase aparte. Falta mockup'). Vocabulario:
pozo insetSm/neo.well como base ('el hueco es el vocabulario natural para contenido
pendiente') y shimmer con alpha del neo.surface / par raisedGradient.
**Plan**:
1. Crear `ui/neo-skeleton.tsx` (placa insetSm sobre neo.well + shimmer sutil) y
   NeoLoadingBlock (NeoSurface + spinner tinta neoInk.muted) — o exponerlos como
   skin/prop en skeleton-box/block para no tocar el resto de la app.
2. Portar skeleton-layouts (hero/métricas/filas) a la primitiva nueva.
3. Swap en neo-home, savings-goal, household-setup, plan-tiles y auth-plan-hogar (y en
   las otras vistas neo que usen ListRowSkeleton).
4. Respetar reduced-motion (colapsa deviceYearClass<2020, patrón de BrotParticles).
   Deprecar los V1 cuando expenses-history migre.
**Depende de**: nada.

### G30 — SegmentedControl V1 en el corazón de Ajustes neo y en household-setup [media · M]
**Superficie**: `/settings` (Apariencia/Idioma/Animaciones — secciones 9, 9b y 10, 4 usos
tipados) y `/household-setup` paso 2 (modo de buffer). El único control interactivo del
root que quedó V1.
**Archivos**: `mobile/components/ui/segmented-control.tsx`,
`mobile/screens/settings/settings-screen.tsx`, `household-setup-screen.tsx`.
**Estado actual**: Pista surfaceMuted + borde, píldora con buildElevationStyle (sombras
viejas), radios 14/10 y tipografía del palette viejo — un parche mate dentro de los
SettingsGroup neo.
**Referencia de diseño**: sin referencia exacta — vocabulario análogo: toggle
Mensual/Anual de 4m.html (pista hundida insetSm + segmento activo raisedSm) y los tiles
de frecuencia de 3c.html.
**Plan**:
1. Crear NeoSegmented (o skin neo en el mismo archivo, patrón ModalCard): pista =
   neo.well + insetSm radio 18, píldora activa = raisedSm con boxShadow del vocabulario,
   labels Nunito 700/13 neo.text/textMuted.
2. Mantener la API genérica `<T>` options/value/onChange y la animación translateX
   existente (transform-only, se conserva).
3. Swap en los 4 usos de settings + household-setup; join-screen (legacy viva) queda con
   la V1 hasta su propia migración (G04).
4. Fallback SUPPORTS_INSET_SHADOW (borde 1px); verificar en Android viejo (gotcha
   boxShadow API<28).
**Depende de**: nada. G11 lo consume.

### G31 — ScreenHeader: back pill y subtítulo V1 sobre todas las pantallas neo con header [media · S]
**Superficie**: Header custom de toda pantalla con title/canGoBack: las 12 de Ajustes
neo, savings-goal, household-setup, admin, ediciones, about, expense-filters,
expense-categories…
**Archivos**: `mobile/components/ui/screen-header.tsx`, `mobile/components/ui/screen.tsx`.
**Estado actual**: Back pill con theme.colors.surface + theme.colors.border + borde 1px +
radii.pill (screen-header.tsx:49-50 — el neo separa con sombra, no con borde), flecha
MaterialIcons con theme.colors.text (:55), subtítulo theme.colors.textMuted (:71), ripple
sobre theme.colors.text (:40). Las pantallas neo lo parchean a medias pasando titleColor
(settings-screen.tsx:993) pero el pill y el subtítulo no son parcheables por prop.
**Referencia de diseño**: auth-spec backBackground/backShadow +
`design/rediseno-2026-07/screens/5a.html` (headers con circulito relieve, sin borde);
alternativamente neoMaterial(mode,'raisedSm').
**Plan**:
1. Darle a ScreenHeader una piel neo (skin opt-in, o auto por defecto si es viable): back
   pill 40px con neoMaterial raisedSm o el par backBackground/backShadow de AUTH_SPEC,
   radio 18-22, sin borderWidth.
2. Tinta título/subtítulo vía neoInk (niveles 1 y 3); estado pressed = swap a insetSm
   (patrón del FAB) en vez de opacity 0.82.
3. Reemplazar la flecha MaterialIcons por el chevron del kit neo; propagar desde Screen o
   activar por pantalla.
4. Limpiar los titleColor manuales de los callers; pasada por las pantallas con rightSlot
   (ediciones) para verificar alineación.
**Depende de**: nada.

### G32 — CancelDeletionBanner (+ variante welcome) en piel V1 sobre 4 superficies neo [media · S]
**Superficie**: neo-home (precedencia máxima, arriba del header;
neo-home-screen.tsx:553-558), settings root, neo-welcome y neo-login (estado: eliminación
programada). Estado raro de ver, pero cuando aparece es EL elemento de la pantalla — y es
exactamente el momento donde la app debe verse cuidada.
**Archivos**: `mobile/components/common/cancel-deletion-banner.tsx`,
`mobile/components/common/welcome-cancel-deletion-banner.tsx`.
**Estado actual**: Banner con surfaceMuted + borde theme.colors.danger + tinta
text/textMuted V1, con AppButton adentro; no descartable (decisión de seguridad).
**Referencia de diseño**: `design/home-final-2026-07/PLAN-CABLEADO.md:115` (G1: 'card
raise + borde `#C96F3F`', slot encima del header — el warm/terracota del sistema, no
theme.colors.danger). Sin mockup dedicado. Receta interna: el warningCard de
`delete-account-screen.tsx:449-456` (pozo neo.well + insetMd + borde ink.danger).
**Plan**:
1. Reestilar ambos banners: neoMaterial raisedMd radio 24 (o la receta warningCard),
   acento de alerta en el warm/terracota `#C96F3F`, tinta neoInk, título Nunito 800.
2. CTA → NeoButton danger/ghost (G22).
3. Mantener countdown, mutación de cancelación y la no-descartabilidad tal cual.
4. Un solo componente compartido para home y settings (ya lo es — solo restylear); QA
   claro/oscuro sobre las 4 superficies.
**Depende de**: G22.

### G33 — FreePeriodNudge (banda de trial) en paleta vieja dentro de la Home neo [media · S]
**Superficie**: Home → banda entre header y hero para todo usuario con trial ≤7 días
(neo-home-screen.tsx:559-564) — estado frecuente (cada día del trial de toda cuenta
nueva); CTA → settings/plan.
**Archivos**: `mobile/components/billing/free-period-nudge.tsx`.
**Estado actual**: Card con theme.colors.primarySurface (≤6 días) / creamCard (7+) +
borde theme.colors.border + CTA pill theme.colors.primary con texto creamCard — clashea
contra el canvas salvia `#DCDFCD` y las cards del spec. Tipografía 12/9 fuera de la
jerarquía neoInk. El re-skin ya estaba ordenado por el cableado y no se ejecutó.
**Referencia de diseño**: `design/home-final-2026-07/PLAN-CABLEADO.md:116` (G2: 'banda
raise entre chips row y hero'; compliance: nunca decir 'gratis/prueba'). Sin mockup
propio.
**Plan**:
1. Re-skin en el mismo archivo: neoMaterial raisedSm/raisedMd (o
   cardBackground+cardShadow del HOME_SPEC) + radio 18-24, jerarquía neoInk.
2. CTA como pill verde del vocabulario (ctaGreenPillGradientCss) con boxShadow cta y
   Nunito 800; ícono en tile pastel (tintTile del accent).
3. Estado urgente (≤2 días) con accent de status (computeAccent) en vez del swap
   primarySurface/creamCard.
4. Verificar la posición 'banda entre chips row y hero' que pide el cableado (hoy se
   monta tras CancelDeletionBanner).
5. Gate, copy y dismiss por sesión LITERALES (compliance 3.1.2: 'acceso completo', jamás
   'gratis/prueba'); verificar si se comparte con Settings→Plan para no partir el estilo.
**Depende de**: nada.

### G34 — AvatarAnimal: defaults V1 (wash crema + silueta verde vieja) sobre superficies neo [media · S]
**Superficie**: Chip 'Miembros · N' del header de neo-home (:1081-1097), avatar del autor
en las cards de Notificaciones neo (notif-screen.tsx:153-159), member-action-sheet.
**Archivos**: `mobile/components/ui/avatar-animal.tsx`, `mobile/components/ui/avatar.tsx`,
`mobile/screens/home/neo/neo-home-screen.tsx`,
`mobile/components/redesign/notifications/notif-screen.tsx`,
`mobile/components/settings/sheets/member-action-sheet.tsx`.
**Estado actual**: El componente es prop-driven pero sus defaults son V1: fondo
theme.colors.creamCard/creamSoft (avatar-animal.tsx:62-64) y silueta con tints
hardcodeados pre-rediseño (`#297811` primary-800 / `#F2EAD3` cream;
avatar-animal.tsx:31-34). Los callsites neo no pisan tint/backgroundTint: la neo-home
pasa ringColor del spec pero no backgroundTint, aunque HOME_SPEC define
memberAvatarA/B (`#DDEBDD`/`#F6D9D2` claro; home-spec.ts:241-242/:396-397) que el kit usa
para los círculos mock. Avatar (iniciales) usa fontWeight 700 SIN nunitoFamily
(avatar.tsx:75).
**Referencia de diseño**: `design/rediseno-2026-07/screens/5b.html` (+5bo, medallones
pastel) + memberAvatarA/B ya transcriptos en home-spec; pastelDarkSolid() en neo-tokens.
**Plan**:
1. Cambiar los defaults a neo: fondo pastel neutro del tema (neo.surface o pastel por
   slug), silueta neo.greenDeep en claro / neo.text en oscuro; verificar los callsites
   legacy vivos que dependan del default (family-admin, billing) — pasan tokens
   explícitos si necesitan la V1.
2. En el memo membersChip de neo-home, pasar backgroundTint alternando
   HOME_SPEC[mode].memberAvatarA/B por índice (criterio del mockup); fallback de
   iniciales con tintTile 18%/14% si el color del miembro rompe el pastel.
3. En NotifCard, definir el medallón en notif-spec.ts (claro literal de 5b; oscuro vía
   pastelDarkSolid) y pasar tint/backgroundTint explícitos — la API ya los acepta.
4. Avatar (iniciales): fontFamily nunitoFamily('800') conservando el color del miembro.
5. Gate de contraste de silueta/iniciales sobre el pastel elegido (5b garantiza ≥7.7:1);
   QA en el preview dev redesign-notif con VMs demo con autor.
**Depende de**: nada.

### G35 — RequireReauthSheet + PinPad: la capa de seguridad sin piel neo [media · S]
**Superficie**: Root de Ajustes (acciones protegidas), `/savings-goal` (borrar meta),
`/settings/delete-account` (paso PIN, :670) — el sheet de reautenticación aparece encima
de pantallas neo cada vez que una acción sensible pide FaceID/PIN.
**Archivos**: `mobile/components/auth/require-reauth-sheet.tsx`,
`mobile/components/auth/pin-pad.tsx`.
**Estado actual**: ModalCard sin skin neo + contenido con theme.colors
(textMuted/primaryStrong/danger). PinPad con teclas theme.colors.surfaceMuted flat y dots
theme.colors.text — sin material neo, contrastando con NumpadGrid que ya existe en neo.
**Referencia de diseño**: sin referencia — seguir la receta de los sheets neo de
settings/sheets/; para el pad: `mobile/components/ui/numpad-grid.tsx` (patrón directo) o
auth-digit-pad del kit redesign (ya usado en neo-pin-setup/neo-pin-lock).
**Plan**:
1. `skin="neo"` en el ModalCard de reauth; tintas → neoInk (danger del lockout =
   ink.danger, que ya resuelve el AA claro); CTA con material cta.
2. PinPad: restylear con la receta de NumpadGrid (teclas raisedSm radio 18, press =
   insetSm, glyphs Nunito 800 neo.text; dots del PIN → pozos insetSm que se llenan con
   ink.accent) — o directamente reemplazarlo por auth-digit-pad en reauth y
   delete-account.
3. Cuidar que PinPad se usa también en el flujo de auth (unlock) — verificar ambos
   contextos en claro/oscuro.
4. Probar biometría→fallback PIN→lockout en device (borrar cuenta, cambiar contraseña).
**Depende de**: conviene junto con G22 (AppButton del sheet); mismo sprint recomendado
para las dos piezas.

### G36 — AmbientBackdrop/AmbientBlobs: glows de la paleta vieja tiñendo fondos neo [media · S]
**Superficie**: AmbientBackdrop en 5 pantallas neo de Ajustes (settings, about,
billing/plan, delete-account, household-setup); AmbientBlobs en savings-goal (L121/L306),
billing y asistente-preferences.
**Archivos**: `mobile/components/ui/ambient-backdrop.tsx`,
`mobile/components/home/ambient-blobs.tsx` + las pantallas listadas.
**Estado actual**: Los glows ambient de la piel vieja (withAlpha sobre
theme.colors.primary/success/warning) y los blobs aurora (theme.colors.auroraA/B/C +
forest V1 `#2B5641`/`#1C3A29`; ambient-blobs.tsx:30-74) tiñen el fondo neo en claro. El
vocabulario de ambiente del rediseño son las partículas (BrotParticles/CardParticles),
no glows con la paleta vieja.
**Referencia de diseño**: `design/rediseno-2026-07/handoff-README.md` §Partículas; no
existe maqueta de glows — decisión: retirarlos o retintarlos.
**Plan**:
1. Decisión con el owner: quitar los backdrops de las pantallas neo (el material neo ya
   da profundidad; partículas si quiere textura) o retintar los glows con
   neo.green/neo.warm a las mismas alfas (preset neo para el tono aurora, o colores por
   prop desde las pantallas).
2. Aplicar en las pantallas listadas.
3. Si se retira: dejarlo solo en pantallas legacy vivas (join, expenses-history) y marcar
   el destino final de ambos componentes.
**Depende de**: decisión del owner.

### G37 — CaptchaModal: backdrop negro genérico del vendor y spinner sin tinta [media · S]
**Superficie**: Modal de CAPTCHA en login / signup / forgot-password (las 3 pantallas neo
vivas) — takeover fuera del vocabulario en el primer contacto.
**Archivos**: `mobile/components/auth/captcha-modal.tsx`.
**Estado actual**: Solo pasa siteKey/baseUrl/size/theme/showLoading/onMessage
(captcha-modal.tsx:89-99). Quedan en default dos seams del upstream: (a)
`backgroundColor` del Modal — 'rgba(0, 0, 0, 0.3)'
(@hcaptcha/react-native-hcaptcha/index.js:243), inyectado también como fondo del body del
WebView al abrir el desafío (Hcaptcha.js:294); (b) `loadingIndicatorColor` — null →
spinner con color de sistema (Hcaptcha.js:375). Sobre el canvas Salvia cae un velo negro
30% con spinner gris, cuando el scrim del rediseño es sólido `neo.scrim`
(`#B9BEAC`/`#0A130D`) a alpha 0.84 (modal-card.tsx:104 NEO_SCRIM_ALPHA y :310;
neo-tokens.ts:160/194). El prop `theme` sí es correcto.
**Referencia de diseño**: sin referencia directa (el handoff no dibuja el takeover del
captcha); el scrim canónico está en 3c.html L31-33/L87-89 (transcrito en ModalCard
skin='neo').
**Plan**:
1. Resolver el modo y pasar `backgroundColor={withAlpha(neo.scrim, 0.84)}` mode-aware —
   exportar NEO_SCRIM_ALPHA desde modal-card (o promoverlo a neo-tokens).
2. `loadingIndicatorColor` con tinta del sistema (neoInk(mode).accent o neo.text).
3. Verificar EN DEVICE (el simulador no corre por ML Kit) que la inyección del color al
   body del WebView no produzca doble velo ni haga ilegible el widget — claro y oscuro en
   los 3 lanzadores.
4. Evaluar el seam restante: `theme` acepta objeto custom (normalizeTheme,
   Hcaptcha.js:39-57) que permitiría tintar la tarjeta del widget con la paleta Salvia —
   ANTES de invertir, confirmar si los custom themes requieren plan Enterprise de
   hCaptcha; si lo requieren, quedarse con 'dark'/'light'.
5. QA de cierre: captcha configurado + sin configurar (retorno null silencioso) en
   signup, login y forgot.
**Depende de**: verificación solo en device físico; necesita
EXPO_PUBLIC_HCAPTCHA_SITE_KEY configurada para ver el takeover real.

### G38 — SectionHeader V1 en notifications-preferences y household-setup [baja · S]
**Superficie**: `/settings/notifications` (4 headers) y `/household-setup` (5 headers).
**Archivos**: `mobile/components/ui/section-header.tsx`,
`mobile/screens/settings/notifications-preferences-screen.tsx`,
`household-setup-screen.tsx`.
**Estado actual**: Headers con theme.colors.text (`#12211A`) y textMuted (`#3B6D57`) —
tintas V1 distintas de neo.text (`#24382A`)/neo.textMuted (`#6C7B67`) — y estilo
sectionTitle 22/800 en vez del patrón eyebrow 11/800 mayúsculas con tracking del resto de
Ajustes. Dos jerarquías de sección conviven en la misma área.
**Referencia de diseño**: patrón eyebrow implementado en
`settings-grouped-list.tsx:91-93` (origen: screens/3c.html).
**Plan**:
1. Decidir: migrar SectionHeader a neoInk conservando título+subtítulo (Nunito 800 +
   body neo.textMuted), o reemplazar los usos por el eyebrow de SettingsGroup (extraerlo
   a ui/ si sigue inline en settings-primitives).
2. En notifications-preferences las filas ya son primitivas raisedLg → probablemente
   basta migrar la tinta del header.
3. Verificar que ninguna otra área dependa del look viejo antes de tocarlo global (tiene
   consumidores fuera de settings); deprecar junto con expense-history.
**Depende de**: G11 (household-setup lo absorbe si se hace primero).

### G39 — BrandedPanel (gradiente V1 con expo-linear-gradient) [baja · S]
**Superficie**: household-setup (pantalla neo), y las legacy vivas join, auth-callback y
expenses-history.
**Archivos**: `mobile/components/ui/branded-panel.tsx`,
`mobile/screens/settings/household-setup-screen.tsx`.
**Estado actual**: Panel con LinearGradient de expo sobre
theme.colors.primarySurface/surfaceMuted/warning — doble violación (gradiente fuera de
cssGradient + paleta V1) dentro de una pantalla ya migrada.
**Referencia de diseño**: NeoSurface (`mobile/components/ui/neo-surface.tsx`) cubre el
caso: raisedLg con raisedGradientCss vía cssGradient().
**Plan**:
1. En household-setup, reemplazar por NeoSurface variant='raisedLg' (o 'hero' para el
   panel protagonista) — entra por G11.
2. Dejar BrandedPanel para join/auth-callback/expenses-history hasta que sus áreas
   migren (G04/G05/G06).
3. Al morir el último caller, borrar BrandedPanel y ui/card.tsx (su único consumidor).
**Depende de**: G04, G05, G06, G11.

### G40 — RootErrorBoundary: pantalla de crash con hexes pre-rediseño, sin dark mode y sin Nunito [baja · S]
**Superficie**: App entera (error de render no capturado) — la última red de seguridad,
quedó fuera de las dos migraciones de piel.
**Archivos**: `mobile/components/root/root-error-boundary.tsx`.
**Estado actual**: Fondo `#FDFCF9`, tinta `#0F2A1E`, botón pill sólido, fuente de
sistema. En dark mode flashea una pantalla clara.
**Referencia de diseño**: sin referencia — hay que diseñar. Base: NeoStateBlock a
pantalla completa sobre neo.bg + Brot en pose de disculpa.
**Plan**:
1. Mantenerlo class component pero leer el modo con Appearance.getColorScheme() (está
   FUERA de AppProviders — no puede usar useAppTheme).
2. Pintar neo.bg + neoInk + botón con la receta de NeoButton inline (sin hooks); Nunito
   vía nunitoFamily().
3. Probar forzando un throw en dev.
**Depende de**: nada.

---

## Categoría D — Shell y navegación

### G41 — Canvas del shell + default de Screen anclados al tema V1: seams y flashes sistemáticos [alta · M]
**Superficie**: Todo frame de transición del stack (push/pop, primer attach de cada tab,
crossfades de /(auth)), el default de `<Screen>`, el overlay de privacidad de
multitasking, el backdrop del paywall duro y el lienzo de carga de trial-welcome. El
'tema viejo entre pantallas' es sistemático, no puntual: el 100% de las pantallas vivas
pinta el canvas neo (`#DCDFCD` claro / `#0F1A13` oscuro) mientras el shell entero pinta
el V1 (`#F4F2ED` / `#12211A`, y `#0A0F0C` en tabs dark).
**Archivos**: `mobile/components/navigation/app-tabs.tsx`,
`mobile/components/root/app-stack-shell.tsx`, `mobile/components/root/root-layout-shell.tsx`,
`mobile/components/ui/screen.tsx`, `mobile/components/root/background-snapshot-overlay.tsx`,
`app/(auth)/_layout.tsx`, `mobile/components/billing/subscription-gate.tsx`,
`mobile/screens/home/trial-welcome-screen.tsx`.
**Estado actual / Evidencia**: app-tabs.tsx:273-274 (`sceneStyle` → DARK_TAB_CANVAS /
theme.colors.background); app-stack-shell.tsx:200 y root-layout-shell.tsx:267 (ThemedRoot)
+ :296 (Stack raíz) → theme.colors.canvas; screen.tsx:348 default
`backgroundColor ?? theme.colors.background` y :424 (veil del ScreenEdgeEffect hereda el
default — hoy toda pantalla neo pasa s.bg a mano); (auth)/_layout contentStyle con
theme.colors.canvas expuesto en cada crossfade (`#F4F2ED` vs `#DCDFCD`, se nota en
claro); background-snapshot-overlay hardcodea `#12211A`; subscription-gate usa
theme.colors.canvas detrás del paywall neo (flash crema durante el fade del Modal);
trial-welcome usa theme.colors.background mientras resuelve el entitlement.
**Referencia de diseño**: los tokens ya existen — `mobile/theme/neo-tokens.ts:153/187`
(bg), espejo de HOME_SPEC.bg y de AUTH_SPEC[mode].bg para /(auth). Decisión técnica, no
de diseño.
**Plan**:
1. Definir el canvas del shell en un solo lugar: `neoTokens(mode).bg` (o helper
   `neoCanvas(isDark)`) — alternativa mayor a consensuar: que theme.colors.canvas pase a
   alias del bg neo en palette.ts (un solo cambio, audita a TODOS los consumidores,
   afecta pantallas legacy restantes).
2. app-tabs sceneStyle, app-stack-shell contentStyle, ThemedRoot y el Stack raíz → ese
   token (DARK_TAB_CANVAS queda solo en pantallas viejas de rollback); actualizar los
   docblocks anti-flash que citan los hexes viejos.
3. (auth)/_layout contentStyle → AUTH_SPEC[mode].bg (el fondo de login/signup/forgot; el
   fade tapa la diferencia con welcome).
4. background-snapshot-overlay, subscription-gate y trial-welcome → neo.bg del modo
   activo.
5. Flip del default de Screen (y del veil del edge effect) a neo.bg — ANTES, barrer los
   consumidores vivos que dependen del default V1 (garden, coach, expenses-history) y por
   pantalla: o reciben su swap neo (sus gaps) o se les fija el V1 explícito temporalmente
   para no cambiarles el look sin aprobación. `backgroundColor` queda como override para
   superficies brand-fixed (auth). Después, borrar el paso manual de s.bg donde el
   default ya coincide.
6. QA en device claro+oscuro: primer attach de cada tab, push/pop de Settings, modales
   add-*, crossfade welcome→login, fade del gate y redirect de trial-welcome — sin frame
   de color ajeno entre capas (root → stack → screen).
**Depende de**: coordinar el flip del default de Screen con G01/G02/G06 (dueños de las
pantallas que hoy dependen del default V1); decisión del owner si canvas cambia
globalmente.

---

## Categoría E — Vocabulario Brot y partículas faltantes

### G42 — Brot ausente de toda el área Asistente [media · M]
**Superficie**: Pantalla Asistente: header, empty state ('Todo en orden'), loading. El
handoff define a Brot como 'la mascota/asistente' y no aparece justamente en la pantalla
que ES el asistente, mientras Home, Control, Fijos y Jardín neo ya lo montan.
**Archivos**: `mobile/screens/home/asistente-screen.tsx`,
`mobile/components/brot/brot-mascot.tsx`.
**Estado actual**: Header minimal (título + pill de impacto), EmptyState = disco
selectedTint con MaterialIcons 'check' genérico (L903-917), LoadingState =
ActivityIndicator nativo (L934). Cero import de BrotMascot.
**Referencia de diseño**: parcial — `handoff-README.md` L4 y L99-100 (patrón empty 7b en
screens/7b.html), `design/gastos-2026-08-v2/README.md` L120 ('Brot es asistente: su pose
deriva del estado del componente'). No hay mockup del chat — la ubicación en el header
hay que diseñarla.
**Plan**:
1. Empty state: replicar el patrón 7b (pedestal raised + pozo insetMd + BrotMascot
   pose='zen' + chip hundido con dot verde), reusando el markup del empty de
   neo-notifications como base.
2. Loading: Brot pose='think' + copy 'Revisando tu ciclo…' (o skeleton de 2 cards con
   insetSm), respetando reduced motion.
3. Header: boceto rápido para el owner — Brot peek asomado al borde o coach chico junto
   al título con la burbuja del impacto agregado; no tocar hasta el visto bueno por el
   gate de réplicas.
4. Derivar pose del estado real (señal crítica → worried; solo refuerzos → cheer; vacío
   → zen) con un helper análogo a derive-brot-pose de Home.
**Depende de**: gate del owner para el header; poses ya existen.

### G43 — Cierre de semana sin el Brot cheer 150px protagonista del handoff [media · S]
**Superficie**: Takeover Cierre de semana (auto-bridge + banner del jardín). El takeover
ya es neo.
**Archivos**: `mobile/components/garden/week-close-celebration.tsx`.
**Estado actual**: neoTokens('dark') anclado con AA documentado, cssGradient del hero,
chip insetSm, CTA con sombra cta — pero el centro de la composición del handoff (Brot
pose cheer a 150px entre el chip y la fila de días) no existe: solo la fila de 7 Sprout
(ferns/stickers).
**Referencia de diseño**: `design/rediseno-2026-07/screens/3g.html` líneas 250-324
(bloques CIERRE DE SEMANA claro y oscuro).
**Plan**:
1. Insertar BrotMascot pose='cheer' size 150 entre el chip y brotesZone, con entrada
   ligada al spring `pop` existente.
2. Evaluar con el owner el swap Sprout→mini-Brots 32 en la fila L→D (mismo dilema
   stickers-vs-Brot que el grid del jardín — resolver junto a G02).
3. Reacomodar brotesZone/padding para que el cheer no empuje el CTA fuera de pantallas
   chicas (maxWidth 360 ya existe).
4. QA en device: reduced-motion (t.value=1 directo); el análisis AA ya cubre las tintas.
**Depende de**: decisión del owner stickers vs mini-Brots (junto a G02).

### G44 — Ediciones sin el Brot zen al pie que pide el handoff [baja · S]
**Superficie**: Ajustes → Ediciones (historial de ciclos cerrados). La pantalla ya está
convertida a neo.
**Archivos**: `mobile/screens/settings/editions-screen.tsx`.
**Estado actual**: El handoff especifica Brot 'zen' (~110px) al pie con la línea 'Cada
ciclo cerrado queda en paz.' y la pantalla no monta BrotMascot en absoluto (grep 'Brot' =
0 resultados).
**Referencia de diseño**: `design/rediseno-2026-07/screens/3h.html` +
`handoff-README.md` L83/L129.
**Plan**:
1. Bloque centrado al final del scroll con BrotMascot pose='zen' (~64-110px, animated
   gateado por foco/reduced-motion como en el kit de Control).
2. Caption con la copy del handoff vía i18n (key nueva ES+EN) — correr la suite de tests
   por el copy nuevo (el env de test fuerza 'es').
3. Respetar el patrón de RiseView con delay del resto de la pantalla; comparar contra
   3h.html claro/oscuro.
**Depende de**: nada — BrotMascot ya expone la pose zen. Las tintas inline de la misma
pantalla van por G51.

### G45 — Brot ausente en el tope de la Home (peek del hero / header) — desvío del owner a re-confirmar [baja · S]
**Superficie**: Home → header y hero de saldo.
**Archivos**: `mobile/components/redesign/home/home-screen.tsx`.
**Estado actual**: El handoff original pide Brot pose peek asomado al borde superior del
hero (`rediseno-2026-07/handoff-README.md:77`) y el handoff final lo reubica como Brot
46px junto al saludo (`home-final-2026-07/README.md:42`). El kit no rinde ninguno:
comentario en home-screen.tsx:294-295 — 'Brot removido del header (pedido del owner
2026-07-21): solo el saludo; el Brot de la tarjeta de rachas es suficiente'. Es una
deviación DOCUMENTADA del owner, no un olvido — se reporta porque contradice ambos
handoffs escritos.
**Referencia de diseño**: las dos referencias existen pero están superseded por decisión
verbal del owner.
**Plan**:
1. NO accionar sin re-confirmar con el owner.
2. Si quiere volver: slot BrotMascot pose='peek' size≈46 asomado al borde superior del
   hero (absolute, detrás del heroTopRow), gateado por reduced-motion; alternativa menor:
   restaurar el Brot 46 del header según home-final.
3. En cualquier caso, actualizar el comentario de decisión en el kit y el README del
   handoff para que dejen de divergir.
**Depende de**: decisión del owner.

---

## Categoría F — Transversales

### G46 — Contraste AA: neo.textMuted claro 3.32:1 — texto secundario de toda la app neo falla en tema claro [alta · M]
**Superficie**: Eyebrows 11px, helpers 12px, footers, values, HeroStat labels, hints —
uso masivo en Ajustes y en todas las áreas que heredan el token.
**Archivos**: `mobile/theme/neo-tokens.ts`,
`mobile/components/settings/settings-grouped-list.tsx`, `settings-primitives.tsx`.
**Estado actual**: neo.textMuted claro `#6C7B67` sobre neo.bg `#DCDFCD` = **3.32:1** y
sobre neo.well `#E9EBE0` = 3.73:1 — bajo el 4.5:1 de AA para texto de 11-12px. En oscuro
pasa (6.93:1). Además neo.danger claro como texto = 3.20:1 (mitigado en settings vía
ink.danger `#A84A2F` 4.2:1, pero el token pelado sigue disponible) y tierTone gold claro
`#9E7C12` = 2.90:1. Confirma la advertencia arrastrada del rediseño; la app pre-rediseño
era AA-clean (auditoría 2026-06-24).
**Referencia de diseño**: `handoff-README.md` define las tintas — el fix es de token, no
de pantalla.
**Plan**:
1. Decisión de token con el owner: oscurecer neo.textMuted claro a ~`#5C6B57` (≥4.6:1
   sobre bg) o introducir neo.textMutedStrong para tamaños <13px y dejar el actual solo
   para ≥18px/bold.
2. Aplicar en neo-tokens.ts (un solo lugar — todas las áreas lo heredan).
3. Revisar visualmente que los heros verdes no se laven (heroTextSoft es otro token, no
   se toca).
4. Correr una pasada de contraste sobre los pares del audit (script rápido) y actualizar
   la nota de la auditoría WCAG.
5. tierTone gold claro → oscurecer si se usa como texto (G14).
**Depende de**: decisión del owner sobre el valor (afecta a TODAS las áreas neo).

### G47 — Nunito faltante: texto con fontWeight sin fontFamily cae a SF Pro/Roboto [media · M]
**Superficie**: 8 pantallas de Settings (achievements: ringCount 34/800, heroPct 30/800;
family-admin, delete-account, editions, asistente, savings-goal, admin, root — chips del
hero, reserveAmount 28/800), las 6 escenas del Wrapped (grep nunitoFamily vacío),
avatar.tsx:75.
**Archivos**: `mobile/screens/settings/*.tsx` (los 8 listados),
`mobile/components/wrapped/scenes/detail-styles.ts` + `closing-styles.ts`,
`mobile/components/ui/avatar.tsx`.
**Estado actual**: RN no hereda fontFamily global: todo estilo local con solo
fontSize/fontWeight renderiza en la fuente del sistema. Los componentes migrados
(settings-grouped-list, settings-primitives, modal-card neo, neo-button) sí ponen
nunitoFamily(); los estilos locales de las pantallas no — números grandes y labels quedan
en SF Pro al lado de filas Nunito.
**Referencia de diseño**: `handoff-README.md` (Nunito 400-900, números 900 con
letter-spacing negativo).
**Plan**:
1. Pasada mecánica: `fontFamily: nunitoFamily(peso)` en cada estilo local con fontWeight
   en los archivos listados.
2. Números protagonistas → 900 con letter-spacing negativo según el handoff.
3. Regla ESLint local (precedente: la regla de useReducedMotion) que marque fontWeight
   sin fontFamily en mobile/screens y mobile/components.
4. Ojo CountUpText: verificar que la prop style con family llega al TextInput animado.
**Depende de**: nada.

### G48 — Fallbacks Android de sombras inset: faltantes o con token viejo [media · S]
**Superficie**: RN 0.81 descarta boxShadow inset EN SILENCIO en Android < API 29 (outset
< API 28). (a) Notificaciones neo NO tiene el fallback: chipBackground/checkBackground/
emptyWellBackground son undefined en claro (notif-spec.ts:70,81,91) y el elemento se lee
SOLO por su sombra — el chip 'N pendientes', el check circular (target del único gesto de
la vista) y el pozo del empty desaparecen. (b) 7 sheets de Control/Home aplican bien el
patrón SUPPORTS_INSET_SHADOW pero el borde de reemplazo toma theme.colors.border V1 en 9
puntos. (c) admin dibuja borderWidth 1 SIEMPRE sobre cardMaterial sin gatear.
**Archivos**: `mobile/components/redesign/notifications/notif-screen.tsx` + `notif-spec.ts`;
`mobile/components/control-v2/daily-goal-sheet.tsx` (:189/:322),
`savings-goal-quick-edit-sheet.tsx` (:95), `neo-field.tsx` (:94),
`member-warning-sheet.tsx` (:94), `fixed-expense-quick-edit-sheet.tsx` (:83),
`add-fixed-quick-sheet.tsx` (:177), `mobile/components/home/quick-add-savings-sheet.tsx`
(:234/:406); `mobile/screens/settings/admin-screen.tsx`.
**Referencia de diseño**: patrón canónico interno —
`mobile/components/wizard/inset-shadow-support.ts` (SUPPORTS_INSET_SHADOW → hairline) y
`month-close-decision-sheet.tsx:189-199` (fallback 100% con tokens neo:
neo.sheetDivider/neo.green); esta misma área lo usa bien en
permission-prime-sheet.tsx:133-139.
**Plan**:
1. Notificaciones: importar SUPPORTS_INSET_SHADOW, agregar a NOTIF_SPEC un token de
   hairline por modo (equivalente a neo.sheetDivider) y aplicar borderWidth:1 en
   NotifCheck, NotifMetaRow/emptyChip y emptyWell cuando no hay soporte inset.
2. Reemplazo mecánico theme.colors.border → neo.sheetDivider en los 9 puntos (y quitar
   useThemeTokens donde quede solo para eso).
3. admin: condicionar el borde a !SUPPORTS_INSET_SHADOW.
4. Unificar en un helper `flatFallback(neo, selected?)` junto a SUPPORTS_INSET_SHADOW
   para que el próximo sheet no repita el error.
5. QA forzando el flag a false + emulador Android API 28 (memoria: boxShadow se cae
   silencioso).
**Depende de**: nada.

### G49 — Alert.alert nativos en flujos neo (wizard de gasto, menú del Asistente, errores del dispatcher) [media · M]
**Superficie**: (a) Alta de gasto paso 2 — el fallo de submit muestra Alert.alert del
sistema sobre la hoja neo, duplicando el submitError inline que el wizard YA persiste
(WizardFooterHelper). (b) Asistente — long-press en card: '¿Por qué veo esto?' /
'Silenciar familia' con doble Alert anidado (asistente-screen.tsx L233-278). (c) Errores
de acciones del asesor (open-external-url, sub-usage-answer, sub-usage-cancel) en Alert
nativo (use-control-action-dispatcher.ts L345/389/416).
**Archivos**: `mobile/screens/home/add-gasto-v2-screen.tsx`,
`mobile/screens/home/asistente-screen.tsx`,
`mobile/features/insights/use-control-action-dispatcher.ts`.
**Estado actual**: El propio rediseño ya fijó el patrón: 'el Alert.alert de UN botón es
el toast del rediseño' (expense-categories-screen.tsx:134-139); el resto del área
resuelve confirmaciones con sheets skin='neo' y avisos con toast-bus.
**Referencia de diseño**: patrón establecido en código (toast-bus + WizardFooterHelper);
para el menú contextual, sin referencia — diseñar un action-sheet neo chico (ModalCard
skin='neo' + tiles raisedSm, patrón 3c de sheet de opciones sobre scrim).
**Plan**:
1. Wizard de gasto: Alert.alert → toast.error(message) (host global, sobrevive al
   unmount); conservar el submitError inline anclado a formKey. Revisar que add-income
   no repita el patrón (misma familia de wizard) y alinearlo en el mismo cambio.
2. Crear AsesorContextSheet (ModalCard skin='neo', inline-capable como los del host):
   fila '¿Por qué veo esto?' que expande la explicación en el mismo sheet con Brot
   pose='think', fila destructiva 'Silenciar esta familia' y cancelar; cablearlo al
   long-press; éxito/error del bloqueo → toast-bus (patrón toastAfterSheetClose).
3. Migrar los 3 Alert de error del dispatcher a toast.error (una línea cada uno, formato
   'título · cuerpo').
4. Respetar el gotcha de modal-chain iOS (InteractionManager) al encadenar con la
   navegación del CTA.
**Depende de**: nada.

### G50 — Restos internos del neo: hexes, sombras crudas y tokens V1 dentro de piezas ya rediseñadas [baja · M]
**Superficie**: Piezas que YA son neo mezclan restos del sistema viejo — barrido
mecánico, sin diseño nuevo.
**Archivos / Evidencia**:
- `quick-add-savings-sheet.tsx`: fill del slider con expo-linear-gradient + hex de exceso
  inline.
- `no-spend-confirm-sheet.tsx:99`: warnInk `#A84A2F` re-derivado a mano cuando ya existe
  `neoInk(mode).warn` (neo-ink.ts:44, mismo valor y justificación WCAG); mismo patrón
  inline en quick-add-savings-sheet.tsx:227, expense-categories-screen.tsx:72,
  control-v2/neo-field.tsx:79 y settings-grouped-list.tsx:59.
- `control-v2-anchor.tsx:94-97`: glow del pulso con shadowColor/shadowOffset/shadowRadius
  (iOS-only) + theme.colors.primaryStrong — hoy el pulso no tiene glow en Android.
- RefreshControl inconsistente entre las 3 tabs neo: neo-control-screen:580-584 y
  neo-fijos-screen:806-813 tintan con brand.deep/brand.bright de la paleta V1 mientras
  neo-gastos:2362 ya usa s.text del spec.
- `add-quick-action-icon.tsx:204/:255-264`: scan-bar del ícono 'Importar' con
  shadow*/elevation — único uso de la API vieja en el overlay del FAB.
- `amount-card.tsx`: eyebrow/hint/amount sin la tinta del skin cuando neo está activo.
- Los 2 glows shadowColor de las escenas del Wrapped (ver G12).
**Referencia de diseño**: `mobile/theme/neo-tokens.ts` / `neo-ink.ts` +
`handoff-README.md` (materiales y glows). Consolidación de tokens, no rediseño.
**Plan**:
1. Slider de quick-add-savings → cssGradient dentro del mismo Animated.View clippeado
   (verificar en device que experimental_backgroundImage rinde en contenedor animado por
   width; si no, documentar la excepción); hex de exceso → dayExcesoInk importado (o
   promovido a neo-tokens si se repite una tercera vez).
2. Codemod warnInk: `neoInk(mode).warn` como único dueño del criterio en los 5 call
   sites; borrar los bloques de comentario duplicados.
3. Anchor: derivar el glow de CONTROL_SPEC (green/scoreStroke) y evaluar boxShadow
   animado en vez de shadow*.
4. RefreshControl: unificar las 3 tabs en la tinta del spec (s.text o el verde del
   sistema) y retirar el import de brand en neo-control y neo-fijos.
5. scan-bar → boxShadow glow inline (`0 0 6px` del accent), degradación silenciosa
   <API28 aceptada (la barrita sigue visible por su fill).
6. amount-card: mover eyebrow/hint/amount a la tinta del skin en rama neo. Regla ESLint
   opcional: prohibir theme.colors dentro de components con skin neo.
**Depende de**: nada.

### G51 — Tintas de veredicto de Ediciones hardcodeadas (duplican la paleta del Wrapped) [baja · S]
**Superficie**: `/settings/editions` — tonos margen/excedido/parejo de resolveTone.
**Archivos**: `mobile/screens/settings/editions-screen.tsx`,
`mobile/components/wrapped/wrapped-constants.ts`.
**Estado actual**: La pantalla está migrada al material neo pero las tintas de estado
están hardcodeadas por hex en resolveTone, duplicando a mano la paleta de las escenas del
Wrapped en vez de salir de un seam compartido (y del vocabulario excess/margin que ya
existe en neoCalendar).
**Referencia de diseño**: `design/rediseno-2026-07/screens/3h.html`; vocabulario
existente: excess claro `#A84A2F` (neoCalendar/gastos-spec).
**Plan**:
1. Extraer resolveTone a constantes compartidas con la paleta del Wrapped
   (wrapped-constants.ts como single source — se encadena con G12 paso 2) o mapear a
   neo.green/neo.warm/status inks de neo-tokens donde el contraste lo permita.
2. Verificar contraste de los reemplazos (los actuales pasan salvo revisión del par
   excedido claro).
3. Comparar lado a lado contra 3h.html claro/oscuro.
**Depende de**: G12 (consolidación de wrapped-constants).

### G52 — Drift de radios y bordes menores dentro de pantallas neo [baja · S]
**Superficie**: about (hero 22), family-admin (hero 22), asistente-preferences (cards
22), admin (input 14 + borde incondicional), savings-goal (theme.radii.xl en L129/L321).
**Archivos**: `mobile/screens/settings/about-screen.tsx`, `family-admin-screen.tsx`,
`asistente-preferences-screen.tsx`, `admin-screen.tsx`, `savings-goal-screen.tsx`.
**Estado actual**: Escala del handoff: hero 32, cards 24-28, tiles 18, inputs 18. Varias
pantallas usan radii.xl=22 del palette viejo para heros/cards y el input de admin usa 14.
**Referencia de diseño**: neoRadii en `mobile/theme/neo-tokens.ts` (escala canónica ya
codificada).
**Plan**:
1. Reemplazar radii.* del palette por neoRadii (hero→neoRadii.hero, cards→neoRadii.card,
   inputs→neoRadii.tile/18).
2. El borde incondicional de admin entra por G48.
3. Grep final de `from '@/theme/palette'` en screens/settings para cortar el import
   viejo.
**Depende de**: nada.

---

## Orden de ejecución propuesto

### Fase 1 — Primitivas compartidas (Categoría C core + canvas del shell)

Desbloquean y desriesgan todo lo demás: cada una elimina restos en varias vistas a la
vez, y las fases siguientes las consumen en vez de re-resolver el mismo problema por
pantalla.

1. **G24** ErrorState/EmptyState → NeoStateBlock — el reemplazo ya existe y está
   aprobado; swap de menor riesgo con impacto en las 4 vistas.
2. **G22** AppButton → NeoButton — el CTA es el órgano V1 más repetido dentro de sheets
   neo; destraba G03/G10/G11/G32/G35.
3. **G23** NeoTextField — última primitiva de input faltante; destraba G09/G10/G17.
4. **G29** Skeletons/loaders neo — primitiva de carga única para todas las vistas.
5. **G28** SwipeRow skin neo — el resto V1 más visible dentro de las 3 listas vivas
   (requiere una decisión chica de accent del owner).
6. **G31** ScreenHeader neo — chrome de ~15 pantallas de un saque.
7. **G30** SegmentedControl neo — destraba G11 y limpia el root de Ajustes.
8. **G41** Fondos raíz + default de Screen — mata los seams sistemáticos del shell; el
   flip del default de Screen se coordina con las pantallas aún legacy.
9. **G25** BlockingScreenView — la superficie de carga global; prerequisito de G05.

### Fase 2 — Restos dentro de las 5 vistas de referencia + Settings (llevarlas a 100%)

Con las primitivas de Fase 1 adoptadas, estas vistas quedan realmente cerradas.

- **G16** StartingBalanceCta (Home) — dirección ya escrita en el cableado.
- **G33** FreePeriodNudge (Home) — re-skin ordenado por el cableado; compliance literal.
- **G32** CancelDeletionBanner (+welcome) — cascada natural post-G22.
- **G34** AvatarAnimal — defaults neo + medallones de Home/Notifs.
- **G15** TrendBadge/FijoTrendSpark (Fijos) — mata el verde neón en oscuro.
- **G20** Pill Pagar + hint cuotas (Fijos) — dos edits chicos.
- **G19** Swatches del hero (Gastos) — promueve categoryPastel a compartido.
- **G18** Pill de severidad (Notifs) — con confirmación del owner.
- **G13** Empty del Control — necesita diseño + gate, pero cierra la última rama V1 de
  las 4 tabs.
- **G26** StepAvatar / **G27** BadgeDetailSheet / **G35** Reauth+PinPad / **G14** grilla
  de logros / **G17** cycle-config-section / **G38** SectionHeader — los últimos órganos
  V1 de Ajustes.
- **G37** CaptchaModal — takeover del primer contacto, cambio chico.

### Fase 3 — Pantallas completas CON referencia de diseño en `design/`

La referencia existe: transcribir, replicar en Settings→Dev y pasar el gate.

- **G02** Mi jardín (3g) — la pantalla legacy viva más visible; una sola decisión abierta
  (stickers vs mini-Brots).
- **G08** Intro pre-auth — las piezas neo ya existen (kits de Home/Fijos/Gastos); es
  recomposición, no diseño; primera impresión de todo usuario nuevo.
- **G11** household-setup — vocabulario análogo 5d–5f + kit wizard; mayormente swaps de
  primitivas de Fase 1.

### Fase 4 — Superficies SIN referencia: diseñar primero, gate del owner por vista

Réplicas en Settings→Dev y aprobación del owner ANTES del swap, como se venía haciendo.

- **G01** Coach Mode — el gap pantalla-completa más profundo; mockup claro+oscuro
  primero.
- **G03** ManageView + sheets de compra — la mayor superficie legacy viva de Ajustes;
  compliance intocable.
- **G04** JoinScreen + **G05** ResetPassword/AuthCallback — cierran el funnel de auth;
  el diseño es liviano porque reusan Onb5cHogar/auth-kit, pero pasan igual por el gate.
- **G09** import-review — el flujo estrella de captura; WizardSkinProvider hace la mitad
  del trabajo gratis.
- **G06** Historial + editor de gasto — primero la decisión de producto (retirar vs
  rediseñar), después la sheet de edición.
- **G10** Wizard de metas + MetaCard + savings-goal — la pantalla completa en un solo PR.
- **G12** Wrapped — decisión del owner primero; si aprueba, escena por escena con gate.

### Fase 5 — Transversales + Brot/partículas + limpieza

- **G46** Contraste AA del token muted — decisión de token temprana si se puede (un solo
  lugar), verificación al final.
- **G47** Nunito faltante + regla ESLint.
- **G48** Fallbacks Android (notifs + 9 puntos + helper flatFallback).
- **G49** Alert.alert → toast/sheets.
- **G50** Restos internos (codemod warnInk, refresh tints, glows, slider).
- **G51** Tintas de Ediciones / **G52** drift de radios.
- **G42** Brot en Asistente, **G43** Brot cheer, **G44** Brot zen, **G45** Brot peek
  (re-confirmación).
- **G07** dev-health (o excepción documentada).
- Limpieza del dead code del Apéndice 1 (tras verificar que los últimos consumidores
  murieron con las fases anteriores).

---

## Decisiones del owner — RESUELTAS (2026-08-05)

1. **Historial de gastos (G06)**: se **retira la ruta**. Los ciclos cerrados ya viven en
   las ediciones del neo-gastos, así que la pantalla duplicaba una vista que el usuario
   ya tiene. La **edición de gasto se muda a una sheet neo** abierta desde el propio feed
   (el camino más corto: el gasto se edita donde se lo ve, sin navegar a otra pantalla).
   `expenses-history` + `expense-filters` y sus componentes pasan a dead code.
2. **Brot peek en Home (G45)**: **se respeta el retiro** — Brot NO va en la Home. La
   divergencia se cierra actualizando los handoffs escritos, no restaurando el Brot.
3. **Wrapped (G12)**: **versión neo**. Las escenas del cierre de ciclo se rediseñan con
   el vocabulario del sistema; deja de ser una excepción de paleta.
4. **Grid del jardín (G02/G43)**: **mini-Brots del handoff** (32px, `idle`/`wilted`/
   `seed`, `animated=false` en grillas), tanto en la grilla del jardín como en la fila
   del cierre de semana. Los stickers PNG grandes quedan retirados de esa superficie.
5. **Ejecución**: el owner ordenó **integrar el plan completo de punta a punta**. Las
   pantallas sin referencia de diseño se construyen directamente con el vocabulario neo
   ya aprobado (precedente: el swap directo de Control del 2026-08-03), sin bloquear cada
   vista en una réplica previa en Settings→Dev.

Decisiones secundarias, resueltas bajo el criterio "lo más simple para el usuario, sin
salirse del design system": accent del panel danger del SwipeRow → terracota/rojo-tierra
del propio sistema (G28); AmbientBackdrop → retintar con tokens neo, no retirar (G36);
canvas del shell → helper sobre `neoTokens(mode).bg`, sin tocar `palette.ts` para no
mover pantallas legacy sin querer (G41); Coach Mode → hereda el tema del sistema, deja de
ser dark fijo (G01). Quedan atadas a su gap: valor del token `neo.textMuted` claro (G46),
pill de severidad de Notificaciones (G18), swatches chicos (G19), forma del hero de la
meta (G10).

---

## Apéndice 1 — Dead code confirmado (candidatos a limpieza, NO gaps)

Pantallas viejas conservadas para rollback, sin ruta viva (sus consumos de UI V1 no
cuentan como gap):

- `mobile/screens/home/home-screen.tsx` + `mobile/components/home/home-dashboard.tsx`,
  `home-header.tsx`, `greeting-header.tsx` y hermanos solo alcanzables desde ella.
- `mobile/screens/home/expenses-screen.tsx` y `gastos-v2-screen.tsx` + el subárbol
  `mobile/components/gastos/` solo alcanzable desde ellas (gastos-header,
  gastos-hero-card, gastos-month-calendar, gastos-movement-* viejos).
- `mobile/screens/home/fijos-v2-screen.tsx` + `mobile/components/fijos/fijos-header.tsx`,
  `fijos-tabs.tsx`, `fijos-empty-state.tsx`.
- `mobile/screens/home/control-v2-screen.tsx` (794 líneas) + `control-v2-header.tsx`,
  `control-v2-hero.tsx`, `control-v2-alcanza-card.tsx`, `control-v2-alcancia-card.tsx`,
  `control-v2-cobertura-card.tsx`, `control-v2-ingresos-card.tsx` y demás cards V2 sin
  otros importadores.
- `mobile/screens/home/notifications-screen.tsx` +
  `mobile/components/home/notification-feed-list.tsx` (único otro consumidor de
  pillForSeverity).
- `mobile/screens/home/onboarding-screen.tsx` + `mobile/components/home/onboarding/*`
  (step-family y hermanos — EXCEPTO step-avatar, vivo vía edit-avatar-sheet, G26).
- Auth viejas sin ruta: `mobile/screens/auth/welcome-screen.tsx`, `login-screen.tsx`,
  `signup-screen.tsx`, `forgot-password-screen.tsx`, pin viejas.
- Barra de tabs V1 completa, INERTE con el tabBar custom (rollback F5):
  `app-tab-primitives.tsx`, `app-tabs-ui.tsx`, `tab-bar-background.tsx`,
  `tab-bar-icon.tsx`, `tab-bar-pressable.tsx`, `tab-label.tsx` — quedan referenciados por
  screenOptions de app-tabs pero con tabBar custom probablemente nunca se dibujan;
  confirmar antes de retirar.

Componentes sin importadores vivos:

- `mobile/features/insights/asistente-theme.ts` (113 líneas, set 'Mint Saturado'; solo
  mencionado en un comentario).
- `mobile/components/gastos/streak-sheet.tsx` — solo lo monta gastos-v2 (dead) y un dev
  preview; en prod la acción 'open-streak-sheet' solo la emiten señales demo y el
  dispatcher cae a router.push(home): la superficie desapareció con el swap.
- `mobile/components/subscriptions-zombie/` — zombie-feed-section.tsx y 4 de las 5 cards
  sin ningún importador (la FEATURE `mobile/features/subscriptions-zombie` sigue viva vía
  el Control neo — no tocar).
- `mobile/components/billing/paywall-view.tsx` (solo import de TYPE desde
  neo-paywall-view), `free-period-banner.tsx` (no confundir con free-period-NUDGE, vivo)
  y `savings-ribbon.tsx` (muerto por transitividad).
- `mobile/components/ui/chip.tsx`,
  `mobile/components/settings/fixed-expense-editor-chip-sections.tsx` +
  `fixed-expense-editor-value-rows.tsx` (sin importadores),
  `mobile/components/ui/tab-section-header.tsx`, `mobile/components/ui/cobro-pending-chip.tsx`.

Morirán al completarse gaps (retirar entonces): `fijos-hero-card.tsx`, `gasto-row.tsx`,
`income-row.tsx`, `home-hero-card.tsx` (tras G08); `auth-scaffold.tsx` (tras G05);
`meta-card.tsx` (tras G10); WarmFernLogo + authTokens.welcomeBg (tras G25);
`branded-panel.tsx` + `ui/card.tsx` (tras G04/G05/G06/G11); `error-state.tsx`,
`empty-state.tsx`, `text-field.tsx`, skeletons V1 (tras G06 + adopciones de Fase 1).

## Apéndice 2 — Superficies verificadas 100% neo

- **Home**: kit completo `redesign/home/home-screen.tsx` (100% HOME_SPEC, boxShadow
  multi-string, experimental_backgroundImage, Nunito 800-900) + BrotParticles del hero
  (port Skia 1:1, gates de costo por reduced-motion/deviceYearClass). La duplicación
  HOME_SPEC↔neoTokens es deliberada (réplica literal bajo gate), no un gap.
- **Gastos**: neo-gastos-screen + kit `redesign/gastos/` (handoff v2 entero: hero con
  partículas y Brot, calendario, chips, feed virtualizado, day-detail, ediciones
  cerradas, skeleton neumórfico propio); `expense-categories-screen` y
  `expense-filters-screen` ya neo (NeoSurface/NeoButton/NeoStateBlock, pasteles
  deterministas, tinta AA mode-aware, fallback Android).
- **Fijos**: kit completo (hero E1–E8 con Brot cool/wave/worried, Avisos A1–A6, ticker,
  tabs) + fijos-skin con ~20 consumidores; alta add-fijo-v2 bajo FijosSkinProvider.
- **Control**: neo-control-screen + todo el kit `redesign/control/` (spec propio de 3f,
  Brot coach/love/worried/wave donde el handoff lo pide) y el flujo de decisión de cierre
  de mes.
- **Notificaciones**: neo-notifications-screen conforme a 7a/7b (header, chip hundido,
  cards, empty, permission-prime-sheet con fallback correcto).
- **Asistente**: pantalla del chat completa (carcasa neo.sheet, cards
  cssGradient/relieve, tiles pastel, CTA radial, TwinklingStars, fallbacks Android) + los
  5 sheets del GlobalAdvisorActionHost.
- **Auth/Onboarding/Boot**: boot-screen + NeoPinLockPanel, NeoLaunchSplash + bridge,
  neo-welcome/login/signup (con confirm-email)/forgot, neo-biometric-setup,
  neo-pin-setup, neo-onboarding + success, trial-welcome (paywall welcomeMode).
- **Billing Estado A**: NeoPaywallView + AuthPlanHogar (réplica 4m/4mo con Brot love/
  coach, precios StoreKit con skeleton, compliance 3.1.2 y lockMode 5.1.1(v)).
- **Jardín (overlays)**: week-close-celebration (neoTokens dark, AA documentado),
  floracion-view + coral-bloom.
- **Navegación**: NeoTabBarLive (swap F5, paridad 1:1 con el preview) + FAB neo con
  overlay de acciones.
- **UI compartida**: ModalCard skin='neo', toast-host, NeoButton/NeoSurface/
  NeoStateBlock/neo-confirm-host, InAppNumpad/NumpadGrid/NumpadField/numeric-edit-sheet,
  hour-picker-sheet; NoSpendConfirmSheet; ShareImportHost (overlay + carcasa).
- **Settings**: root + 11 grupos, settings-grouped-list/primitives, 9 de 12 pantallas y
  13 sheets-shell con la receta canónica (los restos exactos son los gaps de este doc).

## Apéndice 3 — Cobertura y límites de la auditoría

- **Cobertura de rutas**: las 46 rutas vivas de `app/` (excluyendo `settings/dev/*`)
  aparecen todas en alguna área — no hay rutas huérfanas de auditoría. El método fue
  crawl mecánico de imports desde todas las rutas (966 archivos alcanzables),
  intersección con grep de theme.colors (231 archivos → 131 vivos / 92 muertos) y
  verificación manual de los vivos; los dual-skin (fijos-skin/wizard-skin/ModalCard
  skin=neo) tienen theme.colors solo en la rama classic y NO son gaps cuando el provider
  está montado en la superficie viva.
- **Alta de ingreso**: `add-income-v2-screen.tsx` solo se verificó a nivel grep en el
  barrido transversal ([neo] nominal). Gastos auditó add-expense pieza por pieza y Fijos
  auditó add-fijo, pero nadie recorrió el wizard de ingreso en profundidad — cobertura
  nominal, no real. Pendiente una pasada dedicada (comparte el kit wizard, riesgo bajo).
- **Tours**: hay 4 (home/gastos/fijos/control) compartiendo tooltip/scrim/pulso; se
  auditaron bajo Home, pero al ser el mismo componente la cobertura alcanza.
- **No existen** widgets ni Live Activities (targets iOS: solo Manifiesto +
  ShareExtension), no hay UI de update prompt (expo-updates sin uso en UI), y el
  ShareExtension iOS es headless (su única UI es un UIAlertController de error) — nada
  que auditar ahí.
- **Sheets wrappers**: los 5 sheets de Ajustes no enumerados en gaps
  (conversion-settings, edit-buffer, edit-my-contribution, edit-savings-percent,
  edit-usd-rate) están vivos pero son wrappers finos de NumericEditSheet/neoTokens ya
  cubiertos por UI compartida.
- **Hallazgo funcional fuera de alcance** (flaggeado como tarea aparte): el CaptchaModal
  trata cualquier string no listado como token de éxito y el evento 'challenge-closed'
  del upstream no está en LIFECYCLE_CANCEL — cerrar el desafío manda ese literal como
  captcha_token al backend en vez de resolver null. No es un gap de diseño; se sigue por
  su propia tarea.
- Los previews de `settings/dev/*` y las pantallas de rollback quedaron explícitamente
  fuera del alcance.
