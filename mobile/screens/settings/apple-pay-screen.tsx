// Captura de gastos con Apple Pay — pantalla de configuración.
//
// La pantalla ES, en los hechos, el producto: Apple no expone ninguna API
// para crear la automatización de Atajos, así que lo único que podemos
// hacer es prender la captura, explicar cómo se arma y abrir Atajos. El
// resto lo hace el usuario a mano, en otra app, sin que podamos verlo.
//
// De ahí las tres piezas de acá, en este orden:
//
//  1. ESTADO — lo primero después del switch. Una configuración que quedó
//     mal no falla con un error: falla en silencio, y el usuario se entera
//     días después, cuando le falta un gasto. El bloque muestra la última
//     captura RECIBIDA (comercio, monto, hace cuánto): ver ahí un pago
//     propio es la única prueba de que la automatización quedó bien.
//  2. PASOS — título corto + descripción, con un aviso en los tres pasos
//     donde Atajos tiene trampa (confirmación previa, acción equivocada,
//     variables tipeadas a mano). Cada aviso vive EN su paso, no en una
//     nota al pie que nadie lee a tiempo.
//  3. SI NO TE FUNCIONA — los síntomas exactos que se ven en el teléfono,
//     con su causa. Es la red que atrapa a quien ya configuró algo mal.
//
// Construida sobre el sistema agrupado de Ajustes (SettingsGroup /
// SettingsSwitchRow) para que se vea y se comporte igual que sus vecinas,
// con el vocabulario neumórfico (`neoInk` / `neoTokens`, cero
// `theme.colors`).

import { useCallback, type ReactNode } from 'react'
import { Linking, Platform, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { MaterialIcons } from '@expo/vector-icons'

import { RiseView } from '@/components/home/animated/rise-view'
import { SettingsGroup, SettingsSwitchRow } from '@/components/settings/settings-grouped-list'
import { NeoButton } from '@/components/ui/neo-button'
import { Screen } from '@/components/ui/screen'
import { useApplePayCaptureEnabled } from '@/features/apple-pay-capture/apple-pay-enabled-store'
import {
  useApplePayLastCapture,
  type LastApplePayCapture,
} from '@/features/apple-pay-capture/apple-pay-last-capture-store'
import { isApplePayCaptureSupported } from '@/features/apple-pay-capture/native'
import { parseShortcutAmount } from '@/features/apple-pay-capture/parse-shortcut-amount'
import { toast } from '@/lib/toast-bus'
import { formatMoney } from '@/utils/money'
import { formatRelativeNotificationTime } from '@/utils/notifications'
import { neoInk } from '@/theme/neo-ink'
import { neoRadii, neoTokens } from '@/theme/neo-tokens'
import { useAppTheme } from '@/theme/theme-provider'
import { nunitoFamily } from '@/theme/typography'

type IconName = keyof typeof MaterialIcons.glyphMap

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

/**
 * Los cinco pasos. `notice` marca los tres donde Atajos tiene una trampa
 * que ya mordió en device: dejar "Preguntar antes de ejecutar" prendido,
 * meter un "Ejecutar atajo" en vez de la acción de Manifiesto, y escribir
 * el monto y el comercio a mano en vez de tomarlos de la entrada.
 */
const STEPS: ReadonlyArray<{ key: string; notice: boolean }> = [
  { key: 'step1', notice: false },
  { key: 'step2', notice: false },
  { key: 'step3', notice: true },
  { key: 'step4', notice: true },
  { key: 'step5', notice: true },
]

/** Síntomas tal como se ven en el teléfono, cada uno con su causa. */
const TROUBLE: ReadonlyArray<{ key: string; icon: IconName }> = [
  { key: 'ask', icon: 'touch-app' },
  { key: 'frozen', icon: 'content-copy' },
  { key: 'silent', icon: 'search-off' },
]

export function ApplePayScreen() {
  const { t } = useTranslation()
  const { theme } = useAppTheme()
  const neo = neoTokens(theme.mode)

  const gate = resolveApplePayGate()
  const { enabled, loaded, setEnabled } = useApplePayCaptureEnabled()
  // `loaded` evita que el switch parpadee de apagado a prendido mientras
  // se lee el valor persistido del keychain.
  const switchDisabled = gate !== 'ok' || !loaded

  const lastCapture = useApplePayLastCapture()

  const handleOpenShortcuts = useCallback(() => {
    Linking.openURL(SHORTCUTS_NEW_AUTOMATION_URL).catch(() => {
      toast.error(t('settings:applePay.openShortcutsError'))
    })
  }, [t])

  // La guía entera (estado + pasos + diagnóstico) sólo con la captura
  // prendida y disponible. Apagada es ruido: el usuario todavía no
  // decidió usar la función.
  const showGuide = enabled && gate === 'ok'

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

      {/* 2. ¿Está funcionando? Se espera a `loaded` por el mismo motivo
          que el switch: sin eso el bloque diría "todavía no llegó nada"
          durante un frame y recién después mostraría el pago, que es
          justo el mensaje que no queremos dar por error. */}
      {showGuide && lastCapture.loaded ? (
        <RiseView delay={90} style={styles.block}>
          <StatusBlock capture={lastCapture.capture} />
        </RiseView>
      ) : null}

      {/* 3. Los pasos + el atajo a Atajos. */}
      {showGuide ? (
        <RiseView delay={140} style={styles.block}>
          <SettingsGroup title={t('settings:applePay.stepsTitle')}>
            {STEPS.map((step, index) => (
              <GuideItem
                badge={
                  <Text style={[styles.stepNumber, { color: neo.text }]}>{String(index + 1)}</Text>
                }
                body={t(`settings:applePay.steps.${step.key}.body`)}
                isLast={index === STEPS.length - 1}
                key={step.key}
                notice={step.notice ? t(`settings:applePay.steps.${step.key}.notice`) : undefined}
                title={t(`settings:applePay.steps.${step.key}.title`)}
              />
            ))}
          </SettingsGroup>

          <NeoButton
            block
            label={t('settings:applePay.openShortcuts')}
            onPress={handleOpenShortcuts}
          />
        </RiseView>
      ) : null}

      {/* 4. Diagnóstico. Va al final a propósito: quien configura por
          primera vez sigue los pasos, y quien vuelve porque algo salió
          mal baja hasta acá buscando su síntoma. */}
      {showGuide ? (
        <RiseView delay={190} style={styles.block}>
          <SettingsGroup title={t('settings:applePay.troubleTitle')}>
            {TROUBLE.map((item, index) => (
              <GuideItem
                badge={<TroubleGlyph name={item.icon} />}
                body={t(`settings:applePay.trouble.${item.key}Body`)}
                isLast={index === TROUBLE.length - 1}
                key={item.key}
                title={t(`settings:applePay.trouble.${item.key}Title`)}
              />
            ))}
          </SettingsGroup>
        </RiseView>
      ) : null}
    </Screen>
  )
}

// ─── ¿Está funcionando? ──────────────────────────────────────────────

/**
 * El monto viaja como TEXTO crudo de Atajos ("$ 8.160,00"). Si
 * `parseShortcutAmount` lo entiende se muestra con el formato de moneda
 * de la app; si no, se muestra tal cual llegó — ver el string raro es
 * justamente el dato que necesita quien vino a diagnosticar por qué su
 * gasto se registró mal.
 */
function formatCapturedAmount(raw: string): string {
  const parsed = parseShortcutAmount(raw)
  return parsed === null ? raw.trim() : formatMoney(parsed.value)
}

function StatusBlock({ capture }: { capture: LastApplePayCapture | null }) {
  const { t } = useTranslation()
  const { theme } = useAppTheme()
  const neo = neoTokens(theme.mode)
  const ink = neoInk(theme.mode)

  const received = capture !== null
  const merchant = capture?.merchantRaw.trim() ?? ''

  return (
    <SettingsGroup title={t('settings:applePay.status.title')}>
      <View style={styles.statusBody}>
        <View style={styles.statusHead}>
          <Well>
            <MaterialIcons
              color={received ? ink.accent : neo.textMuted}
              name={received ? 'check-circle' : 'hourglass-empty'}
              size={17}
            />
          </Well>
          <Text style={[styles.itemTitle, styles.statusTitle, { color: neo.text }]}>
            {received
              ? t('settings:applePay.status.receivedTitle')
              : t('settings:applePay.status.waitingTitle')}
          </Text>
        </View>

        {capture !== null ? (
          // El dato crudo va en un POZO, separado de la prosa: es LA
          // prueba que el usuario vino a buscar y tiene que poder
          // encontrarla de un vistazo.
          <View
            style={[
              styles.captureWell,
              { backgroundColor: neo.well, boxShadow: neo.shadows.insetMd },
            ]}
          >
            <Text numberOfLines={1} style={[styles.captureMerchant, { color: neo.text }]}>
              {merchant === '' ? t('settings:applePay.status.noMerchant') : merchant}
            </Text>
            <Text style={[styles.captureMeta, { color: ink.accent }]}>
              {t('settings:applePay.status.receivedMeta', {
                amount: formatCapturedAmount(capture.amountRaw),
                time: formatRelativeNotificationTime(capture.capturedAt),
              })}
            </Text>
          </View>
        ) : null}

        <Text style={[styles.itemBody, { color: neo.textMuted }]}>
          {received
            ? t('settings:applePay.status.receivedBody')
            : t('settings:applePay.status.waitingBody')}
        </Text>
      </View>
    </SettingsGroup>
  )
}

// ─── Piezas compartidas por los pasos y el diagnóstico ───────────────

/**
 * Pozo circular: el mismo sub-relieve que los tiles de ícono de las filas
 * de Ajustes. Lleva el número del paso, el glifo del síntoma o el del
 * estado, para que las tres listas se lean como una sola familia.
 */
function Well({ children }: { children: ReactNode }) {
  const { theme } = useAppTheme()
  const neo = neoTokens(theme.mode)
  return (
    <View style={[styles.well, { backgroundColor: neo.well, boxShadow: neo.shadows.insetSm }]}>
      {children}
    </View>
  )
}

function TroubleGlyph({ name }: { name: IconName }) {
  const { theme } = useAppTheme()
  const ink = neoInk(theme.mode)
  return <MaterialIcons color={ink.warn} name={name} size={16} />
}

/**
 * Aviso dentro de un paso: pozo neutro + tinta de advertencia + glifo.
 * Es el mismo tratamiento que ya usan los avisos blandos del rediseño
 * (`OnbSheetNotice`, los warnings de la hoja de import), así que no
 * inventa material nuevo — y `ink.warn` sobre `neo.well` está auditado a
 * 4.73:1 en claro y 8.2:1 en oscuro.
 */
function GuideNotice({ text }: { text: string }) {
  const { theme } = useAppTheme()
  const neo = neoTokens(theme.mode)
  const ink = neoInk(theme.mode)
  return (
    <View style={[styles.notice, { backgroundColor: neo.well, boxShadow: neo.shadows.insetSm }]}>
      <MaterialIcons color={ink.warn} name="error-outline" size={15} style={styles.noticeIcon} />
      <Text style={[styles.noticeText, { color: ink.warn }]}>{text}</Text>
    </View>
  )
}

/**
 * Ítem de las dos listas largas (pasos y síntomas): insignia + título
 * corto + descripción, más el aviso opcional. La geometría es la de
 * `SettingsRow` —mismo padding, mismo hairline de 1.5px entre ítems— para
 * que la pantalla no se sienta de otro sistema.
 */
function GuideItem({
  badge,
  title,
  body,
  notice,
  isLast,
}: {
  badge: ReactNode
  title: string
  body: string
  notice?: string
  isLast: boolean
}) {
  const { theme } = useAppTheme()
  const neo = neoTokens(theme.mode)

  return (
    <View
      style={[
        styles.item,
        isLast ? null : { borderBottomColor: neo.sheetDivider, borderBottomWidth: 1.5 },
      ]}
    >
      <Well>{badge}</Well>
      <View style={styles.itemCopy}>
        <Text style={[styles.itemTitle, { color: neo.text }]}>{title}</Text>
        <Text style={[styles.itemBody, { color: neo.textMuted }]}>{body}</Text>
        {notice === undefined ? null : <GuideNotice text={notice} />}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  // Separación entre bloques (cada RiseView). Se suma al gap del Screen.
  block: { marginTop: 6, gap: 12 },

  // Ítem de lista: el padding de `SettingsRow`, con la insignia alineada
  // al tope porque acá la copia son dos o tres líneas, no una.
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  itemCopy: { flex: 1, gap: 4 },
  itemTitle: { fontSize: 14.5, fontWeight: '800', fontFamily: nunitoFamily('800') },
  itemBody: { fontSize: 13, lineHeight: 19, fontFamily: nunitoFamily('600') },

  well: {
    width: 28,
    height: 28,
    borderRadius: neoRadii.chip,
    alignItems: 'center',
    justifyContent: 'center',
    // La insignia no se estira aunque el título ocupe dos líneas.
    flexShrink: 0,
  },
  stepNumber: { fontSize: 13, fontWeight: '800', fontFamily: nunitoFamily('800') },

  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    marginTop: 4,
    borderRadius: neoRadii.chip,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  // El glifo se alinea con la PRIMERA línea del texto, no con el centro
  // del bloque: con tres líneas de aviso quedaría flotando al medio.
  noticeIcon: { marginTop: 1 },
  noticeText: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
  },

  statusBody: { gap: 10, paddingHorizontal: 14, paddingVertical: 14 },
  statusHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  statusTitle: { flex: 1 },
  captureWell: {
    borderRadius: neoRadii.chip,
    paddingHorizontal: 12,
    paddingVertical: 11,
    gap: 3,
  },
  captureMerchant: { fontSize: 15, fontWeight: '800', fontFamily: nunitoFamily('800') },
  captureMeta: { fontSize: 13, fontWeight: '800', fontFamily: nunitoFamily('800') },
})
