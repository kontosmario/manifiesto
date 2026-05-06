import { StyleSheet, Text, View } from 'react-native'
import { useAppTheme } from '@/theme/theme-provider'
import { RiseView } from '@/components/home/animated/rise-view'
import { TextField } from '@/components/ui/text-field'

interface StepWelcomeProps {
  displayName: string
  onChangeDisplayName: (value: string) => void
  isRejoin?: boolean
  closedByOwner?: boolean
}

export function StepWelcome({
  displayName,
  onChangeDisplayName,
  isRejoin = false,
  closedByOwner = false,
}: StepWelcomeProps) {
  const { theme } = useAppTheme()
  const trimmed = displayName.trim()
  const charCount = trimmed.length

  return (
    <View style={styles.stack}>
      <RiseView>
        <Text style={[styles.greeting, { color: theme.colors.text }]}>
          {isRejoin ? 'Hola de nuevo 👋' : 'Hola 👋'}
        </Text>
        <Text style={[styles.subcopy, { color: theme.colors.textMuted }]}>
          Contanos cómo quieres que te llamemos.
        </Text>
      </RiseView>

      {closedByOwner ? (
        // Specific case: the prior family was torn down by its owner.
        // Tone is empathetic, not blame-y — just explain what happened
        // and what's next. Takes precedence over the generic rejoin
        // banner because it's the more specific (and more confusing)
        // situation for the user.
        <RiseView delay={40}>
          <View
            style={[
              styles.rejoinBanner,
              {
                backgroundColor: theme.colors.creamCard,
                borderColor: theme.colors.line,
              },
            ]}
          >
            <Text style={[styles.rejoinText, { color: theme.colors.textMuted }]}>
              El dueño de tu hogar anterior decidió cerrarlo. Tus gastos compartidos quedan allí —
              aquí empiezas un hogar nuevo (propio o sumándote con un código).
            </Text>
          </View>
        </RiseView>
      ) : isRejoin ? (
        <RiseView delay={40}>
          <View
            style={[
              styles.rejoinBanner,
              {
                backgroundColor: theme.colors.creamCard,
                borderColor: theme.colors.line,
              },
            ]}
          >
            <Text style={[styles.rejoinText, { color: theme.colors.textMuted }]}>
              Esperamos que te haya sido agradable la experiencia en tu hogar anterior. A veces los
              grupos cambian — armemos uno nuevo contigo.
            </Text>
          </View>
        </RiseView>
      ) : null}

      <RiseView delay={80}>
        <TextField
          label="Tu nombre"
          value={displayName}
          onChangeText={onChangeDisplayName}
          placeholder="Ej: Mario"
          maxLength={40}
          accessibilityLabel="Tu nombre"
        />
        <View style={styles.helperRow}>
          <Text style={[styles.helper, { color: theme.colors.textMuted }]}>
            Los emojis y caracteres especiales se filtran automáticamente.
          </Text>
          <Text style={[styles.counter, { color: theme.colors.textMuted }]}>{charCount}/40</Text>
        </View>
      </RiseView>
    </View>
  )
}

const styles = StyleSheet.create({
  stack: { gap: 18 },
  greeting: { fontSize: 34, fontWeight: '800', letterSpacing: -1 },
  subcopy: { fontSize: 14, marginTop: 4 },
  helperRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  helper: { flex: 1, fontSize: 11 },
  counter: { fontSize: 11, fontWeight: '700' },
  rejoinBanner: {
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  rejoinText: { fontSize: 14, lineHeight: 20 },
})
