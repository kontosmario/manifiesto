import { useCallback, useState } from 'react'
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { Screen } from '@/components/ui/screen'
import { AmbientBlobs } from '@/components/home/ambient-blobs'
import { RiseView } from '@/components/home/animated/rise-view'
import { FernMark } from '@/components/billing/fern-mark'
import { GardenHero } from '@/components/garden/garden-hero'
import { GardenGrid } from '@/components/garden/garden-grid'
import { WeekCloseBanner } from '@/components/garden/week-close-banner'
import { WeekCloseCelebration } from '@/components/garden/week-close-celebration'
import { useGarden, useRecoverGardenDay } from '@/features/garden/use-garden'
import { triggerHaptic } from '@/lib/haptics'
import { DARK_TAB_CANVAS } from '@/theme/palette'
import { useAppTheme } from '@/theme/theme-provider'

interface GardenScreenProps {
  familyId: string
  userId: string
}

const FOOTNOTE =
  'Tu jardín crece solo: cada gasto que registras planta el brote del día. ¿No gastaste? Marca el día sin gastos en el calendario y también suma.'

/**
 * Pantalla "Mi jardín" — vista dedicada de la racha (accesible desde Gastos).
 * Casi de solo lectura: el brote se planta automáticamente al registrar un gasto
 * o pago de fijo (trigger server-side) o al marcar un día sin gastos. La ÚNICA
 * acción manual es "plantar el día que faltó" (recovery del 6/7): si la semana
 * cerrada quedó 6/7 y tienes un escudo, la celda del hueco es tappable y consume
 * el escudo para plantar un brote "recuperado" (no florece). Ver `recover_garden_day`.
 */
export function GardenScreen({ familyId, userId }: GardenScreenProps) {
  const { theme } = useAppTheme()
  const { data } = useGarden(familyId, userId)
  const recover = useRecoverGardenDay(familyId, userId)
  const [showWeekClose, setShowWeekClose] = useState(false)
  const [showLegend, setShowLegend] = useState(false)

  const handleOpenWeekClose = useCallback(() => {
    void triggerHaptic('selection')
    setShowWeekClose(true)
  }, [])

  const seeds = data?.freezeTokens ?? 0
  const handlePlantGap = useCallback(
    (iso: string) => {
      if (recover.isPending) return
      void triggerHaptic('selection')
      Alert.alert(
        'Planta el día que faltó',
        `La semana pasada registraste 6 de 7 días. Planta el que falta con una semilla guardada (tienes ${seeds}). No florece como una semana perfecta, pero completas tu jardín.`,
        [
          { text: 'Ahora no', style: 'cancel' },
          {
            text: 'Plantar',
            onPress: () =>
              recover.mutate(iso, {
                onSuccess: () => void triggerHaptic('success'),
                onError: (e) => {
                  void triggerHaptic('error')
                  Alert.alert('No se pudo plantar', e.message || 'Intenta de nuevo en un rato.')
                },
              }),
          },
        ],
      )
    },
    [recover, seeds],
  )

  return (
    <>
    <Screen
      backgroundColor={theme.isDark ? DARK_TAB_CANVAS : undefined}
      title="Mi jardín"
      subtitle="Un brote por cada día que registras."
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
          {data.weekCloseAvailable && (
            <RiseView delay={75} translateY={0} duration={400}>
              <WeekCloseBanner weekClose={data.weekClose} onPress={handleOpenWeekClose} />
            </RiseView>
          )}
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
                <Pressable
                  onPress={() => setShowLegend((v) => !v)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Qué significan los brotes"
                  style={styles.legendToggle}
                >
                  <Text style={[styles.legendToggleText, { color: theme.colors.textMuted }]}>
                    ¿qué significan?
                  </Text>
                  <MaterialIcons
                    name={showLegend ? 'expand-less' : 'expand-more'}
                    size={16}
                    color={theme.colors.textMuted}
                  />
                </Pressable>
              </View>
              <Text style={[styles.gardenMeta, { color: theme.colors.textSoft }]}>
                {data.weeksShown <= 1 ? 'tu primera semana' : `últimas ${data.weeksShown} semanas`}
              </Text>
              <View style={styles.gridWrap}>
                <GardenGrid
                  cells={data.cells}
                  showLegend={showLegend}
                  recoverableGapIso={data.recoverableGapIso}
                  onPlantGap={handlePlantGap}
                />
              </View>
            </View>
          </RiseView>
          <RiseView delay={225} translateY={0} duration={400}>
            <Text style={[styles.footnote, { color: theme.colors.textSoft }]}>{FOOTNOTE}</Text>
          </RiseView>
        </>
      )}
    </Screen>
    {showWeekClose && data && (
      <WeekCloseCelebration
        weekClose={data.weekClose}
        onContinue={() => setShowWeekClose(false)}
      />
    )}
    </>
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
    marginTop: 2,
  },
  legendToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  legendToggleText: {
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
