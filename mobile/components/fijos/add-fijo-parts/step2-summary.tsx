// Step 2 del wizard add-fijo: summary card + impact (rows + bar +
// libre row + health badge) + calendar drop + reminder toggle +
// "ya pagué la cuota más reciente" toggle (sólo en create + no
// installment). Extraído de `add-fijo-v2-screen.tsx`.
import { Pressable, StyleSheet, View } from 'react-native'
import { AnimatedText, Text } from '@/components/ui/app-text'
import { useTranslation } from 'react-i18next'
import { useEffect } from 'react'
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { RiseView } from '@/components/home/animated/rise-view'
import { CountUpText } from '@/components/home/animated/count-up-text'
import { BrotMascot } from '@/components/brot/brot-mascot'
import { CategoryIcon } from '@/components/category/category-icon'
import {
  FREQ_OPTIONS,
  hexAlpha,
  type FirstCuotaChoice,
  type FirstCuotaPlacement,
  type FreqChoice,
} from '@/features/fixed-expenses/add-fijo-helpers'
import { DayChips } from '@/components/gastos/add-income-parts/day-chips'
import { getDateTimeFormat } from '@/lib/i18n/active-locale'
import type { Category as FixedExpenseCategory } from '@/features/categories/use-categories'
import { formatMoney } from '@/utils/money'
import { motionDurations, motionSprings } from '@/lib/motion'
import { useFijosSkin, type FijosNeoSkin } from '@/components/fijos/fijos-skin'
import { resolveFijosCategoryTone } from '@/components/fijos/fijos-category-palette'
import { useAppTheme } from '@/theme/theme-provider'
import { CalendarDropImpact } from './calendar-drop-impact'
import {
  HealthBadge,
  ImpactBar,
  ImpactColumns,
  ImpactRow,
  ZoneGauge,
  zoneForPct,
} from './impact-card'
import { nunitoFamily } from '@/theme/typography'

export interface Step2SummaryProps {
  name: string
  amount: number
  selectedCategory: FixedExpenseCategory | undefined
  freqChoice: FreqChoice | null
  cuotaTot: number
  isInstallment: boolean
  totalCuotas: number
  day: number | null
  onChangeDay: (next: number) => void
  /** El día no está elegido y el usuario ya intentó confirmar. */
  flagDay: boolean
  // Impact math
  prevTotal: number
  nuevoTotal: number
  pctAntes: number
  pctDespues: number
  deltaPct: number
  libreDespues: number
  monthlyIncome: number
  // Toggles
  notify: boolean
  onToggleNotify: () => void
  /** When `true` the toggle "ya pagué la cuota más reciente" rendea.
   *  Sólo aplica en creación + no-installment. */
  showAlreadyPaidToggle: boolean
  alreadyPaidCurrentCuota: boolean
  onToggleAlreadyPaid: () => void
  /** Selector "PRIMERA CUOTA" (spec 2026-08-23): las dos fechas concretas
   *  entre las que elige el alta. `null` en edición o sin día elegido —
   *  el bloque no se rendea. `placement` null = hint de ciclo suprimido
   *  (ciclo extendido o fecha ilegible). */
  firstCuota: {
    /** `null` = todavía no eligió. SIN preselección: la decisión es
     *  obligatoria y el CTA no abre sin ella (owner 2026-08-23). */
    choice: FirstCuotaChoice | null
    currentDate: string
    nextDate: string
    /** Días hasta la ocurrencia del período en curso: 0 hoy, <0 vencida. */
    currentDelta: number
    placement: FirstCuotaPlacement | null
  } | null
  onSelectFirstCuota: (choice: FirstCuotaChoice) => void
  /** Falta elegir la primera cuota y el usuario ya intentó confirmar. */
  flagFirstCuota: boolean
}

export function Step2Summary(props: Step2SummaryProps) {
  const { theme } = useAppTheme()
  const skin = useFijosSkin()
  const neo = skin.kind === 'neo' ? skin : null
  const { t } = useTranslation()
  const {
    name,
    amount,
    selectedCategory,
    freqChoice,
    cuotaTot,
    isInstallment,
    totalCuotas,
    day,
    onChangeDay,
    flagDay,
    prevTotal,
    nuevoTotal,
    pctAntes,
    pctDespues,
    deltaPct,
    libreDespues,
    monthlyIncome,
    notify,
    onToggleNotify,
    showAlreadyPaidToggle,
    alreadyPaidCurrentCuota,
    onToggleAlreadyPaid,
    firstCuota,
    onSelectFirstCuota,
    flagFirstCuota,
  } = props

  // Zona del handoff (30/50) — sólo la consume la piel neo, donde el medidor
  // y su caption dicen el veredicto. En neo la frase de tono NO se rendea:
  // el handoff mueve el veredicto al caption ("zona sana") y repetirlo
  // arriba estiraba el bloque una línea diciendo dos veces lo mismo.
  const zone = zoneForPct(pctDespues)
  // El monto libre usa DOS acentos, no tres: verde en zona sana, terracota
  // fuera de ella. Es el mismo criterio que el resto de la piel de fijos,
  // que colapsó los cuatro hues de estado del `computeAccent` viejo en dos.
  const neoLibreInk = neo
    ? zone === 'sana'
      ? neo.add.accentGreen
      : neo.add.accentClay
    : undefined

  // Color + glow + veredicto del "te queda libre" según la holgura, con el
  // MISMO umbral del HealthBadge (impact-card.tsx): holgado / ajustado /
  // apretado. Convierte el dato frío en un semáforo emocional.
  const libreTone =
    pctDespues > 70
      ? {
          color: theme.colors.danger,
          glow: theme.colors.danger,
          phrase: t('fijos:wizard.step2.freePhraseTight'),
        }
      : pctDespues > 50
        ? {
            color: theme.colors.peach,
            glow: theme.colors.peach,
            phrase: t('fijos:wizard.step2.freePhraseSnug'),
          }
        : {
            color: theme.colors.primary,
            glow: theme.colors.heroAccent,
            phrase: t('fijos:wizard.step2.freePhraseComfortable'),
          }

  return (
    <Animated.View
      key="step-2"
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(140)}
      layout={LinearTransition.duration(260)}
      style={[styles.formStack, neo ? { gap: 10 } : null]}
    >
      <RiseView>
        <View
          style={[
            styles.summaryCard,
            { backgroundColor: theme.colors.creamCard, borderColor: theme.colors.line },
            neo
              ? {
                  backgroundColor: neo.add.step2Card.background,
                  experimental_backgroundImage: neo.add.step2Card.gradientCss,
                  borderWidth: 0,
                  boxShadow: neo.add.step2Card.shadow,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                }
              : null,

          ]}
        >
          <View
            style={[
              styles.summaryIcon,
              {
                backgroundColor: selectedCategory
                  ? hexAlpha(selectedCategory.color, 0.18)
                  : theme.colors.creamSoft,
                borderColor: selectedCategory
                  ? hexAlpha(selectedCategory.color, 0.34)
                  : theme.colors.line,
              },
              // 44×44 sin borde, con el TONO de la categoría — el mismo que
              // pinta los headers colapsables de la lista y el tile del rail
              // del paso 1. Acá sí cambia con el tema: la categoría se tiene
              // que ver igual donde se la elige y donde se la lee después.
              neo && selectedCategory
                ? {
                    width: 44,
                    height: 44,
                    borderWidth: 0,
                    backgroundColor: resolveFijosCategoryTone(
                      selectedCategory.name,
                      theme.isDark,
                    ).surface,
                  }
                : null,
            ]}
          >
            {selectedCategory ? (
              // selectedCategory.name es el nombre CRUDO de la categoría.
              // CategoryIcon rendea el sticker si hay slug mapeado, sino el emoji.
              <CategoryIcon
                name={selectedCategory.name}
                scope="fixed_expense"
                size={neo ? 32 : 30}
                emojiStyle={neo ? styles.summaryIconTextNeo : styles.summaryIconText}
                // Sin placa en neo: en oscuro la placa clara se lee como un
                // recorte de light mode adentro del tile. El sticker se apoya
                // directo sobre el tono.
                onLightSurface={neo ? true : false}
              />
            ) : (
              <Text style={styles.summaryIconText}>
                {t('fijos:wizard.summaryFallbackIcon')}
              </Text>
            )}
          </View>
          <View style={neo ? { flex: 1, minWidth: 0 } : { flex: 1 }}>
            <Text
              style={[
                styles.summaryName,
                { color: theme.colors.text },
                neo
                  ? { fontSize: 16, fontWeight: '900', fontFamily: neo.font('900'), color: neo.ink.title }
                  : null,
              ]}
            >
              {name}
            </Text>
            <Text
              style={[
                styles.summaryMeta,
                { color: theme.colors.textMuted },
                neo
                  ? {
                      fontSize: 11.5,
                      fontWeight: '700',
                      fontFamily: neo.font('700'),
                      color: neo.mutedInk,
                      marginTop: 0,
                    }
                  : null,
              ]}
            >
              {selectedCategory?.displayName ?? t('fijos:wizard.step2.noCategory')} ·{' '}
              {(() => {
                const freqKey = FREQ_OPTIONS.find((f) => f.id === freqChoice)?.labelKey
                return freqKey ? t(freqKey) : ''
              })()}
              {isInstallment ? t('fijos:wizard.step2.metaInstallment', { count: cuotaTot }) : ''}
              {day != null ? t('fijos:wizard.step2.metaDay', { day }) : ''}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text
              style={[
                styles.summaryAmount,
                { color: theme.colors.text },
                neo
                  ? {
                      fontSize: 20,
                      fontWeight: '900',
                      fontFamily: neo.font('900'),
                      color: neo.ink.title,
                      letterSpacing: 0,
                    }
                  : null,
              ]}
            >
              {formatMoney(amount)}
            </Text>
            {isInstallment ? (
              <Text
                style={[
                  styles.summaryCuotaMeta,
                  { color: theme.colors.textMuted },
                  neo ? { color: neo.mutedInk, fontFamily: neo.font('700'), fontWeight: '700' } : null,
                ]}
              >
                {t('fijos:wizard.step2.installmentMeta', {
                  count: cuotaTot,
                  total: formatMoney(totalCuotas),
                })}
              </Text>
            ) : null}
          </View>
        </View>
      </RiseView>

      {neo ? (
        <RiseView delay={80}>
          {/* El eyebrow vive DENTRO de la card, en la misma fila que el chip
              del delta: el handoff los lee como un par (qué mido / cuánto
              sumo), no como un título suelto arriba del bloque. */}
          <View
            style={[
              styles.impactCardNeo,
              {
                backgroundColor: neo.add.step2Card.background,
                experimental_backgroundImage: neo.add.step2Card.gradientCss,
                boxShadow: neo.add.step2Card.shadow,
              },
            ]}
          >
            <View style={styles.impactHead}>
              <Text
                style={[
                  styles.impactEyebrowNeo,
                  { color: neo.mutedInk, fontFamily: neo.font('800') },
                ]}
              >
                {t('fijos:wizard.step2.impactEyebrowNeo')}
              </Text>
              {/* El chip no se parte: en un teléfono angosto el eyebrow lo
                  empujaba y "+$100.000" quedaba en dos renglones. El que cede
                  es el eyebrow (`flexShrink`), que sí puede truncarse. */}
              {nuevoTotal - prevTotal !== 0 ? (
                // El chip es la cifra que el usuario acaba de decidir: entra
                // después de la card, no con ella. Sin el retraso aparecía
                // pintado desde el primer frame y se perdía el "esto sumaste".
                <AnimatedText
                  entering={FadeIn.duration(motionDurations.standard).delay(
                    motionDurations.standard,
                  )}
                  style={[
                    styles.deltaChip,
                    {
                      borderRadius: neo.add.deltaChip.radius,
                      paddingHorizontal: neo.add.deltaChip.padH,
                      paddingVertical: neo.add.deltaChip.padV,
                      fontSize: neo.add.deltaChip.fontSize,
                      color: neo.add.deltaChip.ink,
                      backgroundColor: neo.add.deltaChip.background,
                      fontFamily: neo.font('900'),
                    },
                  ]}
                  numberOfLines={1}
                  allowFontScaling={false}
                >
                  {t('fijos:wizard.step2.deltaAdded', {
                    amount: formatMoney(nuevoTotal - prevTotal),
                  })}
                </AnimatedText>
              ) : null}
            </View>

            <ImpactColumns
              beforeLabel={t('fijos:wizard.step2.beforeShort')}
              afterLabel={t('fijos:wizard.step2.afterShort')}
              beforeValue={formatMoney(prevTotal)}
              afterValue={formatMoney(nuevoTotal)}
              beforePctText={
                monthlyIncome > 0
                  ? t('fijos:wizard.step2.pctOfSalary', { pct: pctAntes })
                  : undefined
              }
              afterPctText={monthlyIncome > 0 ? `${pctDespues}%` : undefined}
              deltaPctText={
                monthlyIncome > 0 && deltaPct !== 0
                  ? `${deltaPct > 0 ? '+' : ''}${deltaPct}pp`
                  : undefined
              }
            />

            {monthlyIncome > 0 ? (
              <LibreBlockNeo
                neo={neo}
                libreDespues={libreDespues}
                pctDespues={pctDespues}
                zone={zone}
                ink={neoLibreInk ?? neo.add.accentGreen}
                pctAntes={pctAntes}
              />
            ) : null}
          </View>
        </RiseView>
      ) : (
      <RiseView delay={80}>
        <View>
          <Text style={[styles.eyebrow, { color: theme.colors.textMuted, marginBottom: 8 }]}>
            {t('fijos:wizard.step2.impactEyebrow')}
          </Text>
          <View
            style={[
              styles.impactCard,
              { backgroundColor: theme.colors.creamCard, borderColor: theme.colors.line },
            ]}
          >
            <ImpactRow
              label={t('fijos:wizard.step2.currentFixed')}
              value={formatMoney(prevTotal)}
              // Sin sueldo (income 0 / modo dinámico) el "% de tu sueldo"
              // daba un "0%" sin sentido — mismo gate que el bar/libre.
              sub={
                monthlyIncome > 0
                  ? t('fijos:wizard.step2.pctOfSalary', { pct: pctAntes })
                  : undefined
              }
            />
            <ImpactRow
              label={t('fijos:wizard.step2.afterAdding')}
              value={formatMoney(nuevoTotal)}
              sub={
                monthlyIncome > 0
                  ? t('fijos:wizard.step2.pctOfSalary', { pct: pctDespues })
                  : undefined
              }
              emphasis
              deltaPct={deltaPct}
            />
            {monthlyIncome > 0 ? (
              <ImpactBar beforePct={pctAntes} afterPct={pctDespues} />
            ) : null}
            {monthlyIncome > 0 ? (
              <View
                style={[
                  styles.libreRow,
                  { backgroundColor: theme.colors.pageBg, borderColor: theme.colors.line },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.libreEyebrow, { color: theme.colors.textMuted }]}>
                    {t('fijos:wizard.step2.freeLeftEyebrow')}
                  </Text>
                  <Text style={[styles.librePhrase, { color: theme.colors.textMuted }]}>
                    {libreTone.phrase}
                  </Text>
                  <CountUpText
                    value={libreDespues}
                    format={formatMoney}
                    unit="money"
                    flourish
                    duration={900}
                    glowColor={libreTone.glow}
                    style={[styles.libreValue, { color: libreTone.color }]}
                  />
                </View>
                <HealthBadge pct={pctDespues} />
              </View>
            ) : null}
          </View>
        </View>
      </RiseView>
      )}

      {selectedCategory ? (
        <RiseView delay={160}>
          <View>
            {/* El día elegido viaja al eyebrow: el handoff no dibuja el pie
                de la card, dice "SE AGENDARÁ EN · DÍA 16" arriba. */}
            <Text
              style={[
                styles.eyebrow,
                { color: theme.colors.textMuted, marginBottom: 8 },
                neo
                  ? { ...neo.detail.sectionLabel, color: neo.mutedInk }
                  : null,
              ]}
            >
              {neo && day != null
                ? t('fijos:wizard.step2.scheduledOnDay', { day })
                : t('fijos:wizard.step2.scheduledOn')}
            </Text>
            <CalendarDropImpact
              day={day}
              onChangeDay={onChangeDay}
              category={selectedCategory}
              warning={flagDay}
            />
            {firstCuota ? (
              <View style={styles.firstCuotaBlock}>
                <Text
                  style={[
                    styles.eyebrow,
                    { color: theme.colors.textMuted, marginBottom: 8 },
                    neo ? { ...neo.detail.sectionLabel, color: neo.mutedInk } : null,
                    // Mismo cue de aviso que el calendario: clay + 900.
                    flagFirstCuota && neo
                      ? {
                          color: neo.add.accentClay,
                          fontFamily: neo.font('900'),
                          fontWeight: '900' as const,
                        }
                      : null,
                  ]}
                >
                  {t('fijos:wizard.step2.firstCuotaEyebrow')}
                </Text>
                <DayChips
                  options={[
                    {
                      value: 'current' as const,
                      label: firstCuotaChipLabel(t, firstCuota.currentDate, firstCuota.currentDelta),
                    },
                    { value: 'next' as const, label: formatFirstCuotaDate(firstCuota.nextDate) },
                  ]}
                  value={firstCuota.choice}
                  onSelect={onSelectFirstCuota}
                  accessibilityLabel={t('fijos:wizard.step2.firstCuotaA11y')}
                />
                {firstCuota.choice == null ? (
                  <Text
                    style={[
                      styles.firstCuotaHint,
                      { color: theme.colors.textMuted },
                      neo ? { color: neo.mutedInk } : null,
                      flagFirstCuota && neo
                        ? { color: neo.add.accentClay, fontFamily: neo.font('800'), fontWeight: '800' as const }
                        : null,
                    ]}
                  >
                    {t('fijos:wizard.step2.firstCuotaPrompt')}
                  </Text>
                ) : firstCuota.placement ? (
                  <Text
                    style={[
                      styles.firstCuotaHint,
                      { color: theme.colors.textMuted },
                      neo ? { color: neo.mutedInk } : null,
                    ]}
                  >
                    {firstCuota.placement === 'next-cycle'
                      ? t('fijos:wizard.step2.firstCuotaHintNextCycle')
                      : t('fijos:wizard.step2.firstCuotaHintThisCycle')}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>
        </RiseView>
      ) : null}

      <RiseView delay={220}>
        <Pressable
          onPress={onToggleNotify}
          style={[
            styles.reminderCard,
            {
              backgroundColor: notify
                ? theme.isDark
                  ? 'rgba(166,239,143,0.18)'  // V1 primary-300 alpha
                  : '#EAFBE4'  // V1 primary-100
                : theme.colors.creamCard,
              borderColor: notify
                ? theme.isDark
                  ? 'rgba(166,239,143,0.5)'
                  : '#49D61F'  // V1 primary-500
                : theme.colors.line,
            },
            // Handoff: card r18 con fondo verde suave y ANILLO interno de 2px
            // cuando está activo. El borde de 1px se anula — el anillo lo
            // reemplaza, igual que en el resto del rediseño. Las superficies
            // van en capas (ver `ToggleCardSurfaceNeo`).
            neo ? styles.toggleCardNeo : null,
          ]}
          accessibilityRole="switch"
          accessibilityState={{ checked: notify }}
          accessibilityLabel={t('fijos:wizard.step2.reminderA11y')}
        >
          {neo ? <ToggleCardSurfaceNeo neo={neo} on={notify} /> : null}
          <View style={[styles.reminderLeft, neo ? { gap: 11 } : null]}>
            <Text
              allowFontScaling={false}
              style={[styles.reminderEmoji, neo ? { fontSize: 19 } : null]}
            >
              {notify ? '🔔' : '🔕'}
            </Text>
            <View style={{ flex: 1 }}>
              <Text
                style={[
                  styles.eyebrow,
                  { color: theme.colors.textMuted },
                  // La card del recordatorio usa un eyebrow más chico que el
                  // de sección (10 vs 11, ls 1.2 vs 1.98): es una etiqueta
                  // dentro de una card, no un título de bloque.
                  neo
                    ? {
                        fontSize: 10,
                        fontWeight: '800',
                        fontFamily: neo.font('800'),
                        letterSpacing: 1.2,
                        color: neo.mutedInk,
                      }
                    : null,
                ]}
              >
                {t('fijos:wizard.step2.reminderEyebrow')}
              </Text>
              <Text
                style={[
                  styles.reminderText,
                  { color: theme.colors.text },
                  neo
                    ? {
                        fontWeight: '900',
                        fontFamily: neo.font('900'),
                        color: neo.ink.title,
                        marginTop: 1,
                      }
                    : null,
                ]}
              >
                {notify
                  ? t('fijos:wizard.step2.reminderOn')
                  : t('fijos:wizard.step2.reminderOff')}
              </Text>
            </View>
          </View>
          <ReminderToggle
            neo={neo}
            on={notify}
            classicTrackOff={theme.colors.line}
            classicKnob={theme.colors.creamCard}
            isDark={theme.isDark}
          />
        </Pressable>
      </RiseView>

      {/*
        Toggle "Ya pagué la cuota más reciente" — sólo en CREACIÓN
        (no edición) y para fijos NO-installment (los installments
        tienen otro flujo: la primera cuota se contabiliza con el
        contador `installments_paid`).

        Default OFF: el comportamiento "natural" es que estoy dando de
        alta un fijo pendiente. ON cuando el user lo prende
        explícitamente. Activarlo encadena el RPC de payment tras el
        create, que:
          · inserta payment row con period_month = mes actual,
          · avanza next_due_on al mes siguiente,
          · setea last_paid_at = now().

        Sin este toggle (estado pre-2026-05-30), creator que quería
        marcar "ya pagué" tocaba "Registrar pago" desde el listado —
        pero como el form arrancaba el next_due_on en el mes siguiente,
        ese pago avanzaba a +2 meses (skipeando la cuota en curso).
        Bug confirmado en prod con kontosmario@gmail.com (11 fijos
        afectados).
      */}
      {showAlreadyPaidToggle ? (
        <RiseView delay={280}>
          <Pressable
            onPress={onToggleAlreadyPaid}
            style={[
              styles.reminderCard,
              {
                backgroundColor: alreadyPaidCurrentCuota
                  ? theme.isDark
                    ? 'rgba(166,239,143,0.18)'
                    : '#EAFBE4'
                  : theme.colors.creamCard,
                borderColor: alreadyPaidCurrentCuota
                  ? theme.isDark
                    ? 'rgba(166,239,143,0.5)'
                    : '#49D61F'
                  : theme.colors.line,
              },
              // El handoff no dibuja esta card (aparece sólo en creación de
              // fijos no-cuota), así que el criterio es la consistencia con
              // su hermana de arriba: mismo material, mismo anillo.
              neo ? styles.toggleCardNeo : null,
            ]}
            accessibilityRole="switch"
            accessibilityState={{ checked: alreadyPaidCurrentCuota }}
            accessibilityLabel={t('fijos:wizard.step2.alreadyPaidA11y')}
            accessibilityHint={t('fijos:wizard.step2.alreadyPaidHint')}
          >
            {neo ? <ToggleCardSurfaceNeo neo={neo} on={alreadyPaidCurrentCuota} /> : null}
            <View style={[styles.reminderLeft, neo ? { gap: 11 } : null]}>
              <Text
                allowFontScaling={false}
                style={[styles.reminderEmoji, neo ? { fontSize: 19 } : null]}
              >
                {alreadyPaidCurrentCuota ? '✅' : '⏳'}
              </Text>
              <View style={{ flex: 1 }}>
                <Text
                style={[
                  styles.eyebrow,
                  { color: theme.colors.textMuted },
                  neo
                    ? {
                        fontSize: 10,
                        fontWeight: '800',
                        fontFamily: neo.font('800'),
                        letterSpacing: 1.2,
                        color: neo.mutedInk,
                      }
                    : null,
                ]}
              >
                  {t('fijos:wizard.step2.currentStateEyebrow')}
                </Text>
                <Text
                  style={[
                    styles.reminderText,
                    { color: theme.colors.text },
                    neo
                      ? {
                          fontWeight: '900',
                          fontFamily: neo.font('900'),
                          color: neo.ink.title,
                          marginTop: 1,
                        }
                      : null,
                  ]}
                >
                  {alreadyPaidCurrentCuota
                    ? t('fijos:wizard.step2.alreadyPaidOn')
                    : t('fijos:wizard.step2.alreadyPaidOff')}
                </Text>
              </View>
            </View>
            <ReminderToggle
              neo={neo}
              on={alreadyPaidCurrentCuota}
              classicTrackOff={theme.colors.line}
              classicKnob={theme.colors.creamCard}
              isDark={theme.isDark}
            />
          </Pressable>
        </RiseView>
      ) : null}
    </Animated.View>
  )
}

/**
 * Superficie de las cards de recordatorio y de "ya pagué", en dos capas que se
 * cruzan por opacidad.
 *
 * El estado ON es un ANILLO interno de 2px sobre fondo tintado, y el OFF es la
 * card elevada del kit. Los dos viven en `boxShadow`, que no se interpola: sin
 * las capas, prender el toggle hacía aparecer el anillo de un frame al otro
 * mientras la perilla se deslizaba suave al lado. Mismo recurso que el chip de
 * frecuencia.
 */
function ToggleCardSurfaceNeo({ neo, on }: { neo: FijosNeoSkin; on: boolean }) {
  const reduceMotion = useReducedMotion()
  const progress = useSharedValue(on ? 1 : 0)
  useEffect(() => {
    progress.value = reduceMotion
      ? on
        ? 1
        : 0
      : withTiming(on ? 1 : 0, { duration: motionDurations.standard })
  }, [on, reduceMotion, progress])
  const offStyle = useAnimatedStyle(() => ({ opacity: 1 - progress.value }))
  const onStyle = useAnimatedStyle(() => ({ opacity: progress.value }))
  return (
    <>
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius: 18,
            backgroundColor: neo.add.step2Card.background,
            experimental_backgroundImage: neo.add.step2Card.gradientCss,
            boxShadow: neo.add.step2Card.shadow,
          },
          offStyle,
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius: 18,
            backgroundColor: neo.add.reminderOnBackground,
            boxShadow: `inset 0 0 0 2px ${neo.add.accentGreen}`,
          },
          onStyle,
        ]}
      />
    </>
  )
}

/**
 * Toggle de las cards de recordatorio y de "ya pagué". La rama `classic` es
 * LITERAL la de siempre; la `neo` es la pista de 44×26 del handoff, con la
 * perilla en `#FFFDF6` — el único color del rediseño que NO cambia con el
 * tema. El desplazamiento sale de la geometría (`ancho − perilla − inset`),
 * no de una constante: la pista y la perilla ya viven en el skin.
 */
function ReminderToggle({
  neo,
  on,
  classicTrackOff,
  classicKnob,
  isDark,
}: {
  neo: FijosNeoSkin | null
  on: boolean
  classicTrackOff: string
  classicKnob: string
  isDark: boolean
}) {
  const reduceMotion = useReducedMotion()
  const progress = useSharedValue(on ? 1 : 0)
  const tg = neo?.add.toggle
  // La perilla VIAJA y la pista tiñe. Antes las dos saltaban de un frame al
  // otro: el switch se sentía como un checkbox, no como un switch. El spring
  // es el mismo `press` del resto del kit — un toggle es feedback directo,
  // no una transición de contenido.
  useEffect(() => {
    if (reduceMotion) {
      progress.value = on ? 1 : 0
      return
    }
    progress.value = withSpring(on ? 1 : 0, motionSprings.press)
  }, [on, reduceMotion, progress])

  const offTrack = tg?.offBackground ?? classicTrackOff
  const onTrack = tg?.on ?? (isDark ? '#A6EF8F' : '#297811')
  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], [offTrack, onTrack]),
  }))
  const travelFrom = tg ? tg.knobInset : 2
  const travelTo = tg ? tg.width - tg.knobSize - tg.knobInset : 18
  const knobStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: travelFrom + (travelTo - travelFrom) * progress.value }],
  }))

  if (!tg) {
    return (
      <Animated.View style={[styles.reminderToggle, trackStyle]}>
        <Animated.View
          style={[styles.reminderToggleKnob, { backgroundColor: classicKnob }, knobStyle]}
        />
      </Animated.View>
    )
  }
  return (
    <Animated.View
      style={[
        styles.reminderToggle,
        {
          width: tg.width,
          height: tg.height,
          borderRadius: tg.radius,
          boxShadow: tg.shadow,
        },
        trackStyle,
      ]}
    >
      <Animated.View
        style={[
          styles.reminderToggleKnob,
          {
            width: tg.knobSize,
            height: tg.knobSize,
            borderRadius: tg.knobSize / 2,
            backgroundColor: tg.knobBackground,
            boxShadow: tg.knobShadow,
          },
          knobStyle,
        ]}
      />
    </Animated.View>
  )
}

/**
 * "TE QUEDA LIBRE" en la piel neo. Es el único bloque del wizard que NO se
 * hunde: los campos son pozos porque ahí se escribe, y éste es la conclusión
 * de todo lo anterior — panel plano tintado con anillo, apoyado sobre la card.
 *
 * Adentro van, en este orden: Brot festejando, el monto, la badge de zona, el
 * medidor de zonas y el caption que nombra la zona. El veredicto se dice UNA
 * vez, en el caption.
 */
function LibreBlockNeo({
  neo,
  libreDespues,
  pctDespues,
  zone,
  ink,
  pctAntes,
}: {
  neo: FijosNeoSkin
  libreDespues: number
  pctDespues: number
  zone: 'sana' | 'media' | 'alta'
  ink: string
  /** Punto de partida de la perilla: el medidor la hace VIAJAR de acá hasta
   *  `pctDespues`, que es lo que comunica el delta desde que se sacó la
   *  `ImpactBar`. */
  pctAntes: number
}) {
  const { t } = useTranslation()
  const lp = neo.add.librePanel
  const zoneLabel =
    zone === 'alta'
      ? t('fijos:wizard.step2.zoneRisk')
      : zone === 'media'
        ? t('fijos:wizard.step2.zoneTight')
        : t('fijos:wizard.step2.zoneHealthy')
  return (
    <View
      style={[
        styles.librePanel,
        {
          borderRadius: lp.radius,
          paddingVertical: lp.padV,
          paddingHorizontal: lp.padH,
          backgroundColor: lp.background,
          borderColor: lp.borderColor,
          borderWidth: lp.borderWidth,
        },
      ]}
    >
      <View style={styles.libreHead}>
        <BrotMascot pose="cheer" size={42} shadow={false} />
        <View style={{ flex: 1 }}>
          <Text
            style={[
              styles.libreEyebrowNeo,
              { color: ink, fontFamily: neo.font('800') },
            ]}
          >
            {t('fijos:wizard.step2.freeLeftEyebrow')}
          </Text>
          <CountUpText
            value={libreDespues}
            format={formatMoney}
            unit="money"
            flourish
            duration={900}
            glowColor={ink}
            style={[styles.libreValueNeo, { color: ink, fontFamily: neo.font('900') }]}
          />
        </View>
        <HealthBadge pct={pctDespues} zone={zone} />
      </View>

      <ZoneGauge pct={pctDespues} fromPct={pctAntes} />

      <View style={styles.zoneCaption}>
        {/* Nunito son faces estáticas por peso: el <Text> anidado que sube a
            900 tiene que pedir también la familia, o rendea con la del padre. */}
        <Text
          style={[
            styles.zoneCaptionLeft,
            { color: neo.ink.title, fontFamily: neo.font('800') },
          ]}
        >
          {t('fijos:wizard.step2.pctOfSalary', { pct: pctDespues })}
          {' · '}
          <Text style={{ color: ink, fontWeight: '900', fontFamily: neo.font('900') }}>
            {zoneLabel}
          </Text>
        </Text>
        <Text
          style={[
            styles.zoneCaptionRight,
            { color: neo.faintInk, fontFamily: neo.font('800') },
          ]}
        >
          {t('fijos:wizard.step2.zoneLimit')}
        </Text>
      </View>
    </View>
  )
}

/** "5 de septiembre" / "September 5" según el locale activo. El ISO se
 *  parsea como medianoche LOCAL (sin la Z): con la Z, en AR (UTC-3) el 5
 *  se mostraría como 4. */
function formatFirstCuotaDate(dateIso: string): string {
  const parsed = new Date(`${dateIso}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return dateIso
  return getDateTimeFormat({ day: 'numeric', month: 'long' }).format(parsed)
}

/** Chip de la ocurrencia del período en curso, con su sufijo honesto:
 *  "· venció hace N días" / "· hoy" / "· en N días". */
function firstCuotaChipLabel(
  t: (key: string, opts?: Record<string, unknown>) => string,
  dateIso: string,
  delta: number,
): string {
  const date = formatFirstCuotaDate(dateIso)
  if (delta === 0) return t('fijos:wizard.step2.firstCuotaCurrentToday', { date })
  if (delta > 0) return t('fijos:wizard.step2.firstCuotaCurrentInDays', { date, count: delta })
  return t('fijos:wizard.step2.firstCuotaCurrentOverdue', { date, count: -delta })
}

const styles = StyleSheet.create({
  firstCuotaBlock: {
    marginTop: 14,
  },
  firstCuotaHint: {
    fontSize: 12.5,
    fontFamily: nunitoFamily('600'),
    fontWeight: '600',
    lineHeight: 17,
    marginTop: 8,
  },
  formStack: { gap: 12 },
  eyebrow: { fontSize: 10, letterSpacing: 1.6, fontWeight: '700', fontFamily: nunitoFamily('700') },
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 20,
    borderWidth: 1,
  },
  summaryIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  summaryIconText: { fontSize: 22 },
  summaryIconTextNeo: { fontSize: 21 },
  summaryName: { fontSize: 15, fontWeight: '800', fontFamily: nunitoFamily('800') },
  summaryMeta: { fontSize: 11, marginTop: 2 },
  summaryAmount: { fontSize: 18, fontWeight: '800', fontFamily: nunitoFamily('800'), letterSpacing: -0.4 },
  summaryCuotaMeta: { fontSize: 10, fontWeight: '600', fontFamily: nunitoFamily('600'), marginTop: 2 },
  impactCard: {
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    gap: 10,
  },
  libreRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 4,
    borderStyle: 'dashed',
  },
  libreEyebrow: { fontSize: 10, letterSpacing: 1.2, fontWeight: '700', fontFamily: nunitoFamily('700') },
  librePhrase: { fontSize: 12, fontWeight: '600', fontFamily: nunitoFamily('600'), letterSpacing: -0.1, marginTop: 3 },
  libreValue: { fontSize: 24, fontWeight: '800', fontFamily: nunitoFamily('800'), letterSpacing: -0.6, marginTop: 2 },
  reminderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  reminderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  reminderEmoji: { fontSize: 22 },
  reminderText: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    marginTop: 2,
  },
  reminderToggle: {
    width: 38,
    height: 22,
    borderRadius: 999,
    justifyContent: 'center',
  },
  reminderToggleKnob: {
    width: 18,
    height: 18,
    borderRadius: 999,
  },
  // ── neo ────────────────────────────────────────────────────────────────
  impactCardNeo: { borderRadius: 22, paddingVertical: 15, paddingHorizontal: 16 },
  impactHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  // 0.14em sobre 10.5px. RN no acepta em.
  impactEyebrowNeo: { fontSize: 10.5, fontWeight: '800', fontFamily: nunitoFamily('800'), letterSpacing: 1.47, flexShrink: 1 },
  // `flexShrink: 0` explícito: el que cede en un ancho apretado es el eyebrow,
  // que puede truncarse sin perder información. El chip es una CIFRA — cortarla
  // la vuelve mentira.
  deltaChip: { fontWeight: '900', fontFamily: nunitoFamily('900'), overflow: 'hidden', flexShrink: 0 },
  librePanel: { marginTop: 14 },
  libreHead: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  // 0.1em sobre 10px.
  libreEyebrowNeo: { fontSize: 10, fontWeight: '800', fontFamily: nunitoFamily('800'), letterSpacing: 1 },
  libreValueNeo: { fontSize: 22, fontWeight: '900', fontFamily: nunitoFamily('900'), marginTop: 1 },
  zoneCaption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 8,
  },
  zoneCaptionLeft: { fontSize: 11, fontWeight: '800', fontFamily: nunitoFamily('800'), flexShrink: 1 },
  zoneCaptionRight: { fontSize: 9.5, fontWeight: '800', fontFamily: nunitoFamily('800') },
  // Sin fondo ni sombra propios: los pone `ToggleCardSurfaceNeo` en capas.
  toggleCardNeo: {
    borderRadius: 18,
    borderWidth: 0,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: 'transparent',
  },
})
