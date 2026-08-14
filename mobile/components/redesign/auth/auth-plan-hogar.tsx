// @i18n-ignore-file — el copy user-facing pasó a t() (billing:*). El header
// se MANTIENE porque quedan 3 literales por diseño (ver COPY abajo): el tag
// HOGAR (mayús del mock ≠ billing:brand.tag "Hogar"), los precios demo de
// fallback ($4.99/$39.99) y el disclosure del mock (billing:paywall.disclosure
// difiere; el live lo pasa por prop). Los demás labels llegan por props del
// modo live o caen a su key traducible.
import { useEffect, useRef, useState, type ReactElement } from 'react'
import {
  Pressable,
  StyleSheet,
  View,
  type RefreshControlProps,
} from 'react-native'
import { AnimatedText, Text } from '@/components/ui/app-text'
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'
import { BrotMascot, BrotParticles } from '@/components/brot'
import { FernLogo } from '@/components/auth/fern-logo'
import { SkeletonBox } from '@/components/ui/skeleton-box'
import { usePressScale } from '@/hooks/use-press-scale'
import { triggerHaptic } from '@/lib/haptics'
import { nunitoFamily } from '@/theme/typography'
import {
  AuthBackHeader,
  AuthHomeIndicator,
  AuthLink,
  AuthScreenShell,
  AuthScrollBody,
  AuthStatusBar,
} from './auth-kit'
import { AUTH_SPEC, type AuthMode } from './auth-spec'
import { PLAN_SPEC } from './plan-spec'
import { CheckIcon, LockClosedIcon } from './plan-icons'

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

/**
 * 4m · Plan del hogar (paywall) — réplica de screens/4m.html (claro) y
 * 4mo.html (oscuro). Es el estado welcome+trial del PaywallView real
 * (mobile/.../paywall-view.tsx): aparece post-onboarding UNA vez y luego
 * desde Ajustes. El CTA primario verde CONTINÚA con los 30 días de
 * acceso completo (saltea el pago); el secundario inset es el que cobra
 * (emphasis invertida del welcomeMode real).
 *
 * Copy literal del mockup + de las keys reales (billing:*). Precios,
 * días y ahorro son LITERALES del mock (demo dev-only, sin StoreKit).
 *
 * WIRING LIVE (2026-07-17) — el contrato recibe por props los valores
 * reales; TODOS los defaults son los literales demo del mock, así el
 * preview dev renderiza EXACTAMENTE la réplica aprobada:
 *   · monthlyPrice/yearlyPrice = displayPrice de StoreKit, con skeleton
 *     mientras cargan (pricesLoading, patrón PlanTiles) y fallback al
 *     literal si la store falló.
 *   · trialDays = días reales del período libre (null = sin trial card).
 *   · disclosureText: el default es el texto del mock; live DEBE pasar
 *     billing:paywall.disclosure (compliance Apple 3.1.2 — incluye
 *     "…el cargo de renovación se hace dentro de esas 24 horas").
 *   · onSubscribe(planId) entrega la selección; busy = compra en vuelo.
 *   · Sin onContinueFree (visita desde Ajustes fuera del welcome, o
 *     lockMode) la emphasis vuelve a la del paywall real: "Suscribirme…"
 *     pasa a ser el CTA primario verde y el continue no se dibuja.
 *   · lockMode + onLogout/onDeleteAccount = salidas del gate duro como
 *     AuthLink muted (gap de diseño permitido: mismo lenguaje del kit).
 *   · onBack = entrada desde Ajustes (AuthBackHeader del kit, sin logo).
 *
 * Piezas NUEVAS locales (no van al kit auth aprobado): trial card,
 * wordmark+badge HOGAR, cards mensual/anual, burbuja coach, features,
 * botones. Reusa del kit: shell, status bar, home indicator, scroll,
 * partículas, Brot, links.
 *
 * COMPORTAMIENTO (owner 2026-07-17: "respetemos el paywall vigente") —
 * espejo del PaywallView/PlanTiles real:
 *   · Las cards son RADIO seleccionables; default = anual
 *     (paywall-view.tsx:66). Tap en la ya elegida = no-op sin háptico
 *     (handlePress, plan-tiles.tsx:241); cambiar = háptico selection.
 *   · Selección = anillo 2.5px (vocabulario del rediseño) + scale
 *     1.025 con el MISMO spring del tile real (plan-tiles.tsx:230).
 *   · El CTA "Suscribirme por …" sigue al plan elegido
 *     (subscribeWithPrice, paywall-view.tsx:80-85).
 *   · La burbuja del ahorro solo existe con el ANUAL elegido (el
 *     SavingsRibbon real retorna null con savingsUsd 0 del mensual).
 *   · La primera feature cambia con el plan (highlights por tier,
 *     billing-plans.ts): "Hasta 2 personas…" ↔ "Hasta 4 personas…".
 *
 * DESVÍO DEL MOCKUP (owner 2026-07-17): el drop-shadow verde del Brot
 * love en oscuro se RETIRÓ — la aproximación posible en RN (halo en
 * caja) recubría al personaje y quedaba feo.
 */

// ─── Literales retenidos (todo lo demás se resuelve por t() abajo) ────
// El resto del copy user-facing pasó a t() (billing:*). Quedan literales
// SOLO tres casos, por diseño:
//  · hogar: billing:brand.tag = "Hogar"; el mock lo pinta en MAYÚS (sin
//    textTransform) → difiere del copy aprobado, se deja literal.
//  · monthPrice/yearPrice: fallback demo del displayPrice de StoreKit
//    (dato de precio, no copy traducible).
//  · legal: texto del mock; el live pasa billing:paywall.disclosure, que
//    DIFIERE (suma "…el cargo de renovación se hace dentro de esas 24
//    horas") → se conserva el literal del mock como default de preview.
const COPY = {
  hogar: 'HOGAR', // billing:brand.tag = "Hogar" (mock MAYÚS) — mismatch
  monthPrice: '$4.99',
  yearPrice: '$39.99',
  legal:
    'El pago se cargará a tu cuenta de Apple ID al confirmar la compra. La suscripción se renueva automáticamente al mismo precio salvo que la canceles al menos 24 horas antes de que termine el período actual. Puedes gestionarla o cancelarla cuando quieras desde los Ajustes de tu cuenta en la App Store.',
} as const

export type PlanId = 'mensual' | 'anual'

export function AuthPlanHogar({
  mode,
  monthlyPrice,
  yearlyPrice,
  pricesLoading = false,
  trialDays = 30,
  busy = false,
  lockMode = false,
  lockHeadline,
  lockChip,
  continueLabel,
  subscribeMonthlyLabel,
  subscribeYearlyLabel,
  disclosureText = COPY.legal,
  restoreLabel,
  termsLabel,
  privacyLabel,
  logoutLabel,
  deleteAccountLabel,
  refreshControl,
  onBack,
  onContinueFree,
  onSubscribe,
  onRestore,
  onLogout,
  onDeleteAccount,
  onTerms,
  onPrivacy,
}: {
  mode: AuthMode
  /** displayPrice localizado de StoreKit (mensual). Ausente → literal demo. */
  monthlyPrice?: string
  /** displayPrice localizado de StoreKit (anual). Ausente → literal demo. */
  yearlyPrice?: string
  /** true mientras StoreKit trae los precios: skeleton en vez del
   *  literal (patrón PlanTiles — nunca flashear el hardcode y corregirlo). */
  pricesLoading?: boolean
  /** Días reales del período libre; null = sin período → la trial card
   *  no se dibuja (visita post-trial / lockMode). Default demo: 30. */
  trialDays?: number | null
  /** Compra en vuelo (isPurchasing): el CTA de suscripción ignora el
   *  press en silencio (semántica busy del kit — visual activo). */
  busy?: boolean
  /** Gate duro: agrega las salidas logout/eliminar cuenta (AuthLink
   *  muted — gap de diseño permitido, mismo lenguaje del kit). */
  lockMode?: boolean
  /**
   * Headline de lockMode: reemplaza "Todo tu hogar, en una cuenta." por
   * el mensaje de acceso pausado (billing:paywall.headlineLocked) para
   * que el gate duro no se lea como la pantalla de marketing (review r2).
   * Ausente en no-lock. Puede traer '\n' para el salto de línea.
   */
  lockHeadline?: string
  /** Chip "ACCESO PAUSADO" (billing:paywall.lockChip) sobre el headline. */
  lockChip?: string
  /** CTA verde welcome: continúa con el período libre (a Home, sin
   *  comprar). SIN este callback la emphasis vuelve a la del paywall
   *  real: "Suscribirme…" pasa a ser el CTA primario verde. */
  onContinueFree?: () => void
  continueLabel?: string
  /** Dispara la compra del plan ELEGIDO (radio de las cards). */
  onSubscribe?: (planId: 'hogar-mensual' | 'hogar-anual') => void
  subscribeMonthlyLabel?: string
  subscribeYearlyLabel?: string
  /** Disclosure Apple 3.1.2. Default = texto del mock (solo preview);
   *  live DEBE pasar billing:paywall.disclosure (compliance). */
  disclosureText?: string
  restoreLabel?: string
  termsLabel?: string
  privacyLabel?: string
  logoutLabel?: string
  deleteAccountLabel?: string
  /** Pull-to-refresh del caller live (refetch del entitlement). */
  refreshControl?: ReactElement<RefreshControlProps>
  /** Entrada con back (Ajustes): AuthBackHeader del kit, sin el logo
   *  centrado (la marca ya vive en la fila wordmark+HOGAR). */
  onBack?: () => void
  onRestore?: () => void
  onLogout?: () => void
  onDeleteAccount?: () => void
  onTerms?: () => void
  onPrivacy?: () => void
}) {
  const { t } = useTranslation()
  const s = AUTH_SPEC[mode]
  const p = PLAN_SPEC[mode]

  // Copy user-facing resuelto por t() (billing:*). Cada label sigue
  // pudiendo llegar por props (override explícito del live); el default
  // ya no es un literal ES sino el key traducible, para que EN funcione
  // aunque el caller omita el prop.
  const baseFeatures = t('billing:features.base', { returnObjects: true }) as string[]
  // highlights.slice(0,3) por tier (billing-plans.ts): solo cambia la
  // primera línea entre planes.
  const FEATURES: Record<PlanId, readonly string[]> = {
    anual: [t('billing:features.annualMembers'), baseFeatures[0], baseFeatures[1]],
    mensual: [t('billing:features.monthlyMembers'), baseFeatures[0], baseFeatures[1]],
  }
  const continueLabelText = continueLabel ?? t('billing:screen.welcomeCta', { count: 30 })
  const subscribeMonthlyText =
    subscribeMonthlyLabel ??
    t('billing:paywall.subscribeWithPrice', {
      price: COPY.monthPrice,
      period: t('billing:paywall.perMonth'),
    })
  const subscribeYearlyText =
    subscribeYearlyLabel ??
    t('billing:paywall.subscribeWithPrice', {
      price: COPY.yearPrice,
      period: t('billing:paywall.perYear'),
    })
  const restoreLabelText = restoreLabel ?? t('billing:paywall.restorePurchases')
  const termsLabelText = termsLabel ?? t('billing:paywall.terms')
  const privacyLabelText = privacyLabel ?? t('billing:paywall.privacy')
  const logoutLabelText = logoutLabel ?? t('billing:paywall.logout')
  const deleteAccountLabelText = deleteAccountLabel ?? t('billing:paywall.deleteAccount')

  // Selección de plan — espejo del PaywallView real: default anual
  // (paywall-view.tsx:66); tap en la ya elegida = no-op sin háptico
  // (handlePress del PlanTiles real).
  const [selected, setSelected] = useState<PlanId>('anual')
  const handleSelect = (id: PlanId) => {
    if (id === selected) return
    void triggerHaptic('selection')
    setSelected(id)
  }

  // Precio mostrado: displayPrice real si llegó; literal demo (= hardcode
  // de billing-plans) si no — mismo criterio de fallback que PlanTiles.
  const monthPriceText = monthlyPrice ?? COPY.monthPrice
  const yearPriceText = yearlyPrice ?? COPY.yearPrice
  const monthSkeleton = !monthlyPrice && pricesLoading
  const yearSkeleton = !yearlyPrice && pricesLoading

  // La card parte título ("Acceso completo") y subtítulo ("N días
  // restantes"), por eso no reusa billing:freeAccessBadge (que combina
  // ambos). Key propio con plural para el subtítulo.
  const trialDaysText = t('billing:freePeriodBanner.daysRemaining', { count: trialDays ?? 0 })

  const subscribeLabel = selected === 'anual' ? subscribeYearlyText : subscribeMonthlyText
  const handleSubscribe = () =>
    onSubscribe?.(selected === 'anual' ? 'hogar-anual' : 'hogar-mensual')

  return (
    <AuthScreenShell mode={mode}>
      <AuthStatusBar mode={mode} bars={3} />
      <AuthScrollBody gutter={22} refreshControl={refreshControl}>
        {/* Back de la entrada desde Ajustes (live). El preview y los
            modos sin back (welcome / lockMode) no lo dibujan. */}
        {onBack ? <AuthBackHeader mode={mode} onBack={onBack} logo={false} /> : null}
        <Text style={[styles.title, onBack ? styles.titleAfterBack : null, { color: s.text }]}>
          {t('billing:screen.title')}
        </Text>

        {/* Trial card: círculo + candado + "Acceso completo · N días".
            Solo con período libre vigente (trialDays != null) — espejo
            del inFreePeriod del PaywallView real. */}
        {trialDays != null ? (
          <View
            style={[styles.trialCard, { backgroundColor: p.trialBackground, boxShadow: p.trialShadow }]}
          >
            <View
              style={[
                styles.trialCircle,
                { backgroundColor: p.trialCircleBackground, boxShadow: p.trialCircleShadow },
              ]}
            >
              <LockClosedIcon color={p.lockStroke} size={17} />
            </View>
            <View>
              <Text style={[styles.trialTitle, { color: p.trialTitle }]}>
                {t('billing:freePeriodBanner.title')}
              </Text>
              <Text style={[styles.trialDays, { color: p.trialDays }]}>{trialDaysText}</Text>
            </View>
          </View>
        ) : null}

        {/* Wordmark + badge HOGAR (distinto del AuthWordmark de 3a). */}
        <View style={styles.wordmarkRow}>
          <FernLogo size={26} palette={s.fernPalette} />
          <Text style={[styles.wordmark, { color: s.text }]}>Manifiesto</Text>
          <View style={[styles.hogarBadge, { boxShadow: p.hogarBadgeShadow }]}>
            <Text style={[styles.hogarBadgeText, { color: p.hogarBadgeText }]}>{COPY.hogar}</Text>
          </View>
        </View>

        {/* Chip "ACCESO PAUSADO" (solo lockMode con copy provisto). */}
        {lockMode && lockChip ? (
          <View style={styles.lockChipWrap}>
            <Text style={[styles.lockChip, { color: s.text, borderColor: s.helper }]}>
              {lockChip}
            </Text>
          </View>
        ) : null}

        {/* Headline + Brot love (glow en oscuro). En lockMode con copy
            provisto, el mensaje de "acceso pausado" en vez del default. */}
        <View style={styles.headlineRow}>
          <Text style={[styles.headline, { color: s.text }]}>
            {lockMode && lockHeadline ? lockHeadline : t('billing:paywall.headlineDefault')}
          </Text>
          {/* love CON sombra de piso (el mock NO le pone shadow=false —
              solo al coach). SIN el glow verde del mock oscuro: la
              aproximación en caja recubría al personaje (desvío owner,
              ver header). */}
          <BrotMascot pose="love" size={80} />
        </View>

        {/* Grid de planes: mensual (neutro) + anual (verde, destacado).
            Cards RADIO seleccionables (espejo del PlanTiles real):
            anillo + scale spring en la elegida. */}
        <View style={styles.plansRow}>
          <SelectablePlanCard
            selected={selected === 'mensual'}
            ring={p.monthRing}
            baseShadow={p.monthCardShadow}
            accessibilityLabel={
              monthSkeleton
                ? t('billing:planTiles.monthlyA11yLoading', {
                    plan: t('billing:plans.hogar-mensual.name'),
                  })
                : t('billing:planTiles.monthlyA11y', {
                    plan: t('billing:plans.hogar-mensual.name'),
                    price: monthPriceText,
                  })
            }
            flex={1}
            onPress={() => handleSelect('mensual')}
            style={[
              styles.monthCard,
              {
                experimental_backgroundImage: p.monthCardCss,
                backgroundColor: p.monthCardFallback,
              },
            ]}
          >
            <Text style={[styles.planLabel, { color: p.monthLabel }]}>
              {t('billing:planTiles.monthly')}
            </Text>
            <View style={styles.priceRow}>
              <PlanPrice text={monthPriceText} skeleton={monthSkeleton} color={p.monthPrice} width={56} />
              <Text style={[styles.per, { color: p.monthPer }]}>{t('billing:paywall.perMonth')}</Text>
            </View>
            <Text style={[styles.planMeta, { color: p.monthMeta }]}>
              {t('billing:planTiles.people', { count: 2 })}
            </Text>
          </SelectablePlanCard>

          <SelectablePlanCard
            selected={selected === 'anual'}
            ring={p.yearRing}
            baseShadow={p.yearCardShadow}
            accessibilityLabel={
              yearSkeleton
                ? t('billing:planTiles.annualA11yLoading', {
                    plan: t('billing:plans.hogar-anual.name'),
                  })
                : t('billing:planTiles.annualA11y', {
                    plan: t('billing:plans.hogar-anual.name'),
                    price: yearPriceText,
                  })
            }
            flex={1.15}
            onPress={() => handleSelect('anual')}
            style={[
              styles.yearCard,
              {
                experimental_backgroundImage: p.yearCardCss,
                backgroundColor: p.yearCardFallback,
              },
            ]}
          >
            {/* Partículas clipeadas a la card (capa absoluta). */}
            <View pointerEvents="none" style={styles.yearParticles}>
              <BrotParticles colors={p.yearParticles} count={6} borderRadius={24} />
            </View>
            <View style={styles.yearTopRow}>
              <Text style={[styles.planLabel, { color: p.yearLabel }]}>
                {t('billing:planTiles.annual')}
              </Text>
              <View style={[styles.yearBadge, { backgroundColor: p.yearBadgeBackground }]}>
                <Text style={[styles.yearBadgeText, { color: p.yearBadgeText }]}>
                  {t('billing:planTiles.recommended')}
                </Text>
              </View>
            </View>
            <View style={styles.priceRow}>
              <PlanPrice
                text={yearPriceText}
                skeleton={yearSkeleton}
                color={p.yearPrice}
                width={64}
                skeletonStyle={styles.priceSkeletonOnGreen}
              />
              <Text style={[styles.per, { color: p.yearPer }]}>{t('billing:paywall.perYear')}</Text>
            </View>
            {/* "$3.33/mes · 4 personas": precio efectivo mensual (demo,
                39.99/12) + tope de miembros, misma composición que el
                YearlyTile real (plan-tiles.tsx). */}
            <Text style={[styles.planMeta, { color: p.yearMeta }]}>
              {t('billing:planTiles.effectivePerMonth', { amount: '3.33' })}
              {t('billing:planTiles.people', { count: 4 })}
            </Text>
          </SelectablePlanCard>
        </View>

        {/* Coach + burbuja del ahorro: SOLO con el anual elegido (el
            SavingsRibbon real retorna null con savingsUsd 0). key para
            que re-entre con fade al volver a elegir anual. */}
        {selected === 'anual' ? (
          <Animated.View entering={FadeIn.duration(240)} style={styles.coachRow}>
            <BrotMascot pose="coach" size={58} shadow={false} />
            <View
              style={[styles.bubble, { backgroundColor: p.bubbleBackground, boxShadow: p.bubbleShadow }]}
            >
              {/* amount/percent son demo (4.99×12 − 39.99 = 19.89); el key
                  lleva el "$" y el signo −33% en U+2212 (como savingsRibbon). */}
              <Text style={[styles.bubbleText, { color: p.bubbleText }]}>
                {t('billing:paywall.savingsBubble', { amount: '19.89', percent: 33 })}
              </Text>
            </View>
          </Animated.View>
        ) : null}

        {/* Features del plan elegido (solo cambia la primera línea). */}
        <View style={styles.features}>
          {FEATURES[selected].map((f) => (
            <View key={f} style={styles.featureRow}>
              <View style={styles.checkWrap}>
                <CheckIcon color={p.checkStroke} size={15} />
              </View>
              <Text style={[styles.featureText, { color: p.featureText }]}>{f}</Text>
            </View>
          ))}
        </View>

        {/* CTAs — con onContinueFree (welcomeMode del paywall real): el
            primario verde continúa gratis (tokens ctaGreen del kit,
            texto 14.5 del mock) y "Suscribirme…" queda inset. Sin él,
            emphasis del paywall real: suscribir ES el primario verde. */}
        {onContinueFree ? (
          <>
            <PlanPrimaryButton mode={mode} label={continueLabelText} onPress={onContinueFree} />
            {/* CTA secundario inset (cobra): el precio sigue al plan
                elegido (subscribeWithPrice del paywall real). */}
            <PlanSubscribeButton
              mode={mode}
              label={subscribeLabel}
              busy={busy}
              onPress={handleSubscribe}
            />
          </>
        ) : (
          <PlanPrimaryButton
            mode={mode}
            label={subscribeLabel}
            busy={busy}
            onPress={handleSubscribe}
          />
        )}

        <Text style={[styles.legal, { color: s.legalText }]}>{disclosureText}</Text>

        <View style={styles.linksRow}>
          <AuthLink mode={mode} tone="soft" onPress={onRestore} style={styles.link}>
            {restoreLabelText}
          </AuthLink>
          <Text style={[styles.linkSep, { color: s.linkSoft }]}> · </Text>
          <AuthLink mode={mode} tone="soft" onPress={onTerms} style={styles.link}>
            {termsLabelText}
          </AuthLink>
          <Text style={[styles.linkSep, { color: s.linkSoft }]}> · </Text>
          <AuthLink mode={mode} tone="soft" onPress={onPrivacy} style={styles.link}>
            {privacyLabelText}
          </AuthLink>
        </View>

        {/* Salidas del gate duro (SOLO lockMode) — espejo del escapeRow
            del PaywallView real (logout + eliminar cuenta, Guideline
            5.1.1(v)): sin esto el usuario con la prueba vencida que no
            quiere pagar queda atrapado. AuthLink tone muted (gap de
            diseño permitido: mismo lenguaje del kit). */}
        {lockMode && (onLogout || onDeleteAccount) ? (
          <View style={styles.escapeRow}>
            {onLogout ? (
              <AuthLink mode={mode} tone="muted" onPress={onLogout} style={styles.link}>
                {logoutLabelText}
              </AuthLink>
            ) : null}
            {onLogout && onDeleteAccount ? (
              <Text style={[styles.linkSep, { color: s.linkSoft }]}> · </Text>
            ) : null}
            {onDeleteAccount ? (
              <AuthLink mode={mode} tone="muted" onPress={onDeleteAccount} style={styles.link}>
                {deleteAccountLabelText}
              </AuthLink>
            ) : null}
          </View>
        ) : null}
      </AuthScrollBody>
      <AuthHomeIndicator mode={mode} />
    </AuthScreenShell>
  )
}

// ─── Card de plan seleccionable (espejo del PlanTiles real) ──────────
//
// Radio: accessibilityRole + state. Selección = anillo 2.5px (se
// APENDEA a la sombra base — instantáneo, como el borde del tile real)
// + scale 1.025 con el MISMO spring del real (plan-tiles.tsx:230).
// Solo transform: cero trabajo por frame fuera de la transición.

function SelectablePlanCard({
  selected,
  ring,
  baseShadow,
  accessibilityLabel,
  flex,
  onPress,
  style,
  children,
}: {
  selected: boolean
  ring: string
  baseShadow: string
  accessibilityLabel: string
  /** Ancho relativo en la fila (grid del mock: 1fr / 1.15fr). */
  flex: number
  onPress: () => void
  style: object[]
  children: React.ReactNode
}) {
  const progress = useSharedValue(selected ? 1 : 0)
  useEffect(() => {
    // Spring literal del PlanTiles real (plan-tiles.tsx:230).
    // @motion-allow: espeja el spring del tile del paywall vigente
    progress.value = withSpring(selected ? 1 : 0, { damping: 16, stiffness: 220, mass: 0.8 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected])
  const scaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + progress.value * 0.025 }],
  }))
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={{ flex }}
    >
      <Animated.View
        style={[
          styles.cardFill,
          ...style,
          { boxShadow: selected ? `${baseShadow}, 0 0 0 2.5px ${ring}` : baseShadow },
          scaleStyle,
        ]}
      >
        {children}
      </Animated.View>
    </Pressable>
  )
}

// ─── Precio de card (patrón skeleton/fallback de PlanTiles) ──────────
//
// Skeleton mientras StoreKit no respondió (skeleton=true); al resolver,
// el precio entra con FadeIn para no popear — pero SOLO si hubo skeleton
// antes: el preview demo (sin loading) monta el literal directo, sin
// animación (réplica aprobada intacta).

function PlanPrice({
  text,
  skeleton,
  color,
  width,
  skeletonStyle,
}: {
  text: string
  skeleton: boolean
  color: string
  /** Ancho del skeleton (56 mensual / 64 anual, como PlanTiles). */
  width: number
  /** Override del skeleton (la card anual verde usa crema translúcido). */
  skeletonStyle?: object
}) {
  const sawSkeleton = useRef(false)
  if (skeleton) {
    sawSkeleton.current = true
    return (
      <SkeletonBox
        width={width}
        height={20}
        radius={6}
        skin="neo"
        style={[styles.priceSkeleton, skeletonStyle]}
      />
    )
  }
  if (sawSkeleton.current) {
    return (
      <AnimatedText entering={FadeIn.duration(240)} style={[styles.price, { color }]}>
        {text}
      </AnimatedText>
    )
  }
  return <Text style={[styles.price, { color }]}>{text}</Text>
}

// ─── Botones (tokens del kit / plan-spec, con el label 14.5 del mock) ─
//
// busy (compra en vuelo): el press se ignora EN SILENCIO — sin háptico
// ni onPress — con el visual activo (misma semántica que AuthCta).

function PlanPrimaryButton({
  mode,
  label,
  onPress,
  busy = false,
}: {
  mode: AuthMode
  label: string
  onPress?: () => void
  busy?: boolean
}) {
  const s = AUTH_SPEC[mode]
  const press = usePressScale({ pressedScale: 0.98 })
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ busy }}
      onPress={() => {
        if (busy) return
        void triggerHaptic('selection')
        onPress?.()
      }}
      onPressIn={busy ? undefined : press.onPressIn}
      // onPressOut SIEMPRE cableado: un press que cruza el flip a busy
      // no debe dejar la escala clavada (mismo guard que AuthCta).
      onPressOut={press.onPressOut}
      style={[
        styles.primaryBtn,
        {
          experimental_backgroundImage: s.ctaGreenCss,
          backgroundColor: s.ctaGreenFallback,
          boxShadow: s.ctaGreenShadow,
        },
        press.animatedStyle,
      ]}
    >
      <Text style={[styles.primaryLabel, { color: s.ctaGreenText }]}>{label}</Text>
    </AnimatedPressable>
  )
}

function PlanSubscribeButton({
  mode,
  label,
  onPress,
  busy = false,
}: {
  mode: AuthMode
  label: string
  onPress?: () => void
  busy?: boolean
}) {
  const p = PLAN_SPEC[mode]
  const press = usePressScale({ pressedScale: 0.98 })
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ busy }}
      onPress={() => {
        if (busy) return
        void triggerHaptic('light')
        onPress?.()
      }}
      onPressIn={busy ? undefined : press.onPressIn}
      onPressOut={press.onPressOut}
      style={[
        styles.subscribeBtn,
        { backgroundColor: p.subscribeBackground, boxShadow: p.subscribeShadow },
        press.animatedStyle,
      ]}
    >
      <Text style={[styles.subscribeLabel, { color: p.subscribeText }]}>{label}</Text>
    </AnimatedPressable>
  )
}

// ─── Estilos (geometría literal de 4m/4mo) ───────────────────────────

const styles = StyleSheet.create({
  title: {
    fontSize: 30,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
  },
  // Con back (entrada desde Ajustes) el título respira bajo el header —
  // mismo aire que el titleBlock de 4b.
  titleAfterBack: { marginTop: 16 },
  trialCard: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 20,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  trialCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trialTitle: {
    fontSize: 14.5,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
  },
  trialDays: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
  },
  wordmarkRow: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  wordmark: {
    fontSize: 16,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
  },
  hogarBadge: {
    borderRadius: 9,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  hogarBadgeText: {
    fontSize: 10.5,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    letterSpacing: 1.47, // 0.14em × 10.5
  },
  lockChipWrap: {
    marginTop: 8,
    flexDirection: 'row',
  },
  lockChip: {
    fontSize: 11,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    letterSpacing: 0.5,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    overflow: 'hidden',
  },
  headlineRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headline: {
    flex: 1,
    fontSize: 27,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    lineHeight: 32.4, // 1.2
  },
  plansRow: {
    marginTop: 16,
    flexDirection: 'row',
    gap: 12,
  },
  // El ancho relativo (1fr/1.15fr) vive en el Pressable wrapper; la card
  // llena su alto para que ambas queden parejas (stretch de la fila).
  cardFill: {
    flex: 1,
  },
  monthCard: {
    borderRadius: 24,
    paddingVertical: 15,
    paddingHorizontal: 14,
  },
  yearCard: {
    position: 'relative',
    borderRadius: 24,
    paddingVertical: 15,
    paddingHorizontal: 14,
    overflow: 'hidden',
  },
  yearParticles: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 24,
    overflow: 'hidden',
  },
  yearTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  planLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: 1.26, // 0.12em × 10.5
  },
  yearBadge: {
    borderRadius: 8,
    paddingVertical: 3,
    paddingHorizontal: 7,
  },
  yearBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    letterSpacing: 0.9, // 0.1em × 9
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
    marginTop: 6,
  },
  price: {
    fontSize: 23,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
  },
  // Skeleton del precio (transitorio, no está en el mock): centrado
  // aprox. contra la caja de línea del precio 23.
  priceSkeleton: { marginBottom: 5 },
  // Sobre la card anual verde el material base del SkeletonBox no
  // contrasta: crema translúcido (mismo override que PlanTiles).
  priceSkeletonOnGreen: { backgroundColor: 'rgba(255,251,242,0.35)' },
  per: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    marginBottom: 3,
  },
  planMeta: {
    fontSize: 11.5,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    marginTop: 4,
  },
  coachRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  bubble: {
    flex: 1,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderBottomRightRadius: 16,
    borderBottomLeftRadius: 5,
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  bubbleText: {
    fontSize: 13,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
  },
  features: {
    marginTop: 14,
    gap: 9,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
  },
  checkWrap: {
    marginTop: 2,
  },
  featureText: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    lineHeight: 18.9, // 1.4
  },
  primaryBtn: {
    marginTop: 18,
    borderRadius: 24,
    paddingVertical: 16,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  primaryLabel: {
    fontSize: 14.5,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    textAlign: 'center',
  },
  subscribeBtn: {
    marginTop: 12,
    borderRadius: 24,
    paddingVertical: 15,
    paddingHorizontal: 15, // mock: padding 15px (4 lados)
    alignItems: 'center',
  },
  subscribeLabel: {
    fontSize: 14.5,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    textAlign: 'center',
  },
  legal: {
    marginTop: 14,
    fontSize: 10.5,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    textAlign: 'center',
    lineHeight: 16.3, // 1.55
  },
  linksRow: {
    marginTop: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Salidas del gate duro (lockMode): misma métrica que linksRow, un
  // paso más abajo.
  escapeRow: {
    marginTop: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  link: {
    fontSize: 12,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
  },
  linkSep: {
    fontSize: 12,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
  },
})
