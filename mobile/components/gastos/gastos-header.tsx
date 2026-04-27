import type { ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { RiseView } from '@/components/home/animated/rise-view'
import { useAppTheme } from '@/theme/theme-provider'

interface GastosHeaderProps {
  title?: string
  subtitle?: string
  /** Slot en la esquina superior derecha. Hoy lo usa StreakFlameIcon;
   * antes era el botón + para registrar gasto. */
  rightSlot?: ReactNode
}

export function GastosHeader({
  title = 'Gastos',
  subtitle = 'Historial, filtros y edición rápida de movimientos.',
  rightSlot,
}: GastosHeaderProps) {
  const { theme } = useAppTheme()

  return (
    <RiseView>
      <View style={styles.row}>
        <View style={styles.titleBlock}>
          <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
          {subtitle ? (
            <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>{subtitle}</Text>
          ) : null}
        </View>
        {rightSlot ? <View style={styles.rightSlot}>{rightSlot}</View> : null}
      </View>
    </RiseView>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingTop: 2,
  },
  titleBlock: { flex: 1 },
  title: {
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -1.2,
    lineHeight: 34,
  },
  subtitle: {
    fontSize: 13,
    marginTop: 6,
    lineHeight: 18,
    maxWidth: 230,
  },
  rightSlot: {
    marginTop: 6,
    marginLeft: 8,
  },
})
