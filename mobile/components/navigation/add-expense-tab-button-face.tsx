import { StyleSheet, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { radii, type AppTheme } from '@/theme/palette'
import { AppSymbol } from '@/components/ui/app-symbol'
import { NeoTabIcon } from '@/components/navigation/neo-tab-icons'
import { HOME_SPEC, type HomeMode } from '@/components/redesign/home/home-spec'
import { cssGradient } from '@/theme/neo-tokens'

export type AddExpenseFaceVariant = 'legacy' | 'neo'

interface AddExpenseTabButtonFaceProps {
  theme: AppTheme
  /**
   * `legacy` (default) — cara V1: gradiente mint saturado + "+" + borde
   * "cutout" contra la barra. La usa el tab bar viejo (aún live hasta F5).
   *
   * `neo` — cara del `HomeNavBar` aprobado (spec `home-final`): disco con surco
   * `fabWell`, gradiente invertido a crema en oscuro, "+" glyph neo y sombras
   * `fab`/`fabWell` (→ `fabPressed*` en press). SOLO cambia la CARA — el wrapper
   * (handlePress/overlay/burst/no-spend/import/tour) es COMPARTIDO por ambas.
   */
  variant?: AddExpenseFaceVariant
  /**
   * Neo only: cuando está presionado, ambas capas (disco + surco) hacen el
   * swap-a-inset del mockup (`fabShadow→fabPressedShadow`,
   * `fabWellShadow→fabPressedWellShadow`, home-spec.ts:365-370,519-524).
   */
  pressed?: boolean
  /**
   * Neo only: fuerza el modo. El FAB live lo deriva de `theme.isDark`; el preview
   * dev lo pasa explícito para mostrar claro/oscuro sin tocar el tema real (los
   * `PreviewPhoneSection` solo pintan un fondo, no proveen contexto de tema).
   */
  mode?: HomeMode
}

/**
 * Fallback sólido del gradiente del FAB neo cuando `experimental_backgroundImage`
 * no esté soportado (2º stop del gradiente: verde profundo claro / crema oscuro).
 * En RN 0.81 el gradiente SÍ rinde con minSdk 29 — el seam solo lo deja listo.
 */
const NEO_FAB_FALLBACK: Record<HomeMode, string> = {
  light: '#327E39',
  dark: '#DCE0D0',
}

/**
 * The visible face of the FAB. Two variants, same 66-ish circle:
 *
 *   · `legacy` — V1 mint gradient + centered "+" glyph. Press feedback comes
 *     from the parent's scale + burst ring only.
 *   · `neo` — the approved HomeNavBar disc (surco `fabWell` + inverted cream
 *     gradient in dark). On press both layers swap to the mockup's inset shadow.
 *
 * The logic (tap → quick-actions overlay, no-spend machine, import chain, tour)
 * lives in the parent `AddExpenseTabButton` and is shared by both variants —
 * only the face is restyled.
 */
export function AddExpenseTabButtonFace({
  theme,
  variant = 'legacy',
  pressed = false,
  mode,
}: AddExpenseTabButtonFaceProps) {
  if (variant === 'neo') {
    const resolvedMode: HomeMode = mode ?? (theme.isDark ? 'dark' : 'light')
    const s = HOME_SPEC[resolvedMode]
    return (
      <View
        style={[
          styles.neoFab,
          // Gradiente por el seam (fallback sólido). En oscuro el disco va
          // INVERTIDO a crema con "+" verde (fabInk), del catálogo §1.
          cssGradient(s.fabGradientCss, NEO_FAB_FALLBACK[resolvedMode]),
          { boxShadow: pressed ? s.fabPressedShadow : s.fabShadow },
        ]}
      >
        {/* Surco interior (`fabWell`): pozo hundido concéntrico que aloja el
            "+". Sin fill propio — el gradiente del disco asoma por su inset. */}
        <View
          style={[
            styles.neoFabWell,
            { boxShadow: pressed ? s.fabPressedWellShadow : s.fabWellShadow },
          ]}
        >
          <NeoTabIcon name="plus" color={s.fabInk} size={24} strokeWidth={3} />
        </View>
      </View>
    )
  }

  return (
    <LinearGradient
      // V1 primary scale gradient — saturated mint, on-brand.
      // Light gradient lives in primary-800/900 range so white "+"
      // clears AA across the entire surface (was failing at primary-600).
      // Dark gradient in primary-200/400 so surface-950 "+" reads AAA.
      //   Light: primary-700 → primary-800 → primary-900
      //          (#329315 → #297811 → #1F590D)
      //   Dark:  primary-200 → primary-300 → primary-400
      //          (#D1F7C5 → #A6EF8F → #77E755)
      colors={
        theme.isDark
          ? ['#D1F7C5', '#A6EF8F', '#77E755']
          : ['#329315', '#297811', '#1F590D']
      }
      end={{ x: 1, y: 1 }}
      start={{ x: 0.12, y: 0 }}
      style={[
        styles.addButton,
        {
          // The 4pt ring acts as the "cutout" against the tab bar
          // background — uses the bar's bg color so the FAB reads as
          // notched into the bar rather than floating disconnected.
          borderColor: theme.colors.creamCard,
        },
      ]}
    >
      {/* Subtle gloss — a single static white-alpha gradient at the
          top so the surface reads as a polished pill, not flat. */}
      <LinearGradient
        colors={
          theme.isDark
            ? ['rgba(255, 255, 255, 0.18)', 'transparent']
            : ['rgba(255, 255, 255, 0.32)', 'transparent']
        }
        end={{ x: 0.5, y: 0.55 }}
        start={{ x: 0.5, y: 0 }}
        style={styles.addButtonGloss}
        pointerEvents="none"
      />
      <AppSymbol
        // Light: white "+" on primary-600/800 = AAA contrast.
        // Dark:  surface-950 "+" on primary-300 = AAA contrast.
        color={theme.isDark ? '#12211A' : '#FFFFFF'}
        fallback="add"
        name="plus"
        size={28}
        type="monochrome"
      />
    </LinearGradient>
  )
}

const styles = StyleSheet.create({
  addButton: {
    width: 66,
    height: 66,
    borderRadius: radii.pill,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    elevation: 12,
  },
  addButtonGloss: {
    ...StyleSheet.absoluteFillObject,
  },
  // Cara neo — geometría LITERAL del mockup (DefaultNeoFab / home-screen.tsx):
  // disco 62 r31 (sin borde cutout: el surco + boxShadow aportan la profundidad)
  // + surco 44 r22 concéntrico.
  neoFab: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
  },
  neoFabWell: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
