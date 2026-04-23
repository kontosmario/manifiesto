import { Image, StyleSheet, Text, View } from 'react-native'
import { LoginHeroModel } from './login-hero-model'
import { authPalette, authTitleFontFamily } from '@/theme/auth-theme'
import { radii } from '@/theme/palette'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const walletFallback = require('../../../assets/brand/wallet-cartoon-fallback.png') as number

export function LoginHero({
  compact = false,
  dense = false,
  reducedMotion = false,
}: {
  compact?: boolean
  dense?: boolean
  reducedMotion?: boolean
}) {
  const visualSize = compact ? (dense ? 172 : 186) : dense ? 188 : 214
  const visualHeight = compact ? (dense ? 126 : 138) : dense ? 142 : 164
  const eyebrowTop = compact ? (dense ? 0 : 4) : dense ? 2 : 6
  const visualOffsetX = compact ? -4 : -5
  const visualOffsetY = reducedMotion ? 4 : 7
  const titleMarginTop = dense ? -4 : 0

  return (
    <View style={styles.root}>
      <View style={[styles.visualRegion, { height: visualHeight }]}>
        <View style={[styles.eyebrowChip, styles.eyebrowOverlay, { top: eyebrowTop }]}>
          <Text style={styles.eyebrow}>FINANZAS PARA TODOS</Text>
        </View>
        <View
          style={[
            styles.visualFrame,
            {
              pointerEvents: 'none',
              width: visualSize,
              height: visualSize,
              transform: [{ translateX: visualOffsetX }, { translateY: visualOffsetY }],
            },
          ]}
        >
          <WalletPoster reducedMotion={reducedMotion} size={visualSize} />
        </View>
      </View>

      <View style={[styles.copyBlock, { marginTop: titleMarginTop }]}>
        <Text
          style={[
            styles.title,
            {
              fontFamily: authTitleFontFamily,
              fontSize: compact ? (dense ? 28 : 32) : dense ? 31 : 35,
              lineHeight: compact ? (dense ? 33 : 38) : dense ? 36 : 42,
            },
          ]}
        >
          Manifiesto
        </Text>
        <Text
          style={[
            styles.subtitle,
            {
              fontSize: compact ? (dense ? 13 : 14) : dense ? 14 : 15,
              lineHeight: compact ? (dense ? 18 : 20) : dense ? 19 : 21,
              maxWidth: compact ? (dense ? 252 : 246) : dense ? 270 : 250,
            },
          ]}
        >
          Seas experto o no, empezá claro.
        </Text>
      </View>
    </View>
  )
}

function WalletPoster({
  reducedMotion,
  size,
}: {
  reducedMotion: boolean
  size: number
}) {
  const posterHeight = size * 0.88
  const objectScale = (size >= 170 ? 0.98 : 0.94) * 2.35

  return (
    <View style={[styles.posterRoot, { width: size, height: size }]}>
      <View
        style={[
          styles.posterStage,
          {
            width: size,
            height: posterHeight,
          },
        ]}
      >
        <LoginHeroModel
          fallback={
            <Image
              defaultSource={walletFallback}
              source={walletFallback}
              resizeMode="contain"
              style={{
                width: size,
                height: posterHeight,
              }}
            />
          }
          objectScale={objectScale}
          reducedMotion={reducedMotion}
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    alignItems: 'center',
    gap: 4,
  },
  visualRegion: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  visualFrame: {
    alignItems: 'stretch',
    justifyContent: 'center',
    overflow: 'visible',
  },
  copyBlock: {
    width: '100%',
    alignItems: 'center',
    gap: 2,
  },
  posterRoot: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  posterStage: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrowChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
    backgroundColor: authPalette.hero.eyebrowBackground,
    borderWidth: 1,
    borderColor: authPalette.hero.eyebrowBorder,
  },
  eyebrow: {
    fontSize: 9,
    letterSpacing: 1.7,
    fontWeight: '900',
    color: authPalette.hero.eyebrowText,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  eyebrowOverlay: {
    position: 'absolute',
    zIndex: 1,
  },
  title: {
    color: authPalette.hero.title,
    fontWeight: '700',
    letterSpacing: -0.8,
    textAlign: 'center',
  },
  subtitle: {
    color: authPalette.hero.subtitle,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: -2,
  },
})
