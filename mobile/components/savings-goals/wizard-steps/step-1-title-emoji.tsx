import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { TextField } from '@/components/ui/text-field'
import { typography } from '@/theme/typography'
import { useAppTheme } from '@/theme/theme-provider'

export const EMOJI_PALETTE = [
  '🎯', '✈️', '🏠', '🚗',
  '🎓', '💍', '🌅', '💻',
  '🎁', '🏖️', '📱', '💰',
] as const

export const MAX_TITLE = 40

export interface Step1TitleProps {
  title: string
  onChangeTitle: (v: string) => void
  selectedEmoji: string
  onSelectEmoji: (emoji: string) => void
}

export function Step1Title({
  title,
  onChangeTitle,
  selectedEmoji,
  onSelectEmoji,
}: Step1TitleProps) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  return (
    <View style={styles.step1Body}>
      <TextField
        label={t('settings:savingsWizard.nameLabel')}
        value={title}
        onChangeText={(v) => onChangeTitle(v.slice(0, MAX_TITLE))}
        placeholder={t('settings:savingsWizard.namePlaceholder')}
        autoCapitalize="sentences"
        // autoFocus removido a propósito: el teclado nativo en iOS
        // empujaba el sheet entero. Con KeyboardAvoidingView wrap +
        // tap-to-focus el flow se siente más controlado y no flashea.
        accessibilityLabel={t('settings:savingsWizard.nameLabel')}
        helper={`${title.length}/${MAX_TITLE}`}
      />

      <View
        style={[styles.divider, { backgroundColor: theme.colors.line }]}
      />

      <View style={styles.emojiSection}>
        <Text
          style={[typography.eyebrow, { color: theme.colors.textMuted }]}
        >
          {t('settings:savingsWizard.chooseIcon')}
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.emojiScroll}
          contentContainerStyle={styles.emojiScrollContent}
          accessibilityLabel={t('settings:savingsWizard.iconScrollA11y')}
        >
          {EMOJI_PALETTE.map((glyph) => {
            const isActive = glyph === selectedEmoji
            return (
              <Pressable
                key={glyph}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
                accessibilityLabel={t('settings:savingsWizard.iconA11y', { glyph })}
                onPress={() => onSelectEmoji(glyph)}
                style={({ pressed }) => [
                  styles.emojiCard,
                  {
                    backgroundColor: isActive
                      ? theme.colors.primarySurface
                      : theme.isDark
                        ? 'rgba(255,255,255,0.04)'
                        : 'rgba(15,42,30,0.04)',
                    borderColor: isActive
                      ? theme.colors.primary
                      : theme.colors.line,
                    borderWidth: isActive ? 2 : 1,
                    opacity: pressed ? 0.78 : 1,
                  },
                ]}
              >
                <Text style={styles.emojiGlyph}>{glyph}</Text>
              </Pressable>
            )
          })}
        </ScrollView>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  step1Body: {
    gap: 16,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  emojiSection: {
    gap: 10,
  },
  // Single-row horizontal scroll — pedido del owner. 12 emojis no
  // entran en ancho de pantalla; ScrollView horizontal mantiene
  // todos visibles deslizando lateral.
  emojiScroll: {
    flexGrow: 0,
  },
  emojiScrollContent: {
    gap: 10,
    paddingVertical: 2,
    paddingHorizontal: 2,
  },
  emojiCard: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiGlyph: {
    fontSize: 26,
    lineHeight: 32,
  },
})
