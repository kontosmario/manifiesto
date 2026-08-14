import type { PropsWithChildren } from 'react'
import { useTranslation } from 'react-i18next'
import { Image, Pressable, StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui/app-text'
import Animated from 'react-native-reanimated'
import Svg, { Path } from 'react-native-svg'
import { CATEGORY_ICONS } from '@/components/category/category-icon-registry'
import { DynamicIncomeSticker } from '@/components/home/onboarding/dynamic-income-sticker'
import { usePressScale } from '@/hooks/use-press-scale'
import { nunitoFamily } from '@/theme/typography'
import type { OnbMode } from '../onb-spec'
import { ONB_5D_SPEC } from './onb-5d-spec'

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

/**
 * 5d · secciones 1 y 2 — etiqueta de sección, tiles de tipo de sueldo,
 * grilla 2×2 de ciclo y card informativa del caso variable.
 */

export type Onb5dTipo = 'fijo' | 'variable'
export type Onb5dCicloTipo = 'mensual' | 'quincenal' | 'semanal' | 'custom'

// ─── Etiqueta de sección (11.5/800, tracking 0.16em) ─────────────────

export function Onb5dSectionLabel({ mode, children }: PropsWithChildren<{ mode: OnbMode }>) {
  const d = ONB_5D_SPEC[mode]
  return <Text style={[styles.sectionLabel, { color: d.sectionLabel }]}>{children}</Text>
}

// ─── Badge check 24px del tile seleccionado ──────────────────────────

function CheckBadge({ mode }: { mode: OnbMode }) {
  const d = ONB_5D_SPEC[mode]
  return (
    <View
      style={[
        styles.checkBadge,
        {
          experimental_backgroundImage: d.accentRadialCss,
          backgroundColor: d.accentRadialFallback,
        },
      ]}
    >
      <Svg width={13} height={13} viewBox="0 0 24 24">
        <Path
          d="M5 12.5l4.5 4.5L19 7.5"
          stroke={d.checkStroke}
          strokeWidth={3.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </Svg>
    </View>
  )
}

// ─── Tile de tipo de sueldo (sección 1) ──────────────────────────────

export function Onb5dTipoTile({
  mode,
  kind,
  selected,
  onPress,
}: {
  mode: OnbMode
  kind: Onb5dTipo
  selected: boolean
  onPress: () => void
}) {
  const d = ONB_5D_SPEC[mode]
  const { t } = useTranslation()
  const copy = {
    title: t(`onboarding:redesign.ingresos.tipo.${kind}.title`),
    sub: t(`onboarding:redesign.ingresos.tipo.${kind}.sub`),
  }
  // La cajita del ícono queda CLARA en ambos temas (crema/pastel del
  // mockup) para que el sticker multicolor no pierda legibilidad sobre
  // fondo oscuro — por eso lee del spec `light`, no del `mode` actual.
  const dLight = ONB_5D_SPEC.light
  const iconIdleBg = kind === 'fijo' ? dLight.tileIconFijoBg : dLight.tileIconVariableBg
  const pressScale = usePressScale({ pressedScale: 0.97 })
  return (
    <AnimatedPressable
      accessibilityRole="button"
      onPress={onPress}
      onPressIn={pressScale.onPressIn}
      onPressOut={pressScale.onPressOut}
      style={[
        styles.tipoTile,
        selected
          ? { backgroundColor: d.tileSelectedBackground, boxShadow: d.tileSelectedShadow }
          : {
              experimental_backgroundImage: d.cardGradientCss,
              backgroundColor: d.cardFallback,
              boxShadow: d.tileIdleShadow,
            },
        pressScale.animatedStyle,
      ]}
    >
      <View
        style={[
          styles.tipoIconBox,
          { backgroundColor: selected ? dLight.tileIconSelectedBg : iconIdleBg },
        ]}
      >
        {kind === 'fijo' ? (
          <Image
            source={CATEGORY_ICONS['finanzas/banco']}
            style={styles.tipoIconImage}
            resizeMode="contain"
          />
        ) : (
          <DynamicIncomeSticker size={28} />
        )}
      </View>
      <View style={styles.tipoTextCol}>
        <Text
          style={[styles.tipoTitle, { color: selected ? d.tileSelectedTitle : d.tileIdleTitle }]}
        >
          {copy.title}
        </Text>
        <Text style={[styles.tipoSub, { color: selected ? d.tileSelectedSub : d.tileIdleSub }]}>
          {copy.sub}
        </Text>
      </View>
      {selected ? <CheckBadge mode={mode} /> : null}
    </AnimatedPressable>
  )
}

// ─── Card informativa del caso variable ──────────────────────────────

export function Onb5dVariableInfoCard({ mode }: { mode: OnbMode }) {
  const d = ONB_5D_SPEC[mode]
  const { t } = useTranslation()
  // Círculo claro en ambos temas (mismo criterio que las cajitas de
  // tipo) para que el sticker de ingreso variable se lea sobre oscuro.
  const dLight = ONB_5D_SPEC.light
  return (
    <View
      style={[
        styles.infoCard,
        {
          experimental_backgroundImage: d.cardGradientCss,
          backgroundColor: d.cardFallback,
          boxShadow: d.cardShadowStrong,
        },
      ]}
    >
      <View
        style={[
          styles.infoCircle,
          { backgroundColor: dLight.infoCircleBg, boxShadow: d.infoCircleShadow },
        ]}
      >
        <DynamicIncomeSticker size={28} />
      </View>
      <Text style={[styles.infoText, { color: d.infoText }]}>
        {t('onboarding:redesign.ingresos.variableInfo')}
      </Text>
    </View>
  )
}

// ─── Grilla 2×2 de ciclo (sección 2) ─────────────────────────────────

// Copy (title/sub) resuelto por i18n en CicloTile a partir de `id`.
const CICLO_TILES: Array<{ id: Onb5dCicloTipo; icon: string }> = [
  { id: 'mensual', icon: 'frecuencias/mensual' },
  { id: 'quincenal', icon: 'frecuencias/quincenal' },
  { id: 'semanal', icon: 'frecuencias/semanal' },
  { id: 'custom', icon: 'frecuencias/cuotas' },
]

export function Onb5dCicloGrid({
  mode,
  selected,
  onSelect,
}: {
  mode: OnbMode
  selected: Onb5dCicloTipo | null
  onSelect: (ciclo: Onb5dCicloTipo) => void
}) {
  return (
    <View style={styles.cicloGrid}>
      {[CICLO_TILES.slice(0, 2), CICLO_TILES.slice(2)].map((row, r) => (
        <View key={r} style={styles.cicloRow}>
          {row.map((tile) => (
            <CicloTile
              key={tile.id}
              mode={mode}
              tile={tile}
              selected={tile.id === selected}
              onPress={() => onSelect(tile.id)}
            />
          ))}
        </View>
      ))}
    </View>
  )
}

// Tile individual (componente propio: hook de press scale por tile).
function CicloTile({
  mode,
  tile,
  selected,
  onPress,
}: {
  mode: OnbMode
  tile: (typeof CICLO_TILES)[number]
  selected: boolean
  onPress: () => void
}) {
  const d = ONB_5D_SPEC[mode]
  const { t } = useTranslation()
  // Cajita clara en ambos temas (cf. tiles de tipo) para el sticker.
  const dLight = ONB_5D_SPEC.light
  const pressScale = usePressScale({ pressedScale: 0.97 })
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      onPressIn={pressScale.onPressIn}
      onPressOut={pressScale.onPressOut}
      style={[
        styles.cicloTile,
        selected
          ? {
              backgroundColor: d.tileSelectedBackground,
              boxShadow: d.tileSelectedShadow,
            }
          : {
              experimental_backgroundImage: d.cardGradientCss,
              backgroundColor: d.cardFallback,
              boxShadow: d.tileIdleGridShadow,
            },
        pressScale.animatedStyle,
      ]}
    >
      <View style={styles.cicloTitleRow}>
        <View style={[styles.cicloIconBox, { backgroundColor: dLight.tileIconSelectedBg }]}>
          <Image
            source={CATEGORY_ICONS[tile.icon]}
            style={styles.cicloIconImage}
            resizeMode="contain"
          />
        </View>
        <Text
          style={[
            styles.cicloTitle,
            { color: selected ? d.tileSelectedTitle : d.tileIdleTitle },
          ]}
        >
          {t(`onboarding:redesign.ingresos.ciclo.${tile.id}.title`)}
        </Text>
      </View>
      <Text
        style={[
          styles.cicloSub,
          { color: selected ? d.tileSelectedSub : d.tileIdleSub },
        ]}
      >
        {t(`onboarding:redesign.ingresos.ciclo.${tile.id}.sub`)}
      </Text>
    </AnimatedPressable>
  )
}

// ─── Estilos (valores literales de 5d…5d5) ───────────────────────────

const styles = StyleSheet.create({
  sectionLabel: {
    fontSize: 11.5,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: 1.84, // 0.16em × 11.5px
    marginTop: 16,
  },
  checkBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  tipoTile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    marginTop: 10,
    borderRadius: 22,
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  tipoIconBox: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  tipoIconImage: {
    width: 26,
    height: 26,
  },
  tipoTextCol: {
    flex: 1,
  },
  tipoTitle: {
    fontSize: 15,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
  },
  tipoSub: {
    fontSize: 11.5,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 10,
    borderRadius: 22,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  infoCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  infoText: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    lineHeight: 18.125, // 1.45 × 12.5px
  },
  cicloGrid: {
    marginTop: 10,
    gap: 9,
  },
  cicloRow: {
    flexDirection: 'row',
    gap: 9,
  },
  cicloTile: {
    flex: 1,
    borderRadius: 18,
    paddingVertical: 11,
    paddingHorizontal: 12,
  },
  cicloTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  cicloIconBox: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  cicloIconImage: {
    width: 17,
    height: 17,
  },
  cicloTitle: {
    fontSize: 13.5,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
  },
  cicloSub: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    marginTop: 2,
  },
})
