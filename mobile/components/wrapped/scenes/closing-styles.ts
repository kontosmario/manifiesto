import { StyleSheet } from 'react-native'
import { SCREEN_WIDTH } from '../wrapped-constants'

export const closingStyles = StyleSheet.create({
  stage: {
    flex: 1,
    justifyContent: 'center',
    gap: 18,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2.4,
  },
  title: {
    fontSize: Math.min(40, SCREEN_WIDTH * 0.105),
    fontWeight: '900',
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
    letterSpacing: -1,
    lineHeight: 38,
    textAlign: 'left',
    marginBottom: 12,
    fontVariant: ['tabular-nums'],
  },
  sectionDivider: {
    height: 1,
    // Spec H — más sutil (0.18 → 0.10) para feel premium.
    backgroundColor: 'rgba(244,253,242,0.10)',
    marginVertical: 18,
    marginHorizontal: -4,
  },
  leftoverEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
    marginBottom: 6,
  },
  leftoverAmount: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.6,
    marginBottom: 4,
    fontVariant: ['tabular-nums'],
  },
  leftoverSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 12,
  },
  optionsStack: {
    width: '100%',
    gap: 8,
    marginTop: 4,
  },
  pastDecisionHint: {
    marginTop: 14,
    fontSize: 12,
    fontWeight: '500',
    // Spec H — más caption-y (0.62 → 0.55).
    color: 'rgba(244,253,242,0.55)',
    textAlign: 'center',
  },
  achievementsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  achievementsText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginTop: 18,
    gap: 16,
  },
  summaryDivider: {
    width: StyleSheet.hairlineWidth,
    // Bump del divider para que se vea en pantallas tipo OLED donde
    // la hairline a 0.32 se traga.
    backgroundColor: 'rgba(244,253,242,0.5)',
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
    letterSpacing: 1.4,
  },
  value: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.4,
    fontVariant: ['tabular-nums'],
  },
})
