// Form field wrapper: eyebrow label + children. Extraído de
// `add-fijo-v2-screen.tsx` para uniformar los labels del wizard.
import type { ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useFijosSkin } from '@/components/fijos/fijos-skin'
import { useAppTheme } from '@/theme/theme-provider'

export function Field({
  label,
  children,
  hint,
  trailing,
}: {
  label: string
  children: ReactNode
  /** Píldora verde a la derecha del label (ej. "sugerida por el nombre"). */
  hint?: string
  /** Texto auxiliar alineado a la derecha del label (ej. "editar"). */
  trailing?: string
}) {
  const { theme } = useAppTheme()
  const skin = useFijosSkin()
  const neo = skin.kind === 'neo' ? skin : null
  return (
    <View>
      <View style={styles.labelRow}>
        <Text
          style={[
            styles.eyebrow,
            { color: theme.colors.textMuted, marginBottom: 6 },
            neo ? { ...neo.add.sectionLabel, color: neo.add.sectionLabelInk, marginBottom: 8 } : null,
          ]}
        >
          {label}
        </Text>
        {/* Píldora del handoff: verde suave, 9.5/800, radio 8. Solo en `neo`
            — la pantalla vieja nunca la tuvo. */}
        {hint && neo ? (
          <Text
            style={[
              styles.hintPill,
              { color: neo.detail.ctaEditInk, backgroundColor: neo.accent('paid').chipBackground },
            ]}
          >
            {hint}
          </Text>
        ) : null}
        {trailing && neo ? (
          <Text style={[styles.trailing, { color: neo.ink.meta }]}>{trailing}</Text>
        ) : null}
      </View>
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  eyebrow: { fontSize: 10, letterSpacing: 1.6, fontWeight: '700' },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hintPill: {
    borderRadius: 8,
    fontSize: 9.5,
    fontWeight: '800',
    marginBottom: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  // Empujado a la derecha: el label queda a la izquierda y esto al final.
  trailing: { fontSize: 11, fontWeight: '800', marginBottom: 8, marginLeft: 'auto' },
})
