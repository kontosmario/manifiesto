import { useEffect, useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { NumericEditSheet } from '@/components/ui/numeric-edit-sheet'
import type { BufferMode } from '@/features/settings/settings-form.model'
import {
  currencyFormatter,
  formatPriceInputValue,
  parsePrice,
  serializePrice,
} from '@/utils/money'
import { triggerHaptic } from '@/lib/haptics'
import { useAppTheme } from '@/theme/theme-provider'
import { neoInk } from '@/theme/neo-ink'
import { neoTokens } from '@/theme/neo-tokens'
import { radii } from '@/theme/palette'

interface EditBufferSheetProps {
  visible: boolean
  currentMode: BufferMode
  currentValue: number
  isSaving: boolean
  onClose: () => void
  onSave: (nextMode: BufferMode, nextValue: number) => void
}

const MODE_KEYS: BufferMode[] = ['none', 'fixed', 'percent']

export function EditBufferSheet({
  visible,
  currentMode,
  currentValue,
  isSaving,
  onClose,
  onSave,
}: EditBufferSheetProps) {
  const { theme } = useAppTheme()
  const neo = neoTokens(theme.isDark ? 'dark' : 'light')
  const ink = neoInk(theme.isDark ? 'dark' : 'light')
  const { t } = useTranslation()
  const [mode, setMode] = useState<BufferMode>(currentMode)
  const [draft, setDraft] = useState(() => serializePrice(currentValue))

  useEffect(() => {
    if (visible) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Hydrate draft when sheet opens
      setMode(currentMode)
      setDraft(serializePrice(currentValue))
    }
  }, [visible, currentMode, currentValue])

  const parsed = useMemo(() => {
    if (mode === 'none') return 0
    if (mode === 'percent') {
      const numeric = Number(draft.replace(/[^\d]/g, ''))
      return Number.isFinite(numeric) ? numeric : Number.NaN
    }
    return parsePrice(draft)
  }, [mode, draft])

  const isValid =
    mode === 'none'
      ? true
      : Number.isFinite(parsed) &&
        parsed >= 0 &&
        (mode !== 'percent' || parsed <= 100)

  const hasChanged = mode !== currentMode || (isValid && parsed !== currentValue)
  const canSave = isValid && hasChanged

  const helper = useMemo(() => {
    if (mode === 'none') return t('settings:buffer.helperNone')
    if (!isValid) {
      return mode === 'percent'
        ? t('settings:buffer.helperInvalidPercent')
        : t('settings:buffer.helperInvalidAmount')
    }
    if (mode === 'percent') return t('settings:buffer.helperPercent', { percent: parsed })
    return t('settings:buffer.helperFixed', { amount: currencyFormatter.format(parsed) })
  }, [mode, isValid, parsed, t])

  const showError = mode !== 'none' && !isValid && draft.length > 0
  const errorText =
    showError && mode === 'percent'
      ? t('settings:buffer.errorPercent')
      : showError
        ? t('settings:buffer.errorAmount')
        : undefined

  const handleMode = (next: BufferMode) => {
    void triggerHaptic('selection')
    setMode(next)
  }

  return (
    <NumericEditSheet
      visible={visible}
      title={t('settings:buffer.sheetTitle')}
      subtitle={t('settings:buffer.sheetSubtitle')}
      rawValue={mode === 'none' ? '' : draft}
      onChangeRawValue={setDraft}
      formatDisplay={(raw) => {
        if (mode === 'none') return t('settings:buffer.none')
        if (mode === 'percent') return raw ? `${raw}%` : ''
        return formatPriceInputValue(raw, false)
      }}
      displayEyebrow={
        mode === 'none'
          ? t('settings:buffer.eyebrowNone')
          : mode === 'percent'
            ? t('settings:buffer.eyebrowPercent')
            : t('settings:buffer.eyebrowFixed')
      }
      displayPlaceholder={mode === 'percent' ? '0%' : '$ 0'}
      helper={helper}
      errorText={errorText}
      maxIntegerDigits={mode === 'percent' ? 3 : undefined}
      maxDecimalDigits={mode === 'percent' ? 0 : undefined}
      numpadDisabled={mode === 'none'}
      saveLabel={t('settings:buffer.saveLabel')}
      saveDisabled={!canSave}
      isSaving={isSaving}
      onSave={() => {
        if (!canSave || !isValid) return
        onSave(mode, mode === 'none' ? 0 : parsed)
      }}
      onClose={onClose}
      headerExtra={
        <View style={styles.modeGrid}>
          {MODE_KEYS.map((modeKey) => {
            const isOn = modeKey === mode
            return (
              <Pressable
                key={modeKey}
                accessibilityRole="button"
                accessibilityState={{ selected: isOn }}
                onPress={() => handleMode(modeKey)}
                style={[
                  styles.modeCard,
                  {
                    backgroundColor: isOn ? ink.accent : neo.well,
                    borderColor: isOn ? ink.accent : neo.sheetDivider,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.modeLabel,
                    { color: isOn ? '#FFFFFF' : neo.text },
                  ]}
                >
                  {t(`settings:buffer.mode.${modeKey}.label`)}
                </Text>
                <Text
                  numberOfLines={1}
                  style={[
                    styles.modeHint,
                    { color: isOn ? '#FFFFFF' : neo.textMuted },
                  ]}
                >
                  {t(`settings:buffer.mode.${modeKey}.hint`)}
                </Text>
              </Pressable>
            )
          })}
        </View>
      }
    />
  )
}

const styles = StyleSheet.create({
  modeGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  modeCard: {
    flex: 1,
    borderRadius: radii.md,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 2,
  },
  modeLabel: { fontSize: 13, fontWeight: '800' },
  modeHint: { fontSize: 11 },
})
