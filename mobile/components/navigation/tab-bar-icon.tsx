import { type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { AppSymbol } from '@/components/ui/app-symbol'
import { useAppTheme } from '@/theme/theme-provider'

/**
 * V2 modernized tab icon (post-2026-05-13 Liquid Glass nav refactor).
 *
 * Active state visual model:
 *   · Sliding Liquid Glass pill detrás del icon+label · vive en
 *     `TabBarPillIndicator` a nivel tab bar (no por-celda) y se
 *     desliza entre tabs como el segmented control nativo iOS.
 *   · Icon color shifts from `textMuted` to `primary`
 *   · Label bolds via `tab-label.tsx`
 *
 * Idle state es visualmente quiet — solo color del icon cambia,
 * sin ornament por-celda. El active-state ornament VIVE EN EL PILL,
 * no acá. Reemplazó al `focusDot` 4×4 Cash App style que estaba
 * separado por tab.
 */

function TabIconFrame({
  children,
  focused,
  showAlert,
}: {
  children: ReactNode
  focused: boolean
  showAlert?: boolean
}) {
  const { theme } = useAppTheme()

  return (
    <View style={styles.iconSlot}>
      <View style={styles.iconCenter}>{children}</View>

      {/* Unread alert (Control tab when advisor has new high-priority
          signals). Suppressed while focused — user is already on the
          tab. */}
      {showAlert && !focused ? (
        <View
          pointerEvents="none"
          style={[
            styles.alertDot,
            {
              backgroundColor: theme.colors.warning,
              borderColor: theme.colors.background,
            },
          ]}
        />
      ) : null}
    </View>
  )
}

export function TabBarIcon({
  color,
  fallback,
  focused,
  name,
  size,
  showAlert = false,
}: {
  color: string
  fallback: keyof typeof MaterialIcons.glyphMap
  focused: boolean
  name: string
  size: number
  showAlert?: boolean
}) {
  const { theme } = useAppTheme()
  // Active uses V1 primary directly (primary-800 light, primary-300
  // dark — both AA on the tab bar background). Idle uses textMuted
  // (V1 surface-700 light, primary-300 dark).
  const resolvedColor = focused ? theme.colors.primary : theme.colors.textMuted
  void color

  return (
    <TabIconFrame focused={focused} showAlert={showAlert}>
      <AppSymbol
        color={resolvedColor}
        fallback={fallback}
        name={name}
        size={size}
      />
    </TabIconFrame>
  )
}

const styles = StyleSheet.create({
  iconSlot: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCenter: {
    width: 28,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertDot: {
    position: 'absolute',
    top: 1,
    right: 6,
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 1.5,
  },
})
