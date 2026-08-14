// Captura de gastos con Apple Pay — pantalla de configuración.
//
// La pantalla ES, en los hechos, el producto: Apple no expone ninguna API
// para crear la automatización de Atajos, así que lo único que podemos
// hacer es prender la captura, explicar cómo se arma y abrir Atajos. El
// resto lo hace el usuario a mano, en otra app, sin que podamos verlo.
//
// DIRIGIDA POR ESTADO (2026-08-11). La versión anterior era ESTÁTICA:
// mostraba la guía, los avisos y el diagnóstico SIEMPRE, sin importar en
// qué momento del camino estaba quien la abría. Quien venía a descubrir la
// función leía un diagnóstico que no le pasaba, y quien venía porque le
// falta un gasto tenía que bajar cuatro bloques para encontrar el suyo.
//
// Ahora cada momento tiene UN protagonista, y quién es lo decide
// `resolveApplePaySetupPhase` (función pura, con tests):
//
//  · `unavailable`    → el switch apagado y deshabilitado + el motivo. Nada más.
//  · `off`            → la tarjeta que vende la idea en una línea + el switch.
//  · `waiting-first`  → la guía como protagonista, con una línea sutil de
//                       espera. Lo demás, plegado.
//  · `working`        → el ÉXITO: tilde grande en un pozo + el recibo de la
//                       última captura. La guía se pliega detrás de una fila.
//  · `broken-capture` → el diagnóstico al frente, con su arreglo puntual y
//                       el botón que lo resuelve. La guía también se pliega:
//                       el héroe YA trae el arreglo, y repetir su mismo botón
//                       en el paso 1 dejaría dos CTA primarias idénticas
//                       compitiendo en la misma pantalla.
//
// La pantalla entera espera a que los stores del keychain hidraten
// (`phaseReady`) antes de montar nada: así el stagger de entrada sale
// siempre en el mismo orden y ningún bloque se dibuja con una fase
// provisoria.
//
// La guía tiene DOS MODOS, y los decide una sola constante
// (`APPLE_PAY_SHORTCUT_ICLOUD_URL`):
//
//  · CON link publicado — camino principal: agregar el atajo ya cableado
//    desde su link de iCloud, crear la automatización y elegirlo en la
//    pantalla "Siguiente". Cero teclado, cero variables. El armado manual
//    sigue disponible, pero COLAPSADO: es la salida de emergencia.
//  · SIN link (`null`) — el atajo todavía no se publicó, así que los cinco
//    pasos manuales SON la guía, sin fila de plegado.
//
// Cada paso lleva su botón ADENTRO (agregar el atajo, abrir Atajos): con un
// botón al pie de la lista no se sabe a qué paso pertenece.
//
// Construida sobre el sistema agrupado de Ajustes (SettingsGroup /
// SettingsSwitchRow) para que se vea y se comporte igual que sus vecinas,
// con el vocabulario neumórfico (`neoInk` / `neoTokens` / `NeoSurface`,
// cero `theme.colors`).

import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { Linking, Platform, Pressable, StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui/app-text'
import { useTranslation } from 'react-i18next'
import { MaterialIcons } from '@expo/vector-icons'

import { RiseView } from '@/components/home/animated/rise-view'
import { SettingsGroup, SettingsSwitchRow } from '@/components/settings/settings-grouped-list'
import { NeoButton } from '@/components/ui/neo-button'
import { NeoSurface } from '@/components/ui/neo-surface'
import { Screen } from '@/components/ui/screen'
import { useApplePayCaptureEnabled } from '@/features/apple-pay-capture/apple-pay-enabled-store'
import {
  useApplePayLastCapture,
  type LastApplePayCapture,
} from '@/features/apple-pay-capture/apple-pay-last-capture-store'
import {
  diagnoseLastCapture,
  type LastCaptureDiagnosis,
} from '@/features/apple-pay-capture/diagnose-last-capture'
import { isApplePayCaptureSupported } from '@/features/apple-pay-capture/native'
import { parseShortcutAmount } from '@/features/apple-pay-capture/parse-shortcut-amount'
import {
  resolveApplePaySetupPhase,
  type ApplePayGate,
} from '@/features/apple-pay-capture/resolve-setup-phase'
import { APPLE_PAY_SHORTCUT_ICLOUD_URL } from '@/features/apple-pay-capture/shortcut-link'
import { triggerHaptic } from '@/lib/haptics'
import { toast } from '@/lib/toast-bus'
import { formatMoney } from '@/utils/money'
import { formatRelativeNotificationTime } from '@/utils/notifications'
import { neoInk } from '@/theme/neo-ink'
import { neoRadii, neoTokens } from '@/theme/neo-tokens'
import { useAppTheme } from '@/theme/theme-provider'
import { nunitoFamily } from '@/theme/typography'

type IconName = keyof typeof MaterialIcons.glyphMap

/**
 * Los tres motivos por los que la captura NO está disponible le dicen
 * cosas DISTINTAS al usuario ("cambiá de teléfono" / "actualizá la app" /
 * "actualizá iOS"), así que se resuelven por separado y en este orden.
 *
 * Interno: el único consumidor es esta pantalla. El TIPO en cambio vive en
 * `resolve-setup-phase.ts`, que sí lo comparte con la función pura y sus
 * tests.
 */
function resolveApplePayGate(): ApplePayGate {
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

/** Qué botón lleva un paso adentro. `null` = el paso se resuelve sin volver acá. */
type StepAction = 'add-shortcut' | 'open-shortcuts' | null

interface GuideStep {
  key: string
  /** Trampa de Atajos que ya mordió en device: va como aviso DENTRO del paso. */
  notice: boolean
  action: StepAction
}

/**
 * Los tres pasos del camino con el atajo ya cableado, verificado en device
 * con un pago real. El tercero no tiene botón —se resuelve dentro de
 * Atajos— y en cambio muestra el NOMBRE del atajo como chip: es lo único
 * que el usuario tiene que reconocer en la lista de la pantalla
 * "Siguiente". El aviso del segundo es la única trampa que sobrevive a
 * este camino: el atajo viene armado, pero "Ejecutar de inmediato" lo
 * elige el usuario.
 */
const QUICK_STEPS: ReadonlyArray<GuideStep & { chip: boolean }> = [
  { key: 'step1', notice: false, chip: false, action: 'add-shortcut' },
  { key: 'step2', notice: true, chip: false, action: 'open-shortcuts' },
  { key: 'step3', notice: false, chip: true, action: null },
]

/**
 * Los cinco pasos del armado MANUAL. `notice` marca los tres donde Atajos
 * tiene una trampa que ya mordió en device: dejar "Preguntar antes de
 * ejecutar" prendido, meter un "Ejecutar atajo" en vez de la acción de
 * Manifiesto, y llenar los campos sin que la variable traiga el dato
 * correcto (tipeados a mano, o con la variable puesta pero sin elegir qué
 * dato del pago trae — que PARECE bien configurado y manda lo mismo a los
 * dos campos).
 */
const MANUAL_STEPS: ReadonlyArray<GuideStep> = [
  { key: 'step1', notice: false, action: 'open-shortcuts' },
  { key: 'step2', notice: false, action: null },
  { key: 'step3', notice: true, action: null },
  { key: 'step4', notice: true, action: null },
  { key: 'step5', notice: true, action: null },
]

/** Síntomas tal como se ven en el teléfono, cada uno con su causa. */
const TROUBLE: ReadonlyArray<{ key: string; icon: IconName }> = [
  { key: 'ask', icon: 'touch-app' },
  { key: 'frozen', icon: 'content-copy' },
  { key: 'sameValue', icon: 'money-off' },
  { key: 'silent', icon: 'search-off' },
]

/**
 * Síntoma exclusivo del camino con atajo: la automatización guarda una
 * REFERENCIA al atajo, así que borrarlo o renombrarlo la deja apuntando a
 * la nada. Sin el link publicado no hay atajo suelto que borrar, y el
 * ítem sería ruido.
 */
const TROUBLE_SHORTCUT: { key: string; icon: IconName } = {
  key: 'missingShortcut',
  icon: 'link-off',
}

/**
 * Cada diagnóstico tiene su copy: la pantalla NO decide nada sobre la
 * captura, sólo pinta lo que `diagnoseLastCapture` resolvió.
 */
const DIAGNOSIS_COPY: Record<Exclude<LastCaptureDiagnosis['kind'], 'ok'>, string> = {
  'same-value': 'settings:applePay.broken.sameValue',
  'unreadable-amount': 'settings:applePay.broken.unreadableAmount',
  'missing-amount': 'settings:applePay.broken.missingAmount',
}

export function ApplePayScreen() {
  const { t } = useTranslation()
  const { theme } = useAppTheme()
  const neo = neoTokens(theme.mode)

  const gate = resolveApplePayGate()
  const { enabled, loaded, setEnabled } = useApplePayCaptureEnabled()
  const switchDisabled = gate !== 'ok' || !loaded
  // Con el gate cerrado el flag persistido puede seguir en `true` —se
  // prendió cuando la captura sí estaba disponible y después la build o el
  // iOS dejaron de soportarla—. Pintar el switch prendido Y bloqueado diría
  // "esto está andando y no lo podés apagar", que es falso de las dos
  // puntas: no está capturando nada.
  const switchValue = gate === 'ok' && enabled

  const lastCapture = useApplePayLastCapture()

  // El link del atajo ya cableado. `null` = todavía no publicado, y la
  // pantalla entera cae al armado manual como camino principal.
  const shortcutUrl = APPLE_PAY_SHORTCUT_ICLOUD_URL
  const hasShortcut = shortcutUrl !== null

  const diagnosis = diagnoseLastCapture(lastCapture.capture)
  const phase = resolveApplePaySetupPhase({
    gate,
    enabled,
    lastCapture: lastCapture.capture,
    diagnosis,
  })

  // La fase se calcula con DOS valores que vienen del keychain (el flag y
  // el último recibo), y NADA se monta hasta tenerlos. Dos motivos:
  //  · publicarla antes mostraría "esperando tu primer pago" durante un
  //    frame a alguien que lleva semanas capturando;
  //  · los delays del stagger se eligen por fase, así que con una fase
  //    provisoria el ORDEN de entrada dependería de cuánto tardó el
  //    keychain — la misma pantalla animaría distinto en cada apertura.
  // Sin gate no hace falta esperar nada: la fase ya está decidida.
  const phaseReady = gate !== 'ok' || (loaded && lastCapture.loaded)

  const handleOpenShortcuts = useCallback(() => {
    Linking.openURL(SHORTCUTS_NEW_AUTOMATION_URL).catch(() => {
      toast.error(t('settings:applePay.openShortcutsError'))
    })
  }, [t])

  const handleAddShortcut = useCallback(() => {
    if (shortcutUrl === null) return
    Linking.openURL(shortcutUrl).catch(() => {
      toast.error(t('settings:applePay.addShortcutError'))
    })
  }, [shortcutUrl, t])

  // El síntoma del atajo borrado va PRIMERO cuando existe: es el modo de
  // falla propio del camino que la pantalla acaba de recomendar.
  const trouble = useMemo(
    () => (hasShortcut ? [TROUBLE_SHORTCUT, ...TROUBLE] : TROUBLE),
    [hasShortcut],
  )

  const capture = lastCapture.capture
  const showsGuide =
    phase === 'waiting-first' || phase === 'working' || phase === 'broken-capture'

  return (
    <Screen
      backgroundColor={neo.bg}
      canGoBack
      title={t('settings:applePay.title')}
      titleColor={neo.text}
    >
      {/* Nada se monta con una fase provisoria: ver `phaseReady`. */}
      {!phaseReady ? null : (
        <>
          {/* La venta va SÓLO con la captura apagada: prendida, el usuario
              ya compró la idea y la línea sería ruido sobre su estado
              real. */}
          {phase === 'off' ? (
            <RiseView delay={40} style={styles.block}>
              <PitchCard />
            </RiseView>
          ) : null}

          {/* El interruptor. El footer carga la nota de expectativa —
              obligatoria: Apple documenta que el disparador es best-effort
              y se saltea pagos, así que el copy NO promete captura
              perfecta. Cuando la captura no está disponible, el footer
              explica por qué en vez de prometer nada. */}
          <RiseView delay={phase === 'off' ? 90 : 40} style={styles.block}>
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
                value={switchValue}
              />
            </SettingsGroup>
          </RiseView>

          {/* El protagonista de la fase. Sólo uno se monta a la vez. */}
          {phase === 'working' && capture !== null ? (
            <RiseView delay={90} style={styles.block}>
              <SuccessHero capture={capture} />
            </RiseView>
          ) : null}

          {phase === 'broken-capture' ? (
            <RiseView delay={90} style={styles.block}>
              <BrokenHero
                diagnosis={diagnosis}
                hasShortcut={hasShortcut}
                onAddShortcut={handleAddShortcut}
              />
            </RiseView>
          ) : null}

          {phase === 'waiting-first' ? (
            <RiseView delay={90} style={styles.block}>
              <WaitingLine />
            </RiseView>
          ) : null}

          {showsGuide ? (
            <SetupGroups
              // La guía se despliega sola SÓLO cuando es el protagonista,
              // o sea en `waiting-first`. En `working` la configuración ya
              // está hecha y los pasos son material de consulta; en
              // `broken-capture` el héroe ya trae el arreglo con su botón,
              // y desplegar la guía repetiría ese mismo botón en el paso 1.
              collapsed={phase !== 'waiting-first'}
              hasShortcut={hasShortcut}
              onAddShortcut={handleAddShortcut}
              onOpenShortcuts={handleOpenShortcuts}
            />
          ) : null}

          {/* Los síntomas quedan plegados en todas las fases: son la red
              que atrapa a quien ya configuró algo mal, no una lectura
              previa. */}
          {showsGuide ? (
            <RiseView delay={240} style={styles.block}>
              <HelpGroup items={trouble} />
            </RiseView>
          ) : null}
        </>
      )}
    </Screen>
  )
}

// ─── Protagonistas por fase ──────────────────────────────────────────

/**
 * Fase `off`: una sola línea que dice para qué sirve esto. Sin guía, sin
 * avisos y sin diagnóstico — el usuario todavía no decidió usar la
 * función, y todo lo demás son instrucciones para una decisión que no
 * tomó.
 */
function PitchCard() {
  const { t } = useTranslation()
  const { theme } = useAppTheme()
  const neo = neoTokens(theme.mode)
  const ink = neoInk(theme.mode)

  return (
    <NeoSurface radius={neoRadii.card} style={styles.pitch} variant="raisedLg">
      <View style={[styles.pitchWell, { backgroundColor: neo.well, boxShadow: neo.shadows.insetMd }]}>
        <MaterialIcons color={ink.accent} name="contactless" size={22} />
      </View>
      <Text style={[styles.pitchText, { color: neo.text }]}>{t('settings:applePay.pitch')}</Text>
    </NeoSurface>
  )
}

/**
 * Fase `waiting-first`: la guía manda, y esto es sólo el recordatorio de
 * que el resultado todavía no llegó. Una línea, sin card: si tuviera
 * relieve competiría con los pasos, que son lo único accionable.
 */
function WaitingLine() {
  const { t } = useTranslation()
  const { theme } = useAppTheme()
  const neo = neoTokens(theme.mode)

  return (
    <View style={styles.waitingLine}>
      <MaterialIcons color={neo.textMuted} name="hourglass-empty" size={15} />
      <Text style={[styles.waitingText, { color: neo.textMuted }]}>
        {t('settings:applePay.waitingStatus')}
      </Text>
    </View>
  )
}

/**
 * El monto viaja como TEXTO crudo de Atajos ("$ 8.160,00") y acá se
 * muestra con el formato de moneda de la app.
 *
 * El único llamador es `SuccessHero`, y ahí el parseo NO puede fallar:
 * la fase `working` exige que el diagnóstico sea `ok`, y
 * `diagnoseLastCapture` sólo devuelve `ok` cuando `parseShortcutAmount`
 * leyó el monto. La rama del crudo es defensa en profundidad —el tipo
 * obliga a contemplar el `null`, y si esa cadena se rompiera alguna vez
 * es mejor mostrar el texto tal cual llegó que reventar formateando—.
 * Quien vino a diagnosticar un monto ilegible ve ese crudo en el héroe
 * de `broken-capture`, no acá.
 */
function formatCapturedAmount(raw: string): string {
  const parsed = parseShortcutAmount(raw)
  return parsed === null ? raw.trim() : formatMoney(parsed.value)
}

/**
 * Fase `working`: el héroe es la PRUEBA. Una configuración que quedó mal
 * no falla con un error, falla en silencio, así que ver un pago propio
 * acá es lo único que confirma que la automatización quedó bien armada —
 * y por eso el recibo va en un pozo aparte, separado de la prosa.
 */
function SuccessHero({ capture }: { capture: LastApplePayCapture }) {
  const { t } = useTranslation()
  const { theme } = useAppTheme()
  const neo = neoTokens(theme.mode)
  const ink = neoInk(theme.mode)

  const merchant = capture.merchantRaw.trim()

  return (
    <NeoSurface radius={neoRadii.card} style={styles.hero} variant="raisedXl">
      <View style={[styles.heroWell, { backgroundColor: neo.well, boxShadow: neo.shadows.insetLg }]}>
        <MaterialIcons color={ink.accent} name="check" size={34} />
      </View>
      <Text style={[styles.heroTitle, { color: neo.text }]}>
        {t('settings:applePay.working.title')}
      </Text>
      <Text style={[styles.heroBody, { color: neo.textMuted }]}>
        {t('settings:applePay.working.body')}
      </Text>
      <View style={[styles.receipt, { backgroundColor: neo.well, boxShadow: neo.shadows.insetMd }]}>
        <Text numberOfLines={1} style={[styles.receiptMerchant, { color: neo.text }]}>
          {merchant === '' ? t('settings:applePay.working.noMerchant') : merchant}
        </Text>
        <Text style={[styles.receiptMeta, { color: ink.accent }]}>
          {t('settings:applePay.working.meta', {
            amount: formatCapturedAmount(capture.amountRaw),
            time: formatRelativeNotificationTime(capture.capturedAt),
          })}
        </Text>
      </View>
    </NeoSurface>
  )
}

/**
 * Fase `broken-capture`: el dato LLEGÓ, pero llegó mal, y el usuario no
 * tiene forma de enterarse solo (el gasto le entra en $0 y sigue su vida).
 * Por eso el diagnóstico es el héroe y trae su arreglo puntual.
 *
 * Los tres diagnósticos tienen la MISMA raíz —el campo Monto no está
 * trayendo la propiedad Cantidad del pago— así que con el atajo publicado
 * los tres se resuelven igual: volver a agregar el atajo ya cableado y
 * re-elegirlo en la automatización. Sin link publicado no hay botón que
 * arregle nada, y el texto dice qué tocar a mano.
 */
function BrokenHero({
  diagnosis,
  hasShortcut,
  onAddShortcut,
}: {
  diagnosis: LastCaptureDiagnosis
  hasShortcut: boolean
  onAddShortcut: () => void
}) {
  const { t } = useTranslation()
  const { theme } = useAppTheme()
  const neo = neoTokens(theme.mode)
  const ink = neoInk(theme.mode)

  if (diagnosis.kind === 'ok') return null

  return (
    <NeoSurface radius={neoRadii.card} style={styles.hero} variant="raisedXl">
      <View style={[styles.heroWell, { backgroundColor: neo.well, boxShadow: neo.shadows.insetLg }]}>
        <MaterialIcons color={ink.warn} name="error-outline" size={34} />
      </View>
      <Text style={[styles.heroTitle, { color: neo.text }]}>
        {t('settings:applePay.broken.title')}
      </Text>
      <Text style={[styles.heroBody, { color: neo.textMuted }]}>
        {t(DIAGNOSIS_COPY[diagnosis.kind], { raw: 'raw' in diagnosis ? diagnosis.raw : '' })}
      </Text>
      <GuideNotice
        text={t(
          hasShortcut
            ? 'settings:applePay.broken.fixShortcut'
            : 'settings:applePay.broken.fixManual',
        )}
      />
      {hasShortcut ? (
        <NeoButton block label={t('settings:applePay.addShortcut')} onPress={onAddShortcut} />
      ) : null}
    </NeoSurface>
  )
}

// ─── La guía ─────────────────────────────────────────────────────────

/**
 * La guía y su salida de emergencia. Dos grupos y no uno solo porque los
 * dos caminos numeran sus pasos desde 1: metidos en la misma card, un
 * "1" abajo de un "3" se lee como un error, no como otra lista.
 *
 * `collapsed` son las fases en las que la guía NO es el protagonista
 * (`working` y `broken-capture`): los pasos quedan detrás de una fila,
 * como material de consulta. El armado manual sólo existe cuando hay
 * atajo publicado; sin él, los cinco pasos manuales SON la guía y no hay
 * nada que plegar.
 */
function SetupGroups({
  collapsed,
  hasShortcut,
  onAddShortcut,
  onOpenShortcuts,
}: {
  collapsed: boolean
  hasShortcut: boolean
  onAddShortcut: () => void
  onOpenShortcuts: () => void
}) {
  const { t } = useTranslation()

  const [configOpen, setConfigOpen] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)

  const toggleConfig = useCallback(() => {
    void triggerHaptic('selection')
    setConfigOpen((open) => !open)
  }, [])
  const toggleManual = useCallback(() => {
    void triggerHaptic('selection')
    setManualOpen((open) => !open)
  }, [])

  const stepsVisible = !collapsed || configOpen

  const buttonFor = useCallback(
    (action: StepAction): ReactNode => {
      if (action === 'add-shortcut') {
        return <NeoButton block label={t('settings:applePay.addShortcut')} onPress={onAddShortcut} />
      }
      if (action === 'open-shortcuts') {
        return (
          <NeoButton
            block
            label={t('settings:applePay.openShortcuts')}
            onPress={onOpenShortcuts}
            // Con el atajo publicado la acción primaria de la guía es
            // "Agregar el atajo listo": dos bandas verdes competirían.
            variant={hasShortcut ? 'ghost' : 'primary'}
          />
        )
      }
      return undefined
    },
    [hasShortcut, onAddShortcut, onOpenShortcuts, t],
  )

  const groupTitle = collapsed
    ? t('settings:applePay.configGroup')
    : t(hasShortcut ? 'settings:applePay.quickTitle' : 'settings:applePay.stepsTitle')

  return (
    <>
      <RiseView delay={140} style={styles.block}>
        <SettingsGroup title={groupTitle}>
          {collapsed ? (
            <DisclosureRow
              expanded={configOpen}
              // Cuántos pasos se pliegan detrás de la fila depende del modo,
              // igual que el título del grupo: 3 con el atajo publicado, 5
              // en el armado manual. Un helper fijo mentiría en un modo.
              helper={t('settings:applePay.configToggleHelper', {
                steps: hasShortcut ? QUICK_STEPS.length : MANUAL_STEPS.length,
              })}
              icon="checklist"
              isLast={!configOpen}
              label={t('settings:applePay.configToggle')}
              onPress={toggleConfig}
            />
          ) : null}
          {!stepsVisible
            ? null
            : hasShortcut
              ? QUICK_STEPS.map((step, index) => (
                  <GuideItem
                    action={buttonFor(step.action)}
                    badge={<StepNumber value={index + 1} />}
                    body={t(`settings:applePay.quick.${step.key}.body`)}
                    chip={step.chip ? t('settings:applePay.shortcutName') : undefined}
                    isLast={index === QUICK_STEPS.length - 1}
                    key={step.key}
                    notice={
                      step.notice ? t(`settings:applePay.quick.${step.key}.notice`) : undefined
                    }
                    title={t(`settings:applePay.quick.${step.key}.title`)}
                  />
                ))
              : MANUAL_STEPS.map((step, index) => (
                  <GuideItem
                    action={buttonFor(step.action)}
                    badge={<StepNumber value={index + 1} />}
                    body={t(`settings:applePay.steps.${step.key}.body`)}
                    isLast={index === MANUAL_STEPS.length - 1}
                    key={step.key}
                    notice={
                      step.notice ? t(`settings:applePay.steps.${step.key}.notice`) : undefined
                    }
                    title={t(`settings:applePay.steps.${step.key}.title`)}
                  />
                ))}
        </SettingsGroup>
      </RiseView>

      {hasShortcut && stepsVisible ? (
        <RiseView delay={190} style={styles.block}>
          <SettingsGroup title={t('settings:applePay.manualGroup')}>
            <DisclosureRow
              expanded={manualOpen}
              helper={t('settings:applePay.manualToggleHelper')}
              icon="build"
              isLast={!manualOpen}
              label={t('settings:applePay.manualToggle')}
              onPress={toggleManual}
            />
            {manualOpen
              ? MANUAL_STEPS.map((step, index) => (
                  <GuideItem
                    action={buttonFor(step.action)}
                    badge={<StepNumber value={index + 1} />}
                    body={t(`settings:applePay.steps.${step.key}.body`)}
                    isLast={index === MANUAL_STEPS.length - 1}
                    key={step.key}
                    notice={
                      step.notice ? t(`settings:applePay.steps.${step.key}.notice`) : undefined
                    }
                    title={t(`settings:applePay.steps.${step.key}.title`)}
                  />
                ))
              : null}
          </SettingsGroup>
        </RiseView>
      ) : null}
    </>
  )
}

/**
 * Los síntomas, siempre plegados. Es la red que atrapa a quien ya
 * configuró algo mal: quien viene a configurar por primera vez no tiene
 * ningún síntoma todavía, y desplegarlos le pondría cinco problemas
 * ajenos entre él y los pasos.
 */
function HelpGroup({ items }: { items: ReadonlyArray<{ key: string; icon: IconName }> }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  const toggle = useCallback(() => {
    void triggerHaptic('selection')
    setOpen((value) => !value)
  }, [])

  return (
    <SettingsGroup title={t('settings:applePay.helpGroup')}>
      <DisclosureRow
        expanded={open}
        helper={t('settings:applePay.troubleHelper')}
        icon="help-outline"
        isLast={!open}
        label={t('settings:applePay.troubleTitle')}
        onPress={toggle}
      />
      {open
        ? items.map((item, index) => (
            <GuideItem
              badge={<TroubleGlyph name={item.icon} />}
              body={t(`settings:applePay.trouble.${item.key}Body`)}
              isLast={index === items.length - 1}
              key={item.key}
              title={t(`settings:applePay.trouble.${item.key}Title`)}
            />
          ))
        : null}
    </SettingsGroup>
  )
}

// ─── Piezas compartidas ──────────────────────────────────────────────

/**
 * Pozo circular: el mismo sub-relieve que los tiles de ícono de las filas
 * de Ajustes. Lleva el número del paso, el glifo del síntoma o el de la
 * fila plegable, para que las tres listas se lean como una sola familia.
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

function StepNumber({ value }: { value: number }) {
  const { theme } = useAppTheme()
  const neo = neoTokens(theme.mode)
  return <Text style={[styles.stepNumber, { color: neo.text }]}>{String(value)}</Text>
}

function TroubleGlyph({ name }: { name: IconName }) {
  const { theme } = useAppTheme()
  const ink = neoInk(theme.mode)
  return <MaterialIcons color={ink.warn} name={name} size={16} />
}

/**
 * Aviso dentro de un paso o de un héroe: pozo neutro + tinta de
 * advertencia + glifo. Es el mismo tratamiento que ya usan los avisos
 * blandos del rediseño (`OnbSheetNotice`, los warnings de la hoja de
 * import), así que no inventa material nuevo — y `ink.warn` sobre
 * `neo.well` está auditado a 4.73:1 en claro y 8.21:1 en oscuro.
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
 * Ítem de las listas (pasos y síntomas): insignia + título corto + UNA
 * línea de descripción, más el aviso, el chip y el botón opcionales. La
 * geometría es la de `SettingsRow` —mismo padding, mismo hairline de
 * 1.5px entre ítems— para que la pantalla no se sienta de otro sistema.
 *
 * `action` va DENTRO del paso, no al pie de la lista: cada paso tiene su
 * propio botón y un pie común no diría cuál es cuál.
 */
function GuideItem({
  badge,
  title,
  body,
  chip,
  notice,
  action,
  isLast,
}: {
  badge: ReactNode
  title: string
  body: string
  /** Dato que el usuario tiene que reconocer literalmente (el nombre del atajo). */
  chip?: string
  notice?: string
  action?: ReactNode
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
        {chip === undefined ? null : (
          <NeoSurface radius={neoRadii.chip} style={styles.chip} variant="raisedSm">
            <Text style={[styles.chipText, { color: neo.text }]}>{chip}</Text>
          </NeoSurface>
        )}
        {notice === undefined ? null : <GuideNotice text={notice} />}
        {action === undefined ? null : <View style={styles.itemAction}>{action}</View>}
      </View>
    </View>
  )
}

/**
 * Fila que despliega una sección. Ajustes no tiene todavía un patrón de
 * sección expandible, así que se arma con el material que ya existe: la
 * geometría de `GuideItem`, el mismo pozo de insignia y el chevrón de
 * `SettingsRow` girado a vertical. No hay animación de alto — lo que se
 * abre son cinco pasos largos, y una apertura animada de ese tamaño se
 * lee como un salto, no como un despliegue.
 *
 * El helper viaja como `accessibilityHint` y no se deja al lector de
 * pantalla: `accessibilityLabel` en el Pressable PISA el texto de los
 * hijos, así que con VoiceOver la fila se anunciaría sólo con su título y
 * la línea de ayuda —la que dice qué hay adentro— se perdería.
 */
function DisclosureRow({
  expanded,
  helper,
  icon,
  isLast,
  label,
  onPress,
}: {
  expanded: boolean
  helper: string
  icon: IconName
  isLast: boolean
  label: string
  onPress: () => void
}) {
  const { theme } = useAppTheme()
  const neo = neoTokens(theme.mode)

  return (
    <Pressable
      accessibilityHint={helper}
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      onPress={onPress}
      style={({ pressed }) => [{ opacity: pressed ? 0.94 : 1 }]}
    >
      <View
        style={[
          styles.item,
          styles.disclosure,
          isLast ? null : { borderBottomColor: neo.sheetDivider, borderBottomWidth: 1.5 },
        ]}
      >
        <Well>
          <MaterialIcons color={neo.textMuted} name={icon} size={16} />
        </Well>
        <View style={styles.itemCopy}>
          <Text style={[styles.itemTitle, { color: neo.text }]}>{label}</Text>
          <Text style={[styles.itemBody, { color: neo.textMuted }]}>{helper}</Text>
        </View>
        <MaterialIcons
          color={neo.textMuted}
          name={expanded ? 'expand-less' : 'expand-more'}
          size={22}
        />
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  // Separación entre bloques (cada RiseView). Se suma al gap del Screen.
  block: { marginTop: 6, gap: 12 },

  // Tarjeta de venta (fase `off`): una fila, un glifo y una línea.
  pitch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  pitchWell: {
    width: 40,
    height: 40,
    borderRadius: neoRadii.chip,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  pitchText: {
    flex: 1,
    fontSize: 14.5,
    lineHeight: 21,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
  },

  // Línea de espera (fase `waiting-first`): sin relieve, para no competir
  // con los pasos, que son lo único accionable de la pantalla.
  waitingLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 4,
  },
  waitingText: { fontSize: 13, fontWeight: '700', fontFamily: nunitoFamily('700') },

  // Héroe de fase (`working` / `broken-capture`): columna centrada sobre
  // el relieve de card protagonista.
  hero: {
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 22,
  },
  heroWell: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  heroTitle: { fontSize: 19, fontWeight: '900', fontFamily: nunitoFamily('900') },
  heroBody: {
    fontSize: 13.5,
    lineHeight: 20,
    textAlign: 'center',
    fontFamily: nunitoFamily('600'),
  },

  // El recibo va en un POZO, separado de la prosa: es LA prueba que el
  // usuario vino a buscar y tiene que encontrarla de un vistazo.
  receipt: {
    alignSelf: 'stretch',
    borderRadius: neoRadii.chip,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 3,
    marginTop: 2,
  },
  receiptMerchant: { fontSize: 17, fontWeight: '900', fontFamily: nunitoFamily('900') },
  receiptMeta: { fontSize: 13.5, fontWeight: '800', fontFamily: nunitoFamily('800') },

  // Ítem de lista: el padding de `SettingsRow`, con la insignia alineada
  // al tope porque acá la copia son dos líneas, no una.
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
  // El botón del paso respira más que el aviso: es un objeto táctil, no
  // una línea de texto más.
  itemAction: { marginTop: 6 },

  // La fila que despliega una sección lleva una línea de ayuda, no un
  // párrafo: centrada se lee como cabecera y no como paso.
  disclosure: { alignItems: 'center' },

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

  // Chip del nombre del atajo: relieve de chip, para que se lea como un
  // objeto que hay que reconocer y no como una palabra en negrita.
  chip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 11,
    paddingVertical: 5,
    marginTop: 2,
  },
  chipText: { fontSize: 13, fontWeight: '900', fontFamily: nunitoFamily('900') },

  notice: {
    alignSelf: 'stretch',
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
})
