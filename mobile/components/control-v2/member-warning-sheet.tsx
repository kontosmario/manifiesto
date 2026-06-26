import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { AppButton } from '@/components/ui/button'
import { ModalCard } from '@/components/ui/modal-card'
import { TextField } from '@/components/ui/text-field'
import { AvatarAnimal } from '@/components/ui/avatar-animal'
import { isAvatarSlug, type AvatarSlug } from '@/assets/avatars'
import { useAppTheme } from '@/theme/theme-provider'

interface MemberWarningSheetProps {
  visible: boolean
  /** Display name of the family member receiving the warning. */
  targetDisplayName: string | null
  /** Avatar slug for the target member, if available. */
  targetAvatarSlug: AvatarSlug | null
  /** Initial message body. The user can edit it before sending. */
  initialMessage: string
  isSending: boolean
  onClose: () => void
  /**
   * Fires when the user taps "Enviar". The dispatcher runs the
   * mutation and closes the sheet on success.
   */
  onSubmit: (message: string) => void
  /** When true, render inline (no native `<Modal>`). See ModalCard. */
  inline?: boolean
}

const MAX_LENGTH = 240

/**
 * Confirmation sheet for the advisor's `send-member-warning` flow.
 * Replaces the previous `Alert.alert(…)` confirmation:
 *
 *   · Shows the recipient (avatar + display name) so the sender
 *     knows exactly who gets pinged.
 *   · Lets the sender tweak the message — sometimes the suggested
 *     copy is too direct, or the relationship calls for warmer
 *     framing.
 *   · Soft 240-char cap matching the underlying notification's
 *     body field; counter shown when the user starts editing.
 *   · The "Enviar aviso" CTA mirrors the rest of the app's primary
 *     action language.
 */
export function MemberWarningSheet({
  visible,
  targetDisplayName,
  targetAvatarSlug,
  initialMessage,
  isSending,
  onClose,
  onSubmit,
  inline,
}: MemberWarningSheetProps) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  const [draft, setDraft] = useState(initialMessage)

  useEffect(() => {
    if (!visible) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate draft when sheet opens
    setDraft(initialMessage)
  }, [visible, initialMessage])

  const trimmed = draft.trim()
  const isValid = trimmed.length > 0 && trimmed.length <= MAX_LENGTH
  const showCounter = draft.length > MAX_LENGTH * 0.6
  const remaining = MAX_LENGTH - draft.length
  const slug = targetAvatarSlug && isAvatarSlug(targetAvatarSlug) ? targetAvatarSlug : null

  return (
    <ModalCard
      visible={visible}
      onClose={onClose}
      inline={inline}
      title={t('control:memberWarning.title')}
      subtitle={t('control:memberWarning.subtitle')}
    >
      <View style={styles.body}>
        <View
          style={[
            styles.recipientCard,
            {
              backgroundColor: theme.colors.surfaceMuted,
              borderColor: theme.colors.border,
            },
          ]}
        >
          {slug ? (
            <AvatarAnimal slug={slug} size={42} />
          ) : (
            <View
              style={[
                styles.avatarFallback,
                {
                  backgroundColor: theme.isDark
                    ? theme.colors.creamCard
                    : theme.colors.creamSoft,
                },
              ]}
            >
              <Text style={[styles.avatarFallbackText, { color: theme.colors.text }]}>
                {(targetDisplayName ?? '?').slice(0, 1).toUpperCase()}
              </Text>
            </View>
          )}
          <View style={styles.recipientCopy}>
            <Text style={[styles.recipientEyebrow, { color: theme.colors.textMuted }]}>
              {t('control:memberWarning.enviarA')}
            </Text>
            <Text
              style={[styles.recipientName, { color: theme.colors.text }]}
              numberOfLines={1}
            >
              {targetDisplayName ?? t('control:memberWarning.miembroFallback')}
            </Text>
          </View>
        </View>

        {/* Use the canonical `TextField` so the input animates its
            border (line → primary, 1 → 2px) on focus and matches the
            rest of the input system. The eyebrow ("MENSAJE") is the
            field's own label prop. */}
        <TextField
          label={t('control:memberWarning.labelMensaje')}
          value={draft}
          onChangeText={setDraft}
          placeholder={t('control:memberWarning.placeholderMensaje')}
          multiline
          maxLength={MAX_LENGTH + 40}
          accessibilityLabel={t('control:memberWarning.a11yMensaje')}
          style={styles.inputBody}
          helper={
            showCounter
              ? remaining < 0
                ? t('control:memberWarning.counterOver', {
                    count: Math.abs(remaining),
                  })
                : t('control:memberWarning.counterRemaining', { count: remaining })
              : undefined
          }
        />
        {showCounter && remaining < 0 ? (
          <Text style={[styles.counterError, { color: theme.colors.danger }]}>
            {t('control:memberWarning.counterTrim')}
          </Text>
        ) : null}

        <Text
          style={[styles.helper, { color: theme.colors.textMuted }]}
        >
          {t('control:memberWarning.helper')}
        </Text>

        <AppButton
          variant="primary"
          label={t('control:memberWarning.cta')}
          loading={isSending}
          disabled={!isValid}
          onPress={() => {
            if (!isValid) return
            onSubmit(trimmed)
          }}
        />
      </View>
    </ModalCard>
  )
}

const styles = StyleSheet.create({
  body: {
    gap: 14,
  },
  recipientCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  avatarFallback: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackText: {
    fontSize: 18,
    fontWeight: '700',
  },
  recipientCopy: {
    flex: 1,
  },
  recipientEyebrow: {
    fontSize: 10,
    letterSpacing: 1.4,
    fontWeight: '800',
    marginBottom: 2,
  },
  recipientName: {
    fontSize: 16,
    fontWeight: '700',
  },
  // Forwarded into TextField's inner `<TextInput>` so the multiline
  // editor stretches the wrap (which uses `alignItems: 'stretch'`).
  inputBody: {
    minHeight: 96,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '500',
  },
  counterError: {
    fontSize: 11,
    fontWeight: '600',
  },
  helper: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },
})
