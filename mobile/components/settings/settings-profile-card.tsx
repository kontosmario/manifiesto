import { useMemo, useState } from 'react'
import { AppButton } from '@/components/ui/button'
import { BrandedPanel } from '@/components/ui/branded-panel'
import { SectionHeader } from '@/components/ui/section-header'
import { TextField } from '@/components/ui/text-field'
import {
  buildProfileDraftState,
  canSaveProfileDraft,
} from '@/features/settings/settings-form.model'

interface SettingsProfileCardProps {
  displayName: string
  isSaving: boolean
  onSave: (displayName: string) => void
}

export function SettingsProfileCard({
  displayName,
  isSaving,
  onSave,
}: SettingsProfileCardProps) {
  const [displayNameDraft, setDisplayNameDraft] = useState(
    () => buildProfileDraftState(displayName).displayNameDraft,
  )
  const canSaveProfile = useMemo(
    () => canSaveProfileDraft({ displayName, draft: displayNameDraft }),
    [displayName, displayNameDraft],
  )

  return (
    <BrandedPanel style={{ gap: 18 }}>
      <SectionHeader subtitle="Cómo aparecés en gastos, actividad y perfil." title="Perfil" />
      <TextField
        helper="Este nombre se usa en actividad, historial y resúmenes compartidos."
        label="Nombre visible"
        onChangeText={setDisplayNameDraft}
        placeholder="Tu nombre visible"
        value={displayNameDraft}
      />
      <AppButton
        disabled={!canSaveProfile}
        label="Guardar nombre"
        loading={isSaving}
        onPress={() => onSave(displayNameDraft)}
      />
    </BrandedPanel>
  )
}
