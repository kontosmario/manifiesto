import { useEffect } from 'react'
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  useReducedMotion,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { CategoryBadge } from '@/components/ui/category-badge'
import { SelectableRow } from '@/components/ui/selectable-row'
import { AppButton } from '@/components/ui/button'
import type { Category } from '@/features/categories/use-categories'
import { motionDurations, motionSprings } from '@/lib/motion'
import { radii } from '@/theme/palette'
import { typography } from '@/theme/typography'
import { useAppTheme } from '@/theme/theme-provider'

interface AllCategoriesSheetProps {
  visible: boolean
  categories: Category[]
  selectedCategoryId: string
  onSelect: (categoryId: string) => void
  onDismiss: () => void
  onCreateNew?: () => void
}

export function AllCategoriesSheet({
  visible,
  categories,
  selectedCategoryId,
  onSelect,
  onDismiss,
  onCreateNew,
}: AllCategoriesSheetProps) {
  const { theme } = useAppTheme()
  const insets = useSafeAreaInsets()
  const { height: screenHeight } = useWindowDimensions()
  const reduceMotion = useReducedMotion()

  const translateY = useSharedValue(screenHeight)
  const backdropOpacity = useSharedValue(0)

  useEffect(() => {
    if (visible) {
      translateY.value = reduceMotion ? 0 : withSpring(0, motionSprings.sheet)
      backdropOpacity.value = reduceMotion
        ? 1
        : withTiming(1, { duration: motionDurations.standard })
    } else {
      translateY.value = reduceMotion
        ? screenHeight
        : withSpring(screenHeight, motionSprings.exit)
      backdropOpacity.value = reduceMotion
        ? 0
        : withTiming(0, { duration: motionDurations.quick })
    }
  }, [visible, reduceMotion, screenHeight, translateY, backdropOpacity])

  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }))

  const backdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }))

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onDismiss}
    >
      <View style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, backdropAnimatedStyle]}>
          <Pressable
            accessibilityLabel="Cerrar lista de categorías"
            accessibilityRole="button"
            onPress={onDismiss}
            style={[styles.backdrop, { backgroundColor: theme.colors.overlay }]}
          />
        </Animated.View>

        <Animated.View
          style={[
            styles.sheet,
            sheetAnimatedStyle,
            {
              backgroundColor: theme.colors.surface,
              paddingBottom: insets.bottom + 16,
              maxHeight: screenHeight * 0.85,
            },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: theme.colors.borderStrong }]} />
          <View style={styles.header}>
            <Text style={[typography.sectionTitle, { color: theme.colors.text }]}>
              Todas las categorías
            </Text>
          </View>
          <ScrollView
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
          >
            {categories.map((category) => (
              <SelectableRow
                key={category.id}
                selected={category.id === selectedCategoryId}
                onPress={() => {
                  onSelect(category.id)
                  onDismiss()
                }}
                title={category.name}
                leading={<CategoryBadge categoryId={category.id} size="md" tone="soft" />}
              />
            ))}
          </ScrollView>
          {onCreateNew ? (
            <View style={styles.footer}>
              <AppButton
                variant="secondary"
                label="＋ Crear categoría"
                onPress={() => {
                  onDismiss()
                  onCreateNew()
                }}
              />
            </View>
          ) : null}
        </Animated.View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    flex: 1,
  },
  sheet: {
    borderTopLeftRadius: radii['2xl'],
    borderTopRightRadius: radii['2xl'],
    paddingTop: 8,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: radii.pill,
    alignSelf: 'center',
    marginBottom: 12,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  list: {
    paddingHorizontal: 16,
    gap: 6,
    paddingBottom: 12,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
})
