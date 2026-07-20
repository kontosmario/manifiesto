import type { PropsWithChildren } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { usePressScale } from '@/hooks/use-press-scale'
import { nunitoFamily } from '@/theme/typography'
import type { OnbMode } from '../onb-spec'
import { ONB_5D_SPEC } from './onb-5d-spec'

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

/**
 * 5d · selector de día — calendario de 31 días (mensual / quincenal /
 * custom), fila de días de la semana (semanal) y caption con acentos.
 */

/** Índices de los 7 días (0=L … 6=D); la inicial la resuelve i18n. */
const SEMANA_INDICES = [0, 1, 2, 3, 4, 5, 6] as const

// ─── Card contenedora (radius 24, padding 13) ────────────────────────

export function Onb5dDiaCard({ mode, children }: PropsWithChildren<{ mode: OnbMode }>) {
  const d = ONB_5D_SPEC[mode]
  return (
    <View
      style={[
        styles.diaCard,
        {
          experimental_backgroundImage: d.cardGradientCss,
          backgroundColor: d.cardFallback,
          boxShadow: d.cardShadowSoft,
        },
      ]}
    >
      {children}
    </View>
  )
}

// ─── Calendario de 31 días (7 columnas, gap 7) ───────────────────────

const DIA_ROWS: number[][] = [
  [1, 2, 3, 4, 5, 6, 7],
  [8, 9, 10, 11, 12, 13, 14],
  [15, 16, 17, 18, 19, 20, 21],
  [22, 23, 24, 25, 26, 27, 28],
  [29, 30, 31],
]

export function Onb5dDiaGrid({
  mode,
  selected,
  onSelect,
}: {
  mode: OnbMode
  selected: number | null
  onSelect: (dia: number) => void
}) {
  return (
    <View style={styles.diaGrid}>
      {DIA_ROWS.map((row, r) => (
        <View key={r} style={styles.diaRow}>
          {row.map((dia) => (
            <DiaCell
              key={dia}
              mode={mode}
              dia={dia}
              selected={dia === selected}
              onPress={() => onSelect(dia)}
            />
          ))}
          {/* Spacers para que la última fila (29–31) conserve el ancho de 7 columnas. */}
          {row.length < 7
            ? Array.from({ length: 7 - row.length }, (_, i) => (
                <View key={`spacer-${i}`} style={styles.diaSpacer} />
              ))
            : null}
        </View>
      ))}
    </View>
  )
}

// Celda individual (componente propio: hook de press scale por celda).
function DiaCell({
  mode,
  dia,
  selected,
  onPress,
}: {
  mode: OnbMode
  dia: number
  selected: boolean
  onPress: () => void
}) {
  const d = ONB_5D_SPEC[mode]
  const pressScale = usePressScale({ pressedScale: 0.94 })
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      onPressIn={pressScale.onPressIn}
      onPressOut={pressScale.onPressOut}
      style={[
        styles.diaCell,
        selected
          ? {
              experimental_backgroundImage: d.accentRadialCss,
              backgroundColor: d.accentRadialFallback,
              boxShadow: d.daySelectedShadow,
            }
          : { backgroundColor: d.dayIdleBg, boxShadow: d.dayIdleShadow },
        pressScale.animatedStyle,
      ]}
    >
      <Text
        style={[
          selected ? styles.diaCellTextSelected : styles.diaCellText,
          { color: selected ? d.daySelectedText : d.dayIdleText },
        ]}
      >
        {dia}
      </Text>
    </AnimatedPressable>
  )
}

// ─── Fila de días de la semana (ciclo semanal) ───────────────────────

export function Onb5dSemanaRow({
  mode,
  selected,
  onSelect,
}: {
  mode: OnbMode
  /** 0=L … 6=D. */
  selected: number | null
  onSelect: (dia: number) => void
}) {
  const { t } = useTranslation()
  return (
    <View style={styles.semanaRow}>
      {SEMANA_INDICES.map((i) => (
        <SemanaPill
          key={i}
          mode={mode}
          letra={t(`onboarding:redesign.ingresos.weekdayInitial.${i}`)}
          selected={i === selected}
          onPress={() => onSelect(i)}
        />
      ))}
    </View>
  )
}

// Pill individual (componente propio: hook de press scale por pill).
function SemanaPill({
  mode,
  letra,
  selected,
  onPress,
}: {
  mode: OnbMode
  letra: string
  selected: boolean
  onPress: () => void
}) {
  const d = ONB_5D_SPEC[mode]
  const pressScale = usePressScale({ pressedScale: 0.94 })
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      onPressIn={pressScale.onPressIn}
      onPressOut={pressScale.onPressOut}
      style={[
        styles.semanaPill,
        selected
          ? {
              experimental_backgroundImage: d.accentRadialCss,
              backgroundColor: d.accentRadialFallback,
              boxShadow: d.daySelectedShadow,
            }
          : { backgroundColor: d.dayIdleBg, boxShadow: d.weekIdleShadow },
        pressScale.animatedStyle,
      ]}
    >
      <Text
        style={[
          selected ? styles.semanaTextSelected : styles.semanaText,
          { color: selected ? d.daySelectedText : d.dayIdleText },
        ]}
      >
        {letra}
      </Text>
    </AnimatedPressable>
  )
}

// ─── Caption con spans de acento verde ───────────────────────────────

export interface Onb5dCaptionSegment {
  text: string
  accent?: boolean
}

export function Onb5dDiaCaption({
  mode,
  segments,
}: {
  mode: OnbMode
  segments: Onb5dCaptionSegment[]
}) {
  const d = ONB_5D_SPEC[mode]
  return (
    <Text style={[styles.caption, { color: d.caption }]}>
      {segments.map((seg, i) =>
        seg.accent ? (
          <Text key={i} style={{ color: d.captionAccent }}>
            {seg.text}
          </Text>
        ) : (
          <Text key={i}>{seg.text}</Text>
        ),
      )}
    </Text>
  )
}

// ─── Estilos (valores literales de 5d…5d5) ───────────────────────────

const styles = StyleSheet.create({
  diaCard: {
    marginTop: 10,
    borderRadius: 24,
    padding: 13,
  },
  diaGrid: {
    gap: 7,
  },
  diaRow: {
    flexDirection: 'row',
    gap: 7,
  },
  diaCell: {
    flex: 1,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  diaSpacer: {
    flex: 1,
  },
  diaCellText: {
    fontSize: 13.5,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
  },
  diaCellTextSelected: {
    fontSize: 13.5,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
  },
  semanaRow: {
    flexDirection: 'row',
    gap: 8,
  },
  semanaPill: {
    flex: 1,
    height: 46,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  semanaText: {
    fontSize: 15,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
  },
  semanaTextSelected: {
    fontSize: 15,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
  },
  caption: {
    fontSize: 12.5,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    textAlign: 'center',
    marginTop: 11,
  },
})
