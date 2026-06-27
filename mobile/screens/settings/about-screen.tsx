import { useCallback } from 'react'
import { Alert, Linking, Platform, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import Constants from 'expo-constants'
import * as Application from 'expo-application'
import { LinearGradient } from 'expo-linear-gradient'
import { CardParticles } from '@/components/ui/card-particles'
import { FernMark } from '@/components/billing/fern-mark'
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
import { DARK_TAB_CANVAS, authTokens, radii } from '@/theme/palette'
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
  const { t } = useTranslation()
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
        t('settings:about.browserErrorTitle'),
        t('settings:about.browserErrorMessage', { url: PRIVACY_POLICY_URL }),
      )
    })
  }, [hasPrivacy, t])

  const handleOpenTerms = useCallback(() => {
    if (!hasTerms) return
    void Linking.openURL(TERMS_OF_SERVICE_URL).catch(() => {
      Alert.alert(
        t('settings:about.browserErrorTitle'),
        t('settings:about.browserErrorMessage', { url: TERMS_OF_SERVICE_URL }),
      )
    })
  }, [hasTerms, t])

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
        t('settings:about.mailErrorTitle'),
        t('settings:about.mailErrorMessage', { email: SUPPORT_EMAIL }),
      )
    })
  }, [appVersion, buildNumber, hasSupport, userId, t])

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
      subtitle={t('settings:about.subtitle')}
      title={t('settings:about.title')}
    >
      <RiseViewGate skip={!isNavSettled}>
        <View style={styles.sectionStack}>
          {!theme.isDark ? <AmbientBackdrop variant="home" /> : null}
          <AmbientBlobs tone={theme.isDark ? 'calm' : 'aurora'} />

          {/* HERO con el logo + versión visible — Apple usa este surface
              para confirmar el match de build durante el review. */}
          <RiseView>
            <LinearGradient
              colors={[...theme.colors.heroGradient] as unknown as readonly [string, string, ...string[]]}
              start={{ x: 0.1, y: 0 }}
              end={{ x: 0.9, y: 1 }}
              style={styles.heroCard}
            >
              <CardParticles count={11} accentColor={authTokens.peach} />
              <FernMark variant="cream" size={58} />
              <Text style={[styles.heroTitle, { color: theme.colors.heroText }]}>
                Manifiesto
              </Text>
              <Text style={[styles.heroVersion, { color: theme.colors.heroMuted }]}>
                {versionLabel}
              </Text>
            </LinearGradient>
          </RiseView>

          {/* INFORMACIÓN LEGAL — solo se renderiza si al menos una URL
              está configurada. Gating del acceptance criteria de A6.
              Cuando solo una de las dos URLs existe, esa fila se marca
              como isLast para que no muestre el divisor inferior. */}
          {showLegalGroup ? (
            <RiseView delay={80}>
              <SettingsGroup title={t('settings:about.legalGroup')}>
                {hasPrivacy ? (
                  <SettingsRow
                    icon="policy"
                    isLast={!hasTerms}
                    label={t('settings:about.privacyPolicy')}
                    onPress={handleOpenPrivacy}
                    value={t('settings:about.open')}
                  />
                ) : null}
                {hasTerms ? (
                  <SettingsRow
                    icon="description"
                    isLast
                    label={t('settings:about.termsOfUse')}
                    onPress={handleOpenTerms}
                    value={t('settings:about.open')}
                  />
                ) : null}
              </SettingsGroup>
            </RiseView>
          ) : null}

          {/* SOPORTE */}
          {hasSupport ? (
            <RiseView delay={160}>
              <SettingsGroup
                footer={t('settings:about.supportFooter', { email: SUPPORT_EMAIL })}
                title={t('settings:about.supportGroup')}
              >
                <SettingsRow
                  helper={t('settings:about.contactHelper')}
                  icon="mail-outline"
                  isLast
                  label={t('settings:about.contactSupport')}
                  onPress={handleOpenSupport}
                  value={t('settings:about.write')}
                />
              </SettingsGroup>
            </RiseView>
          ) : null}

          {/* FOOTER cálido — refuerza la identidad del producto. */}
          <RiseView delay={240}>
            <Text style={[styles.footer, { color: theme.colors.textMuted }]}>
              {t('settings:about.madeWithLove')}
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
    borderRadius: radii.xl,
    padding: 24,
    gap: 12,
    alignItems: 'center',
    overflow: 'hidden',
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
