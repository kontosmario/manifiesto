import { useEffect, useMemo, useState } from 'react'
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ViewStyle,
} from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'expo-router'
import { NeoButton } from '@/components/ui/neo-button'
import { NeoSurface } from '@/components/ui/neo-surface'
import { Screen } from '@/components/ui/screen'
import { SUPPORTS_INSET_SHADOW } from '@/components/wizard/inset-shadow-support'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { type Category, useCategories } from '@/features/categories/use-categories'
import {
  ALL_CATEGORIES_KEY,
  PERIOD_OPTIONS,
  resolveSelectedCategoryId,
  type PeriodFilter,
} from '@/features/expenses/expense-history'
import { useExpenseHistoryFilters } from '@/features/expenses/expense-history-filters.store'
import { triggerHaptic } from '@/lib/haptics'
import { motionDurations } from '@/lib/motion'
import { cssGradient, neoRadii, neoTokens } from '@/theme/neo-tokens'
import {
  DEFAULT_HIT_SLOP,
  DEFAULT_PRESS_RETENTION_OFFSET,
} from '@/theme/interaction'
import { nunitoFamily } from '@/theme/typography'
import i18n from '@/lib/i18n'
import { useThemeTokens } from '@/theme/theme-provider'

interface ExpenseFiltersScreenProps {
  familyId: string
}

function buildCategoryLabel(
  categories: Category[],
  categorySelection: string,
) {
  const selectedCategoryId = resolveSelectedCategoryId(categories, categorySelection)

  if (!selectedCategoryId) {
    return i18n.t('gastos:smartFilter.all')
  }

  return categories.find((category) => category.id === selectedCategoryId)?.displayName ?? i18n.t('gastos:smartFilter.all')
}

/**
 * Chip del rediseño neumórfico. En neo el estado seleccionado NO se
 * rellena con el color de la categoría (el owner rechaza los saturados
 * del catálogo V1): se HUNDE — `shadows.ringSelected` (pozo + anillo
 * verde 2.5px) sobre `selectedTint`, contra el material `raisedSm` de
 * los chips en reposo. Mismo idioma que los chips de porcentaje del
 * sheet de ahorro.
 */
function NeoChip({
  label,
  isActive,
  onPress,
}: {
  label: string
  isActive: boolean
  onPress: () => void
}) {
  const theme = useThemeTokens()
  const neo = neoTokens(theme.mode)
  // `neo.green` es el verde de MATERIAL (anillo, relleno, gradiente). Como
  // TINTA a 13pt sobre el tile seleccionado da 3.97:1 en claro — bajo AA;
  // `greenDeep` ahí da 6.8:1. En oscuro el verde claro ya cumple y
  // `greenDeep` sería ilegible, así que la tinta es mode-aware (mismo
  // criterio que `quick-add-savings-sheet`).
  const accentInk = theme.mode === 'dark' ? neo.green : neo.greenDeep

  // Android < API 28/29 descarta el `boxShadow` EN SILENCIO: sin él el chip
  // en reposo queda del mismo material que la card y el seleccionado pierde
  // el anillo. En ese piso los dos caen a un contorno de 1px.
  const flatFallback = useMemo<ViewStyle | null>(
    () =>
      SUPPORTS_INSET_SHADOW
        ? null
        : { borderWidth: 1, borderColor: isActive ? neo.green : neo.sheetDivider },
    [neo, isActive],
  )

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: isActive }}
      hitSlop={DEFAULT_HIT_SLOP}
      pressRetentionOffset={DEFAULT_PRESS_RETENTION_OFFSET}
      onPress={() => {
        void triggerHaptic(isActive ? 'selection' : 'light')
        onPress()
      }}
      style={({ pressed }) => [
        styles.chip,
        isActive
          ? {
              backgroundColor: neo.selectedTint,
              boxShadow: neo.shadows.ringSelected,
            }
          : {
              ...cssGradient(neo.raisedGradientCss, neo.surface),
              boxShadow: neo.shadows.raisedSm,
            },
        flatFallback,
        { opacity: pressed ? 0.78 : 1 },
      ]}
    >
      <Text
        numberOfLines={1}
        style={[styles.chipLabel, { color: isActive ? accentInk : neo.text }]}
      >
        {label}
      </Text>
    </Pressable>
  )
}

/**
 * Campo de texto neo: eyebrow + POZO (`insetLg`) sobre `neo.well`. El
 * foco ya no engorda un borde de 1→2px (vocabulario V1): aparece un
 * anillo verde del sistema, como en el kit de auth. El placeholder va
 * como `<Text>` propio superpuesto — el nativo de iOS se dibuja
 * bottom-aligned con fonts custom y no se corrige con padding.
 */
function NeoSearchField({
  label,
  helper,
  placeholder,
  value,
  onChangeText,
}: {
  label: string
  helper: string
  placeholder: string
  value: string
  onChangeText: (text: string) => void
}) {
  const theme = useThemeTokens()
  const neo = neoTokens(theme.mode)
  const reduceMotion = useReducedMotion()
  const [focused, setFocused] = useState(false)
  const ringOpacity = useSharedValue(0)

  useEffect(() => {
    ringOpacity.value = reduceMotion
      ? focused
        ? 1
        : 0
      : withTiming(focused ? 1 : 0, { duration: motionDurations.standard })
  }, [focused, reduceMotion, ringOpacity])

  const ringStyle = useAnimatedStyle(() => ({ opacity: ringOpacity.value }))

  const wellFallback = useMemo<ViewStyle | null>(
    () => (SUPPORTS_INSET_SHADOW ? null : { borderWidth: 1, borderColor: neo.sheetDivider }),
    [neo],
  )

  return (
    <View style={styles.fieldStack}>
      <Text style={[styles.fieldLabel, { color: neo.textMuted }]}>{label}</Text>
      <NeoSurface
        backgroundColor={neo.well}
        radius={neoRadii.input}
        style={[styles.searchWell, wellFallback]}
        variant="insetLg"
      >
        {value.length === 0 ? (
          <View pointerEvents="none" style={styles.placeholderOverlay}>
            <Text
              allowFontScaling={false}
              numberOfLines={1}
              style={[styles.placeholderText, { color: neo.textMuted }]}
            >
              {placeholder}
            </Text>
          </View>
        ) : null}
        <TextInput
          accessibilityLabel={label}
          allowFontScaling={false}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
          onBlur={() => setFocused(false)}
          onChangeText={onChangeText}
          onFocus={() => setFocused(true)}
          returnKeyType="search"
          selectionColor={neo.green}
          style={[styles.searchInput, { color: neo.text }]}
          value={value}
        />
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFillObject,
            ringStyle,
            { borderRadius: neoRadii.input, borderWidth: 2.5, borderColor: neo.green },
          ]}
        />
      </NeoSurface>
      <Text style={[styles.fieldHelper, { color: neo.textMuted }]}>{helper}</Text>
    </View>
  )
}

/**
 * Bloque de estado (cargando / vacío) en material neo. Reemplaza a
 * `LoadingBlock` y `EmptyState`, que son primitivas V1 compartidas por
 * media app: adentro de una card neumórfica su hairline + `surfaceMuted`
 * se leían como un parche de la piel vieja.
 */
function NeoNotice({
  title,
  subtitle,
  live = false,
}: {
  title: string
  subtitle?: string
  live?: boolean
}) {
  const theme = useThemeTokens()
  const neo = neoTokens(theme.mode)
  const wellFallback = useMemo<ViewStyle | null>(
    () => (SUPPORTS_INSET_SHADOW ? null : { borderWidth: 1, borderColor: neo.sheetDivider }),
    [neo],
  )

  return (
    <NeoSurface
      backgroundColor={neo.well}
      radius={neoRadii.tile}
      style={[styles.notice, wellFallback]}
      variant="insetSm"
    >
      <Text
        accessibilityLabel={live ? title : undefined}
        accessibilityLiveRegion={live ? 'polite' : 'none'}
        style={[styles.noticeTitle, { color: neo.text }]}
      >
        {title}
      </Text>
      {subtitle ? (
        <Text style={[styles.noticeSubtitle, { color: neo.textMuted }]}>{subtitle}</Text>
      ) : null}
    </NeoSurface>
  )
}

export function ExpenseFiltersScreen({ familyId }: ExpenseFiltersScreenProps) {
  const router = useRouter()
  const { t } = useTranslation()
  const theme = useThemeTokens()
  const neo = neoTokens(theme.mode)
  // Ver `NeoChip`: el verde de material no llega a AA como tinta en claro.
  const accentInk = theme.mode === 'dark' ? neo.green : neo.greenDeep
  const categoriesQuery = useCategories(familyId)
  const categoriesData = categoriesQuery.data
  const categories = useMemo(() => categoriesData ?? [], [categoriesData])
  const filters = useExpenseHistoryFilters(familyId)
  const [categorySelectionDraft, setCategorySelectionDraft] = useState(filters.categorySelection)
  const [periodFilterDraft, setPeriodFilterDraft] = useState<PeriodFilter>(filters.periodFilter)
  const [searchQueryDraft, setSearchQueryDraft] = useState(filters.searchQuery)

  const selectedCategoryLabel = useMemo(
    () => buildCategoryLabel(categories, categorySelectionDraft),
    [categories, categorySelectionDraft],
  )
  const isDirty =
    categorySelectionDraft !== filters.categorySelection ||
    periodFilterDraft !== filters.periodFilter ||
    searchQueryDraft !== filters.searchQuery

  // Android < API 28/29: sin `boxShadow` los sub-relieves de la card
  // (tiles del resumen, pozos de selección) quedan del MISMO material que
  // la card que los contiene. Contorno de 1px como último recurso.
  const flatFallback = useMemo<ViewStyle | null>(
    () => (SUPPORTS_INSET_SHADOW ? null : { borderWidth: 1, borderColor: neo.sheetDivider }),
    [neo],
  )

  return (
    <Screen
      backgroundColor={neo.bg}
      canGoBack
      contentContainerStyle={styles.screenContent}
      // `expense-filters` se registra con `presentation: 'modal'`
      // (`app-stack-shell.tsx`): en iOS es una hoja que arranca debajo de la
      // isla, así que el inset superior del DISPOSITIVO no le corresponde.
      // En Android la ruta es `card` y el flag se ignora. Ver el docblock de
      // `presentedAsSheet`.
      presentedAsSheet
      subtitle={t('gastos:filtersScreen.subtitle')}
      title={t('gastos:filtersScreen.title')}
      titleColor={neo.text}
    >
      <View style={styles.sectionStack}>
        <NeoSurface radius={neoRadii.card} style={styles.formCard} variant="raisedLg">
          <View style={styles.sectionIntro}>
            <Text style={[styles.sectionEyebrow, { color: accentInk }]}>
              {t('common:terms.history')}
            </Text>
            <Text style={[styles.sectionTitle, { color: neo.text }]}>
              {t('gastos:filtersScreen.defineTitle')}
            </Text>
          </View>

          <View style={styles.highlightRow}>
            <NeoSurface
              radius={neoRadii.tile}
              style={[styles.highlightCard, flatFallback]}
              variant="raisedMd"
            >
              <Text style={[styles.highlightLabel, { color: neo.textMuted }]}>{t('gastos:filtersScreen.period')}</Text>
              <Text style={[styles.highlightValue, { color: neo.text }]}>
                {(() => {
                  const opt = PERIOD_OPTIONS.find((option) => option.key === periodFilterDraft)
                  return opt ? t(opt.labelKey) : t('gastos:filtersScreen.cycleFallback')
                })()}
              </Text>
            </NeoSurface>
            <NeoSurface
              radius={neoRadii.tile}
              style={[styles.highlightCard, flatFallback]}
              variant="raisedMd"
            >
              <Text style={[styles.highlightLabel, { color: neo.textMuted }]}>{t('gastos:filtersScreen.category')}</Text>
              <Text style={[styles.highlightValue, { color: neo.text }]}>
                {selectedCategoryLabel}
              </Text>
            </NeoSurface>
          </View>

          {categoriesQuery.isLoading ? (
            <NeoNotice live title={t('gastos:filtersScreen.loadingCategories')} />
          ) : null}

          {!categoriesQuery.isLoading && categories.length === 0 ? (
            <NeoNotice
              subtitle={t('gastos:filtersScreen.noCategoriesSubtitle')}
              title={t('gastos:filtersScreen.noCategoriesTitle')}
            />
          ) : null}

          <NeoSurface
            backgroundColor={neo.well}
            radius={neoRadii.input}
            style={[styles.fieldCard, flatFallback]}
            variant="insetMd"
          >
            <Text style={[styles.fieldLabel, { color: neo.textMuted }]}>{t('gastos:filtersScreen.period')}</Text>
            <ScrollView
              contentContainerStyle={styles.chipsRow}
              horizontal
              showsHorizontalScrollIndicator={false}
            >
              {PERIOD_OPTIONS.map((option) => (
                <NeoChip
                  key={option.key}
                  label={t(option.labelKey)}
                  onPress={() => setPeriodFilterDraft(option.key)}
                  isActive={periodFilterDraft === option.key}
                />
              ))}
            </ScrollView>
          </NeoSurface>

          <NeoSurface
            backgroundColor={neo.well}
            radius={neoRadii.input}
            style={[styles.fieldCard, flatFallback]}
            variant="insetMd"
          >
            <Text style={[styles.fieldLabel, { color: neo.textMuted }]}>{t('gastos:filtersScreen.category')}</Text>
            <ScrollView
              contentContainerStyle={styles.chipsRow}
              horizontal
              showsHorizontalScrollIndicator={false}
            >
              <NeoChip
                label={t('gastos:smartFilter.all')}
                onPress={() => setCategorySelectionDraft(ALL_CATEGORIES_KEY)}
                isActive={resolveSelectedCategoryId(categories, categorySelectionDraft) === ''}
              />
              {categories.map((category) => (
                <NeoChip
                  key={category.id}
                  label={category.displayName}
                  onPress={() => setCategorySelectionDraft(category.id)}
                  isActive={resolveSelectedCategoryId(categories, categorySelectionDraft) === category.id}
                />
              ))}
            </ScrollView>
          </NeoSurface>

          <NeoSearchField
            helper={t('gastos:filtersScreen.searchHelper')}
            label={t('gastos:filtersScreen.searchLabel')}
            onChangeText={setSearchQueryDraft}
            placeholder={t('gastos:filtersScreen.searchPlaceholder')}
            value={searchQueryDraft}
          />
        </NeoSurface>

        <View style={styles.actions}>
          <NeoButton
            block
            disabled={!isDirty}
            label={t('gastos:filtersScreen.apply')}
            onPress={() => {
              filters.setCategorySelection(
                resolveSelectedCategoryId(categories, categorySelectionDraft) || ALL_CATEGORIES_KEY,
              )
              filters.setPeriodFilter(periodFilterDraft)
              filters.setSearchQuery(searchQueryDraft)
              router.back()
            }}
            variant="primary"
          />
          <NeoButton
            block
            label={t('gastos:clearFilters.label')}
            onPress={() => {
              setCategorySelectionDraft(ALL_CATEGORIES_KEY)
              setPeriodFilterDraft('cycle')
              setSearchQueryDraft('')
            }}
            variant="ghost"
          />
        </View>
      </View>
    </Screen>
  )
}

// El `fontFamily` viaja SIEMPRE con el peso: cada peso de Nunito es un face
// estático propio, así que un `fontWeight` suelto no cambia la face.
const styles = StyleSheet.create({
  screenContent: {
    paddingTop: 4,
  },
  sectionStack: {
    gap: 18,
  },
  // Radio y relieve los pone `NeoSurface`; acá queda sólo la caja.
  formCard: {
    gap: 18,
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  sectionIntro: {
    gap: 4,
  },
  sectionEyebrow: {
    fontSize: 12,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    letterSpacing: -0.3,
  },
  highlightRow: {
    flexDirection: 'row',
    gap: 12,
  },
  highlightCard: {
    flex: 1,
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  highlightLabel: {
    fontSize: 11,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  highlightValue: {
    fontSize: 15,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
  },
  fieldCard: {
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  chipsRow: {
    gap: 12,
  },
  chip: {
    borderRadius: neoRadii.chip,
    minHeight: 42,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipLabel: {
    fontSize: 13,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
  },
  fieldStack: {
    gap: 6,
  },
  // El alto lo DEFINE el input (52): cualquier padding vertical acá
  // reintroduce el espacio donde el placeholder de iOS vuelve a derivar.
  searchWell: {
    minHeight: 52,
  },
  searchInput: {
    height: 52,
    paddingHorizontal: 14,
    paddingVertical: 0,
    fontSize: 14,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    textAlignVertical: 'center',
  },
  placeholderOverlay: {
    position: 'absolute',
    left: 14,
    right: 14,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  placeholderText: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
  },
  fieldHelper: {
    paddingHorizontal: 2,
    fontSize: 13,
    fontWeight: '600',
    fontFamily: nunitoFamily('600'),
    lineHeight: 18,
  },
  notice: {
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  noticeTitle: {
    fontSize: 15,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
  },
  noticeSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: nunitoFamily('600'),
    lineHeight: 18,
  },
  actions: {
    gap: 12,
  },
})
