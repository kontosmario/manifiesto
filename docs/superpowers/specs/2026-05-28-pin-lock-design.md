# PIN de Acceso (4 dígitos) — Design Spec

**Fecha:** 2026-05-28
**Estado:** Aprobado para implementación
**Branch destino:** `feat/pin-lock`

## Problema

`AppEntryGate` solo bloquea la app en cold-start si hay biometría guardada:

```ts
if (biometric.shouldUseBiometric && !isAppUnlocked) {
  return <Redirect href="/(auth)/login?autoBiometric=1&lock=1" />
}
```

Un usuario que **no configura biometría** (eligió "Ahora no", o el device no tiene Face ID/huella enrolada) entra **directo a Home sin ningún challenge** en cada cold-start con sesión válida. Es un gap de seguridad: cualquiera que levante el teléfono desbloqueado accede a las finanzas.

## Objetivo

Agregar un **PIN numérico de 4 dígitos** como método de bloqueo **independiente** de la biometría. Configurable al crear la cuenta (pantalla biometric-setup) y desde Settings (igual que la biometría). Cierra el gap dándole al usuario sin biometría una opción de lock.

## Decisiones (confirmadas en brainstorming)

1. **Independiente**: el usuario puede tener biometría, PIN, ambos o ninguno. La app se bloquea en cold-start si hay CUALQUIERA.
2. **PIN erróneo**: sin límite de intentos, con escape "usar contraseña" siempre visible. Sin lockout duro (evita brickear el acceso). El recovery real es ingresar con contraseña.
3. **En el alta**: opcional (se puede saltar, como hoy con biometría).

## No-objetivos

- El PIN **no restaura sesión** (no es una credencial como el refresh token de la biometría). Solo desbloquea una sesión ya válida. Si la sesión expiró, el flujo va a login con contraseña — el PIN no aplica ahí.
- No es defensa criptográfica fuerte (un PIN de 4 dígitos tiene 10.000 combinaciones; un atacante con acceso al Keychain puede fuerza-bruta). El modelo de amenaza es **lock casual** (alguien levanta el teléfono). El verdadero secreto (refresh token) ya vive en Keychain `WHEN_UNLOCKED_THIS_DEVICE_ONLY`.
- Sin biometría obligatoria ni PIN obligatorio en el alta (decisión 3).

## Restricción técnica clave: sin módulos nativos nuevos

`expo-crypto` NO está instalado, y agregar cualquier módulo nativo requiere rebuildear el dev client (lo que crasheó en la saga de `expo-standard-web-crypto` → `ExpoCryptoAES` faltante). Por eso:

- **Hashing: SHA-256 puro-JS** vía `js-sha256` (paquete pure-JS, sin código nativo → sin rebuild, corre en Hermes).
- **Salt**: string aleatorio generado con `Math.random` (16 bytes hex). Para el threat model (lock casual, hash en Keychain), un salt no-cripto es suficiente: su único rol es evitar reuso de rainbow tables cross-device; el hash en sí (vs plaintext) es la protección real.

## Arquitectura

### Storage — `mobile/lib/pin-lock.ts`

Espeja el patrón de `biometric-auth.ts` + `biometric-enabled-flag.ts`:

- **SecureStore** (`keychainAccessible: WHEN_UNLOCKED_THIS_DEVICE_ONLY`):
  - `app-lock.pin.hash` → `sha256(salt + pin)` (hex).
  - `app-lock.pin.salt` → salt hex.
- **AsyncStorage** (flag espejo no-encriptado, mismo rol de tie-breaker que `biometric.enabled`):
  - `app-lock.pin.enabled` → `'1'`.

API:

```ts
export async function setPin(pin: string): Promise<void>
//   genera salt, guarda hash+salt en SecureStore, setea enabled flag.
export async function verifyPin(pin: string): Promise<boolean>
//   lee salt+hash, compara sha256(salt+pin). false si no hay PIN o no matchea.
export async function clearPin(): Promise<void>
//   borra hash+salt+flag.
export async function getPinLockState(): Promise<{ isSet: boolean }>
//   isSet = (hash existe en SecureStore) OR (enabled flag set) — OR para
//   resistir lecturas flaky del keychain, igual que hasSavedCredentials.
```

Validación: `setPin` exige exactamente 4 dígitos (`/^\d{4}$/`); si no, throw (los callers validan UI antes).

### Cold-start check — `mobile/features/auth/use-pin-lock-check.ts`

Espejo de `useColdStartBiometricCheck`. Lee `getPinLockState()` keyed por sessionUserId.

```ts
export interface PinLockDecision { status: 'loading' | 'ready'; isSet: boolean }
export function usePinLockCheck(sessionUserId: string | null | undefined): PinLockDecision
```

Mientras `status === 'loading'` y la app no está unlocked, `AppEntryGate` espera (igual que con biometric).

### Integración en AppEntryGate — `mobile/components/root/app-entry-gate.tsx`

Extender la regla del lock (sesión válida). Hoy:

```ts
if (biometric.shouldUseBiometric && !isAppUnlocked) {
  return <Redirect href="/(auth)/login?autoBiometric=1&lock=1" />
}
```

Nuevo:

```ts
const needsLock =
  (biometric.shouldUseBiometric || pin.isSet) && !isAppUnlocked
if (needsLock) {
  if (biometric.shouldUseBiometric) {
    // Biometría disponible → login lock (Face ID auto-fire) que ofrece
    // "usar PIN" si además hay PIN.
    return <Redirect href="/(auth)/login?autoBiometric=1&lock=1" />
  }
  // Solo PIN → pantalla dedicada de desbloqueo por PIN.
  return <Redirect href="/(auth)/pin-unlock" />
}
```

- El `isLoading` agregado espera la lectura del flag de PIN cuando puede afectar la decisión (sesión válida, no unlocked), igual que con biometric.
- Background re-lock (60s) ya aplica a ambos (comparten `isAppUnlocked`).
- **No-session path**: sin cambios. El PIN no restaura sesión → un usuario con sesión expirada y solo-PIN va a welcome/login (contraseña). Correcto.

### `PinPad` — `mobile/components/auth/pin-pad.tsx`

Componente reusable (setup + unlock):
- 4 puntos (dots) que se llenan según los dígitos ingresados.
- Teclado numérico (1-9, 0, backspace) — botones circulares, estilo del design system, con press feedback (`usePressScale`).
- Props: `value: string`, `onChange: (next: string) => void`, `maxLength = 4`, `onComplete?: (value) => void` (dispara al llegar a maxLength). Estado de error (shake/clear) controlado por el padre.
- Sin decimales (a diferencia de `InAppNumpad`, que es para montos). Componente nuevo dedicado.
- Reanimated para el shake en error (translateX corto) + el llenado de dots.

### Pantalla de seteo — `mobile/screens/auth/pin-setup-screen.tsx`

Flujo de 2 pasos con `PinPad`:
1. **Ingresá tu PIN** (4 dígitos) → al completar, pasa a confirmar.
2. **Confirmá tu PIN** (re-ingresar) → si matchea: `setPin()` + callback de éxito; si no: error ("No coincide"), vuelve al paso 1, limpia.

Props: `onDone: () => void` (qué hacer al guardar/cancelar), `onCancel?`. Header con título contextual + botón volver/cancelar.

Ruta: **`/(app)/pin-setup`** (registrada en `app-stack-shell.tsx`, presentación modal, `gestureEnabled` permitido para cancelar). Usada desde biometric-setup (alta) y Settings.

### Pantalla de desbloqueo — `mobile/screens/auth/pin-unlock-screen.tsx`

Lock screen dedicada (aislada del `login-screen` complejo):
- Header brand (logo/nombre) + "Ingresá tu PIN".
- `PinPad`; al completar 4 dígitos → `verifyPin()`:
  - ok → `markAppUnlocked()` + `router.replace('/')`.
  - falla → error + haptic 'error' + shake + limpia los 4 dots. Sin límite de intentos.
- **Escape siempre visible**: "Olvidé mi PIN" → `logoutSession()` (que limpia el PIN, ver Recovery) → re-login con contraseña.
- No usa `RequireGuest`/`RequireAuth` con redirect a onboarding (mismo cuidado que biometric-setup) — chequeo manual de sesión: sin sesión → redirect welcome.

Ruta: **`/(auth)/pin-unlock`** (grupo auth, como el login lock). `gestureEnabled: false` (no se puede swipe-back para evitar el lock).

### Login lock screen — `mobile/screens/auth/login-screen.tsx` (cambio chico)

En modo lock (`?lock=1`), cuando además hay PIN seteado, agregar un botón secundario **"Usar PIN"** que navega a `/(auth)/pin-unlock`. Cambio mínimo (un botón condicional); la lógica de Face ID intacta.

### biometric-setup — `mobile/screens/auth/biometric-setup-screen.tsx`

Agregar la opción PIN:
- **Modo A** (Face ID disponible): primary "Activar Face ID", secondary **"Usar un PIN"** (→ navega a pin-setup), tertiary "Ahora no".
- **Modo B** (sin biometría): primary **"Crear un PIN"** (→ pin-setup), secondary "Ahora no".
- Tras setear PIN (vuelve de pin-setup) o activar biometría o saltar → `markBiometricSetupShown(userId)` + avanza a onboarding. (El flag existente `biometric-setup-shown` sigue gobernando que la pantalla se muestre una sola vez.)

### Settings — `mobile/screens/settings/settings-screen.tsx`

Fila nueva "PIN de acceso" (junto a "Acceso rápido"/biometría), grupo de seguridad:
- Value: `Activado` / `Desactivado`.
- Off → navega a pin-setup (ingresar + confirmar) → guarda → refresca estado.
- On → Alert con opciones: "Cambiar PIN" (→ pin-setup) / "Quitar PIN" (→ `clearPin()` + refresca) / "Cancelar".
- Estado vía un pequeño hook/estado local que lee `getPinLockState()` (refresca al volver de pin-setup con `useFocusEffect` o al montar).

### Recovery / logout — `mobile/features/auth/logout.ts`

`logoutSession` limpia el PIN (device-local, igual que limpia las credenciales biométricas):

```ts
const { clearPin } = await import('@/lib/pin-lock')
// ... junto a clearBiometricCredentials()
await clearPin()
```

Así, "Olvidé mi PIN" (que dispara logout) → re-login con contraseña → sin PIN → el usuario puede setear uno nuevo en Settings. No queda lockeado con un PIN olvidado.

## Edge cases

| Caso | Comportamiento |
|---|---|
| Solo PIN, cold-start, sesión válida | AppEntryGate → `/(auth)/pin-unlock` → verify → home |
| Biometría + PIN, cold-start | login lock (Face ID auto-fire) + "Usar PIN" → pin-unlock |
| Ni biometría ni PIN | sin lock (entra directo) — decisión 3 (opcional) |
| Sesión expirada, solo PIN | welcome/login (contraseña); el PIN no restaura sesión |
| PIN olvidado | "Olvidé mi PIN" → logout (limpia PIN) → re-login → setear nuevo |
| Background > 60s | re-lock (ya implementado) → AppEntryGate re-evalúa → pin-unlock si solo-PIN |
| Logout | `clearPin()` limpia el PIN del device saliente |
| Lectura flaky del keychain | `getPinLockState` usa OR (hash OR enabled flag) → no bypassa el lock |
| PIN no-4-dígitos en setPin | throw (UI valida antes; defensivo) |
| Confirmación no coincide (setup) | error, vuelve al paso 1, limpia |

## Testing

### Unit (vitest)
- `pin-lock.test.ts` (mock SecureStore + AsyncStorage + js-sha256): setPin guarda hash≠plaintext; verifyPin true para el PIN correcto, false para incorrecto/ausente; clearPin limpia; getPinLockState OR de las dos señales; salt hace que dos devices con el mismo PIN tengan hashes distintos; setPin con no-4-dígitos throw.
- `use-pin-lock-check.test.ts`: status loading→ready, isSet refleja getPinLockState, re-evalúa al cambiar userId.
- `pin-pad-model.test.ts` (si extraigo la lógica de append/backspace/complete a una función pura): append respeta maxLength, backspace, onComplete al llegar a 4.

### Smoke manual (device, dark + light)
1. Alta nueva sin biometría → biometric-setup modo B → "Crear un PIN" → ingresar+confirmar → onboarding. Cerrar app → reabrir → pin-unlock → ingresar PIN → home.
2. Alta con biometría → modo A → "Usar un PIN" → setear → onboarding. Cold-start → Face ID + "Usar PIN" → pin-unlock funciona.
3. PIN incorrecto → error + shake, sin lockout, "Olvidé mi PIN" visible.
4. "Olvidé mi PIN" → logout → re-login con contraseña → entra → Settings muestra PIN Desactivado.
5. Settings: setear PIN, cambiar PIN, quitar PIN.
6. Background 60s → vuelve → pide PIN.
7. Logout → re-login → PIN ya no pide (limpiado).

## Estructura de archivos

### Nuevos
| Archivo | Responsabilidad |
|---|---|
| `mobile/lib/pin-lock.ts` | Storage + hash + verify + state |
| `mobile/features/auth/use-pin-lock-check.ts` | Cold-start PIN state |
| `mobile/components/auth/pin-pad.tsx` | 4 dots + keypad reusable |
| `mobile/components/auth/pin-pad-model.ts` | Lógica pura (append/backspace/complete) |
| `mobile/screens/auth/pin-setup-screen.tsx` | Flujo ingresar+confirmar |
| `mobile/screens/auth/pin-unlock-screen.tsx` | Lock screen por PIN |
| `app/(app)/pin-setup.tsx` | Ruta wrapper de setup |
| `app/(auth)/pin-unlock.tsx` | Ruta wrapper de unlock |
| `tests/unit/pin-lock.test.ts` | Tests storage |
| `tests/unit/use-pin-lock-check.test.ts` | Tests cold-start |
| `tests/unit/pin-pad-model.test.ts` | Tests lógica keypad |

### Modificados
| Archivo | Cambio |
|---|---|
| `mobile/components/root/app-entry-gate.tsx` | Regla de lock extendida con PIN + `usePinLockCheck` |
| `mobile/screens/auth/login-screen.tsx` | Botón "Usar PIN" en modo lock cuando hay PIN |
| `mobile/screens/auth/biometric-setup-screen.tsx` | Opción "Usar un PIN" / "Crear un PIN" |
| `mobile/screens/settings/settings-screen.tsx` | Fila + handler PIN (set/change/remove) |
| `mobile/components/root/app-stack-shell.tsx` | Registrar `pin-setup` |
| `app/(auth)/_layout.tsx` o stack auth | `pin-unlock` ya cae en el grupo auth |
| `mobile/features/auth/logout.ts` | `clearPin()` |
| `package.json` | dep `js-sha256` (pure JS) |

## Riesgos
- **js-sha256 supply chain**: paquete chico, pure-JS, muy usado. Alternativa: vendorizar ~80 líneas de SHA-256. Si se prefiere cero-deps, vendorizar.
- **Salt no-cripto (Math.random)**: aceptable para el threat model (lock casual). Documentado.
- **pin-unlock fuera del login-screen**: nueva ruta auth; verificar que el guard/redirect no loopee (chequeo manual de sesión, como biometric-setup).
- **`gestureEnabled: false` en pin-unlock**: no se puede swipe-back (correcto, es un lock).

## Métricas de éxito
- Un usuario sin biometría que setea PIN → cold-start pide PIN (gap cerrado).
- Cero reportes de "quedé lockeado sin poder entrar" (escape por contraseña siempre disponible).
