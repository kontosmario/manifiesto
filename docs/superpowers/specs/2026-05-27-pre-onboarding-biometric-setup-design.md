# Pre-Onboarding Biometric Setup — Design Spec

**Fecha:** 2026-05-27
**Estado:** Aprobado para implementación
**Branch destino:** `feat/pre-onboarding-biometric-setup`

## Problema

Una cuenta nueva pasa directo de signup al wizard de onboarding sin pasar por la activación de Face ID / huella. La biometría solo es accesible más tarde desde Settings → Seguridad, lo que significa:

- El usuario configura sus finanzas y entra al home sin protección biométrica activa
- El primer cold-start después del onboarding no tiene "App Lock" porque no hay credenciales guardadas
- La activación queda como tarea escondida en Settings (alto drop-off)

Queremos que **toda cuenta nueva tome una decisión consciente sobre Face ID antes de entrar al wizard de finanzas**.

## Objetivo

Insertar una pantalla intermedia `/(app)/biometric-setup` entre signup y el wizard de onboarding, controlada por `AppEntryGate` con un flag local por-usuario, que ofrece activar Face ID (o explica que el dispositivo no tiene biometría enrolada) antes de continuar.

## No-objetivos

- No reemplaza la entrada de Settings → Seguridad (sigue existiendo para toggle on/off post-onboarding)
- No agrega validación adicional en App Lock (la regla existente de cold-start ya cubre eso)
- No es obligatorio activar — el usuario puede saltearlo con "Ahora no" y configurarlo después
- No aplica a usuarios existentes ya con `onboarding_completed_at` (no re-prompteamos)

## Arquitectura

```
signup-screen (email+pass / Apple / Google)
        ↓
router.replace('/(app)/biometric-setup')
        ↓
AppEntryGate evalúa:
  ¿sesión válida + !onboarding_completed_at + !biometricSetupShown(userId)?
    SÍ → /(app)/biometric-setup
    NO → /(app)/onboarding (regla preexistente)
        ↓
biometric-setup-screen detecta modo (A: disponible / B: no enrolada)
        ↓
Usuario decide → markBiometricSetupShown(userId) → router.replace('/(app)/onboarding')
```

**Decisión de gating clave:** La nueva regla en `AppEntryGate` **no** depende de si hay biometría enrolada en el device. Entramos a la pantalla siempre que `biometricSetupShown=false`; la pantalla internamente decide qué modo renderizar (A o B). Esto garantiza la "decisión consciente" del usuario incluso cuando no hay hardware, vía mensaje educativo.

## Componentes nuevos

### Archivos

| Archivo | Responsabilidad |
|---|---|
| `app/(app)/biometric-setup.tsx` | Ruta wrapper. Patrón idéntico a `app/(app)/onboarding.tsx`: chequea sesión, loading, redirect a welcome si no hay user. |
| `mobile/screens/auth/biometric-setup-screen.tsx` | Pantalla con dos modos visuales (A: activar / B: informativo) |
| `mobile/features/auth/biometric-setup-flag.ts` | Flag local por usuario: `getBiometricSetupShown(userId)`, `markBiometricSetupShown(userId)`, `clearBiometricSetupShown(userId)` (AsyncStorage). |
| `mobile/features/auth/should-show-biometric-setup.ts` | Pure decision fn para AppEntryGate. |
| `tests/unit/should-show-biometric-setup.test.ts` | Tests de la decisión (8 combinaciones). |
| `tests/unit/biometric-setup-flag.test.ts` | Tests del flag (get/set/clear/aislamiento entre userIds). |

### Componentes modificados

| Archivo | Cambio |
|---|---|
| `mobile/components/root/app-entry-gate.tsx` | Nueva regla insertada **antes** del redirect a `/(app)/onboarding`. Después de la regla "biometric setup → login con autoBiometric=1" (returner) y antes de la regla "sin onboarding → wizard". |
| `mobile/screens/auth/signup-screen.tsx` | Cambiar `/(app)/onboarding` → `/(app)/biometric-setup` en los 2 handlers (email+pass y Apple/Google). |
| `mobile/features/auth/logout.ts` | Limpiar `biometric-setup-shown:<userId>` (consistente con cómo ya limpia tour flags + backfill-done). |

## Pantalla — dos modos

### Modo A — biometría disponible (path por defecto)

```
┌─────────────────────────────────┐
│           [Face ID icon]        │
│                                 │
│        Activá Face ID           │
│   Entrá más rápido y con más    │
│           seguridad.            │
│                                 │
│  ┌─────────────────────────┐    │
│  │   Activar Face ID       │    │  ← primary CTA
│  └─────────────────────────┘    │
│  ┌─────────────────────────┐    │
│  │      Ahora no           │    │  ← ghost CTA
│  └─────────────────────────┘    │
└─────────────────────────────────┘
```

**Comportamiento:**
- **"Activar Face ID"**:
  1. Dispara `persistBiometricCredentials(email, { shouldPromptSetup: true })`
  2. Si éxito: marca flag → `router.replace('/(app)/onboarding')`
  3. Si fallo/cancela del prompt: toast suave ("Podés activarlo después en Ajustes") → marca flag igual → `router.replace('/(app)/onboarding')`
  - Marcar flag tras fallo es intencional: el usuario ya tomó la decisión de intentar; no queremos volver a mostrar la pantalla en el siguiente cold-start si no completó onboarding.
- **"Ahora no"**: marca flag → `router.replace('/(app)/onboarding')`

### Modo B — sin biometría enrolada en el device

```
┌─────────────────────────────────┐
│            [Lock icon]          │
│                                 │
│       Activalo cuando quieras   │
│  Tu dispositivo no tiene        │
│  Face ID o huella configurada.  │
│  Podés activarlo más adelante   │
│  desde Ajustes → Seguridad.     │
│                                 │
│  ┌─────────────────────────┐    │
│  │       Continuar         │    │  ← primary CTA
│  └─────────────────────────┘    │
└─────────────────────────────────┘
```

**Comportamiento:**
- **"Continuar"**: marca flag → `router.replace('/(app)/onboarding')`

### Texto label dinámico

El label "Face ID" se reemplaza dinámicamente según `getBiometricLoginState().label` (Face ID / Touch ID / "biometría"). Patrón ya usado en Settings.

## Lógica de gating

### `shouldShowBiometricSetup` (pure fn)

```ts
export function shouldShowBiometricSetup(input: {
  sessionUserId: string | null | undefined
  onboardingCompletedAt: string | null | undefined
  biometricSetupShown: boolean
  biometricStateLoaded: boolean
}): boolean {
  return Boolean(
    input.sessionUserId &&
    !input.onboardingCompletedAt &&
    !input.biometricSetupShown &&
    input.biometricStateLoaded
  )
}
```

### Insertion point en AppEntryGate

El orden actual de reglas (simplificado):

```
1. Sin sesión + biometric guardado → /(auth)/login?autoBiometric=1
2. Sin sesión → /(auth)/welcome
3. Sesión + biometric guardado + !unlocked → /(auth)/login?autoBiometric=1&lock=1
4. Sesión + !onboarding_completed_at → /(app)/onboarding   ← INSERT BEFORE
5. Sin familia → /(auth)/join
6. else → /(app)/(tabs)/home
```

Nueva regla 4-pre:

```
4a. Sesión + !onboarding_completed_at + !biometric-setup-shown
        → /(app)/biometric-setup
4b. Sesión + !onboarding_completed_at + biometric-setup-shown
        → /(app)/onboarding
```

### `biometric-setup-flag.ts` (interfaz)

```ts
const KEY_PREFIX = 'biometric-setup-shown:'

export async function getBiometricSetupShown(userId: string): Promise<boolean>
export async function markBiometricSetupShown(userId: string): Promise<void>
export async function clearBiometricSetupShown(userId: string): Promise<void>
```

Storage: AsyncStorage. Key namespaced por userId para aislar cuentas en el mismo device (mismo patrón que tour flags).

## Edge cases

| Caso | Comportamiento |
|---|---|
| **Magic link de confirmación de email** | Usuario vuelve a la app con sesión válida (deep link). AppEntryGate detecta `!onboarding_completed_at + !flag` → biometric-setup. ✅ |
| **Apple/Google sign-up** | Handler redirige a `/(app)/biometric-setup` directo. ✅ |
| **Usuario cierra app durante setup** | Cold-start → AppEntryGate ve flag=false → biometric-setup. ✅ |
| **Logout durante setup** | `logout.ts` limpia el flag para ese userId → siguiente login → biometric-setup vuelve a aparecer. ✅ |
| **Returner con sesión válida + onboarding completo** | Regla `!onboardingCompletedAt` lo excluye. ✅ |
| **Returner con biometría guardada + app-lock activo** | La regla 3 (cold-start lock) corre antes que la 4a, no se ve afectada. ✅ |
| **Hot-restart durante biometric-setup** | AppEntryGate re-evalúa → flag sigue false → vuelve a biometric-setup. ✅ |
| **Prompt biométrico falla** | Marcar flag igual (decisión consciente tomada), seguir a onboarding. ✅ |
| **Reinstalación de app** | AsyncStorage se limpia → flag false → biometric-setup vuelve a aparecer (deseado: device-specific). ✅ |

## Testing

### Unit tests

**`should-show-biometric-setup.test.ts`** — pure fn, 8 casos:
1. Sin session → false
2. Con session + onboarding completo → false
3. Con session + !onboarding + flag=true → false
4. Con session + !onboarding + flag=false + biometricStateLoaded=false → false (esperando carga)
5. Con session + !onboarding + flag=false + biometricStateLoaded=true → true (caso principal)
6. session=undefined → false
7. onboardingCompletedAt=undefined → true (sin completar = mostrar)
8. Combinación con todos los flags edge

**`biometric-setup-flag.test.ts`** — AsyncStorage mock:
1. `getBiometricSetupShown(userId)` con flag inexistente → false
2. `markBiometricSetupShown` seguido de `get` → true
3. `clearBiometricSetupShown` seguido de `get` → false
4. Dos userIds distintos: marcar uno NO afecta al otro (aislamiento)

### Smoke tests manuales (en device)

1. **Cuenta nueva email+pass + biometría disponible**: signup → biometric-setup modo A → "Activar Face ID" → prompt iOS → wizard → ... → home
2. **Cuenta nueva email+pass + "Ahora no"**: signup → biometric-setup modo A → "Ahora no" → wizard → ... → home
3. **Simulador sin biometría enrolada**: signup → biometric-setup modo B → "Continuar" → wizard
4. **Apple sign-in nuevo**: signup Apple → biometric-setup → wizard
5. **Magic link**: signup con email confirm → magic link → app reabre con sesión → biometric-setup → wizard
6. **Logout mid-onboarding**: signup → biometric-setup → "Ahora no" → en wizard hace logout → re-login (login screen) → biometric-setup vuelve a aparecer
7. **Hot-restart durante biometric-setup**: signup → biometric-setup (no toca nada) → kill app → reabrir → vuelve a biometric-setup
8. **Returner con onboarding completo**: login con cuenta ya completada → home (no aparece biometric-setup)

## Diseño visual (alineado a la app)

- **Background**: theme-aware (NO brand-fixed; respeta light/dark del sistema, como Settings)
- **Hero icon**: ícono de SF Symbols / Lucide adecuado (`face.smiling` o `faceid` en iOS, fallback `lock` en otros). Tamaño grande (~80px), color `accent` (verde manifiesto).
- **Tipografía**: hereda del design system de la app (mismo `Heading` + `Body` que onboarding-success)
- **CTAs**: `PrimaryButton` (Activar/Continuar) + `GhostButton` (Ahora no)
- **Entrada**: `ModalContentEntrance` o `RiseView` stagger consistente con onboarding-success (100/180/260, duración 620ms)
- **StatusBar**: respeta theme (no forzar light/dark)
- **No back button**: gestureEnabled=false en route options (igual que onboarding y onboarding-success)

## Migración / backwards compat

Cero migraciones de DB. El flag es device-local en AsyncStorage. Usuarios existentes con `onboarding_completed_at` jamás llegan a la pantalla (regla `!onboardingCompletedAt`).

Si después de mergear este feature un usuario actual ya está mid-onboarding (estado raro pero posible si abandonaron la app sin completar y el redeploy los pesca ahí), la primera vez que abran la app verán biometric-setup. Es comportamiento deseado.

## Riesgos

- **Prompt de Face ID puede fallar silenciosamente en algunos devices** → mitigado con flag-on-fail + toast educativo
- **Usuario confunde "Ahora no" con "Nunca"** → mitigado por el copy de Settings que aclara que se puede activar después
- **Crash si AsyncStorage falla** → `getBiometricSetupShown` retorna `false` ante error (re-prompt es aceptable; no bloquea)

## Métricas de éxito (post-launch)

- % de cuentas nuevas que activan biometría en este step (vs. activarla después en Settings)
- % de drop-off entre biometric-setup y primer step del wizard (debería ser <2%)
