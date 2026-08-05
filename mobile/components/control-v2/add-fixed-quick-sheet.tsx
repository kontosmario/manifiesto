import { useEffect, useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { ModalCard } from '@/components/ui/modal-card'
import { NeoButton } from '@/components/ui/neo-button'
import { NeoField } from '@/components/control-v2/neo-field'
import { SUPPORTS_INSET_SHADOW } from '@/components/wizard/inset-shadow-support'
import { cssGradient, neoRadii, neoTokens } from '@/theme/neo-tokens'
import { nunitoFamily } from '@/theme/typography'
import { useThemeTokens } from '@/theme/theme-provider'
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

/**
 * Cuánto se extiende la sombra `raisedSm` de un chip más allá de su caja
 * (offset 5 + blur 10). El `ScrollView` horizontal la recorta contra sus
 * bordes, así que sangra este tanto hacia afuera y lo compensa con padding
 * hacia adentro: los chips quedan donde estaban y la sombra entra en el área
 * de clip. Mismo recurso que `FIJOS_SHADOW_BLEED` en el alta de fijos.
 */
const CHIP_SHADOW_BLEED = 15

/**
 * Rediseño 2026-07: la carcasa la pinta `ModalCard skin="neo"` (hoja
 * `neo.sheet`, esquinas 34, sombra hacia arriba, píldora 44×5 y scrim del
 * tema). Este archivo sólo aporta el CONTENIDO.
 */
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
  const theme = useThemeTokens()
  const neo = neoTokens(theme.mode)
  const isDark = theme.mode === 'dark'
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

  // Tinta verde de TEXTO. `neo.green` es el verde de MATERIAL (relleno,
  // anillo, gradiente); como tinta chica sobre el tinte del chip seleccionado
  // en claro se queda abajo de AA, así que ahí manda `greenDeep`. En oscuro el
  // verde claro ya cumple y `greenDeep` sería ilegible.
  const accentInk = isDark ? neo.green : neo.greenDeep

  return (
    <ModalCard
      visible={visible}
      onClose={onClose}
      inline={inline}
      skin="neo"
      title={t('control:addFixed.title')}
      subtitle={t('control:addFixed.subtitle')}
    >
      <NeoField
        label={t('control:addFixed.labelNombre')}
        value={name}
        onChangeText={setName}
        placeholder={t('control:addFixed.placeholderNombre')}
        accessibilityLabel={t('control:addFixed.a11yNombre')}
        maxLength={60}
      />

      <NeoField
        label={t('control:addFixed.labelMonto')}
        depth="insetLg"
        value={amountText}
        onChangeText={setAmountText}
        keyboardType="number-pad"
        inputMode="numeric"
        placeholder={t('control:addFixed.placeholderMonto')}
        accessibilityLabel={t('control:addFixed.a11yMonto')}
      />

      <View style={styles.categoryBlock}>
        <Text style={[styles.categoryLabel, { color: neo.textMuted }]}>
          {t('control:addFixed.categoria')}
        </Text>
        {isCategoriesLoading && categories.length === 0 ? (
          <Text style={[styles.categoryHelper, { color: neo.textMuted }]}>
            {t('control:addFixed.cargandoCategorias')}
          </Text>
        ) : categories.length === 0 ? (
          <Text style={[styles.categoryHelper, { color: neo.textMuted }]}>
            {t('control:addFixed.sinCategorias')}
          </Text>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.categoryBleed}
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
                    // Sin selección = tile extruido (gradiente raised del
                    // tema); seleccionado = pozo + anillo verde 2.5px sobre el
                    // tinte del sistema. El `cat.color` viejo salía de la BASE
                    // DE DATOS (fuera de paleta, sin contraste garantizado en
                    // oscuro) y desaparece del render.
                    isActive
                      ? {
                          backgroundColor: neo.selectedTint,
                          boxShadow: neo.shadows.ringSelected,
                        }
                      : {
                          ...cssGradient(neo.raisedGradientCss, neo.surface),
                          boxShadow: neo.shadows.raisedSm,
                        },
                    // Android < API 28/29 descarta el boxShadow EN SILENCIO:
                    // sin él el chip seleccionado queda indistinguible del
                    // inactivo. Sólo en ese piso cae un borde.
                    SUPPORTS_INSET_SHADOW
                      ? null
                      : {
                          borderWidth: isActive ? 2.5 : 1,
                          borderColor: isActive
                            ? neo.green
                            : theme.colors.border,
                        },
                    { opacity: pressed ? 0.7 : 1 },
                  ]}
                >
                  <Text
                    style={[
                      styles.categoryChipText,
                      { color: isActive ? accentInk : neo.text },
                    ]}
                    numberOfLines={1}
                  >
                    {cat.displayName}
                  </Text>
                </Pressable>
              )
            })}
          </ScrollView>
        )}
      </View>

      <Text style={[styles.helper, { color: neo.textMuted }]}>
        {t('control:addFixed.helper')}
      </Text>

      <NeoButton
        variant="primary"
        block
        label={t('control:addFixed.cta')}
        busy={isSaving}
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
    </ModalCard>
  )
}

const styles = StyleSheet.create({
  categoryBlock: {
    gap: 8,
  },
  // Eyebrow del handoff: 11/800 con tracking 1.76 (0.16em sobre 11px).
  categoryLabel: {
    fontSize: 11,
    letterSpacing: 1.76,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
  },
  // Sangría de la sombra: hacia afuera en el riel, hacia adentro en el
  // contenido. El margen vertical negativo devuelve el alto que gana el
  // padding, así el bloque ocupa lo mismo que antes de la migración.
  categoryBleed: {
    marginHorizontal: -CHIP_SHADOW_BLEED,
    marginVertical: -8,
  },
  categoryRow: {
    gap: 8,
    paddingHorizontal: CHIP_SHADOW_BLEED,
    paddingVertical: 10,
  },
  categoryChip: {
    paddingVertical: 9,
    paddingHorizontal: 14,
    // El radio se tokeniza (999 no está en el vocabulario). Con `minHeight`
    // 36 el 22 clampea a 18 = misma píldora que antes.
    borderRadius: neoRadii.pill,
    minHeight: 36,
    justifyContent: 'center',
  },
  categoryChipText: {
    fontSize: 13,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
  },
  categoryHelper: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: nunitoFamily('600'),
  },
  helper: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    fontFamily: nunitoFamily('500'),
  },
})
