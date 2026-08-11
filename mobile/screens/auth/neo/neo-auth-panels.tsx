import type { PropsWithChildren, ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, { FadeInDown } from 'react-native-reanimated'
import { BrotMascot, type BrotPose } from '@/components/brot'
import {
  AuthBackHeader,
  AuthFlexSpacer,
  AuthHomeIndicator,
  AuthScreenShell,
  AuthScrollBody,
  AuthStatusBar,
} from '@/components/redesign/auth/auth-kit'
import { AUTH_SPEC, type AuthMode } from '@/components/redesign/auth/auth-spec'
import { SUPPORTS_INSET_SHADOW } from '@/components/wizard/inset-shadow-support'
import { motionDurations } from '@/lib/motion/tokens'
import { nunitoFamily } from '@/theme/typography'

/**
 * Piezas compartidas de las pantallas secundarias del flujo de auth
 * (unirse a un hogar, reset de contraseña, callback OAuth). No tienen
 * maqueta propia: se componen con el vocabulario ya aprobado del kit
 * (auth-kit + AUTH_SPEC) para que el funnel se lea como uno solo.
 *
 * · `NeoAuthPanel` es el esqueleto del 4b que ya usan login / crear
 *   cuenta / recuperar acceso: shell + status bar + scroll body, back
 *   circular opcional, eyebrow → título → lead, contenido y acciones
 *   abajo. Con `centered` los AuthFlexSpacer reparten el aire (norma de
 *   distribución vertical del kit) en vez de colapsar todo arriba.
 * · `NeoAuthPedestal` transcribe el pedestal del empty state (170
 *   elevado + pozo hundido 136 con Brot adentro) que ya usan los
 *   paneles de cierre del onboarding; el disco exterior sale del propio
 *   spec (medallón de 4c) y el pozo del inset profundo del sistema.
 * · `NeoAuthErrorRow` es la fila de fallo del rediseño: Brot `worried` +
 *   texto durazno de atención, NUNCA rojo.
 */

/** Texto de atención del rediseño (misma constante que 4a / 4b / PIN). */
export const NEO_AUTH_ERROR_TEXT: Record<AuthMode, string> = {
  light: '#B0764A',
  dark: '#F2A87E',
}

/** Pozo del pedestal: inset profundo (6/13) del sistema, por tema. */
const PEDESTAL_WELL: Record<
  AuthMode,
  { background: string | undefined; shadow: string; border: string }
> = {
  light: {
    background: undefined,
    shadow:
      'inset 6px 6px 13px rgba(151,160,136,0.4), inset -6px -6px 13px rgba(255,255,255,0.95)',
    border: 'rgba(151,160,136,0.5)',
  },
  dark: {
    background: '#142519',
    shadow: 'inset 6px 6px 13px rgba(0,0,0,0.5), inset -6px -6px 13px rgba(101,152,113,0.08)',
    border: 'rgba(101,152,113,0.35)',
  },
}

export function NeoAuthPedestal({ mode, pose }: { mode: AuthMode; pose: BrotPose }) {
  const s = AUTH_SPEC[mode]
  const w = PEDESTAL_WELL[mode]
  return (
    <View style={styles.pedestalWrap}>
      <View
        style={[
          styles.pedestal,
          {
            experimental_backgroundImage: s.faceMedallionCss,
            backgroundColor: s.faceMedallionFallback,
            boxShadow: s.faceMedallionShadow,
          },
        ]}
      >
        <View
          style={[
            styles.pedestalWell,
            {
              backgroundColor: w.background,
              boxShadow: w.shadow,
              // Android < API 29 descarta el inset EN SILENCIO: sin el
              // hairline el pozo desaparece y Brot queda flotando.
              borderWidth: SUPPORTS_INSET_SHADOW ? 0 : 1.5,
              borderColor: w.border,
            },
          ]}
        >
          <BrotMascot pose={pose} size={96} shadow={false} />
        </View>
      </View>
    </View>
  )
}

export function NeoAuthErrorRow({ mode, text }: { mode: AuthMode; text: string }) {
  return (
    <Animated.View
      entering={FadeInDown.duration(motionDurations.standard)}
      style={styles.errorRow}
    >
      <BrotMascot pose="worried" size={34} shadow={false} />
      <Text style={[styles.errorText, { color: NEO_AUTH_ERROR_TEXT[mode] }]}>{text}</Text>
    </Animated.View>
  )
}

export function NeoAuthPanel({
  mode,
  onBack,
  brotPose = null,
  eyebrow,
  title,
  lead,
  body,
  centered = false,
  footer,
  children,
}: PropsWithChildren<{
  mode: AuthMode
  /** Back circular del header; ausente = pantalla sin retorno manual. */
  onBack?: () => void
  /** Brot en pedestal coronando el bloque (estados de resultado). */
  brotPose?: BrotPose | null
  eyebrow?: string
  title: string
  /** Bajada bajo el título (textSoft, centrada). */
  lead?: string
  /** Párrafo secundario bajo la bajada (helper). */
  body?: string
  /** Reparte el aire: contenido al medio, acciones abajo. */
  centered?: boolean
  /** Acciones del pie (CTA + links). */
  footer?: ReactNode
}>) {
  const s = AUTH_SPEC[mode]
  return (
    <AuthScreenShell mode={mode}>
      <AuthStatusBar mode={mode} />
      <AuthScrollBody gutter={22}>
        {onBack ? <AuthBackHeader mode={mode} onBack={onBack} /> : null}
        {centered ? <AuthFlexSpacer /> : null}
        {brotPose ? <NeoAuthPedestal mode={mode} pose={brotPose} /> : null}
        <View style={[styles.titleBlock, onBack || brotPose ? null : styles.titleBlockBare]}>
          {eyebrow ? (
            <Text style={[styles.eyebrow, { color: s.helper }]}>{eyebrow}</Text>
          ) : null}
          <Text style={[styles.title, { color: s.text }]}>{title}</Text>
        </View>
        {lead ? <Text style={[styles.lead, { color: s.textSoft }]}>{lead}</Text> : null}
        {/* Párrafo secundario en `textSoft` (no en el helper apagado): es
            copy que hay que poder leer, y sobre el fondo claro el helper
            no llega a AA. */}
        {body ? <Text style={[styles.body, { color: s.textSoft }]}>{body}</Text> : null}
        {children}
        {centered ? <AuthFlexSpacer /> : null}
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </AuthScrollBody>
      <AuthHomeIndicator mode={mode} />
    </AuthScreenShell>
  )
}

// ─── Estilos (métricas del 4b / de los paneles de cierre) ────────────

const styles = StyleSheet.create({
  pedestalWrap: { alignItems: 'center', marginTop: 10 },
  pedestal: {
    width: 170,
    height: 170,
    borderRadius: 85,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pedestalWell: {
    width: 136,
    height: 136,
    borderRadius: 68,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 12,
  },
  titleBlock: { alignItems: 'center', marginTop: 16 },
  // Sin back circular arriba, el bloque necesita el aire que ocupaba el
  // header (44) para no quedar pegado a la status bar.
  titleBlockBare: { marginTop: 34 },
  eyebrow: { fontSize: 14, fontWeight: '800', fontFamily: nunitoFamily('800') },
  title: {
    fontSize: 34,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    lineHeight: 38,
    marginTop: 4,
    textAlign: 'center',
  },
  lead: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 14,
    paddingHorizontal: 8,
  },
  body: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    lineHeight: 19,
    textAlign: 'center',
    marginTop: 10,
    paddingHorizontal: 8,
  },
  footer: { marginTop: 22 },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 12,
    marginTop: 12,
  },
  errorText: {
    flexShrink: 1,
    fontSize: 12.5,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    lineHeight: 17,
    textAlign: 'center',
  },
})
