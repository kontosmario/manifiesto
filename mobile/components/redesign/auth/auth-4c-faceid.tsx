// 4c · Activa Face ID — copy vía t() (auth:biometricSetup.*); ver keys por línea.
import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import Svg, { Path, Rect } from 'react-native-svg'
import { nunitoFamily } from '@/theme/typography'
import { FaceIdIcon, FingerprintIcon } from './auth-icons'
import { AuthCta, AuthHomeIndicator, AuthLink, AuthScreenShell, AuthStatusBar } from './auth-kit'
import { AUTH_SPEC, type AuthMode } from './auth-spec'

/**
 * 4c · Activa Face ID — réplica de screens/4c.html (claro) y 4co.html
 * (oscuro). Pantalla de opt-in biométrico: medallón + título + CTA
 * neutro + links "Usar un PIN" / "Ahora no".
 *
 * El mockup hardcodea "Face ID" (copy de iOS). El componente acepta
 * `sensor` para Android: en huella cambia el ícono (el de Face ID
 * mentiría sobre el sensor) y el copy. `label` deja inyectar el string
 * real que resuelve la app (resolveBiometricLabel). Por defecto = la
 * réplica literal del mockup (Face ID).
 *
 * SIN Brot (decisión owner 2026-07-17): se probó `zen` asomando detrás
 * del medallón y el owner lo retiró — esta pantalla queda como el
 * mockup, sin mascota.
 *
 * EVOLUCIÓN DE CONTRATO (cableado live 2026-07-17, patrón 4b): el
 * mockup aprobado dibuja solo el modo A (sensor disponible) de la
 * pantalla real biometric-setup-screen.tsx. `available=false` deriva el
 * modo B (sin hardware / sin enrolar) en el MISMO lenguaje visual:
 * candado en el medallón, copy "Actívalo cuando quieras" y el CTA
 * principal pasa a "Crear un PIN" (dispara `onUsePin`, espejo del real
 * donde el primario del modo B es crear PIN) — "Ahora no" queda como
 * única salida secundaria. `busy` cubre el prompt biométrico nativo en
 * vuelo (AuthCta busy: press ignorado en silencio, visual activo). El
 * default (`available=true`, `busy=false`) es la réplica literal — los
 * previews de Settings→Dev no cambian.
 */

export type BiometricSensor = 'face' | 'fingerprint' | 'generic'

// ── Candado (modo B — NO está en el mockup) ──────────────────────────
// Mismo lenguaje que los íconos del medallón (auth-icons: viewBox 48,
// stroke 3, trazos redondeados). Espeja el lock-closed-outline que la
// pantalla real muestra cuando no hay sensor utilizable.
function LockIcon({ color, size = 62 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <Path
        d="M15 21v-6a9 9 0 0 1 18 0v6"
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Rect x={10} y={21} width={28} height={20} rx={7} stroke={color} strokeWidth={3} />
      <Path d="M24 28.5v5" stroke={color} strokeWidth={3} strokeLinecap="round" />
    </Svg>
  )
}

export function Auth4cFaceId({
  mode,
  sensor = 'face',
  label = 'Face ID',
  available = true,
  busy = false,
  onActivate,
  onUsePin,
  onSkip,
}: {
  mode: AuthMode
  sensor?: BiometricSensor
  /** Label del sensor a interpolar ("Face ID", "huella digital", …). */
  label?: string
  /** false = modo B de la pantalla real (sin sensor utilizable):
   *  candado + "Actívalo cuando quieras" + CTA "Crear un PIN". */
  available?: boolean
  /** Activación en vuelo (prompt biométrico nativo arriba): CTA busy —
   *  press ignorado, visual activo. El caller lo mantiene hasta que el
   *  prompt resuelve (puede tardar). */
  busy?: boolean
  onActivate?: () => void
  onUsePin?: () => void
  onSkip?: () => void
}) {
  const { t } = useTranslation()
  const s = AUTH_SPEC[mode]
  const Icon = !available ? LockIcon : sensor === 'fingerprint' ? FingerprintIcon : FaceIdIcon
  return (
    <AuthScreenShell mode={mode}>
      <AuthStatusBar mode={mode} />
      <View style={styles.body}>
        <View
          style={[
            styles.medallion,
            {
              experimental_backgroundImage: s.faceMedallionCss,
              backgroundColor: s.faceMedallionFallback,
              boxShadow: s.faceMedallionShadow,
            },
          ]}
        >
          <Icon color={s.faceIcon} size={62} />
        </View>

        {available ? (
          <>
            {/* auth:biometricSetup.availableTitle */}
            <Text style={[styles.title, { color: s.text }]}>
              {t('auth:biometricSetup.availableTitle', { label })}
            </Text>
            {/* auth:biometricSetup.availableBody */}
            <Text style={[styles.sub, { color: s.helper }]}>
              {t('auth:biometricSetup.availableBody')}
            </Text>

            <View style={styles.ctaWrap}>
              <AuthCta
                mode={mode}
                variant="neutral"
                // auth:biometricSetup.availablePrimary
                label={t('auth:biometricSetup.availablePrimary', { label })}
                onPress={onActivate}
                busy={busy}
              />
            </View>

            {/* auth:biometricSetup.usePin */}
            <AuthLink mode={mode} tone="accent" onPress={onUsePin} style={styles.pinLink}>
              {t('auth:biometricSetup.usePin')}
            </AuthLink>
            {/* auth:biometricSetup.availableSecondary */}
            <AuthLink mode={mode} tone="muted" onPress={onSkip} style={styles.skipLink}>
              {t('auth:biometricSetup.availableSecondary')}
            </AuthLink>
          </>
        ) : (
          <>
            {/* auth:biometricSetup.unavailableTitle */}
            <Text style={[styles.title, { color: s.text }]}>
              {t('auth:biometricSetup.unavailableTitle')}
            </Text>
            {/* auth:biometricSetup.unavailableBody */}
            <Text style={[styles.sub, styles.subUnavailable, { color: s.helper }]}>
              {t('auth:biometricSetup.unavailableBody', { label })}
            </Text>

            <View style={styles.ctaWrap}>
              {/* auth:biometricSetup.createPin — primario del modo B real:
                  crear PIN (no hay sensor que "Activar"). */}
              <AuthCta
                mode={mode}
                variant="neutral"
                label={t('auth:biometricSetup.createPin')}
                onPress={onUsePin}
                busy={busy}
              />
            </View>

            {/* auth:biometricSetup.later — única salida secundaria del modo B
                (ocupa el slot del primer link). */}
            <AuthLink mode={mode} tone="muted" onPress={onSkip} style={styles.soloSkipLink}>
              {t('auth:biometricSetup.later')}
            </AuthLink>
          </>
        )}
      </View>
      <AuthHomeIndicator mode={mode} />
    </AuthScreenShell>
  )
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  medallion: {
    width: 150,
    height: 150,
    borderRadius: 75,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    marginTop: 30,
    textAlign: 'center',
  },
  sub: {
    fontSize: 14.5,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    marginTop: 8,
    textAlign: 'center',
  },
  ctaWrap: { alignSelf: 'stretch', marginTop: 34 },
  pinLink: { fontSize: 15, fontWeight: '900', fontFamily: nunitoFamily('900'), marginTop: 24 },
  skipLink: { fontSize: 14, fontWeight: '800', fontFamily: nunitoFamily('800'), marginTop: 18 },
  // Modo B: el body largo respira con más interlínea y el ancho de
  // lectura del real (maxWidth 320).
  subUnavailable: { maxWidth: 320, lineHeight: 21 },
  // Modo B: "Ahora no" sube al slot del primer link (marginTop 24) con
  // su identidad de skip (14/800 muted).
  soloSkipLink: { fontSize: 14, fontWeight: '800', fontFamily: nunitoFamily('800'), marginTop: 24 },
})
