import { useEffect, useState, type PropsWithChildren, type ReactNode } from 'react'
import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import Svg, { Path } from 'react-native-svg'
import type { AvatarSlug } from '@/assets/avatars'
import { CATEGORY_ICONS } from '@/components/category/category-icon-registry'
import { Onb5bAvatarPicker } from '@/components/redesign/onboarding/onb-5b-avatar'
import {
  Onb5dDiaCard,
  Onb5dDiaGrid,
  Onb5dSemanaRow,
} from '@/components/redesign/onboarding/onb-5d-parts/onb-5d-dia'
import { Onb5dMontoCard } from '@/components/redesign/onboarding/onb-5d-parts/onb-5d-monto-stepper'
import { Onb5dSectionLabel } from '@/components/redesign/onboarding/onb-5d-parts/onb-5d-secciones'
import { ONB_5D_SPEC } from '@/components/redesign/onboarding/onb-5d-parts/onb-5d-spec'
import { ONB_NUMPAD_SHEET_HEIGHT, OnbNumpad } from '@/components/redesign/onboarding/onb-numpad'
import { ONB_SURFACES, type OnbMode } from '@/components/redesign/onboarding/onb-spec'
import { usePressScale } from '@/hooks/use-press-scale'
import { publishNumpadClose, publishNumpadOpen } from '@/lib/numpad-visibility'
import { neoInk } from '@/theme/neo-ink'
import { useThemeTokens } from '@/theme/theme-provider'
import { nunitoFamily } from '@/theme/typography'

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

/**
 * Piezas del flujo de ONBOARDING puestas a disposición de las hojas de
 * "Tu cuenta" en Ajustes — el usuario configura ahí exactamente lo mismo
 * que configuró al crear la cuenta, así que la superficie tiene que ser
 * la misma.
 *
 * Lo que ya existe como componente del onboarding se REUSA tal cual
 * (`Onb5dMontoCard`, `Onb5dDiaCard`/`Onb5dDiaGrid`, `Onb5dSectionLabel`,
 * `OnbNumpad`). Lo que en el onboarding está acoplado a su copy o a su
 * rango (tiles de ciclo, stepper, panel de %) se recompone acá con los
 * MISMOS valores de `ONB_5D_SPEC` / `ONB_SURFACES`, parametrizado, para
 * no tocar el flujo aprobado ni el copy de Ajustes.
 *
 * Sombras: todo lo que se dibuja acá vive dentro del ScrollView de
 * `ModalCard`, que recorta a filo. El gutter de la hoja es 22px, así que
 * los relieves propios de este archivo se quedan en 6/14 (alcance 20px).
 * Las cards del flujo traen el relieve grande (8 de offset + 18 de blur
 * = 26 de alcance) y no entran en ese gutter: se sangran
 * `SHADOW_INSET` px hacia adentro para que la sombra muera antes del
 * borde del scroll, mismo criterio que `FIJOS_SHADOW_BLEED`.
 */

/** 22 (gutter del cuerpo) + 4 = 26, el alcance del relieve del flujo. */
const SHADOW_INSET = 4

export function useOnbMode(): OnbMode {
  const theme = useThemeTokens()
  return theme.mode === 'dark' ? 'dark' : 'light'
}

// ─── Columna del cuerpo de la hoja ───────────────────────────────────
//
// `ModalCard` separa a sus hijos directos con `gap: 14`, que se sumaría a
// los `marginTop` propios del vocabulario del onboarding. Un único hijo
// deja mandar a esos márgenes y reproduce el ritmo del flujo. El padding
// vertical propio es el aire que necesita el relieve del primer/último
// bloque para no guillotinarse contra el borde del scroll.

export function OnbSheetBody({ children }: PropsWithChildren) {
  return <View style={styles.body}>{children}</View>
}

// ─── Etiqueta de sección ─────────────────────────────────────────────

export function OnbSheetLabel({ children }: PropsWithChildren) {
  const mode = useOnbMode()
  return <Onb5dSectionLabel mode={mode}>{children}</Onb5dSectionLabel>
}

// ─── Helper / caption con acentos ────────────────────────────────────

export interface OnbSheetCaptionSegment {
  text: string
  accent?: boolean
}

/**
 * Caption del selector de día del onboarding, con una diferencia
 * deliberada: el span acentuado usa `neoInk.accent` en vez del verde de
 * material. Sobre el peor stop del gradiente raised claro (#E4E6D8) el
 * `#2E7C39` da 4.09:1 y este texto es de 12.5px — el verde profundo
 * (#1F5429) llega a 7.04:1.
 */
export function OnbSheetCaption({ segments }: { segments: OnbSheetCaptionSegment[] }) {
  const mode = useOnbMode()
  const d = ONB_5D_SPEC[mode]
  const ink = neoInk(mode)
  return (
    <Text style={[styles.caption, { color: d.caption }]}>
      {segments.map((seg, i) =>
        seg.accent ? (
          <Text key={i} style={{ color: ink.accent }}>
            {seg.text}
          </Text>
        ) : (
          <Text key={i}>{seg.text}</Text>
        ),
      )}
    </Text>
  )
}

export function OnbSheetHelper({ children }: PropsWithChildren) {
  const mode = useOnbMode()
  const d = ONB_5D_SPEC[mode]
  return <Text style={[styles.helper, { color: d.caption }]}>{children}</Text>
}

export function OnbSheetError({ children }: PropsWithChildren) {
  const mode = useOnbMode()
  const ink = neoInk(mode)
  return <Text style={[styles.helper, { color: ink.danger }]}>{children}</Text>
}

export function OnbSheetNotice({ children }: PropsWithChildren) {
  const mode = useOnbMode()
  const d = ONB_5D_SPEC[mode]
  const ink = neoInk(mode)
  return (
    <View style={[styles.notice, { backgroundColor: d.dayIdleBg, boxShadow: d.dayIdleShadow }]}>
      <Text style={[styles.noticeText, { color: ink.warn }]}>{children}</Text>
    </View>
  )
}

// ─── Badge de check del tile elegido ─────────────────────────────────

export function OnbSheetCheckBadge() {
  const mode = useOnbMode()
  const d = ONB_5D_SPEC[mode]
  return (
    <View
      style={[
        styles.checkBadge,
        {
          experimental_backgroundImage: d.accentRadialCss,
          backgroundColor: d.accentRadialFallback,
        },
      ]}
    >
      <Svg width={13} height={13} viewBox="0 0 24 24">
        <Path
          d="M5 12.5l4.5 4.5L19 7.5"
          stroke={d.checkStroke}
          strokeWidth={3.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </Svg>
    </View>
  )
}

// ─── Grilla de tiles de elección ─────────────────────────────────────

export interface OnbSheetTile<Id extends string> {
  id: Id
  /** Clave del registro de stickers de categoría. */
  icon?: string
  title: string
  subtitle?: string
}

/**
 * Grilla 2×N con la geometría y el material de los tiles de ciclo del
 * paso 5d. Parametrizada en copy e íconos: Ajustes conserva sus propias
 * claves de i18n y sólo adopta la superficie.
 */
export function OnbSheetTileGrid<Id extends string>({
  items,
  selected,
  onSelect,
  columns = 2,
}: {
  items: ReadonlyArray<OnbSheetTile<Id>>
  selected: Id | null
  onSelect: (id: Id) => void
  columns?: number
}) {
  const rows: Array<Array<OnbSheetTile<Id>>> = []
  for (let i = 0; i < items.length; i += columns) {
    rows.push(items.slice(i, i + columns))
  }
  return (
    <View style={styles.tileGrid}>
      {rows.map((row) => (
        <View key={row.map((tile) => tile.id).join('-')} style={styles.tileRow}>
          {row.map((tile) => (
            <OnbSheetTileCell
              key={tile.id}
              tile={tile}
              selected={tile.id === selected}
              onPress={() => onSelect(tile.id)}
            />
          ))}
          {Array.from({ length: columns - row.length }, (_, i) => (
            <View key={`spacer-${i}`} style={styles.tileSpacer} />
          ))}
        </View>
      ))}
    </View>
  )
}

function OnbSheetTileCell<Id extends string>({
  tile,
  selected,
  onPress,
}: {
  tile: OnbSheetTile<Id>
  selected: boolean
  onPress: () => void
}) {
  const mode = useOnbMode()
  const d = ONB_5D_SPEC[mode]
  // La cajita del sticker queda CLARA en ambos temas (mismo criterio que
  // los tiles del onboarding): el sticker es multicolor y sobre fondo
  // oscuro pierde legibilidad.
  const dLight = ONB_5D_SPEC.light
  const pressScale = usePressScale({ pressedScale: 0.97 })
  const source = tile.icon ? CATEGORY_ICONS[tile.icon] : undefined
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      onPressIn={pressScale.onPressIn}
      onPressOut={pressScale.onPressOut}
      style={[
        styles.tile,
        selected
          ? { backgroundColor: d.tileSelectedBackground, boxShadow: d.tileSelectedShadow }
          : {
              experimental_backgroundImage: d.cardGradientCss,
              backgroundColor: d.cardFallback,
              boxShadow: d.tileIdleGridShadow,
            },
        pressScale.animatedStyle,
      ]}
    >
      <View style={styles.tileTitleRow}>
        {source ? (
          <View style={[styles.tileIconBox, { backgroundColor: dLight.tileIconSelectedBg }]}>
            <Image source={source} style={styles.tileIconImage} resizeMode="contain" />
          </View>
        ) : null}
        <Text
          style={[styles.tileTitle, { color: selected ? d.tileSelectedTitle : d.tileIdleTitle }]}
        >
          {tile.title}
        </Text>
      </View>
      {tile.subtitle ? (
        <Text
          style={[styles.tileSub, { color: selected ? d.tileSelectedSub : d.tileIdleSub }]}
          numberOfLines={2}
        >
          {tile.subtitle}
        </Text>
      ) : null}
    </AnimatedPressable>
  )
}

// ─── Fila de elección a ancho completo ───────────────────────────────

/**
 * Variante de una sola columna del tile (listas largas: monedas). Mismo
 * material, layout de fila con slot izquierdo y badge de check.
 */
export function OnbSheetChoiceRow({
  leading,
  title,
  subtitle,
  selected,
  disabled = false,
  onPress,
  accessibilityLabel,
}: {
  leading?: ReactNode
  title: string
  subtitle?: string
  selected: boolean
  disabled?: boolean
  onPress: () => void
  accessibilityLabel?: string
}) {
  const mode = useOnbMode()
  const d = ONB_5D_SPEC[mode]
  const pressScale = usePressScale({ pressedScale: 0.97 })
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      onPressIn={pressScale.onPressIn}
      onPressOut={pressScale.onPressOut}
      style={[
        styles.choiceRow,
        selected
          ? { backgroundColor: d.tileSelectedBackground, boxShadow: d.tileSelectedShadow }
          : {
              experimental_backgroundImage: d.cardGradientCss,
              backgroundColor: d.cardFallback,
              boxShadow: d.tileIdleGridShadow,
            },
        pressScale.animatedStyle,
      ]}
    >
      {leading}
      <View style={styles.choiceCopy}>
        <Text
          style={[styles.tileTitle, { color: selected ? d.tileSelectedTitle : d.tileIdleTitle }]}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.tileSub, { color: selected ? d.tileSelectedSub : d.tileIdleSub }]}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {selected ? <OnbSheetCheckBadge /> : null}
    </AnimatedPressable>
  )
}

// ─── Numpad del onboarding dentro de una hoja ────────────────────────
//
// El numpad se monta en su propio <Modal> anclado al borde inferior, así
// que taparía la hoja. `numpad-visibility` es el canal que ya usa
// `ModalCard` para reservar espacio: publicando el alto real de la hoja
// del numpad, la card crece y el contenido queda por encima.

function useSheetNumpad() {
  const [open, setOpen] = useState(false)
  const insets = useSafeAreaInsets()
  useEffect(() => {
    if (!open) return
    publishNumpadOpen(ONB_NUMPAD_SHEET_HEIGHT + insets.bottom)
    return () => {
      publishNumpadClose()
    }
  }, [open, insets.bottom])
  return { open, setOpen }
}

/**
 * Card de monto del paso 5d + su numpad. `max` acota el valor tipeado
 * (el numpad del onboarding trabaja con enteros y ya topea en 999.999.999).
 */
export function OnbSheetAmountCard({
  kicker,
  value,
  onChange,
  max,
}: {
  kicker: string
  value: number
  onChange: (next: number) => void
  max?: number
}) {
  const mode = useOnbMode()
  const numpad = useSheetNumpad()
  return (
    <>
      <Onb5dMontoCard
        mode={mode}
        kicker={kicker}
        monto={value}
        editing={numpad.open}
        onOpen={() => numpad.setOpen(true)}
      />
      <OnbNumpad
        mode={mode}
        visible={numpad.open}
        value={value}
        onChange={(next) => onChange(max === undefined ? next : Math.min(next, max))}
        onDone={() => numpad.setOpen(false)}
      />
    </>
  )
}

// ─── Panel de porcentaje (paso 5e) ───────────────────────────────────

/**
 * Panel "% del sueldo" del paso 5e: card elevada con el valor grande,
 * chips de atajo y línea calculada. A diferencia del onboarding el valor
 * es tocable y abre el numpad — Ajustes tiene que poder ajustar
 * cualquier porcentaje, no sólo los cinco atajos.
 */
export function OnbSheetPercentCard({
  eyebrow,
  percent,
  onChange,
  chips,
  suggested,
  max,
  footer,
}: {
  eyebrow: string
  percent: number
  onChange: (next: number) => void
  chips: readonly number[]
  /** Chip que lleva el badge SUGERIDO (el 10% del flujo). */
  suggested?: number
  max: number
  footer?: ReactNode
}) {
  const mode = useOnbMode()
  const d = ONB_5D_SPEC[mode]
  const { t } = useTranslation()
  const numpad = useSheetNumpad()

  return (
    <>
      <View
        style={[
          styles.percentCard,
          numpad.open
            ? { backgroundColor: d.tileSelectedBackground, boxShadow: d.tileSelectedShadow }
            : {
                experimental_backgroundImage: d.cardGradientCss,
                backgroundColor: d.cardFallback,
                boxShadow: d.tileIdleShadow,
              },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={eyebrow}
          onPress={() => numpad.setOpen(true)}
          style={styles.percentHeaderRow}
        >
          <View style={styles.percentHeaderCopy}>
            <Text style={[styles.percentEyebrow, { color: d.montoKicker }]}>{eyebrow}</Text>
            {numpad.open ? null : (
              <Text style={[styles.percentEdit, { color: neoInk(mode).accent }]}>
                {t('onboarding:redesign.ingresos.tapToEdit')}
              </Text>
            )}
          </View>
          <Text style={[styles.percentValue, { color: d.montoAmount }]}>{`${percent}%`}</Text>
        </Pressable>

        <View style={styles.percentChipsRow}>
          {chips.map((value) => (
            <PercentChip
              key={value}
              value={value}
              selected={value === percent}
              suggested={value === suggested}
              onPress={() => onChange(Math.min(value, max))}
            />
          ))}
        </View>

        {footer ? (
          <Text style={[styles.percentFooter, { color: d.caption }]}>{footer}</Text>
        ) : null}
      </View>
      <OnbNumpad
        mode={mode}
        visible={numpad.open}
        value={percent}
        onChange={(next) => onChange(Math.min(next, max))}
        onDone={() => numpad.setOpen(false)}
      />
    </>
  )
}

function PercentChip({
  value,
  selected,
  suggested,
  onPress,
}: {
  value: number
  selected: boolean
  suggested: boolean
  onPress: () => void
}) {
  const mode = useOnbMode()
  const d = ONB_5D_SPEC[mode]
  const surfaces = ONB_SURFACES[mode]
  const { t } = useTranslation()
  const pressScale = usePressScale({ pressedScale: 0.94 })

  const chip = (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      onPressIn={pressScale.onPressIn}
      onPressOut={pressScale.onPressOut}
      style={[
        styles.percentChip,
        selected
          ? {
              backgroundColor: surfaces.chipSelectedBackground,
              boxShadow: surfaces.chipSelectedShadow,
            }
          : {
              backgroundColor: surfaces.chipIdleBackground,
              boxShadow: surfaces.chipIdleShadow,
            },
        pressScale.animatedStyle,
      ]}
    >
      <Text
        style={[
          selected ? styles.percentChipTextSelected : styles.percentChipText,
          { color: selected ? surfaces.chipSelectedText : d.caption },
        ]}
      >
        {`${value}%`}
      </Text>
    </AnimatedPressable>
  )

  if (!suggested) return chip

  // El badge se pinta como HERMANO POSTERIOR del chip, anclado por su
  // borde inferior al superior del chip: así el anillo del estado activo
  // (`0 0 0 2.5px`) nunca lo cruza.
  return (
    <View style={styles.percentChipSuggestedWrap}>
      {chip}
      <View pointerEvents="none" style={styles.percentBadgeWrap}>
        <View style={[styles.percentBadge, { backgroundColor: d.captionAccent }]}>
          <Text style={[styles.percentBadgeText, { color: d.daySelectedText }]}>
            {t('onboarding:savingsStep.badgeSuggested')}
          </Text>
        </View>
      </View>
    </View>
  )
}

// ─── Selector de avatar (paso 5b) ────────────────────────────────────

/**
 * El mismo selector del paso 5b: medallón del elegido con su anillo,
 * "Sorpréndeme", pastel determinístico por slug y expansión al pack
 * completo. Sólo cambian dos cosas, ambas por el contexto de hoja:
 *
 *  · El enlace de expansión usa `neoInk.accent`. El verde de material
 *    (#2E7C39) da 4.47:1 sobre la hoja clara (#F0EFE3) y este texto es
 *    de 12.5px; el verde profundo (#1F5429) llega a 7.7:1. En oscuro
 *    la tinta ya es el mismo #A4E3A6 del flujo (9.56:1 sobre #1B2F22).
 *  · No lleva el helper del flujo: en Ajustes el avatar ya está elegido
 *    y el encabezado de la hoja dice para qué sirve.
 *
 * Sombras: el relieve del medallón alcanza 26px (8 de offset + 18 de
 * blur) y muere dentro del aire que dejan el padding del cuerpo (6) más
 * el del scroll de `ModalCard` (22); los tiles llegan a 15 contra el
 * gutter de 22.
 */
export function OnbSheetAvatarPicker({
  selected,
  onSelect,
}: {
  selected: AvatarSlug
  onSelect: (slug: AvatarSlug) => void
}) {
  const mode = useOnbMode()
  return (
    <OnbSheetBody>
      <Onb5bAvatarPicker
        mode={mode}
        avatar={selected}
        onSelectAvatar={onSelect}
        topGap={0}
        linkColor={neoInk(mode).accent}
      />
    </OnbSheetBody>
  )
}

// ─── Selector de día del mes (paso 5d) ───────────────────────────────

export function OnbSheetDayPicker({
  selected,
  onSelect,
  caption,
}: {
  selected: number | null
  onSelect: (day: number) => void
  caption?: OnbSheetCaptionSegment[] | null
}) {
  const mode = useOnbMode()
  return (
    <View style={styles.shadowInset}>
      <Onb5dDiaCard mode={mode}>
        <Onb5dDiaGrid mode={mode} selected={selected} onSelect={onSelect} />
        {caption && caption.length > 0 ? <OnbSheetCaption segments={caption} /> : null}
      </Onb5dDiaCard>
    </View>
  )
}

// ─── Selector de día de la semana (paso 5d, ciclo semanal) ───────────

/** `selected` en el índice del flujo: 0 = lunes … 6 = domingo. */
export function OnbSheetWeekdayPicker({
  selected,
  onSelect,
  caption,
}: {
  selected: number | null
  onSelect: (weekday: number) => void
  caption?: OnbSheetCaptionSegment[] | null
}) {
  const mode = useOnbMode()
  return (
    <View style={styles.shadowInset}>
      <Onb5dDiaCard mode={mode}>
        <Onb5dSemanaRow mode={mode} selected={selected} onSelect={onSelect} />
        {caption && caption.length > 0 ? <OnbSheetCaption segments={caption} /> : null}
      </Onb5dDiaCard>
    </View>
  )
}

// ─── Stepper (paso 5d, con rango y copy propios) ─────────────────────

export function OnbSheetStepper({
  value,
  unit,
  min,
  max,
  onChange,
  minusLabel,
  plusLabel,
  helper,
}: {
  value: number
  unit: string
  min: number
  max: number
  onChange: (next: number) => void
  minusLabel: string
  plusLabel: string
  /** Línea centrada bajo la card, como el stepper del flujo. */
  helper?: string
}) {
  const mode = useOnbMode()
  const d = ONB_5D_SPEC[mode]
  const minusScale = usePressScale({ pressedScale: 0.94 })
  const plusScale = usePressScale({ pressedScale: 0.94 })
  return (
    <View style={styles.shadowInset}>
      <View
        style={[
          styles.stepperCard,
          {
            experimental_backgroundImage: d.cardGradientCss,
            backgroundColor: d.cardFallback,
            boxShadow: d.cardShadowSoft,
          },
        ]}
      >
        <AnimatedPressable
          accessibilityRole="button"
          accessibilityLabel={minusLabel}
          disabled={value <= min}
          onPress={() => onChange(Math.max(min, value - 1))}
          onPressIn={minusScale.onPressIn}
          onPressOut={minusScale.onPressOut}
          style={[
            styles.stepperCircle,
            {
              experimental_backgroundImage: d.stepperMinusGradientCss,
              backgroundColor: d.stepperMinusFallback,
              boxShadow: d.stepperMinusShadow,
            },
            value <= min ? styles.stepperDisabled : null,
            minusScale.animatedStyle,
          ]}
        >
          <Svg width={20} height={20} viewBox="0 0 24 24">
            <Path
              d="M5.5 12h13"
              stroke={d.stepperMinusIcon}
              strokeWidth={2.8}
              strokeLinecap="round"
              fill="none"
            />
          </Svg>
        </AnimatedPressable>
        <View style={styles.stepperValueCol}>
          <Text style={[styles.stepperValue, { color: d.stepperValue }]}>{value}</Text>
          <Text style={[styles.stepperUnit, { color: d.stepperUnit }]}>{unit}</Text>
        </View>
        <AnimatedPressable
          accessibilityRole="button"
          accessibilityLabel={plusLabel}
          disabled={value >= max}
          onPress={() => onChange(Math.min(max, value + 1))}
          onPressIn={plusScale.onPressIn}
          onPressOut={plusScale.onPressOut}
          style={[
            styles.stepperCircle,
            {
              experimental_backgroundImage: d.accentRadialCss,
              backgroundColor: d.accentRadialFallback,
              boxShadow: d.stepperPlusShadow,
            },
            value >= max ? styles.stepperDisabled : null,
            plusScale.animatedStyle,
          ]}
        >
          <Svg width={20} height={20} viewBox="0 0 24 24">
            <Path
              d="M12 5.5v13M5.5 12h13"
              stroke={d.stepperPlusIcon}
              strokeWidth={2.8}
              strokeLinecap="round"
              fill="none"
            />
          </Svg>
        </AnimatedPressable>
      </View>
      {helper ? <OnbSheetStepperHelper>{helper}</OnbSheetStepperHelper> : null}
    </View>
  )
}

function OnbSheetStepperHelper({ children }: PropsWithChildren) {
  const mode = useOnbMode()
  const d = ONB_5D_SPEC[mode]
  return <Text style={[styles.stepperHelper, { color: d.caption }]}>{children}</Text>
}

// ─── Estilos (geometría del flujo 5d/5e) ─────────────────────────────

const styles = StyleSheet.create({
  // El ScrollView de `ModalCard` recorta a filo: el material del flujo
  // llega a 26px de alcance (8 de offset + 18 de blur) y el contenedor
  // sólo aporta 12/16. Este padding completa el aire que la sombra del
  // primer/último bloque necesita para morir antes del borde.
  body: {
    paddingTop: 6,
    paddingBottom: 12,
  },
  shadowInset: {
    paddingHorizontal: SHADOW_INSET,
  },
  caption: {
    fontSize: 12.5,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    textAlign: 'center',
    marginTop: 11,
  },
  helper: {
    fontSize: 12.5,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    marginTop: 10,
  },
  notice: {
    marginTop: 12,
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  noticeText: {
    fontSize: 12.5,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    lineHeight: 18,
  },
  checkBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  tileGrid: {
    marginTop: 10,
    gap: 9,
  },
  tileRow: {
    flexDirection: 'row',
    gap: 9,
  },
  tileSpacer: {
    flex: 1,
  },
  tile: {
    flex: 1,
    borderRadius: 18,
    paddingVertical: 11,
    paddingHorizontal: 12,
  },
  tileTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  tileIconBox: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  tileIconImage: {
    width: 17,
    height: 17,
  },
  tileTitle: {
    fontSize: 13.5,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    flexShrink: 1,
  },
  tileSub: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    marginTop: 2,
  },
  choiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 9,
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  choiceCopy: {
    flex: 1,
  },
  percentCard: {
    marginTop: 10,
    borderRadius: 26,
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  percentHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  percentHeaderCopy: {
    flexShrink: 1,
    gap: 2,
  },
  percentEyebrow: {
    fontSize: 11.5,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: 1.61,
  },
  percentEdit: {
    fontSize: 12,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
  },
  percentValue: {
    fontSize: 34,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    letterSpacing: -0.68,
  },
  // El badge SUGERIDO vive por fuera del chip, arriba: la fila necesita
  // ese alto reservado o el badge se recorta contra la card.
  percentChipsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 22,
  },
  percentChip: {
    flex: 1,
    borderRadius: 15,
    paddingVertical: 10,
    paddingHorizontal: 4,
    alignItems: 'center',
  },
  percentChipSuggestedWrap: {
    flex: 1.2,
    position: 'relative',
  },
  percentChipText: {
    fontSize: 12.5,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
  },
  percentChipTextSelected: {
    fontSize: 12.5,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
  },
  percentBadgeWrap: {
    position: 'absolute',
    bottom: '100%',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingBottom: 4,
    zIndex: 5,
    elevation: 5,
  },
  percentBadge: {
    borderRadius: 7,
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  percentBadgeText: {
    fontSize: 7.5,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    letterSpacing: 0.6,
  },
  percentFooter: {
    fontSize: 13,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    marginTop: 12,
  },
  stepperCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    marginTop: 10,
    borderRadius: 24,
    padding: 14,
  },
  stepperHelper: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    textAlign: 'center',
    marginTop: 8,
  },
  stepperCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperDisabled: {
    opacity: 0.4,
  },
  stepperValueCol: {
    alignItems: 'center',
    minWidth: 96,
  },
  stepperValue: {
    fontSize: 38,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    lineHeight: 38,
  },
  stepperUnit: {
    fontSize: 11.5,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    marginTop: 2,
  },
})
