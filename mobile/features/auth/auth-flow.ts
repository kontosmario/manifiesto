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
      buttonLabel: 'Entrar',
      subtitle: 'Entrá para continuar.',
      title: 'Ingresar',
    }
  }

  return {
    buttonLabel: 'Crear cuenta',
    subtitle: 'Empezá simple.',
    title: 'Crear cuenta',
  }
}

export function validateAuthSubmission(draft: AuthSubmissionDraft) {
  const normalizedEmail = normalizeEmail(draft.email)
  const trimmedPassword = draft.password.trim()
  const trimmedDisplayName = draft.displayName.trim()

  if (!normalizedEmail || !normalizedEmail.includes('@')) {
    return { error: 'Ingresá un email válido.' }
  }

  if (trimmedPassword.length < 6) {
    return { error: 'La contraseña debe tener al menos 6 caracteres.' }
  }

  if (draft.mode === 'sign-up' && trimmedDisplayName.length < 2) {
    return { error: 'Agregá un nombre para tu perfil.' }
  }

  return {
    value: {
      displayName: trimmedDisplayName,
      email: normalizedEmail,
      password: trimmedPassword,
    } satisfies AuthSubmissionPayload,
  }
}
