// Tile de selección de frecuencia. Mismo border-glide pattern que
// `NameInput` / `AmountCard`: focus → grow + tint; warning glide sin
// width change. Extraído de `add-fijo-v2-screen.tsx`.
import { useEffect } from 'react'
import { Image, Pressable, StyleSheet, View } from 'react-native'
import { AnimatedText, Text } from '@/components/ui/app-text'
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
// El hook PROPIO, nunca el de reanimated: el de la librería abre una
// suscripción a `AccessibilityInfo` por call site (el import trap del jank de
// Android gama baja) e ignora el override de Motion de Ajustes.
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { CATEGORY_ICONS } from '@/components/category/category-icon-registry'
import { useFijosSkin } from '@/components/fijos/fijos-skin'
import { SUPPORTS_INSET_SHADOW } from '@/components/wizard/inset-shadow-support'
import { usePressScale } from '@/hooks/use-press-scale'
import { motionDurations } from '@/lib/motion'
import { useAppTheme } from '@/theme/theme-provider'
import { nunitoFamily } from '@/theme/typography'

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

/**
 * Caja del sticker de frecuencia en la piel neo, POR ÍCONO.
 *
 * Los siete PNG son 256×256, pero el dibujo ocupa fracciones muy distintas de
 * su lienzo — medido sobre el canal alfa: quincenal 78%, semestral 76%, anual
 * 75%, cuotas 72%, mensual 68%, **trimestral 46%, semanal 39%**. Con
 * `resizeMode: contain` en una caja única, esa diferencia se traslada tal cual
 * al render: `semanal` salía a menos de la mitad que `semestral` en la misma
 * caja, y el owner los marcó como "chicos".
 *
 * La corrección compensa la ocupación, con tope: sin él, `semanal` necesitaría
 * una caja de 60 y el chip se iría a 80 de alto. Los dos outliers quedan igual
 * un poco más chicos que sus hermanos — el arreglo de raíz es re-exportar esos
 * dos assets con el dibujo al 76% como los demás, pero eso los agranda también
 * en la pantalla VIVA, que no se toca.
 */
const FREQ_ICON_BASE = 30
const FREQ_ICON_SIZE: Record<string, number> = {
  'frecuencias/semanal': 40,
  'frecuencias/trimestral': 40,
  'frecuencias/mensual': 33,
}

export interface FreqTileProps {
  icon: string
  label: string
  selected: boolean
  onPress: () => void
  /** Cuando true, el border resting se tinta a `theme.colors.warning`
   *  via un smooth glide. Los selected tiles ignoran el flag — se quedan
   *  en el brand color así el recovery state queda unambiguous. */
  warning?: boolean
}

export function FreqTile({
  icon,
  label,
  selected,
  onPress,
  warning = false,
}: FreqTileProps) {
  const { theme } = useAppTheme()
  const skin = useFijosSkin()
  const neo = skin.kind === 'neo' ? skin : null
  const reduceMotion = useReducedMotion()
  const press = usePressScale({ pressedScale: 0.94 })
  const selectedProgress = useSharedValue(selected ? 1 : 0)
  const warningProgress = useSharedValue(warning ? 1 : 0)
  const neoIconSize = FREQ_ICON_SIZE[icon] ?? FREQ_ICON_BASE

  useEffect(() => {
    const target = selected ? 1 : 0
    selectedProgress.value = reduceMotion
      ? target
      : withTiming(target, { duration: motionDurations.standard })
  }, [selected, reduceMotion, selectedProgress])

  useEffect(() => {
    warningProgress.value = reduceMotion
      ? (warning ? 1 : 0)
      : withTiming(warning ? 1 : 0, {
          duration: motionDurations.standard,
          easing: Easing.bezier(0.32, 0.72, 0, 1),
        })
  }, [warning, reduceMotion, warningProgress])

  // Las dos superficies del chip, cruzándose por opacidad. Ver el comentario
  // del JSX: ni el gradiente ni el `boxShadow` se pueden interpolar.
  const idleLayerStyle = useAnimatedStyle(() => ({ opacity: 1 - selectedProgress.value }))
  const activeLayerStyle = useAnimatedStyle(() => ({ opacity: selectedProgress.value }))
  // La tinta del label cruza junto con la superficie: al invertirse el chip,
  // pasar de la sub apagada a la tinta activa de golpe se leía como parpadeo.
  // El fallback NO es `#000` (no existe en ninguna de las dos paletas): sin
  // skin este estilo ni se aplica, así que apunta a las tintas de la rama
  // classic para que un futuro consumidor no se coma un negro puro.
  const neoInkFrom = neo?.mutedInk ?? theme.colors.textMuted
  const neoInkTo = neo?.add.freqChip.activeInk ?? theme.colors.text
  const labelInkStyle = useAnimatedStyle(() => ({
    color: interpolateColor(selectedProgress.value, [0, 1], [neoInkFrom, neoInkTo]),
  }))

  // Mismo nested-interpolate pattern que los otros shared inputs: width
  // sólo sigue la selected animation así el warning toggle nunca
  // resiza el tile.
  //
  // En `neo` el estilo NO se aplica (el chip se hunde, no se bordea), así que
  // el worklet corta antes de interpolar: si no, tres tokens V1 se
  // interpolarían por frame para un resultado que nadie consume.
  const isNeo = neo != null
  const borderStyle = useAnimatedStyle(() => {
    'worklet'
    if (isNeo) return { borderColor: 'transparent', borderWidth: 0 }
    const normalColor = interpolateColor(
      selectedProgress.value,
      [0, 1],
      [theme.colors.line, theme.colors.primary],
    )
    const warnColor = interpolateColor(
      selectedProgress.value,
      [0, 1],
      [theme.colors.warning, theme.colors.primary],
    )
    return {
      borderColor: interpolateColor(
        warningProgress.value,
        [0, 1],
        [normalColor, warnColor],
      ),
      borderWidth: 1 + selectedProgress.value,
    }
  })

  // Anillo de aviso de la piel `neo`. La migración anterior apagó el
  // `borderStyle` sin reponer nada, así que el estado de recovery ("elegí una
  // frecuencia") quedaba MUDO: el usuario tocaba el CTA atenuado y ningún chip
  // cambiaba. Un `boxShadow` es un string y Reanimated no lo interpola, así
  // que el cue va en una capa propia cuya OPACIDAD sí se anima — mismo recurso
  // que el `warnRing` de `AmountCard`, y sin mover el layout.
  //
  // Se apaga cuando el chip está seleccionado: el flag `warning` describe "no
  // elegiste ninguna", y marcar el elegido contradiría el mensaje (es la misma
  // regla que ya tenía la rama classic vía el nested-interpolate).
  const warnRingStyle = useAnimatedStyle(() => ({
    opacity: warningProgress.value * (1 - selectedProgress.value),
  }))

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      style={neo ? press.animatedStyle : undefined}
    >
      <Animated.View
        style={[
          styles.freqTile,
          // Handoff: CHIP horizontal (r15, 9×15), no tile cuadrado. El ícono se
          // conserva a pedido del owner —el markup lo dibuja sin ícono— y va
          // adentro del chip, a la izquierda del label.
          neo ? styles.freqChipNeo : null,
          // Match el category rail tile bg (`theme.colors.surface`) así
          // ambos rails comparten el mismo light-mode tone en vez de
          // mezclar white categories con cream-tinted frequency tiles.
          // Sólo en classic: en neo lo pisa el `transparent` de abajo y dejaba
          // un token V1 vivo en el árbol del rediseño.
          neo ? null : { backgroundColor: theme.colors.surface },
          // `neo` reemplaza el borde animado por el idioma del handoff:
          // ELEVADO en reposo y HUNDIDO con anillo al seleccionar. El
          // seleccionado no se rellena — se hunde, que es el recurso de
          // "presionado" del neumorfismo. El borde se anula (`borderWidth: 0`)
          // para que no conviva con el anillo.
          neo ? null : borderStyle,
          neo
            ? {
                borderRadius: neo.add.freqChip.radius,
                borderWidth: 0,
                paddingHorizontal: neo.add.freqChip.padH,
                paddingVertical: neo.add.freqChip.padV,
                // Sin fondo propio: las DOS superficies viven en capas
                // absolutas que se cruzan por opacidad (ver abajo).
                backgroundColor: 'transparent',
              }
            : null,
        ]}
      >
        {/*
          La selección CRUZA dos superficies en vez de saltar. Ni el fill ni la
          sombra son animables por interpolación —una es un gradiente CSS y la
          otra un string—, así que se pintan como dos capas absolutas y lo que
          se anima es su opacidad. Es la única forma de que el chip pase de
          elevado a relleno con transición y no de un frame al otro.
        */}
        {neo ? (
          <>
            <Animated.View
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFill,
                {
                  borderRadius: neo.add.freqChip.radius,
                  backgroundColor: neo.add.quickChip.background,
                  experimental_backgroundImage: neo.add.quickChip.gradientCss,
                  boxShadow: neo.add.quickChip.shadow,
                },
                idleLayerStyle,
              ]}
            />
            <Animated.View
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFill,
                {
                  borderRadius: neo.add.freqChip.radius,
                  backgroundColor: neo.add.freqChip.activeBackground,
                  boxShadow: neo.add.freqChip.activeShadow,
                },
                activeLayerStyle,
              ]}
            />
            {/* Anillo de aviso. `accentClay` es la tinta de bordes/anillos del
                sistema (le alcanza 3:1) y ya viene resuelta por tema.
                Android < API 29 descarta el inset EN SILENCIO: ahí el anillo
                se dibuja como borde real, que es lo mismo geométricamente. */}
            <Animated.View
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFill,
                { borderRadius: neo.add.freqChip.radius },
                SUPPORTS_INSET_SHADOW
                  ? { boxShadow: `inset 0 0 0 1.5px ${neo.add.accentClay}` }
                  : { borderWidth: 1.5, borderColor: neo.add.accentClay },
                warnRingStyle,
              ]}
            />
          </>
        ) : null}
        {CATEGORY_ICONS[icon] && neo ? (
          // La ranura mide SIEMPRE lo mismo y el sticker se centra encima sin
          // arrastrarla. Si el `Image` corregido midiera el layout, cada chip
          // tomaría la altura de SU ícono y la fila quedaría con chips de
          // alturas distintas — que es exactamente lo que pasó al meter la
          // corrección por ícono.
          <View style={styles.freqChipIconSlot}>
            <Image
              source={CATEGORY_ICONS[icon]}
              style={{ width: neoIconSize, height: neoIconSize }}
              resizeMode="contain"
            />
          </View>
        ) : CATEGORY_ICONS[icon] ? (
          <Image
            source={CATEGORY_ICONS[icon]}
            style={styles.freqTileImage}
            resizeMode="contain"
          />
        ) : (
          <Text allowFontScaling={false} style={styles.freqTileIcon}>
            {icon}
          </Text>
        )}
        <AnimatedText
          style={[
            styles.freqTileLabel,
            // Sólo en classic: en neo lo pisa `labelInkStyle` (que cruza de la
            // tinta sub a la activa) y dejaba un token V1 en el árbol neo.
            neo ? null : { color: theme.colors.text },
            neo
              ? {
                  fontSize: neo.add.freqChip.fontSize,
                  fontWeight: '800' as const,
                  fontFamily: neo.font('800'),
                  width: 'auto' as const,
                }
              : null,
            // Inactivo va en tinta SUB, no en la del título: en oscuro los 6
            // chips apagados gritaban en crema `#F1EEDD` y mataban la
            // jerarquía contra el activo.
            neo ? labelInkStyle : null,
          ]}
          numberOfLines={1}
          allowFontScaling={false}
        >
          {label}
        </AnimatedText>
      </Animated.View>
    </AnimatedPressable>
  )
}

const styles = StyleSheet.create({
  freqTile: {
    width: 72,
    height: 72,
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  freqTileIcon: {
    fontSize: 22,
    lineHeight: 26,
    textAlign: 'center',
    includeFontPadding: false,
  },
  freqTileImage: { width: 32, height: 32 },
  // Chip horizontal del handoff: alto natural, ícono + label en fila.
  //
  // El handoff dibuja los chips SIN ícono; conservarlos fue decisión del owner.
  // A 18px el sticker era una mancha al lado de un label de 12.5 — a 26 se lee
  // y el chip crece ~6px, que es lo que costaba la decisión.
  freqChipNeo: { width: 'auto', height: 'auto', flexDirection: 'row', gap: 8 },
  // Ranura de tamaño FIJO. El sticker corregido se centra encima y puede
  // sobresalir sin clip (`overflow` por defecto es visible): lo que no puede
  // es medir el layout, o la fila queda con chips de alturas distintas.
  freqChipIconSlot: {
    width: FREQ_ICON_BASE,
    height: FREQ_ICON_BASE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  freqTileLabel: {
    fontSize: 10,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    letterSpacing: -0.1,
    textAlign: 'center',
    width: '100%',
  },
})
