import { StyleSheet } from 'react-native'
import { nunitoFamily } from '@/theme/typography'
import { SCREEN_WIDTH } from '../wrapped-constants'

export const closingStyles = StyleSheet.create({
  stage: {
    flex: 1,
    justifyContent: 'center',
    gap: 18,
  },
  // Bloque de encabezado + Brot. La mascota va en la fila del título, no
  // flotando sobre el contenido: la escena crece hacia abajo cuando trae
  // la decisión del sobrante y ahí no queda aire para un absoluto.
  headRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  headCol: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    letterSpacing: 2.4,
  },
  title: {
    fontSize: Math.min(40, SCREEN_WIDTH * 0.105),
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    letterSpacing: -1.2,
    lineHeight: Math.min(46, SCREEN_WIDTH * 0.12),
    fontVariant: ['tabular-nums'],
  },
  // Variant compacta cuando la closing scene tiene además la sección
  // de decisión de sobrante debajo — entra todo sin clip en pantallas
  // chicas (SE).
  titleCompact: {
    fontSize: 34,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    letterSpacing: -1,
    lineHeight: 38,
    textAlign: 'left',
    marginBottom: 12,
    fontVariant: ['tabular-nums'],
  },
  sectionDivider: {
    height: 1.5,
    marginVertical: 18,
    marginHorizontal: -4,
  },
  leftoverEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: 1.4,
    marginBottom: 6,
  },
  leftoverAmount: {
    fontSize: 28,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    letterSpacing: -0.6,
    marginBottom: 4,
    fontVariant: ['tabular-nums'],
  },
  leftoverSubtitle: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    marginBottom: 12,
  },
  optionsStack: {
    width: '100%',
    gap: 10,
    marginTop: 4,
  },
  pastDecisionHint: {
    marginTop: 14,
    fontSize: 12,
    fontWeight: '600',
    fontFamily: nunitoFamily('600'),
    textAlign: 'center',
  },
  achievementsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 13,
    borderRadius: 22,
    alignSelf: 'flex-start',
  },
  achievementsText: {
    fontSize: 11,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginTop: 18,
    gap: 16,
  },
  summaryDivider: {
    width: 1.5,
  },
})

export const summaryStyles = StyleSheet.create({
  cell: {
    flex: 1,
    gap: 4,
  },
  label: {
    fontSize: 10,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: 1.4,
  },
  value: {
    fontSize: 18,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    letterSpacing: -0.4,
    fontVariant: ['tabular-nums'],
  },
})
