import { StyleSheet } from 'react-native'
import { SCREEN_WIDTH } from '../wrapped-constants'

// Styles compartidos entre top-category-scene y top-expense-scene.
// Ambas son "detail scenes" con la misma grammar visual (eyebrow +
// title display + amount + meta), solo cambia el tinte de fondo.
export const detailStyles = StyleSheet.create({
  stage: {
    flex: 1,
    justifyContent: 'center',
    gap: 12,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2.4,
  },
  titleDisplay: {
    fontSize: Math.min(44, SCREEN_WIDTH * 0.115),
    fontWeight: '900',
    letterSpacing: -1.4,
    lineHeight: Math.min(48, SCREEN_WIDTH * 0.125),
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 12,
    marginTop: 8,
    flexWrap: 'wrap',
  },
  amount: {
    fontSize: Math.min(36, SCREEN_WIDTH * 0.095),
    fontWeight: '900',
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
  },
  share: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0,
  },
  barTrack: {
    marginTop: 16,
    height: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(15,46,31,0.10)',
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 999,
  },
  dateMark: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.4,
    marginTop: 4,
  },
})
