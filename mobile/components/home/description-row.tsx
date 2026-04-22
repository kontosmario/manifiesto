import { ScrollView, StyleSheet, View } from 'react-native'
import { Chip } from '@/components/ui/chip'
import { InputGroup } from '@/components/ui/input-group'
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
      <InputGroup label="Descripción">
        <TextField
          label=""
          autoCapitalize="sentences"
          autoCorrect={false}
          maxLength={60}
          onChangeText={onChange}
          onFocus={onFocus}
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
  root: {
    gap: 8,
  },
  suggestionsRow: {
    gap: 6,
    paddingHorizontal: 2,
  },
})
