import { useCallback } from 'react'
import { Linking, Platform, StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui/app-text'
import { useTranslation } from 'react-i18next'
import Constants from 'expo-constants'
import * as Application from 'expo-application'
import { toast } from '@/lib/toast-bus'
import { FernMark } from '@/components/billing/fern-mark'
import { RiseView, RiseViewGate } from '@/components/home/animated/rise-view'
import { Screen } from '@/components/ui/screen'
import {
  SettingsGroup,
  SettingsRow,
} from '@/components/settings/settings-grouped-list'
import {
  SettingsHeroCard,
  settingsHeroInk,
} from '@/components/settings/settings-hero-card'
import { useIsNavigationSettled } from '@/hooks/use-is-navigation-settled'
import { useAppTheme } from '@/theme/theme-provider'
import { neoTokens } from '@/theme/neo-tokens'
import { nunitoFamily, typography } from '@/theme/typography'
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
  const neo = neoTokens(theme.isDark ? 'dark' : 'light')
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
      toast.error(t('settings:about.browserErrorMessage', { url: PRIVACY_POLICY_URL }))
    })
  }, [hasPrivacy, t])

  const handleOpenTerms = useCallback(() => {
    if (!hasTerms) return
    void Linking.openURL(TERMS_OF_SERVICE_URL).catch(() => {
      toast.error(t('settings:about.browserErrorMessage', { url: TERMS_OF_SERVICE_URL }))
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
      toast.error(t('settings:about.mailErrorMessage', { email: SUPPORT_EMAIL }))
    })
  }, [appVersion, buildNumber, hasSupport, userId, t])

  // El grupo "Información legal" se renderiza solo si al menos una URL
  // está configurada. Cuando ambas están vacías, la sección entera
  // desaparece — la pantalla degrada a "solo versión" (acceptance
  // criteria A6).
  const showLegalGroup = hasPrivacy || hasTerms

  return (
    <Screen
      backgroundColor={neo.bg}
      titleColor={neo.text}
      canGoBack
      contentContainerStyle={styles.screenContent}
      subtitle={t('settings:about.subtitle')}
      title={t('settings:about.title')}
    >
      <RiseViewGate skip={!isNavSettled}>
        <View style={styles.sectionStack}>
          {/* HERO con el logo + versión visible — Apple usa este surface
              para confirmar el match de build durante el review. */}
          <RiseView>
            <SettingsHeroCard
              contentStyle={styles.heroContent}
              particleCount={11}
              style={styles.heroCard}
            >
              <FernMark variant="cream" size={58} />
              <Text style={[styles.heroTitle, { color: settingsHeroInk.title }]}>
                Manifiesto
              </Text>
              <Text style={[styles.heroVersion, { color: settingsHeroInk.soft }]}>
                {versionLabel}
              </Text>
            </SettingsHeroCard>
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
            <Text style={[styles.footer, { color: neo.textMuted }]}>
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
    padding: 24,
  },
  heroContent: {
    gap: 12,
    alignItems: 'center',
  },
  heroTitle: {
    ...typography.screenTitle,
    fontSize: 26,
  },
  heroVersion: {
    fontSize: 13,
    fontFamily: nunitoFamily('600'),
    fontVariant: ['tabular-nums'],
  },
  footer: {
    textAlign: 'center',
    fontSize: 12,
    fontFamily: nunitoFamily('600'),
    paddingTop: 6,
    paddingBottom: 24,
  },
})
