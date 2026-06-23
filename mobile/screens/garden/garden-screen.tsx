import { useCallback } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Screen } from '@/components/ui/screen'
import { AmbientBlobs } from '@/components/home/ambient-blobs'
import { RiseView } from '@/components/home/animated/rise-view'
import { FernMark } from '@/components/billing/fern-mark'
import { GardenHero } from '@/components/garden/garden-hero'
import { GardenGrid } from '@/components/garden/garden-grid'
import { WeekCloseBanner } from '@/components/garden/week-close-banner'
import { useGarden } from '@/features/garden/use-garden'
import { triggerHaptic } from '@/lib/haptics'
import { DARK_TAB_CANVAS } from '@/theme/palette'
import { useAppTheme } from '@/theme/theme-provider'

interface GardenScreenProps {
  familyId: string
  userId: string
}

const FOOTNOTE =
  'Tu jardín crece solo: cada gasto que registrás planta el brote del día. ¿No gastaste? Marcá el día sin gastos en el calendario y también suma.'

/**
 * Pantalla "Mi jardín" — vista dedicada de la racha (accesible desde Gastos).
 * Es de SOLO LECTURA: el brote se planta automáticamente al registrar un gasto
 * o pago de fijo (trigger server-side) o al marcar un día sin gastos en el
 * calendario de Gastos. El jardín solo refleja esas dos señales (no hay acción
 * manual de "plantar").
 */
export function GardenScreen({ familyId, userId }: GardenScreenProps) {
  const { theme } = useAppTheme()
  const { data } = useGarden(familyId, userId)

  const handleOpenWeekClose = useCallback(() => {
    // E2 cablea acá la celebración de "Cierre de semana".
    void triggerHaptic('selection')
  }, [])

  return (
    <Screen
      backgroundColor={theme.isDark ? DARK_TAB_CANVAS : undefined}
      title="Mi jardín"
      subtitle="Un brote por cada día que registrás."
      canGoBack
      rightSlot={
        <View
          style={[
            styles.avatar,
            { backgroundColor: theme.isDark ? 'rgba(166,239,143,0.16)' : '#FFFFFF' },
          ]}
        >
          <FernMark variant={theme.isDark ? 'mint' : 'forest'} size={24} />
        </View>
      }
      bodyStyle={styles.body}
      backgroundSlot={<AmbientBlobs tone={theme.isDark ? 'calm' : 'aurora'} />}
    >
      {data && (
        <>
          <RiseView delay={0} translateY={0} duration={400}>
            <GardenHero
              streak={data.currentStreak}
              total={data.totalDaysLogged}
              record={data.longestStreak}
              seeds={data.freezeTokens}
            />
          </RiseView>
          <RiseView delay={75} translateY={0} duration={400}>
            <WeekCloseBanner weekClose={data.weekClose} onPress={handleOpenWeekClose} />
          </RiseView>
          <RiseView delay={150} translateY={0} duration={400}>
            <View
              style={[
                styles.gardenCard,
                {
                  backgroundColor: theme.isDark
                    ? theme.colors.surfaceMuted
                    : theme.colors.creamCard,
                  borderColor: theme.colors.line,
                },
              ]}
            >
              <View style={styles.gardenHeader}>
                <Text style={[styles.gardenTitle, { color: theme.colors.text }]}>Tu jardín</Text>
                <Text style={[styles.gardenMeta, { color: theme.colors.textSoft }]}>
                  últimas 5 semanas
                </Text>
              </View>
              <View style={styles.gridWrap}>
                <GardenGrid cells={data.cells} />
              </View>
            </View>
          </RiseView>
          <RiseView delay={225} translateY={0} duration={400}>
            <Text style={[styles.footnote, { color: theme.colors.textSoft }]}>{FOOTNOTE}</Text>
          </RiseView>
        </>
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  body: {
    gap: 14,
    paddingBottom: 32,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 3px 10px rgba(28,58,35,0.08)',
  },
  gardenCard: {
    borderRadius: 30,
    paddingTop: 22,
    paddingHorizontal: 22,
    paddingBottom: 8,
    borderWidth: 1,
    boxShadow: '0 6px 24px rgba(28,58,35,0.07)',
  },
  gardenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  gardenTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  gardenMeta: {
    fontSize: 12,
    fontWeight: '700',
  },
  gridWrap: {
    marginTop: 16,
  },
  footnote: {
    fontSize: 12.5,
    lineHeight: 18.75,
    textAlign: 'center',
    paddingHorizontal: 10,
  },
})
