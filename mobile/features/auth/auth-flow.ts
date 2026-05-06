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

export function getEmailRedirectTo() {
  const redirectPath = (process.env.EXPO_PUBLIC_AUTH_REDIRECT_PATH ?? 'auth/callback').trim()
  const normalizedPath = redirectPath.startsWith('/') ? redirectPath.slice(1) : redirectPath
  return Linking.createURL(normalizedPath)
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
