import { useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import {
  AVATAR_SLUGS,
  isAvatarSlug,
  type AvatarSlug,
} from '@/assets/avatars'
import { useTranslation } from 'react-i18next'
import { StepAvatar } from '@/components/home/onboarding/step-avatar'
import { AppButton } from '@/components/ui/button'
import { ModalCard } from '@/components/ui/modal-card'

interface EditAvatarSheetProps {
  visible: boolean
  currentSlug: string | null
  isSaving: boolean
  onClose: () => void
  onSave: (slug: AvatarSlug) => void
}

const FALLBACK_SLUG: AvatarSlug = AVATAR_SLUGS[0]!

function coerceSlug(raw: string | null): AvatarSlug {
  if (raw && isAvatarSlug(raw)) return raw
  return FALLBACK_SLUG
}

export function EditAvatarSheet({
  visible,
  currentSlug,
  isSaving,
  onClose,
  onSave,
}: EditAvatarSheetProps) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<AvatarSlug>(() => coerceSlug(currentSlug))

  useEffect(() => {
    if (visible) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Hydrate draft when sheet opens
      setDraft(coerceSlug(currentSlug))
    }
  }, [visible, currentSlug])

  const hasChanged = draft !== coerceSlug(currentSlug)

  return (
    <ModalCard
      onClose={onClose}
      subtitle={t('settings:editAvatar.subtitle')}
      title={t('settings:editAvatar.title')}
      visible={visible}
      footer={
        <AppButton
          disabled={!hasChanged}
          label={t('settings:editAvatar.save')}
          loading={isSaving}
          onPress={() => {
            if (!hasChanged) return
            onSave(draft)
          }}
        />
      }
    >
      <View style={styles.stack}>
        <StepAvatar selected={draft} onSelect={setDraft} />
      </View>
    </ModalCard>
  )
}

const styles = StyleSheet.create({
  stack: { gap: 16 },
})
