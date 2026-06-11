import * as Linking from 'expo-linking'
import { isExpoGo } from '@/lib/runtime-environment'
import { checkPasswordPolicy } from '@/features/auth/password-policy'

export type AuthMode = 'sign-in' | 'sign-up'

export interface AuthHelperCopy {
  buttonLabel: string
  subtitle: string
  title: string
}

export interface AuthSubmissionDraft {
  displayName: string
  email: string
  mode: AuthMode
  password: string
}

export interface AuthSubmissionPayload {
  displayName: string
  email: string
  password: string
}

export function normalizeEmail(rawEmail: string) {
  return rawEmail.trim().toLowerCase()
}

// Hardcoded — do NOT read this from EXPO_PUBLIC_AUTH_REDIRECT_PATH.
// A build-time env override would let an unaudited deploy redirect
// confirmation emails to any deep-link path on the manifiesto://
// scheme. The auth callback screen is the only legitimate landing
// point for OAuth redirects.
const AUTH_REDIRECT_PATH = 'auth/callback'
// El reset de contraseña tiene su propio path porque la pantalla destino
// pide setear contraseña nueva — distinto del flujo de confirmación de
// email normal que solo abre sesión y manda al home.
const AUTH_RESET_PASSWORD_PATH = 'auth/reset-password'
// Universal Link del reset (2026-06-11). Por qué NO Linking.createURL
// en builds reales:
//   1. El link del mail pasa por supabase.co/auth/v1/verify → 302 al
//      redirect_to. iOS NO dispara Universal Links desde redirects,
//      así que el redirect aterriza en la landing del sitio
//      (manifiestoapp.com/auth/reset-password) que rebota a la app vía
//      scheme + botón manual — y sirve de fallback sin app instalada.
//   2. El https:// está en el allowlist de Supabase (auth/** wildcard);
//      el exp:// de Expo Go NO lo está → Supabase caía al Site URL y el
//      user terminaba en la home del sitio ("nos redirige a
//      manifiesto.com", bug reportado).
// En Expo Go mantenemos createURL (exp://...) para poder probar
// end-to-end SI se agrega el exp:// al allowlist — ver
// docs/sistemas/password-reset.md.
const RESET_PASSWORD_UNIVERSAL_LINK =
  'https://manifiestoapp.com/auth/reset-password'

export function getEmailRedirectTo() {
  return Linking.createURL(AUTH_REDIRECT_PATH)
}

export function getPasswordResetRedirectTo() {
  if (isExpoGo) return Linking.createURL(AUTH_RESET_PASSWORD_PATH)
  return RESET_PASSWORD_UNIVERSAL_LINK
}

export function buildAuthHelperCopy(mode: AuthMode): AuthHelperCopy {
  if (mode === 'sign-in') {
    return {
      buttonLabel: 'Continuar',
      subtitle: 'Finanzas claras, todos los días.',
      title: 'Entrá a tu espacio',
    }
  }

  return {
    buttonLabel: 'Crear cuenta',
    subtitle: 'Empieza hoy, ordená el resto.',
    title: 'Súmate a Manifiesto',
  }
}

export function validateAuthSubmission(draft: AuthSubmissionDraft) {
  const normalizedEmail = normalizeEmail(draft.email)
  const trimmedPassword = draft.password.trim()
  const trimmedDisplayName = draft.displayName.trim()

  if (!normalizedEmail || !normalizedEmail.includes('@')) {
    return { error: 'Ingresa un email válido.' }
  }

  // Sprint H · H1: differentiate sign-in vs sign-up password validation.
  //   · sign-up: enforce the full local policy (min 10, max 72,
  //     mixed-class, blocklist). Stops trivial passwords at the door.
  //   · sign-in: only enforce non-empty + max 72. We cannot tighten
  //     here without locking out existing users whose passwords pre-
  //     date the policy bump. The server still gets the candidate and
  //     either accepts the password or returns a generic auth error
  //     — no enumeration risk.
  if (draft.mode === 'sign-up') {
    const policy = checkPasswordPolicy(trimmedPassword)
    if (!policy.ok) {
      return { error: policy.error ?? 'La contraseña no cumple los requisitos.' }
    }
  } else {
    if (trimmedPassword.length === 0) {
      return { error: 'Ingresa tu contraseña.' }
    }
    if (trimmedPassword.length > 72) {
      return { error: 'La contraseña no puede tener más de 72 caracteres.' }
    }
  }

  if (draft.mode === 'sign-up' && trimmedDisplayName.length < 2) {
    return { error: 'Agrega un nombre para tu perfil.' }
  }

  return {
    value: {
      displayName: trimmedDisplayName,
      email: normalizedEmail,
      password: trimmedPassword,
    } satisfies AuthSubmissionPayload,
  }
}
