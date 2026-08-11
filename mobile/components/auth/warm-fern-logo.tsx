import { StyleSheet, Text, View } from 'react-native'
import { FernLogo } from '@/components/auth/fern-logo'
import { authTokens } from '@/theme/palette'
import { nunitoFamily } from '@/theme/typography'

interface WarmFernLogoProps {
  size?: number
}

// Static, motion-free brand mark for the warm post-login splash.
// Fern + wordmark, optically centred, no halo, no animations.
// The only motion in the warm splash is the outer overlay's
// 220ms opacity fade-in / 320ms fade-out — handled in
// `TransitionOverlay`. See git history for prior iterations and
// why this minimal form is what survives the login UI-thread
// contention test.
//
// v2 fern is horizontally symmetric (stem on the visual axis), so
// the optical X-shift the v1 mark required is no longer necessary.
const OPTICAL_SHIFT_RATIO = 0

export function WarmFernLogo({ size = 180 }: WarmFernLogoProps) {
  const opticalShift = OPTICAL_SHIFT_RATIO * size

  return (
    <View style={styles.root}>
      <View
        style={[
          styles.fernBlock,
          { transform: [{ translateX: opticalShift }] },
        ]}
      >
        <FernLogo size={size} palette="light" animate={false} />
      </View>

      <View style={styles.wordmarkRow}>
        <Text style={styles.wordmark}>Manifiesto</Text>
        <Text style={[styles.wordmark, styles.wordmarkDot]}>.</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  fernBlock: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordmarkRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 24,
  },
  wordmark: {
    fontSize: 46,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: -2,
    color: '#FFFBF2',
  },
  wordmarkDot: {
    color: authTokens.peach,
  },
})
