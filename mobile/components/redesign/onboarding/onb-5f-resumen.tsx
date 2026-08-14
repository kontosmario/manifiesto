import { useTranslation } from 'react-i18next'
import { Image, Pressable, StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui/app-text'
import { getAvatarComponent, type AvatarSlug } from '@/assets/avatars'
import { BrotMascot, BrotParticles } from '@/components/brot'
import { CATEGORY_ICONS } from '@/components/category/category-icon-registry'
import { CategorySticker } from '@/components/category/category-sticker'
import { ONBOARDING_ICONS } from '@/components/onboarding/onboarding-icon-registry'
import { nunitoFamily } from '@/theme/typography'
import { OnbBody, OnbScreenShell } from './onb-kit'
import { ONB_SPEC, type OnbMode } from './onb-spec'

/**
 * 5f · ¡Listo! / resumen — réplica de screens/5f.html (claro) y
 * 5fo.html (oscuro). Copys y valores literales del mockup. Resumen
 * SOLO LECTURA (sin editar); partículas a pantalla completa ×16 y
 * pedestal con el medallón del avatar + Brot `cheer` asomado.
 */

// ─── Valores propios de 5f (literales de 5f/5fo) ─────────────────────

interface Onb5fSpec {
  /** Chip "Ya estás en Manifiesto" (claro: solo inset, sin fondo). */
  chipBackground: string | undefined
  chipShadow: string
  chipDot: string
  chipText: string
  /** Pedestal circular 176 (claro plano; oscuro gradiente). */
  pedestalBackground: string
  pedestalGradientCss: string | undefined
  pedestalShadow: string
  /** Línea "Marcos · Guacamayo" + caption. */
  nameDot: string
  subText: string
  /** Card del resumen (radius 26, padding 6/16). */
  cardBackground: string
  cardGradientCss: string
  cardShadow: string
  rowLabel: string
  rowBorder: string
  tilePerfil: string
  tileHogar: string
  tileIngresos: string
  tileAhorro: string
  /** CTA verde "Ir a mi Inicio" (distinto del CTA neutro del kit). */
  ctaBackground: string
  ctaGradientCss: string
  ctaShadow: string
  ctaText: string
  /** Partículas full-screen ×16 (paleta propia de 5f). */
  particleColors: readonly string[]
}

const FIVE_F_SPEC: Record<OnbMode, Onb5fSpec> = {
  light: {
    chipBackground: undefined,
    chipShadow:
      'inset 3px 3px 7px rgba(151,160,136,0.38), inset -3px -3px 7px rgba(255,255,255,0.92)',
    chipDot: '#2E7C39',
    chipText: '#3E5A44',
    pedestalBackground: '#E9EBE0',
    pedestalGradientCss: undefined,
    pedestalShadow:
      '14px 14px 30px rgba(151,160,136,0.46), -14px -14px 30px rgba(255,255,255,0.95)',
    nameDot: '#9AA694',
    subText: '#54644F',
    cardBackground: '#ECEDE1',
    cardGradientCss: 'linear-gradient(145deg, #F3F4E9, #E4E6D8)',
    cardShadow:
      '8px 8px 18px rgba(151,160,136,0.42), -8px -8px 18px rgba(255,255,255,0.92)',
    rowLabel: '#9AA694',
    rowBorder: 'rgba(151,160,136,0.25)',
    tilePerfil: '#F7E3CF',
    tileHogar: '#D6E4F0',
    tileIngresos: '#DDEBDD',
    tileAhorro: '#F2ECC9',
    ctaBackground: '#489350',
    ctaGradientCss: 'radial-gradient(circle at 32% 28%, #489350, #2E7434 85%)',
    ctaShadow: '0 12px 24px rgba(46,116,52,0.4), inset 0 2px 3px rgba(255,255,255,0.3)',
    ctaText: '#F5F2E1',
    particleColors: ['#7FB069', '#E8A87C', '#9BB894'],
  },
  dark: {
    chipBackground: '#142519',
    chipShadow:
      'inset 3px 3px 7px rgba(0,0,0,0.5), inset -3px -3px 7px rgba(101,152,113,0.08)',
    chipDot: '#A4E3A6',
    chipText: '#B9CCB2',
    pedestalBackground: '#182B1F',
    pedestalGradientCss: 'linear-gradient(145deg, #1D3426, #132318)',
    pedestalShadow:
      '14px 14px 30px rgba(0,0,0,0.6), -14px -14px 30px rgba(101,152,113,0.12)',
    nameDot: '#7C917A',
    subText: '#93A78F',
    cardBackground: '#1B3023',
    cardGradientCss: 'linear-gradient(145deg, #21382A, #16281C)',
    cardShadow: '8px 8px 18px rgba(0,0,0,0.5), -8px -8px 18px rgba(101,152,113,0.1)',
    rowLabel: '#7C917A',
    rowBorder: 'rgba(151,160,136,0.25)',
    // Tiles CLAROS también en dark: los stickers PNG (HOGAR/INGRESOS/
    // AHORRO) están ilustrados para fondo claro; sobre pastel oscuro se
    // funden. Se mantiene el pastel claro en ambos temas.
    tilePerfil: '#F7E3CF',
    tileHogar: '#D6E4F0',
    tileIngresos: '#DDEBDD',
    tileAhorro: '#F2ECC9',
    ctaBackground: '#6FAC72',
    ctaGradientCss: 'radial-gradient(circle at 32% 28%, #9FDC9F, #3E7D46 85%)',
    ctaShadow: '0 0 26px rgba(140,225,150,0.3), inset 0 2px 3px rgba(255,255,255,0.35)',
    ctaText: '#0F1E14',
    particleColors: ['#A4E3A6', '#F2A87E', '#F1EEDD'],
  },
}

/** Medallón del avatar del mockup (guacamayo) — igual en ambos modos. */
const MEDALLION_GRADIENT_CSS = 'radial-gradient(circle at 34% 28%, #F2B183, #E08A5E 82%)'
const MEDALLION_BACKGROUND = '#E99E70'
const MEDALLION_SHADOW =
  'inset 0 3px 6px rgba(255,255,255,0.4), inset 0 -4px 8px rgba(150,80,45,0.25)'

// Glifo ≈72% de su círculo (precedente GLYPH_RATIO de avatar-animal):
// medallón 142 → 102; tile de la fila PERFIL 34 → 24.
const MEDALLION_GLYPH = 102
const ROW_GLYPH = 24
// Tinta del glifo PERFIL en la fila: fija OSCURA en ambos temas (las
// tiles quedan claras) — el cream de dark no leería sobre el pastel.
const ROW_PERFIL_TINT = '#24382A'

// ─── Datos del resumen (lo que las filas del mockup muestran) ────────

export interface Onb5fSummary {
  /** Nombre elegido (título "¡Listo, Marcos!" y fila PERFIL). */
  name: string
  /** Avatar elegido (medallón + fila PERFIL). */
  avatar: {
    /** Slug del pack SVG real de la app (p.ej. 'macaw'). */
    slug: AvatarSlug
    /** Nombre del animal (AVATAR_LABELS[slug], p.ej. 'Guacamayo'). */
    label: string
    /** Gradiente CSS del medallón; default = guacamayo del mockup. */
    medallionGradientCss?: string
    /** Fondo sólido de respaldo del medallón. */
    medallionColor?: string
  }
  /** Fila HOGAR (p.ej. 'Yo solo'). */
  hogar: string
  /** ¿Hogar en solitario? Elige el sticker (solo vs familia). */
  hogarSolo: boolean
  /** Fila INGRESOS (p.ej. '$2.500.000 · mensual · día 1'). */
  ingresos: string
  /** Fila AHORRO (p.ej. '10% · $250.000 por mes'). */
  ahorro: string
  /**
   * Variante del resumen. 'creator' (default) = el mockup 5f
   * (PERFIL/HOGAR/INGRESOS/AHORRO). 'joiner' = el que se unió a un
   * hogar: mismo diseño, pero HOGAR = la familia y una fila de APORTE
   * en vez de INGRESOS-ciclo/AHORRO (hereda las finanzas del hogar).
   */
  variant?: 'creator' | 'joiner'
  /** Solo joiner — fila HOGAR (p.ej. 'Te uniste · 3 miembros'). */
  joinerHogar?: string
  /** Solo joiner — fila APORTE (p.ej. 'Aportas $250.000 /mes'). */
  joinerAporte?: string
}

// ─── Pantalla ────────────────────────────────────────────────────────

export function Onb5fResumen({
  mode,
  summary,
  onGoHome,
}: {
  mode: OnbMode
  summary: Onb5fSummary
  /** CTA único del mockup: "Ir a mi Inicio". */
  onGoHome?: () => void
}) {
  const s = ONB_SPEC[mode]
  const fs = FIVE_F_SPEC[mode]
  const { t } = useTranslation()

  // Silueta del pack real; tinta = texto primario del rediseño (mismo
  // mapeo que 5b).
  const AvatarGlyph = getAvatarComponent(summary.avatar.slug)

  const isJoiner = summary.variant === 'joiner'

  const perfilRow = {
    label: t('onboarding:summary.rowProfile'),
    value: `${summary.name} · ${summary.avatar.label}`,
    // eslint-disable-next-line react-hooks/static-components -- lookup estable del registro congelado del pack, no un componente creado
    icon: <AvatarGlyph size={ROW_GLYPH} color={ROW_PERFIL_TINT} />,
    tile: fs.tilePerfil,
  }

  // Joiner: HOGAR = la familia (sticker familia) + una fila de APORTE
  // (sticker banco). Sin INGRESOS-ciclo ni AHORRO — los hereda del
  // hogar. Mismo look de filas que el creador.
  const rows = isJoiner
    ? [
        perfilRow,
        {
          label: t('onboarding:summary.rowHousehold'),
          value: summary.joinerHogar ?? summary.hogar,
          icon: (
            <CategorySticker source={ONBOARDING_ICONS.familia} size={26} onLightSurface />
          ),
          tile: fs.tileHogar,
        },
        {
          label: t('onboarding:summary.rowContribution'),
          value: summary.joinerAporte ?? summary.ingresos,
          icon: (
            <Image
              source={CATEGORY_ICONS['finanzas/banco']}
              style={styles.rowTileImg}
              resizeMode="contain"
            />
          ),
          tile: fs.tileIngresos,
        },
      ]
    : [
        perfilRow,
        {
          label: t('onboarding:summary.rowHousehold'),
          value: summary.hogar,
          // Sticker real del onboarding (solo vs familia). La tile ya es
          // clara en ambos temas → onLightSurface (sin placa extra).
          icon: (
            <CategorySticker
              source={summary.hogarSolo ? ONBOARDING_ICONS.solo : ONBOARDING_ICONS.familia}
              size={26}
              onLightSurface
            />
          ),
          tile: fs.tileHogar,
        },
        {
          label: t('onboarding:summary.rowIncome'),
          value: summary.ingresos,
          icon: (
            <Image
              source={CATEGORY_ICONS['finanzas/banco']}
              style={styles.rowTileImg}
              resizeMode="contain"
            />
          ),
          tile: fs.tileIngresos,
        },
        {
          label: t('onboarding:summary.rowSavings'),
          value: summary.ahorro,
          icon: (
            <Image
              source={CATEGORY_ICONS['finanzas/ahorro']}
              style={styles.rowTileImg}
              resizeMode="contain"
            />
          ),
          tile: fs.tileAhorro,
        },
      ]

  return (
    <OnbScreenShell mode={mode}>
      {/* Partículas a pantalla completa, detrás del contenido (fuera
          del OnbBody: cubren también el gutter de 22px). */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <BrotParticles colors={fs.particleColors} count={16} />
      </View>

      <OnbBody>
        <View style={styles.headBlock}>
          <View
            style={[
              styles.chip,
              { backgroundColor: fs.chipBackground, boxShadow: fs.chipShadow },
            ]}
          >
            <View style={[styles.chipDot, { backgroundColor: fs.chipDot }]} />
            <Text style={[styles.chipText, { color: fs.chipText }]}>
              {isJoiner ? t('onboarding:summary.chipJoined') : t('onboarding:success.eyebrow')}
            </Text>
          </View>
          {/* Guard live: sin nombre aún (cache asentando) cae al "¡Listo!"
              del copy real — en los previews name siempre viene. */}
          <Text style={[styles.title, { color: s.text }]}>
            {summary.name
              ? t('onboarding:success.titleNamed', { name: summary.name })
              : t('onboarding:success.title')}
          </Text>
        </View>

        <View style={styles.pedestalRow}>
          <View>
            <View
              style={[
                styles.pedestal,
                { backgroundColor: fs.pedestalBackground, boxShadow: fs.pedestalShadow },
                fs.pedestalGradientCss
                  ? { experimental_backgroundImage: fs.pedestalGradientCss }
                  : null,
              ]}
            >
              <View
                style={[
                  styles.medallion,
                  {
                    backgroundColor: summary.avatar.medallionColor ?? MEDALLION_BACKGROUND,
                    experimental_backgroundImage:
                      summary.avatar.medallionGradientCss ?? MEDALLION_GRADIENT_CSS,
                    boxShadow: MEDALLION_SHADOW,
                  },
                ]}
              >
                {/* eslint-disable-next-line react-hooks/static-components -- lookup estable del registro congelado del pack, no un componente creado */}
                <AvatarGlyph size={MEDALLION_GLYPH} color={s.text} />
              </View>
            </View>
            <View style={styles.brotWrap}>
              <BrotMascot pose="cheer" size={76} />
            </View>
          </View>
        </View>

        <View style={styles.nameRow}>
          <Text style={[styles.nameText, { color: s.text }]}>{summary.name}</Text>
          <View style={[styles.nameDot, { backgroundColor: fs.nameDot }]} />
          <Text style={[styles.avatarLabel, { color: fs.subText }]}>
            {summary.avatar.label}
          </Text>
        </View>
        <Text style={[styles.caption, { color: fs.subText }]}>
          {isJoiner
            ? t('onboarding:summary.captionJoiner')
            : t('onboarding:summary.captionCreator')}
        </Text>

        <View
          style={[
            styles.card,
            {
              backgroundColor: fs.cardBackground,
              experimental_backgroundImage: fs.cardGradientCss,
              boxShadow: fs.cardShadow,
            },
          ]}
        >
          {rows.map((row, i) => (
            <View
              key={row.label}
              style={[
                styles.row,
                i < rows.length - 1
                  ? { borderBottomWidth: 1.5, borderBottomColor: fs.rowBorder }
                  : null,
              ]}
            >
              <View style={[styles.rowTile, { backgroundColor: row.tile }]}>
                {row.icon}
              </View>
              <View style={styles.rowTextCol}>
                <Text style={[styles.rowLabel, { color: fs.rowLabel }]}>{row.label}</Text>
                <Text style={[styles.rowValue, { color: s.text }]}>{row.value}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.ctaBlock}>
          <Pressable
            accessibilityRole="button"
            onPress={onGoHome}
            style={[
              styles.cta,
              {
                backgroundColor: fs.ctaBackground,
                experimental_backgroundImage: fs.ctaGradientCss,
                boxShadow: fs.ctaShadow,
              },
            ]}
          >
            <Text style={[styles.ctaLabel, { color: fs.ctaText }]}>
              {t('onboarding:summary.goHome')}
            </Text>
          </Pressable>
        </View>
      </OnbBody>
    </OnbScreenShell>
  )
}

// ─── Estilos (valores literales de 5f/5fo) ───────────────────────────

const styles = StyleSheet.create({
  headBlock: {
    alignItems: 'center',
    marginTop: 12,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  chipDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  chipText: {
    fontSize: 12.5,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
  },
  title: {
    fontSize: 34,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    marginTop: 12,
  },
  pedestalRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 18,
  },
  pedestal: {
    width: 176,
    height: 176,
    borderRadius: 88,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medallion: {
    width: 142,
    height: 142,
    borderRadius: 71,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brotWrap: {
    position: 'absolute',
    bottom: -8,
    right: -14,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
  },
  nameText: {
    fontSize: 15,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
  },
  nameDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  avatarLabel: {
    fontSize: 13.5,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
  },
  caption: {
    fontSize: 12.5,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    textAlign: 'center',
    marginTop: 4,
  },
  card: {
    marginTop: 18,
    borderRadius: 26,
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
  },
  rowTile: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTileImg: {
    width: 22,
    height: 22,
  },
  rowTextCol: {
    flex: 1,
  },
  rowLabel: {
    fontSize: 11,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    // 0.08em × 11px del mockup.
    letterSpacing: 0.88,
  },
  rowValue: {
    fontSize: 14,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
  },
  ctaBlock: {
    marginTop: 'auto',
    paddingBottom: 16,
  },
  cta: {
    borderRadius: 24,
    padding: 16,
    alignItems: 'center',
  },
  ctaLabel: {
    fontSize: 16,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
  },
})
