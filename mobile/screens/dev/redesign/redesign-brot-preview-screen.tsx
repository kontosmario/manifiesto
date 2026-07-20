import { StyleSheet, Text, View } from 'react-native'
import { Screen } from '@/components/ui/screen'
import { BROT_POSES, BrotMascot, type BrotPose } from '@/components/brot'
import {
  PreviewPhoneSection,
  PreviewSectionLabel,
} from '@/screens/dev/redesign/redesign-preview-shared'

/**
 * Preview dev-only de Brot (port Skia de brot.js) — las 18 poses
 * sobre los fondos de ambos temas, como la ficha 2a del design doc.
 * Gate de aprobación del owner contra screens/2a.html y el
 * <brot-mascot> original (abrir el .dc.html en un browser).
 *
 * Las grillas van con animated={false} (como especifica el design doc
 * para las fichas de poses — y 36 mascotas animadas a la vez matan la
 * perf del preview). La sección "Animación — muestra" de arriba tiene
 * unos pocos especímenes animados para poder aprobar el motion.
 */

/** Poses animadas de muestra (motion aprobable sin 36 loops vivos). */
const ANIMATED_SPECIMENS: readonly BrotPose[] = ['idle', 'wave', 'cheer']

export function RedesignBrotPreviewScreen() {
  return (
    <Screen
      // @i18n-ignore (dev-only: preview gated por __DEV__, copy interno de tooling)
      title="Rediseño · Brot"
      // @i18n-ignore (dev-only)
      subtitle="18 poses del port a Skia (grillas estáticas) + muestra animada. Compará contra screens/2a.html y el brot.js original."
      canGoBack
    >
      <View style={styles.stack}>
        <PreviewSectionLabel
          title="Animación — muestra"
          source="brot.js (idle/wave/cheer animados)"
        />
        <PreviewPhoneSection mode="light" minHeight={0}>
          <View style={styles.specimenRow}>
            {ANIMATED_SPECIMENS.map((pose) => (
              <View key={pose} style={styles.cell}>
                <BrotMascot animated pose={pose} size={84} />
                <Text style={[styles.poseName, { color: '#6C7B67' }]}>{pose}</Text>
              </View>
            ))}
          </View>
        </PreviewPhoneSection>

        {(['light', 'dark'] as const).map((mode) => (
          <View key={mode}>
            <PreviewSectionLabel
              title={mode === 'light' ? 'Sobre tema claro' : 'Sobre tema oscuro'}
              source="screens/2a.html · brot.js"
            />
            <PreviewPhoneSection mode={mode} minHeight={0}>
              <View style={styles.grid}>
                {BROT_POSES.map((pose) => (
                  <View key={pose} style={styles.cell}>
                    <BrotMascot animated={false} pose={pose} size={84} />
                    <Text
                      style={[
                        styles.poseName,
                        { color: mode === 'dark' ? '#93A78F' : '#6C7B67' },
                      ]}
                    >
                      {pose}
                    </Text>
                  </View>
                ))}
              </View>
            </PreviewPhoneSection>
          </View>
        ))}
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  stack: {
    paddingBottom: 40,
  },
  specimenRow: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    paddingVertical: 22,
    paddingHorizontal: 8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-evenly',
    rowGap: 18,
    paddingVertical: 22,
    paddingHorizontal: 8,
  },
  cell: {
    width: '30%',
    alignItems: 'center',
    gap: 6,
  },
  poseName: {
    fontSize: 11.5,
    fontWeight: '800',
  },
})
