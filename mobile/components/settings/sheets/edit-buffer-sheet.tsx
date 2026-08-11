import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ModalCard } from '@/components/ui/modal-card'
import { NeoButton } from '@/components/ui/neo-button'
import type { BufferMode } from '@/features/settings/settings-form.model'
import { triggerHaptic } from '@/lib/haptics'
import { currencyFormatter } from '@/utils/money'
import {
  OnbSheetAmountCard,
  OnbSheetBody,
  OnbSheetHelper,
  OnbSheetPercentCard,
  OnbSheetTileGrid,
  type OnbSheetTile,
} from './onb-sheet-parts'

interface EditBufferSheetProps {
  visible: boolean
  currentMode: BufferMode
  currentValue: number
  isSaving: boolean
  onClose: () => void
  onSave: (nextMode: BufferMode, nextValue: number) => void
}

const MODE_KEYS: BufferMode[] = ['none', 'fixed', 'percent']
const MAX_BUFFER_PERCENT = 100
/** Mismos atajos que el paso de ahorro del onboarding. */
const PERCENT_CHIPS = [0, 5, 10, 20, 30] as const

/**
 * El onboarding no tiene un paso de colchón diario, así que la hoja se
 * compone con sus mismas primitivas: tiles de elección del paso de
 * ingresos + la card de monto / el panel de % con su numpad.
 */
export function EditBufferSheet({
  visible,
  currentMode,
  currentValue,
  isSaving,
  onClose,
  onSave,
}: EditBufferSheetProps) {
  const { t } = useTranslation()
  const [mode, setMode] = useState<BufferMode>(currentMode)
  const [draft, setDraft] = useState(() => Math.max(0, Math.round(currentValue)))

  useEffect(() => {
    if (visible) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Hydrate draft when sheet opens
      setMode(currentMode)
      setDraft(Math.max(0, Math.round(currentValue)))
    }
  }, [visible, currentMode, currentValue])

  const value = mode === 'none' ? 0 : draft
  const isValid = mode !== 'percent' || (draft >= 0 && draft <= MAX_BUFFER_PERCENT)
  const hasChanged = mode !== currentMode || value !== currentValue
  const canSave = isValid && hasChanged

  const tiles = useMemo<Array<OnbSheetTile<BufferMode>>>(
    () =>
      MODE_KEYS.map((key) => ({
        id: key,
        title: t(`settings:buffer.mode.${key}.label`),
        subtitle: t(`settings:buffer.mode.${key}.hint`),
      })),
    [t],
  )

  const helper = useMemo(() => {
    if (mode === 'none') return t('settings:buffer.helperNone')
    if (!isValid) return t('settings:buffer.helperInvalidPercent')
    if (mode === 'percent') return t('settings:buffer.helperPercent', { percent: draft })
    return t('settings:buffer.helperFixed', { amount: currencyFormatter.format(draft) })
  }, [mode, isValid, draft, t])

  return (
    <ModalCard
      skin="neo"
      onClose={onClose}
      subtitle={t('settings:buffer.sheetSubtitle')}
      title={t('settings:buffer.sheetTitle')}
      visible={visible}
      footer={
        <NeoButton
          block
          disabled={!canSave}
          haptic="light"
          label={t('settings:buffer.saveLabel')}
          loading={isSaving}
          onPress={() => {
            if (!canSave) return
            onSave(mode, value)
          }}
        />
      }
    >
      <OnbSheetBody>
        <OnbSheetTileGrid
          columns={3}
          items={tiles}
          onSelect={(next) => {
            void triggerHaptic('selection')
            setMode(next)
            // El draft es uno solo para los dos modos con número: un monto
            // en pesos leído como porcentaje quedaría fuera de rango.
            if (next === 'percent') {
              setDraft((prev) => Math.min(prev, MAX_BUFFER_PERCENT))
            }
          }}
          selected={mode}
        />

        {mode === 'fixed' ? (
          <OnbSheetAmountCard
            kicker={t('settings:buffer.eyebrowFixed')}
            onChange={setDraft}
            value={draft}
          />
        ) : null}

        {mode === 'percent' ? (
          <OnbSheetPercentCard
            chips={PERCENT_CHIPS}
            eyebrow={t('settings:buffer.eyebrowPercent')}
            max={MAX_BUFFER_PERCENT}
            onChange={setDraft}
            percent={draft}
          />
        ) : null}

        <OnbSheetHelper>{helper}</OnbSheetHelper>
      </OnbSheetBody>
    </ModalCard>
  )
}
