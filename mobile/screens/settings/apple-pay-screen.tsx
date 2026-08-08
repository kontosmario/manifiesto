// Captura de gastos con Apple Pay — pantalla de configuración.
//
// La pantalla ES, en los hechos, el producto: Apple no expone ninguna API
// para crear la automatización de Atajos, así que lo único que podemos
// hacer es prender la captura, explicar los cinco pasos y abrir Atajos.
// El resto lo arma el usuario a mano.
//
// Construida sobre el sistema agrupado de Ajustes (SettingsGroup /
// SettingsSwitchRow) para que se vea y se comporte igual que sus vecinas,
// con el vocabulario neumórfico (`neoInk` / `neoTokens`, cero
// `theme.colors`).

import { useCallback } from 'react'
import { Linking, Platform, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'

import { RiseView } from '@/components/home/animated/rise-view'
import { SettingsGroup, SettingsSwitchRow } from '@/components/settings/settings-grouped-list'
import { NeoButton } from '@/components/ui/neo-button'
import { Screen } from '@/components/ui/screen'
import { useApplePayCaptureEnabled } from '@/features/apple-pay-capture/apple-pay-enabled-store'
import { isApplePayCaptureSupported } from '@/features/apple-pay-capture/native'
import { toast } from '@/lib/toast-bus'
import { neoInk } from '@/theme/neo-ink'
import { neoRadii, neoTokens } from '@/theme/neo-tokens'
import { useAppTheme } from '@/theme/theme-provider'
import { nunitoFamily } from '@/theme/typography'

export type ApplePayGate = 'ok' | 'not-ios' | 'needs-app-update' | 'needs-ios-17'

/**
 * Los tres motivos por los que la captura NO está disponible le dicen
 * cosas DISTINTAS al usuario ("cambiá de teléfono" / "actualizá la app" /
 * "actualizá iOS"), así que se resuelven por separado y en este orden.
 */
export function resolveApplePayGate(): ApplePayGate {
  if (Platform.OS !== 'ios') return 'not-ios'
  // `isApplePayCaptureSupported` sólo dice si el módulo nativo existe,
  // o sea si la build es lo bastante nueva.
  if (!isApplePayCaptureSupported()) return 'needs-app-update'
  // El disparador "Transacción" existe recién en iOS 17, aunque el
  // intent compile y corra desde iOS 16.
  if (Number.parseInt(String(Platform.Version), 10) < 17) return 'needs-ios-17'
  return 'ok'
}

// El esquema que abre Atajos directo en la pantalla de automatización
// nueva. Si el usuario borró Atajos, `openURL` rechaza y cae al toast.
const SHORTCUTS_NEW_AUTOMATION_URL = 'shortcuts://create-automation'

const STEP_KEYS = ['step1', 'step2', 'step3', 'step4', 'step5'] as const

export function ApplePayScreen() {
  const { t } = useTranslation()
  const { theme } = useAppTheme()
  const neo = neoTokens(theme.mode)
  const ink = neoInk(theme.mode)

  const gate = resolveApplePayGate()
  const { enabled, loaded, setEnabled } = useApplePayCaptureEnabled()
  // `loaded` evita que el switch parpadee de apagado a prendido mientras
  // se lee el valor persistido del keychain.
  const switchDisabled = gate !== 'ok' || !loaded

  const handleOpenShortcuts = useCallback(() => {
    Linking.openURL(SHORTCUTS_NEW_AUTOMATION_URL).catch(() => {
      toast.error(t('settings:applePay.openShortcutsError'))
    })
  }, [t])

  return (
    <Screen
      backgroundColor={neo.bg}
      canGoBack
      subtitle={t('settings:applePay.intro')}
      title={t('settings:applePay.title')}
      titleColor={neo.text}
    >
      {/* 1. El interruptor. El footer carga la nota de expectativa —
          obligatoria: Apple documenta que el disparador es best-effort y
          se saltea pagos, así que el copy NO promete captura perfecta.
          Cuando la captura no está disponible, el footer explica por qué
          en vez de prometer nada. */}
      <RiseView delay={40} style={styles.block}>
        <SettingsGroup
          footer={
            gate === 'ok'
              ? t('settings:applePay.expectation')
              : t(`settings:applePay.gate.${gate}`)
          }
          title={t('settings:applePay.toggleGroup')}
        >
          <SettingsSwitchRow
            disabled={switchDisabled}
            icon="contactless"
            isLast
            label={t('settings:applePay.toggleLabel')}
            onValueChange={setEnabled}
            value={enabled}
          />
        </SettingsGroup>
      </RiseView>

      {/* 2. Los pasos: sólo con la captura prendida. Apagada son ruido —
          el usuario todavía no decidió usar la función. */}
      {enabled && gate === 'ok' ? (
        <RiseView delay={100} style={styles.block}>
          <SettingsGroup title={t('settings:applePay.stepsTitle')}>
            <View style={styles.steps}>
              {STEP_KEYS.map((key, index) => (
                <View key={key} style={styles.step}>
                  <View
                    style={[
                      styles.stepBadge,
                      { backgroundColor: neo.well, boxShadow: neo.shadows.insetSm },
                    ]}
                  >
                    <Text style={[styles.stepNumber, { color: ink.accent }]}>
                      {String(index + 1)}
                    </Text>
                  </View>
                  <Text style={[styles.stepText, { color: neo.text }]}>
                    {t(`settings:applePay.${key}`)}
                  </Text>
                </View>
              ))}
            </View>
          </SettingsGroup>

          <NeoButton
            block
            label={t('settings:applePay.openShortcuts')}
            onPress={handleOpenShortcuts}
          />
        </RiseView>
      ) : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  // Separación entre bloques (cada RiseView). Se suma al gap del Screen.
  block: { marginTop: 6, gap: 12 },
  steps: { gap: 14, paddingHorizontal: 16, paddingVertical: 16 },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  // Pozo circular con el número: el mismo sub-relieve que los tiles de
  // ícono de las filas, para que la lista no invente material nuevo.
  stepBadge: {
    width: 26,
    height: 26,
    borderRadius: neoRadii.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumber: { fontSize: 13, fontWeight: '800', fontFamily: nunitoFamily('800') },
  stepText: { flex: 1, fontSize: 14, lineHeight: 20, fontFamily: nunitoFamily('500') },
})
