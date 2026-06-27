// Copy selection for the Asistente Financiero EmptyState.
//
// Two distinct empty states:
//   - First-time / new account (`usingMock`): the user just registered
//     and there is no income or no expenses yet. The assistant has
//     literally nothing to talk about; framing this as "you reviewed
//     all suggestions" would be a lie.
//   - Established user with no pending signals: the user has data and
//     either had no signals this cycle or dismissed them all. The
//     original "Revisaste todas las sugerencias" copy applies.

import i18n from '@/lib/i18n'

export interface AsistenteEmptyCopyInput {
  usingMock: boolean
}

export interface AsistenteEmptyCopy {
  title: string
  body: string
}

export function selectAsistenteEmptyCopy(
  input: AsistenteEmptyCopyInput,
): AsistenteEmptyCopy {
  if (input.usingMock) {
    return {
      title: i18n.t('insights:asistente.empty.firstTimeTitle'),
      body: i18n.t('insights:asistente.empty.firstTimeBody'),
    }
  }
  return {
    title: i18n.t('insights:asistente.empty.reviewedTitle'),
    body: i18n.t('insights:asistente.empty.reviewedBody'),
  }
}
