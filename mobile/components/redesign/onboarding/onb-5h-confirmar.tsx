// @i18n-ignore-file — réplica dev-only del design doc; copy literal del flujo actual (joiner).
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui/app-text'
import Animated, { FadeInDown } from 'react-native-reanimated'
import type { AvatarSlug } from '@/assets/avatars'
import { BrotMascot } from '@/components/brot'
import { AvatarAnimal } from '@/components/ui/avatar-animal'
import { motionDurations } from '@/lib/motion/tokens'
import { nunitoFamily } from '@/theme/typography'
import { formatPesos } from './onb-format'
import { OnbBody, OnbCta, OnbHeader, OnbProgress, OnbScreenShell } from './onb-kit'
import { ONB_SPEC, ONB_SURFACES, type OnbMode } from './onb-spec'

/**
 * 5h · La familia — ramal JOINER (espejo de step-family-summary.tsx).
 * NO existe mockup: diseño nuevo en el lenguaje neumórfico del rediseño.
 * Muestra los miembros del hogar al que se une + su propia fila
 * (pendiente, resaltada con anillo de acento) con el aporte que cargó
 * en 5g.
 *
 * PASE DE FUNCIONALIDAD (cableado 2026-07-17): `members` / `pendingName`
 * / `pendingAvatar` llegan del peek real (defaults = demo del preview,
 * intacto); `dynamicHousehold` oculta la línea de aporte (hogar de
 * ingreso dinámico — espejo del real); `submitting`/`serverError` cubren
 * el consume real del invite.
 */

/** Verde de acento por modo (línea de aporte de la fila pendiente). */
const ACCENT: Record<OnbMode, string> = {
  light: '#2E7C39',
  dark: '#A4E3A6',
}

/** Fondo de la placa neumórfica del avatar (mismo tono que el circulo). */
const AVATAR_TILE: Record<OnbMode, string> = {
  light: '#F0EFE3',
  dark: '#1F3527',
}

/** Sombra elevada suave de la placa del avatar. */
const AVATAR_TILE_SHADOW: Record<OnbMode, string> = {
  light: '5px 5px 11px rgba(151,160,136,0.4), -5px -5px 11px rgba(255,255,255,0.9)',
  dark: '5px 5px 11px rgba(0,0,0,0.5), -5px -5px 11px rgba(101,152,113,0.08)',
}

/** Divisor fino entre filas de miembro (igual en ambos modos, como 5f). */
const DIVIDER = 'rgba(151,160,136,0.25)'

/** Texto de error del rediseño: durazno de atención, NUNCA rojo. */
const ERROR_TEXT: Record<OnbMode, string> = { light: '#B0764A', dark: '#F2A87E' }

/** Miembro del hogar al que el usuario se une (peek real en live;
 *  slug null = sin avatar → la placa muestra su inicial). */
export interface Onb5hMember {
  slug: AvatarSlug | null
  name: string
  owner?: boolean
}

/** Miembros demo (default del preview). */
const DEMO_MEMBERS: readonly Onb5hMember[] = [
  { slug: 'lion', name: 'Sofía', owner: true },
  { slug: 'cat', name: 'Diego' },
]
/** Avatar de la fila "Tú" en el preview (default del flujo = guacamayo). */
const DEMO_PENDING_AVATAR: AvatarSlug = 'macaw'

export function Onb5hConfirmar({
  mode,
  contribution,
  contributes,
  onBack,
  onJoin,
  members = DEMO_MEMBERS,
  pendingName = 'Tú',
  pendingAvatar = DEMO_PENDING_AVATAR,
  dynamicHousehold = false,
  submitting = false,
  serverError = null,
}: {
  mode: OnbMode
  contribution: number
  /** ¿El usuario declaró que aporta? (viene del 5g). */
  contributes: boolean
  onBack?: () => void
  /** Confirmar y unirse — en el preview vuelve atrás (sin mutación real). */
  onJoin?: () => void
  /** Miembros reales del peek (default: demo del preview). */
  members?: readonly Onb5hMember[]
  /** Nombre elegido en 5a — fila pendiente "{nombre} · tú". */
  pendingName?: string
  /** Avatar elegido en 5b — fila pendiente. */
  pendingAvatar?: AvatarSlug
  /** Hogar de ingreso DINÁMICO: no existe el aporte mensual (el paso 5g
   *  se saltó) — la línea aporta/no-aporta no se muestra (espejo real). */
  dynamicHousehold?: boolean
  /** Consume del invite en vuelo: CTA "Confirmando…", press ignorado. */
  submitting?: boolean
  /** Error del consume (caller lo limpia al reintentar): failure state
   *  del rediseño bajo el CTA. */
  serverError?: string | null
}) {
  const s = ONB_SPEC[mode]
  const surf = ONB_SURFACES[mode]
  const memberCount = members.length + 1
  const { t } = useTranslation()

  return (
    <OnbScreenShell mode={mode}>
      <OnbBody>
        <OnbHeader mode={mode} title={t('onboarding:familySummary.title')} onBack={onBack} />
        <OnbProgress mode={mode} active={4} />

        {/* Brot `wave` te da la bienvenida a la familia — momento
            emocional del ramal joiner. Sub-protagonista al costado del
            título: la card de miembros sigue siendo el contenido. */}
        <View style={styles.titleRow}>
          <View style={styles.titleBlock}>
            <Text style={[styles.title, { color: s.text }]}>
              {t('onboarding:familySummary.title')}
            </Text>
            <Text style={[styles.subtitle, { color: s.helper }]}>
              {t('onboarding:familySummary.subcopy')}
            </Text>
          </View>
          <BrotMascot pose="wave" size={64} shadow={false} />
        </View>

        <View
          style={[
            styles.card,
            {
              experimental_backgroundImage: surf.cardGradientCss,
              backgroundColor: mode === 'dark' ? '#1B3023' : '#ECEDE1',
              boxShadow: surf.cardShadow,
            },
          ]}
        >
          <Text style={[styles.eyebrow, { color: s.helper }]}>
            {t('onboarding:familySummary.membersEyebrow', { count: memberCount })}
          </Text>

          {members.map((m, i) => (
            <View
              key={`${m.name}-${i}`}
              style={[
                styles.memberRow,
                i < members.length - 1
                  ? { borderBottomWidth: 1.5, borderBottomColor: DIVIDER }
                  : null,
              ]}
            >
              <AvatarTile mode={mode} slug={m.slug} name={m.name} tint={s.text} />
              <View style={styles.memberTextCol}>
                <Text style={styles.nameLine} numberOfLines={1}>
                  <Text style={[styles.memberName, { color: s.text }]}>{m.name}</Text>
                  {m.owner ? (
                    <Text style={[styles.ownerBadge, { color: s.helper }]}> · dueño</Text>
                  ) : null}
                </Text>
              </View>
            </View>
          ))}

          {/* Fila pendiente ("Tú"): resaltada con fondo + anillo de acento. */}
          <View
            style={[
              styles.pendingRow,
              { backgroundColor: surf.chipSelectedBackground, boxShadow: surf.chipSelectedShadow },
            ]}
          >
            <AvatarTile mode={mode} slug={pendingAvatar} name={pendingName} tint={s.text} />
            <View style={styles.memberTextCol}>
              <Text style={[styles.memberName, { color: surf.chipSelectedText }]} numberOfLines={1}>
                {pendingName}
                {t('onboarding:familySummary.youSuffix')}
              </Text>
              {dynamicHousehold ? null : (
                <Text style={[styles.contribution, { color: ACCENT[mode] }]} numberOfLines={1}>
                  {contributes
                    ? t('onboarding:familySummary.willContribute', {
                        amount: formatPesos(contribution),
                      })
                    : t('onboarding:familySummary.wontContribute')}
                </Text>
              )}
            </View>
          </View>
        </View>

        <View style={styles.ctaWrap}>
          <OnbCta
            mode={mode}
            label={submitting ? t('onboarding:cta.confirming') : t('onboarding:cta.confirmAndJoin')}
            busy={submitting}
            onPress={onJoin}
          />
          {serverError ? (
            <Animated.View
              entering={FadeInDown.duration(motionDurations.standard)}
              style={styles.errorRow}
            >
              <BrotMascot pose="worried" size={34} shadow={false} />
              <Text style={[styles.errorText, { color: ERROR_TEXT[mode] }]}>
                {serverError}
              </Text>
            </Animated.View>
          ) : null}
        </View>
      </OnbBody>
    </OnbScreenShell>
  )
}

// ─── Placa neumórfica con el avatar animal del pack real ─────────────
// Sin slug (miembro real sin avatar elegido): inicial del nombre en la
// misma placa — espejo del fallback `Avatar` del step real.

function AvatarTile({
  mode,
  slug,
  name,
  tint,
}: {
  mode: OnbMode
  slug: AvatarSlug | null
  name?: string
  tint: string
}) {
  return (
    <View
      style={[
        styles.avatarTile,
        { backgroundColor: AVATAR_TILE[mode], boxShadow: AVATAR_TILE_SHADOW[mode] },
      ]}
    >
      {slug ? (
        <AvatarAnimal slug={slug} size={38} tint={tint} backgroundTint={AVATAR_TILE[mode]} />
      ) : (
        <Text style={[styles.avatarInitial, { color: tint }]}>
          {(name ?? '?').trim().charAt(0).toUpperCase() || '?'}
        </Text>
      )}
    </View>
  )
}

// ─── Estilos ──────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // El marginTop del bloque vive ahora en la fila (título + Brot).
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 18,
  },
  titleBlock: {
    flex: 1,
  },
  title: {
    fontSize: 27,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    marginTop: 6,
    lineHeight: 18,
  },
  card: {
    marginTop: 20,
    borderRadius: 26,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: 1.4,
    marginBottom: 4,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  avatarTile: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  memberTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  nameLine: {
    flexShrink: 1,
  },
  memberName: {
    fontSize: 15,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
  },
  ownerBadge: {
    fontSize: 13,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
  },
  contribution: {
    fontSize: 12.5,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
  },
  avatarInitial: {
    fontSize: 20,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginTop: 12,
  },
  errorText: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
  },
  ctaWrap: {
    marginTop: 'auto',
    paddingTop: 20,
  },
})
