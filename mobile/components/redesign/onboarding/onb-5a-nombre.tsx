import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'
import { TextInput } from '@/components/ui/app-text'
import { nunitoFamily } from '@/theme/typography'
import {
  OnbActiveRing,
  OnbBody,
  OnbCta,
  OnbHeader,
  OnbHelperRow,
  OnbHero,
  OnbInfoChip,
  OnbProgress,
  OnbScreenShell,
  OnbWell,
} from './onb-kit'
import { ONB_SPEC, type OnbMode } from './onb-spec'

/**
 * 5a · Tu nombre — réplica de screens/5a.html (claro) y 5ao.html
 * (oscuro). Copys literales del mockup. El input filtra emojis y
 * caracteres especiales en vivo (el copy lo promete) y capea a 40.
 */


const MAX_NAME = 40

function sanitizeName(raw: string): string {
  // "Emojis y caracteres especiales se filtran solos": letras (con
  // acentos), espacios, apóstrofo y guion — suficiente para nombres.
  return raw.replace(/[^\p{L}\p{M}' -]/gu, '').slice(0, MAX_NAME)
}

export function Onb5aNombre({
  mode,
  name,
  onChangeName,
  onBack,
  onNext,
}: {
  mode: OnbMode
  name: string
  onChangeName: (name: string) => void
  onBack?: () => void
  onNext?: () => void
}) {
  const s = ONB_SPEC[mode]
  const { t } = useTranslation()
  // Estado activo del input (4c: "la caja activa con anillo").
  const [focused, setFocused] = useState(false)

  return (
    <OnbScreenShell mode={mode}>
      <OnbBody>
        <OnbHeader mode={mode} title={t('onboarding:chrome.title.name')} onBack={onBack} />
        <OnbProgress mode={mode} active={0} />
        <OnbHero
          mode={mode}
          title={t('onboarding:redesign.nombre.heroTitle')}
          subtitle={t('onboarding:redesign.nombre.heroSubtitle')}
          brotPose="wave"
        />
        <OnbWell mode={mode}>
          <TextInput
            accessibilityLabel={t('onboarding:welcome.nameLabel')}
            autoCapitalize="words"
            autoCorrect={false}
            maxLength={MAX_NAME}
            onBlur={() => setFocused(false)}
            onChangeText={(raw) => onChangeName(sanitizeName(raw))}
            onFocus={() => setFocused(true)}
            style={[styles.input, { color: s.text }]}
            value={name}
          />
          <OnbActiveRing mode={mode} focused={focused} radius={22} />
        </OnbWell>
        <OnbInfoChip
          mode={mode}
          text={t('onboarding:redesign.nombre.infoChip')}
        />
        <OnbHelperRow
          mode={mode}
          left={t('onboarding:redesign.nombre.helperLeft')}
          right={`${name.length}/${MAX_NAME}`}
        />
        <OnbCta
          mode={mode}
          label={t('onboarding:cta.next')}
          caption={t('onboarding:redesign.nombre.ctaCaption')}
          disabled={name.trim().length < 2}
          disabledHint={t('onboarding:redesign.nombre.disabledHint')}
          onPress={onNext}
        />
      </OnbBody>
    </OnbScreenShell>
  )
}

const styles = StyleSheet.create({
  // Texto estándar del well del mockup (24/900 centrado) pero editable.
  // Sin padding propio: el well ya pone los 18px del mockup.
  input: {
    fontSize: 24,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    textAlign: 'center',
    padding: 0,
  },
})
