import { Platform, StyleSheet, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { BlurView } from 'expo-blur'
import { useAppTheme } from '@/theme/theme-provider'
import { withAlpha } from '@/theme/color-utils'
import { brand, radii } from '@/theme/palette'

/**
 * Tab bar background con Liquid Glass nativo en iOS (UIVisualEffectView
 * vía expo-blur + `systemChromeMaterial` tint) + fallback LinearGradient
 * en Android (BlurView en Android requiere experimentalBlurMethod que
 * agrega GPU cost no justificado).
 *
 * iOS Liquid Glass · `tint='systemChromeMaterialLight|Dark'` mapea al
 * mismo material que usa Apple en sus tab bars nativas (Photos, Maps,
 * Music). Auto-vibrant: cambia tonalidad con el wallpaper / content
 * detrás. Saturado al ~95% para mantener legibilidad cuando hay
 * imágenes coloridas debajo (típico en feed de gastos).
 *
 * El hairline accent + inset se preservan sobre el material para
 * mantener la signature Manifiesto.
 */
export function TabBarBackground() {
  const { theme } = useAppTheme()
  const useGlass = Platform.OS === 'ios'

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.tabBarBackground]}>
      {useGlass ? (
        // iOS · Liquid Glass nativa. `systemChromeMaterialLight|Dark`
        // es el preset Apple para chrome (tab bars, nav bars). Intensity
        // 80 es el sweet-spot · 100 satura demasiado, <60 deja leak del
        // content detrás. expo-blur usa UIVisualEffectView por debajo
        // → 0 cost JS thread, todo native rendering.
        <BlurView
          intensity={80}
          tint={theme.isDark ? 'systemChromeMaterialDark' : 'systemChromeMaterialLight'}
          style={StyleSheet.absoluteFill}
        />
      ) : (
        // Android · LinearGradient fallback. Glass blur requeriría
        // `experimentalBlurMethod='dimezisBlurView'` que agrega GPU
        // overhead notable en mid-range devices · trade-off no justifica.
        <LinearGradient
          colors={
            theme.isDark
              ? ['rgba(19, 30, 23, 0.98)', 'rgba(13, 22, 16, 0.97)', 'rgba(9, 15, 11, 0.99)']
              : ['rgba(253, 252, 249, 0.98)', 'rgba(247, 244, 237, 0.97)', 'rgba(250, 248, 243, 0.99)']
          }
          end={{ x: 1, y: 1 }}
          start={{ x: 0, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      )}

      {/* Subtle tonal overlay sobre el glass material para reforzar el
          DNA verde Manifiesto sin opacar el material · solo en iOS, en
          Android la base ya es tonalizada. */}
      {useGlass ? (
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: theme.isDark
                ? 'rgba(19, 30, 23, 0.18)'
                : 'rgba(247, 244, 237, 0.22)',
            },
          ]}
        />
      ) : null}

      {/* Hairline brand accent on the top edge — Manifiesto signature line */}
      <LinearGradient
        colors={[
          'transparent',
          withAlpha(brand.bright, theme.isDark ? 0.45 : 0.32),
          'transparent',
        ]}
        end={{ x: 1, y: 0 }}
        start={{ x: 0, y: 0 }}
        style={styles.brandAccentLine}
      />

      {/* Subtle inner edge */}
      <View
        style={[
          styles.tabBarInset,
          {
            borderColor: theme.isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(255, 255, 255, 0.8)',
          },
        ]}
      />
    </View>
  )
}

// `radii['2xl']` es 28 pero el floating tab bar style en
// `elevation.ts` setea borderRadius 32 — mismatch entre el shell de
// la tab bar y este background → halo visible en los corners cuando
// el blur material está activo. Hardcodeamos 32 acá para que el
// glass clip exactamente con la tab bar shell. Si el shell cambia,
// actualizar ambos en sync.
const TAB_BAR_RADIUS = 32

const styles = StyleSheet.create({
  tabBarBackground: {
    borderRadius: TAB_BAR_RADIUS,
    overflow: 'hidden',
  },
  brandAccentLine: {
    position: 'absolute',
    top: 0,
    left: 32,
    right: 32,
    height: 1.5,
    borderRadius: radii.pill,
  },
  tabBarInset: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: TAB_BAR_RADIUS,
    borderWidth: 1,
  },
})
