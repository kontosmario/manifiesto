import { useCallback, useRef, type ComponentProps, type ReactNode } from 'react'
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
  type AccessibilityActionEvent,
} from 'react-native'
import { RectButton } from 'react-native-gesture-handler'
import Swipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable'
import Animated, {
  FadeIn,
  FadeOut,
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated'
import { MaterialIcons } from '@expo/vector-icons'
import { useAppTheme } from '@/theme/theme-provider'
import { typography } from '@/theme/typography'
import { triggerHaptic, type AppHapticTone } from '@/lib/haptics'

type MaterialIconName = ComponentProps<typeof MaterialIcons>['name']

export interface SwipeAction {
  label: string
  tone?: 'neutral' | 'danger'
  /** MaterialIcons name. Recommended: 'delete' for destructive, 'edit'
   *  for edit, 'visibility' / 'visibility-off' for read/unread. */
  icon?: MaterialIconName
  onPress: () => void
}

interface SwipeableRowProps {
  children: ReactNode
  rightActions?: SwipeAction[]
  leftActions?: SwipeAction[]
  accessibilityHint: string
  /** Optional composed label for VoiceOver/TalkBack. When omitted the
   *  row falls back to whatever the children expose. */
  accessibilityLabel?: string
  /** Accessibility actions exposed via the rotor for screen reader
   *  users (who can't perform the swipe gesture). Pair with
   *  `onAccessibilityAction` to handle each. */
  accessibilityActions?: ReadonlyArray<{ name: string; label?: string }>
  /** Handler invoked when the screen reader picks an action from the
   *  rotor. Looks up `event.nativeEvent.actionName` and dispatches. */
  onAccessibilityAction?: (event: AccessibilityActionEvent) => void
  onSwipeOpenHaptic?: AppHapticTone
  borderRadius?: number
  borderColor?: string
  /**
   * When true, the row content dims + becomes non-interactive and a
   * floating "Procesando" chip fades in. Use this while an async
   * mutation (delete / edit) is in flight for this specific row.
   * Pair with `mutation.isPending && mutation.variables === itemId`.
   */
  isProcessing?: boolean
  /** Copy for the in-flight chip. Defaults to "Procesando…". */
  processingLabel?: string
}

export function SwipeableRow({
  children,
  rightActions = [],
  leftActions = [],
  accessibilityHint,
  accessibilityLabel,
  accessibilityActions,
  onAccessibilityAction,
  onSwipeOpenHaptic = 'selection',
  borderRadius = 14,
  borderColor,
  isProcessing = false,
  processingLabel = 'Procesando…',
}: SwipeableRowProps) {
  const { theme } = useAppTheme()
  const resolvedBorderColor = borderColor ?? theme.colors.line
  const swipeRef = useRef<SwipeableMethods>(null)

  // Pintamos un bg del color de la acción dominante DETRÁS de todo el
  // contenido. En idle el row tapa todo y no se ve; al swipear, el
  // espacio que el row va dejando muestra este bg en lugar del canvas
  // del fondo de la pantalla. Así los cuartos de círculo de las
  // esquinas (clipped por el borderRadius del outer) quedan continuos
  // con el color de la acción y NO se ven huecos negros.
  const dominantTone = rightActions[0]?.tone ?? leftActions[0]?.tone ?? 'neutral'
  const dominantActionBg =
    dominantTone === 'danger' ? theme.colors.danger : theme.colors.primary
  const hasAnyAction = rightActions.length > 0 || leftActions.length > 0

  const handleSwipeOpen = useCallback(() => {
    void triggerHaptic(onSwipeOpenHaptic)
  }, [onSwipeOpenHaptic])

  const renderActions = useCallback(
    (actions: SwipeAction[], side: 'left' | 'right') =>
      (progress: SharedValue<number>) => (
        <SwipeActionsRow
          actions={actions}
          side={side}
          progress={progress}
          onActionPress={(action) => {
            swipeRef.current?.close()
            action.onPress()
          }}
        />
      ),
    [],
  )

  return (
    <View
      accessible
      accessibilityHint={accessibilityHint}
      accessibilityLabel={accessibilityLabel}
      accessibilityActions={accessibilityActions as readonly { name: string; label?: string }[] | undefined}
      onAccessibilityAction={onAccessibilityAction}
      style={{
        borderRadius,
        overflow: 'hidden',
        // Cuando el caller pide explícitamente `borderColor: 'transparent'`
        // (porque el row hijo ya trae su propio chrome — ej. FijoRow con
        // su `styles.card`), salteamos también el borderWidth para no
        // dejar un inset de 1px que desalinea el hijo. Default de toda
        // la vida: 1px del color de línea del tema (cubre los rows sin
        // chrome propio, como GastoRow).
        borderWidth: borderColor === 'transparent' ? 0 : 1,
        borderColor: resolvedBorderColor,
      }}
    >
      {hasAnyAction ? (
        // Bg del color de la acción dominante, absolutamente posicionado
        // detrás del row. Idle: invisible (el row lo tapa). Swiped: lo
        // que el row deja libre se ve continuo hasta los bordes
        // redondeados del outer container. Se acabaron los huecos
        // negros en las esquinas curvas.
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: dominantActionBg,
          }}
        />
      ) : null}
      <Swipeable
        ref={swipeRef}
        friction={1.8}
        overshootLeft={false}
        overshootRight={false}
        enabled={!isProcessing}
        onSwipeableOpen={handleSwipeOpen}
        renderRightActions={rightActions.length ? renderActions(rightActions, 'right') : undefined}
        renderLeftActions={leftActions.length ? renderActions(leftActions, 'left') : undefined}
      >
        <View>
          <View
            pointerEvents={isProcessing ? 'none' : 'auto'}
            style={{ opacity: isProcessing ? 0.55 : 1 }}
          >
            {children}
          </View>
          {isProcessing ? (
            <Animated.View
              entering={FadeIn.duration(180)}
              exiting={FadeOut.duration(140)}
              style={[
                styles.processingChip,
                {
                  backgroundColor: theme.colors.creamCard,
                  borderColor: theme.colors.line,
                },
              ]}
              pointerEvents="none"
            >
              <ActivityIndicator size="small" color={theme.colors.primary} />
              <Text
                style={[
                  styles.processingLabel,
                  typography.buttonCompact,
                  { color: theme.colors.text },
                ]}
              >
                {processingLabel}
              </Text>
            </Animated.View>
          ) : null}
        </View>
      </Swipeable>
    </View>
  )
}

interface SwipeActionsRowProps {
  actions: SwipeAction[]
  side: 'left' | 'right'
  progress: SharedValue<number>
  onActionPress: (action: SwipeAction) => void
}

function SwipeActionsRow({ actions, side, progress, onActionPress }: SwipeActionsRowProps) {
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.5, 1], [0, 0.6, 1]),
    transform: [
      { translateX: interpolate(progress.value, [0, 1], [side === 'right' ? 40 : -40, 0]) },
    ],
  }))

  return (
    <Animated.View
      style={[
        styles.actionsRow,
        side === 'right' ? styles.actionsRight : styles.actionsLeft,
        style,
      ]}
    >
      {actions.map((action, index) => (
        <SwipeActionButton key={`${action.label}-${index}`} action={action} onPress={onActionPress} />
      ))}
    </Animated.View>
  )
}

function SwipeActionButton({ action, onPress }: { action: SwipeAction; onPress: (action: SwipeAction) => void }) {
  const { theme } = useAppTheme()
  const isDanger = action.tone === 'danger'
  const background = isDanger ? theme.colors.danger : theme.colors.primary
  const foreground = isDanger ? '#FFFFFF' : theme.isDark ? theme.brand.deep : '#FFFFFF'

  return (
    <RectButton
      onPress={() => {
        void triggerHaptic(isDanger ? 'warning' : 'selection')
        onPress(action)
      }}
      style={[styles.actionButton, { backgroundColor: background }]}
    >
      {action.icon ? (
        <MaterialIcons
          name={action.icon}
          size={22}
          color={foreground}
          style={styles.actionIcon}
        />
      ) : null}
      <Text style={[typography.buttonCompact, styles.actionLabel, { color: foreground }]}>
        {action.label}
      </Text>
    </RectButton>
  )
}

const styles = StyleSheet.create({
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  actionsRight: { justifyContent: 'flex-end' },
  actionsLeft:  { justifyContent: 'flex-start' },
  actionButton: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    minWidth: 84,
    gap: 2,
  },
  actionIcon: {
    marginBottom: 2,
  },
  actionLabel: { textAlign: 'center' },
  processingChip: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  processingLabel: {
    fontSize: 11,
    letterSpacing: 0.2,
  },
})
