// Header de cada day-section del feed de Gastos: hairline divider +
// date eyebrow + meta line (count de gastos + ingresos) + total del
// día. Los income rows renderean DENTRO de `section.data` (encima de
// los expense rows), así este header queda limpio — sólo un anchor
// cronológico entre días.
//
// Extraído del `renderSectionHeader` inline de `gastos-v2-screen.tsx`
// para que la screen no tenga ~50 LOC de JSX inline + cache de estilos
// específicos del header.
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated'
import { StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui/app-text'
import { useAppTheme } from '@/theme/theme-provider'
import { sectionMetaCopy, type MovimientosSection } from '@/features/gastos/gastos-helpers'
import { formatMoney } from '@/utils/money'
import { nunitoFamily } from '@/theme/typography'

export interface GastosSectionHeaderProps {
  section: MovimientosSection
  /** Gate para los entering/layout drivers — ver
   *  `gastos-movement-row.tsx` para la racional del flag. */
  animationEnabled: boolean
}

export function GastosSectionHeader({
  section,
  animationEnabled,
}: GastosSectionHeaderProps) {
  const { theme } = useAppTheme()
  return (
    <Animated.View
      style={styles.sectionHeaderShell}
      entering={animationEnabled ? FadeIn.duration(160) : undefined}
      exiting={FadeOut.duration(120)}
      layout={animationEnabled ? LinearTransition.duration(220) : undefined}
    >
      {/* Hairline rule encima de la fecha — reemplaza el opaque "block"
          background que envolvía al header. Lee como un soft day-
          boundary divider; la fecha en sí queda apoyada naturalmente
          en el canvas en vez de adentro de una heavy band. */}
      <View
        style={[styles.daySeparator, { backgroundColor: theme.colors.line }]}
      />
      <View style={styles.groupHeader}>
        <View style={styles.groupTitleCol}>
          <Text
            style={[styles.groupLabel, { color: theme.colors.textMuted }]}
            numberOfLines={1}
          >
            {section.title.toUpperCase()}
          </Text>
          <Text
            style={[styles.groupMeta, { color: theme.colors.textSoft }]}
            numberOfLines={1}
          >
            {sectionMetaCopy(
              section.data.length - section.incomes.length,
              section.incomes.length,
            )}
          </Text>
        </View>
        {section.total > 0 ? (
          <Text style={[styles.groupTotal, { color: theme.colors.text }]}>
            -{formatMoney(section.total)}
          </Text>
        ) : null}
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  sectionHeaderShell: {
    // Transparent shell — el section header solía tener un opaque dark
    // bg (DARK_TAB_CANVAS en dark, background en light) heredado de
    // cuando los sticky headers estaban activos. Ahora no
    // (`stickySectionHeadersEnabled={false}` en la SectionList) así que
    // el bg creaba una heavy "band" detrás de la fecha que se sentía
    // aggressive. Sin él, la fecha queda como un label en el canvas,
    // no adentro de un card.
    backgroundColor: 'transparent',
  },
  daySeparator: {
    // Hairline divider arriba de cada day group. Reemplaza el opaque bg
    // como el day-boundary cue — minimal chrome, visible pero no loud.
    height: StyleSheet.hairlineWidth,
    marginTop: 16,
    marginBottom: 2,
    marginHorizontal: 2,
    opacity: 0.7,
  },
  groupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 2,
    paddingTop: 6,
    paddingBottom: 8,
    gap: 12,
  },
  groupTitleCol: {
    flex: 1,
    gap: 2,
  },
  // Eyebrow-style date label: uppercase, letter-spaced, en `textMuted`.
  // El treatment previo (14px / weight 700 / `text`) leía como un section
  // TITLE — demasiado pesado para lo que es esencialmente un chronological
  // label entre expense rows.
  groupLabel: {
    fontSize: 11,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    letterSpacing: 1.2,
  },
  groupMeta: {
    fontSize: 10,
    fontWeight: '600',
    fontFamily: nunitoFamily('600'),
    letterSpacing: 0.2,
  },
  // Tabular nums aquí porque el total se renderea en columna right-aligned
  // por encima del groupTotal de la siguiente sección. Sin tabular, los
  // dígitos proporcionales (1 vs 8) hacen que la columna wobblee al
  // scrollear. Mismo principio para GastoRow.amount.
  groupTotal: {
    fontSize: 14,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.2,
  },
})
