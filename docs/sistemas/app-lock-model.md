# Modelo de App-Lock (3 estados)

> Sprint R-1 (2026-06-10) — backbone. Reemplaza el modelo per-launch +
> background-after-60s previo. Estados R-2/R-3 quedan referenciados pero
> aún no implementados.

## Estados

| Estado | Color | Significado | Recuperación |
|--------|-------|-------------|--------------|
| Unlocked | Verde | Uso normal de la app. Todas las superficies accesibles. | — |
| Soft-lock | Amarillo | La sesión Supabase sigue siendo válida pero el usuario debe re-autenticar con Face ID / Touch ID / PIN para volver a entrar. | Biometría o PIN. |
| Hard-lock | Rojo | Se perdió la sesión (logout explícito o refresh-token expirado). Hay que iniciar sesión con email + password (o magic link). | Sign-in completo. |

La transición Unlocked → Soft-lock no toca el storage de Supabase: el
refresh-token permanece en Keychain. La transición a Hard-lock sí lo
invalida.

## Triggers

| Trigger | Estado resultante | Implementado |
|---------|-------------------|---------------|
| Cold start con biometría/PIN configurado | Soft-lock | Sí (AppEntryGate + `app-lock-state.ts`) |
| Background > `LOCK_THRESHOLDS.background` (5 min) | Soft-lock | Sí (BackgroundRelockWatcher) |
| Background > `LOCK_THRESHOLDS.sensitiveBackground` (30 s) en pantalla sensible | Soft-lock | Pendiente — Sprint R-2 |
| Inactividad en foreground > `LOCK_THRESHOLDS.inactivity` (15 min) | Soft-lock | Pendiente — Sprint R-2 |
| Logout explícito desde Ajustes | Hard-lock | Sí (`logout.ts`) |
| Refresh-token expirado | Hard-lock | Sí (Supabase auto-signout) |

Los thresholds viven en `mobile/features/auth/lock-thresholds.ts` —
fuente única de verdad. Cambios a esos valores deben actualizar este
documento.

## Estrategias para reducir fricción

- **Grace de 30 s post-unlock** (`LOCK_THRESHOLDS.unlockGrace`). Tras
  un unlock exitoso, un dip rápido a background (Control Center, alerta
  del sistema, swipe up a multitask) NO dispara re-lock. Evita el caso
  común "abrí, autentiqué, leí una noti, me pide Face ID de nuevo".
- **Reset del timer de inactividad en cualquier interacción del
  usuario** (tap, scroll, type). Solo el wall-clock sin input cuenta
  hacia el threshold; mirar la pantalla quieto no penaliza.
- **Pantallas sensibles usan un threshold de background más estricto**
  (30 s en lugar de 5 min). Cubre delete-account, password-change,
  payment-confirm — superficies donde la fricción extra está
  justificada por el riesgo.
- **Auto-recovery del refresh-token** (ya implementado en
  `use-auth-biometric-controller.ts`). Si el token rotó server-side el
  próximo manual sign-in lo refresca silenciosamente sin que el usuario
  tenga que reactivar Face ID en Settings.

## Referencias en código

| Concern | Archivo |
|---------|---------|
| Thresholds (single source of truth) | `mobile/features/auth/lock-thresholds.ts` |
| Decisión pura de background-relock | `mobile/features/auth/background-relock.ts` |
| Wiring AppState del background-relock | `mobile/components/root/background-relock-watcher.tsx` |
| Estado in-memory del lock | `mobile/features/auth/app-lock-state.ts` |
| Re-enroll biometría tras sign-in | `mobile/features/auth/use-login-submit.ts` + `use-auth-biometric-controller.ts` |
| Gate de entrada | `mobile/components/root/app-entry-gate.tsx` |
| Logout (hard-lock) | `mobile/features/auth/logout.ts` |

## Caveat conocido — declina del prompt Face ID

Si el usuario completa un sign-in manual exitoso pero **rechaza** el
prompt `Activa Face ID para entrar más rápido…`, no se guardan
credenciales biométricas. Resultado: la app queda con sesión válida
pero sin capa de lock. El próximo foreground entra directo al home.

R-3 (sticky biometric/PIN modal) lo resuelve forzando al usuario a
elegir un método de lock (o a opt-out explícito vía Ajustes) en lugar
de aceptar el "no thanks" silencioso.

## Preguntas abiertas para post-launch

- **Ajuste "Sensibilidad de bloqueo"** (Estricto / Normal / Relajado)
  en Ajustes. Multiplicador sobre `LOCK_THRESHOLDS.background` e
  `inactivity` (e.g. Estricto = 0.2×, Relajado = 3×). Decisión depende
  de feedback real: si el 5 min default ya satisface a >90% de los
  usuarios no agregar la perilla.
- **Long-session age check** — sesiones con > 7 días requieren password
  aunque la biometría matche. Defensa en profundidad ante un device
  perdido cuya biometría fue agregada por el atacante.
- **Re-evaluar `unlockGrace` 30 s** con telemetría de iOS notification
  center peeks (es típico que tomen 2-5 s; 30 s puede ser demasiado
  laxo si el ataque modelo es "device pickpocket que mira mientras yo
  uso la app").
- **Pantallas sensibles** — definir la lista concreta (delete-account,
  cambio de password, confirmación de cobro de meta de ahorro?,
  export/share de datos personales?) y el mecanismo para marcarlas
  (HOC / route-config / hook).
