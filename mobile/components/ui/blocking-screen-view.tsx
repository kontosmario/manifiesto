import { StyleSheet, View } from 'react-native'
import { FernLogo } from '@/components/auth/fern-logo'
import { BrotParticles } from '@/components/brot'
import { AUTH_SPEC } from '@/components/redesign/auth/auth-spec'
import { useThemeMode } from '@/theme/theme-provider'

interface BlockingScreenViewProps {
  /**
   * Legacy prop — preserved for back-compat with existing call sites.
   * Ignored: the splash overlay at root paints the brand surface, and
   * rendering a loading label underneath would just compete with it.
   */
  message?: string
}

/**
 * Backdrop renderizado por AppEntryGate / RequireAuth / app-stack-shell
 * durante sus isLoading windows.
 *
 * Invariante 4 del rediseño (superficies idénticas en cada seam): esta
 * superficie es EL MISMO trío que `boot-screen.tsx` — welcomeBg del
 * AUTH_SPEC por tema + campo de 16 partículas + FernLogo 160 con la
 * paleta del spec. Es lo que se revela cuando el splash neo se
 * desvanece, así que cualquier divergencia (color, tamaño del brote)
 * se percibe como un flash. Si boot-screen cambia, esto cambia con él.
 *
 * Partículas en estático y logo sin entrance: mientras el splash vive
 * encima, esta capa está montada debajo — un segundo loop de partículas
 * y un fade-in del brote competirían con los del overlay durante el
 * mismo window.
 */
export function BlockingScreenView(_props: BlockingScreenViewProps) {
  const mode = useThemeMode().resolvedMode
  const s = AUTH_SPEC[mode]

  return (
    <View style={[styles.root, { backgroundColor: s.welcomeBg }]}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <BrotParticles colors={s.particleColors} count={16} animated={false} />
      </View>
      <View style={styles.center}>
        <FernLogo size={160} palette={s.fernPalette} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
