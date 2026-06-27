import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import * as Haptics from 'expo-haptics'
import { useTranslation } from 'react-i18next'
import { useAppTheme } from '@/theme/theme-provider'
import { getIntlLocale } from '@/lib/i18n/active-locale'
import type { AppTheme } from '@/theme/palette'
import type {
  Classification,
  IntentKind,
} from '@/features/subscriptions-zombie/types'

interface Props {
  classification: Classification
  fijoName: string
  fijoAmount: number
  monthsObserved: number
  onDeclareIntent: (intent: IntentKind) => void
  onIgnore: () => void
}

export function ClassificationCard({
  classification,
  fijoName,
  fijoAmount,
  monthsObserved,
  onDeclareIntent,
  onIgnore,
}: Props) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  const cardBg = theme.isDark ? theme.colors.surfaceMuted : theme.colors.creamCard

  if (classification === 'uso_desigual') {
    return (
      <View style={[styles.card, { backgroundColor: cardBg }]}>
        <Text style={[styles.title, { color: theme.colors.text }]} numberOfLines={2}>
          {fijoName}
        </Text>
        <Text style={[styles.body, { color: theme.colors.textMuted }]}>
          {t('insights:subscriptions.classification.unevenBody')}
        </Text>
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('insights:subscriptions.classification.unevenOk')}
            style={({ pressed }) => [
              styles.btnSecondary,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.line,
              },
              pressed && styles.btnPressed,
            ]}
            onPress={onIgnore}
          >
            <Text style={[styles.btnSecondaryText, { color: theme.colors.text }]}>
              {t('insights:subscriptions.classification.unevenOk')}
            </Text>
          </Pressable>
        </View>
      </View>
    )
  }

  if (classification !== 'zombie_consensuado') return null

  const total = fijoAmount * Math.max(monthsObserved, 1)

  return (
    <View style={[styles.card, { backgroundColor: cardBg }]}>
      <Text style={[styles.title, { color: theme.colors.text }]}>{fijoName}</Text>
      <Text style={[styles.body, { color: theme.colors.textMuted }]}>
        {t('insights:subscriptions.classification.consensusBody', {
          count: monthsObserved,
          total: `$${total.toLocaleString(getIntlLocale())}`,
        })}
      </Text>
      <Text style={[styles.q, { color: theme.colors.text }]}>
        {t('insights:subscriptions.classification.consensusQuestion')}
      </Text>
      <View style={styles.actionsCol}>
        <ActionButton
          label={t('insights:subscriptions.classification.cancel')}
          variant="primary"
          theme={theme}
          onPress={() => {
            void Haptics.notificationAsync(
              Haptics.NotificationFeedbackType.Warning,
            )
            onDeclareIntent('cancel')
          }}
        />
        <ActionButton
          label={t('insights:subscriptions.classification.pause')}
          theme={theme}
          onPress={() => onDeclareIntent('pause')}
        />
        <ActionButton
          label={t('insights:subscriptions.classification.downgrade')}
          theme={theme}
          onPress={() => onDeclareIntent('downgrade')}
        />
        <ActionButton
          label={t('insights:subscriptions.classification.keep')}
          variant="ghost"
          theme={theme}
          onPress={onIgnore}
        />
      </View>
    </View>
  )
}

interface ActionButtonProps {
  label: string
  variant?: 'primary' | 'secondary' | 'ghost'
  theme: AppTheme
  onPress: () => void
}

function ActionButton({
  label,
  variant = 'secondary',
  theme,
  onPress,
}: ActionButtonProps) {
  const fillStyle =
    variant === 'primary'
      ? { backgroundColor: theme.colors.primary }
      : variant === 'secondary'
        ? {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.line,
          }
        : null
  const textColor =
    variant === 'primary'
      ? theme.colors.textOnPrimary
      : variant === 'ghost'
        ? theme.colors.textMuted
        : theme.colors.text

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.btnBase,
        variant === 'primary' && styles.btnPrimary,
        variant === 'secondary' && styles.btnSecondary,
        variant === 'ghost' && styles.btnGhost,
        fillStyle,
        pressed && styles.btnPressed,
      ]}
    >
      <Text
        style={[
          variant === 'primary'
            ? styles.btnPrimaryText
            : variant === 'ghost'
              ? styles.btnGhostText
              : styles.btnSecondaryText,
          { color: textColor },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 16,
    gap: 8,
  },
  title: { fontSize: 16, fontWeight: '700' },
  body: { fontSize: 14, lineHeight: 20 },
  q: { fontSize: 15, fontWeight: '600', marginTop: 8 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  actionsCol: { flexDirection: 'column', gap: 8, marginTop: 4 },
  btnBase: {
    minHeight: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  btnPrimary: {},
  btnPrimaryText: { fontWeight: '700', fontSize: 14 },
  btnSecondary: {
    borderWidth: 1,
  },
  btnSecondaryText: { fontWeight: '600', fontSize: 14 },
  btnGhost: { backgroundColor: 'transparent' },
  btnGhostText: { fontWeight: '500', fontSize: 13 },
  btnPressed: { opacity: 0.7, transform: [{ scale: 0.98 }] },
})
