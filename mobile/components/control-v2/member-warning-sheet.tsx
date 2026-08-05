import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { ModalCard } from '@/components/ui/modal-card'
import { NeoButton } from '@/components/ui/neo-button'
import { NeoSurface } from '@/components/ui/neo-surface'
import { NeoField } from '@/components/control-v2/neo-field'
import { SUPPORTS_INSET_SHADOW } from '@/components/wizard/inset-shadow-support'
import { AvatarAnimal } from '@/components/ui/avatar-animal'
import { isAvatarSlug, type AvatarSlug } from '@/assets/avatars'
import { neoRadii, neoTokens } from '@/theme/neo-tokens'
import { nunitoFamily } from '@/theme/typography'
import { useThemeTokens } from '@/theme/theme-provider'

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
 *
 * Rediseño 2026-07: la carcasa la pinta `ModalCard skin="neo"` (hoja
 * `neo.sheet`, esquinas 34, sombra hacia arriba, píldora 44×5 y scrim del
 * tema). Este archivo sólo aporta el CONTENIDO.
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
  const theme = useThemeTokens()
  const neo = neoTokens(theme.mode)
  const isDark = theme.mode === 'dark'
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
  const isOver = showCounter && remaining < 0

  // `neo.danger` (#C25B33) se calibró para bordes, anillos y fills (les
  // alcanza 3:1); como TINTA de 11px sobre la hoja clara da ~3.6:1, abajo de
  // AA. Se usa la variante oscurecida del sistema — el mismo patrón que
  // `accentClayInk` en la piel de fijos. En oscuro el token ya cumple.
  const dangerInk = isDark ? neo.danger : '#9A421F'

  // Android < API 28/29 descarta el boxShadow EN SILENCIO. El pozo del avatar
  // se lee SÓLO por su relieve (su fill es casi el de la card), así que ahí
  // cae un hairline.
  const flatFallback = SUPPORTS_INSET_SHADOW
    ? null
    : { borderWidth: 1, borderColor: theme.colors.border }

  return (
    <ModalCard
      visible={visible}
      onClose={onClose}
      inline={inline}
      skin="neo"
      title={t('control:memberWarning.title')}
      subtitle={t('control:memberWarning.subtitle')}
    >
      {/* Card de destinatario = escalón MEDIO de relieve: es contexto de la
          acción, no la acción. Sin hairline — el relieve la separa sola. */}
      <NeoSurface
        variant="raisedMd"
        radius={neoRadii.card}
        style={styles.recipientCard}
      >
        {slug ? (
          <AvatarAnimal slug={slug} size={42} />
        ) : (
          <View
            style={[
              styles.avatarFallback,
              {
                // Los cremas V1 no existen en la paleta neo: el placeholder
                // del avatar es un POZO.
                backgroundColor: neo.well,
                boxShadow: neo.shadows.insetSm,
              },
              flatFallback,
            ]}
          >
            <Text style={[styles.avatarFallbackText, { color: neo.text }]}>
              {(targetDisplayName ?? '?').slice(0, 1).toUpperCase()}
            </Text>
          </View>
        )}
        <View style={styles.recipientCopy}>
          <Text style={[styles.recipientEyebrow, { color: neo.textMuted }]}>
            {t('control:memberWarning.enviarA')}
          </Text>
          <Text
            style={[styles.recipientName, { color: neo.text }]}
            numberOfLines={1}
          >
            {targetDisplayName ?? t('control:memberWarning.miembroFallback')}
          </Text>
        </View>
      </NeoSurface>

      {/* El input del rediseño es un POZO y el foco se marca con el anillo
          verde del sistema: el borde animado `line → primary` (1 → 2px) de
          `TextField` no tiene equivalente en el vocabulario neo. El eyebrow
          ("MENSAJE") sigue siendo el `label` del propio campo. */}
      <NeoField
        label={t('control:memberWarning.labelMensaje')}
        depth="insetLg"
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
        helperTone={isOver ? 'danger' : 'muted'}
      />
      {isOver ? (
        <Text style={[styles.counterError, { color: dangerInk }]}>
          {t('control:memberWarning.counterTrim')}
        </Text>
      ) : null}

      <Text style={[styles.helper, { color: neo.textMuted }]}>
        {t('control:memberWarning.helper')}
      </Text>

      <NeoButton
        variant="primary"
        block
        label={t('control:memberWarning.cta')}
        busy={isSending}
        disabled={!isValid}
        onPress={() => {
          if (!isValid) return
          onSubmit(trimmed)
        }}
      />
    </ModalCard>
  )
}

const styles = StyleSheet.create({
  recipientCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  avatarFallback: {
    width: 42,
    height: 42,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackText: {
    fontSize: 18,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
  },
  recipientCopy: {
    flex: 1,
  },
  recipientEyebrow: {
    fontSize: 11,
    letterSpacing: 1.76,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    marginBottom: 2,
  },
  recipientName: {
    fontSize: 16,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
  },
  // Forwarded into NeoField's inner `<TextInput>` so the multiline editor
  // stretches the well.
  inputBody: {
    minHeight: 96,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '600',
    fontFamily: nunitoFamily('600'),
  },
  counterError: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
  },
  helper: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    fontFamily: nunitoFamily('500'),
  },
})
