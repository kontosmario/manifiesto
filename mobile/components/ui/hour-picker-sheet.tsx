// Reusable hour picker — a bottom sheet wrapping the infinite HourCarousel
// plus a "Listo" CTA. The single component used everywhere the user sets a
// time-of-day (advisor quiet hours, check-in times, …) so every hour picker
// in the app looks and behaves the same.
//
// Commit model: the carousel commits live as it settles (onChange mutates),
// and the user dismisses with "Listo" (or backdrop / swipe-down). Pass a
// distinct `instanceKey` per slot so the reel remounts and re-centres on the
// new value when a different slot opens.
//
// Rediseño 2026-07: la hoja monta la piel `neo` de `ModalCard` (carcasa,
// píldora, tipografía del handoff) y el CTA es el `NeoButton` primario —
// el mismo fill radial verde + sombra `cta` que el resto del rediseño. La
// altura de 48pt del botón V1 se conserva con un override de estilo: esto
// es un cambio de MATERIAL, no de layout.

import { StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { ModalCard } from '@/components/ui/modal-card'
import { NeoButton } from '@/components/ui/neo-button'
import { HourCarousel } from '@/components/ui/hour-carousel'

interface Props {
  visible: boolean
  title: string
  /** Selected hour, 0–23. */
  value: number
  /** Identity of the open slot — remounts the reel when it changes. */
  instanceKey: string | number
  /** Commits the picked hour (live, as the reel settles). Does NOT close. */
  onChange: (hour: number) => void
  onClose: () => void
  subtitle?: string
  accessibilityLabel?: string
}

export function HourPickerSheet({
  visible,
  title,
  value,
  instanceKey,
  onChange,
  onClose,
  subtitle,
  accessibilityLabel,
}: Props) {
  const { t } = useTranslation()

  return (
    <ModalCard
      visible={visible}
      title={title}
      subtitle={subtitle ?? t('states:hourPicker.sheetSubtitle')}
      onClose={onClose}
      skin="neo"
    >
      <View style={styles.wrap}>
        <HourCarousel
          key={instanceKey}
          value={value}
          onChange={onChange}
          accessibilityLabel={accessibilityLabel}
        />
        {/* `NeoButton` ya dispara el háptico de selección al presionar, así
            que el cierre sólo tiene que propagar `onClose`. */}
        <NeoButton
          label={t('common:actions.done')}
          onPress={onClose}
          variant="primary"
          block
          style={styles.doneButton}
        />
      </View>
    </ModalCard>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: 16 },
  // Altura del CTA V1 preservada (el `NeoButton` la resolvería con su
  // padding vertical de 15 y quedaría ~5pt más alto).
  doneButton: {
    height: 48,
    paddingVertical: 0,
  },
})
