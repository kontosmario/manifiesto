import { StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useTranslation } from 'react-i18next'
import { useAppTheme } from '@/theme/theme-provider'
import { RiseView } from '@/components/home/animated/rise-view'
import { CardParticles } from '@/components/ui/card-particles'
import { TextField } from '@/components/ui/text-field'
import { radii } from '@/theme/palette'

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
  const { t } = useTranslation()
  const trimmed = displayName.trim()
  const charCount = trimmed.length

  return (
    <View style={styles.stack}>
      {/*
        Banda hero de marca — el momento "la app te da la bienvenida". Primer
        pantalla del wizard (rara, first-time → vale el delight). Mismo lenguaje
        que las hero cards de Home/Fijos: gradiente forest (mode-invariante) +
        luciérnagas + texto crema (heroText/heroMuted). Las partículas se ven
        porque la superficie es OSCURA (sobre crema serían invisibles).
      */}
      <RiseView>
        <View style={styles.heroBand}>
          <LinearGradient
            colors={
              [...theme.colors.heroGradient] as unknown as readonly [
                string,
                string,
                ...string[],
              ]
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
          <CardParticles count={8} accentColor="#F2A78C" />
          <Text style={[styles.greeting, { color: theme.colors.heroText }]}>
            {isRejoin ? t('onboarding:welcome.greetingRejoin') : t('onboarding:welcome.greeting')}
          </Text>
          <Text style={[styles.subcopy, { color: theme.colors.heroMuted }]}>
            {t('onboarding:welcome.subcopy')}
          </Text>
        </View>
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
              {t('onboarding:welcome.closedByOwnerBanner')}
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
              {t('onboarding:welcome.rejoinBanner')}
            </Text>
          </View>
        </RiseView>
      ) : null}

      <RiseView delay={80}>
        <TextField
          label={t('onboarding:welcome.nameLabel')}
          value={displayName}
          onChangeText={onChangeDisplayName}
          placeholder={t('onboarding:welcome.namePlaceholder')}
          maxLength={40}
          accessibilityLabel={t('onboarding:welcome.nameLabel')}
        />
        <View style={styles.helperRow}>
          <Text style={[styles.helper, { color: theme.colors.textMuted }]}>
            {t('onboarding:welcome.nameHelper')}
          </Text>
          <Text style={[styles.counter, { color: theme.colors.textMuted }]}>{charCount}/40</Text>
        </View>
      </RiseView>
    </View>
  )
}

const styles = StyleSheet.create({
  stack: { gap: 18 },
  heroBand: {
    borderRadius: radii.xl,
    overflow: 'hidden',
    paddingHorizontal: 20,
    paddingVertical: 22,
    gap: 6,
  },
  greeting: { fontSize: 30, fontWeight: '800', letterSpacing: -1 },
  subcopy: { fontSize: 14, lineHeight: 19 },
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
    borderRadius: radii.md,
    borderWidth: 1,
  },
  rejoinText: { fontSize: 14, lineHeight: 20 },
})
