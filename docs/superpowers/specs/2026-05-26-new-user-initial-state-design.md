# Spec — Estado inicial de un usuario nuevo · v1

> 🗓️ **2026-05-26** · Diseño aprobado (brainstorming) para que un usuario recién registrado tenga un primer-uso "100% limpio y listo para arrancar". Aprovecha infraestructura existente que estaba sin trigger (tours) y suma un momento de cierre del onboarding.
>
> **Precondición:** branch `main` ya tiene la auditoría de login/biometría cerrada (merge `c42fda3`) y el bypass de app-lock cerrado.

---

## 1. Objetivo y criterios de éxito

**Objetivo:** un usuario que recién termina el wizard de 5 pasos entra al Home con (a) un momento de cierre que confirma "todo está armado", (b) un tour guiado sobre cada pantalla principal la primera vez que la visita, (c) un CTA visible para confirmar el saldo inicial del ciclo, y (d) la capacidad de re-ver cualquier tutorial desde Settings.

**Criterios de éxito (medibles en QA):**
- Al terminar el step 5 del wizard, **antes de Home**, se muestra una **success screen** con avatar + nombre + copy contextual (solo vs familia). Tap-to-continue.
- En la primera entrada al Home post-onboarding, el **tour de Home auto-fira**.
- Si `current_cycle_starting_balance IS NULL`, el Home muestra una **card destacada "Confirmá tu saldo"** (no modal forzado) que el tour highlightea como una de sus steps.
- Hero del Home muestra **copy diferenciado por modo**: "Tu espacio personal" (solo) vs. "Tu familia · N miembros" (shared).
- Primera visita a **Gastos / Fijos / Control** auto-fira el tour respectivo (una vez por screen).
- En Settings, sección **"Ayuda · Tutoriales"** permite re-ver cualquiera de los 4 tours.
- **Usuarios existentes** (con `onboarding_completed_at` ANTES de `TOURS_FEATURE_DEPLOYED_AT`) no reciben tours retroactivos: las flags se marcan como `seen=true` silenciosamente en el primer mount del hook.

**Decisiones tomadas (brainstorming 2026-05-26):**
- Scope v1 = 4 clústers: Auto-tour + Home CTA/mode + Success screen + Re-watch en Settings.
- Política de tours: **todos los 4 auto-firan** en primera visita por screen (no solo Home).
- Protección de usuarios existentes: gate por constante `TOURS_FEATURE_DEPLOYED_AT` (timestamp), sin migración de DB.
- Success screen: tap-to-continue (sin auto-dismiss).
- Saldo CTA: **card inline destacada** (no modal forzado), tour la highlightea.

---

## 2. Contexto del código (estado actual relevante)

- **`mobile/features/tours/`** — infra de tours ya existe: `TourProvider` (React context) + `<TourTarget>` (wrap UI elements) + `useScreenTour()` con `start()/next()/prev()/stop()`. Persistencia en SecureStore key `tour.{tourKey}.seen`. 4 tours definidos: `home-tour.ts`, `gastos-tour.ts`, `fijos-tour.ts`, `control-tour.ts`. **Sin trigger de auto-fire en ningún lado.**
- **`mobile/screens/home/onboarding-screen.tsx`** — wizard de 5 steps. Step 5 (StepSavings creator / StepFamilySummary joiner) llama `completeOnboarding()` → splash → `router.replace('/(app)/(tabs)/home')`. **Sin momento de éxito entre el splash y Home.**
- **Home hero** — [`home-hero-card.tsx`](../../../mobile/components/home/home-hero-card.tsx) ya tiene un `onPressConfigureIncome` para CTAs de setup (income vacío). Buen patrón a seguir para el de saldo.
- **`isSolo` ya disponible** en [`home-dashboard.tsx:62,100,599`](../../../mobile/components/home/home-dashboard.tsx#L62) (deriva de `families.kind`), hoy solo se usa para ocultar avatares en modo solo (`showMembers={!isSolo}`). El hero NO usa este flag para copy todavía.
- **Starting balance** — `current_cycle_starting_balance` (NULL al crear familia) tiene modelo + repository + dashboard wiring ([family-finance.repository.ts](../../../mobile/features/finance/family-finance.repository.ts), [home-dashboard.tsx](../../../mobile/components/home/home-dashboard.tsx)). Hay un mecanismo de confirmación existente; este spec lo eleva en visibilidad con una card destacada inline cuando `IS NULL`.
- **Settings** — no tiene sección de tutoriales / ayuda hoy.
- **`profiles.onboarding_completed_at`** — timestamp, set por `useCompleteOnboarding` al final del wizard. Es el ancla para detectar usuarios nuevos vs. existentes.

---

## 3. Cluster A — Auto-disparo de tours

### Helper puro `mobile/features/tours/should-auto-fire-tour.ts` (nuevo)

```ts
export interface AutoFireInput {
  tourSeen: boolean | null
  onboardingCompletedAt: string | null
  toursDeployedAt: string  // constant ISO timestamp
}

export type AutoFireDecision =
  | { action: 'fire' }
  | { action: 'backfill-as-seen' }
  | { action: 'noop' }

export function shouldAutoFireTour(input: AutoFireInput): AutoFireDecision
```

**Reglas:**
- `tourSeen === true` → `'noop'` (ya visto).
- `onboardingCompletedAt === null` → `'noop'` (aún en wizard, no toca).
- `onboardingCompletedAt < toursDeployedAt` → `'backfill-as-seen'` (usuario existente; marcar visto sin disparar).
- En cualquier otro caso → `'fire'`.

Puro, testeable, sin React.

### Constante `TOURS_FEATURE_DEPLOYED_AT`

En `mobile/features/tours/auto-fire-config.ts`:
```ts
// ISO timestamp from when this feature shipped. Users whose
// `onboarding_completed_at` is strictly before this skip the
// retroactive auto-fire (backfilled silently as seen).
export const TOURS_FEATURE_DEPLOYED_AT = '2026-05-27T00:00:00Z'
```
(Fecha exacta = día del primer deploy; ajustar al mergear.)

### Hook `useAutoFireTour(tourKey)` (nuevo)

`mobile/features/tours/use-auto-fire-tour.ts`:
- Lee `tour.{key}.seen` del SecureStore (one-shot al montar).
- Lee `profiles.onboarding_completed_at` del query cache (`useMyProfile`).
- Compone `AutoFireInput`, llama `shouldAutoFireTour`, ejecuta:
  - `'fire'` → marcar `seen=true` defensivamente AND `useScreenTour().start()`.
  - `'backfill-as-seen'` → solo marca `seen=true` en SecureStore (silencioso).
  - `'noop'` → nada.
- Usa `useFocusEffect` para que aplique al focusear la screen (no solo al mount).
- Idempotente: si ya disparó en esta vida del componente, no re-dispara.

### Wiring en las 4 screens

En cada screen (`home-screen.tsx`, `gastos-screen.tsx`, `fijos-screen.tsx`, `control-screen.tsx`) agregar UNA línea:
```tsx
useAutoFireTour('home')   // o 'gastos' / 'fijos' / 'control'
```

### Tests

- Unit de `shouldAutoFireTour`: 5 casos (seen → noop, sin onboarding → noop, onboarding viejo → backfill, onboarding reciente → fire, onboarding NULL → noop).
- El hook no se unit-testea (efecto + SecureStore + nav); la lógica vive en el helper puro.

---

## 4. Cluster B — Home: saldo CTA + mode messaging

### Mode messaging en el hero

Helper puro `mobile/features/family/family-mode-copy.ts` (nuevo) que mapea `kind + memberCount` a el copy del eyebrow / título:
```ts
export function familyModeHeroCopy(input: {
  kind: 'solo' | 'shared'
  memberCount: number
  familyName: string | null
}): { eyebrow: string; title: string }
```
- `'solo'` → eyebrow "Tu espacio personal", título = primer nombre del usuario o "Bienvenido".
- `'shared'` → eyebrow "Tu familia", título = `familyName ?? '${memberCount} miembros'`.

Wireado en [`home-hero-card.tsx`](../../../mobile/components/home/home-hero-card.tsx) (recibir `isSolo` + `memberCount` + `familyName` por props, no recomputar adentro). El props de `isSolo` ya viaja por `home-dashboard.tsx`; agregar `memberCount` y `familyName` al mismo viaje.

### CTA de saldo inicial

En el Home, si `family_finance.current_cycle_starting_balance IS NULL`:
- Renderizar una **card destacada** en lugar prominente (encima de la hero card de gastos), siguiendo el mismo patrón visual que el CTA de income-no-configurado ya existente en `home-hero-card.tsx` (`onPressConfigureIncome`).
- Contenido:
  - Icono fern peach.
  - Título: "Confirmá tu saldo inicial".
  - Subtítulo: "Empezá tu ciclo con la plata que tenés disponible hoy."
  - CTA "Confirmar" → abre el flujo existente de starting balance.
  - Pulse sutil (Reanimated, respeta `useReducedMotion`).
- Wrap en `<TourTarget tour="home" order={N}>` para que el home tour la highlightee como step (orden N a definir cuando se sumen los steps).
- Cuando se confirma → la card desaparece (re-render por React Query invalidación).
- Si en el codebase actual ya hay una CTA inline equivalente, este spec **la consolida con copy + posición prominente + tour target** (no duplica).

### Tests

- Unit puro de `familyModeHeroCopy` (4 casos: solo / shared con familyName / shared sin familyName / memberCount edge).
- No hay test para la card visual (cubre QA).

---

## 5. Cluster C — Success screen post-wizard

### Nuevo screen `mobile/screens/home/onboarding-success-screen.tsx`

Renderiza:
- Background: gradiente cream/peach (warm, sin overwhelm).
- AvatarAnimal del usuario (grande, `RiseView` entrance ~700ms).
- Eyebrow: "Bienvenido a Manifiesto" (delay 200ms).
- Título: "¡Listo, {firstName}!" (delay 400ms).
- Subtítulo (variante por modo):
  - solo: "Tu espacio personal ya está armado. Vamos a Home."
  - shared: "Tu familia ya está armada. Vamos a Home."
- CTA primaria "Empezar" abajo (delay 700ms). Tap → `router.replace('/(app)/(tabs)/home')`.
- Status bar: light sobre el fondo cream.
- Sin botón back, sin posibilidad de volver al wizard.

### Integración con `useCompleteOnboarding`

Actualmente `completeOnboarding` → `showAuthTransitionSplash()` → `router.replace('/(app)/(tabs)/home')`. Cambiar a:
- `completeOnboarding` mutation → en `onSuccess`, **además de invalidar la query de profile, hacer `queryClient.setQueryData(['profile', userId], prev => ({...prev, onboarding_completed_at: new Date().toISOString()}))`** para evitar la race con `RequireAuth` (que chequea `onboarding_completed_at` y bouncearía a `/(app)/onboarding` si está NULL en el cache). El `setQueryData` es síncrono.
- `showAuthTransitionSplash()` → `router.replace('/(app)/onboarding-success')`.
- Success screen oculta el splash en su `useFocusEffect` (`markAuthTransitionLoaded()`).
- Tap "Empezar" → splash de nuevo + `router.replace('/(app)/(tabs)/home')`.

### Notas de routing
- La ruta `/(app)/onboarding-success` cae dentro del `(app)` group → RequireAuth aplica. Con el `setQueryData` arriba, la guard pasa sin race.
- AppEntryGate (en `/`) NO se atraviesa porque navegamos directo a la ruta nueva con `router.replace`, no a `/`. La success screen está fuera del flow de cold-start.

### Route

Nueva ruta `app/(app)/onboarding-success.tsx`:
```tsx
import { OnboardingSuccessScreen } from '@/screens/home/onboarding-success-screen'
export default OnboardingSuccessScreen
```

### Helper puro `mobile/features/onboarding/success-copy.ts` (nuevo)

```ts
export function onboardingSuccessCopy(input: {
  kind: 'solo' | 'shared'
  firstName: string
}): { eyebrow: string; title: string; subtitle: string; ctaLabel: string }
```
Testeable con 4 casos (solo / shared × firstName presente / vacío).

### Tests

- Unit de `onboardingSuccessCopy`.

---

## 6. Cluster D — Re-watch tours en Settings

### Subsección "Ayuda · Tutoriales" en Settings

Agregar (en `mobile/screens/settings/settings-screen.tsx` o sub-componente) un grupo nuevo:
- Group header: "Ayuda".
- Rows:
  1. "Ver tutorial de Home" → reset `tour.home.seen` + `router.push('/(app)/(tabs)/home')`.
  2. "Ver tutorial de Gastos" → reset `tour.gastos.seen` + push.
  3. "Ver tutorial de Fijos" → reset `tour.fijos.seen` + push.
  4. "Ver tutorial de Control" → reset `tour.control.seen` + push.
  5. "Volver a ver todos los tutoriales" → reset las 4 + toast confirmatorio (sin nav).

### Reset helper

`mobile/features/tours/reset-tour-seen.ts` (nuevo):
```ts
export async function resetTourSeen(tourKey: TourKey): Promise<void>
export async function resetAllTourSeen(): Promise<void>
```
Borra el SecureStore key `tour.{key}.seen`.

### Interacción con el auto-fire

El hook `useAutoFireTour` re-lee `tour.{key}.seen` al focusear. Tras un reset desde Settings + navegar a la screen, el hook detecta `seen=false` → dispara el tour. Sin cambios en el hook.

### Tests

- Unit de `resetTourSeen` y `resetAllTourSeen` (con stub de SecureStore — mismo pattern que `biometric-enabled-flag.test.ts`).

---

## 7. Fuera de alcance (v1)

- Welcome push o email post-onboarding.
- Celebración en la primera acción del usuario (primer gasto registrado, primer ahorro creado).
- Persistencia del draft del wizard en SecureStore (no perder progreso si se cierra la app mid-wizard).
- Skip global del tour ("no ver este tutorial nunca") más allá del cancel implícito existente.
- Onboarding tour para usuarios convertidos solo→familia o familia→solo (cubierto por re-watch manual en Settings).

---

## 8. Archivos afectados (resumen)

| Capa | Archivo | Cambio |
|---|---|---|
| Cliente | `mobile/features/tours/auto-fire-config.ts` (nuevo) | Constante `TOURS_FEATURE_DEPLOYED_AT` |
| Cliente | `mobile/features/tours/should-auto-fire-tour.ts` (nuevo) | Helper puro `shouldAutoFireTour` |
| Cliente | `mobile/features/tours/use-auto-fire-tour.ts` (nuevo) | Hook que cablea helper + SecureStore + `useScreenTour` |
| Cliente | `mobile/features/tours/reset-tour-seen.ts` (nuevo) | Helpers `resetTourSeen` / `resetAllTourSeen` |
| Cliente | `mobile/screens/home/home-screen.tsx` (modify) | `useAutoFireTour('home')` |
| Cliente | `mobile/screens/{gastos,fijos,control}-screen.tsx` (modify) | `useAutoFireTour('gastos'|'fijos'|'control')` |
| Cliente | `mobile/features/family/family-mode-copy.ts` (nuevo) | Helper puro `familyModeHeroCopy` |
| Cliente | `mobile/components/home/home-hero.tsx` (modify) | Usa `familyModeHeroCopy` |
| Cliente | `mobile/components/home/home-dashboard.tsx` (modify) | Renderiza CTA de saldo si `starting_balance IS NULL` |
| Cliente | `mobile/screens/home/onboarding-success-screen.tsx` (nuevo) | Pantalla de éxito |
| Cliente | `mobile/features/onboarding/success-copy.ts` (nuevo) | Helper puro `onboardingSuccessCopy` |
| Cliente | `app/(app)/onboarding-success.tsx` (nuevo) | Route wrapper |
| Cliente | `mobile/features/onboarding/use-complete-onboarding.ts` (modify) | Redirige a `/onboarding-success` en vez de a home |
| Cliente | `mobile/screens/settings/settings-screen.tsx` (modify) | Sección "Ayuda · Tutoriales" con 5 rows |
| Tests | `tests/unit/should-auto-fire-tour.test.ts` (nuevo) | 5 casos del helper |
| Tests | `tests/unit/family-mode-copy.test.ts` (nuevo) | 4 casos del copy del hero |
| Tests | `tests/unit/onboarding-success-copy.test.ts` (nuevo) | 4 casos del copy de success |
| Tests | `tests/unit/reset-tour-seen.test.ts` (nuevo) | reset individual + reset all |
| Docs | `docs/ESTADO-DEL-PROYECTO/2026-05-21-estado-actual/02-auth-onboarding.md` (modify) | Documentar el flujo nuevo de success + tour |
| Docs | `docs/ESTADO-DEL-PROYECTO/2026-05-21-estado-actual/06-settings-engagement.md` (modify) | Documentar la sección "Ayuda · Tutoriales" |

---

## 9. Testing

**Unit (Vitest):** 4 archivos nuevos cubriendo los helpers puros (~15 casos en total). Reutilizan stubs existentes (react-native, expo-secure-store).

**QA manual** (después de implementación, en device real / dev client):
1. Usuario nuevo: signup → wizard → ✨ success screen → tap "Empezar" → Home con tour auto-fire + card de saldo destacada.
2. Tour de Home completo → user navega a Gastos → tour de Gastos auto-fira.
3. Lo mismo para Fijos y Control.
4. Confirmá saldo → la card desaparece, hero del Home muestra el modo correcto (solo o familia).
5. Settings → "Ayuda · Tutoriales" → tocar "Ver tutorial de Home" → navega a Home → tour re-fira.
6. "Volver a ver todos los tutoriales" → confirma toast → próxima visita a cada screen, tour fira.
7. **Usuario existente** (onboarding completado antes del deploy): abrí la app → ningún tour fira. Visitá Settings → Tutoriales sigue disponible si quiere verlos.

<!-- Spec aprobado en brainstorming 2026-05-26; pendiente review del owner antes de writing-plans -->
