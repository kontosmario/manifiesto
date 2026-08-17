// Campo NOTA del alta de gasto, con divulgación progresiva.
//
// Es el único opcional que sobrevivió al viejo paso 2. En reposo ocupa un chip
// de ~36pt ("＋ Nota"); recién al tocarlo se despliega el pozo de ~95pt. Eso
// vale ~60pt de columna en el 95% de las altas —que no llevan nota— sin
// esconder el campo detrás de otra pantalla: es texto libre corto, no una
// decisión que merezca una hoja propia.
//
// El estado de apertura vive ACÁ y no en el form, igual que el foco de
// `description-field`: es estado de presentación. Colgado del orquestador,
// abrir el pozo re-rendearía la pantalla entera (rail incluido) para montar un
// TextInput.
//
// Cerrar SÓLO se ofrece con la nota vacía: colapsar con texto adentro
// escondería un dato que igual se va a guardar.
import { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { Text, TextInput } from '@/components/ui/app-text'
import { useTranslation } from 'react-i18next'
import Animated from 'react-native-reanimated'
import { SUPPORTS_INSET_SHADOW } from '@/components/wizard/inset-shadow-support'
import { STEP_LAYOUT } from '@/components/wizard/step-motion'
import { useWizardSkin } from '@/components/wizard/wizard-skin'
import { EXPENSE_NOTES_MAX_LENGTH } from '@/features/expenses/expense-repository.model'
import { useAppTheme } from '@/theme/theme-provider'
import { nunitoFamily } from '@/theme/typography'

export interface NotesFieldProps {
  value: string
  onChange: (next: string) => void
}

export function NotesField({ value, onChange }: NotesFieldProps) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  const skin = useWizardSkin()
  const neo = skin.kind === 'neo' ? skin : null
  // Un prefill con nota (hoy no existe, pero el contrato lo admite) abre el
  // campo de entrada: si hay texto, esconderlo detrás de un chip sería mentir
  // sobre lo que se va a guardar.
  const [isOpen, setIsOpen] = useState(() => value.trim().length > 0)
  // Sólo enfoca cuando lo abrió el usuario. Con el prefill el campo nace
  // abierto y levantar el teclado al entrar al alta taparía la card de monto,
  // que es donde empieza el recorrido.
  const [autoFocus, setAutoFocus] = useState(false)

  // `layout` y nada más: las dos ramas devuelven el MISMO `Animated.View` en la
  // misma posición, así que React reusa el nodo y `entering`/`exiting` no
  // dispararían nunca. Lo que hay que animar es el alto (chip ⇄ pozo), que es
  // justo lo que hace el layout. La entrada inicial la pone el `RiseView` del
  // formulario que lo monta.
  if (!isOpen) {
    return (
      <Animated.View layout={STEP_LAYOUT}>
        <Pressable
          onPress={() => {
            setAutoFocus(true)
            setIsOpen(true)
          }}
          accessibilityRole="button"
          accessibilityLabel={t('gastos:addExpense.wizard.step2.notesAddA11y')}
          accessibilityState={{ expanded: false }}
          // El chip mide ~34pt de alto (padV 7 + 12px de texto), abajo del
          // mínimo de 44. El `hitSlop` agranda el área real sin tocar el
          // layout del handoff — mismo recurso que `SuggestedAmountStrip` y
          // que `QuickTextChips`.
          hitSlop={{ top: 6, bottom: 6, left: 8, right: 8 }}
          style={[
            styles.chip,
            { backgroundColor: theme.colors.creamSoft, borderColor: theme.colors.line },
            neo
              ? {
                  backgroundColor: neo.add.quickChip.background,
                  experimental_backgroundImage: neo.add.quickChip.gradientCss,
                  borderRadius: neo.add.quickChip.radius,
                  borderWidth: 0,
                  boxShadow: neo.add.quickChip.shadow,
                  paddingHorizontal: neo.add.quickChip.padH,
                  paddingVertical: neo.add.quickChip.padV,
                }
              : null,
          ]}
        >
          <Text
            style={[
              styles.chipText,
              { color: theme.colors.text },
              neo
                ? {
                    // La variante de TEXTO del clay: `quickChip.ink` es
                    // `#C25B33`, que a 12px sobre la superficie del chip se
                    // queda abajo de AA. Ver `accentClayInk` en la piel.
                    color: neo.add.accentClayInk,
                    fontSize: neo.add.quickChip.fontSize,
                    fontFamily: neo.font('800'),
                  }
                : null,
            ]}
          >
            {t('gastos:addExpense.wizard.step2.notesAdd')}
          </Text>
        </Pressable>
      </Animated.View>
    )
  }

  const canCollapse = value.trim().length === 0

  return (
    <Animated.View layout={STEP_LAYOUT}>
      <View style={styles.labelRow}>
        <Text
          style={[
            styles.eyebrow,
            { color: theme.colors.textMuted },
            neo ? { ...neo.add.sectionLabel, color: neo.add.sectionLabelInk } : null,
          ]}
        >
          {t('gastos:addExpense.wizard.step2.notesLabel')}
        </Text>
        {canCollapse ? (
          <Pressable
            onPress={() => setIsOpen(false)}
            accessibilityRole="button"
            accessibilityLabel={t('gastos:addExpense.wizard.step2.notesRemoveA11y')}
            // El texto mide ~15pt de alto: el `hitSlop` es lo que lo lleva al
            // mínimo de 44 sin meter una caja de 44 en la fila del label.
            hitSlop={{ top: 16, bottom: 16, left: 14, right: 14 }}
            style={styles.removeHit}
          >
            <Text
              style={[
                styles.remove,
                { color: theme.colors.textMuted },
                neo ? { color: neo.faintInk, fontFamily: neo.font('800') } : null,
              ]}
            >
              {t('gastos:addExpense.wizard.step2.notesRemove')}
            </Text>
          </Pressable>
        ) : null}
      </View>
      <View
        style={[
          styles.notesWrap,
          { backgroundColor: theme.colors.surface, borderColor: theme.colors.line },
          neo
            ? {
                // El pozo es SOLO sombra inset y Android < API 29 la descarta
                // en silencio: sin el hairline queda un rectángulo `#F4F5EE`
                // sobre `#E9EBE0` (~1.06:1) y no se ve dónde tocar. Mismo
                // fallback que `AmountCard` y que el pozo de descripción.
                borderWidth: SUPPORTS_INSET_SHADOW ? 0 : 1,
                borderColor: theme.colors.border,
                backgroundColor: neo.add.well.background,
                borderRadius: neo.add.well.radius,
                boxShadow: neo.add.well.shadow,
              }
            : null,
        ]}
      >
        <TextInput
          value={value}
          onChangeText={onChange}
          autoFocus={autoFocus}
          // El `<Text>` del label es un HERMANO: no lo toma el lector. Y el
          // `placeholder` sólo hace de label accesible mientras el campo está
          // VACÍO (en TalkBack ni eso), así que apenas hay una nota escrita
          // VoiceOver leía el texto libre ("cumple de mamá") sin decir de qué
          // campo se trata. Mismo tratamiento que el pozo de descripción.
          accessibilityLabel={t('gastos:addExpense.wizard.step2.notesLabel')}
          placeholder={t('gastos:addExpense.wizard.step2.notesPlaceholder')}
          placeholderTextColor={neo ? neo.faintInk : theme.colors.textSoft}
          multiline
          maxLength={EXPENSE_NOTES_MAX_LENGTH}
          textAlignVertical="top"
          style={[
            styles.notesInput,
            { color: theme.colors.text },
            neo
              ? {
                  paddingHorizontal: 17,
                  paddingVertical: 14,
                  fontSize: 14.5,
                  fontWeight: '700',
                  fontFamily: neo.font('700'),
                  color: neo.ink.title,
                }
              : null,
          ]}
        />
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: 'flex-start',
    borderRadius: 13,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 7,
  },
  chipText: { fontSize: 12, fontWeight: '800', fontFamily: nunitoFamily('800') },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  eyebrow: { fontSize: 10, letterSpacing: 1.6, fontWeight: '700', fontFamily: nunitoFamily('700') },
  removeHit: { marginLeft: 'auto' },
  remove: { fontSize: 11, fontWeight: '800', fontFamily: nunitoFamily('800') },
  notesWrap: { borderRadius: 14, borderWidth: 1 },
  notesInput: {
    minHeight: 72,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '600',
    fontFamily: nunitoFamily('600'),
  },
})
