import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'
import {
  AVATAR_LABELS,
  AVATAR_SLUGS,
  type AvatarSlug,
} from '@/assets/avatars'
import { AvatarAnimal } from '@/components/ui/avatar-animal'
import { NeoSurface } from '@/components/ui/neo-surface'
import { RiseView } from '@/components/home/animated/rise-view'
import { SUPPORTS_INSET_SHADOW } from '@/components/wizard/inset-shadow-support'
import { usePressScale } from '@/hooks/use-press-scale'
import { neoInk } from '@/theme/neo-ink'
import {
  neoCategoryPastels,
  neoRadii,
  neoTokens,
  pastelDarkSolid,
} from '@/theme/neo-tokens'
import { nunitoFamily } from '@/theme/typography'
import { useAppTheme } from '@/theme/theme-provider'

// Un pastel fijo por avatar (5b dibuja la grilla con tarjetas de color, no
// con celdas neutras). El reparto es por posición en el registro congelado
// de slugs, así que el color de cada animal no cambia entre sesiones ni al
// agregar avatares al final del pack.
const PASTELS = Object.values(neoCategoryPastels)
const LIGHT_PASTEL_BY_SLUG = {} as Record<AvatarSlug, string>
const DARK_PASTEL_BY_SLUG = {} as Record<AvatarSlug, string>
AVATAR_SLUGS.forEach((slug, i) => {
  const pastel = PASTELS[i % PASTELS.length]!
  LIGHT_PASTEL_BY_SLUG[slug] = pastel
  DARK_PASTEL_BY_SLUG[slug] = pastelDarkSolid(pastel)
})

function avatarPastel(slug: AvatarSlug, isDark: boolean): string {
  return (isDark ? DARK_PASTEL_BY_SLUG : LIGHT_PASTEL_BY_SLUG)[slug]
}

interface StepAvatarProps {
  selected: AvatarSlug
  onSelect: (slug: AvatarSlug) => void
}

export function StepAvatar({ selected, onSelect }: StepAvatarProps) {
  const { theme } = useAppTheme()
  const neo = neoTokens(theme.mode)
  const { t } = useTranslation()

  return (
    <View style={styles.stack}>
      <RiseView>
        <Text style={[styles.title, { color: neo.text }]}>{t('onboarding:avatar.title')}</Text>
        <Text style={[styles.subcopy, { color: neo.textMuted }]}>
          {t('onboarding:avatar.subcopy')}
        </Text>
      </RiseView>

      <RiseView delay={80}>
        <Animated.View
          key={`preview-${selected}`}
          entering={FadeIn.duration(220)}
          layout={LinearTransition.duration(220)}
        >
          {/* Pedestal + medallón pastel con anillo verde (5b): el avatar
              elegido es el protagonista del paso. */}
          <NeoSurface radius={neoRadii.card} style={styles.heroCard} variant="raisedLg">
            <AvatarAnimal
              slug={selected}
              size={120}
              tint={neo.text}
              backgroundTint={avatarPastel(selected, theme.isDark)}
              ringColor={neo.green}
            />
            <Text style={[styles.heroLabel, { color: neo.text }]}>
              {AVATAR_LABELS[selected]}
            </Text>
          </NeoSurface>
        </Animated.View>
      </RiseView>

      <RiseView delay={140}>
        <View style={styles.gridHeader}>
          <Text style={[styles.eyebrow, { color: neo.textMuted }]}>
            {t('onboarding:avatar.gridEyebrow')}
          </Text>
          <Text style={[styles.gridCount, { color: neo.textMuted }]}>
            {t('onboarding:avatar.gridCount', { count: AVATAR_SLUGS.length })}
          </Text>
        </View>

        {/* Grid horizontal: 3 filas fijas que se desplazan a lo ancho.
            Mantiene el alto del sheet acotado (el footer "Guardar" queda
            siempre visible) y permite recorrer los 42 sin scroll vertical. */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.gridContent}
        >
          {AVATAR_SLUGS.map((slug) => (
            <AvatarCell
              key={slug}
              slug={slug}
              selected={slug === selected}
              onSelect={onSelect}
              theme={theme}
            />
          ))}
        </ScrollView>
      </RiseView>
    </View>
  )
}

interface AvatarCellProps {
  slug: AvatarSlug
  selected: boolean
  onSelect: (slug: AvatarSlug) => void
  theme: ReturnType<typeof useAppTheme>['theme']
}

function AvatarCell({ slug, selected, onSelect, theme }: AvatarCellProps) {
  const press = usePressScale({ pressedScale: 0.98 })
  const neo = neoTokens(theme.mode)
  const ink = neoInk(theme.mode)
  return (
    <Pressable
      onPress={() => onSelect(slug)}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={AVATAR_LABELS[slug]}
    >
      <Animated.View
        style={[
          styles.gridCell,
          press.animatedStyle,
          selected
            ? { backgroundColor: neo.selectedTint, boxShadow: neo.shadows.ringSelected }
            : {
                backgroundColor: avatarPastel(slug, theme.isDark),
                boxShadow: neo.shadows.raisedSm,
              },
          {
            // Relieve y anillo son `boxShadow`: Android < 28/29 los
            // descarta en silencio (ver `inset-shadow-support`) y la
            // celda seleccionada quedaría marcada sólo por un tinte al
            // 10-15%. El borde sólo aparece en ese piso.
            borderWidth: SUPPORTS_INSET_SHADOW ? 0 : selected ? 2 : 1,
            borderColor: selected ? neo.green : neo.sheetDivider,
          },
        ]}
      >
        <AvatarAnimal
          slug={slug}
          size={44}
          tint={selected ? ink.accent : neo.text}
          backgroundTint="transparent"
        />
      </Animated.View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  stack: { gap: 16 },
  title: {
    fontSize: 24,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    letterSpacing: -0.6,
  },
  subcopy: {
    fontSize: 13,
    fontWeight: '400',
    fontFamily: nunitoFamily('400'),
    marginTop: 4,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: 1.6,
  },
  heroCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
    gap: 12,
  },
  heroLabel: {
    fontSize: 18,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    letterSpacing: -0.2,
  },
  gridHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  gridCount: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    letterSpacing: 0.2,
  },
  // Column-wrap inside a horizontal ScrollView: items flow top→bottom
  // filling 3 rows, then wrap into the next column → content grows
  // horizontally and the ScrollView pans across it. Height = 3 cells +
  // 2 gaps so exactly 3 rows fit.
  gridContent: {
    flexDirection: 'column',
    flexWrap: 'wrap',
    alignContent: 'flex-start',
    height: 64 * 3 + 10 * 2,
    gap: 10,
    paddingRight: 4,
  },
  gridCell: {
    width: 64,
    height: 64,
    borderRadius: neoRadii.tile,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
