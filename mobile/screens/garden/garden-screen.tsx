import { useCallback, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Screen } from '@/components/ui/screen'
import { AmbientBlobs } from '@/components/home/ambient-blobs'
import { RiseView } from '@/components/home/animated/rise-view'
import { FernMark } from '@/components/billing/fern-mark'
import { GardenHero } from '@/components/garden/garden-hero'
import { GardenGrid } from '@/components/garden/garden-grid'
import { WeekCloseBanner } from '@/components/garden/week-close-banner'
import { WeekCloseCelebration } from '@/components/garden/week-close-celebration'
import { useGarden } from '@/features/garden/use-garden'
import { triggerHaptic } from '@/lib/haptics'
import { DARK_TAB_CANVAS } from '@/theme/palette'
import { useAppTheme } from '@/theme/theme-provider'

interface GardenScreenProps {
  familyId: string
  userId: string
}

/**
 * Pantalla "Mi jardín" — vista dedicada de la racha (accesible desde Gastos).
 * De solo lectura: el brote se planta automáticamente al registrar un gasto o
 * pago de fijo (trigger server-side) o al marcar un día sin gastos. Si faltás un
 * día y tienes un escudo, el motor lo recupera SOLO (consume el escudo y planta
 * un brote "recuperado" que no florece) — sin acción manual. Ver el trigger
 * `_advance_streak_internal` (Case 3) y el cron `cron_emit_streak_broken`.
 */
export function GardenScreen({ familyId, userId }: GardenScreenProps) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  const { data } = useGarden(familyId, userId)
  const [showWeekClose, setShowWeekClose] = useState(false)

  const handleOpenWeekClose = useCallback(() => {
    void triggerHaptic('selection')
    setShowWeekClose(true)
  }, [])

  return (
    <>
    <Screen
      backgroundColor={theme.isDark ? DARK_TAB_CANVAS : undefined}
      title={t('garden:screen.title')}
      subtitle={t('garden:screen.subtitle')}
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
                <Text style={[styles.gardenTitle, { color: theme.colors.text }]}>
                  {t('garden:card.title')}
                </Text>
                <Text style={[styles.gardenMeta, { color: theme.colors.textSoft }]}>
                  {data.weeksShown <= 1
                    ? t('garden:card.firstWeek')
                    : t('garden:card.weeksShown', { count: data.weeksShown })}
                </Text>
              </View>
              <View style={styles.gridWrap}>
                <GardenGrid cells={data.cells} />
              </View>
            </View>
          </RiseView>
          <RiseView delay={225} translateY={0} duration={400}>
            <Text style={[styles.footnote, { color: theme.colors.textSoft }]}>
              {t('garden:screen.footnote')}
            </Text>
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
    gap: 12,
    paddingBottom: 28,
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
    borderRadius: 28,
    paddingTop: 16,
    paddingHorizontal: 18,
    paddingBottom: 10,
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
    marginTop: 12,
  },
  footnote: {
    fontSize: 12.5,
    lineHeight: 18.75,
    textAlign: 'center',
    paddingHorizontal: 10,
  },
})
