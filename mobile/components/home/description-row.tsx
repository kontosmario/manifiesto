import { ScrollView, StyleSheet, View } from 'react-native'
import { Chip } from '@/components/ui/chip'
import { TextField } from '@/components/ui/text-field'

interface DescriptionRowProps {
  description: string
  onChange: (value: string) => void
  quickSuggestions: string[]
  onSelectSuggestion: (value: string) => void
  onFocus?: () => void
}

export function DescriptionRow({
  description,
  onChange,
  quickSuggestions,
  onSelectSuggestion,
  onFocus,
}: DescriptionRowProps) {
  return (
    <View style={styles.root}>
      <TextField
        label="Descripción"
        autoCapitalize="sentences"
        autoCorrect={false}
        maxLength={60}
        onChangeText={onChange}
        onFocus={onFocus}
        placeholder="Ej: Supermercado"
        returnKeyType="done"
        value={description}
      />
      {quickSuggestions.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          style={styles.suggestionsScroll}
          contentContainerStyle={styles.suggestionsRow}
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
  root: {
    gap: 8,
  },
  suggestionsScroll: {
    marginHorizontal: -20,
    flexGrow: 0,
  },
  suggestionsRow: {
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 6,
    alignItems: 'center',
  },
})
