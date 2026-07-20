// Réplica del design doc (3a); copy vía t() (cableado i18n 2026-07-18).
import { useTranslation } from 'react-i18next'
import { StyleSheet, Text, View } from 'react-native'
import { BrotParticles } from '@/components/brot'
import { FernLogo } from '@/components/auth/fern-logo'
import { nunitoFamily } from '@/theme/typography'
import {
  AuthCta,
  AuthHomeIndicator,
  AuthLegal,
  AuthScreenShell,
  AuthSecondaryButton,
  AuthStatusBar,
  AuthWordmark,
} from './auth-kit'
import { AUTH_SPEC, type AuthMode } from './auth-spec'

/**
 * 3a · Bienvenida — réplica de screens/3a.html (claro + oscuro en el
 * mismo archivo). Pre-auth full-screen: partículas de fondo, logo de
 * marca + wordmark + tagline centrados, CTA "Empezar" (extruido, con
 * capa raised extra), secundario hundido "Ya tengo cuenta" y legal.
 *
 * SIN Brot (decisión owner 2026-07-17): el handoff prescribe un `wave`
 * + burbuja para la Bienvenida y se probó — el owner lo retiró. La
 * pantalla queda como el mockup 3a: el hero es la marca sola.
 *
 * Fondo más profundo que el resto del turno 4 (#0F1E14 en oscuro):
 * AuthScreenShell recibe welcomeBg.
 */

export function Auth3aBienvenida({
  mode,
  busy = false,
  onStart,
  onHaveAccount,
  onTerms,
  onPrivacy,
}: {
  mode: AuthMode
  /**
   * Acción en vuelo (live: limpieza de sesión residual antes del alta) —
   * el CTA pasa a busy y los press se ignoran.
   */
  busy?: boolean
  onStart?: () => void
  onHaveAccount?: () => void
  onTerms?: () => void
  onPrivacy?: () => void
}) {
  const s = AUTH_SPEC[mode]
  const { t } = useTranslation()
  return (
    <AuthScreenShell mode={mode} bg={s.welcomeBg}>
      {/* Partículas full-screen (count 18), detrás de todo. */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <BrotParticles colors={s.particleColors} count={18} />
      </View>

      <AuthStatusBar mode={mode} bars={4} />

      <View style={styles.hero}>
        <FernLogo size={160} palette={s.fernPalette} />
        <View style={styles.wordmarkWrap}>
          <AuthWordmark mode={mode} size={42} />
        </View>
        <Text style={[styles.tagline, { color: s.helper }]}>{t('auth:welcome.tagline')}</Text>
      </View>

      <View style={styles.footer}>
        {/* Chevron "  ›" = afordancia decorativa del mockup; la copy traducible es welcome.start. */}
        <AuthCta
          mode={mode}
          variant="welcome"
          label={`${t('auth:welcome.start')}  ›`}
          onPress={onStart}
          busy={busy}
        />
        <View style={styles.secondaryWrap}>
          <AuthSecondaryButton
            mode={mode}
            label={t('auth:welcome.alreadyHaveAccount')}
            onPress={busy ? undefined : onHaveAccount}
          />
        </View>
        <View style={styles.legalWrap}>
          {/* i18n pendiente: AuthLegal (kit) hardcodea " los Términos y la Privacidad." y la
              key auth:welcome.fineprintPrefix trae " los" (duplicaría). El prefix queda literal
              hasta reconciliar el kit; welcome.dataDisclosure sí matchea la 1ra oración. */}
          <AuthLegal
            mode={mode}
            prefix={t('auth:redesign.welcomeFineprint')}
            onTerms={onTerms}
            onPrivacy={onPrivacy}
          />
        </View>
      </View>

      {/* 3a oscuro usa opacity 0.7 (el resto 0.75). */}
      <AuthHomeIndicator mode={mode} marginTop={6} opacity={mode === 'dark' ? 0.7 : 0.75} />
    </AuthScreenShell>
  )
}

const styles = StyleSheet.create({
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  wordmarkWrap: { marginTop: 22 },
  tagline: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    marginTop: 6,
  },
  footer: { paddingHorizontal: 24, paddingBottom: 14 },
  secondaryWrap: { marginTop: 14 },
  legalWrap: { marginTop: 16 },
})
