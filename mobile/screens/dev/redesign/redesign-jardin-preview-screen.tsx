// @i18n-ignore-file — tooling dev-only gated por __DEV__.
import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { CierreFinalScreen, type CierreDemoKey } from '@/components/redesign/jardin/cierre-screen'
import { JardinFinalScreen, type JardinDemoState } from '@/components/redesign/jardin/jardin-screen'
import { LogrosFinalScreen, type LogrosSeedKey } from '@/components/redesign/jardin/logros-screen'
import { neoTokens } from '@/theme/neo-tokens'
import type { ResolvedThemeMode } from '@/theme/palette'
import { nunitoFamily } from '@/theme/typography'

/**
 * Preview dev-only del rediseño "Mi jardín" (design/jardin-2026-08/
 * "Jardín Rediseño.dc.html"): las TRES pantallas del handoff —jardín,
 * cierre de semana y Logros— con un ciclador de seeds que cubre la matriz
 * de estados del Apéndice A del plan
 * (docs/superpowers/plans/2026-08-11-jardin-rediseno-integracion.md).
 *
 * Mismo chrome que `redesign-gastos-preview-screen`: toggle de tema +
 * ciclador 🧪 + ✕, flotante y NO parte del mockup. Las pantallas son
 * AUTO-CONDUCIDAS (registrar un gasto, marcar el día sin gastos, abrir el
 * historial, descartar la nota, avanzar de variante en el cierre), así que
 * el seed sólo siembra el ESTADO INICIAL: desde cualquiera de ellos el
 * owner alcanza el resto tocando.
 *
 * Por qué un seed cambia de pantalla y no sólo de estado: la aprobación
 * del gate es de la SECCIÓN completa (README del handoff = 3 pantallas),
 * y el cierre y Logros son pantallas propias, no estados del jardín. El
 * ciclador las recorre en un solo lugar en vez de pedir tres rutas dev.
 *
 * DESVÍOS respecto de la lista literal del plan (Task 6 · Step 1), ambos
 * para no dejar piezas del gate sin superficie donde mirarse:
 *
 *  · `cierre-sin-ver` (③5) monta el JARDÍN, no el cierre: "el cierre está
 *    disponible y todavía no se abrió" es el punto naranja de la card
 *    "Semana pasada" (`semanaPasadaUnseen`), un estado del jardín. Se
 *    lista igual junto a los seeds del cierre porque es donde el owner lo
 *    busca.
 *  · `cierre-calma` es un seed EXTRA (no está en la lista del plan): es la
 *    quinta variante que el propio kit agregó a `CierreDemoKey` para que
 *    las tres piezas de D4 —día en calma, día recuperado y la línea "N
 *    días en calma"— tengan dónde verse en el gate. Sin él sólo se llega
 *    tocando cuatro veces desde `cierre-perfecta`.
 *
 * El día RECUPERADO por escudo (lleno coral) tampoco tiene seed propio en
 * el plan: viaja dentro de `dia-perdido`, que es donde contrasta —la misma
 * fila muestra el día que se perdió y el que el escudo salvó.
 */

interface JardinSeedBase {
  key: string
  label: string
}

type JardinSeed =
  | (JardinSeedBase & { screen: 'jardin'; state: Partial<JardinDemoState> })
  | (JardinSeedBase & { screen: 'cierre'; cierre: CierreDemoKey })
  | (JardinSeedBase & { screen: 'logros'; logros: LogrosSeedKey })

export const JARDIN_SEEDS: JardinSeed[] = [
  // ─── Hero 2a–2f (HTML:333–444) ───
  // 2a: todavía no hay jardín — sin racha, sin semana pasada que mostrar.
  {
    key: '2a-vacio',
    label: '2a vacío',
    screen: 'jardin',
    state: { heroKind: 'empezar', registros: 0, tone: 'water', semanaPasadaVariant: null },
  },
  // 2b: la racha viva a mitad de camino — aro al 50% (2 de 4 registros).
  {
    key: '2b-parcial',
    label: '2b parcial',
    screen: 'jardin',
    state: { heroKind: 'aTiempo', registros: 2, tone: 'green' },
  },
  // 2c: el día ya está completo — aro 100%, hero con pill y sin CTA.
  {
    key: '2c-completo',
    label: '2c completo',
    screen: 'jardin',
    state: { heroKind: 'plantado', registros: 4, tone: 'green' },
  },
  // 2d: hero "Floreciendo" (halo + 12 partículas) con la fila normal; el
  // estado de la FILA florecida es su propio seed (`semana-florecida`).
  {
    key: '2d-floreciendo',
    label: '2d floreciendo',
    screen: 'jardin',
    state: { heroKind: 'floreciendo', registros: 4, tone: 'green' },
  },
  // 2e: borde ámbar + CTA que pulsa. Sin registros hoy, por definición.
  {
    key: '2e-riesgo',
    label: '2e riesgo',
    screen: 'jardin',
    state: { heroKind: 'enRiesgo', registros: 0, tone: 'green' },
  },
  // 2f: racha cortada — hero desaturado + el lunes perdido en la fila.
  {
    key: '2f-cortada',
    label: '2f cortada',
    screen: 'jardin',
    state: {
      heroKind: 'cortada',
      registros: 0,
      diaPerdido: true,
      tone: 'water',
      semanaPasadaVariant: 'cortada',
    },
  },

  // ─── Fila de aros y sus estados propios (②) ───
  // ②2 "regando": arranca en 1 registro para que el owner toque el CTA y
  // vea el aro SUBIR (25% → 50% → …) sin remontar la pantalla.
  {
    key: 'regando',
    label: 'regando',
    screen: 'jardin',
    state: { heroKind: 'aTiempo', registros: 1, tone: 'green' },
  },
  // ②4 D4: el día en calma en sus DOS superficies a la vez — HOY (anillo
  // doble sobre el pozo de hoy) y un día pasado (martes, sin ese tinte).
  {
    key: 'dia-en-calma',
    label: 'día en calma',
    screen: 'jardin',
    state: {
      heroKind: 'plantado',
      registros: 0,
      noSpend: true,
      diaCalmaPasado: true,
      tone: 'green',
    },
  },
  // ②6: lunes perdido (track vacío + Brot wilted al 45%) y, en la misma
  // fila, el miércoles recuperado por escudo (lleno coral) para contrastar.
  {
    key: 'dia-perdido',
    label: 'día perdido',
    screen: 'jardin',
    state: {
      heroKind: 'aTiempo',
      registros: 1,
      diaPerdido: true,
      diaRecuperado: true,
      tone: 'green',
    },
  },
  // §3.3: el cupo entra como TONO, no como suma — mismo porcentaje, ámbar.
  {
    key: 'cupo-excedido',
    label: 'cupo excedido',
    screen: 'jardin',
    state: { heroKind: 'aTiempo', registros: 3, tone: 'amber' },
  },
  // ②5: la semana florecida — foco `radiant` y footer con CTA al cierre.
  {
    key: 'semana-florecida',
    label: 'semana florecida',
    screen: 'jardin',
    state: { heroKind: 'floreciendo', registros: 4, florecida: true, tone: 'green' },
  },
  // ②7 "Medianoche": el día se dio vuelta — HOY vuelve a 0 registros y el
  // miércoles ya quedó lleno. El aro de hoy arranca vacío otra vez.
  {
    key: 'medianoche',
    label: 'medianoche',
    screen: 'jardin',
    state: { heroKind: 'aTiempo', registros: 0, tone: 'water' },
  },
  // ②9/③6: primera semana — días anteriores al alta en 'pre' (nunca
  // marchitos), sin historial y sin card de semana pasada.
  {
    key: 'primera-semana',
    label: 'primera semana',
    screen: 'jardin',
    state: {
      heroKind: 'empezar',
      registros: 0,
      primeraSemana: true,
      tone: 'water',
      semanaPasadaVariant: null,
    },
  },
  // ①8: skeleton de pozos + shimmer mientras carga.
  { key: 'carga-skeleton', label: 'carga', screen: 'jardin', state: { loading: true } },
  // 7f: el sheet del historial abierto (grabber + 4 semanas + chips).
  { key: 'sheet-historial', label: 'sheet historial', screen: 'jardin', state: { showSheet: true } },

  // ─── Cierre de semana ×4 (HTML:624–1073) ───
  { key: 'cierre-perfecta', label: 'cierre perfecta', screen: 'cierre', cierre: 'perfecta' },
  { key: 'cierre-buena', label: 'cierre buena', screen: 'cierre', cierre: 'buena' },
  { key: 'cierre-floja', label: 'cierre floja', screen: 'cierre', cierre: 'floja' },
  { key: 'cierre-cortada', label: 'cierre cortada', screen: 'cierre', cierre: 'cortada' },
  // Extra del kit (D4): la misma semana buena con día en calma, día
  // recuperado y la línea "N días en calma".
  { key: 'cierre-calma', label: 'cierre calma', screen: 'cierre', cierre: 'calma' },
  // ③5: el cierre está disponible y todavía no se abrió → punto naranja en
  // la card "Semana pasada" del JARDÍN (ver docblock).
  {
    key: 'cierre-sin-ver',
    label: 'cierre sin ver',
    screen: 'jardin',
    state: { heroKind: 'aTiempo', registros: 2, tone: 'green', semanaPasadaUnseen: true },
  },

  // ─── Logros (HTML:1079–1215) ───
  { key: 'logros-18', label: 'logros 18', screen: 'logros', logros: 'logros-18' },
  // ④2: logro nuevo sin ver (dot naranja + pop).
  {
    key: 'logros-nuevo-sin-ver',
    label: 'logros sin ver',
    screen: 'logros',
    logros: 'logros-nuevo-sin-ver',
  },
  // ④3: próximo a ≤2 días — el "?" tiembla cada 8s.
  { key: 'logros-proximo', label: 'logros próximo', screen: 'logros', logros: 'logros-proximo' },
  // ④4: colección completa — shine sweep una vez.
  { key: 'logros-completo', label: 'logros completo', screen: 'logros', logros: 'logros-completo' },
  // ④5: usuario nuevo — 0 desbloqueados, todo silueta.
  {
    key: 'logros-usuario-nuevo',
    label: 'logros nuevo',
    screen: 'logros',
    logros: 'logros-usuario-nuevo',
  },

  // ⑤2: la nota educativa descartada con la "×" (el estado que la matriz
  // exige sin darle visual propio).
  {
    key: 'nota-descartada',
    label: 'nota descartada',
    screen: 'jardin',
    state: { noteDismissed: true },
  },
]

/** `key={seed.key}` remonta el árbol: resetea reducer, Brot y entradas. */
function renderSeed(seed: JardinSeed, mode: ResolvedThemeMode) {
  switch (seed.screen) {
    case 'cierre':
      return <CierreFinalScreen key={seed.key} mode={mode} initialSeed={seed.cierre} />
    case 'logros':
      return <LogrosFinalScreen key={seed.key} mode={mode} initialSeed={seed.logros} />
    default:
      return <JardinFinalScreen key={seed.key} mode={mode} initialSeed={seed.state} />
  }
}

export function RedesignJardinPreviewScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const [mode, setMode] = useState<ResolvedThemeMode>('light')
  const [seedIdx, setSeedIdx] = useState(0)
  // [OWNER-2]: el jardín se para sobre el fondo GLOBAL de la app, también
  // en el preview — el owner juzga el diseño sobre el canvas real.
  const neo = neoTokens(mode)
  const seed = JARDIN_SEEDS[seedIdx] ?? JARDIN_SEEDS[0]!

  return (
    <View style={[styles.root, { backgroundColor: neo.bg }]}>
      {renderSeed(seed, mode)}

      <View pointerEvents="box-none" style={[styles.devChrome, { top: insets.top + 6 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Alternar tema del preview"
          onPress={() => setMode((m) => (m === 'light' ? 'dark' : 'light'))}
          style={[styles.devToggle, { borderColor: neo.textMuted }]}
        >
          <Text style={styles.devToggleIcon}>{mode === 'light' ? '🌙' : '☀️'}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ciclar seed de estado"
          onPress={() => setSeedIdx((i) => (i + 1) % JARDIN_SEEDS.length)}
          style={[styles.devToggle, { borderColor: neo.textMuted }]}
        >
          <Text style={styles.devToggleIcon}>🧪</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Salir del preview"
          onPress={() => router.back()}
          style={[styles.devToggle, { borderColor: neo.textMuted }]}
        >
          <Text style={styles.devToggleIcon}>✕</Text>
        </Pressable>
        <Text style={[styles.devStep, { color: neo.textMuted }]}>{seed.label}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  devChrome: {
    position: 'absolute',
    right: 10,
    alignItems: 'center',
    gap: 3,
  },
  devToggle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  devToggleIcon: { fontSize: 14 },
  devStep: { fontSize: 9, fontWeight: '800', fontFamily: nunitoFamily('800'), maxWidth: 64, textAlign: 'center' },
})
