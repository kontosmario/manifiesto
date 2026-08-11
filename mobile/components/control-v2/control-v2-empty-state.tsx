import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import Svg, { Path } from 'react-native-svg'
import { RiseView } from '@/components/home/animated/rise-view'
import { NeoButton } from '@/components/ui/neo-button'
import { NeoSurface } from '@/components/ui/neo-surface'
import { SUPPORTS_INSET_SHADOW } from '@/components/wizard/inset-shadow-support'
import { neoInk } from '@/theme/neo-ink'
import { neoRadii, neoTokens } from '@/theme/neo-tokens'
import { nunitoFamily } from '@/theme/typography'
import { useThemeTokens } from '@/theme/theme-provider'

interface ControlV2EmptyStateProps {
  /** True si el usuario aún no configuró su sueldo mensual. */
  missingIncome: boolean
  /** True si el usuario aún no registró ningún gasto. */
  missingExpenses: boolean
  /** Modo INGRESO DINÁMICO sin ingresos cargados este ciclo: la guía
   *  pide cargar el primer ingreso (CTA a add-income) en vez de
   *  configurar un sueldo. */
  dynamicNoIncome?: boolean
  onPressSetupIncome: () => void
  onPressAddExpense: () => void
  onPressAddIncome?: () => void
}

/**
 * Vista del Control para cuentas recién creadas.
 *
 * La otra versión llamaba a `buildControlSignals` con un dataset mock
 * si faltaban ingreso/gastos — eso pintaba en pantalla cupos, rachas
 * y promedios que no eran del usuario. Aquí devolvemos una vista
 * neutra que explica por qué no hay datos todavía y guía al próximo
 * paso según lo que falte.
 */
export function ControlV2EmptyState({
  missingIncome,
  missingExpenses,
  dynamicNoIncome = false,
  onPressSetupIncome,
  onPressAddExpense,
  onPressAddIncome,
}: ControlV2EmptyStateProps) {
  const theme = useThemeTokens()
  const neo = neoTokens(theme.mode)
  const ink = neoInk(theme.mode)
  // Sin relieve la card queda del mismo material que el fondo de la
  // pantalla y el bloque entero desaparece (Android < API 28 descarta el
  // boxShadow outset en silencio).
  const flatFallback = SUPPORTS_INSET_SHADOW
    ? null
    : { borderWidth: 1, borderColor: neo.sheetDivider }
  const { t } = useTranslation()

  const heading = dynamicNoIncome
    ? t('control:empty.headingDynamicNoIncome')
    : missingIncome
      ? t('control:empty.headingMissingIncome')
      : missingExpenses
        ? t('control:empty.headingMissingExpenses')
        : t('control:empty.headingGathering')

  const subtitle = dynamicNoIncome
    ? t('control:empty.subtitleDynamicNoIncome')
    : missingIncome
      ? t('control:empty.subtitleMissingIncome')
      : missingExpenses
        ? t('control:empty.subtitleMissingExpenses')
        : t('control:empty.subtitleGathering')

  const cta = dynamicNoIncome
    ? {
        label: t('control:empty.ctaAddIncome'),
        a11y: t('control:empty.a11yAddIncome'),
        onPress: onPressAddIncome,
      }
    : missingIncome
      ? {
          label: t('control:empty.ctaSetupIncome'),
          a11y: t('control:empty.a11ySetupIncome'),
          onPress: onPressSetupIncome,
        }
      : {
          label: t('control:empty.ctaAddExpense'),
          a11y: t('control:empty.a11yAddExpense'),
          onPress: onPressAddExpense,
        }

  return (
    <RiseView delay={80}>
      <NeoSurface radius={neoRadii.card} style={[styles.card, flatFallback]} variant="raisedLg">
        <View style={styles.iconTile}>
          <NeoSurface
            radius={neoRadii.tile}
            style={[styles.iconTileSurface, flatFallback]}
            variant="raisedMd"
          >
            <Svg width={26} height={26} viewBox="0 0 24 24" fill="none">
              <Path
                d="M12 5v14M5 12h14"
                stroke={ink.accent}
                strokeWidth={2.4}
                strokeLinecap="round"
              />
            </Svg>
          </NeoSurface>
        </View>

        <Text style={[styles.title, { color: neo.text }]}>{heading}</Text>
        <Text style={[styles.body, { color: neo.textMuted }]}>{subtitle}</Text>

        <NeoButton
          accessibilityLabel={cta.a11y}
          block
          // Sin háptico propio: los tres handlers del Control ya
          // disparan el suyo antes de rutear.
          haptic="none"
          label={cta.label}
          onPress={() => cta.onPress?.()}
          style={styles.cta}
        />

        <View style={styles.checklist}>
          <ChecklistRow
            done={dynamicNoIncome ? false : !missingIncome}
            text={
              dynamicNoIncome
                ? t('control:empty.checklistIncomeDynamic')
                : t('control:empty.checklistIncome')
            }
          />
          <ChecklistRow done={!missingExpenses} text={t('control:empty.checklistExpense')} />
        </View>
      </NeoSurface>
    </RiseView>
  )
}

function ChecklistRow({ done, text }: { done: boolean; text: string }) {
  const theme = useThemeTokens()
  const neo = neoTokens(theme.mode)
  const ink = neoInk(theme.mode)

  return (
    <NeoSurface
      // Cada paso es un pozo: hundido mientras falta, y el check verde
      // (más el peso de la tinta) es lo que marca el que ya está.
      radius={neoRadii.tile}
      style={[
        styles.checklistRow,
        SUPPORTS_INSET_SHADOW
          ? null
          : { borderWidth: StyleSheet.hairlineWidth, borderColor: neo.sheetDivider },
      ]}
      variant="insetSm"
    >
      <View
        style={[
          styles.checkCircle,
          {
            borderColor: done ? ink.accent : neo.textMuted,
            backgroundColor: done ? ink.accent : 'transparent',
          },
        ]}
      >
        {done ? (
          <Svg width={12} height={12} viewBox="0 0 24 24" fill="none">
            <Path
              d="M5 12l4 4 10-10"
              stroke={neo.ctaText}
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        ) : null}
      </View>
      <Text
        style={[
          styles.checklistText,
          { color: done ? neo.text : neo.textMuted },
        ]}
      >
        {text}
      </Text>
    </NeoSurface>
  )
}

const styles = StyleSheet.create({
  card: {
    padding: 22,
    gap: 12,
    alignItems: 'flex-start',
  },
  iconTile: {
    marginBottom: 2,
  },
  iconTileSurface: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    letterSpacing: -0.5,
    lineHeight: 27,
  },
  body: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: nunitoFamily('600'),
    lineHeight: 19,
  },
  cta: {
    marginTop: 4,
  },
  checklist: {
    width: '100%',
    marginTop: 6,
    gap: 8,
  },
  checklistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  checkCircle: {
    width: 20,
    height: 20,
    borderRadius: 999,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checklistText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
  },
})
