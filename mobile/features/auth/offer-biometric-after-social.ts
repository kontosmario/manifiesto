import {
  getBiometricLoginState,
  saveBiometricCredentials,
} from '@/lib/biometric-auth'
import { promptBiometricEnrollment } from '@/features/auth/biometric-enrollment-prompt'
import { supabase } from '@/lib/supabase'

// Una cuenta recién creada por social tiene `created_at` ~ ahora; una
// existente (aunque recién vincule Google/Apple) conserva su created_at
// original. 5 min cubre cualquier skew de reloj y deja afuera solo a las
// cuentas genuinamente nuevas de este flujo.
const BRAND_NEW_ACCOUNT_WINDOW_MS = 5 * 60_000

/**
 * Tras un sign-in social (Apple/Google) exitoso, ofrece el MISMO
 * enrolamiento de Face ID que el login con email/contraseña
 * (`persistBiometricCredentials`). Está basado en el refresh token de la
 * sesión, NO en el password, así que funciona para usuarios social-only.
 *
 * Reglas:
 *  - Salta cuentas **recién creadas** (created_at < 5 min): esas van a la
 *    pantalla `biometric-setup`, así que prompteear aquí sería doble. Usamos
 *    `created_at` y NO el flag `getBiometricSetupShown`, porque ese flag da
 *    falso para cuentas viejas (creadas antes de que existiera esa pantalla)
 *    y las dejaba sin oferta — el bug que esto corrige.
 *  - Si ya hay credenciales → refresca el token en silencio (sin prompt).
 *  - Si no → dispara el prompt "Activa <X> para entrar más rápido".
 *
 * Best-effort: nunca tira. El caller NO debe bloquear el acceso por esto.
 */
export async function offerBiometricEnrollmentAfterSocial(): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession()
    const session = data.session
    const user = session?.user
    const refreshToken = session?.refresh_token
    if (!user || !refreshToken) return

    const createdAtMs = user.created_at ? Date.parse(user.created_at) : 0
    const isBrandNewAccount =
      createdAtMs > 0 && Date.now() - createdAtMs < BRAND_NEW_ACCOUNT_WINDOW_MS
    if (isBrandNewAccount) return

    const state = await getBiometricLoginState()
    if (!state.isAvailable) return

    // Sin credenciales → ofrecé activar (prompt), con memoria del
    // rechazo (cooldown 7 días compartido con el resto del priming).
    if (!state.hasSavedCredentials) {
      const accepted = await promptBiometricEnrollment(state.label)
      if (!accepted) return
    }

    // hasSavedCredentials=true → refresca el refresh token guardado (Supabase
    // los rota); =false tras prompt OK → enrola por primera vez.
    await saveBiometricCredentials({
      email: user.email ?? '',
      refreshToken,
    })
  } catch {
    // no-op: el enrolamiento es opcional, no frena el login.
  }
}
