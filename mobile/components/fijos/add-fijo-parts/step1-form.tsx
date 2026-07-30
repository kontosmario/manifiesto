// Step 1 del wizard add-fijo: nombre + monto + atajos + categoría +
// frecuencia (con tile picker + cuotas card cuando aplica). Extraído
// de `add-fijo-v2-screen.tsx`. La screen pasa todo el form state desde
// `useAddFijoForm`.
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useEffect } from 'react'
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { FIJOS_SHADOW_BLEED, useFijosSkin } from '@/components/fijos/fijos-skin'
import { RiseView } from '@/components/home/animated/rise-view'
import { AmountCard } from '@/components/home/amount-card'
import { CategoryHorizontalRail } from '@/components/home/category-horizontal-rail'
import { SuggestedAmountStrip } from '@/components/home/suggested-amount-strip'
import {
  CUOTA_OPTIONS,
  FREQ_OPTIONS,
  QUICK_AMOUNTS,
  type FreqChoice,
} from '@/features/fixed-expenses/add-fijo-helpers'
import type { Category as FixedExpenseCategory } from '@/features/categories/use-categories'
import { formatMoney } from '@/utils/money'
import { usePressScale } from '@/hooks/use-press-scale'
import { triggerHaptic } from '@/lib/haptics'
import { motionDurations } from '@/lib/motion'
import { useAppTheme } from '@/theme/theme-provider'
import { Field } from './field'
import { FreqTile } from './freq-tile'
import { NameInput } from './name-input'

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

export interface Step1FormProps {
  // Form state
  name: string
  onChangeName: (v: string) => void
  isNameFocused: boolean
  onNameFocus: () => void
  onNameBlur: () => void
  amount: number
  onPressAmount: () => void
  isNumpadVisible: boolean
  onAddQuickAmount: (delta: number) => void
  onClearAmount: () => void
  categories: FixedExpenseCategory[]
  categoryId: string | null
  onSelectCategory: (id: string) => void
  fijosTileWidth: number
  fijosTileHeight: number
  freqChoice: FreqChoice | null
  onSelectFreq: (id: FreqChoice) => void
  cuotaTot: number
  onSelectCuotaTot: (n: number) => void
  isInstallment: boolean
  totalCuotas: number
  // Missing-fields flags
  flagName: boolean
  flagAmount: boolean
  flagCategory: boolean
  flagFrequency: boolean
}

export function Step1Form(props: Step1FormProps) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  const skin = useFijosSkin()
  const neo = skin.kind === 'neo' ? skin : null
  const {
    name,
    onChangeName,
    isNameFocused,
    onNameFocus,
    onNameBlur,
    amount,
    onPressAmount,
    isNumpadVisible,
    onAddQuickAmount,
    onClearAmount,
    categories,
    categoryId,
    onSelectCategory,
    fijosTileWidth,
    fijosTileHeight,
    freqChoice,
    onSelectFreq,
    cuotaTot,
    onSelectCuotaTot,
    isInstallment,
    totalCuotas,
    flagName,
    flagAmount,
    flagCategory,
    flagFrequency,
  } = props

  return (
    <Animated.View
      key="step-1"
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(140)}
      layout={LinearTransition.duration(260)}
      style={styles.formStack}
    >
      {/*
        El paso 2 entra escalonado (`RiseView` con delays) y el paso 1 entraba
        de una. Se equipara: los cuatro campos suben en cascada, que además
        ordena la lectura —nombre, monto, categoría, frecuencia— en vez de
        presentar el formulario entero de golpe. `Stagger` es no-op en classic:
        la pantalla viva no cambia.
      */}
      <Stagger neo={neo != null} delay={0}>
        <Field
          label={t('fijos:wizard.step1.nameLabel')}
          trailing={name.trim().length > 0 ? t('fijos:wizard.step1.nameEditHint') : undefined}
        >
          <NameInput
            value={name}
            onChange={onChangeName}
            isFocused={isNameFocused}
            onFocus={onNameFocus}
            onBlur={onNameBlur}
            warning={flagName}
          />
        </Field>
      </Stagger>

      <Stagger neo={neo != null} delay={70}>
        <AmountCard
          amount={amount}
          isActive={isNumpadVisible}
          onPress={onPressAmount}
          warning={flagAmount}
        />
      </Stagger>

      {isInstallment && amount > 0 ? (
        <Text style={[styles.cuotaInlineHint, { color: theme.colors.textMuted }]}>
          {t('fijos:wizard.step1.installmentSummary', {
            count: cuotaTot,
            amount: formatMoney(amount),
            total: formatMoney(totalCuotas),
          })}
        </Text>
      ) : null}

      <Stagger neo={neo != null} delay={110}>
        <SuggestedAmountStrip
          amounts={[...QUICK_AMOUNTS]}
          currentAmount={amount}
          onAdd={onAddQuickAmount}
          onClear={onClearAmount}
        />
      </Stagger>

      <Stagger neo={neo != null} delay={160}>
      <CategoryHorizontalRail
        categories={categories}
        // El handoff muestra la píldora sólo cuando la categoría se dedujo
        // del nombre; acá se muestra cuando hay nombre escrito y todavía no
        // se eligió a mano, que es el mismo momento.
        hint={
          name.trim().length > 0 && categoryId == null
            ? t('fijos:wizard.step1.categorySuggested')
            : undefined
        }
        selectedCategoryId={categoryId ?? ''}
        onSelect={onSelectCategory}
        rows={2}
        iconScope="fixed_expense"
        tileWidth={fijosTileWidth}
        tileHeight={fijosTileHeight}
        warning={flagCategory}
      />
      </Stagger>

      <Stagger neo={neo != null} delay={220}>
      <Field label={t('fijos:wizard.step1.frequencyLabel')}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={neo ? styles.freqBleedNeo : undefined}
          contentContainerStyle={[styles.freqRow, neo ? styles.freqRowNeo : null]}
          decelerationRate="fast"
          // El snap de 72+8 sobra de la geometría vieja (tiles cuadrados de
          // 72). Con chips de ancho variable el snap cae a mitad de chip.
          snapToInterval={neo ? undefined : 72 + 8}
          snapToAlignment="start"
        >
          {FREQ_OPTIONS.map((f) => (
            <FreqTile
              key={f.id}
              icon={f.icon}
              label={t(f.labelKey)}
              selected={freqChoice === f.id}
              onPress={() => onSelectFreq(f.id)}
              warning={flagFrequency}
            />
          ))}
        </ScrollView>

        {isInstallment ? (
          <Animated.View
            entering={FadeIn.duration(200)}
            exiting={FadeOut.duration(140)}
            layout={LinearTransition.duration(240)}
            style={[
              styles.cuotaCard,
              {
                backgroundColor: theme.isDark
                  ? 'rgba(107,154,214,0.14)'
                  : '#DCE8F5',
                borderColor: theme.isDark ? '#2E4A6E' : '#A8BED4',
              },
              // El azul con borde de 1px era lo último del alta en piel
              // classic: un bloque de otro sistema abajo de los chips
              // neumórficos. Pasa a POZO — es un sub-formulario que se abre
              // adentro del campo de frecuencia, no una card aparte, y el
              // pozo es justamente el recurso de "acá elegís algo".
              neo
                ? {
                    borderRadius: neo.add.well.radius,
                    borderWidth: 0,
                    backgroundColor: neo.add.well.background,
                    boxShadow: neo.add.well.shadow,
                    paddingVertical: 13,
                    paddingHorizontal: 15,
                    marginTop: 12,
                  }
                : null,
            ]}
          >
            <Text
              style={[
                styles.cuotaEyebrow,
                { color: theme.colors.textMuted },
                neo
                  ? {
                      fontSize: 10,
                      fontWeight: '800',
                      fontFamily: neo.font('800'),
                      letterSpacing: 1.2,
                      color: neo.mutedInk,
                    }
                  : null,
              ]}
            >
              {t('fijos:wizard.step1.howManyInstallments')}
            </Text>
            <View style={[styles.cuotaRow, neo ? styles.cuotaRowNeo : null]}>
              {CUOTA_OPTIONS.map((n) => (
                <CuotaPill
                  key={n}
                  n={n}
                  selected={cuotaTot === n}
                  onPress={() => onSelectCuotaTot(n)}
                  label={t('fijos:wizard.step1.installmentsA11y', { count: n })}
                />
              ))}
            </View>
            {amount > 0 ? (
              <Text
                style={[
                  styles.cuotaFootnote,
                  { color: theme.colors.textMuted },
                  neo
                    ? [
                        styles.cuotaFootnoteNeo,
                        { color: neo.mutedInk, fontWeight: '700', fontFamily: neo.font('700') },
                      ]
                    : null,
                ]}
              >
                {t('fijos:wizard.step1.installmentSummary', {
                  count: cuotaTot,
                  amount: formatMoney(amount),
                  total: formatMoney(totalCuotas),
                })}
              </Text>
            ) : null}
          </Animated.View>
        ) : null}
      </Field>
      </Stagger>
    </Animated.View>
  )
}

/**
 * Píldora de cantidad de cuotas.
 *
 * En `neo` es el mismo idioma que los tiles de categoría: ELEVADA en reposo y
 * HUNDIDA con anillo al elegirla. La elegida no se rellena de verde —el verde
 * es "confirmado" en el sistema— sino que se hunde, que es el recurso de
 * "presionado" del neumorfismo. Y como el relleno y la sombra no se
 * interpolan, las dos superficies se cruzan por opacidad, igual que el chip de
 * frecuencia.
 */
function CuotaPill({
  n,
  selected,
  onPress,
  label,
}: {
  n: number
  selected: boolean
  onPress: () => void
  label: string
}) {
  const { theme } = useAppTheme()
  const skin = useFijosSkin()
  const neo = skin.kind === 'neo' ? skin : null
  const reduceMotion = useReducedMotion()
  const press = usePressScale({ pressedScale: 0.92 })
  const progress = useSharedValue(selected ? 1 : 0)

  useEffect(() => {
    progress.value = reduceMotion
      ? selected
        ? 1
        : 0
      : withTiming(selected ? 1 : 0, { duration: motionDurations.standard })
  }, [selected, reduceMotion, progress])

  const idleStyle = useAnimatedStyle(() => ({ opacity: 1 - progress.value }))
  const selStyle = useAnimatedStyle(() => ({ opacity: progress.value }))
  const inkFrom = neo?.mutedInk ?? '#000'
  const inkTo = neo?.add.tile.selectedRing ?? '#000'
  const inkStyle = useAnimatedStyle(() => ({
    color: interpolateColor(progress.value, [0, 1], [inkFrom, inkTo]),
  }))

  if (!neo) {
    return (
      <Pressable
        onPress={onPress}
        style={[
          styles.cuotaPill,
          {
            backgroundColor: selected ? theme.colors.primary : 'transparent',
            borderColor: selected ? theme.colors.primary : theme.colors.line,
          },
        ]}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityLabel={label}
      >
        <Text
          style={[
            styles.cuotaPillText,
            { color: selected ? theme.colors.textOnPrimary : theme.colors.text },
          ]}
        >
          {n}
        </Text>
      </Pressable>
    )
  }

  return (
    <AnimatedPressable
      onPress={() => {
        void triggerHaptic('selection')
        onPress()
      }}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      style={[styles.cuotaPillNeo, press.animatedStyle]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius: 13,
            backgroundColor: neo.add.quickChip.background,
            experimental_backgroundImage: neo.add.quickChip.gradientCss,
            boxShadow: neo.add.quickChip.shadow,
          },
          idleStyle,
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius: 13,
            backgroundColor: neo.add.well.background,
            boxShadow: `${neo.add.tile.selectedShadow}, 0 0 0 2px ${neo.add.tile.selectedRing}`,
          },
          selStyle,
        ]}
      />
      <Animated.Text
        allowFontScaling={false}
        style={[
          styles.cuotaPillTextNeo,
          { fontFamily: neo.font('900') },
          inkStyle,
        ]}
      >
        {n}
      </Animated.Text>
    </AnimatedPressable>
  )
}

/**
 * Envuelve un bloque del paso 1 en la entrada escalonada del rediseño. En
 * `classic` NO envuelve nada: devuelve a los hijos tal cual, así el árbol de
 * la pantalla viva queda idéntico (un `<View>` de más ahí ya es un cambio).
 */
function Stagger({
  neo,
  delay,
  children,
}: {
  neo: boolean
  delay: number
  children: React.ReactNode
}) {
  if (!neo) return <>{children}</>
  return <RiseView delay={delay}>{children}</RiseView>
}

const styles = StyleSheet.create({
  formStack: { gap: 12 },
  cuotaInlineHint: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: -4,
    paddingHorizontal: 4,
  },
  freqRow: {
    gap: 8,
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  // El ScrollView recorta la sombra contra sus bordes laterales. Sangra hacia
  // afuera lo mismo que el contenido se mete hacia adentro: los chips quedan
  // donde estaban y la sombra entra en el área de clip.
  freqBleedNeo: { marginHorizontal: -FIJOS_SHADOW_BLEED },
  freqRowNeo: { paddingHorizontal: FIJOS_SHADOW_BLEED, paddingVertical: 13 },
  cuotaCard: {
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  cuotaEyebrow: { fontSize: 10, letterSpacing: 1.4, fontWeight: '700' },
  cuotaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  cuotaPill: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  cuotaPillText: { fontSize: 12, fontWeight: '700' },
  // Las seis opciones REPARTEN el ancho en una sola fila. Con `minWidth` fijo
  // la sexta se caía a un segundo renglón y el bloque se leía como una grilla
  // rota: son seis alternativas del mismo eje, tienen que verse como una
  // escala. `flexWrap:'nowrap'` pisa el `wrap` de la fila classic.
  cuotaRowNeo: { gap: 7, marginTop: 10, flexWrap: 'nowrap' },
  cuotaPillNeo: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 4,
    paddingVertical: 10,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cuotaPillTextNeo: { fontSize: 13, fontWeight: '900', textAlign: 'center' },
  // El total es la consecuencia de elegir — se lee antes que el desglose.
  cuotaFootnoteNeo: { fontSize: 11.5, marginTop: 10 },
  cuotaFootnote: { fontSize: 11, marginTop: 8 },
})
