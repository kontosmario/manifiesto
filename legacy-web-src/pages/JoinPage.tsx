import { useEffect, useRef, useState } from 'react'
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
  IonSpinner,
  IonText,
} from '@ionic/react'
import { useHistory, useLocation } from 'react-router-dom'
import { useAuthSession } from '../hooks/useAuthSession'
import { useBootstrapFamily, useJoinFamily } from '../hooks/useFamilyActions'
import { getErrorMessage } from '../utils/errorMessage'
import './pages.css'

export default function JoinPage() {
  const history = useHistory()
  const location = useLocation()
  const { data: session } = useAuthSession()
  const userId = session?.user.id

  const [code, setCode] = useState('')
  const autoCreateTriggeredRef = useRef(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const bootstrapMutation = useBootstrapFamily(userId)
  const joinMutation = useJoinFamily(userId)

  const autoCreate = new URLSearchParams(location.search).get('autoCreate') === '1'

  useEffect(() => {
    if (!autoCreate || autoCreateTriggeredRef.current) {
      return
    }

    autoCreateTriggeredRef.current = true

    bootstrapMutation.mutate(undefined, {
      onSuccess: () => {
        history.replace('/app')
      },
      onError: (error: unknown) => {
        setErrorMessage(getErrorMessage(error, 'No se pudo crear la familia automáticamente.'))
      },
    })
  }, [autoCreate, bootstrapMutation, history])

  const handleJoin = () => {
    setErrorMessage(null)

    joinMutation.mutate(code, {
      onSuccess: () => {
        history.replace('/app')
      },
      onError: (error: unknown) => {
        setErrorMessage(
          getErrorMessage(error, 'No se pudo unir a la familia con ese código.'),
        )
      },
    })
  }

  const handleCreateFamily = () => {
    setErrorMessage(null)

    bootstrapMutation.mutate(undefined, {
      onSuccess: () => {
        history.replace('/app')
      },
      onError: (error: unknown) => {
        setErrorMessage(getErrorMessage(error, 'No se pudo crear la familia.'))
      },
    })
  }

  const isLoading = bootstrapMutation.isPending || joinMutation.isPending

  return (
    <IonPage>
      <IonContent className="join-content" fullscreen>
        <div className="auth-shell">
          <IonCard className="auth-card">
            <IonCardHeader>
              <IonCardTitle>Unirme a familia</IonCardTitle>
              <p className="card-subtitle">
                Pegá el código que te compartió el primer usuario.
              </p>
            </IonCardHeader>

            <IonCardContent>
              <IonItem lines="full">
                <IonLabel position="stacked">Family Code</IonLabel>
                <IonInput
                  maxlength={8}
                  placeholder="Ej: A9KD3L"
                  type="text"
                  value={code}
                  onIonInput={(event) => setCode((event.detail.value ?? '').toUpperCase())}
                />
              </IonItem>

              <div className="action-row">
                <IonButton disabled={isLoading} expand="block" onClick={handleJoin}>
                  Unirme
                </IonButton>

                <IonButton
                  disabled={isLoading}
                  expand="block"
                  fill="outline"
                  onClick={handleCreateFamily}
                >
                  Crear mi familia
                </IonButton>
              </div>

              {isLoading && (
                <div className="loading-row">
                  <IonSpinner name="crescent" />
                </div>
              )}

              {errorMessage && (
                <IonText color="danger">
                  <p className="inline-message">{errorMessage}</p>
                </IonText>
              )}
            </IonCardContent>
          </IonCard>
        </div>
      </IonContent>
    </IonPage>
  )
}
