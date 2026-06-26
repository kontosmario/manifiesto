import { useEffect, useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { AppButton } from '@/components/ui/button'
import { ModalCard } from '@/components/ui/modal-card'
import { TextField } from '@/components/ui/text-field'
import { useAppTheme } from '@/theme/theme-provider'
import type { Category } from '@/features/categories/use-categories'

interface AddFixedQuickSheetProps {
  visible: boolean
  initialName: string
  initialAmount: number | null
  categories: Category[]
  isCategoriesLoading: boolean
  isSaving: boolean
  onClose: () => void
  onSubmit: (input: { name: string; amount: number; categoryId: string }) => void
  inline?: boolean
}

export function AddFixedQuickSheet({
  visible,
  initialName,
  initialAmount,
  categories,
  isCategoriesLoading,
  isSaving,
  onClose,
  onSubmit,
  inline,
}: AddFixedQuickSheetProps) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  const [name, setName] = useState(initialName)
  const [amountText, setAmountText] = useState(
    initialAmount && initialAmount > 0 ? String(Math.round(initialAmount)) : '',
  )
  const [categoryId, setCategoryId] = useState<string | null>(
    categories[0]?.id ?? null,
  )

  useEffect(() => {
    if (!visible) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate draft fields when sheet opens
    setName(initialName)
    setAmountText(
      initialAmount && initialAmount > 0 ? String(Math.round(initialAmount)) : '',
    )
  }, [visible, initialName, initialAmount])

  // If no category is picked yet (or the previously picked one is gone),
  // default to the first available so the CTA isn't disabled by missing
  // selection on first open.
  useEffect(() => {
    if (categories.length === 0) return
    if (categoryId && categories.some((c) => c.id === categoryId)) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- default category selection once data arrives
    setCategoryId(categories[0].id)
  }, [categories, categoryId])

  const trimmedName = name.trim()
  const parsedAmount = useMemo(() => {
    const digits = amountText.replace(/[^\d]/g, '')
    return digits === '' ? 0 : parseInt(digits, 10)
  }, [amountText])

  const isValid =
    trimmedName.length > 0 && parsedAmount > 0 && categoryId !== null

  return (
    <ModalCard
      visible={visible}
      onClose={onClose}
      inline={inline}
      title={t('control:addFixed.title')}
      subtitle={t('control:addFixed.subtitle')}
    >
      <View style={styles.body}>
        <TextField
          label={t('control:addFixed.labelNombre')}
          value={name}
          onChangeText={setName}
          placeholder={t('control:addFixed.placeholderNombre')}
          accessibilityLabel={t('control:addFixed.a11yNombre')}
          maxLength={60}
        />

        <TextField
          label={t('control:addFixed.labelMonto')}
          value={amountText}
          onChangeText={setAmountText}
          keyboardType="number-pad"
          inputMode="numeric"
          placeholder={t('control:addFixed.placeholderMonto')}
          accessibilityLabel={t('control:addFixed.a11yMonto')}
        />

        <View style={styles.categoryBlock}>
          <Text
            style={[styles.categoryLabel, { color: theme.colors.textMuted }]}
          >
            {t('control:addFixed.categoria')}
          </Text>
          {isCategoriesLoading && categories.length === 0 ? (
            <Text
              style={[styles.categoryHelper, { color: theme.colors.textSoft }]}
            >
              {t('control:addFixed.cargandoCategorias')}
            </Text>
          ) : categories.length === 0 ? (
            <Text
              style={[styles.categoryHelper, { color: theme.colors.textSoft }]}
            >
              {t('control:addFixed.sinCategorias')}
            </Text>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categoryRow}
            >
              {categories.map((cat) => {
                const isActive = cat.id === categoryId
                return (
                  <Pressable
                    key={cat.id}
                    onPress={() => setCategoryId(cat.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isActive }}
                    style={({ pressed }) => [
                      styles.categoryChip,
                      {
                        backgroundColor: isActive
                          ? cat.color
                          : theme.colors.surfaceMuted,
                        borderColor: isActive ? cat.color : theme.colors.border,
                        opacity: pressed ? 0.7 : 1,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.categoryChipText,
                        {
                          color: isActive
                            ? theme.colors.background
                            : theme.colors.text,
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {cat.name}
                    </Text>
                  </Pressable>
                )
              })}
            </ScrollView>
          )}
        </View>

        <Text style={[styles.helper, { color: theme.colors.textMuted }]}>
          {t('control:addFixed.helper')}
        </Text>

        <AppButton
          variant="primary"
          label={t('control:addFixed.cta')}
          loading={isSaving}
          disabled={!isValid}
          onPress={() => {
            if (!isValid || categoryId === null) return
            onSubmit({
              name: trimmedName,
              amount: parsedAmount,
              categoryId,
            })
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
  categoryBlock: {
    gap: 8,
  },
  categoryLabel: {
    fontSize: 11,
    letterSpacing: 1.4,
    fontWeight: '700',
  },
  categoryRow: {
    gap: 8,
    paddingVertical: 2,
  },
  categoryChip: {
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    minHeight: 36,
    justifyContent: 'center',
  },
  categoryChipText: {
    fontSize: 13,
    fontWeight: '700',
  },
  categoryHelper: {
    fontSize: 12,
    fontWeight: '500',
  },
  helper: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },
})
