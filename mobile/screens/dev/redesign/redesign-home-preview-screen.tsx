// @i18n-ignore-file — tooling dev-only gated por __DEV__.
import { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui/app-text'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { HomeFinalScreen, type HomeFinalScreenProps } from '@/components/redesign/home/home-screen'
import { HOME_SPEC, type HomeMode } from '@/components/redesign/home/home-spec'
import { AvatarAnimal } from '@/components/ui/avatar-animal'
import { CategoryIcon } from '@/components/category/category-icon'
import { nunitoFamily } from '@/theme/typography'

/**
 * Preview dev-only de la HOME FINAL (design/home-final-2026-07/home.dc.html):
 * réplica pixel-perfect claro/oscuro + CICLADOR DE PRESETS con el catálogo
 * de estados (estados.dc.html §§1-14). Chrome flotante = toggle de tema +
 * cicladores + salir (NO es parte del mockup). El preset 'mockup' rinde
 * IDÉNTICO al aprobado (defaults del kit); el resto arma cada variante con
 * los copy LITERALES del catálogo.
 */

export interface HomeStatePreset {
  key: string
  label: string
  props: Omit<HomeFinalScreenProps, 'mode'>
}

export const HOME_STATE_FIXTURES: HomeStatePreset[] = [
  // Default aprobado — sin overrides (tarde + wave, badge 4, $2.452.537…).
  { key: 'mockup', label: 'mockup', props: {} },
  // §3 hero "Ajustado / bajo" (estados.dc.html:26-28): saldo durazno +
  // chip "saldo ajustado".
  {
    key: 'ajustado',
    label: 'ajustado',
    props: {
      hero: {
        variant: 'adjusted',
        balance: '$318.400',
        usdLine: '≈ US$ 210',
        eventChip: { tone: 'green', label: 'saldo ajustado', icon: 'content-cut' },
        fixedChip: '$123k de fijos',
      },
    },
  },
  // Hero "te pasaste" — saldo del ciclo NEGATIVO. Paleta terracota portada de
  // la variante `corto` del hero de Control. El medidor cede su lugar a la
  // fila Brot `worried` + "El cupo se reinicia…" (interna a la variante; en
  // web el Brot es una caja vacía — Skia solo rinde en device). Números de la
  // cuenta QA del ciclo extendido.
  {
    key: 'pasado',
    label: 'te pasaste',
    props: {
      hero: {
        variant: 'over',
        // Sin `balanceValue`, igual que el resto de los presets: el fixture
        // aprueba el DIBUJO, y el conteo fluido rinde en un TextInput animado
        // que en el preview web se queda en el valor inicial.
        balance: '-$1.262.200',
        overSub: 'Te pasaste del plan',
        usdLine: '≈ -US$ 1.052',
        dayPill: 'día 37 de 37',
        eventChip: null,
        fixedChip: '$1,79M de fijos',
        gauge: null,
      },
    },
  },
  // Chip "Reserva $X" (gold) acoplado del hero viejo (decisión owner
  // 2026-07-21): informativo, junto al de fijos, no entra al selector.
  {
    key: 'con-reserva',
    label: 'con reserva',
    props: {
      hero: {
        eventChip: { tone: 'green', label: 'Sumaste $139k al mes', icon: 'trending-up' },
        reservaChip: 'Reserva $340k',
        fixedChip: '$123k de fijos',
      },
    },
  },
  // §5 cupo "Al límite": bar GASTADO casi lleno (spentRatio 0.9), durazno.
  {
    key: 'medidor-limite',
    label: 'medidor límite',
    props: {
      hero: {
        gauge: { cupoAmount: '$179k', spentLabel: '$161k', availableLabel: '$18k', spentRatio: 0.9, status: 'limit' },
      },
    },
  },
  // §5 cupo "Excedido": GASTADO lleno (spentRatio 1) en terracota, DISPONIBLE $0.
  {
    key: 'medidor-excedido',
    label: 'medidor excedido',
    props: {
      hero: {
        gauge: { cupoAmount: '$179k', spentLabel: '$208k', availableLabel: '$0', spentRatio: 1, status: 'over' },
      },
    },
  },
  // §8 "Por perder": Brot worried, L-M brotes + hoy pendiente.
  {
    key: 'racha-por-perder',
    label: 'racha por perder',
    props: {
      streak: {
        brotPose: 'worried',
        title: '¡No pierdas la racha!',
        pips: ['done', 'done', 'today', 'idle', 'idle', 'idle', 'idle'],
      },
    },
  },
  // §8 "Cortada": Brot sad + un pip perdido (X #7A2E17 sobre #E8A87C).
  {
    key: 'racha-cortada',
    label: 'racha cortada',
    props: {
      streak: {
        brotPose: 'sad',
        title: 'Racha cortada',
        pips: ['done', 'missed', 'today', 'idle', 'idle', 'idle', 'idle'],
      },
    },
  },
  // §8 "Perfecta": Brot cheer, 7/7 brotes, link "Ver ›".
  {
    key: 'semana-perfecta',
    label: 'semana perfecta',
    props: {
      streak: {
        brotPose: 'cheer',
        title: '¡Semana perfecta!',
        pips: ['done', 'done', 'done', 'done', 'done', 'done', 'done'],
        linkLabel: 'Ver',
      },
    },
  },
  // §6 fila FIJOS "Vencido" (dot+label naranjas, sub "1 vencido") + §2 dot
  // de notificación en el ítem Fijos de la nav.
  {
    key: 'fijos-vencido',
    label: 'fijos vencido',
    props: {
      cycle: { fijos: { amount: '$1,2M', sub: '1 vencido', subAlert: null, tone: 'overdue' } },
      nav: { itemDots: { fijos: true } },
    },
  },
  // §7 "Sin meta" versión catálogo: card raise + tile 🎯 inset + CTA pill.
  { key: 'sin-meta', label: 'sin meta', props: { goal: { goal: null, emptyStyle: 'raise' } } },
  // §11-14 panel completo usuario nuevo (estados.dc.html:47-135): welcome
  // sin emoji, campana SIN badge, Miembros·1, chip sueldo naranja, hero $0,
  // resumen muted, meta dashed, racha día cero (seed) y actividad BR-E.
  {
    key: 'usuario-nuevo',
    label: 'usuario nuevo',
    props: {
      header: { welcome: true, unreadCount: 0 },
      chips: {
        members: { avatars: [<AvatarAnimal key="a" slug="squirrel" size={26} />], count: 1 },
        payday: { kind: 'configure' },
      },
      hero: { variant: 'empty' },
      cycle: {
        variables: { amount: '$0', sub: 'Sin movimientos aún', muted: true },
        fijos: { amount: '$0', sub: 'Agregá tu primer fijo (alquiler, servicios…)', subAlert: null, muted: true },
      },
      goal: { goal: null, emptyStyle: 'dashed' },
      streak: {
        brotPose: 'seed',
        title: 'Racha de 0 días',
        subLine: 'Registrá tu primer gasto hoy y plantá un brote',
        pips: ['idle', 'idle', 'idle', 'idle', 'idle', 'idle', 'idle'],
      },
      activity: { empty: { kind: 'newUser' } },
    },
  },
  // §10 vacío recurrente ("hoy vacío", sin CTA) + §11 chip "Cobrado hoy ✓".
  {
    key: 'hoy-vacio',
    label: 'hoy vacío',
    props: { chips: { payday: { kind: 'paidToday' } }, activity: { empty: { kind: 'today' } } },
  },
  // §11 chip sueldo PENDING ("¿Ya cobraste?", dot naranja) + avatares
  // REALES del pack (AvatarAnimal) para ver el chip Miembros como en vivo.
  {
    key: 'sueldo-pendiente',
    label: 'sueldo pendiente',
    props: {
      chips: {
        members: {
          avatars: [
            <AvatarAnimal key="a" slug="squirrel" size={26} />,
            <AvatarAnimal key="b" slug="butterfly" size={26} />,
          ],
          count: 2,
        },
        payday: { kind: 'pending' },
      },
    },
  },
  // Stickers REALES de categoría en actividad (CategoryIcon, gastos): igual
  // que la fila viva. onLightSurface → el sticker va directo sobre el tile.
  {
    key: 'actividad-iconos',
    label: 'actividad íconos',
    props: {
      activity: {
        items: [
          {
            icon: <CategoryIcon name="Delivery" scope="expense" size={24} onLightSurface />,
            tileColor: '#FBE3D3',
            title: 'Delivery',
            sub: 'Mario · Comida y salidas',
            amount: '−$61.200',
          },
          {
            icon: <CategoryIcon name="Mercado" scope="expense" size={24} onLightSurface />,
            tileColor: '#DCEFD8',
            title: 'Verdulería',
            sub: 'Camila · Mercado',
            amount: '−$12.500',
          },
        ],
      },
    },
  },
]

export function RedesignHomePreviewScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const [mode, setMode] = useState<HomeMode>('light')
  const [presetIdx, setPresetIdx] = useState(0)
  const s = HOME_SPEC[mode]
  const preset = HOME_STATE_FIXTURES[presetIdx] ?? HOME_STATE_FIXTURES[0]

  return (
    <View style={[styles.root, { backgroundColor: s.bg }]}>
      {/* key remonta el árbol al cambiar de preset (poses de Brot, etc.). */}
      <HomeFinalScreen key={preset.key} mode={mode} {...preset.props} />

      <View pointerEvents="box-none" style={[styles.devChrome, { top: insets.top + 6 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Alternar tema del preview"
          onPress={() => setMode((m) => (m === 'light' ? 'dark' : 'light'))}
          style={[styles.devToggle, { borderColor: s.sectionLabel }]}
        >
          <Text style={styles.devToggleIcon}>{mode === 'light' ? '🌙' : '☀️'}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ciclar preset de estado"
          onPress={() => setPresetIdx((i) => (i + 1) % HOME_STATE_FIXTURES.length)}
          style={[styles.devToggle, { borderColor: s.sectionLabel }]}
        >
          <Text style={styles.devToggleIcon}>🧪</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Salir del preview"
          onPress={() => router.back()}
          style={[styles.devToggle, { borderColor: s.sectionLabel }]}
        >
          <Text style={styles.devToggleIcon}>✕</Text>
        </Pressable>
        <Text style={[styles.devStep, { color: s.sectionLabel }]}>{preset.label}</Text>
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
