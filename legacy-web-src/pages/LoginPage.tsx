import type { FormEvent } from 'react'
import { useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import {
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonContent,
  IonInput,
  IonItem,
  IonLabel,
  IonPage,
  IonSegment,
  IonSegmentButton,
  IonText,
} from '@ionic/react'
import { useHistory } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { getErrorMessage } from '../utils/errorMessage'
import './pages.css'

type AuthMode = 'sign-in' | 'sign-up'
type SignUpFlow = 'create' | 'join'

interface SignInPayload {
  email: string
  password: string
}

interface SignUpPayload {
  email: string
  password: string
  displayName: string
  flow: SignUpFlow
}

const DISPLAY_NAME_OPTIONS = ['Marito', 'Len'] as const

function normalizeEmail(rawEmail: string): string {
  return rawEmail.trim().toLowerCase()
}

function getEmailRedirectTo(): string {
  const configuredUrl = import.meta.env.VITE_AUTH_REDIRECT_URL?.trim()
  if (configuredUrl) {
    return configuredUrl
  }

  const baseUrl = import.meta.env.BASE_URL || '/'
  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`

  return `${window.location.origin}${normalizedBaseUrl}`
}

export default function LoginPage() {
  const history = useHistory()

  const [mode, setMode] = useState<AuthMode>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState<string>(DISPLAY_NAME_OPTIONS[0])
  const [signUpFlow, setSignUpFlow] = useState<SignUpFlow>('create')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [infoMessage, setInfoMessage] = useState<string | null>(null)

  const signInMutation = useMutation({
    mutationFn: async ({ email: rawEmail, password: rawPassword }: SignInPayload) => {
      const { error } = await supabase.auth.signInWithPassword({
        email: normalizeEmail(rawEmail),
        password: rawPassword,
      })

      if (error) {
        throw error
      }
    },
    onSuccess: () => {
      history.replace('/app')
    },
    onError: (error: unknown) => {
      setErrorMessage(getErrorMessage(error, 'No se pudo iniciar sesión.'))
    },
  })

  const signUpMutation = useMutation({
    mutationFn: async ({
      email: rawEmail,
      password: rawPassword,
      displayName: rawDisplayName,
      flow,
    }: SignUpPayload) => {
      const normalizedDisplayName = rawDisplayName.trim()
      if (!normalizedDisplayName) {
        throw new Error('El display name no puede estar vacío.')
      }

      const { data, error } = await supabase.auth.signUp({
        email: normalizeEmail(rawEmail),
        password: rawPassword,
        options: {
          emailRedirectTo: getEmailRedirectTo(),
          data: {
            display_name: normalizedDisplayName,
          },
        },
      })

      if (error) {
        throw error
      }

      return {
        hasSession: Boolean(data.session),
        flow,
      }
    },
    onSuccess: ({ hasSession, flow }) => {
      if (!hasSession) {
        setInfoMessage(
          'Cuenta creada. Revisá tu email para confirmar y luego iniciá sesión.',
        )
        setMode('sign-in')
        return
      }

      if (flow === 'create') {
        history.replace('/join?autoCreate=1')
        return
      }

      history.replace('/join')
    },
    onError: (error: unknown) => {
      setErrorMessage(getErrorMessage(error, 'No se pudo crear la cuenta.'))
    },
  })

  const isSubmitting = signInMutation.isPending || signUpMutation.isPending

  const authSubtitle = useMemo(() => {
    if (mode === 'sign-in') {
      return 'Ingresá con email y password'
    }

    return 'Creá cuenta y guardá tu display name'
  }, [mode])

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setErrorMessage(null)
    setInfoMessage(null)

    const normalizedEmail = normalizeEmail(email)
    if (!normalizedEmail || !password.trim()) {
      setErrorMessage('Completá email y password.')
      return
    }

    if (mode === 'sign-in') {
      signInMutation.mutate({ email: normalizedEmail, password })
      return
    }

    if (!displayName.trim()) {
      setErrorMessage('Completá el display name.')
      return
    }

    signUpMutation.mutate({
      email: normalizedEmail,
      password,
      displayName,
      flow: signUpFlow,
    })
  }

  return (
    <IonPage>
      <IonContent className="auth-content" fullscreen>
        <div className="auth-shell">
          <IonCard className="auth-card">
            <IonCardHeader>
              <IonCardTitle>Gastos Familia</IonCardTitle>
              <p className="card-subtitle">{authSubtitle}</p>
            </IonCardHeader>
            <IonCardContent>
              <IonSegment
                value={mode}
                onIonChange={(event) => {
                  const nextMode = event.detail.value as AuthMode | undefined
                  if (nextMode) {
                    setMode(nextMode)
                  }
                }}
              >
                <IonSegmentButton value="sign-in">
                  <IonLabel>Ingresar</IonLabel>
                </IonSegmentButton>
                <IonSegmentButton value="sign-up">
                  <IonLabel>Crear cuenta</IonLabel>
                </IonSegmentButton>
              </IonSegment>

              <form className="stacked-form" onSubmit={handleSubmit}>
                <IonItem lines="full">
                  <IonLabel position="stacked">Email</IonLabel>
                  <IonInput
                    inputmode="email"
                    placeholder="mario@email.com"
                    type="email"
                    value={email}
                    onIonInput={(event) => setEmail(event.detail.value ?? '')}
                  />
                </IonItem>

                <IonItem lines="full">
                  <IonLabel position="stacked">Password</IonLabel>
                  <IonInput
                    placeholder="********"
                    type="password"
                    value={password}
                    onIonInput={(event) => setPassword(event.detail.value ?? '')}
                  />
                </IonItem>

                {mode === 'sign-up' && (
                  <>
                    <IonItem lines="full">
                      <IonLabel position="stacked">Sugerencia rápida</IonLabel>
                      <IonSegment
                        value={displayName}
                        onIonChange={(event) => {
                          const value = event.detail.value
                          if (typeof value === 'string') {
                            setDisplayName(value)
                          }
                        }}
                      >
                        {DISPLAY_NAME_OPTIONS.map((name) => (
                          <IonSegmentButton key={name} value={name}>
                            <IonLabel>{name}</IonLabel>
                          </IonSegmentButton>
                        ))}
                      </IonSegment>
                    </IonItem>

                    <IonItem lines="full">
                      <IonLabel position="stacked">Display name</IonLabel>
                      <IonInput
                        placeholder="Tu nombre para mostrar"
                        type="text"
                        value={displayName}
                        onIonInput={(event) => setDisplayName(event.detail.value ?? '')}
                      />
                    </IonItem>

                    <IonItem lines="none">
                      <IonLabel position="stacked">Después de crear cuenta</IonLabel>
                      <IonSegment
                        value={signUpFlow}
                        onIonChange={(event) => {
                          const flow = event.detail.value as SignUpFlow | undefined
                          if (flow) {
                            setSignUpFlow(flow)
                          }
                        }}
                      >
                        <IonSegmentButton value="create">
                          <IonLabel>Crear familia</IonLabel>
                        </IonSegmentButton>
                        <IonSegmentButton value="join">
                          <IonLabel>Unirme por código</IonLabel>
                        </IonSegmentButton>
                      </IonSegment>
                    </IonItem>
                  </>
                )}

                {errorMessage && (
                  <IonText color="danger">
                    <p className="inline-message">{errorMessage}</p>
                  </IonText>
                )}

                {infoMessage && (
                  <IonText color="success">
                    <p className="inline-message">{infoMessage}</p>
                  </IonText>
                )}

                <IonButton className="submit-button" disabled={isSubmitting} expand="block" type="submit">
                  {isSubmitting
                    ? 'Procesando...'
                    : mode === 'sign-in'
                      ? 'Ingresar'
                      : 'Crear cuenta'}
                </IonButton>
              </form>
            </IonCardContent>
          </IonCard>
        </div>
      </IonContent>
    </IonPage>
  )
}
