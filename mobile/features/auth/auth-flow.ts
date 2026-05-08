import * as Linking from 'expo-linking'

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

export function getEmailRedirectTo() {
  return Linking.createURL(AUTH_REDIRECT_PATH)
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

  if (trimmedPassword.length < 6) {
    return { error: 'La contraseña debe tener al menos 6 caracteres.' }
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
