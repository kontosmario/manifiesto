import { useCallback } from 'react'
import { Linking, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { WelcomeCancelDeletionBanner } from '@/components/common/welcome-cancel-deletion-banner'
import { AuthLiveChrome } from '@/components/redesign/auth/auth-kit'
import { Auth3aBienvenida } from '@/components/redesign/auth/auth-3a-bienvenida'
import type { AuthMode } from '@/components/redesign/auth/auth-spec'
import { PRIVACY_POLICY_URL, TERMS_OF_SERVICE_URL } from '@/lib/legal-urls'
import { useThemeMode } from '@/theme/theme-provider'

/**
 * Bienvenida LIVE del rediseño (Turno 4 · cableado 2026-07-17): monta la
 * réplica aprobada 3a con el chrome real (insets + StatusBar del
 * sistema, vía AuthLiveChrome) y el tema resuelto de la app.
 *
 * MISMO contrato que la WelcomeScreen anterior — la ruta
 * app/(auth)/welcome.tsx conserva TODA su lógica (limpieza de sesión
 * residual con logoutSession antes del alta, guard de doble tap): acá
 * solo se presenta. Los links legales abren las URLs canónicas de
 * lib/legal-urls (mismo comportamiento que la pantalla anterior).
 */
export function NeoWelcomeScreen({
  isBusy = false,
  forceMode,
  onCreate,
  onLogin,
}: {
  isBusy?: boolean
  /**
   * Override del tema resuelto. El intro pre-auth (pager siempre verde
   * oscuro, StatusBar global 'light') fuerza 'dark' para reusar esta
   * bienvenida como slide 5 sin el conflicto de tema/status-bar del
   * light mode (review r3). En la ruta real se omite → sigue el tema.
   */
  forceMode?: AuthMode
  onCreate?: () => void
  onLogin?: () => void
}) {
  const resolvedMode = useThemeMode().resolvedMode
  const mode = forceMode ?? resolvedMode
  const insets = useSafeAreaInsets()

  const openTerms = useCallback(() => {
    void Linking.openURL(TERMS_OF_SERVICE_URL)
  }, [])
  const openPrivacy = useCallback(() => {
    void Linking.openURL(PRIVACY_POLICY_URL)
  }, [])

  return (
    <AuthLiveChrome>
      <View style={styles.root}>
        <Auth3aBienvenida
          mode={mode}
          busy={isBusy}
          onStart={onCreate}
          onHaveAccount={onLogin}
          onTerms={openTerms}
          onPrivacy={openPrivacy}
        />
        {/* Baja de cuenta agendada (Sprint J · J-Auth2 — review r1: la
            pantalla anterior lo mostraba acá y en login; el banner cubre
            "las pre-auth screens"). Devuelve null sin baja pendiente. */}
        <View pointerEvents="box-none" style={[styles.bannerOverlay, { top: insets.top + 8 }]}>
          <WelcomeCancelDeletionBanner loginHref="/(auth)/login" />
        </View>
      </View>
    </AuthLiveChrome>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  bannerOverlay: {
    position: 'absolute',
    left: 16,
    right: 16,
  },
})
