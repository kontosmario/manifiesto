// La pantalla de Apple Pay se dibuja entera a partir de esta fase: qué es
// protagonista, qué se pliega y qué ni se monta. Estos tests fijan las
// precedencias, porque cada una evita un mensaje equivocado en device:
//
//  · `unavailable` gana a todo → nunca una guía que no se puede completar;
//  · `off` gana a un recibo viejo → un pago de la semana pasada no es un
//    estado actual;
//  · `waiting-first` gana a un diagnóstico raro → sin recibo no hay nada roto;
//  · `broken-capture` gana a `working` → el tilde verde no puede tapar
//    gastos que están entrando en $0.

import { describe, expect, it } from 'vitest'

import type { LastApplePayCapture } from '@/features/apple-pay-capture/apple-pay-last-capture-store'
import type { LastCaptureDiagnosis } from '@/features/apple-pay-capture/diagnose-last-capture'
import {
  resolveApplePaySetupPhase,
  type ApplePayGate,
} from '@/features/apple-pay-capture/resolve-setup-phase'

const CAPTURE: LastApplePayCapture = {
  capturedAt: '2026-08-08T15:00:00.000Z',
  merchantRaw: 'Makro Cordoba',
  amountRaw: '$ 8.160,00',
}

const OK: LastCaptureDiagnosis = { kind: 'ok' }
const SAME_VALUE: LastCaptureDiagnosis = { kind: 'same-value', raw: 'Makro Cordoba' }

function phase(input: {
  gate?: ApplePayGate
  enabled?: boolean
  lastCapture?: LastApplePayCapture | null
  diagnosis?: LastCaptureDiagnosis
}) {
  return resolveApplePaySetupPhase({
    gate: input.gate ?? 'ok',
    enabled: input.enabled ?? true,
    lastCapture: input.lastCapture ?? null,
    diagnosis: input.diagnosis ?? OK,
  })
}

describe('resolveApplePaySetupPhase', () => {
  it('sin gate no hay nada que configurar', () => {
    expect(phase({ gate: 'not-ios', enabled: false })).toBe('unavailable')
  })

  it('con el gate en ok y el switch apagado, la pantalla sólo vende la idea', () => {
    expect(phase({ enabled: false })).toBe('off')
  })

  it('prendida y sin ninguna captura todavía, manda la guía', () => {
    expect(phase({ enabled: true, lastCapture: null })).toBe('waiting-first')
  })

  it('prendida con la última captura sana, manda el éxito', () => {
    expect(phase({ enabled: true, lastCapture: CAPTURE, diagnosis: OK })).toBe('working')
  })

  it('prendida con la última captura rota, manda el diagnóstico', () => {
    expect(phase({ enabled: true, lastCapture: CAPTURE, diagnosis: SAME_VALUE })).toBe(
      'broken-capture',
    )
  })

  it('los tres motivos de indisponibilidad dan la misma fase', () => {
    const gates: ApplePayGate[] = ['not-ios', 'needs-app-update', 'needs-ios-17']
    for (const gate of gates) expect(phase({ gate })).toBe('unavailable')
  })

  it('`unavailable` gana aunque el flag persistido esté prendido y haya capturas', () => {
    // El flag persistido puede seguir prendido de antes de que el gate se
    // cerrara (vive en el keychain de ESTE teléfono: `persistent-kv` usa
    // `WHEN_UNLOCKED_THIS_DEVICE_ONLY`, así que nunca migra por backup).
    // Da igual lo que diga: sin plataforma no hay guía que completar ni
    // captura que pueda llegar.
    expect(
      phase({ gate: 'needs-ios-17', enabled: true, lastCapture: CAPTURE, diagnosis: SAME_VALUE }),
    ).toBe('unavailable')
  })

  it('`off` gana a un recibo viejo: apagada no hay estado que mostrar', () => {
    expect(phase({ enabled: false, lastCapture: CAPTURE })).toBe('off')
  })

  it('`off` gana también a un diagnóstico roto', () => {
    expect(phase({ enabled: false, lastCapture: CAPTURE, diagnosis: SAME_VALUE })).toBe('off')
  })

  it('sin captura, un diagnóstico roto NO rompe nada: sigue esperando la primera', () => {
    expect(phase({ enabled: true, lastCapture: null, diagnosis: SAME_VALUE })).toBe('waiting-first')
  })

  it('`broken-capture` gana a `working` en los tres diagnósticos malos', () => {
    const bad: LastCaptureDiagnosis[] = [
      { kind: 'same-value', raw: 'Makro Cordoba' },
      { kind: 'unreadable-amount', raw: '1.234,567' },
      { kind: 'missing-amount' },
    ]
    for (const diagnosis of bad) {
      expect(phase({ enabled: true, lastCapture: CAPTURE, diagnosis })).toBe('broken-capture')
    }
  })
})
