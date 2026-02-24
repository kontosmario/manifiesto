import { IonApp, IonLoading, IonRouterOutlet } from '@ionic/react'
import { IonReactRouter } from '@ionic/react-router'
import { Redirect, Route } from 'react-router-dom'
import { useAuthSession } from './hooks/useAuthSession'
import { useFamily } from './hooks/useFamily'
import AppPage from './pages/AppPage'
import FixedExpensesPage from './pages/FixedExpensesPage'
import JoinPage from './pages/JoinPage'
import LoginPage from './pages/LoginPage'

export default function App() {
  const sessionQuery = useAuthSession()
  const session = sessionQuery.data ?? null
  const userId = session?.user.id

  const familyQuery = useFamily(userId)
  const family = familyQuery.data ?? null

  const isLoading = sessionQuery.isLoading || (Boolean(userId) && familyQuery.isLoading)

  if (isLoading) {
    return (
      <IonApp>
        <IonLoading isOpen message="Cargando..." />
      </IonApp>
    )
  }

  return (
    <IonApp>
      <IonReactRouter basename={import.meta.env.BASE_URL}>
        <IonRouterOutlet>
          <Route
            path="/login"
            render={() =>
              session ? <Redirect to={family ? '/app' : '/join'} /> : <LoginPage />
            }
            exact
          />

          <Route
            path="/join"
            render={() =>
              !session ? <Redirect to="/login" /> : family ? <Redirect to="/app" /> : <JoinPage />
            }
            exact
          />

          <Route
            path="/app/fixed-expenses"
            render={() =>
              !session ? <Redirect to="/login" /> : !family ? <Redirect to="/join" /> : <FixedExpensesPage />
            }
            exact
          />

          <Route
            path="/app"
            render={() =>
              !session ? <Redirect to="/login" /> : !family ? <Redirect to="/join" /> : <AppPage />
            }
            exact
          />

          <Route
            path="/"
            render={() => (
              <Redirect to={session ? (family ? '/app' : '/join') : '/login'} />
            )}
            exact
          />
        </IonRouterOutlet>
      </IonReactRouter>
    </IonApp>
  )
}
