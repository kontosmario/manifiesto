import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui/app-text'
import { useTranslation } from 'react-i18next'
import { NeoTextField } from '@/components/ui/neo-text-field'
import { SUPPORTS_INSET_SHADOW } from '@/components/wizard/inset-shadow-support'
import { neoRadii, neoTokens } from '@/theme/neo-tokens'
import { nunitoFamily } from '@/theme/typography'
import { useThemeTokens } from '@/theme/theme-provider'
import { GoalIcon } from '../goal-icon'
import { GOAL_STICKER_KEYS } from '@/features/savings-goals/goal-icon'

// Íconos de meta ADICIONALES a los 5 stickers de `metas/*` (GOAL_STICKER_KEYS).
// Todos stickers del set del owner — reemplazan a los emojis viejos del picker
// (✈️→avión, 🏠→casa, 🚗→auto, 🎓→educación, 💻→compu, 🎁→regalo, 📱→celular,
// 💰→ahorro). Los redundantes (🎯≈objetivo, 💍≈anillo, 🏖️≈playa) ya están en
// GOAL_STICKER_KEYS. El valor guardado es la KEY del registry. Metas viejas con
// un emoji literal siguen rendeando por el fallback de GoalIcon.
export const GOAL_EXTRA_ICONS = [
  'transporte/avion',
  'vivienda/vivienda',
  'transporte/automovil',
  'educacion/educacion',
  'extra/computadora',
  'servicios-general/regalos',
  'tecnologia/celular',
  'finanzas/ahorro',
] as const

// Picker completo: 5 stickers `metas/*` + los 8 adicionales = 13 íconos.
const STICKER_OPTIONS = [...GOAL_STICKER_KEYS, ...GOAL_EXTRA_ICONS]

export const MAX_TITLE = 40

export interface Step1TitleProps {
  title: string
  onChangeTitle: (v: string) => void
  selectedEmoji: string
  onSelectEmoji: (emoji: string) => void
}

export function Step1Title({
  title,
  onChangeTitle,
  selectedEmoji,
  onSelectEmoji,
}: Step1TitleProps) {
  const theme = useThemeTokens()
  const neo = neoTokens(theme.mode)
  const { t } = useTranslation()
  return (
    <View style={styles.step1Body}>
      <NeoTextField
        label={t('settings:savingsWizard.nameLabel')}
        value={title}
        onChangeText={(v) => onChangeTitle(v.slice(0, MAX_TITLE))}
        placeholder={t('settings:savingsWizard.namePlaceholder')}
        autoCapitalize="sentences"
        // autoFocus removido a propósito: el teclado nativo en iOS
        // empujaba el sheet entero. Con KeyboardAvoidingView wrap +
        // tap-to-focus el flow se siente más controlado y no flashea.
        accessibilityLabel={t('settings:savingsWizard.nameLabel')}
        helper={`${title.length}/${MAX_TITLE}`}
      />

      <View style={[styles.divider, { backgroundColor: neo.sheetDivider }]} />

      <View style={styles.emojiSection}>
        <Text style={[styles.eyebrow, { color: neo.textMuted }]}>
          {t('settings:savingsWizard.chooseIcon')}
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.emojiScroll}
          contentContainerStyle={styles.emojiScrollContent}
          accessibilityLabel={t('settings:savingsWizard.iconScrollA11y')}
        >
          {/* 13 íconos de meta (todos stickers) en una fila scrolleable. */}
          {STICKER_OPTIONS.map((value) => {
            const isActive = value === selectedEmoji
            return (
              <Pressable
                key={value}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
                accessibilityLabel={t('settings:savingsWizard.iconA11y', { glyph: value })}
                onPress={() => onSelectEmoji(value)}
                style={({ pressed }) => [
                  styles.emojiCard,
                  isActive
                    ? {
                        backgroundColor: neo.selectedTint,
                        boxShadow: neo.shadows.ringSelected,
                      }
                    : {
                        backgroundColor: neo.surface,
                        boxShadow: neo.shadows.raisedSm,
                      },
                  // El tile seleccionado se comunica SOLO con relieve (pozo +
                  // anillo). Donde el sistema descarta el `boxShadow` los 13
                  // tiles quedarían idénticos: ahí el anillo se dibuja como
                  // borde y el resto queda plano.
                  SUPPORTS_INSET_SHADOW
                    ? null
                    : {
                        borderWidth: isActive ? 2.5 : 1,
                        borderColor: isActive ? neo.green : neo.sheetDivider,
                      },
                  { opacity: pressed ? 0.78 : 1 },
                ]}
              >
                <GoalIcon value={value} size={30} emojiStyle={styles.emojiGlyph} />
              </Pressable>
            )
          })}
        </ScrollView>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  step1Body: {
    gap: 16,
  },
  divider: {
    height: 1.5,
  },
  emojiSection: {
    gap: 10,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  // Single-row horizontal scroll — pedido del owner. 12 emojis no
  // entran en ancho de pantalla; ScrollView horizontal mantiene
  // todos visibles deslizando lateral.
  emojiScroll: {
    flexGrow: 0,
    // Sangra hacia afuera lo mismo que el padding de adentro: la fila
    // conserva su alineación con el resto del paso y la sombra igual entra
    // en el área de clip del ScrollView.
    marginHorizontal: -10,
  },
  emojiScrollContent: {
    // El sangrado compensa el recorte de la sombra contra los bordes del
    // ScrollView (offset 5 + blur 10 de `raisedSm`).
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  emojiCard: {
    width: 54,
    height: 54,
    borderRadius: neoRadii.tile,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiGlyph: {
    fontSize: 26,
  },
})
