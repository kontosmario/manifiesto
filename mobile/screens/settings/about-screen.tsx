import { useCallback } from 'react'
import { Alert, Linking, Platform, StyleSheet, Text, View } from 'react-native'
import Constants from 'expo-constants'
import * as Application from 'expo-application'
import { MaterialIcons } from '@expo/vector-icons'
import { AmbientBackdrop } from '@/components/ui/ambient-backdrop'
import { AmbientBlobs } from '@/components/home/ambient-blobs'
import { RiseView, RiseViewGate } from '@/components/home/animated/rise-view'
import { Screen } from '@/components/ui/screen'
import {
  SettingsGroup,
  SettingsRow,
} from '@/components/settings/settings-grouped-list'
import { useIsNavigationSettled } from '@/hooks/use-is-navigation-settled'
import { useAppTheme } from '@/theme/theme-provider'
import { DARK_TAB_CANVAS, radii } from '@/theme/palette'
import { typography } from '@/theme/typography'
import {
  PRIVACY_POLICY_URL,
  TERMS_OF_SERVICE_URL,
  SUPPORT_EMAIL,
  buildSupportMailto,
} from '@/lib/legal-urls'

interface AboutScreenProps {
  userId: string | null
}

/**
 * Pantalla "Acerca de" — single source de información legal + soporte
 * + versión de la app. Apple App Review usa este surface para verificar
 * que la app declare Privacy/Terms y un canal de contacto. La versión y
 * el build number también ayudan a Apple Review a identificar qué
 * artifact está revisando (matchea el "Build" del App Store Connect).
 *
 * Las filas de Política / Términos se ocultan si su URL en
 * `legal-urls.ts` quedó vacía (gating del acceptance criteria de A6 del
 * execution plan).
 */
export function AboutScreen({ userId }: AboutScreenProps) {
  const { theme } = useAppTheme()
  const isNavSettled = useIsNavigationSettled()

  const appVersion =
    Constants.expoConfig?.version ?? Application.nativeApplicationVersion ?? '—'
  const buildNumber = Application.nativeBuildVersion ?? null
  const versionLabel = buildNumber
    ? `${appVersion} (build ${buildNumber})`
    : appVersion

  const hasPrivacy = PRIVACY_POLICY_URL.trim().length > 0
  const hasTerms = TERMS_OF_SERVICE_URL.trim().length > 0
  const hasSupport = SUPPORT_EMAIL.trim().length > 0

  const handleOpenPrivacy = useCallback(() => {
    if (!hasPrivacy) return
    void Linking.openURL(PRIVACY_POLICY_URL).catch(() => {
      Alert.alert(
        'No pudimos abrir el navegador',
        'Probá copiar el enlace manualmente: ' + PRIVACY_POLICY_URL,
      )
    })
  }, [hasPrivacy])

  const handleOpenTerms = useCallback(() => {
    if (!hasTerms) return
    void Linking.openURL(TERMS_OF_SERVICE_URL).catch(() => {
      Alert.alert(
        'No pudimos abrir el navegador',
        'Probá copiar el enlace manualmente: ' + TERMS_OF_SERVICE_URL,
      )
    })
  }, [hasTerms])

  const handleOpenSupport = useCallback(() => {
    if (!hasSupport) return
    const url = buildSupportMailto({
      appVersion,
      buildNumber,
      platform: Platform.OS,
      userId,
    })
    void Linking.openURL(url).catch(() => {
      Alert.alert(
        'No pudimos abrir tu mail',
        `Escribinos a ${SUPPORT_EMAIL} desde la app de correo que prefieras.`,
      )
    })
  }, [appVersion, buildNumber, hasSupport, userId])

  // El grupo "Información legal" se renderiza solo si al menos una URL
  // está configurada. Cuando ambas están vacías, la sección entera
  // desaparece — la pantalla degrada a "solo versión" (acceptance
  // criteria A6).
  const showLegalGroup = hasPrivacy || hasTerms

  return (
    <Screen
      backgroundColor={theme.isDark ? DARK_TAB_CANVAS : undefined}
      canGoBack
      contentContainerStyle={styles.screenContent}
      subtitle="Versión, información legal y contacto de soporte."
      title="Acerca de"
    >
      <RiseViewGate skip={!isNavSettled}>
        <View style={styles.sectionStack}>
          {!theme.isDark ? <AmbientBackdrop variant="home" /> : null}
          <AmbientBlobs tone={theme.isDark ? 'calm' : 'aurora'} />

          {/* HERO con el logo + versión visible — Apple usa este surface
              para confirmar el match de build durante el review. */}
          <RiseView>
            <View
              style={[
                styles.heroCard,
                {
                  backgroundColor: theme.isDark
                    ? theme.colors.surfaceMuted
                    : theme.colors.creamCard,
                  borderColor: theme.colors.line,
                },
              ]}
            >
              <View
                style={[
                  styles.heroBadge,
                  {
                    backgroundColor: theme.colors.primarySurface,
                    borderColor: theme.colors.primary,
                  },
                ]}
              >
                <MaterialIcons
                  color={theme.colors.primaryStrong}
                  name="auto-awesome"
                  size={28}
                />
              </View>
              <Text style={[styles.heroTitle, { color: theme.colors.text }]}>
                Manifiesto
              </Text>
              <Text style={[styles.heroVersion, { color: theme.colors.textMuted }]}>
                {versionLabel}
              </Text>
            </View>
          </RiseView>

          {/* INFORMACIÓN LEGAL — solo se renderiza si al menos una URL
              está configurada. Gating del acceptance criteria de A6.
              Cuando solo una de las dos URLs existe, esa fila se marca
              como isLast para que no muestre el divisor inferior. */}
          {showLegalGroup ? (
            <RiseView delay={80}>
              <SettingsGroup title="Información legal">
                {hasPrivacy ? (
                  <SettingsRow
                    icon="policy"
                    isLast={!hasTerms}
                    label="Política de privacidad"
                    onPress={handleOpenPrivacy}
                    value="Abrir"
                  />
                ) : null}
                {hasTerms ? (
                  <SettingsRow
                    icon="description"
                    isLast
                    label="Términos de uso"
                    onPress={handleOpenTerms}
                    value="Abrir"
                  />
                ) : null}
              </SettingsGroup>
            </RiseView>
          ) : null}

          {/* SOPORTE */}
          {hasSupport ? (
            <RiseView delay={160}>
              <SettingsGroup
                footer={`Te respondemos por mail a ${SUPPORT_EMAIL}.`}
                title="Soporte"
              >
                <SettingsRow
                  helper="Incluye tu versión + plataforma para hacer triage más rápido."
                  icon="mail-outline"
                  isLast
                  label="Contactar a soporte"
                  onPress={handleOpenSupport}
                  value="Escribir"
                />
              </SettingsGroup>
            </RiseView>
          ) : null}

          {/* FOOTER cálido — refuerza la identidad del producto. */}
          <RiseView delay={240}>
            <Text style={[styles.footer, { color: theme.colors.textMuted }]}>
              Hecho con ♥ en Argentina
            </Text>
          </RiseView>
        </View>
      </RiseViewGate>
    </Screen>
  )
}

const styles = StyleSheet.create({
  screenContent: {
    paddingTop: 4,
  },
  sectionStack: {
    gap: 22,
    position: 'relative',
  },
  heroCard: {
    borderWidth: 1,
    borderRadius: radii.xl,
    padding: 20,
    gap: 10,
    alignItems: 'center',
  },
  heroBadge: {
    width: 56,
    height: 56,
    borderRadius: radii.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: {
    ...typography.screenTitle,
    fontSize: 26,
  },
  heroVersion: {
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  footer: {
    textAlign: 'center',
    fontSize: 12,
    paddingTop: 6,
    paddingBottom: 24,
  },
})
