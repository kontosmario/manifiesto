// @i18n-ignore-file — tooling dev-only gated por __DEV__.
import { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui/app-text'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { GastosFinalScreen } from '@/components/redesign/gastos/gastos-screen'
import { GASTOS_SPEC, type GastosMode } from '@/components/redesign/gastos/gastos-spec'
import { nunitoFamily } from '@/theme/typography'

/**
 * Preview dev-only de la vista GASTOS del rediseño (design/gastos-2026-07/
 * gastos.dc.html + gastos-interactivo.dc.html): réplica pixel-perfect
 * claro/oscuro + CICLADOR DE SEEDS que siembra el estado inicial de la
 * máquina. La pantalla es AUTO-CONDUCIDA: desde cualquier seed el owner
 * alcanza el resto tocando (día/dropdown/ciclo/filtro funcionan en vivo).
 * Chrome flotante = toggle de tema + ciclador + salir (NO es del mockup).
 * El seed 'actual' rinde IDÉNTICO al aprobado (defaults del kit).
 */

interface GastosSeed {
  key: string
  label: string
  state: {
    cyc?: number
    sel?: number
    venc?: boolean
    dayF?: boolean
    cat?: number
    dd?: boolean
    empty?: boolean
  }
}

export const GASTOS_SEEDS: GastosSeed[] = [
  // Base aprobada — cur, calendario, hero TOTAL VISIBLE.
  { key: 'actual', label: 'actual', state: {} },
  // Ciclo vencido sin cobro: banner + días +20/+21 FUERA al final del calendario.
  { key: 'vencido', label: 'vencido', state: { venc: true } },
  // Edición cerrada (Mayo): solo-lectura + outline dashed + Brot think + sin CTAs.
  { key: 'cerrado-mayo', label: 'cerrado mayo', state: { cyc: 1 } },
  // Segunda edición cerrada (Abril, margen +).
  { key: 'cerrado-abril', label: 'cerrado abril', state: { cyc: 2 } },
  // Selector de ciclo abierto (mfDrop).
  { key: 'dropdown', label: 'dropdown', state: { dd: true } },
  // Detalle día HOY + movimientos filtrados a 1 grupo.
  { key: 'dia-hoy', label: 'día hoy', state: { sel: 7, dayF: true } },
  // Detalle día de EXCESO: badge "Día de exceso" + GASTADO durazno.
  { key: 'dia-exceso', label: 'día exceso', state: { sel: 24, dayF: true } },
  // Detalle día FUTURO: "— / 0", CTAs presentes.
  { key: 'dia-futuro', label: 'día futuro', state: { sel: 12, dayF: true } },
  // Detalle día FUERA de ciclo: badge "Fuera de ciclo" + strip Brot sad, sin CTAs.
  { key: 'dia-fuera', label: 'día fuera', state: { venc: true, sel: 20.5, dayF: true } },
  // Filtro "🏠 Hogar" activo (solo visual).
  { key: 'filtro-hogar', label: 'filtro hogar', state: { cat: 1 } },
  // Usuario nuevo / ciclo actual SIN movimientos: TODOS los vacíos juntos —
  // hero "$0" + Brot + CTA crema, calendario neutro, filtro oculto,
  // movimientos con pozo inset Brot + CTA verde.
  { key: 'sin-datos', label: 'sin datos', state: { empty: true } },
]

export function RedesignGastosPreviewScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const [mode, setMode] = useState<GastosMode>('light')
  const [seedIdx, setSeedIdx] = useState(0)
  const s = GASTOS_SPEC[mode]
  const seed = GASTOS_SEEDS[seedIdx] ?? GASTOS_SEEDS[0]

  return (
    <View style={[styles.root, { backgroundColor: s.bg }]}>
      {/* key remonta el árbol al cambiar de seed (resetea Brot/reducer). */}
      <GastosFinalScreen key={seed.key} mode={mode} initialState={seed.state} />

      <View pointerEvents="box-none" style={[styles.devChrome, { top: insets.top + 6 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Alternar tema del preview"
          onPress={() => setMode((m) => (m === 'light' ? 'dark' : 'light'))}
          style={[styles.devToggle, { borderColor: s.sub }]}
        >
          <Text style={styles.devToggleIcon}>{mode === 'light' ? '🌙' : '☀️'}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ciclar seed de estado"
          onPress={() => setSeedIdx((i) => (i + 1) % GASTOS_SEEDS.length)}
          style={[styles.devToggle, { borderColor: s.sub }]}
        >
          <Text style={styles.devToggleIcon}>🧪</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Salir del preview"
          onPress={() => router.back()}
          style={[styles.devToggle, { borderColor: s.sub }]}
        >
          <Text style={styles.devToggleIcon}>✕</Text>
        </Pressable>
        <Text style={[styles.devStep, { color: s.sub }]}>{seed.label}</Text>
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
