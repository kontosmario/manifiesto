import { useState } from 'react'
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { Chip } from '@/components/ui/chip'
import { InputGroup } from '@/components/ui/input-group'
import { TextField } from '@/components/ui/text-field'
import { AppSymbol } from '@/components/ui/app-symbol'
import { triggerHaptic } from '@/lib/haptics'
import { radii } from '@/theme/palette'
import { typography } from '@/theme/typography'
import { useAppTheme } from '@/theme/theme-provider'

interface DescriptionRowProps {
  description: string
  onChange: (value: string) => void
  quickSuggestions: string[]
  onSelectSuggestion: (value: string) => void
}

export function DescriptionRow({
  description,
  onChange,
  quickSuggestions,
  onSelectSuggestion,
}: DescriptionRowProps) {
  const { theme } = useAppTheme()
  const [expanded, setExpanded] = useState(description.trim().length > 0)

  const handleExpand = () => {
    void triggerHaptic('selection')
    setExpanded(true)
  }

  const handleBlur = () => {
    if (description.trim().length === 0) {
      setExpanded(false)
    }
  }

  if (!expanded) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Agregar descripción opcional"
        onPress={handleExpand}
        style={({ pressed }) => [
          styles.collapsed,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
            opacity: pressed ? 0.94 : 1,
          },
        ]}
      >
        <AppSymbol name="plus" fallback="add" size={16} color={theme.colors.textMuted} />
        <Text style={[typography.bodySmall, { color: theme.colors.textMuted }]}>
          Agregar descripción (opcional)
        </Text>
      </Pressable>
    )
  }

  return (
    <View style={styles.expanded}>
      <InputGroup label="Descripción">
        <TextField
          label=""
          autoCapitalize="sentences"
          autoCorrect={false}
          autoFocus
          maxLength={60}
          onChangeText={onChange}
          onBlur={handleBlur}
          placeholder="Ej: Supermercado"
          returnKeyType="done"
          value={description}
        />
      </InputGroup>
      {quickSuggestions.length > 0 ? (
        <ScrollView
          contentContainerStyle={styles.suggestionsRow}
          horizontal
          showsHorizontalScrollIndicator={false}
        >
          {quickSuggestions.map((suggestion) => (
            <Chip
              key={suggestion}
              compact
              label={suggestion}
              onPress={() => onSelectSuggestion(suggestion)}
            />
          ))}
        </ScrollView>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  collapsed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 44,
  },
  expanded: {
    gap: 8,
  },
  suggestionsRow: {
    gap: 6,
    paddingHorizontal: 2,
  },
})
