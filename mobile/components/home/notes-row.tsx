import { useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated'
import { MaterialIcons } from '@expo/vector-icons'
import { EXPENSE_NOTES_MAX_LENGTH } from '@/features/expenses/expense-repository.model'
import { useAppTheme } from '@/theme/theme-provider'

interface NotesRowProps {
  /** Current note value. Empty string when not set; we never carry
   *  `null` in UI state to keep TextInput controlled. */
  notes: string
  onChange: (value: string) => void
  onFocus?: () => void
}

/**
 * Optional notes field for the add-expense form. Collapsed by default
 * — a single "+ Agregar nota" affordance — because most expenses are
 * quick and the user does not need to see a textarea every time.
 *
 * When expanded, renders a multiline TextInput with a character
 * counter and a discreet "X" to collapse back (also clears the note,
 * so the affordance doubles as a discard button when the user
 * decided not to add context).
 *
 * Mounted via `LinearTransition` on the parent so the height change
 * animates smoothly into the form layout instead of popping.
 */
export function NotesRow({ notes, onChange, onFocus }: NotesRowProps) {
  const { theme } = useAppTheme()
  // Auto-expand when the user already has a draft note (e.g. came back
  // from another screen / editing an existing expense). Otherwise the
  // user has to opt into expanding it.
  const [expanded, setExpanded] = useState(notes.length > 0)

  const handleCollapse = () => {
    if (notes.length > 0) onChange('')
    setExpanded(false)
  }

  const remaining = EXPENSE_NOTES_MAX_LENGTH - notes.length
  const counterTone = remaining < 50 ? theme.colors.danger : theme.colors.textMuted

  return (
    <Animated.View layout={LinearTransition.duration(220)} style={styles.root}>
      {!expanded ? (
        <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)}>
          <Pressable
            onPress={() => setExpanded(true)}
            accessibilityRole="button"
            accessibilityLabel="Agregar una nota a este gasto"
            style={({ pressed }) => [
              styles.addPill,
              {
                borderColor: theme.colors.line,
                backgroundColor: theme.colors.surfaceMuted,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <MaterialIcons name="edit-note" size={18} color={theme.colors.textMuted} />
            <Text style={[styles.addPillLabel, { color: theme.colors.textMuted }]}>
              Agregar nota
            </Text>
            <Text style={[styles.addPillHint, { color: theme.colors.textSoft }]}>
              opcional
            </Text>
          </Pressable>
        </Animated.View>
      ) : (
        <Animated.View
          entering={FadeIn.duration(180)}
          exiting={FadeOut.duration(120)}
          style={styles.expanded}
        >
          <View style={styles.headerRow}>
            <Text style={[styles.label, { color: theme.colors.textMuted }]}>
              NOTA
            </Text>
            <Pressable
              onPress={handleCollapse}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Cerrar nota"
              style={({ pressed }) => [
                styles.closeButton,
                { opacity: pressed ? 0.5 : 1 },
              ]}
            >
              <MaterialIcons name="close" size={16} color={theme.colors.textSoft} />
            </Pressable>
          </View>
          <TextInput
            value={notes}
            onChangeText={onChange}
            onFocus={onFocus}
            placeholder="Ej: pagado con tarjeta de mamá, se lo devuelvo el lunes"
            placeholderTextColor={theme.colors.textSoft}
            multiline
            numberOfLines={3}
            maxLength={EXPENSE_NOTES_MAX_LENGTH}
            textAlignVertical="top"
            style={[
              styles.input,
              {
                backgroundColor: theme.colors.surfaceMuted,
                borderColor: theme.colors.line,
                color: theme.colors.text,
              },
            ]}
          />
          <Text style={[styles.counter, { color: counterTone }]}>
            {notes.length}/{EXPENSE_NOTES_MAX_LENGTH}
          </Text>
        </Animated.View>
      )}
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  root: {
    gap: 8,
  },
  addPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
  },
  addPillLabel: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  addPillHint: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  expanded: {
    gap: 6,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  label: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  closeButton: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  input: {
    minHeight: 72,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 14,
    lineHeight: 19,
  },
  counter: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'right',
    paddingHorizontal: 4,
  },
})
