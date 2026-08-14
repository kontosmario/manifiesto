/**
 * Campo de texto neumórfico de las hojas rápidas de Control.
 *
 * Reemplaza a `TextField` (V1) DENTRO de las hojas migradas: el input del
 * rediseño es un POZO (`inset`) sobre `neo.well`, sin borde, y el foco se
 * marca con el anillo verde de 2.5px del sistema — NO con el borde animado
 * `line → primary` de 1→2px de la V1, que no tiene equivalente en el
 * vocabulario neo (ahí la jerarquía la da el relieve, nunca un hairline).
 *
 * Vive acá y no en `components/ui/` a propósito: `TextField` lo montan ~40
 * archivos (Ajustes, Suscripción, Auth, Logros) que todavía no pasaron por el
 * gate de aprobación del rediseño, así que migrarlo en sitio los restilaría a
 * todos de un saque.
 *
 * Se conserva el placeholder PROPIO de `TextField`: el nativo de iOS se dibuja
 * bottom-aligned en single-line (`placeholderRect` ≠ `textRect`) y eso no se
 * corrige con padding ni con altura.
 */
import { useState } from 'react'
import {
  StyleSheet,
  View,
  type TextInputProps,
} from 'react-native'
import { Text, TextInput } from '@/components/ui/app-text'
import { SUPPORTS_INSET_SHADOW } from '@/components/wizard/inset-shadow-support'
import { neoInk } from '@/theme/neo-ink'
import { neoRadii, neoTokens } from '@/theme/neo-tokens'
import { nunitoFamily } from '@/theme/typography'
import { useThemeTokens } from '@/theme/theme-provider'

/**
 * Tinta del helper. Es semántica: el sistema tiene verde de positivo,
 * terracota de alerta y rojo de error, y cada uno con su variante OSCURECIDA
 * para texto chico (los tokens `green`/`warm`/`danger` se calibraron para
 * fills y anillos, que sólo necesitan 3:1 — como tinta de 12px sobre la hoja
 * clara se quedan en 3.0-3.6:1, abajo de AA).
 */
export type NeoFieldTone = 'muted' | 'positive' | 'warn' | 'danger'

interface NeoFieldProps extends TextInputProps {
  label: string
  helper?: string
  helperTone?: NeoFieldTone
  /** `insetLg` = display de monto (el pozo principal del handoff);
   *  `insetMd` = campo estándar. */
  depth?: 'insetMd' | 'insetLg'
}

export function NeoField({
  label,
  helper,
  helperTone = 'muted',
  depth = 'insetMd',
  style,
  ...inputProps
}: NeoFieldProps) {
  const theme = useThemeTokens()
  const neo = neoTokens(theme.mode)
  const [isFocused, setFocused] = useState(false)
  const isMultiline = Boolean(inputProps.multiline)

  const { placeholder, value: valueProp, onChangeText, ...restInputProps } =
    inputProps
  const [localText, setLocalText] = useState('')
  const effectiveText = valueProp !== undefined ? valueProp : localText
  const showCustomPlaceholder =
    !isMultiline && Boolean(placeholder) && (effectiveText ?? '').length === 0

  const ink = neoInk(theme.mode)
  const helperInk =
    helperTone === 'danger'
      ? ink.danger
      : helperTone === 'warn'
        ? ink.warn
        : helperTone === 'positive'
          ? ink.accent
          : neo.textMuted

  // Android < API 29 descarta el boxShadow INSET en silencio: sin él el pozo
  // (`neo.well`) queda a ~1.1:1 contra la hoja y el campo DESAPARECE. Sólo en
  // ese piso cae un hairline, que además dobla su grosor al foco para que el
  // estado siga siendo legible sin el anillo.
  const flatFallback = SUPPORTS_INSET_SHADOW
    ? { borderWidth: 0 }
    : {
        borderWidth: isFocused ? 2 : 1,
        borderColor: isFocused ? neo.green : neo.sheetDivider,
      }

  return (
    <View style={styles.container}>
      {label ? (
        <Text style={[styles.label, { color: neo.textMuted }]}>{label}</Text>
      ) : null}
      <View
        style={[
          styles.inputWrap,
          {
            backgroundColor: neo.well,
            boxShadow: isFocused
              ? `${neo.shadows[depth]}, 0 0 0 2.5px ${neo.green}`
              : neo.shadows[depth],
          },
          flatFallback,
        ]}
      >
        <TextInput
          // Mismo contrato que `TextField`: el input no escala con el "Texto
          // más grande" de iOS (la caja tiene alto fijo), labels y helper sí.
          allowFontScaling={false}
          clearButtonMode="while-editing"
          placeholder={isMultiline ? placeholder : undefined}
          // `textTertiary` es la tinta de pista del sistema (el mismo `faint`
          // que usa el alta de fijos neo para sus placeholders).
          placeholderTextColor={neo.textTertiary}
          selectionColor={neo.green}
          style={[
            styles.inputField,
            {
              color: neo.text,
              // Single-line: alto EXPLÍCITO + paddingVertical 0 → iOS centra
              // texto y placeholder con el mismo rect. Multilínea: sin alto
              // fijo (crece con el contenido) + ancla arriba.
              height: isMultiline ? undefined : 52,
              paddingVertical: isMultiline ? 14 : 0,
              textAlignVertical: isMultiline ? 'top' : 'center',
            },
            style,
          ]}
          {...restInputProps}
          value={valueProp}
          onChangeText={(text) => {
            if (valueProp === undefined) setLocalText(text)
            onChangeText?.(text)
          }}
          onBlur={(event) => {
            setFocused(false)
            restInputProps.onBlur?.(event)
          }}
          onFocus={(event) => {
            setFocused(true)
            restInputProps.onFocus?.(event)
          }}
        />
        {showCustomPlaceholder ? (
          <View style={styles.placeholderOverlay} pointerEvents="none">
            <Text
              allowFontScaling={false}
              numberOfLines={1}
              style={[styles.placeholderText, { color: neo.textTertiary }]}
            >
              {placeholder}
            </Text>
          </View>
        ) : null}
      </View>
      {helper ? (
        <Text style={[styles.helper, { color: helperInk }]}>{helper}</Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    gap: 6,
  },
  // Eyebrow del handoff: 11/800 con tracking 1.76 (0.16em sobre 11px; RN no
  // acepta em). El `uppercase` lo traía `typography.eyebrow` en la V1 y las
  // claves i18n vienen en sentence-case, así que se conserva acá.
  label: {
    fontSize: 11,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: 1.76,
    textTransform: 'uppercase',
  },
  inputWrap: {
    borderRadius: neoRadii.input,
    // El alto lo define el input (52 single-line). Cualquier padding vertical
    // acá reintroduce el espacio donde el placeholder de iOS vuelve a derivar.
    minHeight: 52,
  },
  inputField: {
    paddingHorizontal: 16,
    fontSize: 16,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
  },
  placeholderOverlay: {
    position: 'absolute',
    left: 16,
    right: 16,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  placeholderText: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
  },
  helper: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    fontFamily: nunitoFamily('600'),
    paddingHorizontal: 2,
  },
})
