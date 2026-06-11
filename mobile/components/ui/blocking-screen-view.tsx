import { StyleSheet, View } from 'react-native'
import { WarmFernLogo } from '@/components/auth/warm-fern-logo'
import { authTokens } from '@/theme/palette'

interface BlockingScreenViewProps {
  /**
   * Legacy prop — preserved for back-compat with existing call sites.
   * Ignored: the splash overlay at root paints the brand surface, and
   * rendering a loading label underneath would just compete with it.
   */
  message?: string
}

/**
 * Backdrop renderizado por AppEntryGate / RequireAuth durante sus
 * isLoading windows.
 *
 * # Por qué WarmFernLogo + welcomeBg (no solo el verde sólido viejo)
 *
 * Hasta 2026-06-11 este componente era solo un `<View>` con
 * `backgroundColor: welcomeBg`. Cuando el `AuthTransitionSplash`
 * overlay (que también es WarmFernLogo + welcomeBg, mounted a root)
 * hacía fade-out, lo que se revelaba detrás era ESTE BlockingScreenView
 * — solo verde sólido sin fern — y eso se veía como una "pantalla verde
 * vacía" durante la transición post-FaceID. El gap visual entre el
 * splash (con fern) y el BlockingScreenView (sin fern) era el bug.
 *
 * Ahora el BlockingScreenView renderea el mismo WarmFernLogo + el mismo
 * welcomeBg que el splash. Resultado: cuando el splash overlay fadea,
 * lo que se revela es VISUALMENTE IDÉNTICO → cero "flash verde". El
 * único transition que el usuario percibe es BlockingScreenView →
 * destination screen (home / etc), que es el cambio significativo.
 *
 * Sin animaciones (fireflies, halo) — los queremos solo en el splash
 * overlay para no tener dos sets de partículas compitiendo cuando
 * ambos están visibles al mismo tiempo (splash on top + BlockingView
 * underneath durante el AppEntryGate isLoading window).
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- props kept for back-compat with existing call sites
export function BlockingScreenView(_props: BlockingScreenViewProps) {
  return (
    <View style={styles.root}>
      <View style={styles.center}>
        <WarmFernLogo size={180} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: authTokens.welcomeBg,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
