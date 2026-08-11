import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { ModalCard } from '@/components/ui/modal-card'
import { NeoButton } from '@/components/ui/neo-button'
import { NeoTextField } from '@/components/ui/neo-text-field'
import { SUPPORTS_INSET_SHADOW } from '@/components/wizard/inset-shadow-support'
import { useAppTheme } from '@/theme/theme-provider'
import { neoInk } from '@/theme/neo-ink'
import { neoRadii, neoTokens } from '@/theme/neo-tokens'
import { nunitoFamily } from '@/theme/typography'

interface CategoryEditorModalProps {
  visible: boolean
  title: string
  subtitle?: string
  initialValue?: string
  submitLabel: string
  onClose: () => void
  onSubmit: (value: string) => Promise<void> | void
  isBusy?: boolean
}

export function CategoryEditorModal({
  visible,
  title,
  subtitle,
  initialValue = '',
  submitLabel,
  onClose,
  onSubmit,
  isBusy = false,
}: CategoryEditorModalProps) {
  const { theme } = useAppTheme()
  const neo = neoTokens(theme.isDark ? 'dark' : 'light')
  const { t } = useTranslation()
  const [value, setValue] = useState(initialValue)
  const canSubmit = value.trim().length > 0

  return (
    <ModalCard skin="neo" visible={visible} title={title} subtitle={subtitle} onClose={onClose}>
      <View
        style={[
          styles.intro,
          {
            backgroundColor: neo.well,
            boxShadow: neo.shadows.insetLg,
          },
          // Android < API 29 descarta el boxShadow INSET en silencio: sin él el
          // pozo queda del material de la hoja y el bloque desaparece.
          SUPPORTS_INSET_SHADOW ? null : { borderWidth: 1, borderColor: neo.sheetDivider },
        ]}
      >
        <Text style={[styles.introLabel, { color: neoInk(theme.isDark ? 'dark' : 'light').accent }]}>
          {t('settings:categoryEditor.introLabel')}
        </Text>
        <Text style={[styles.introText, { color: neo.textMuted }]}>
          {t('settings:categoryEditor.introText')}
        </Text>
      </View>

      <NeoTextField
        autoCapitalize="sentences"
        autoCorrect={false}
        autoFocus
        label={t('settings:categoryEditor.nameLabel')}
        maxLength={40}
        onChangeText={setValue}
        placeholder={t('settings:categoryEditor.namePlaceholder')}
        returnKeyType="done"
        value={value}
      />

      <View style={styles.actions}>
        <NeoButton
          block
          disabled={!canSubmit}
          haptic="light"
          label={submitLabel}
          loading={isBusy}
          onPress={async () => {
            await onSubmit(value)
          }}
        />
        <NeoButton
          block
          haptic="none"
          label={t('common:actions.cancel')}
          onPress={onClose}
          variant="ghost"
        />
      </View>
    </ModalCard>
  )
}

const styles = StyleSheet.create({
  intro: {
    gap: 6,
    borderRadius: neoRadii.card,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  introLabel: {
    fontSize: 11,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  introText: {
    fontSize: 13,
    fontFamily: nunitoFamily('400'),
    lineHeight: 18,
  },
  actions: {
    gap: 10,
    marginTop: 2,
  },
})
