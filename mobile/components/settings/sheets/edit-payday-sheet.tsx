import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ModalCard } from '@/components/ui/modal-card'
import { NeoButton } from '@/components/ui/neo-button'
import { triggerHaptic } from '@/lib/haptics'
import {
  OnbSheetBody,
  OnbSheetDayPicker,
  type OnbSheetCaptionSegment,
} from './onb-sheet-parts'

interface EditPaydaySheetProps {
  visible: boolean
  currentValue: number
  isSaving: boolean
  onClose: () => void
  onSave: (nextValue: number) => void
}

export function EditPaydaySheet({
  visible,
  currentValue,
  isSaving,
  onClose,
  onSave,
}: EditPaydaySheetProps) {
  const { t } = useTranslation()
  const [selected, setSelected] = useState(currentValue)

  useEffect(() => {
    if (visible) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Hydrate draft when sheet opens
      setSelected(currentValue)
    }
  }, [visible, currentValue])

  const canSave = useMemo(
    () => selected >= 1 && selected <= 31 && selected !== currentValue,
    [selected, currentValue],
  )

  const caption = useMemo<OnbSheetCaptionSegment[]>(
    () => [
      { text: t('onboarding:redesign.ingresos.capMensualPrefix') },
      { text: t('onboarding:redesign.ingresos.capMensualAccent', { dia: selected }), accent: true },
      { text: t('onboarding:redesign.ingresos.capMensualSuffix', { dia: selected }) },
    ],
    [selected, t],
  )

  return (
    <ModalCard
      skin="neo"
      onClose={onClose}
      subtitle={t('settings:editPayday.subtitle')}
      title={t('settings:editPayday.title')}
      visible={visible}
      footer={
        <NeoButton
          block
          disabled={!canSave}
          haptic="light"
          label={t('settings:editPayday.saveDay', { day: selected })}
          loading={isSaving}
          onPress={() => {
            if (!canSave) return
            onSave(selected)
          }}
        />
      }
    >
      <OnbSheetBody>
        <OnbSheetDayPicker
          caption={caption}
          onSelect={(day) => {
            void triggerHaptic('selection')
            setSelected(day)
          }}
          selected={selected}
        />
      </OnbSheetBody>
    </ModalCard>
  )
}
