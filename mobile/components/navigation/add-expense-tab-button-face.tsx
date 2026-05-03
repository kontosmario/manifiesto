import { StyleSheet } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { radii, type AppTheme } from '@/theme/palette'
import { AppSymbol } from '@/components/ui/app-symbol'

interface AddExpenseTabButtonFaceProps {
  theme: AppTheme
}

/**
 * The visible face of the FAB — a 66pt circle with a subtle V1 mint
 * gradient and a centered "+" glyph. No more decorative motion layers
 * (color boost, shine boost, icon rotation). The press feedback now
 * comes from the parent's scale + burst ring only.
 */
export function AddExpenseTabButtonFace({ theme }: AddExpenseTabButtonFaceProps) {
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
})
