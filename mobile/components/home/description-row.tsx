import { ScrollView, StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Chip } from '@/components/ui/chip'
import { TextField } from '@/components/ui/text-field'

interface DescriptionRowProps {
  description: string
  onChange: (value: string) => void
  quickSuggestions: string[]
  onSelectSuggestion: (value: string) => void
  onFocus?: () => void
  /** Forwards to the underlying `TextField`'s warning mode so callers
   *  can mark "descripción" as a required field that's currently empty
   *  without the row wrapping itself in extra chrome. */
  warning?: boolean
}

export function DescriptionRow({
  description,
  onChange,
  quickSuggestions,
  onSelectSuggestion,
  onFocus,
  warning = false,
}: DescriptionRowProps) {
  const { t } = useTranslation()
  return (
    <View style={styles.root}>
      <TextField
        label={t('home:descriptionRow.label')}
        autoCapitalize="sentences"
        autoCorrect={false}
        maxLength={60}
        onChangeText={onChange}
        onFocus={onFocus}
        placeholder={t('home:descriptionRow.placeholder')}
        returnKeyType="done"
        value={description}
        warning={warning}
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
