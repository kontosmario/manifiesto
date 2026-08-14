import { memo } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui/app-text'
import { useTranslation } from 'react-i18next'
import { MaterialIcons } from '@expo/vector-icons'
import { TourTarget } from '@/features/tours'
import { TOUR_KEYS } from '@/features/tours/tour-keys'
import { HOME_SPEC, type HomeMode } from '@/components/redesign/home/home-spec'
import { triggerHaptic } from '@/lib/haptics'
import { cssGradient, neoRadii, neoTokens } from '@/theme/neo-tokens'
import { useThemeMode } from '@/theme/theme-provider'
import { nunitoFamily } from '@/theme/typography'

interface StartingBalanceCtaProps {
  /** Called when user taps "Confirmar". Owner provides the modal/sheet UX. */
  onPress: () => void
  /** Tour order to register with — kept loose so the home-tour author
   *  can renumber steps without changing this component. */
  tourOrder: number
}

/**
 * Barra COMPACTA (una línea) que aparece en Home cuando el ciclo todavía no
 * tiene `current_cycle_starting_balance` confirmado. Comparte el material del
 * HERO de la Home (gradiente forest + `heroShadow` del HOME_SPEC) y cierra con
 * el pill crema del catálogo, así esta card —que es importante— se lee dentro
 * de la jerarquía del hero y no como un cartel suelto. Una vez confirmado el
 * saldo, el padre (CollapsingReveal) la colapsa y desmonta.
 */
function StartingBalanceCtaImpl({ onPress, tourOrder }: StartingBalanceCtaProps) {
  const mode = useThemeMode().resolvedMode as HomeMode
  const s = HOME_SPEC[mode]
  const neo = neoTokens(mode)
  const { t } = useTranslation()

  const handlePress = () => {
    void triggerHaptic('selection')
    onPress()
  }

  return (
    <TourTarget order={tourOrder} tour={TOUR_KEYS.home} text={t('home:startingBalanceCta.tourText')}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('home:startingBalanceCta.accessibility')}
        onPress={handlePress}
        style={({ pressed }) => ({ opacity: pressed ? 0.92 : 1 })}
      >
        <View
          style={[
            styles.card,
            cssGradient(s.heroGradientCss, neo.greenDeep),
            { boxShadow: s.heroShadow },
          ]}
        >
          <MaterialIcons name="savings" size={18} color={s.heroDot} />
          <Text
            style={[styles.title, { color: s.balanceInk }]}
            numberOfLines={1}
          >
            {t('home:startingBalanceCta.title')}
          </Text>
          <View
            style={[
              styles.ctaPill,
              cssGradient(s.ctaCreamGradientCss, neo.heroText),
              { boxShadow: s.ctaCreamShadow },
            ]}
          >
            <Text style={[styles.ctaPillText, { color: s.ctaCreamInk }]}>
              {t('home:startingBalanceCta.confirm')}
            </Text>
          </View>
        </View>
      </Pressable>
    </TourTarget>
  )
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: neoRadii.pill,
  },
  title: {
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: -0.2,
  },
  ctaPill: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: neoRadii.chip,
  },
  ctaPillText: {
    fontSize: 12,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    letterSpacing: -0.2,
  },
})

export const StartingBalanceCta = memo(StartingBalanceCtaImpl)
