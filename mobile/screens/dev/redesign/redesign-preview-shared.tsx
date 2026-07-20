// @i18n-ignore-file — tooling dev-only gated por __DEV__.
import type { PropsWithChildren } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useThemeTokens } from '@/theme/theme-provider'
import type { PreviewApprovalStatus } from '@/screens/dev/redesign/redesign-approval-status'

/**
 * Piezas compartidas de los previews del rediseño 2026-07 (dev-only).
 *
 * `PreviewPhoneSection` reproduce el contexto del mockup: un frame con
 * el fondo del tema del design doc (claro #E9EBE0 / oscuro #16271C)
 * para juzgar cada réplica sobre el material correcto, no sobre el
 * canvas actual de la app.
 *
 * `PreviewStatusChip` + `PreviewListRow` son la fila de índice con el
 * chip PENDIENTE/APROBADA; el estado vive en redesign-approval-status.
 */


export function PreviewSectionLabel({ title, source }: { title: string; source: string }) {
  const theme = useThemeTokens()
  return (
    <View style={styles.labelBlock}>
      <Text style={[styles.labelTitle, { color: theme.colors.text }]}>{title}</Text>
      <Text style={[styles.labelSource, { color: theme.colors.textMuted }]}>
        Fuente: design/rediseno-2026-07/{source}
      </Text>
    </View>
  )
}

export function PreviewPhoneSection({
  mode,
  minHeight = 200,
  children,
}: PropsWithChildren<{ mode: 'light' | 'dark'; minHeight?: number }>) {
  return (
    <View
      style={[
        styles.phone,
        { backgroundColor: mode === 'dark' ? '#16271C' : '#E9EBE0', minHeight },
      ]}
    >
      {children}
    </View>
  )
}

/** Home indicator del mockup: 132×5, radius 3 (1b/1c). */
export function PreviewHomeIndicator({ mode }: { mode: 'light' | 'dark' }) {
  return (
    <View
      style={[
        styles.homeIndicator,
        mode === 'dark'
          ? { backgroundColor: '#F1EEDD', opacity: 0.7 }
          : { backgroundColor: '#24382A', opacity: 0.75 },
      ]}
    />
  )
}

export function PreviewStatusChip({ status }: { status: PreviewApprovalStatus }) {
  const theme = useThemeTokens()
  return (
    <View
      style={[
        styles.statusChip,
        status === 'aprobada'
          ? { backgroundColor: theme.colors.primarySurface }
          : { backgroundColor: 'rgba(217,126,79,0.15)' },
      ]}
    >
      <Text
        style={[
          styles.statusText,
          { color: status === 'aprobada' ? theme.colors.primary : '#C96F3F' },
        ]}
      >
        {status === 'aprobada' ? 'APROBADA' : 'PENDIENTE'}
      </Text>
    </View>
  )
}

export function PreviewListRow({
  label,
  detail,
  status,
  onPress,
}: {
  label: string
  detail: string
  status: PreviewApprovalStatus
  onPress: () => void
}) {
  const theme = useThemeTokens()
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[
        styles.row,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
      ]}
    >
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, { color: theme.colors.text }]}>{label}</Text>
        <Text style={[styles.rowDetail, { color: theme.colors.textMuted }]}>{detail}</Text>
      </View>
      <PreviewStatusChip status={status} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  labelBlock: {
    gap: 2,
    marginTop: 18,
    marginBottom: 10,
  },
  labelTitle: {
    fontSize: 15,
    fontWeight: '900',
  },
  labelSource: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  phone: {
    borderRadius: 28,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  homeIndicator: {
    width: 132,
    height: 5,
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowLabel: {
    fontSize: 15,
    fontWeight: '900',
  },
  rowDetail: {
    fontSize: 12,
    fontWeight: '600',
  },
  statusChip: {
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
})
