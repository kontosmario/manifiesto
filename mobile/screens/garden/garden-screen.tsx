import { useCallback, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'expo-router'
import { Screen } from '@/components/ui/screen'
import { RiseView } from '@/components/home/animated/rise-view'
import { BrotMascot } from '@/components/brot'
import { ChevronBackIcon } from '@/components/redesign/auth/auth-icons'
import { SUPPORTS_INSET_SHADOW } from '@/components/wizard/inset-shadow-support'
import { GardenHero } from '@/components/garden/garden-hero'
import { GardenGrid } from '@/components/garden/garden-grid'
import { WeekCloseBanner } from '@/components/garden/week-close-banner'
import { WeekCloseCelebration } from '@/components/garden/week-close-celebration'
import { GARDEN_GEOMETRY } from '@/components/redesign/garden/garden-spec'
import { useGarden } from '@/features/garden/use-garden'
import { triggerHaptic } from '@/lib/haptics'
import { motionStagger } from '@/lib/motion'
import { buildMinimumTouchTargetHitSlop } from '@/theme/interaction'
import { neoInk } from '@/theme/neo-ink'
import { neoMaterial, neoRadii, neoTokens } from '@/theme/neo-tokens'
import { nunitoFamily } from '@/theme/typography'
import { useThemeTokens } from '@/theme/theme-provider'

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
  const theme = useThemeTokens()
  const neo = neoTokens(theme.mode)
  const ink = neoInk(theme.mode)
  const { t } = useTranslation()
  const router = useRouter()
  const { data } = useGarden(familyId, userId)
  const [showWeekClose, setShowWeekClose] = useState(false)

  const handleOpenWeekClose = useCallback(() => {
    void triggerHaptic('selection')
    setShowWeekClose(true)
  }, [])

  const handleBack = useCallback(() => {
    void triggerHaptic('selection')
    router.back()
  }, [router])

  return (
    <>
      <Screen backgroundColor={neo.bg} bodyStyle={styles.body}>
        <View style={styles.header}>
          <Pressable
            accessibilityLabel={t('common:actions.back')}
            accessibilityRole="button"
            hitSlop={buildMinimumTouchTargetHitSlop(GARDEN_GEOMETRY.backSize)}
            onPress={handleBack}
            style={({ pressed }) => [
              styles.back,
              neoMaterial(theme.mode, pressed && SUPPORTS_INSET_SHADOW ? 'insetSm' : 'raisedMd'),
              pressed && !SUPPORTS_INSET_SHADOW ? styles.pressedFlat : null,
            ]}
          >
            <ChevronBackIcon color={neo.text} />
          </Pressable>
          <View style={styles.headerText}>
            <Text style={[styles.title, { color: neo.text }]}>{t('garden:screen.title')}</Text>
            <Text style={[styles.subtitle, { color: neo.textMuted }]}>
              {t('garden:screen.subtitle')}
            </Text>
          </View>
          <BrotMascot pose="wave" size={GARDEN_GEOMETRY.headerBrotSize} shadow={false} />
        </View>

        {data && (
          <>
            <RiseView delay={0}>
              <GardenHero
                streak={data.currentStreak}
                total={data.totalDaysLogged}
                record={data.longestStreak}
                seeds={data.freezeTokens}
              />
            </RiseView>
            {data.weekCloseAvailable && (
              <RiseView delay={motionStagger.section}>
                <WeekCloseBanner weekClose={data.weekClose} onPress={handleOpenWeekClose} />
              </RiseView>
            )}
            <RiseView delay={motionStagger.section * 2}>
              <View style={[styles.gardenCard, neoMaterial(theme.mode, 'raisedLg')]}>
                <View style={styles.gardenHeader}>
                  <Text style={[styles.gardenTitle, { color: neo.text }]}>
                    {t('garden:card.title')}
                  </Text>
                  <Text style={[styles.gardenMeta, { color: ink.accent }]}>
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
            <RiseView delay={motionStagger.section * 3}>
              <Text style={[styles.footnote, { color: neo.textMuted }]}>
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
    gap: 16,
    paddingBottom: 28,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  back: {
    width: GARDEN_GEOMETRY.backSize,
    height: GARDEN_GEOMETRY.backSize,
    borderRadius: neoRadii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressedFlat: {
    opacity: 0.82,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 30,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    // En iOS la baseline cae a `lineHeight − descent` del tope de la caja. Con
    // el 1.05 del mockup web quedaban 0.697em de alto útil y una minúscula
    // acentuada de Nunito 900 sube 0.788em: la tilde de "jardín" salía cortada.
    lineHeight: 30 * 1.2,
    letterSpacing: -0.6,
  },
  subtitle: {
    fontSize: 12.5,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    marginTop: 2,
  },
  gardenCard: {
    borderRadius: GARDEN_GEOMETRY.cardRadius,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
  },
  gardenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  gardenTitle: {
    fontSize: 15,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
  },
  gardenMeta: {
    fontSize: 11.5,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
  },
  gridWrap: {
    marginTop: 12,
  },
  footnote: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    lineHeight: 18.6,
    textAlign: 'center',
    paddingHorizontal: 10,
  },
})
