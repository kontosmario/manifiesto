// Day-of-month picker del step 2 del wizard add-fijo. Render 1-31 sin
// weekday alignment (el day recurre todos los meses, atar el layout a
// un mes específico sería misleading). El selected cell muestra el
// emoji de la categoría centrado con el day number badged en la
// esquina. La card pulsea con el `primary` cuando no hay día elegido
// (visual cue replace "elegiste el día" copy).
//
// Extraído de `add-fijo-v2-screen.tsx` para mantener el screen como
// orquestador.
import { useCallback, useEffect, useState } from 'react'
import { type LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { LinearGradient } from 'expo-linear-gradient'
import Animated, {
  Easing,
  cancelAnimation,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { motionSprings } from '@/lib/motion'
import { CategoryIcon } from '@/components/category/category-icon'
import { hexAlpha } from '@/features/fixed-expenses/add-fijo-helpers'
import { useFijosSkin, type FijosNeoSkin } from '@/components/fijos/fijos-skin'
import { resolveFijosCategoryTone } from '@/components/fijos/fijos-category-palette'
import { useAppTheme } from '@/theme/theme-provider'
import { nunitoFamily } from '@/theme/typography'

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

export interface CalendarDropImpactProps {
  day: number | null
  onChangeDay: (next: number) => void
  category: { id: string; name: string; color: string }
  /**
   * El usuario intentó confirmar sin elegir día. En `classic` la card ya
   * pulsaba sola mientras faltaba el día; en `neo` la card no tiene borde que
   * pulsear, así que el gate del paso 2 no pintaba NADA — se tocaba el CTA,
   * sonaba el háptico de error y la pantalla quedaba igual. Este flag es el
   * cue que faltaba.
   */
  warning?: boolean
}

export function CalendarDropImpact({
  day,
  onChangeDay,
  category,
  warning = false,
}: CalendarDropImpactProps) {
  const { theme } = useAppTheme()
  const skin = useFijosSkin()
  const neo = skin.kind === 'neo' ? skin : null
  const { t } = useTranslation()
  const reduceMotion = useReducedMotion()
  // category.name es el nombre CRUDO de la categoría. CategoryIcon rendea
  // el sticker si hay slug mapeado, sino cae al emoji.
  const color = category.color
  // Tono de la categoría — el mismo de los headers colapsables y del rail del
  // paso 1. Sólo lo consume la rama neo.
  const tone = resolveFijosCategoryTone(category.name, theme.isDark)
  const TOTAL_DAYS = 31

  // Pulsea el border de la card + el prompt text mientras no haya día
  // elegido. Para cuando el user elige uno. Visual cue replace "se te
  // olvidó elegir un día" copy / error state.
  const pulse = useSharedValue(0)
  useEffect(() => {
    if (day != null || reduceMotion) {
      pulse.value = 0
      return
    }
    // ease-in-out sin curve da un soft breathing rhythm — linear
    // timing se sentía mecánico y el color saltaba en cada boundary.
    pulse.value = withRepeat(
      withSequence(
        // @motion-allow: 950ms breathing pulse half-cycle with sin in/out for organic day-picker rhythm
        withTiming(1, { duration: 950, easing: Easing.inOut(Easing.sin) }),
        // @motion-allow: 950ms breathing pulse half-cycle with sin in/out for organic day-picker rhythm
        withTiming(0, { duration: 950, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    )
    return () => {
      // El modal se puede cerrar mid-pulse; cancela el worklet driver
      // así no sigue corriendo en el UI runtime post-unmount.
      cancelAnimation(pulse)
    }
  }, [day, reduceMotion, pulse])

  // Mantenemos borderWidth fijo (set en styles.calendarCard) y SÓLO
  // animamos el color. Animar borderWidth cambiaría el inner content
  // rect 2px en cada pulse, refireando onLayout en el grid y resizando
  // visiblemente las day cells al ritmo del pulse — el calendario
  // parecería "respirar".
  const cardPulseStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(
      pulse.value,
      [0, 1],
      [theme.colors.line, theme.colors.primary],
    ),
  }))

  return (
    <Animated.View
      style={[
        styles.calendarCard,
        { backgroundColor: theme.colors.creamCard },
        // El handoff dibuja la card SIN borde: es una superficie elevada del
        // kit, no un contenedor delineado. Sin borde no hay qué pulsear, y el
        // aviso de "elegí un día" queda en el texto del pie, que sí sobrevive.
        neo
          ? {
              borderRadius: 20,
              padding: 10,
              borderWidth: 0,
              backgroundColor: neo.add.step2Card.background,
              experimental_backgroundImage: neo.add.step2Card.gradientCss,
              // Con el aviso encendido la card gana el anillo de terracota del
              // sistema — el mismo acento que usan los fijos vencidos. No es
              // rojo de error: falta un dato, no hay nada roto.
              boxShadow: warning
                ? `${neo.add.step2Card.shadow}, inset 0 0 0 2px ${neo.add.accentClay}`
                : neo.add.step2Card.shadow,
            }
          : cardPulseStyle,
      ]}
    >
      <View style={[styles.calendarGrid, neo ? styles.calendarGridNeo : null]}>
        {Array.from({ length: TOTAL_DAYS }).map((_, idx) => {
          const n = idx + 1
          const isTarget = n === day

          return (
            <View
              key={`d-${n}`}
              style={[styles.calendarCellWrap, neo ? styles.calendarCellWrapNeo : null]}
            >
              {isTarget && neo ? (
                <SelectedDayCellNeo
                  day={n}
                  neo={neo}
                  tone={tone}
                  isDark={theme.isDark}
                  categoryName={category.name}
                  onPress={() => onChangeDay(n)}
                  label={t('fijos:wizard.calendar.daySelectedA11y', { day: n })}
                />
              ) : isTarget ? (
                <Pressable
                  onPress={() => onChangeDay(n)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: true }}
                  accessibilityLabel={t('fijos:wizard.calendar.daySelectedA11y', { day: n })}
                  style={styles.calendarCell}
                >
                  <LinearGradient
                    colors={[color, hexAlpha(color, 0.82)] as unknown as readonly [string, string, ...string[]]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[
                      StyleSheet.absoluteFill,
                      {
                        borderRadius: neo ? 11 : 8,
                        boxShadow: neo
                          ? '0px 5px 11px rgba(46,116,52,0.4)'
                          : `0px 4px 10px -3px ${hexAlpha(color, 0.55)}`,
                      } as unknown as object,
                    ]}
                  />
                  <CategoryIcon
                    name={category.name}
                    scope="fixed_expense"
                    size={24}
                    emojiStyle={styles.calendarCellEmoji}
                  />
                  <View
                    style={[
                      styles.calendarCellDayBadge,
                      { backgroundColor: 'rgba(255,255,255,0.85)' },
                    ]}
                  >
                    <Text style={styles.calendarCellDayBadgeText}>{n}</Text>
                  </View>
                </Pressable>
              ) : (
                <Pressable
                  onPress={() => onChangeDay(n)}
                  accessibilityRole="button"
                  accessibilityLabel={t('fijos:wizard.calendar.dayA11y', { day: n })}
                  style={({ pressed }) => [
                    styles.calendarCell,
                    {
                      backgroundColor: theme.colors.creamSoft,
                      opacity: pressed ? 0.7 : 1,
                    },
                    // Handoff: cada día es un POZO (r11, inset 3/3/7), no una
                    // celda plana. El seleccionado sale del pozo y se eleva.
                    neo
                      ? {
                          backgroundColor: neo.add.well.background,
                          borderRadius: 11,
                          boxShadow: neo.chip.shadow,
                        }
                      : null,
                  ]}
                >
                  <Text
                    allowFontScaling={false}
                    style={[
                      styles.calendarCellNum,
                      { color: theme.colors.text },
                      // Tinta SUB, no la del título: son 30 números idle que
                      // no deben competir con el elegido ni con el monto.
                      neo
                        ? {
                            fontSize: 12.5,
                            fontWeight: '800' as const,
                            fontFamily: neo.font('800'),
                            color: neo.mutedInk,
                          }
                        : null,
                    ]}
                  >
                    {n}
                  </Text>
                </Pressable>
              )}
            </View>
          )
        })}
      </View>

      {/* Con día elegido, en neo el pie NO se dibuja: ese dato ya subió al
          eyebrow ("SE AGENDARÁ EN · DÍA 16"). El prompt sin día sí queda —
          es un estado real de la app que el mock no cubre. */}
      {day != null ? (
        neo ? null : (
          <Text style={[styles.calendarFoot, { color: theme.colors.textMuted }]}>
            {t('fijos:wizard.calendar.footSelected', { day })}
          </Text>
        )
      ) : (
        <Text
          style={[
            styles.calendarFoot,
            styles.calendarFootPrompt,
            { color: theme.colors.primary },
            neo
              ? {
                  color: warning ? neo.add.accentClay : neo.mutedInk,
                  fontFamily: neo.font(warning ? '900' : '800'),
                  fontWeight: warning ? '900' : '800',
                }
              : null,
          ]}
        >
          {t('fijos:wizard.calendar.footPrompt')}
        </Text>
      )}
    </Animated.View>
  )
}

/**
 * Celda del día ELEGIDO en la piel neo. Es su propio componente porque
 * necesita hooks y las celdas se rendean dentro de un `.map()`.
 *
 * Al elegir un día la celda ATERRIZA: entra con un spring desde 0.7 y el
 * sticker de fondo llega con un fade corrido. Sin eso el cambio de día era un
 * corte seco de un cuadrado a otro, y con 31 celdas iguales cuesta ver cuál se
 * movió. El spring es el mismo `motionSprings.press` del resto del kit.
 */
function SelectedDayCellNeo({
  day,
  neo,
  tone,
  isDark,
  categoryName,
  onPress,
  label,
}: {
  day: number
  neo: FijosNeoSkin
  tone: { surface: string; ink: string }
  isDark: boolean
  categoryName: string
  onPress: () => void
  label: string
}) {
  const reduceMotion = useReducedMotion()
  const enter = useSharedValue(reduceMotion ? 1 : 0)
  // El sticker se mide CONTRA LA CELDA, no con un número fijo. La celda es
  // `1/7` del ancho de la card, así que en un teléfono angosto mide bastante
  // menos que en el preview: con 34px fijos y `overflow:'hidden'` el watermark
  // salía recortado en device. 0.78 deja aire para que el redondeo de 11px no
  // le coma las esquinas.
  const [cellSize, setCellSize] = useState(0)
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    setCellSize(Math.round(Math.min(e.nativeEvent.layout.width, e.nativeEvent.layout.height)))
  }, [])
  const stickerSize = cellSize > 0 ? Math.round(cellSize * 0.78) : 0

  useEffect(() => {
    if (reduceMotion) {
      enter.value = 1
      return
    }
    enter.value = 0
    enter.value = withSpring(1, motionSprings.press)
  }, [day, reduceMotion, enter])

  const cellStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 0.7 + enter.value * 0.3 }],
  }))
  const stickerStyle = useAnimatedStyle(() => ({ opacity: enter.value * 0.26 }))

  return (
    <AnimatedPressable
      onPress={onPress}
      onLayout={onLayout}
      accessibilityRole="button"
      accessibilityState={{ selected: true }}
      accessibilityLabel={label}
      style={[
        styles.calendarCell,
        styles.calendarCellNeoSelected,
        {
          backgroundColor: tone.surface,
          // El relieve sale del ink del propio tono, no de un verde fijo: el
          // día elegido tiene que leerse como "esta categoría", no como
          // "confirmado". En CLARO el ink es oscuro y funciona de sombra
          // proyectada; en OSCURO es claro, así que sin offset queda un halo —
          // el mismo recurso que usa el CTA del kit en dark.
          boxShadow: isDark
            ? `0px 0px 14px ${hexAlpha(tone.ink, 0.32)}`
            : `0px 5px 11px ${hexAlpha(tone.ink, 0.4)}`,
        },
        cellStyle,
      ]}
    >
      {/* El sticker va DETRÁS del número, a tamaño casi de celda y apagado:
          identifica la categoría sin pelear con el dato. `onLightSurface`
          siempre — la placa clara le pondría un recuadro al watermark. */}
      {stickerSize > 0 ? (
        <Animated.View pointerEvents="none" style={[styles.calendarCellSticker, stickerStyle]}>
          <CategoryIcon
            name={categoryName}
            scope="fixed_expense"
            size={stickerSize}
            onLightSurface
            emojiStyle={[styles.calendarCellEmoji, { fontSize: Math.round(stickerSize * 0.8) }]}
          />
        </Animated.View>
      ) : null}
      <Text
        allowFontScaling={false}
        style={{
          fontSize: 14,
          fontWeight: '900',
          fontFamily: neo.font('900'),
          color: tone.ink,
        }}
      >
        {day}
      </Text>
    </AnimatedPressable>
  )
}

const styles = StyleSheet.create({
  calendarCard: {
    padding: 14,
    borderRadius: 16,
    // Fixed width así la pulse animation sólo cambia color, no size.
    // Animar borderWidth haría re-measure del inner grid y bouncear las
    // day cells.
    borderWidth: 2,
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    // Contra el cell-wrap padding así los outer edges del grid quedan
    // flush con el inner padding de la card.
    marginHorizontal: -3,
    marginVertical: -3,
  },
  // El wrap toma exactly 1/7 del grid width (no measurement needed).
  // Padding interno actúa como el gap entre cells, manteniendo el
  // layout pixel-perfect cross device-widths y immune al re-measurement
  // durante border animations.
  calendarCellWrap: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    padding: 3,
  },
  // El handoff usa gap 5, que en este layout es padding 2.5 por celda.
  calendarGridNeo: { marginHorizontal: -2.5, marginVertical: -2.5 },
  calendarCellWrapNeo: { padding: 2.5 },
  calendarCell: {
    flex: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  calendarCellNeoSelected: {
    borderRadius: 11,
  },
  // Watermark: llena la celda y se recorta con su radio (`overflow:'hidden'`
  // ya viene de `calendarCell`). Va apagado para que el número mande.
  calendarCellSticker: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    // 0.26 y no más: el número se apoya JUSTO encima del centro del sticker,
    // que es su parte más densa. El par tinta/superficie del tono está
    // verificado a ≥4.5:1, y el watermark no puede comerse ese margen.
    opacity: 0.26,
  },
  calendarCellNum: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: nunitoFamily('600'),
  },
  calendarCellEmoji: {
    textAlign: 'center',
    includeFontPadding: false,
    fontSize: 18,
    lineHeight: 22,
  },
  calendarCellDayBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarCellDayBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    color: '#0A1410',
  },
  calendarFoot: {
    marginTop: 12,
    fontSize: 11,
    fontWeight: '600',
    fontFamily: nunitoFamily('600'),
    textAlign: 'center',
  },
  calendarFootPrompt: {
    fontSize: 12,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: 0.2,
  },
})
