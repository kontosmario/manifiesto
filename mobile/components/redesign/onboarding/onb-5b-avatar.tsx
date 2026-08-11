import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated'
import {
  AVATAR_LABELS,
  AVATAR_SLUGS,
  getAvatarComponent,
  randomAvatarSlug,
  type AvatarSlug,
} from '@/assets/avatars'
import { motionDurations } from '@/lib/motion/tokens'
import { pastelDarkSolid } from '@/theme/neo-tokens'
import { nunitoFamily } from '@/theme/typography'
import { OnbCta, OnbHeader, OnbHero, OnbProgress, OnbScreenShell, OnbScrollBody } from './onb-kit'
import { ONB_SPEC, type OnbMode } from './onb-spec'

/**
 * 5b · Tu avatar — réplica de screens/5b.html (claro) y 5bo.html
 * (oscuro). Hero del kit con Brot `love` (pedido owner 2026-07-15:
 * Brot presente en todo el flujo — el mockup no lo traía acá).
 * Selección controlada vía prop `avatar` (slug del pack SVG real de la
 * app); el anillo verde del mockup marca el avatar seleccionado
 * (destacado y tile del grid). "Ver los 42" expande el grid al pack
 * completo (directiva owner: reusar los assets reales, no emojis).
 */

// Valores propios de 5b (no están en ONB_SPEC; el helper de 5b usa
// #54644F/#93A78F, distinto del helper #8FA089/#7C917A de 5a).
const SPEC_5B = {
  light: {
    helper: '#54644F',
    link: '#2E7C39',
    ring: '#2E7C39',
    avatarShadow: '8px 8px 18px rgba(151,160,136,0.42), -8px -8px 18px rgba(255,255,255,0.92)',
    diceGradientCss: 'linear-gradient(145deg, #F3F4E9, #E4E6D8)',
    diceFallback: '#ECEDE1',
    diceShadow: '6px 6px 14px rgba(151,160,136,0.4), -6px -6px 14px rgba(255,255,255,0.9)',
    tileShadow: '5px 5px 10px rgba(151,160,136,0.35), -5px -5px 10px rgba(255,255,255,0.85)',
  },
  dark: {
    helper: '#93A78F',
    link: '#A4E3A6',
    ring: '#A4E3A6',
    avatarShadow: '8px 8px 18px rgba(0,0,0,0.5)',
    diceGradientCss: 'linear-gradient(145deg, #21382A, #16281C)',
    diceFallback: '#1B3023',
    diceShadow: '6px 6px 14px rgba(0,0,0,0.5), -6px -6px 14px rgba(101,152,113,0.1)',
    tileShadow: '5px 5px 10px rgba(0,0,0,0.45), -5px -5px 10px rgba(101,152,113,0.08)',
  },
} as const

interface TilePastel {
  light: string
  dark: string
}

// Set pastel del mockup (8 populares + guacamayo default). Claros
// literales de 5b/5bo. OSCUROS (owner 2026-07-18): antes eran el mismo
// pastel al ~13% de opacidad (pastelDark) — a esa alfa se lavaban a un
// tinte casi monocromo y las tarjetas perdían el color distinto que
// tienen en claro. Ahora `pastelDarkSolid` deriva por avatar una
// variante oscura NATIVA que conserva el matiz (perro=verde, gato=
// terracota, mariposa=violeta, …) adaptada a dark mode vía el skill
// color-palette (hue intacto, L de dark, S subida). La misma lista
// cicla para los slugs sin pastel propio.
const PASTELES: readonly TilePastel[] = [
  { light: '#DDEBDD', dark: pastelDarkSolid('#DDEBDD') }, // dog
  { light: '#F6D9D2', dark: pastelDarkSolid('#F6D9D2') }, // cat
  { light: '#E6E0F4', dark: pastelDarkSolid('#E6E0F4') }, // butterfly
  { light: '#D4EBDF', dark: pastelDarkSolid('#D4EBDF') }, // frog
  { light: '#F2ECC9', dark: pastelDarkSolid('#F2ECC9') }, // duck
  { light: '#D6E4F0', dark: pastelDarkSolid('#D6E4F0') }, // fish
  { light: '#F5D8DD', dark: pastelDarkSolid('#F5D8DD') }, // elephant
  { light: '#EDE6D4', dark: pastelDarkSolid('#EDE6D4') }, // alpaca (🦙 del mockup → el pack no tiene llama)
  { light: '#F7E3CF', dark: pastelDarkSolid('#F7E3CF') }, // macaw (default del mockup)
] as const

// Los 8 "más elegidos" del mockup mapeados a slugs reales del pack.
const POPULARES: readonly AvatarSlug[] = [
  'dog',
  'cat',
  'butterfly',
  'frog',
  'duck',
  'fish',
  'elephant',
  'alpaca',
] as const

// Pastel por slug: populares + macaw mantienen el suyo del mockup; el
// resto cicla el mismo set, determinístico por índice en AVATAR_SLUGS.
function pastelFor(slug: AvatarSlug): TilePastel {
  const popular = POPULARES.indexOf(slug)
  if (popular >= 0) return PASTELES[popular]!
  if (slug === 'macaw') return PASTELES[8]!
  return PASTELES[AVATAR_SLUGS.indexOf(slug) % PASTELES.length]!
}

// El grid del mockup es repeat(4,1fr) con gap 10. Las filas cortas se
// rellenan con spacers para no estirar los tiles reales.
function chunk4(slugs: readonly AvatarSlug[]): (AvatarSlug | null)[][] {
  const rows: (AvatarSlug | null)[][] = []
  for (let i = 0; i < slugs.length; i += 4) {
    const row: (AvatarSlug | null)[] = [...slugs.slice(i, i + 4)]
    while (row.length < 4) row.push(null)
    rows.push(row)
  }
  return rows
}

// Los 34 restantes del pack (incluye macaw) — visibles al expandir.
const EXTRAS: readonly AvatarSlug[] = AVATAR_SLUGS.filter((s) => !POPULARES.includes(s))

const FILAS_POPULARES = chunk4(POPULARES)
const FILAS_EXTRAS = chunk4(EXTRAS)

// Glifo ≈72% de su círculo (precedente GLYPH_RATIO de avatar-animal):
// destacado 132 → 95; tile de grid 64 de alto → 46.
const GLYPH_DESTACADO = 95
const GLYPH_TILE = 46

/**
 * Cuerpo del paso: medallón del elegido + "Sorpréndeme" + grilla de
 * populares con expansión al pack completo. Vive suelto del chrome del
 * paso (header, hero, CTA) porque "Tu cuenta" en Ajustes ofrece la MISMA
 * elección y tiene que hacerlo con esta superficie, no con otra.
 *
 * `topGap` es la separación del bloque con lo que lo precede (el hero en
 * el flujo) y `linkColor` deja a la hoja llevar el enlace a la tinta de
 * acento, que sobre su fondo llega a AA donde el verde de material queda
 * en 4.47:1.
 */
export function Onb5bAvatarPicker({
  mode,
  avatar,
  onSelectAvatar,
  helper,
  topGap = 18,
  linkColor,
}: {
  mode: OnbMode
  avatar: AvatarSlug
  onSelectAvatar: (a: AvatarSlug) => void
  helper?: string | null
  topGap?: number
  linkColor?: string
}) {
  const s = ONB_SPEC[mode]
  const s5b = SPEC_5B[mode]
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)

  // Tinta de la silueta = texto primario del rediseño (mapeo neo de la
  // convención bosque/crema del pack en la app actual).
  const glyphTint = s.text
  const bgFor = (slug: AvatarSlug) => {
    const p = pastelFor(slug)
    return mode === 'dark' ? p.dark : p.light
  }

  const Destacado = getAvatarComponent(avatar)

  const sorprendeme = () => {
    let pick = randomAvatarSlug()
    if (pick === avatar) pick = randomAvatarSlug()
    if (pick !== avatar) onSelectAvatar(pick)
  }

  const renderFila = (fila: (AvatarSlug | null)[], f: number) => (
    <View key={f} style={styles.gridRow}>
      {fila.map((slug, i) => {
        if (!slug) return <View key={`spacer-${i}`} style={styles.tileSpacer} />
        const activo = slug === avatar
        const Glyph = getAvatarComponent(slug)
        return (
          <Pressable
            key={slug}
            accessibilityRole="button"
            accessibilityLabel={AVATAR_LABELS[slug]}
            accessibilityState={{ selected: activo }}
            onPress={() => onSelectAvatar(slug)}
            style={[
              styles.tile,
              {
                backgroundColor: bgFor(slug),
                boxShadow: activo
                  ? `${s5b.tileShadow}, inset 0 0 0 3px ${s5b.ring}`
                  : s5b.tileShadow,
              },
            ]}
          >
            <Glyph size={GLYPH_TILE} color={glyphTint} />
          </Pressable>
        )
      })}
    </View>
  )

  return (
    <View style={{ marginTop: topGap }}>
      <View style={styles.destacadoCol}>
        <View
          style={[
            styles.destacadoCircle,
            {
              backgroundColor: bgFor(avatar),
              // Anillo de selección siempre presente en el destacado.
              boxShadow: `${s5b.avatarShadow}, inset 0 0 0 3px ${s5b.ring}`,
            },
          ]}
        >
          {/* eslint-disable-next-line react-hooks/static-components -- lookup estable del registro congelado del pack, no un componente creado */}
          <Destacado size={GLYPH_DESTACADO} color={glyphTint} />
        </View>
        <Text style={[styles.destacadoNombre, { color: s.text }]}>{AVATAR_LABELS[avatar]}</Text>
        {helper ? (
          <Text style={[styles.destacadoHelper, { color: s5b.helper }]}>{helper}</Text>
        ) : null}
        <Pressable
          accessibilityRole="button"
          onPress={sorprendeme}
          style={[
            styles.dice,
            {
              experimental_backgroundImage: s5b.diceGradientCss,
              backgroundColor: s5b.diceFallback,
              boxShadow: s5b.diceShadow,
            },
          ]}
        >
          <Text style={styles.diceEmoji}>🎲</Text>
          <Text style={[styles.diceLabel, { color: s.text }]}>
            {t('onboarding:redesign.avatar.surprise')}
          </Text>
        </Pressable>
      </View>

      <View style={styles.sectionRow}>
        <Text style={[styles.sectionLabel, { color: s5b.helper }]}>
          {t('onboarding:redesign.avatar.mostChosen')}
        </Text>
        <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setExpanded((e) => !e)}>
          <Text style={[styles.sectionLink, { color: linkColor ?? s5b.link }]}>
            {expanded
              ? t('onboarding:redesign.avatar.seeLess')
              : t('onboarding:redesign.avatar.seeMore')}
          </Text>
        </Pressable>
      </View>

      <View style={styles.grid}>
        {FILAS_POPULARES.map(renderFila)}
        {expanded ? (
          <Animated.View
            entering={FadeInDown.duration(motionDurations.standard)}
            exiting={FadeOutDown.duration(motionDurations.quick)}
            style={styles.gridMore}
          >
            {FILAS_EXTRAS.map(renderFila)}
          </Animated.View>
        ) : null}
      </View>
    </View>
  )
}

export function Onb5bAvatar({
  mode,
  avatar,
  onSelectAvatar,
  onBack,
  onNext,
}: {
  mode: OnbMode
  avatar: AvatarSlug
  onSelectAvatar: (a: AvatarSlug) => void
  onBack?: () => void
  onNext?: () => void
}) {
  const { t } = useTranslation()

  return (
    <OnbScreenShell mode={mode}>
      <OnbScrollBody>
        <OnbHeader mode={mode} title={t('onboarding:chrome.title.avatar')} onBack={onBack} />
        <OnbProgress mode={mode} active={1} />

        <OnbHero
          mode={mode}
          title={t('onboarding:avatar.title')}
          subtitle={t('onboarding:redesign.avatar.heroSubtitle')}
          // Brot `love`: reacciona al animal que elegís. Va en el hero
          // (chico, sub-protagonista) para no competir con el medallón
          // del avatar, que es EL protagonista de este paso.
          brotPose="love"
        />

        <Onb5bAvatarPicker
          mode={mode}
          avatar={avatar}
          onSelectAvatar={onSelectAvatar}
          helper={t('onboarding:redesign.avatar.chosenHelper')}
        />

        {/* El kit ancla el CTA abajo (ctaBlock marginTop:'auto' sobre el
            scroll flexGrow:1). En 5b el grid corto (8 populares) dejaba un
            hueco grande hasta el CTA: lo envolvemos para fijar una
            distancia cómoda bajo el grid — el 'auto' interno se resuelve a
            0 dentro de este wrapper de altura=contenido, así el CTA sigue
            al contenido en vez de flotar al fondo. */}
        <View style={styles.ctaFollow}>
          <OnbCta mode={mode} label={t('onboarding:redesign.avatar.cta')} onPress={onNext} />
        </View>
      </OnbScrollBody>
    </OnbScreenShell>
  )
}

const styles = StyleSheet.create({
  destacadoCol: {
    alignItems: 'center',
  },
  destacadoCircle: {
    width: 132,
    height: 132,
    borderRadius: 66,
    alignItems: 'center',
    justifyContent: 'center',
  },
  destacadoNombre: {
    fontSize: 18,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    marginTop: 12,
  },
  destacadoHelper: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    marginTop: 2,
  },
  dice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    borderRadius: 20,
    paddingVertical: 12,
    paddingHorizontal: 18,
  },
  diceEmoji: {
    fontSize: 17,
  },
  diceLabel: {
    fontSize: 14,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  sectionLabel: {
    fontSize: 11.5,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    // 0.16em × 11.5px del mockup.
    letterSpacing: 1.84,
  },
  sectionLink: {
    fontSize: 12.5,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
  },
  grid: {
    marginTop: 12,
    gap: 10,
  },
  // Bloque expandido: hereda el gap del grid padre entre filas.
  gridMore: {
    gap: 10,
  },
  gridRow: {
    flexDirection: 'row',
    gap: 10,
  },
  tile: {
    flex: 1,
    height: 64,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Relleno invisible de la última fila corta (misma geometría).
  tileSpacer: {
    flex: 1,
  },
  // El CTA sigue al grid a distancia fija (neutraliza el marginTop:'auto'
  // del kit dentro de un contenedor de altura=contenido). Ver comentario
  // en el JSX.
  ctaFollow: {
    marginTop: 28,
  },
})
